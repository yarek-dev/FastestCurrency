# Fullstack Bot

- `backend/` — существующий Supabase-бэкенд, миграции, тесты и серверный `.env`.
- `frontend/` — React, TanStack Router и компоненты shadcn/ui.
- `frontend/src/main.tsx` — входная точка React.

`frontend/src/modules/chats/` содержит весь модуль чатов: `pages/chats-page/` — экран и его раскладку, вложенная `components/` — список клиентов и переписку, `hooks/` — загрузку и Realtime-подписку, `api/` — запросы к серверу, объединение событий и преобразование данных, `types/` — типы модуля. Компоненты, используемые только одной страницей, остаются внутри её папки; на уровень модуля их выносим при использовании несколькими страницами. CSS Modules находятся рядом со своими страницами и компонентами. Внешний код подключает модуль через `index.ts`, который экспортирует `ChatsPage`; внутренние файлы используют прямые импорты внутри модуля. Папки вроде `utils/` добавляются при появлении соответствующего кода.

`useChats` получает клиентов и превью последних сообщений через SWR и Edge Function `/clients`. `api/chats-subscription.ts` открывает Supabase Realtime, передаёт события и возвращает функцию закрытия подписки. `useChats` объединяет события с кэшем; сообщения объединяются по ID. Подписка не выполняет HTTP-запросы.

`hooks/use-messages.ts` использует `useSWRInfinite`: при открытии чата загружаются последние 20 сообщений, следующие страницы запрашиваются с курсором `(created_at, id)`. Страницы каждого клиента и Realtime-сообщения сохраняются в памяти SWR до перезагрузки страницы. После подключения восстанавливаются все пропущенные сообщения отдельными запросами вперёд по курсору, без сброса загруженной истории. Polling и обновление при фокусе окна отключены; после ошибки есть ограниченные автоматические повторы и кнопка ручного повтора.

`hooks/use-conversation-scroll.ts` наблюдает верхний маркер через `IntersectionObserver` с отступом в один экран, чтобы заранее догружать историю. При добавлении старых сообщений сохраняется видимое сообщение и его положение; позиция сохраняется отдельно для каждого чата. Новые сообщения прокручивают список вниз, если пользователь уже внизу, иначе появляется кнопка «Новые сообщения ↓». Используется обычный список без виртуализации.

`frontend/src/components/ui/` содержит Button, Input, Avatar, Badge и Alert из официального реестра shadcn (стиль new-york). Их стили перенесены в `ui.module.css`, без Tailwind. Button и Avatar используют Radix; варианты компонентов задаются через class-variance-authority.

Для подключения создайте `frontend/.env.local` из `frontend/.env.example`. `VITE_SUPABASE_URL` содержит URL проекта, `VITE_SUPABASE_PUBLISHABLE_KEY` — публичный publishable key (или legacy anon key) того же проекта. Service role / secret key в браузере не используется. После изменения переменных перезапустите Vite. Функции `clients` и `messages` должны быть развёрнуты с поддержкой CORS из текущего кода.

Перед запуском Realtime примените миграции, включая `backend/supabase/migrations/20261005120000_enable_public_chats_realtime.sql`: она добавляет таблицы в публикацию `supabase_realtime` и разрешает роли `anon` только чтение через RLS. Учебный интерфейс публичный, вход не требуется; запись по-прежнему выполняет сервер.

Для пагинации также нужна миграция `20261005150000_add_message_cursor_pagination.sql` и обновлённые Edge Functions `clients` и `messages`. Миграция добавляет индекс `(client_id, created_at DESC, id DESC)` и две RPC-функции, доступные только серверной роли. Из папки `backend/`:

```powershell
pnpm supabase db push
pnpm supabase functions deploy clients
pnpm supabase functions deploy messages
```

Эти команды изменяют связанный Supabase-проект. Старый `/messages`, возвращавший массив всей истории, несовместим с новым фронтендом.

Из корня репозитория:

```powershell
pnpm install
pnpm dev
pnpm build
pnpm --filter @fullstack-bot/frontend test
```

Инструкции по бэкенду: [backend/README.md](backend/README.md).
