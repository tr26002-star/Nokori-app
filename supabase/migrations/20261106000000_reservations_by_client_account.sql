-- Bind customer reservations to the authenticated, SMS-verified phone account.
begin;

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

alter table public.reservations
  add column if not exists customer_id uuid references auth.users (id) on delete set null;

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pending', 'delivered', 'cancelled'));

create index if not exists reservations_customer_created_at_idx
  on public.reservations (customer_id, created_at desc)
  where customer_id is not null;

-- Only attach legacy rows to exactly one account with a verified matching phone.
with verified_phones as (
  select
    id,
    public.normalize_salvadoran_phone(phone) as normalized_phone
  from auth.users
  where phone_confirmed_at is not null
    and phone is not null
),
unique_verified_phones as (
  select
    normalized_phone,
    min(id::text)::uuid as user_id
  from verified_phones
  where normalized_phone is not null
  group by normalized_phone
  having count(*) = 1
)
update public.reservations as reservation
set
  customer_id = verified.user_id,
  customer_phone = verified.normalized_phone
from unique_verified_phones as verified
where reservation.customer_id is null
  and public.normalize_salvadoran_phone(reservation.customer_phone) = verified.normalized_phone;

drop policy if exists "Clients can read their own reservations" on public.reservations;
create policy "Clients can read their own reservations"
  on public.reservations
  for select
  to authenticated
  using ((select auth.uid()) = customer_id);

drop function if exists public.reserve_product(uuid, text, text, integer);
drop function if exists public.reserve_product(uuid, text, integer);

create function public.reserve_product(
  p_product_id uuid,
  p_customer_name text,
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
  v_user_id uuid := auth.uid();
  v_customer_phone text;
  v_customer_name text := btrim(p_customer_name);
  v_product public.products%rowtype;
  v_reservation public.reservations%rowtype;
begin
  if v_user_id is null then
    raise exception using message = 'Inicia sesión con tu teléfono para reservar.', errcode = '42501';
  end if;

  select public.normalize_salvadoran_phone(auth_user.phone)
  into v_customer_phone
  from auth.users as auth_user
  where auth_user.id = v_user_id
    and auth_user.phone_confirmed_at is not null;

  if v_customer_phone is null then
    raise exception using message = 'Verifica un número salvadoreño de 8 dígitos en tu cuenta.', errcode = '22023';
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

revoke all on function public.reserve_product(uuid, text, integer) from public, anon;
grant execute on function public.reserve_product(uuid, text, integer) to authenticated;

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
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para consultar tus reservas.', errcode = '42501';
  end if;

  return query
  select
    reservation.id,
    reservation.ticket_code,
    reservation.seller_id,
    coalesce(product.seller_name, 'Comercio local'),
    reservation.product_id,
    reservation.product_name,
    coalesce(product.category, 'Comida'),
    coalesce(product.description, ''),
    product.image_url,
    reservation.customer_name,
    reservation.packs,
    reservation.total_price,
    reservation.pickup_start,
    reservation.pickup_end,
    reservation.status,
    reservation.created_at
  from public.reservations as reservation
  left join public.products as product on product.id = reservation.product_id
  where reservation.customer_id = auth.uid()
  order by reservation.created_at desc;
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

  select *
  into v_res
  from public.reservations
  where id = p_reservation_id
    and customer_id = v_user_id
    and replace(ticket_code, '#', '') = v_clean_code
  for update;

  if not found then
    raise exception using
      message = 'No se encontró una reserva propia con ese código.',
      errcode = 'P0002';
  end if;

  if v_res.status <> 'pending' then
    raise exception using
      message = 'Solo se pueden cancelar reservas que estén activas.',
      errcode = 'P0003';
  end if;

  update public.products
  set quantity = quantity + v_res.packs
  where id = v_res.product_id;

  if not found then
    raise exception using
      message = 'No se pudo devolver el inventario del producto.',
      errcode = 'P0001';
  end if;

  update public.reservations
  set status = 'cancelled'
  where id = v_res.id
    and status = 'pending';

  if not found then
    raise exception using
      message = 'La reserva ya no está activa.',
      errcode = 'P0003';
  end if;

  return true;
end;
$$;

revoke all on function public.cancel_reservation(uuid, text) from public, anon;
grant execute on function public.cancel_reservation(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
