begin;

alter table public.businesses
  add column if not exists phone text,
  add column if not exists email text,
  add column if not exists description text,
  add column if not exists photo_url text,
  add column if not exists is_approved boolean not null default false;

update public.businesses
set is_approved = (status = 'approved')
where is_approved is distinct from (status = 'approved');

drop policy if exists "Approved businesses are visible to clients" on public.businesses;
create policy "Approved businesses are visible to clients"
  on public.businesses
  for select
  to anon, authenticated
  using (status = 'approved' and is_approved);

grant select (id, owner_id, status, is_approved) on public.businesses to anon;

drop policy if exists "Owners can update their approved business avatar" on public.businesses;
create policy "Owners can update their approved business avatar"
  on public.businesses
  for update
  to authenticated
  using ((select auth.uid()) = owner_id and status = 'approved' and is_approved)
  with check ((select auth.uid()) = owner_id and status = 'approved' and is_approved);

create table if not exists public.business_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  manager_name text not null check (char_length(btrim(manager_name)) between 2 and 120),
  business_name text not null check (char_length(btrim(business_name)) between 2 and 120),
  business_email text not null check (
    char_length(business_email) <= 254
    and business_email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+[.][A-Za-z]{2,}$'
  ),
  business_phone text not null check (business_phone ~ '^[0-9]{8}$'),
  address text not null check (char_length(btrim(address)) between 5 and 300),
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  description text not null check (char_length(btrim(description)) between 10 and 2000),
  photo_url text not null check (
    photo_url like (user_id::text || '/%')
    and char_length(photo_url) <= 500
  ),
  status text not null default 'pendiente'
    check (status in ('pendiente', 'aprobada', 'rechazada')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  check (
    status <> 'rechazada'
    or (rejection_reason is not null and char_length(btrim(rejection_reason)) between 2 and 1000)
  )
);

create index if not exists business_requests_user_created_at_idx
  on public.business_requests (user_id, created_at desc);
create unique index if not exists business_requests_one_pending_per_user_idx
  on public.business_requests (user_id)
  where status = 'pendiente';

alter table public.business_requests enable row level security;
revoke all on public.business_requests from public, anon, authenticated;
grant select on public.business_requests to authenticated;
grant insert (user_id, manager_name, business_name, business_email, business_phone, address, latitude, longitude, description, photo_url, status)
  on public.business_requests to authenticated;

drop policy if exists "Users can read their own business requests" on public.business_requests;
create policy "Users can read their own business requests"
  on public.business_requests
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can submit pending business requests" on public.business_requests;
create policy "Users can submit pending business requests"
  on public.business_requests
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and status = 'pendiente');

create or replace function public.prevent_duplicate_business_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.business_requests as request
    where request.user_id = new.user_id
  ) or exists (
    select 1
    from public.businesses as business
    where business.owner_id = new.user_id
  ) then
    raise exception using message = 'Ya existe una solicitud o un negocio asociado a esta cuenta.', errcode = '23505';
  end if;
  return new;
end;
$$;

revoke all on function public.prevent_duplicate_business_request() from public, anon, authenticated;
drop trigger if exists prevent_duplicate_business_request on public.business_requests;
create trigger prevent_duplicate_business_request
  before insert on public.business_requests
  for each row execute function public.prevent_duplicate_business_request();

create or replace function public.apply_business_request_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_id uuid;
begin
  if new.status is distinct from old.status then
    if old.status <> 'pendiente' then
      raise exception using message = 'Una solicitud revisada no puede volver a estado pendiente.', errcode = '23514';
    end if;
    new.reviewed_at := now();

    if new.status = 'aprobada' then
      select business.id
      into v_business_id
      from public.businesses as business
      where business.owner_id = new.user_id
      order by business.created_at asc, business.id asc
      limit 1
      for update;

      if v_business_id is null then
        insert into public.businesses (
          owner_id,
          name,
          address,
          latitude,
          longitude,
          phone,
          email,
          description,
          photo_url,
          avatar_url,
          status,
          is_approved
        )
        values (
          new.user_id,
          btrim(new.business_name),
          btrim(new.address),
          new.latitude,
          new.longitude,
          new.business_phone,
          lower(btrim(new.business_email)),
          btrim(new.description),
          new.photo_url,
          null,
          'approved',
          true
        )
        returning id into v_business_id;
      else
        update public.businesses
        set name = btrim(new.business_name),
            address = btrim(new.address),
            latitude = new.latitude,
            longitude = new.longitude,
            phone = new.business_phone,
            email = lower(btrim(new.business_email)),
            description = btrim(new.description),
            photo_url = new.photo_url,
            avatar_url = null,
            status = 'approved',
            is_approved = true
        where id = v_business_id;
      end if;

      update public.products
      set business_id = v_business_id,
          seller_name = btrim(new.business_name)
      where seller_id = new.user_id;
    elsif new.status = 'rechazada' then
      new.rejection_reason := nullif(btrim(new.rejection_reason), '');
      if new.rejection_reason is null then
        raise exception using message = 'Indica el motivo del rechazo.', errcode = '22023';
      end if;
    else
      raise exception using message = 'El estado de revisión no es válido.', errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.apply_business_request_review() from public, anon, authenticated;
