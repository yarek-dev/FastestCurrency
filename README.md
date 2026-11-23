# Fullstack Bot

- `apps/` — приложения с отдельными зависимостями, проверками и развёртыванием.
- `apps/backend/` — Supabase-бэкенд, миграции, тесты и серверный `.env`.
- `apps/frontend/` — React, TanStack Router и компоненты shadcn/ui.
- `apps/frontend/src/main.tsx` — входная точка React.

Корневые `package.json`, `pnpm-workspace.yaml` и `pnpm-lock.yaml` управляют всем монорепозиторием. Зависимости устанавливаются из корня через `pnpm install`. Единственный Supabase-проект находится в `apps/backend/supabase/`; его конфигурация, функции, миграции и SQL-тесты развиваются вместе.

Общие для Edge Functions import map и Deno lockfile находятся в `apps/backend/supabase/functions/deno.json` и `deno.lock`. `apps/backend/deno.json` подключает их для локальных проверок и скриптов; `supabase/config.toml` подключает тот же import map для каждой развёртываемой функции. Алиасы `@frontend/` и `@backend/` разрешаются относительно своих приложений.

`apps/frontend/src/modules/chats/` содержит весь модуль чатов: `pages/chats-page/` — экран и его раскладку, вложенная `components/` — список клиентов и переписку, `hooks/` — загрузку и Realtime-подписку, `api/` — запросы к серверу, объединение событий и преобразование данных, `types/` — типы модуля. Компоненты, используемые только одной страницей, остаются внутри её папки; на уровень модуля их выносим при использовании несколькими страницами. CSS Modules находятся рядом со своими страницами и компонентами. Внешний код подключает модуль через `index.ts`, который экспортирует `ChatsPage`; внутренние файлы используют прямые импорты внутри модуля. Папки вроде `utils/` добавляются при появлении соответствующего кода.

`useChats` получает клиентов и превью последних сообщений через SWR и Edge Function `/clients`. `api/chats-subscription.ts` открывает Supabase Realtime, передаёт события и возвращает функцию закрытия подписки. `useChats` объединяет события с кэшем; сообщения объединяются по ID. Подписка не выполняет HTTP-запросы.

`hooks/use-messages.ts` использует `useSWRInfinite`: при открытии чата загружаются последние 20 сообщений, следующие страницы запрашиваются с курсором `(created_at, id)`. Страницы каждого клиента и Realtime-сообщения сохраняются в памяти SWR до выхода из аккаунта или перезагрузки страницы. После подключения восстанавливаются все пропущенные сообщения отдельными запросами вперёд по курсору, без сброса загруженной истории. Polling и обновление при фокусе окна отключены; после ошибки есть ограниченные автоматические повторы и кнопка ручного повтора.

`hooks/use-conversation-scroll.ts` наблюдает верхний маркер через `IntersectionObserver` с отступом в один экран, чтобы заранее догружать историю. При добавлении старых сообщений сохраняется видимое сообщение и его положение; позиция сохраняется отдельно для каждого чата. Новые сообщения прокручивают список вниз, если пользователь уже внизу, иначе появляется кнопка «Новые сообщения ↓». Используется обычный список без виртуализации.

`apps/frontend/src/components/ui/` содержит Button, Input, Avatar, Badge и Alert из официального реестра shadcn (стиль new-york). Их стили перенесены в `ui.module.css`, без Tailwind. Button и Avatar используют Radix; варианты компонентов задаются через class-variance-authority.

Для подключения создайте `apps/frontend/.env.local` из `apps/frontend/.env.example`. `VITE_SUPABASE_URL` содержит URL проекта, `VITE_SUPABASE_PUBLISHABLE_KEY` — публичный publishable key (или legacy anon key) того же проекта. После изменения переменных перезапустите Vite.

### Вход в админ-панель

Вход выполняется по email и паролю длиной от 8 до 72 символов. Браузер обращается к Edge Function `admin-auth` для входа, проверки, обновления и завершения сессии. Пользовательский JWT применяется для чтения истории через `clients` и `messages` и для подписки Realtime. Политики RLS разрешают чтение чатов только администраторам.

1. В Supabase Dashboard отключите публичную регистрацию и создайте тестового пользователя с подтверждённым email в **Authentication → Users**. Для локального Supabase регистрация отключена в `supabase/config.toml`.
2. После применения миграций выполните запрос в SQL Editor, подставив UUID пользователя.

   ```sql
   insert into public.inbox_admins (user_id)
   values ('<UUID пользователя>'::uuid);
   ```

   Чтобы отозвать доступ, удалите строку с этим UUID из `public.inbox_admins`.
3. При выпуске согласованно обновите миграции, Edge Functions `admin-auth`, `clients`, `messages` и frontend. Старый frontend перестанет загружать переписки после обновления API.

Из корня репозитория:

```powershell
pnpm install
pnpm dev
pnpm build
pnpm typecheck
pnpm test
```

`pnpm test` запускает unit-тесты обоих приложений. Для выборочного запуска используйте `pnpm test:frontend` и `pnpm test:backend`; `pnpm test:watch` наблюдает оба приложения. SQL-тесты запускаются отдельно через `pnpm test:db` и требуют локального Supabase с Docker. `pnpm deploy:backend` развёртывает Edge Functions; миграции применяются отдельно командой `pnpm supabase db push`. GitHub workflow развёртывания backend выполняет оба шага.

Инструкции по бэкенду: [apps/backend/README.md](apps/backend/README.md).
