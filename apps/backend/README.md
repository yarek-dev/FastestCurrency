# Fullstack Bot — Telegram-справочник платных услуг

Telegram-бот работает как Supabase Edge Function. Он ищет сведения о платных услугах через pgvector и возвращает сформированный Gemini ответ в webhook reply.

## Возможности

- ответы о тарифах, услугах и оплате по базе знаний;
- передача диалога менеджеру через админ-панель;
- работа только в личных чатах;
- проверка секретного токена Telegram webhook.

## Стек

- Supabase Edge Functions;
- Deno 2 и TypeScript;
- Supabase CLI, установленный локально через pnpm.

## Структура

```text
supabase/
├── config.toml
├── functions/deno.json           # общий import map всех Edge Functions
├── functions/deno.lock           # общие зафиксированные Deno-зависимости
├── functions/_shared/           # общие порты, адаптеры Supabase и CORS
├── functions/admin-auth/        # сессия администратора и адаптер Supabase Auth
├── functions/clients/           # HTTP-адаптер списка клиентов
├── functions/messages/          # история, курсорная пагинация и действия менеджера
├── functions/profile/           # учебный endpoint профиля
├── functions/telegram-webhook/
│   ├── index.ts                 # composition root
│   ├── application/             # сценарии и порты
│   ├── infrastructure/          # Gemini API и Supabase
│   └── presentation/            # входные адаптеры HTTP и Telegram
├── migrations/                  # PostgreSQL, RPC и Realtime/RLS
└── tests/
    ├── unit/                    # Deno unit-тесты
    └── database/                # SQL-тесты

scripts/
└── set-telegram-webhook.ts     # регистрация webhook в Telegram

deno.json                       # локальные проверки и скрипты, общий import map
```

Бэкенд использует гексагональную архитектуру. Сценарии из `application` получают реализации портов через `index.ts` каждой Edge Function. Входные адаптеры разбирают запросы и формируют ответы. Выходные адаптеры обращаются к Supabase, Telegram и Gemini. [Описание архитектуры](../../docs/architecture/README.md).

## Требования

- Node.js 24 и pnpm 10 для локального Supabase CLI;
- Deno 2;
- Supabase-проект, связанный с репозиторием;
- Telegram-бот, созданный через BotFather.

## Импорт базы знаний

Миграция `20261126120000_create_department_knowledge_tables.sql` добавляет `paid_services`, `research_department` и `clinical_department`. В каждой таблице есть колонка `embedding` на 768 измерений. Суммы в `paid_services` заданы в BYN. Для загрузки в эти таблицы нужен отдельный импорт записей с эмбеддингами `gemini-embedding-2`.

## Ответы по справочнику

Webhook берёт до 10 предыдущих текстовых реплик пользователя и бота из текущего диалога. Gemini считает токены истории, а webhook убирает старые реплики, пока история не уместится в 2 000 токенов. Текущее сообщение передаётся отдельно и ограничено 1 500 символами. Gemini использует историю для уточнения поисковых вопросов. При недоступности истории используется исходное сообщение. Webhook формирует до трёх запросов из отдельных вопросов, векторизует каждый через `gemini-embedding-2` и вызывает RPC `search_department_knowledge`. PostgreSQL выбирает ближайшие записи отдельно из каждой из трёх таблиц через pgvector с минимальной косинусной похожестью 0.25. Webhook объединяет результаты по ID в пределах каждой таблицы, а Gemini формулирует один ответ по найденным данным. Пустая выдача приводит к просьбе уточнить вопрос, а сбой поиска или генерации ответа — к сообщению о временной недоступности. Менеджер может перехватить диалог до или во время обработки.

В трёх таблицах справочника изменение исходного текста сбрасывает соответствующий эмбеддинг. До пересчёта вектора такая запись пропускается при поиске.

Для локальной проверки примените миграции, загрузите базу знаний и запустите `pnpm supabase functions serve telegram-webhook --env-file .env` из корня. Путь `.env` относится к `apps/backend`, где выполняется команда CLI.

## Переменные окружения

| Переменная | Где используется | Назначение |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Edge Function `messages` и локальный скрипт | Ручная отправка сообщений и регистрация webhook. |
| `TELEGRAM_WEBHOOK_SECRET` | Edge Function и локальный скрипт | Проверка заголовка `X-Telegram-Bot-Api-Secret-Token`. |
| `TELEGRAM_WEBHOOK_URL` | Локальный скрипт | URL развёрнутой Edge Function. |
| `GEMINI_API_KEY` | Edge Function | Ключ Gemini Developer API для эмбеддингов и генерации ответов. |
| `GEMINI_MODEL` | Edge Function | Необязательный идентификатор модели Gemini. По умолчанию `gemini-3.5-flash-lite`. |