drop trigger if exists apply_business_request_review on public.business_requests;
create trigger apply_business_request_review
  before update of status, rejection_reason on public.business_requests
  for each row execute function public.apply_business_request_review();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('business-photos', 'business-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

drop policy if exists "Users can read their own business photos" on storage.objects;
create policy "Users can read their own business photos"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'business-photos'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (
        select 1
        from public.businesses as business
        where business.photo_url = storage.objects.name
          and business.status = 'approved'
          and business.is_approved
      )
    )
  );

drop policy if exists "Users can upload their own business photos" on storage.objects;
create policy "Users can upload their own business photos"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'business-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can delete their own business photos" on storage.objects;
create policy "Users can delete their own business photos"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'business-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

alter table public.products
  add column if not exists business_id uuid references public.businesses (id) on delete restrict;

with owner_businesses as (
  select distinct on (business.owner_id)
    business.owner_id,
    business.id,
    business.name
  from public.businesses as business
  order by business.owner_id, business.is_approved desc, business.created_at asc, business.id asc
)
update public.products as product
set business_id = business.id,
    seller_name = business.name
from owner_businesses as business
where product.seller_id = business.owner_id;

create index if not exists products_business_id_idx
  on public.products (business_id);

drop policy if exists "Anyone can read products" on public.products;
create policy "Anyone can read products"
  on public.products
  for select
  to anon, authenticated
  using (
    is_published = true
    and exists (
      select 1
      from public.businesses as business
      where business.id = products.business_id
        and business.owner_id = products.seller_id
        and business.status = 'approved'
        and business.is_approved
    )
  );

drop policy if exists "Sellers can read products of their approved business" on public.products;
create policy "Sellers can read products of their approved business"
  on public.products
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.businesses as business
      where business.id = products.business_id
        and business.owner_id = (select auth.uid())
        and business.status = 'approved'
        and business.is_approved
    )
  );

drop policy if exists "Sellers can insert their own products" on public.products;
create policy "Sellers can insert their own products"
  on public.products
  for insert
  to authenticated
  with check (
    seller_id = (select auth.uid())
    and exists (
      select 1
      from public.businesses as business
      where business.id = products.business_id
        and business.owner_id = (select auth.uid())
        and business.status = 'approved'
        and business.is_approved
    )
  );

drop policy if exists "Sellers can update their own products" on public.products;
create policy "Sellers can update their own products"
  on public.products
  for update
  to authenticated
  using (
    seller_id = (select auth.uid())
    and exists (
      select 1
      from public.businesses as business
      where business.id = products.business_id
        and business.owner_id = (select auth.uid())
        and business.status = 'approved'
        and business.is_approved
    )
  )
  with check (
    seller_id = (select auth.uid())
    and exists (
      select 1
      from public.businesses as business
      where business.id = products.business_id
        and business.owner_id = (select auth.uid())
        and business.status = 'approved'
        and business.is_approved
    )
  );

drop policy if exists "Sellers can read their own reservations" on public.reservations;
create policy "Sellers can read their own reservations"
  on public.reservations
  for select
  to authenticated
  using (
    seller_id = (select auth.uid())
    and exists (
      select 1
      from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
        and business.is_approved
    )
  );

