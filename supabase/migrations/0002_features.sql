-- =====================================================================
-- Painel da congregação – Braga Central · migração 0002 (novas funcionalidades)
-- Corra DEPOIS de 0001_init.sql (SQL Editor > Run)
-- =====================================================================

-- 1) Mais menus --------------------------------------------------------
alter table public.menus drop constraint if exists menus_kind_check;
alter table public.menus add constraint menus_kind_check check (kind in ('weekly','list','sheet'));

insert into public.menus (key, label, sort, kind, sensitive) values
  ('eventos', 'Eventos',                          45, 'list',  false),
  ('irmaos',  'Irmãos (designações)',             55, 'list',  true),
  ('outras',  'Departamentos e outras folhas',    90, 'sheet', false)
on conflict (key) do nothing;

-- 2) Definições (dias/horas das reuniões, etc.) -----------------------------
create table if not exists public.settings (
  key        text primary key,
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.settings enable row level security;
revoke all on public.settings from anon;

create or replace function public.is_approved() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and status = 'approved');
$$;

drop policy if exists settings_read  on public.settings;
drop policy if exists settings_admin on public.settings;
create policy settings_read  on public.settings for select to authenticated using (public.is_approved());
create policy settings_admin on public.settings for all    to authenticated using (public.is_admin()) with check (public.is_admin());

insert into public.settings (key, value) values
  ('meetings', '{"d1":1,"t1":"20:30","d2":6,"t2":"15:00"}')   -- 0=domingo … 6=sábado
on conflict (key) do nothing;

-- 3) Histórico de alterações (1 linha por operação, não por registo) --------------
create table if not exists public.audit_log (
  id        bigserial primary key,
  at        timestamptz not null default now(),
  user_id   uuid default auth.uid(),
  username  text,
  action    text not null check (action in ('insert','update','delete')),
  menu_keys text[],
  n         int,
  summary   text
);
alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon;
drop policy if exists audit_read on public.audit_log;
create policy audit_read on public.audit_log for select to authenticated using (public.is_admin());

create or replace function public.audit_ins() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (username, action, menu_keys, n, summary)
  select (select username from public.profiles where id = auth.uid()), 'insert',
         array_agg(distinct menu_key), count(*),
         min(coalesce(data->>'parte', data->>'local', data->>'titulo', data->>'nome', data->>'grupo', data->>'responsabilidade'))
  from new_rows having count(*) > 0;
  return null;
end $$;
create or replace function public.audit_upd() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (username, action, menu_keys, n, summary)
  select (select username from public.profiles where id = auth.uid()), 'update',
         array_agg(distinct menu_key), count(*),
         min(coalesce(data->>'parte', data->>'local', data->>'titulo', data->>'nome', data->>'grupo', data->>'responsabilidade'))
  from new_rows having count(*) > 0;
  return null;
end $$;
create or replace function public.audit_del() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (username, action, menu_keys, n, summary)
  select (select username from public.profiles where id = auth.uid()), 'delete',
         array_agg(distinct menu_key), count(*),
         min(coalesce(data->>'parte', data->>'local', data->>'titulo', data->>'nome', data->>'grupo', data->>'responsabilidade'))
  from old_rows having count(*) > 0;
  return null;
end $$;

drop trigger if exists items_audit_ins on public.items;
drop trigger if exists items_audit_upd on public.items;
drop trigger if exists items_audit_del on public.items;
create trigger items_audit_ins after insert on public.items referencing new table as new_rows for each statement execute function public.audit_ins();
create trigger items_audit_upd after update on public.items referencing new table as new_rows old table as old_rows for each statement execute function public.audit_upd();
create trigger items_audit_del after delete on public.items referencing old table as old_rows for each statement execute function public.audit_del();

-- 4) Pesquisa global (ignora acentos; respeita as permissões de cada pessoa) ------
create extension if not exists unaccent with schema extensions;

create or replace function public.search_items(q text) returns setof public.items
language sql stable security invoker set search_path = public, extensions as $$
  select i.* from public.items i
  where length(trim(q)) >= 2
    and unaccent(lower((select string_agg(v.value, ' ') from jsonb_each_text(i.data) v))) like '%' || unaccent(lower(trim(q))) || '%'
  order by i.menu_key, i.week_start desc nulls last, i.position
  limit 200;
$$;
