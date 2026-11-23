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
- Supabase Edge Functions из `apps/backend/supabase/functions/`, выполняемые в Deno: `telegram-webhook` отвечает по базе знаний через Gemini и сохраняет историю, `admin-auth` передаёт операции сессии в Supabase Auth, `clients` возвращает список клиентов с последним сообщением, `messages` возвращает страницы истории, `profile` служит учебным endpoint;
- PostgreSQL в Supabase: таблицы клиентов, сообщений и базы знаний, серверные RPC, RLS и миграции;
- Supabase Realtime: доставка изменений таблиц в браузер.

Frontend читает первоначальное состояние и страницы истории через HTTP-функции, а изменения получает напрямую через Realtime с пользовательским JWT. Серверные функции проверяют JWT и членство пользователя в `public.inbox_admins`. Политики RLS используют тот же список для проверки доступа к таблицам и Realtime. SWR хранит загруженные данные в памяти браузера до выхода или перезагрузки. Запись сообщений выполняется через service role. Отдельных очереди и серверного кэша нет.

Одноразовый скрипт `apps/backend/scripts/set-telegram-webhook.ts` регистрирует URL функции в Telegram, но не является постоянно работающим компонентом.

## Границы репозитория и конфигурация

`apps/frontend` и `apps/backend` — отдельные pnpm workspace-пакеты. Корневые команды координируют запуск и проверки; приложения не импортируют исходники друг друга. Миграции и SQL-тесты принадлежат backend вместе с Edge Functions. Общих workspace-пакетов пока нет.

`apps/backend/supabase/functions/deno.json` содержит общий import map, рядом расположен общий `deno.lock`. Локальный `apps/backend/deno.json` подключает их для проверок и служебных скриптов. Каждая функция в `supabase/config.toml` явно подключает общий import map, поэтому остальные функции не зависят от конфигурации `telegram-webhook`.

`pnpm typecheck` проверяет оба приложения, включая серверные точки входа и служебные скрипты. `pnpm test` запускает unit-тесты обоих приложений; `pnpm test:db` отдельно проверяет локальную базу. Frontend workflow проверяет типы, тесты и сборку перед GitHub Pages. Backend workflow запускается вручную, применяет миграции, затем развёртывает все Edge Functions. Из корня `pnpm deploy:backend` развёртывает только функции.

## Чистая архитектура

Код функции находится в `apps/backend/supabase/functions/telegram-webhook` и разделён на слои:

- `application` содержит сценарии `Answer Knowledge Question`, `Process Telegram Update` и порт репозитория сообщений.
- `presentation` разбирает Telegram update, вызывает сценарии и форматирует webhook action;
- `infrastructure` реализует доступ к Gemini и сохранение сообщений в Supabase.
- `index.ts` является composition root и HTTP-адаптером Edge Runtime.

Конкретные реализации передаются сценариям и обработчикам через функции. `application` не импортирует `presentation` или `infrastructure`.

## Компоненты

| Компонент | Реализация |
| --- | --- |
| HTTP Interface / Composition Root | `apps/backend/supabase/functions/telegram-webhook/index.ts` |
| Process Telegram Update | `application/use-cases/process-telegram-update.ts` |
| Message Repository | `infrastructure/database/supabase-message-repository.ts` |
| Knowledge Handler | `presentation/telegram/handlers/telegram-knowledge-handler.ts` |
| Answer Knowledge Question | `application/use-cases/answer-knowledge-question.ts` |
| Gemini Knowledge Answer | `infrastructure/gemini/gemini-knowledge.ts` |

## Поиск по базе знаний

Gemini выделяет ключевые слова из вопроса. RPC `search_knowledge` находит подходящие тарифы и фрагменты через полнотекстовый поиск. Затем Gemini формулирует ответ по найденным данным.

## История переписки

`Process Telegram Update` сохраняет входящее сообщение и проверяет, ведёт ли диалог менеджер. Для автоматических диалогов сценарий вызывает обработчик update и сохраняет сформированный ответ бота через порт `MessageRepository`. Supabase-адаптер реализует запись через RPC. `clients` читает через `list_inbox_clients`, а `GET messages` — через `inbox_message_page`.

`POST messages` проверяет администратора, резервирует действие для выбранного диалога и вызывает Telegram Bot API. После подтверждения сервер сохраняет исходящее сообщение и состояние диалога в одной транзакции. Существующие подписки Realtime передают оба изменения в админку.

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
