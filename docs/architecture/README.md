# Архитектура Fullstack Bot

Архитектура описана по модели [C4](https://c4model.com/) в виде исходников [PlantUML](https://plantuml.com/).

## Диаграммы

| Уровень | Файл | Назначение |
| --- | --- | --- |
| C4 Level 1 | [`c4-context.puml`](c4-context.puml) | Пользователь, Fullstack Bot и внешние системы. |
| C4 Level 2 | [`c4-containers.puml`](c4-containers.puml) | Frontend, Edge Functions, PostgreSQL, Realtime и внешние интеграции. |
| C4 Level 3 | [`c4-components.puml`](c4-components.puml) | Обработчики, сценарии и адаптеры Telegram-функции, включая сохранение истории. |

## Runtime-граница

В рабочем режиме система включает:

- React frontend из `apps/frontend/`, размещаемый на GitHub Pages: список клиентов, история сообщений и восстановление пропущенных сообщений после переподключения;
- Supabase Edge Functions из `apps/backend/supabase/functions/`, выполняемые в Deno: `telegram-webhook` обрабатывает Telegram updates и сохраняет историю, `clients` возвращает список клиентов с последним сообщением, `messages` возвращает страницы истории, `profile` служит учебным endpoint;
- PostgreSQL в Supabase: таблицы клиентов и сообщений, серверные RPC для сохранения и чтения истории, индексы, RLS и миграции;
- Supabase Realtime: доставка изменений таблиц в браузер.

Frontend читает первоначальное состояние и страницы истории через HTTP-функции, а изменения получает напрямую через Realtime с публичным ключом и правами RLS. SWR хранит загруженные данные в памяти браузера до перезагрузки. Серверная запись выполняется через service role; секреты остаются в backend. Учебный интерфейс публичный, пользовательская авторизация сейчас не требуется. Отдельных очереди и серверного кэша нет.

Одноразовый скрипт `apps/backend/scripts/set-telegram-webhook.ts` регистрирует URL функции в Telegram, но не является постоянно работающим компонентом.

## Границы репозитория и конфигурация

`apps/frontend` и `apps/backend` — отдельные pnpm workspace-пакеты. Корневые команды координируют запуск и проверки; приложения не импортируют исходники друг друга. Миграции и SQL-тесты принадлежат backend вместе с Edge Functions. Общих workspace-пакетов пока нет.

`apps/backend/supabase/functions/deno.json` содержит общий import map, рядом расположен общий `deno.lock`. Локальный `apps/backend/deno.json` подключает их для проверок и служебных скриптов. Каждая функция в `supabase/config.toml` явно подключает общий import map, поэтому остальные функции не зависят от конфигурации `telegram-webhook`.

`pnpm typecheck` проверяет оба приложения, включая все четыре серверные точки входа и служебный скрипт. `pnpm test` запускает unit-тесты обоих приложений; `pnpm test:db` отдельно проверяет локальную базу. Frontend workflow проверяет типы, тесты и сборку перед GitHub Pages. Backend workflow запускается вручную, применяет миграции, затем развёртывает все Edge Functions. Из корня `pnpm deploy:backend` развёртывает только функции.

## Чистая архитектура

Код функции находится в `apps/backend/supabase/functions/telegram-webhook` и разделён на слои:

- `domain` содержит бизнес-типы и ошибки и не зависит от других слоёв;
- `application` содержит сценарии `Convert Currency`, `Get Period Change`, `Process Telegram Update` и порты провайдера курсов и репозитория сообщений;
- `presentation` разбирает Telegram update, вызывает сценарии и форматирует webhook action;
- `infrastructure` реализует доступ к CurrencyBeacon, Frankfurter, Telegram Bot API и сохранение сообщений в Supabase;
- `index.ts` является composition root и HTTP-адаптером Edge Runtime.

Конкретные реализации передаются сценариям и обработчикам через функции. `application` не импортирует `presentation` или `infrastructure`, а `domain` не знает о Supabase, Telegram и провайдерах.

## Компоненты

| Компонент | Реализация |
| --- | --- |
| HTTP Interface / Composition Root | `apps/backend/supabase/functions/telegram-webhook/index.ts` |
| Process Telegram Update | `application/use-cases/process-telegram-update.ts` |
| Message Repository | `infrastructure/database/supabase-message-repository.ts` |
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

## История переписки

`Process Telegram Update` сохраняет входящее сообщение, вызывает обработчик update и сохраняет сформированный ответ бота через порт `MessageRepository`. Supabase-адаптер реализует запись через RPC. Чтение отделено от обработки Telegram: `clients` вызывает `list_inbox_clients`, а `messages` — `inbox_message_page`.

История загружается по курсору `(created_at, id)` страницами по 20 сообщений. Направление `before` используется для старой истории, `after` — для восстановления пропущенных сообщений после разрыва соединения. Frontend объединяет HTTP-данные и Realtime-события по ID, сохраняя порядок и уже загруженную историю.

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