Локальные значения хранятся в `.env`, который исключён из Git. Для Edge Function секреты задаются отдельно в Supabase.

## Настройка

Команды ниже выполняются из папки apps/backend/.

Установите зависимости из корня монорепозитория:

```powershell
pnpm --dir ../.. install
```

Создайте `.env` из примера и заполните значения:

```powershell
Copy-Item .env.example .env
```

Войдите в Supabase CLI и свяжите репозиторий с проектом:

```powershell
pnpm supabase login
pnpm supabase link --project-ref <project-ref>
```

Добавьте `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` и `GEMINI_API_KEY` в Edge Functions → Secrets выбранного проекта.

Проверьте код и тесты:

```powershell
pnpm typecheck
pnpm test
```

Разверните функцию:

```powershell
pnpm deploy
```

Значение `TELEGRAM_WEBHOOK_URL` должно иметь вид:

```text
https://<project-ref>.supabase.co/functions/v1/telegram-webhook
```

Зарегистрируйте этот URL в Telegram:

```powershell
pnpm telegram:webhook:set
```

## Команды

| Команда | Назначение |
| --- | --- |
| `pnpm typecheck` | Проверка типов Edge Function и служебного скрипта. |
| `pnpm test` | Запуск unit-тестов через Deno. |
| `pnpm test:db` | SQL-тесты в локальном Supabase (нужен Docker и `pnpm supabase start`). |
| `pnpm test:watch` | Запуск Deno-тестов при изменении файлов. |
| `pnpm deploy` | Развёртывание Edge Functions в связанном Supabase-проекте. |
| `pnpm telegram:webhook:set` | Регистрация URL и секрета webhook в Telegram. |

## Работа webhook

Telegram отправляет `POST` на URL Edge Function вместе с секретным заголовком. Webhook обрабатывает сообщения из личных чатов и возвращает действие `sendMessage` в JSON-ответе.

## Архитектура

C4-диаграммы и подробное описание слоёв находятся в [`docs/architecture`](../../docs/architecture/README.md).

## История чатов

Webhook сохраняет сообщения клиента и ответы бота в PostgreSQL. Администратор входит через `admin-auth`, читает список клиентов через `clients`, историю через `messages`, а новые записи получает через Supabase Realtime. HTTP-функции и RLS проверяют запись пользователя в `public.inbox_admins`. Настройка тестовых аккаунтов описана в [корневом README](../../README.md#вход-в-админ-панель).

`GET /functions/v1/clients` возвращает клиентов с `last_message` для превью. `GET /functions/v1/messages?client_id=123` возвращает `{ items, nextCursor }`: последние 20 записей от новых к старым. Для следующей страницы передайте `cursor=<nextCursor>`. Курсор содержит точные `created_at` и `id`; ID возвращаются строками для сохранения bigint. `direction=after` возвращает записи после курсора от старых к новым и используется для восстановления после разрыва соединения. Ответ с `nextCursor: null` означает конец истории. Некорректные параметры возвращают HTTP 400.

`POST /functions/v1/messages` принимает `{ clientId, requestId, action, text? }`. Действия `connect`, `send` и `finish` доступны администраторам, а отправка и завершение разрешены владельцу активного диалога. `requestId` — UUID одного действия. Повтор того же запроса не вызывает повторную отправку в Telegram. База сериализует действия по диалогу, а история и состояние обновляются после подтверждения Telegram. При неизвестном исходе нужно проверить историю перед новой попыткой. В списке клиентов `manager_user_id` содержит ID текущего менеджера, а `manager_kind` в записи сообщения различает ответ (`reply`) и уведомление (`notice`).

За последние 60 секунд разрешено до 15 попыток отправки на администратора и до 60 на всех администраторов одного бота. Учитываются ручные ответы и уведомления о начале и завершении диалога, включая попытки с ошибкой Telegram. Повторы с тем же `requestId` не расходуют лимит. При превышении API отвечает `429` с числом секунд ожидания в заголовке `Retry-After` и поле `retryAfter`. Автоответы webhook идут своим путём.

Миграция `20261005150000_add_message_cursor_pagination.sql` добавляет индекс истории по клиенту и серверные RPC-функции. Сначала примените миграцию, затем разверните обе функции:

```powershell
pnpm supabase db push
pnpm supabase functions deploy clients
pnpm supabase functions deploy messages
```

## Ограничения

- История хранится в PostgreSQL. Кэш фронтенда живёт до перезагрузки страницы.
- Автоответы зависят от доступности Gemini API и наличия проиндексированных данных.
