begin;

alter table public.products
  add column if not exists normal_price numeric(12, 2);

alter table public.products
  drop constraint if exists products_normal_price_above_rescue_price;
alter table public.products
  add constraint products_normal_price_above_rescue_price
  check (normal_price is null or normal_price > price);

alter table public.reservations
  add column if not exists commission_amount numeric(12, 2),
  add column if not exists total_paid numeric(12, 2),
  add column if not exists payment_status text,
  add column if not exists payment_provider text;

update public.reservations
set commission_amount = coalesce(commission_amount, 0),
    total_paid = coalesce(total_paid, total_price),
    payment_status = coalesce(payment_status, 'historica'),
    payment_provider = coalesce(payment_provider, 'historico');

alter table public.reservations
  alter column commission_amount set not null,
  alter column total_paid set not null,
  alter column payment_status set not null,
  alter column payment_provider set not null;

alter table public.reservations
  drop constraint if exists reservations_commission_amount_nonnegative,
  drop constraint if exists reservations_total_paid_nonnegative,
  drop constraint if exists reservations_payment_status_check,
  drop constraint if exists reservations_payment_provider_check;
alter table public.reservations
  add constraint reservations_commission_amount_nonnegative check (commission_amount >= 0),
  add constraint reservations_total_paid_nonnegative check (total_paid >= 0),
  add constraint reservations_payment_status_check
    check (payment_status in ('pagada_simulada', 'historica', 'pagada', 'pendiente', 'fallida', 'reembolsada')),
  add constraint reservations_payment_provider_check
    check (payment_provider in ('wompi_simulado', 'historico', 'wompi'));

update public.products
set is_published = false
where is_published and price < 3.50;

drop policy if exists "Anyone can read products" on public.products;

create or replace function public.validate_product_pricing()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_min_rescue_price constant numeric := 3.50;
  v_pricing_changed boolean;
begin
  if tg_op = 'INSERT' then
    v_pricing_changed := true;
  else
    v_pricing_changed :=
      new.price is distinct from old.price
      or new.normal_price is distinct from old.normal_price
      or new.is_published is distinct from old.is_published;
  end if;

  if v_pricing_changed and new.is_published then
    if new.price < v_min_rescue_price then
      raise exception using message = 'El precio de rescate debe ser de $3.50 o más.', errcode = '23514';
    end if;
    if new.normal_price is null or new.normal_price <= new.price then
      raise exception using message = 'El precio normal debe ser mayor que el precio de rescate.', errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.validate_product_pricing() from public, anon, authenticated;
drop trigger if exists validate_product_pricing on public.products;
create trigger validate_product_pricing
  before insert or update on public.products
  for each row execute function public.validate_product_pricing();

