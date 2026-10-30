create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null,
  price numeric(12, 2) not null check (price > 0),
  quantity integer not null check (quantity >= 1),
  pickup_start text not null,
  pickup_end text not null,
  seller_name text not null,
  image_url text,
  created_at timestamptz not null default now()
);

create index if not exists products_created_at_idx
  on public.products (created_at desc);

alter table public.products enable row level security;

revoke all on public.products from anon, authenticated;
grant select on public.products to anon, authenticated;
grant insert, update on public.products to authenticated;

drop policy if exists "Anyone can read products" on public.products;
create policy "Anyone can read products"
  on public.products
  for select
  to anon, authenticated
  using (true);

drop policy if exists "Sellers can insert their own products" on public.products;
create policy "Sellers can insert their own products"
  on public.products
  for insert
  to authenticated
  with check ((select auth.uid()) = seller_id);

drop policy if exists "Sellers can update their own products" on public.products;
create policy "Sellers can update their own products"
  on public.products
  for update
  to authenticated
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);
