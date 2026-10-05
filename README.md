# Fullstack Bot

- `backend/` — существующий Supabase-бэкенд, миграции, тесты и серверный `.env`.
- `frontend/` — React, TanStack Router и компоненты shadcn/ui.
- `frontend/src/main.tsx` — входная точка React.

`frontend/src/modules/chats/` содержит весь модуль чатов: `pages/chats-page/` — экран и его раскладку, вложенная `components/` — список клиентов и переписку, `hooks/` — загрузку и polling, `api/` — запросы к серверу и преобразование данных, `types/` — типы модуля. Компоненты, используемые только одной страницей, остаются внутри её папки; на уровень модуля их выносим при использовании несколькими страницами. CSS Modules находятся рядом со своими страницами и компонентами. Внешний код подключает модуль через `index.ts`, который экспортирует `ChatsPage`; внутренние файлы используют прямые импорты внутри модуля. Папки вроде `utils/` добавляются при появлении соответствующего кода.

Frontend запрашивает всех клиентов и сообщения через Supabase Edge Functions `/clients` и `/messages` при открытии страницы и каждые 15 секунд. Сообщения выбранного клиента фильтруются на фронтенде и отображаются от старых к новым.

`frontend/src/components/ui/` содержит Button, Input, Avatar, Badge и Alert из официального реестра shadcn (стиль new-york). Их стили перенесены в `ui.module.css`, без Tailwind. Button и Avatar используют Radix; варианты компонентов задаются через class-variance-authority.

Для подключения создайте `frontend/.env.local` из `frontend/.env.example`. Переменная `VITE_SUPABASE_URL` содержит публичный URL проекта. После изменения переменной перезапустите Vite. Функции `clients` и `messages` должны быть развёрнуты с поддержкой CORS из текущего кода.

Из корня репозитория:

```powershell
pnpm install
pnpm dev
pnpm build
```

Инструкции по бэкенду: [backend/README.md](backend/README.md).
