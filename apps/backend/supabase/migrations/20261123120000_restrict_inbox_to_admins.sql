create table public.inbox_admins (
    user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.inbox_admins enable row level security;
revoke all on table public.inbox_admins from public, anon, authenticated;
grant select, insert, delete on table public.inbox_admins to service_role;

create schema if not exists private;

create function private.is_inbox_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
    select exists (
        select 1 from public.inbox_admins where user_id = (select auth.uid())
    );
$$;

revoke all on function private.is_inbox_admin() from public, anon;
grant execute on function private.is_inbox_admin() to authenticated;

drop policy "Public inbox clients read" on public.clients;
drop policy "Public inbox messages read" on public.messages;
revoke select on table public.clients, public.messages from public, anon;
grant select on table public.clients, public.messages to authenticated;

create policy "Inbox admins can read clients"
    on public.clients for select to authenticated using ((select private.is_inbox_admin()));
create policy "Inbox admins can read messages"
    on public.messages for select to authenticated using ((select private.is_inbox_admin()));
