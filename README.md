# Fullstack Bot

- `backend/` — существующий Supabase-бэкенд, миграции, тесты и серверный `.env`.
- `frontend/` — React, TanStack Router и компоненты shadcn/ui.
- `frontend/src/main.tsx` — входная точка React.

`frontend/src/modules/chats/` содержит весь модуль чатов: `pages/chats-page/` — экран и его раскладку, вложенная `components/` — список клиентов и переписку, `hooks/` — загрузку и Realtime-подписку, `api/` — запросы к серверу, объединение событий и преобразование данных, `types/` — типы модуля. Компоненты, используемые только одной страницей, остаются внутри её папки; на уровень модуля их выносим при использовании несколькими страницами. CSS Modules находятся рядом со своими страницами и компонентами. Внешний код подключает модуль через `index.ts`, который экспортирует `ChatsPage`; внутренние файлы используют прямые импорты внутри модуля. Папки вроде `utils/` добавляются при появлении соответствующего кода.

`useChats` хранит React-состояние и в `useEffect` вызывает `subscribeToChats` из `api/chats-subscription.ts`. Подписка подключается к Supabase Realtime и загружает историю через Edge Functions `/clients` и `/messages`. Обработчики добавляют новые сообщения и добавляют или обновляют клиентов. События во время загрузки истории сохраняются до её завершения, сообщения объединяются по ID. После переподключения история загружается снова. Функция подписки возвращает очистку: при размонтировании загрузка отменяется и подписка закрывается. Сообщения отображаются от старых к новым, клиенты — по времени последнего сообщения.

`frontend/src/components/ui/` содержит Button, Input, Avatar, Badge и Alert из официального реестра shadcn (стиль new-york). Их стили перенесены в `ui.module.css`, без Tailwind. Button и Avatar используют Radix; варианты компонентов задаются через class-variance-authority.

Для подключения создайте `frontend/.env.local` из `frontend/.env.example`. `VITE_SUPABASE_URL` содержит URL проекта, `VITE_SUPABASE_PUBLISHABLE_KEY` — публичный publishable key (или legacy anon key) того же проекта. Service role / secret key в браузере не используется. После изменения переменных перезапустите Vite. Функции `clients` и `messages` должны быть развёрнуты с поддержкой CORS из текущего кода.

Перед запуском Realtime примените миграции, включая `backend/supabase/migrations/20261005120000_enable_public_chats_realtime.sql`: она добавляет таблицы в публикацию `supabase_realtime` и разрешает роли `anon` только чтение через RLS. Учебный интерфейс публичный, вход не требуется; запись по-прежнему выполняет сервер.

Из корня репозитория:

```powershell
pnpm install
pnpm dev
pnpm build
```

Инструкции по бэкенду: [backend/README.md](backend/README.md).
