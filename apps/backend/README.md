# Fullstack Bot — Telegram-конвертер валют и криптовалют

Telegram-бот работает как Supabase Edge Function. Он принимает webhook-обновления Telegram, получает курсы через CurrencyBeacon или Frankfurter и возвращает результат через механизм webhook reply.

## Возможности

- конвертация по запросам `EUR`, `EUR USD` и `100 EUR USD`;
- поддержка фиатных валют и криптовалют;
- сравнение текущего курса со вчерашним;
- изменение курса за 3, 7, 14 или 30 дней по inline-кнопкам;
- CurrencyBeacon как основной источник и Frankfurter как резервный;
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
├── functions/_shared/           # CORS и серверный Supabase-клиент
├── functions/clients/           # список клиентов и превью сообщений
├── functions/messages/          # история, курсорная пагинация и действия менеджера
├── functions/profile/           # учебный endpoint профиля
├── functions/telegram-webhook/
│   ├── index.ts                 # composition root и HTTP-адаптер
│   ├── domain/                  # модели валют и доменные ошибки
│   ├── application/             # сценарии и порты
│   ├── infrastructure/          # провайдеры курсов и Telegram Bot API
│   └── presentation/            # разбор и обработка Telegram update
├── migrations/                  # PostgreSQL, RPC и Realtime/RLS
└── tests/
    ├── unit/                    # Deno unit-тесты
    └── database/                # SQL-тесты

scripts/
└── set-telegram-webhook.ts      # регистрация webhook в Telegram

deno.json                       # локальные проверки и скрипты, общий import map
```

Проект сохраняет чистую архитектуру: зависимости направлены от внешних адаптеров к application/domain, а конкретные реализации связываются в `index.ts`.

## Требования

- Node.js 24 и pnpm 10 для локального Supabase CLI;
- Deno 2;
- Supabase-проект, связанный с репозиторием;
- Telegram-бот, созданный через BotFather.

## Импорт базы знаний

Команда `pnpm knowledge:import` из корня загружает `docs/medcenter-paid-services.jsonl` в локальный Docker-контейнер `supabase_db_fullstack-bot`. Сначала запустите локальный Supabase и примените миграцию базы знаний. Для другого файла передайте абсолютный путь как аргумент команды.

Импорт выполняется одной транзакцией. Источники обновляются по URL, фрагменты и тарифы — по ключам внутри источника. Из строк с несколькими колонками цен создаются отдельные тарифные записи. Текстовые фрагменты формируются из доступных резюме выгрузки.

## Ответы о платных услугах

При заданном `GEMINI_API_KEY` webhook работает как справочник медцентра. Gemini выбирает ключевые слова, webhook ищет по тарифам и фрагментам через `search_knowledge`, а модель формулирует ответ по результатам. При активном менеджере автоматический ответ подавляется. Без ключа доступен сценарий конвертации валют.

Для локальной проверки примените миграции, загрузите базу знаний и запустите `pnpm supabase functions serve telegram-webhook --env-file .env` из корня. Путь `.env` относится к `apps/backend`, где выполняется команда CLI.

## Переменные окружения

| Переменная | Где используется | Назначение |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Edge Functions и локальный скрипт | Подтверждение callback query, ручная отправка сообщений и регистрация webhook. |
| `TELEGRAM_WEBHOOK_SECRET` | Edge Function и локальный скрипт | Проверка заголовка `X-Telegram-Bot-Api-Secret-Token`. |
| `TELEGRAM_WEBHOOK_URL` | Локальный скрипт | URL развёрнутой Edge Function. |
| `CURRENCY_BEACON_API_KEY` | Edge Function | Необязательный ключ CurrencyBeacon. Без него используется Frankfurter. |
| `GEMINI_API_KEY` | Edge Function | Ключ Gemini Developer API. Включает ответы по базе знаний. |
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

Загрузите секреты функции:

```powershell
pnpm supabase secrets set --env-file .env
```

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

Telegram отправляет `POST` на URL Edge Function вместе с секретным заголовком. Функция выбирает обработчик обычного сообщения или callback query и возвращает действие `sendMessage` в JSON-ответе.

Обычный запрос параллельно получает текущий и вчерашний курсы у одного провайдера. При допустимой ошибке CurrencyBeacon вся пара повторно запрашивается у Frankfurter, чтобы не смешивать данные разных источников.

При нажатии кнопки текущий курс и провайдер читаются из `callback_data`. Функция запрашивает только исторический курс у того же провайдера и отправляет отдельное сообщение с изменением за выбранный период.

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

- история хранится в PostgreSQL; кэш фронтенда живёт только до перезагрузки страницы;
- доступность курсов зависит от внешних провайдеров;
- Frankfurter поддерживает только фиатные валюты;
- криптовалютные курсы требуют `CURRENCY_BEACON_API_KEY`;
- тайм-аут каждого обращения к внешнему API составляет 3 секунды.
