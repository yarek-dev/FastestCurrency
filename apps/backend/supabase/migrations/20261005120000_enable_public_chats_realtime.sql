-- Public, read-only access for the educational inbox.
grant select on table public.clients, public.messages to anon;

create policy "Public inbox clients read"
    on public.clients for select to anon using (true);
create policy "Public inbox messages read"
    on public.messages for select to anon using (true);

-- Tables may have already been enabled from the Dashboard.
do $$
begin
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'clients'
    ) then
        alter publication supabase_realtime add table public.clients;
    end if;
    if not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
    ) then
        alter publication supabase_realtime add table public.messages;
    end if;
end;
$$;
