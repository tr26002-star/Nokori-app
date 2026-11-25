begin;

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists businesses_approved_owner_idx
  on public.businesses (owner_id)
  where status = 'approved';

alter table public.businesses enable row level security;
revoke all on public.businesses from public, anon, authenticated;
grant select on public.businesses to authenticated;

drop policy if exists "Owners can read their businesses" on public.businesses;
create policy "Owners can read their businesses"
  on public.businesses
  for select
  to authenticated
  using ((select auth.uid()) = owner_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
on conflict (id) do update
set public = false,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

drop policy if exists "Users can read their own avatar" on storage.objects;
create policy "Users can read their own avatar"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "Sellers can insert their own products" on public.products;
create policy "Sellers can insert their own products"
  on public.products
  for insert
  to authenticated
  with check (
    (select auth.uid()) = seller_id
    and exists (
      select 1 from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
    )
  );

drop policy if exists "Sellers can update their own products" on public.products;
create policy "Sellers can update their own products"
  on public.products
  for update
  to authenticated
  using (
    (select auth.uid()) = seller_id
    and exists (
      select 1 from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
    )
  )
  with check (
    (select auth.uid()) = seller_id
    and exists (
      select 1 from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
    )
  );

drop policy if exists "Sellers can read their own reservations" on public.reservations;
create policy "Sellers can read their own reservations"
  on public.reservations
  for select
  to authenticated
  using (
    (select auth.uid()) = seller_id
    and exists (
      select 1 from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
    )
  );

drop policy if exists "Sellers can update their own reservation status" on public.reservations;
create policy "Sellers can update their own reservation status"
  on public.reservations
  for update
  to authenticated
  using (
    (select auth.uid()) = seller_id
    and exists (
      select 1 from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
    )
  )
  with check (
    (select auth.uid()) = seller_id
    and exists (
      select 1 from public.businesses as business
      where business.owner_id = (select auth.uid())
        and business.status = 'approved'
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
    select 1 from public.businesses
    where owner_id = v_user_id and status = 'approved'
  ) then
    raise exception using message = 'Solo un negocio aprobado puede consultar sus reservas.', errcode = '42501';
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
  if v_user_id is null or not exists (
    select 1 from public.businesses
    where owner_id = v_user_id and status = 'approved'
  ) then
    raise exception using message = 'Solo un negocio aprobado puede confirmar la recogida de una reserva.', errcode = '42501';
  end if;

  select reservation.* into v_res
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and (
      reservation.seller_id = v_user_id
      or exists (
        select 1 from public.products as product
        where product.id = reservation.product_id and product.seller_id = v_user_id
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
    select 1 from public.businesses
    where owner_id = v_user_id and status = 'approved'
  ) then
    raise exception using message = 'Solo un negocio aprobado puede actualizar sus reservas.', errcode = '42501';
  end if;

  select reservation.* into v_res
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and (
      reservation.seller_id = v_user_id
      or exists (
        select 1 from public.products as product
        where product.id = reservation.product_id and product.seller_id = v_user_id
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
  where id = v_res.product_id;
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

notify pgrst, 'reload schema';
commit;