drop policy if exists "Sellers can update their own reservation status" on public.reservations;
create policy "Sellers can update their own reservation status"
  on public.reservations
  for update
  to authenticated
  using (
    seller_id = (select auth.uid())
    and exists (
      select 1
      from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
        and business.is_approved
    )
  )
  with check (
    seller_id = (select auth.uid())
    and exists (
      select 1
      from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
        and business.is_approved
    )
  );

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
  if v_user_id is null or not exists (
    select 1
    from public.businesses
    where owner_id = v_user_id
      and status = 'approved'
      and is_approved
  ) then
    raise exception using message = 'Solo un negocio aprobado puede consultar sus reservas.', errcode = '42501';
  end if;

  return query
  select reservation.*
  from public.reservations as reservation
  where reservation.seller_id = v_user_id
     or exists (
       select 1
       from public.products as product
       where product.id = reservation.product_id
         and product.seller_id = v_user_id
         and product.business_id in (
           select business.id
           from public.businesses as business
           where business.owner_id = v_user_id
             and business.status = 'approved'
             and business.is_approved
         )
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
  if v_user_id is null or not exists (
    select 1
    from public.businesses
    where owner_id = v_user_id
      and status = 'approved'
      and is_approved
  ) then
    raise exception using message = 'Solo un negocio aprobado puede confirmar la recogida de una reserva.', errcode = '42501';
  end if;

  select reservation.* into v_res
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and (
      reservation.seller_id = v_user_id
      or exists (
        select 1
        from public.products as product
        where product.id = reservation.product_id
          and product.seller_id = v_user_id
          and product.business_id in (
            select business.id
            from public.businesses as business
            where business.owner_id = v_user_id
              and business.status = 'approved'
              and business.is_approved
          )
      )
    )
  for update;

  if not found then
    raise exception using message = 'No se encontró una reserva de este negocio.', errcode = 'P0002';
  end if;
  if v_res.status <> 'pending' then
    raise exception using message = 'La reserva ya fue procesada.', errcode = 'P0003';
  end if;

  update public.reservations
  set status = 'delivered'
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
  if v_user_id is null or not exists (
    select 1
    from public.businesses
    where owner_id = v_user_id
      and status = 'approved'
      and is_approved
  ) then
    raise exception using message = 'Solo un negocio aprobado puede actualizar sus reservas.', errcode = '42501';
  end if;

  select reservation.* into v_res
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and (
      reservation.seller_id = v_user_id
      or exists (
        select 1
        from public.products as product
        where product.id = reservation.product_id
          and product.seller_id = v_user_id
          and product.business_id in (
            select business.id
            from public.businesses as business
            where business.owner_id = v_user_id
              and business.status = 'approved'
              and business.is_approved
          )
      )
    )
  for update;

  if not found then
    raise exception using message = 'No se encontró una reserva de este negocio.', errcode = 'P0002';
  end if;
  if v_res.status <> 'pending' then
    raise exception using message = 'Solo se puede devolver al inventario una reserva pendiente.', errcode = 'P0003';
  end if;

  update public.products
  set quantity = quantity + v_res.packs
  where id = v_res.product_id
    and seller_id = v_user_id
    and business_id in (
      select business.id
      from public.businesses as business
      where business.owner_id = v_user_id
        and business.status = 'approved'
        and business.is_approved
    );
  if not found then
    raise exception using message = 'No se pudo devolver el pack al inventario.', errcode = 'P0001';
  end if;

  update public.reservations
  set status = 'not_collected'
  where id = v_res.id and status = 'pending';
  if not found then
    raise exception using message = 'La reserva ya fue procesada.', errcode = 'P0003';
  end if;
  return true;
end;
$$;

revoke all on function public.mark_reservation_not_collected(uuid) from public, anon;
grant execute on function public.mark_reservation_not_collected(uuid) to authenticated;

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

drop function if exists public.get_nearby_products(double precision, double precision, double precision);
create function public.get_nearby_products(
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
    product.price,
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
  seller_address text,
  seller_latitude double precision,
  seller_longitude double precision,
  customer_name text,
  packs integer,
  total_price numeric,
  pickup_start text,
  pickup_end text,
  status text,
  created_at timestamptz
)
language plpgsql
stable
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
    reservation.id,
    reservation.ticket_code,
    reservation.seller_id,
    coalesce(business.name, product.seller_name, 'Comercio local'),
    reservation.product_id,
    reservation.product_name,
    coalesce(product.category, 'Comida'),
    coalesce(product.description, ''),
    product.image_url,
    business.address,
    business.latitude,
    business.longitude,
    reservation.customer_name,
    reservation.packs,
    reservation.total_price,
    reservation.pickup_start,
    reservation.pickup_end,
    reservation.status,
    reservation.created_at
  from public.reservations as reservation
  left join public.products as product on product.id = reservation.product_id
  left join public.businesses as business
    on business.id = product.business_id
   and business.status = 'approved'
   and business.is_approved
  where reservation.customer_id = v_user_id
  order by reservation.created_at desc;
end;
$$;

revoke all on function public.get_client_reservations() from public, anon;
grant execute on function public.get_client_reservations() to authenticated;

notify pgrst, 'reload schema';
commit;
