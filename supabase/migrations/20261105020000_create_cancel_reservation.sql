-- ==============================================================================
-- Migración: Habilitar cancelación segura de reservas activas
-- Fecha: 2026-11-05
-- Descripción:
--   1. Permite el estado 'cancelled' en la tabla public.reservations.
--   2. Define la función atómica public.cancel_reservation que:
--      - Valida que la reserva exista y que el ticket_code coincida.
--      - Valida que la reserva esté activa ('pending').
--      - Reintegra el stock de packs al producto (public.products.quantity).
--      - Actualiza el estado a 'cancelled'.
--   3. Concede permisos de ejecución a anon y authenticated.
--   4. Recarga el schema cache de PostgREST.
-- ==============================================================================

-- 1. Actualizar restricción de estado en public.reservations
alter table public.reservations
  drop constraint if exists reservations_status_check;

alter table public.reservations
  add constraint reservations_status_check
  check (status in ('pending', 'delivered', 'cancelled'));

-- 2. Función atómica para cancelar reserva
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
  -- Buscar la reserva que coincida con ID y ticket_code
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

  -- Reintegrar el stock de forma atómica a la tabla products
  update public.products
  set quantity = quantity + v_res.packs
  where id = v_res.product_id;

  -- Actualizar el estado de la reserva a 'cancelled'
  update public.reservations
  set status = 'cancelled'
  where id = v_res.id;

  return true;
end;
$$;

-- 3. Permisos de ejecución para anon y authenticated
revoke all on function public.cancel_reservation(uuid, text) from public;
grant execute on function public.cancel_reservation(uuid, text) to anon, authenticated;

-- 4. Recargar el schema cache de PostgREST
notify pgrst, 'reload schema';

