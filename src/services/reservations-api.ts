import { getSupabaseClient, hasSupabaseConfig } from './supabase';
import type { ReservationBookingRow, ReservationRow } from './supabase.types';

export type Reservation = {
  id: string;
  ticketCode: string;
  customerName: string;
  customerPhone: string;
  productId: string;
  productName: string;
  packs: number;
  totalPrice: number;
  pickupStart: string;
  pickupEnd: string;
  pickupTime: string;
  status: 'pending' | 'delivered';
  createdAt: string;
};

export type ReservationConfirmation = Reservation & {
  remainingQuantity: number;
};

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Configura Supabase para guardar y sincronizar las reservas.');
  }
  return getSupabaseClient();
}

function toReservation(row: ReservationRow): Reservation {
  const totalPrice = Number(row.total_price);
  if (!Number.isFinite(totalPrice)) {
    throw new Error('La base de datos devolvió un total de reserva no válido.');
  }
  return {
    id: row.id,
    ticketCode: row.ticket_code,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    productId: row.product_id,
    productName: row.product_name,
    packs: row.packs,
    totalPrice,
    pickupStart: row.pickup_start,
    pickupEnd: row.pickup_end,
    pickupTime: `${row.pickup_start} – ${row.pickup_end}`,
    status: row.status,
    createdAt: row.created_at,
  };
}

export async function reserveProduct(
  productId: string,
  customerName: string,
  customerPhone: string,
  packs: number,
): Promise<ReservationConfirmation> {
  const supabase = requireSupabase();
  const { data, error } = await supabase.rpc('reserve_product', {
    p_product_id: productId,
    p_customer_name: customerName.trim(),
    p_customer_phone: customerPhone.trim(),
    p_packs: packs,
  });
  if (error) throw new Error(error.message);
  const booking: ReservationBookingRow | undefined = data?.[0];
  if (!booking) throw new Error('No recibimos la confirmación de la reserva. Actualiza la oferta e inténtalo otra vez.');
  const { remaining_quantity: remainingQuantity, ...row } = booking;
  return { ...toReservation(row), remainingQuantity };
}

export async function getSellerReservations(): Promise<Reservation[]> {
  const supabase = requireSupabase();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  if (!userData.user) throw new Error('Inicia sesión con tu cuenta de vendedor para ver tus reservas.');

  const { data, error } = await supabase
    .from('reservations')
    .select('*')
    .eq('seller_id', userData.user.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(toReservation);
}

export async function markReservationAsDelivered(id: string): Promise<Reservation[]> {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from('reservations')
    .update({ status: 'delivered' })
    .eq('id', id)
    .eq('status', 'pending')
    .select('id')
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('La reserva ya fue actualizada o no pertenece a este negocio.');
  return getSellerReservations();
}
