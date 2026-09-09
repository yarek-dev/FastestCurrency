# Архитектура Fullstack Bot

Архитектура описана по модели [C4](https://c4model.com/) в виде исходников [PlantUML](https://plantuml.com/).

## Диаграммы

| Уровень | Файл | Назначение |
| --- | --- | --- |
| C4 Level 1 | [`c4-context.puml`](c4-context.puml) | Пользователь, Fullstack Bot и внешние системы. |
| C4 Level 2 | [`c4-containers.puml`](c4-containers.puml) | Supabase Edge Function и внешние интеграции. |
| C4 Level 3 | [`c4-components.puml`](c4-components.puml) | Обработчики, сценарии приложения и API-адаптеры. |

## Runtime-граница

В рабочем режиме система состоит из одной Supabase Edge Function `telegram-webhook`. Она выполняется в Deno runtime, принимает HTTPS webhook от Telegram и обращается к внешним API. Собственной базы данных, очереди и кэша у приложения нет.

Одноразовый скрипт `scripts/set-telegram-webhook.ts` регистрирует URL функции в Telegram, но не является постоянно работающим компонентом.

## Чистая архитектура

Код функции находится в `supabase/functions/telegram-webhook` и разделён на слои:

- `domain` содержит бизнес-типы и ошибки и не зависит от других слоёв;
- `application` содержит сценарии `Convert Currency`, `Get Period Change` и порт провайдера курсов;
- `presentation` разбирает Telegram update, вызывает сценарии и форматирует webhook action;
- `infrastructure` реализует доступ к CurrencyBeacon, Frankfurter и Telegram Bot API;
- `index.ts` является composition root и HTTP-адаптером Edge Runtime.

Конкретные реализации передаются сценариям и обработчикам через функции. `application` не импортирует `presentation` или `infrastructure`, а `domain` не знает о Supabase, Telegram и провайдерах.

## Компоненты

| Компонент | Реализация |
| --- | --- |
| HTTP Interface / Composition Root | `supabase/functions/telegram-webhook/index.ts` |
| Telegram Update Router | `presentation/telegram/handlers/telegram-update-handler.ts` |
| Message Handler | `presentation/telegram/handlers/telegram-message-handler.ts` |
| Callback Query Handler | `presentation/telegram/handlers/telegram-callback-query-handler.ts` |
| Convert Currency | `application/use-cases/convert-currency.ts` |
| Get Period Change | `application/use-cases/get-period-change.ts` |
| Exchange Rate Pair / Fallback | `infrastructure/exchange-rates/fallback-provider.ts` |
| CurrencyBeacon Adapter | `infrastructure/currency-beacon/currency-beacon-provider.ts` |
| Frankfurter Adapter | `infrastructure/frankfurter/frankfurter-provider.ts` |
| Telegram Callback Client | `infrastructure/telegram/telegram-bot-api.ts` |

## Получение курсов

При обычном запросе `Convert Currency` запрашивает текущий и вчерашний курсы. `Exchange Rate Pair / Fallback` получает оба значения параллельно у одного провайдера. Если CurrencyBeacon настроен и допускает fallback после сбоя, вся пара запрашивается у Frankfurter.

При нажатии кнопки обработчик восстанавливает валютную пару, исходный курс, провайдера и период из `callback_data`. Опорная дата берётся из исходного Telegram-сообщения. `Get Period Change` получает один исторический курс у указанного провайдера без fallback, поэтому данные разных источников не смешиваются.

Callback query подтверждается отдельным вызовом `answerCallbackQuery`. Ошибка подтверждения не отменяет расчёт периода. Результаты обычного сообщения и периода возвращаются как `sendMessage` в ответе на webhook.

## Просмотр диаграмм

Файлы используют стандартную библиотеку C4-PlantUML:

```plantuml
!include <C4/C4_Context>
```

Их можно открыть расширением PlantUML для IDE или сгенерировать командой:

```bash
plantuml -tsvg docs/architecture/*.puml
```

Исходники `.puml` являются источником истины; SVG считаются производными файлами.
