begin;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
revoke all on public.profiles from public, anon, authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, avatar_url) on public.profiles to authenticated;

drop policy if exists "Users can read their own profile" on public.profiles;
create policy "Users can read their own profile"
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text := nullif(trim(new.raw_user_meta_data ->> 'full_name'), '');
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(v_full_name, nullif(split_part(coalesce(new.email, ''), '@', 1), ''), 'Usuario')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_profile_for_new_user() from public, anon, authenticated;

drop trigger if exists create_profile_after_auth_user_insert on auth.users;
create trigger create_profile_after_auth_user_insert
  after insert on auth.users
  for each row execute function public.create_profile_for_new_user();

insert into public.profiles (id, full_name)
select
  users.id,
  coalesce(
    nullif(trim(users.raw_user_meta_data ->> 'full_name'), ''),
    nullif(split_part(coalesce(users.email, ''), '@', 1), ''),
    'Usuario'
  )
from auth.users as users
on conflict (id) do nothing;

update public.profiles as profile
set avatar_url = users.raw_user_meta_data ->> 'avatar_path'
from auth.users as users
where profile.id = users.id
  and profile.avatar_url is null
  and users.raw_user_meta_data ->> 'avatar_path' like users.id::text || '/%';

create or replace function public.update_profile_timestamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.update_profile_timestamp() from public, anon, authenticated;

drop trigger if exists update_profile_timestamp on public.profiles;
create trigger update_profile_timestamp
  before update on public.profiles
  for each row execute function public.update_profile_timestamp();

alter table public.businesses
  add column if not exists address text,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists avatar_url text;

alter table public.businesses
  drop constraint if exists businesses_latitude_range_check;
alter table public.businesses
  add constraint businesses_latitude_range_check
  check (latitude is null or latitude between -90 and 90);

alter table public.businesses
  drop constraint if exists businesses_longitude_range_check;
alter table public.businesses
  add constraint businesses_longitude_range_check
  check (longitude is null or longitude between -180 and 180);

alter table public.businesses
  drop constraint if exists businesses_coordinate_pair_check;
alter table public.businesses
  add constraint businesses_coordinate_pair_check
  check ((latitude is null) = (longitude is null));

drop policy if exists "Approved businesses are visible to clients" on public.businesses;
create policy "Approved businesses are visible to clients"
  on public.businesses
  for select
  to authenticated
  using (status = 'approved');

drop policy if exists "Owners can update their approved business avatar" on public.businesses;
create policy "Owners can update their approved business avatar"
  on public.businesses
  for update
  to authenticated
  using ((select auth.uid()) = owner_id and status = 'approved')
  with check ((select auth.uid()) = owner_id and status = 'approved');

grant update (avatar_url) on public.businesses to authenticated;

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
where id = 'avatars';

drop policy if exists "Authenticated users can view avatars" on storage.objects;
create policy "Authenticated users can view avatars"
  on storage.objects
  for select
  to authenticated
  using (bucket_id = 'avatars');

drop function if exists public.get_nearby_products(double precision, double precision, double precision);
create function public.get_nearby_products(
  p_lat double precision,
  p_lng double precision,
  p_radius_km double precision default 3
)
returns table (
  id uuid,
  seller_id uuid,
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
    business.avatar_url,
    location.distance_km
  from public.products as product
  join public.businesses as business
    on business.owner_id = product.seller_id
   and business.status = 'approved'
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
    on business.owner_id = reservation.seller_id
   and business.status = 'approved'
  where reservation.customer_id = v_user_id
  order by reservation.created_at desc;
end;
$$;

revoke all on function public.get_client_reservations() from public, anon;
grant execute on function public.get_client_reservations() to authenticated;

notify pgrst, 'reload schema';
commit;
