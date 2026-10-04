# Fullstack Bot

- `backend/` — существующий Supabase-бэкенд, миграции, тесты и серверный `.env`.
- `frontend/` — React, TanStack Router и пакет `shadcn` (CLI).
- `frontend/src/main.tsx` — входная точка React.

`frontend/src/modules/chats/` содержит интерфейс списка клиентов и переписки, демонстрационные данные и CSS Modules. Выбор клиента и поиск работают локально; подключение к Supabase пока не реализовано.

Из корня репозитория:

```powershell
pnpm install
pnpm dev
pnpm build
```

Инструкции по бэкенду: [backend/README.md](backend/README.md).
