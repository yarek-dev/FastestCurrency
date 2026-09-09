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
├── functions/telegram-webhook/
│   ├── index.ts                 # composition root и HTTP-адаптер
│   ├── domain/                  # модели валют и доменные ошибки
│   ├── application/             # сценарии и порты
│   ├── infrastructure/          # провайдеры курсов и Telegram Bot API
│   └── presentation/            # разбор и обработка Telegram update
└── tests/unit/                  # Deno unit-тесты

scripts/
└── set-telegram-webhook.ts      # регистрация webhook в Telegram
```

Проект сохраняет чистую архитектуру: зависимости направлены от внешних адаптеров к application/domain, а конкретные реализации связываются в `index.ts`.

## Требования

- Node.js 24 и pnpm 10 для локального Supabase CLI;
- Deno 2;
- Supabase-проект, связанный с репозиторием;
- Telegram-бот, созданный через BotFather.

## Переменные окружения

| Переменная | Где используется | Назначение |
| --- | --- | --- |
| `TELEGRAM_BOT_TOKEN` | Edge Function и локальный скрипт | Подтверждение callback query и регистрация webhook. |
| `TELEGRAM_WEBHOOK_SECRET` | Edge Function и локальный скрипт | Проверка заголовка `X-Telegram-Bot-Api-Secret-Token`. |
| `TELEGRAM_WEBHOOK_URL` | Локальный скрипт | URL развёрнутой Edge Function. |
| `CURRENCY_BEACON_API_KEY` | Edge Function | Необязательный ключ CurrencyBeacon. Без него используется Frankfurter. |

Локальные значения хранятся в `.env`, который исключён из Git. Для Edge Function секреты задаются отдельно в Supabase.

## Настройка

Установите зависимости:

```powershell
pnpm install
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
| `pnpm test` | Запуск 95 unit-тестов через Deno. |
| `pnpm test:watch` | Запуск Deno-тестов при изменении файлов. |
| `pnpm deploy` | Развёртывание `telegram-webhook` в связанном Supabase-проекте. |
| `pnpm telegram:webhook:set` | Регистрация URL и секрета webhook в Telegram. |

## Работа webhook

Telegram отправляет `POST` на URL Edge Function вместе с секретным заголовком. Функция выбирает обработчик обычного сообщения или callback query и возвращает действие `sendMessage` в JSON-ответе.

Обычный запрос параллельно получает текущий и вчерашний курсы у одного провайдера. При допустимой ошибке CurrencyBeacon вся пара повторно запрашивается у Frankfurter, чтобы не смешивать данные разных источников.

При нажатии кнопки текущий курс и провайдер читаются из `callback_data`. Функция запрашивает только исторический курс у того же провайдера и отправляет отдельное сообщение с изменением за выбранный период.

## Архитектура

C4-диаграммы и подробное описание слоёв находятся в [`docs/architecture`](docs/architecture/README.md).

## Ограничения

- приложение не использует базу данных, кэш или очередь;
- доступность курсов зависит от внешних провайдеров;
- Frankfurter поддерживает только фиатные валюты;
- криптовалютные курсы требуют `CURRENCY_BEACON_API_KEY`;
- тайм-аут каждого обращения к внешнему API составляет 3 секунды.
