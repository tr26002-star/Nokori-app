-- Reinstala la firma consumida por la aplicación para corregir instalaciones
-- donde la migración de cancelación no se aplicó o PostgREST conserva otra firma.
alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pending', 'delivered', 'cancelled'));

drop function if exists public.cancel_reservation(uuid, text);

create function public.cancel_reservation(
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
  v_clean_code text := replace(trim(coalesce(p_ticket_code, '')), '#', '');
begin
  select *
  into v_res
  from public.reservations
  where id = p_reservation_id
    and replace(ticket_code, '#', '') = v_clean_code
  for update;

  if not found then
    raise exception using
      message = 'No se encontró la reserva o el código de ticket no coincide.',
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

revoke all on function public.cancel_reservation(uuid, text) from public;
grant execute on function public.cancel_reservation(uuid, text) to anon, authenticated;

notify pgrst, 'reload schema';
