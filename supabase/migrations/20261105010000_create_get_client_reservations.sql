-- ==============================================================================
-- Migración: Función segura para consulta de reservas de clientes
-- Fecha: 2026-11-05
-- Descripción:
--   Permite a la aplicación móvil recuperar de forma segura las reservas del
--   cliente (activas e historial) con todos los datos necesarios para la tarjeta
--   (imagen, categoría, descripción, comercio, cantidades, precio, horario, etc.).
--   No expone reservas de otros clientes si no se envían tokens/tickets o teléfono válido.
-- ==============================================================================

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
  -- Guardia de seguridad: Si no se proveen tickets ni un teléfono de al menos 8 dígitos,
  -- la función no retorna ningún registro (evita enumeración de reservas ajenas).
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
    -- Búsqueda por tickets en posesión del cliente
    (v_has_tickets and (
      r.ticket_code = any(p_ticket_codes)
      or replace(r.ticket_code, '#', '') = any(
        select replace(t, '#', '') from unnest(p_ticket_codes) as t
      )
    ))
    or
    -- Búsqueda por los últimos 8 dígitos del teléfono salvadoreño del cliente
    (char_length(v_clean_phone) >= 8 and
     right(regexp_replace(r.customer_phone, '[^0-9]', '', 'g'), 8) = right(v_clean_phone, 8))
  )
  order by r.created_at desc;
end;
$$;

revoke all on function public.get_client_reservations(text[], text) from public;
grant execute on function public.get_client_reservations(text[], text) to anon, authenticated;

notify pgrst, 'reload schema';

