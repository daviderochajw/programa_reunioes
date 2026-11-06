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
