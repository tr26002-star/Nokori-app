import { getSupabaseClient, hasSupabaseConfig } from './supabase';
import type { ClientReservationRow, ReservationBookingRow, ReservationRow } from './supabase.types';

export type ReservationStatus = 'pending' | 'delivered' | 'cancelled' | 'not_collected';

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
  status: ReservationStatus;
  createdAt: string;
};

export type ClientReservation = {
  id: string;
  ticketCode: string;
  sellerId: string;
  sellerName: string;
  productId: string;
  productName: string;
  category: string;
  description: string;
  imageUrl: string | null;
  customerName: string;
  packs: number;
  totalPrice: number;
  pickupStart: string;
  pickupEnd: string;
  pickupTime: string;
  status: ReservationStatus;
  createdAt: string;
};

export type ReservationConfirmation = Reservation & {
  remainingQuantity: number;
};

type ReservationDataRow = Omit<ReservationRow, 'customer_id'>;

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Configura Supabase para guardar y sincronizar las reservas.');
  }
  return getSupabaseClient();
}

function toReservation(row: ReservationDataRow): Reservation {
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

function toClientReservation(row: ClientReservationRow): ClientReservation {
  const totalPrice = Number(row.total_price);
  return {
    id: row.id,
    ticketCode: row.ticket_code,
    sellerId: row.seller_id,
    sellerName: row.seller_name || 'Comercio local',
    productId: row.product_id,
    productName: row.product_name,
    category: row.product_category || 'Comida',
    description: row.product_description || '',
    imageUrl: row.product_image_url || null,
    customerName: row.customer_name,
    packs: row.packs,
    totalPrice: Number.isFinite(totalPrice) ? totalPrice : 0,
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
  packs: number,
  customerPhone: string,
): Promise<ReservationConfirmation> {
  const { data, error } = await requireSupabase().rpc('reserve_product', {
    p_product_id: productId,
    p_customer_name: customerName.trim(),
    p_packs: packs,
    p_customer_phone: customerPhone,
  });
  if (error) throw new Error(error.message);
  const booking: ReservationBookingRow | undefined = data?.[0];
  if (!booking) throw new Error('No recibimos la confirmación de la reserva. Actualiza la oferta e inténtalo otra vez.');

  const { remaining_quantity: remainingQuantity, ...row } = booking;
  return { ...toReservation(row), remainingQuantity };
}

export async function getClientReservations(): Promise<ClientReservation[]> {
  const supabase = requireSupabase();
  const { data: initialSession, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = initialSession.session?.user.id;
  if (!userId) throw new Error('Inicia sesión con tu cuenta de cliente para ver tus reservas.');

  const { data, error } = await supabase.rpc('get_client_reservations');
  if (error) throw new Error(error.message);

  const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession();
  if (currentSessionError) throw currentSessionError;
  if (currentSession.session?.user.id !== userId) {
    throw new Error('La sesión cambió. Vuelve a cargar tus reservas.');
  }

  return (data || []).map(toClientReservation);
}

export async function getSellerReservations(): Promise<Reservation[]> {
  const supabase = requireSupabase();
  const { data: initialSession, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = initialSession.session?.user.id;
  if (!userId) throw new Error('Inicia sesión con tu cuenta de vendedor para ver tus reservas.');

  const { data, error } = await supabase.rpc('get_seller_reservations');
  if (error) throw error;
  const { data: currentSession, error: currentSessionError } = await supabase.auth.getSession();
  if (currentSessionError) throw currentSessionError;
  if (currentSession.session?.user.id !== userId) {
    throw new Error('La sesión cambió. Vuelve a cargar las reservas del negocio.');
  }
  return (data || []).map(toReservation);
}

export async function markReservationAsDelivered(id: string): Promise<Reservation[]> {
  const { data, error } = await requireSupabase().rpc('mark_reservation_delivered', {
    p_reservation_id: id,
  });
  if (error) throw new Error(error.message);
  if (data !== true) throw new Error('El servidor no confirmó la recogida del pack.');
  return getSellerReservations();
}

export async function markReservationAsNotCollected(id: string): Promise<Reservation[]> {
  const { data, error } = await requireSupabase().rpc('mark_reservation_not_collected', {
    p_reservation_id: id,
  });
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Error('El servidor no confirmó la devolución de los packs al inventario.');
  }
  return getSellerReservations();
}

export async function cancelReservation(reservationId: string, ticketCode: string): Promise<void> {
  const cleanCode = ticketCode.trim().replace(/^#/, '');
  const { data, error } = await requireSupabase().rpc('cancel_reservation', {
    p_reservation_id: reservationId,
    p_ticket_code: cleanCode,
  });
  if (error) throw new Error(error.message);
  if (data !== true) {
    throw new Error('El servidor no confirmó la cancelación de la reserva.');
  }
}
