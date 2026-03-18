create table if not exists public.app_config (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

alter table public.app_config
  add column if not exists key text,
  add column if not exists value text,
  add column if not exists updated_at timestamptz not null default now();

update public.app_config
set value = ''
where value is null;

update public.app_config
set updated_at = now()
where updated_at is null;

alter table public.app_config
  alter column key set not null,
  alter column value set default '',
  alter column value set not null;

delete from public.app_config a
using public.app_config b
where a.key = b.key
  and a.ctid < b.ctid;

create unique index if not exists app_config_key_key
  on public.app_config (key);

alter table public.app_config disable row level security;

grant select, insert, update on public.app_config to anon, authenticated, service_role;
