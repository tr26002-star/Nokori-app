create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text not null default '',
  category text not null,
  price numeric(12, 2) not null check (price > 0),
  quantity integer not null check (quantity >= 0),
  pickup_start text not null,
  pickup_end text not null,
  seller_name text not null,
  image_url text,
  created_at timestamptz not null default now()
);

alter table public.products
  add column if not exists is_published boolean not null default true;

alter table public.products
  drop constraint if exists products_quantity_check;

alter table public.products
  drop constraint if exists products_quantity_nonnegative;

alter table public.products
  add constraint products_quantity_nonnegative check (quantity >= 0);

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

create table if not exists public.reservations (
  id uuid primary key default gen_random_uuid(),
  ticket_code text not null unique,
  seller_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  customer_name text not null,
  customer_phone text not null,
  packs integer not null check (packs > 0),
  total_price numeric(12, 2) not null check (total_price >= 0),
  pickup_start text not null,
  pickup_end text not null,
  status text not null default 'pending' check (status in ('pending', 'delivered')),
  created_at timestamptz not null default now()
);

create index if not exists reservations_seller_created_at_idx
  on public.reservations (seller_id, created_at desc);

alter table public.reservations enable row level security;

revoke all on public.reservations from anon, authenticated;
grant select on public.reservations to authenticated;
grant update (status) on public.reservations to authenticated;

drop policy if exists "Sellers can read their own reservations" on public.reservations;
create policy "Sellers can read their own reservations"
  on public.reservations
  for select
  to authenticated
  using ((select auth.uid()) = seller_id);

drop policy if exists "Sellers can update their own reservation status" on public.reservations;
create policy "Sellers can update their own reservation status"
  on public.reservations
  for update
  to authenticated
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);

create or replace function public.reserve_product(
  p_product_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_packs integer
)
returns table (
  id uuid,
  ticket_code text,
  product_id uuid,
  product_name text,
  customer_name text,
  customer_phone text,
  packs integer,
  total_price numeric,
  pickup_start text,
  pickup_end text,
  status text,
  created_at timestamptz,
  remaining_quantity integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_product public.products%rowtype;
  v_reservation public.reservations%rowtype;
  v_customer_name text := btrim(p_customer_name);
  v_customer_phone text := btrim(p_customer_phone);
begin
  if v_customer_name is null or char_length(v_customer_name) < 2 or char_length(v_customer_name) > 100 then
    raise exception using message = 'Escribe un nombre válido para la reserva.', errcode = '22023';
  end if;

  if v_customer_phone is null
    or char_length(regexp_replace(v_customer_phone, '[^0-9]', '', 'g')) not between 8 and 15 then
    raise exception using message = 'Escribe un número de teléfono válido.', errcode = '22023';
  end if;

  if p_packs is null or p_packs < 1 then
    raise exception using message = 'La cantidad debe ser de al menos una unidad.', errcode = '22023';
  end if;

  update public.products as product
  set quantity = product.quantity - p_packs
  where product.id = p_product_id
    and product.is_published = true
    and product.quantity >= p_packs
  returning product.* into v_product;

  if not found then
    if exists (
      select 1
      from public.products as product
      where product.id = p_product_id
        and product.is_published = true
        and product.quantity > 0
    ) then
      raise exception using message = 'Ya no hay suficientes unidades disponibles. Actualiza la oferta e inténtalo otra vez.', errcode = 'P0001';
    end if;
    raise exception using message = 'Este producto ya no está disponible.', errcode = 'P0001';
  end if;

  insert into public.reservations (
    ticket_code,
    seller_id,
    product_id,
    product_name,
    customer_name,
    customer_phone,
    packs,
    total_price,
    pickup_start,
    pickup_end
  )
  values (
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    v_product.seller_id,
    v_product.id,
    v_product.name,
    v_customer_name,
    v_customer_phone,
    p_packs,
    v_product.price * p_packs,
    v_product.pickup_start,
    v_product.pickup_end
  )
  returning * into v_reservation;

  return query
  select
    v_reservation.id,
    v_reservation.ticket_code,
    v_reservation.product_id,
    v_reservation.product_name,
    v_reservation.customer_name,
    v_reservation.customer_phone,
    v_reservation.packs,
    v_reservation.total_price,
    v_reservation.pickup_start,
    v_reservation.pickup_end,
    v_reservation.status,
    v_reservation.created_at,
    v_product.quantity;
end;
$$;

revoke all on function public.reserve_product(uuid, text, text, integer) from public;
grant execute on function public.reserve_product(uuid, text, text, integer) to anon, authenticated;
