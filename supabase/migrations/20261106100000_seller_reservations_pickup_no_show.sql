-- Keep seller reservation reads and pickup transitions tied to the signed-in owner.
-- A no-show transition returns the reserved packs exactly once in the same transaction.
begin;

alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pending', 'delivered', 'cancelled', 'not_collected'));

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
       select 1
       from public.products as product
       where product.id = reservation.product_id
         and product.seller_id = v_user_id
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

  select reservation.*
  into v_res
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and (
      reservation.seller_id = v_user_id
      or exists (
        select 1
        from public.products as product
        where product.id = reservation.product_id
          and product.seller_id = v_user_id
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
  if v_user_id is null then
    raise exception using message = 'Inicia sesión con tu cuenta de vendedor para actualizar la reserva.', errcode = '42501';
  end if;

  select reservation.*
  into v_res
  from public.reservations as reservation
  where reservation.id = p_reservation_id
    and (
      reservation.seller_id = v_user_id
      or exists (
        select 1
        from public.products as product
        where product.id = reservation.product_id
          and product.seller_id = v_user_id
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
