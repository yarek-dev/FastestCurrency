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
- PostgreSQL в Supabase: таблицы клиентов, сообщений и базы знаний, серверные RPC, pgvector, RLS и миграции;
- Supabase Realtime: доставка изменений таблиц в браузер.

Frontend читает первоначальное состояние и страницы истории через HTTP-функции, а изменения получает напрямую через Realtime с пользовательским JWT. Серверные функции проверяют JWT и членство пользователя в `public.inbox_admins`. Политики RLS используют тот же список для проверки доступа к таблицам и Realtime. SWR хранит загруженные данные в памяти браузера до выхода или перезагрузки. Запись сообщений выполняется через service role. Отдельных очереди и серверного кэша нет.

Одноразовый скрипт `apps/backend/scripts/set-telegram-webhook.ts` регистрирует URL функции в Telegram, но не является постоянно работающим компонентом.

## Границы репозитория и конфигурация

`apps/frontend` и `apps/backend` — отдельные pnpm workspace-пакеты. Корневые команды координируют запуск и проверки; приложения не импортируют исходники друг друга. Миграции и SQL-тесты принадлежат backend вместе с Edge Functions. Общих workspace-пакетов пока нет.

`apps/backend/supabase/functions/deno.json` содержит общий import map, рядом расположен общий `deno.lock`. Локальный `apps/backend/deno.json` подключает их для проверок и служебных скриптов. Каждая функция в `supabase/config.toml` явно подключает общий import map, поэтому остальные функции не зависят от конфигурации `telegram-webhook`.

`pnpm typecheck` проверяет оба приложения, включая серверные точки входа и служебные скрипты. `pnpm test` запускает быстрые unit- и компонентные тесты. `pnpm test:db`, `pnpm test:integration` и `pnpm test:e2e` проверяют локальный Supabase через SQL, HTTP и браузер. Frontend workflow проверяет типы, тесты и сборку перед GitHub Pages. Backend workflow запускается вручную, применяет миграции, затем развёртывает все Edge Functions. Из корня `pnpm deploy:backend` развёртывает только функции.

## Feature-модули на frontend

`src/pages/admin-page.tsx` связывает модули `auth` и `chats` через их `index.ts`. `auth` проверяет сессию и передаёт странице идентификатор администратора и действие выхода. `chats` ведёт историю, подписки и состояние интерфейса. SWR-кэш принадлежит модулю чатов и создаётся заново при смене администратора. Оба модуля используют общий настроенный Supabase-клиент. [Публичный API модуля](https://feature-sliced.design/docs/reference/public-api).

В `auth/components/` находятся форма входа, экран проверки доступа и их стили. `auth/hooks/use-admin-session.ts` управляет состоянием сессии и повторной проверкой доступа.

## Гексагональная архитектура на backend

Точки входа Edge Functions связывают входные адаптеры, сценарии и выходные адаптеры. Сценарии из `application/` содержат правила и порядок действий. HTTP- и Telegram-адаптеры переводят входные данные в команды и форматируют ответ. Внешние вызовы PostgreSQL, GoTrue, Telegram Bot API и Gemini реализованы за портами. [Ports and Adapters](https://alistair.cockburn.us/hexagonal-architecture/).

`admin-auth` проверяет право на сессию через порт доступа. `messages` резервирует действие менеджера, вызывает порт доставки и фиксирует итог через порт операций. `clients` и `GET messages` используют общий сценарий проверки администратора и порт чтения. PostgreSQL отвечает за транзакции, ограничения и RLS.

HTTP-обработчики находятся в `presentation/http/`, выходные адаптеры — в `infrastructure/`. Та же структура используется в `_shared/` для общих портов, адаптеров и HTTP-утилит.

## Компоненты

| Компонент | Реализация |
| --- | --- |
| Composition Root | `apps/backend/supabase/functions/telegram-webhook/index.ts` |
| Telegram Webhook / Update Adapter | `presentation/http/telegram-webhook-controller.ts`, `presentation/telegram/telegram-update-adapter.ts` |
| Process Bot Message | `application/use-cases/process-bot-message.ts` |
| Message Repository | `infrastructure/database/supabase-message-repository.ts` |
| Reply to Question | `application/use-cases/reply-to-question.ts` |
| Answer Knowledge Question | `application/use-cases/answer-knowledge-question.ts` |
| Gemini Embeddings | `infrastructure/gemini/gemini-embeddings.ts` |
| Gemini Knowledge Answer | `infrastructure/gemini/gemini-knowledge.ts` |

## Поиск по базе знаний

Для исходного вопроса Gemini строит 768-мерный вектор. RPC `search_knowledge_vector` сортирует тарифы и фрагменты по косинусному расстоянию, используя их колонки `embedding`. Затем Gemini формулирует ответ по подобранным записям. Эмбеддинги данных создаёт пакетный скрипт `pnpm knowledge:index`.

## История переписки

`Process Bot Message` сохраняет входящее сообщение и проверяет, ведёт ли диалог менеджер. В автоматическом режиме сценарий запрашивает текст ответа, повторно проверяет режим менеджера и сохраняет ответ через порт `MessageRepository`. Supabase-адаптер реализует запись через RPC. Адаптер чтения использует `list_inbox_clients` и `inbox_message_page`.

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
