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
  status text not null default 'pending' check (status in ('pending', 'delivered', 'cancelled')),
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

drop function if exists public.reserve_product(uuid, text, text, integer);

create or replace function public.reserve_product(
  p_product_id uuid,
  p_customer_name text,
  p_customer_phone text,
  p_packs integer
)
returns table (
  id uuid,
  ticket_code text,
  seller_id uuid,
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
    v_reservation.seller_id,
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

create or replace function public.get_client_reservations(
  p_ticket_codes text[] default '{}',
  p_customer_phone text default ''
)
returns table (
  id uuid,
  ticket_code text,
  seller_id uuid,
  seller_name text,
  product_id uuid,
  product_name text,
  product_category text,
  product_description text,
  product_image_url text,
  customer_name text,
  packs integer,
  total_price numeric,
  pickup_start text,
  pickup_end text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_clean_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_has_tickets boolean := p_ticket_codes is not null and array_length(p_ticket_codes, 1) > 0;
begin
  if not v_has_tickets and char_length(v_clean_phone) < 8 then
    return;
  end if;

  return query
  select
    r.id,
    r.ticket_code,
    r.seller_id,
    coalesce(p.seller_name, 'Comercio local') as seller_name,
    r.product_id,
    r.product_name,
    coalesce(p.category, 'Comida') as product_category,
    coalesce(p.description, '') as product_description,
    p.image_url as product_image_url,
    r.customer_name,
    r.packs,
    r.total_price,
    r.pickup_start,
    r.pickup_end,
    r.status,
    r.created_at
  from public.reservations r
  left join public.products p on p.id = r.product_id
  where (
    (v_has_tickets and (
      r.ticket_code = any(p_ticket_codes)
      or replace(r.ticket_code, '#', '') = any(
        select replace(t, '#', '') from unnest(p_ticket_codes) as t
      )
    ))
    or
    (char_length(v_clean_phone) >= 8 and
     right(regexp_replace(r.customer_phone, '[^0-9]', '', 'g'), 8) = right(v_clean_phone, 8))
  )
  order by r.created_at desc;
end;
$$;

revoke all on function public.get_client_reservations(text[], text) from public;
grant execute on function public.get_client_reservations(text[], text) to anon, authenticated;

create or replace function public.cancel_reservation(
  p_reservation_id uuid,
  p_ticket_code text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_res public.reservations%rowtype;
  v_clean_code text := replace(trim(p_ticket_code), '#', '');
begin
  select * into v_res
  from public.reservations
  where id = p_reservation_id
    and (
      ticket_code = p_ticket_code
      or replace(ticket_code, '#', '') = v_clean_code
    );

  if not found then
    raise exception using message = 'No se encontró la reserva o el código de ticket no coincide.', errcode = 'P0002';
  end if;

  if v_res.status != 'pending' then
    raise exception using message = 'Solo se pueden cancelar reservas que estén activas.', errcode = 'P0003';
  end if;

  update public.products
  set quantity = quantity + v_res.packs
  where id = v_res.product_id;

  update public.reservations
  set status = 'cancelled'
  where id = v_res.id;

  return true;
end;
$$;

revoke all on function public.cancel_reservation(uuid, text) from public;
grant execute on function public.cancel_reservation(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
