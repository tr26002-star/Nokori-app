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
  customer_id uuid references auth.users (id) on delete set null,
  product_id uuid not null references public.products (id) on delete restrict,
  product_name text not null,
  customer_name text not null,
  customer_phone text not null,
  packs integer not null check (packs > 0),
  total_price numeric(12, 2) not null check (total_price >= 0),
  pickup_start text not null,
  pickup_end text not null,
  status text not null default 'pending' check (status in ('pending', 'delivered', 'cancelled', 'not_collected')),
  created_at timestamptz not null default now()
);

alter table public.reservations
  add column if not exists customer_id uuid references auth.users (id) on delete set null;

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pending', 'delivered', 'cancelled', 'not_collected'));

create index if not exists reservations_seller_created_at_idx
  on public.reservations (seller_id, created_at desc);

create index if not exists reservations_customer_created_at_idx
  on public.reservations (customer_id, created_at desc)
  where customer_id is not null;

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

drop policy if exists "Clients can read their own reservations" on public.reservations;
create policy "Clients can read their own reservations"
  on public.reservations
  for select
  to authenticated
  using ((select auth.uid()) = customer_id);

drop policy if exists "Sellers can update their own reservation status" on public.reservations;
create policy "Sellers can update their own reservation status"
  on public.reservations
  for update
  to authenticated
  using ((select auth.uid()) = seller_id)
  with check ((select auth.uid()) = seller_id);

create or replace function public.normalize_salvadoran_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  with phone_digits as (
    select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as value
  )
  select case
    when char_length(value) = 8 then '+503' || value
    when char_length(value) = 11 and left(value, 3) = '503' then '+' || value
    when char_length(value) = 13 and left(value, 5) = '00503' then '+' || substr(value, 3)
    else null
  end
  from phone_digits;
$$;

revoke all on function public.normalize_salvadoran_phone(text) from public, anon, authenticated;

drop function if exists public.reserve_product(uuid, text, text, integer);
drop function if exists public.reserve_product(uuid, text, integer);

