alter table public.products
  add column if not exists is_published boolean not null default true;
