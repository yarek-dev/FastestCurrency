# Архитектура Fullstack Bot

Архитектура описана по модели [C4](https://c4model.com/) в виде исходников
[PlantUML](https://plantuml.com/). Диаграммы отражают текущее состояние кода, а не
планируемую архитектуру.

## Диаграммы

| Уровень | Файл | Назначение |
| --- | --- | --- |
| C4 Level 1 | [`c4-context.puml`](c4-context.puml) | Пользователи, Fullstack Bot и внешние системы |
| C4 Level 2 | [`c4-containers.puml`](c4-containers.puml) | Единственное runtime-приложение и его внешние интеграции |
| C4 Level 3 | [`c4-components.puml`](c4-components.puml) | Обработчики Telegram, два сценария приложения, fallback и адаптеры внешних API |

## Границы модели

Fullstack Bot — программная система, которой принадлежит этот репозиторий. В
рабочем режиме она состоит из одного контейнера C4: Node.js-приложения из
`src/app.ts`. Собственной базы данных, очереди, кэша или отдельного frontend в
проекте нет.

В терминах C4 контейнер — runtime-граница приложения или хранилища, а не
Docker-контейнер и не каталог исходного кода. Одноразовый скрипт
`scripts/set-telegram-webhook.ts` настраивает окружение перед эксплуатацией, но
не должен постоянно работать для предоставления основной функции системы,
поэтому он не показан как контейнер.

## Компоненты и зависимости

Level 3 разделяет компоненты по ответственности. Стрелки внутри приложения
показывают вызовы через переданные функции, а не порядок выполнения или импорты.
`src/app.ts` собирает зависимости и запускает HTTP-сервер; отдельным runtime-компонентом
эта сборка не показана.

| Компонент | Реализация в коде |
| --- | --- |
| HTTP Interface | `src/presentation/http`: health endpoint, проверка webhook secret и схемы update, HTTP-ответ |
| Telegram Update Router | `src/presentation/telegram/handlers/telegram-update-handler.ts`: выбор обработчика |
| Message Handler | `src/presentation/telegram/handlers/telegram-message-handler.ts`: команды, разбор запроса, конвертация, ответ с кнопками |
| Callback Query Handler | `src/presentation/telegram/handlers/telegram-callback-query-handler.ts`: подтверждение нажатия, восстановление контекста, ответ за период |
| Convert Currency | `src/application/use-cases/convert-currency.ts`: сумма и сравнение со вчерашним курсом |
| Get Period Change | `src/application/use-cases/get-period-change.ts`: сравнение исходного курса с историческим у выбранного провайдера |
| Exchange Rate Pair / Fallback | `src/infrastructure/exchange-rates/fallback-provider.ts`: получение пары и переключение источника |
| CurrencyBeacon Adapter | `src/infrastructure/currency-beacon/currency-beacon-provider.ts` |
| Frankfurter Adapter | `src/infrastructure/frankfurter/frankfurter-provider.ts` |
| Telegram Callback Client | `src/infrastructure/telegram/telegram-bot-api.ts`: исходящий `answerCallbackQuery` |

Парсеры, callback data, клавиатура и форматтеры из `src/presentation/telegram/input`
и `src/presentation/telegram/messages` — вспомогательные части обработчиков.
Порты `GetExchangeRatePair` и `GetExchangeRate` из `src/application/ports`
подписаны на связях: сценарии приложения получают реализации извне.
Доменные типы и ошибки из `src/domain` используются компонентами и не являются
отдельным сервисом.

## Два сценария получения курсов

При обычном запросе `Convert Currency` запрашивает текущий и вчерашний курсы.
`Exchange Rate Pair / Fallback` получает их параллельно у одного провайдера.
При ошибке отменяет связанный запрос и дожидается завершения обоих. Если
CurrencyBeacon настроен, он используется первым; при его операционной или
конфигурационной ошибке вся пара запрашивается у Frankfurter. Ошибка
неподдерживаемой валюты не запускает fallback. Без ключа CurrencyBeacon оба
курса сразу запрашиваются у Frankfurter.

При нажатии 3/7/14/30 обработчик восстанавливает валютную пару, исходный курс,
провайдера и период из `callback_data`. Опорная дата берётся из исходного
Telegram-сообщения; при отсутствии корректной даты используется текущее время.
`Get Period Change` запрашивает только исторический курс у указанного провайдера,
без повторного получения текущего курса и без fallback. Поэтому результат
относится к исходному сообщению, даже если кнопку нажали позже. Хранить этот
контекст в собственной базе данных не требуется.

Оба сценария возвращают `sendMessage` в HTTP-ответе на webhook. Отдельный
исходящий вызов Telegram API используется только для `answerCallbackQuery`:
он запускается до получения курса, его ошибка логируется и не отменяет расчёт.
Таймаут отдельного HTTP-запроса к провайдерам и подтверждения callback по умолчанию
составляет 3 секунды; это не общий таймаут сценария с fallback.

Конфигурация, логирование и общие функции обработки ошибок являются
вспомогательными деталями реализации этих компонентов и отдельно не показаны.

Диаграмма развёртывания не добавлена: способ production-развёртывания в проекте
пока не зафиксирован. После выбора платформы её следует описать отдельной
deployment-диаграммой для каждого значимого окружения.

## Просмотр и генерация

Файлы используют C4-PlantUML из стандартной библиотеки PlantUML:

```plantuml
!include <C4/C4_Context>
```

Их можно открыть расширением PlantUML для IDE или сгенерировать локально с
помощью PlantUML CLI:

```bash
plantuml -tsvg docs/architecture/*.puml
```

SVG-файлы считаются производными артефактами; источником истины остаются файлы
`.puml`. При изменении взаимодействий, границ процессов или внешних зависимостей
диаграммы следует обновлять вместе с кодом.
