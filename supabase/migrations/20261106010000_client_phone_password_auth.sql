-- Use password-based phone accounts without requiring SMS phone confirmation.
begin;

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

create or replace function public.reserve_product(
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

  select auth_user.phone
  into v_customer_phone
  from auth.users as auth_user
  where auth_user.id = v_user_id;

  if v_customer_phone is null or v_customer_phone !~ '^[+][1-9][0-9]{7,14}$' then
    raise exception using message = 'Tu cuenta no tiene un teléfono válido en formato internacional E.164.', errcode = '22023';
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

notify pgrst, 'reload schema';
commit;
