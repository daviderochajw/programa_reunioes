-- ==============================================================
-- SETUP COMPLETO (junta 0001 + 0002). Cole TUDO no Supabase > SQL Editor > Run
-- ==============================================================
-- =====================================================================
-- Painel da congregação – Braga Central
-- Cole este ficheiro inteiro no Supabase > SQL Editor > Run
-- =====================================================================

-- 1) MENUS (as secções da app) ----------------------------------------
create table public.menus (
  key        text primary key,
  label      text not null,
  sort       int  not null default 0,
  kind       text not null check (kind in ('weekly','list')),  -- weekly = dados por semana; list = lista fixa
  sensitive  boolean not null default false                    -- só um aviso no ecrã do administrador
);

insert into public.menus (key, label, sort, kind, sensitive) values
  ('prog',        'Programa Reuniões',            10, 'weekly', false),
  ('saidas',      'Saídas ao Serviço de Campo',   20, 'weekly', false),
  ('testemunho',  'Testemunho Público',           30, 'weekly', false),
  ('anuncios',    'Anúncios e Lembretes',         40, 'weekly', false),
  ('contactos',   'Contactos',                    50, 'list',   true),
  ('resp',        'Responsabilidades',            60, 'list',   false),
  ('grupos',      'Grupos de saída',              70, 'list',   false),
  ('movs',        'Novos e batismos',             80, 'list',   true);

-- 2) PERFIS (um por conta) ---------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  username   text unique not null,
  full_name  text not null default '',
  role       text not null default 'viewer'  check (role   in ('admin','viewer')),
  status     text not null default 'pending' check (status in ('pending','approved','blocked')),
  created_at timestamptz not null default now()
);

-- 3) MENUS PERMITIDOS A CADA PESSOA --------------------------------------
create table public.user_menus (
  user_id  uuid not null references public.profiles(id) on delete cascade,
  menu_key text not null references public.menus(key)   on delete cascade,
  primary key (user_id, menu_key)
);

-- 4) DADOS (programa, saídas, anúncios, contactos...) ----------------------
create table public.items (
  id         uuid primary key default gen_random_uuid(),
  menu_key   text not null references public.menus(key) on delete cascade,
  week_start date,                         -- segunda-feira da semana (só nos menus 'weekly')
  position   int  not null default 0,      -- ordem dentro da semana / lista
  data       jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_menu_week_idx on public.items (menu_key, week_start);

-- 5) FUNÇÕES DE APOIO (security definer = não dependem das políticas) ----------
create or replace function public.is_admin() returns boolean
language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.profiles
                 where id = auth.uid() and role = 'admin' and status = 'approved');
$$;

create or replace function public.can_view(m text) returns boolean
language sql security definer stable set search_path = public as $$
  select public.is_admin()
      or exists (select 1
                 from public.profiles p
                 join public.user_menus um on um.user_id = p.id
                 where p.id = auth.uid() and p.status = 'approved' and um.menu_key = m);
$$;

-- 6) CRIAR O PERFIL AUTOMATICAMENTE NO REGISTO (sempre 'viewer' + 'pending') ----
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username, full_name)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
          coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 7) SEGURANÇA (RLS): é aqui que o acesso é realmente protegido ----------------
alter table public.menus      enable row level security;
alter table public.profiles   enable row level security;
alter table public.user_menus enable row level security;
alter table public.items      enable row level security;

-- menus: qualquer pessoa com sessão vê a lista (só nomes); só o admin altera
create policy menus_read  on public.menus for select to authenticated using (true);
create policy menus_admin on public.menus for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- profiles: cada um vê o seu; o admin vê e altera todos. Ninguém altera o próprio papel/estado.
create policy profiles_read  on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_admin on public.profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy profiles_del    on public.profiles for delete to authenticated using (public.is_admin());

-- user_menus: cada um vê os seus; só o admin escreve
create policy um_read  on public.user_menus for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy um_admin on public.user_menus for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- items: lê quem tem o menu; só o admin escreve
create policy items_read  on public.items for select to authenticated using (public.can_view(menu_key));
create policy items_admin on public.items for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- Visitantes sem sessão não têm acesso a nada
revoke all on public.menus, public.profiles, public.user_menus, public.items from anon;

-- =====================================================================
-- DEPOIS DE CRIARES A TUA CONTA NA APP, torna-te administrador com:
--
--   update public.profiles
--      set role = 'admin', status = 'approved'
--    where username = 'o.teu.nome';     -- o nome em minúsculas, sem acentos, com pontos
-- =====================================================================

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