create or replace function public.get_nokory_pricing(p_rescue_price numeric)
returns table (
  commission_per_unit numeric,
  tax_per_unit numeric,
  client_price numeric
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_commission_per_unit constant numeric := 0.75;
  v_vat_rate constant numeric := 0.00;
  v_vat_treatment constant text := 'pendiente';
  v_tax_per_unit numeric;
begin
  if p_rescue_price is null or p_rescue_price <= 0 then
    raise exception using message = 'El precio de rescate debe ser mayor que cero.', errcode = '22023';
  end if;

  -- Definir la tasa y el tratamiento del IVA cuando se confirme el criterio fiscal.
  v_tax_per_unit := case
    when v_vat_treatment = 'adicional' then round(v_commission_per_unit * v_vat_rate, 2)
    else 0
  end;

  return query
  select
    v_commission_per_unit,
    v_tax_per_unit,
    round(p_rescue_price + v_commission_per_unit + v_tax_per_unit, 2);
end;
$$;

revoke all on function public.get_nokory_pricing(numeric) from public, anon, authenticated;

drop function if exists public.quote_client_price(numeric);
create function public.quote_client_price(
  p_rescue_price numeric,
  p_normal_price numeric
)
returns table (
  client_price numeric,
  discount_percent integer,
  saved_amount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client_price numeric;
  v_saved_amount numeric := 0;
  v_discount_percent integer := 0;
begin
  if auth.uid() is null or not exists (
    select 1
    from public.businesses as business
    where business.owner_id = auth.uid()
      and business.status = 'approved'
      and business.is_approved
  ) then
    raise exception using message = 'Solo un negocio aprobado puede consultar el precio final.', errcode = '42501';
  end if;

  select pricing.client_price
  into v_client_price
  from public.get_nokory_pricing(p_rescue_price) as pricing;
  if p_normal_price is not null and p_normal_price > 0 then
    v_saved_amount := greatest(0, round(p_normal_price - v_client_price, 2));
    if v_saved_amount > 0 then
      v_discount_percent := round(v_saved_amount / p_normal_price * 100)::integer;
    end if;
  end if;

  return query select v_client_price, v_discount_percent, v_saved_amount;
end;
$$;

revoke all on function public.quote_client_price(numeric, numeric) from public, anon;
grant execute on function public.quote_client_price(numeric, numeric) to authenticated;

create or replace function public.get_reservation_quote(
  p_product_id uuid,
  p_packs integer
)
returns table (
  unit_price numeric,
  total_paid numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_rescue_price numeric;
  v_unit_price numeric;
begin
  if v_user_id is null then
    raise exception using message = 'Inicia sesión para consultar el total de la reserva.', errcode = '42501';
  end if;
  if p_packs is null or p_packs < 1 then
    raise exception using message = 'La cantidad debe ser de al menos una unidad.', errcode = '22023';
  end if;
  if exists (
    select 1
    from public.products as product
    join public.businesses as business on business.id = product.business_id
    where product.id = p_product_id
      and business.owner_id = v_user_id
  ) then
    raise exception using message = 'No puedes reservar productos de tu propio negocio.', errcode = '42501';
  end if;

  select product.price
  into v_rescue_price
  from public.products as product
  join public.businesses as business
    on business.id = product.business_id
   and business.owner_id = product.seller_id
   and business.status = 'approved'
   and business.is_approved
  where product.id = p_product_id
    and product.is_published
    and product.quantity >= p_packs;

  if not found then
    raise exception using message = 'Este producto ya no tiene suficientes unidades disponibles.', errcode = 'P0001';
  end if;

  select pricing.client_price
  into v_unit_price
  from public.get_nokory_pricing(v_rescue_price) as pricing;

  return query
  select v_unit_price, round(v_unit_price * p_packs, 2);
end;
$$;

revoke all on function public.get_reservation_quote(uuid, integer) from public, anon;
grant execute on function public.get_reservation_quote(uuid, integer) to authenticated;

create or replace function public.get_client_product(p_product_id uuid)
returns table (
  id uuid,
  seller_id uuid,
  business_id uuid,
  name text,
  description text,
  category text,
  price numeric,
  quantity integer,
  pickup_start text,
  pickup_end text,
  seller_name text,
  image_url text,
  is_published boolean,
  created_at timestamptz,
  business_name text,
  business_address text,
  business_latitude double precision,
  business_longitude double precision,
  business_avatar_url text,
  business_photo_url text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para consultar esta oferta.', errcode = '42501';
  end if;

  return query
  select
    product.id,
    product.seller_id,
    product.business_id,
    product.name,
    product.description,
    product.category,
    pricing.client_price,
    product.quantity,
    product.pickup_start,
    product.pickup_end,
    business.name,
    product.image_url,
    product.is_published,
    product.created_at,
    business.name,
    business.address,
    business.latitude,
    business.longitude,
    business.avatar_url,
    business.photo_url
  from public.products as product
  join public.businesses as business
    on business.id = product.business_id
   and business.owner_id = product.seller_id
   and business.status = 'approved'
   and business.is_approved
  cross join lateral public.get_nokory_pricing(product.price) as pricing
  where product.id = p_product_id
    and product.is_published;
end;
$$;

revoke all on function public.get_client_product(uuid) from public, anon;
grant execute on function public.get_client_product(uuid) to authenticated;

create or replace function public.get_nearby_products(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 3
)
returns table (
  id uuid,
  seller_id uuid,
  business_id uuid,
  name text,
  description text,
  category text,
  price numeric,
  quantity integer,
  pickup_start text,
  pickup_end text,
  seller_name text,
  image_url text,
  is_published boolean,
  created_at timestamptz,
  business_name text,
  business_address text,
  business_latitude double precision,
  business_longitude double precision,
  business_avatar_url text,
  distance_km double precision
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception using message = 'Inicia sesión para consultar ofertas cercanas.', errcode = '42501';
  end if;
  if p_lat is null or p_lat not between -90 and 90
    or p_lng is null or p_lng not between -180 and 180 then
    raise exception using message = 'La ubicación recibida no es válida.', errcode = '22023';
  end if;
  if p_radius_km is null or p_radius_km not in (2, 3, 5) then
    raise exception using message = 'El radio debe ser de 2, 3 o 5 kilómetros.', errcode = '22023';
  end if;

  return query
  select
    product.id,
    product.seller_id,
    product.business_id,
    product.name,
    product.description,
    product.category,
    pricing.client_price,
    product.quantity,
    product.pickup_start,
    product.pickup_end,
    business.name,
    product.image_url,
    product.is_published,
    product.created_at,
    business.name,
    business.address,
    business.latitude,
    business.longitude,
    coalesce(business.avatar_url, business.photo_url),
    location.distance_km
  from public.products as product
  join public.businesses as business
    on business.id = product.business_id
   and business.owner_id = product.seller_id
   and business.status = 'approved'
   and business.is_approved
  cross join lateral public.get_nokory_pricing(product.price) as pricing
  cross join lateral (
    select 6371 * 2 * asin(sqrt(least(
      1.0,
      greatest(
        0.0,
        power(sin(radians(business.latitude - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(business.latitude))
        * power(sin(radians(business.longitude - p_lng) / 2), 2)
      )
    ))) as distance_km
  ) as location
  where product.is_published
    and product.quantity > 0
    and nullif(trim(business.address), '') is not null
    and business.latitude is not null
    and business.longitude is not null
    and location.distance_km <= p_radius_km
  order by location.distance_km asc, product.created_at desc;
end;
$$;

revoke all on function public.get_nearby_products(double precision, double precision, double precision) from public, anon;
grant execute on function public.get_nearby_products(double precision, double precision, double precision) to authenticated;

drop function if exists public.reserve_product(uuid, text, integer, text);
create function public.reserve_product(
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
  commission_amount numeric,
  total_paid numeric,
  payment_status text,
  payment_provider text,
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
  v_unit_price numeric;
  v_unit_commission numeric;
  v_commission_amount numeric;
  v_total_paid numeric;
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

  if exists (
    select 1
    from public.products as product
    left join public.businesses as business on business.id = product.business_id
    where product.id = p_product_id
      and (product.seller_id = v_user_id or business.owner_id = v_user_id)
  ) then
    raise exception using message = 'No puedes reservar productos de tu propio negocio.', errcode = '42501';
  end if;

  update public.products as product
  set quantity = product.quantity - p_packs
  where product.id = p_product_id
    and product.is_published = true
    and product.quantity >= p_packs
    and exists (
      select 1
      from public.businesses as business
      where business.id = product.business_id
        and business.owner_id = product.seller_id
        and business.status = 'approved'
        and business.is_approved
    )
  returning product.* into v_product;

  if not found then
    if exists (
      select 1
      from public.products as product
      join public.businesses as business on business.id = product.business_id
      where product.id = p_product_id
        and product.is_published = true
        and product.quantity > 0
        and business.status = 'approved'
        and business.is_approved
    ) then
      raise exception using message = 'Ya no hay suficientes unidades disponibles. Actualiza la oferta e inténtalo otra vez.', errcode = 'P0001';
    end if;
    raise exception using message = 'Este producto ya no está disponible.', errcode = 'P0001';
  end if;

  select pricing.commission_per_unit, pricing.client_price
  into v_unit_commission, v_unit_price
  from public.get_nokory_pricing(v_product.price) as pricing;

  v_commission_amount := round(v_unit_commission * p_packs, 2);
  v_total_paid := round(v_unit_price * p_packs, 2);

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
    commission_amount,
    total_paid,
    payment_status,
    payment_provider,
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
    v_total_paid,
    v_commission_amount,
    v_total_paid,
    'pagada_simulada',
    'wompi_simulado',
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
    v_reservation.commission_amount,
    v_reservation.total_paid,
    v_reservation.payment_status,
    v_reservation.payment_provider,
    v_reservation.pickup_start,
    v_reservation.pickup_end,
    v_reservation.status,
    v_reservation.created_at,
    v_product.quantity;
end;
$$;

revoke all on function public.reserve_product(uuid, text, integer, text) from public, anon;
grant execute on function public.reserve_product(uuid, text, integer, text) to authenticated;

notify pgrst, 'reload schema';
commit;