create or replace function public.reserve_product(
  p_product_id uuid,
  p_customer_name text,
  p_packs integer,
  p_customer_phone text
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
  v_user_id uuid := auth.uid();
  v_product public.products%rowtype;
  v_reservation public.reservations%rowtype;
  v_customer_name text := btrim(p_customer_name);
  v_customer_phone text := btrim(p_customer_phone);
begin
  if v_user_id is null then
    raise exception using message = 'Inicia sesión con tu correo para reservar.', errcode = '42501';
  end if;

  if v_customer_phone is null or v_customer_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception using message = 'Escribe un teléfono de contacto válido en formato internacional E.164.', errcode = '22023';
  end if;

  if v_customer_name is null or char_length(v_customer_name) < 2 or char_length(v_customer_name) > 100 then
    raise exception using message = 'Escribe un nombre válido para la reserva.', errcode = '22023';
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
    customer_id,
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
    v_user_id,
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

revoke all on function public.reserve_product(uuid, text, integer, text) from public, anon;
grant execute on function public.reserve_product(uuid, text, integer, text) to authenticated;

drop function if exists public.get_client_reservations(text[], text);
drop function if exists public.get_client_reservations();
create function public.get_client_reservations()
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
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using message = 'Inicia sesión para consultar tus reservas.', errcode = '42501';
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
  where r.customer_id = v_user_id
  order by r.created_at desc;
end;
$$;

revoke all on function public.get_client_reservations() from public, anon;
grant execute on function public.get_client_reservations() to authenticated;

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
  v_user_id uuid := auth.uid();
  v_res public.reservations%rowtype;
  v_clean_code text := replace(trim(coalesce(p_ticket_code, '')), '#', '');
begin
  if v_user_id is null then
    raise exception using message = 'Inicia sesión para cancelar una reserva.', errcode = '42501';
  end if;

  select * into v_res
  from public.reservations
  where id = p_reservation_id
    and customer_id = v_user_id
    and replace(ticket_code, '#', '') = v_clean_code
  for update;

  if not found then
    raise exception using message = 'No se encontró la reserva o el código de ticket no coincide.', errcode = 'P0002';
  end if;

  if v_res.status != 'pending' then
    raise exception using message = 'Solo se pueden cancelar reservas que estén activas.', errcode = 'P0003';
  end if;

  update public.products
  set quantity = quantity + v_res.packs
  where id = v_res.product_id;
  if not found then
    raise exception using message = 'No se pudo devolver el inventario del producto.', errcode = 'P0001';
  end if;

  update public.reservations
  set status = 'cancelled'
  where id = v_res.id
    and status = 'pending';
  if not found then
    raise exception using message = 'La reserva ya no está activa.', errcode = 'P0003';
  end if;

  return true;
end;
$$;

revoke all on function public.cancel_reservation(uuid, text) from public, anon;
grant execute on function public.cancel_reservation(uuid, text) to authenticated;

create or replace function public.get_seller_reservations()
returns setof public.reservations
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using message = 'Inicia sesión con tu cuenta de vendedor para ver tus reservas.', errcode = '42501';
  end if;

  return query
  select reservation.*
  from public.reservations as reservation
  where reservation.seller_id = v_user_id
     or exists (
       select 1 from public.products as product
       where product.id = reservation.product_id and product.seller_id = v_user_id
     )
  order by reservation.created_at desc;
end;
$$;

revoke all on function public.get_seller_reservations() from public, anon;
grant execute on function public.get_seller_reservations() to authenticated;

create or replace function public.mark_reservation_delivered(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_res public.reservations%rowtype;
begin
  if v_user_id is null then
    raise exception using message = 'Inicia sesión con tu cuenta de vendedor para confirmar la recogida.', errcode = '42501';
  end if;

  select reservation.* into v_res
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and (reservation.seller_id = v_user_id or exists (
      select 1 from public.products as product
      where product.id = reservation.product_id and product.seller_id = v_user_id
    ))
  for update;

  if not found then
    raise exception using message = 'No se encontró una reserva de este negocio.', errcode = 'P0002';
  end if;
  if v_res.status <> 'pending' then
    raise exception using message = 'La reserva ya fue procesada.', errcode = 'P0003';
  end if;

  update public.reservations set status = 'delivered'
  where id = v_res.id and status = 'pending';
  if not found then
    raise exception using message = 'La reserva ya fue procesada.', errcode = 'P0003';
  end if;
  return true;
end;
$$;

revoke all on function public.mark_reservation_delivered(uuid) from public, anon;
grant execute on function public.mark_reservation_delivered(uuid) to authenticated;

create or replace function public.mark_reservation_not_collected(p_reservation_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_res public.reservations%rowtype;
begin
  if v_user_id is null then
    raise exception using message = 'Inicia sesión con tu cuenta de vendedor para actualizar la reserva.', errcode = '42501';
  end if;

  select reservation.* into v_res
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and (reservation.seller_id = v_user_id or exists (
      select 1 from public.products as product
      where product.id = reservation.product_id and product.seller_id = v_user_id
    ))
  for update;

  if not found then
    raise exception using message = 'No se encontró una reserva de este negocio.', errcode = 'P0002';
  end if;
  if v_res.status <> 'pending' then
    raise exception using message = 'Solo se puede devolver al inventario una reserva pendiente.', errcode = 'P0003';
  end if;

  update public.products set quantity = quantity + v_res.packs where id = v_res.product_id;
  if not found then
    raise exception using message = 'No se pudo devolver el pack al inventario.', errcode = 'P0001';
  end if;
  update public.reservations set status = 'not_collected'
  where id = v_res.id and status = 'pending';
  if not found then
    raise exception using message = 'La reserva ya fue procesada.', errcode = 'P0003';
  end if;
  return true;
end;
$$;

revoke all on function public.mark_reservation_not_collected(uuid) from public, anon;
grant execute on function public.mark_reservation_not_collected(uuid) to authenticated;

notify pgrst, 'reload schema';
