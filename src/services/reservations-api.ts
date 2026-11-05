import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient, hasSupabaseConfig } from './supabase';
import type { ClientReservationRow, ReservationBookingRow, ReservationRow } from './supabase.types';

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
  status: 'pending' | 'delivered' | 'cancelled';
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
  status: 'pending' | 'delivered' | 'cancelled';
  createdAt: string;
};

export type ReservationConfirmation = Reservation & {
  remainingQuantity: number;
};

const CLIENT_TICKETS_KEY = '@nokori_client_ticket_codes';
const CLIENT_PROFILE_KEY = '@nokori_client_profile';
const CLIENT_CACHE_KEY = '@nokori_client_reservations_cache';

export async function getClientTicketCodes(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(CLIENT_TICKETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error leyendo ticket codes locales:', error);
    return [];
  }
}

export async function saveClientTicketCode(ticketCode: string): Promise<void> {
  try {
    const clean = ticketCode.trim();
    if (!clean) return;
    const current = await getClientTicketCodes();
    const normalized = clean.replace(/^#/, '');
    const alreadySaved = current.some((c) => c === clean || c.replace(/^#/, '') === normalized);
    if (!alreadySaved) {
      const next = [clean, ...current];
      await AsyncStorage.setItem(CLIENT_TICKETS_KEY, JSON.stringify(next));
    }
  } catch (error) {
    console.error('Error guardando ticket code:', error);
  }
}

export async function saveClientProfile(name: string, phone: string): Promise<void> {
  try {
    const payload = { name: name.trim(), phone: phone.trim() };
    await AsyncStorage.setItem(CLIENT_PROFILE_KEY, JSON.stringify(payload));
  } catch (error) {
    console.error('Error guardando perfil del cliente:', error);
  }
}

export async function getClientProfile(): Promise<{ name: string; phone: string } | null> {
  try {
    const raw = await AsyncStorage.getItem(CLIENT_PROFILE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === 'string' && typeof parsed.phone === 'string') {
      return parsed;
    }
    return null;
  } catch (error) {
    console.error('Error leyendo perfil de cliente:', error);
    return null;
  }
}

async function getCachedClientReservations(): Promise<ClientReservation[]> {
  try {
    const raw = await AsyncStorage.getItem(CLIENT_CACHE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error leyendo caché de reservas:', error);
    return [];
  }
}

async function setCachedClientReservations(items: ClientReservation[]): Promise<void> {
  try {
    await AsyncStorage.setItem(CLIENT_CACHE_KEY, JSON.stringify(items));
  } catch (error) {
    console.error('Error guardando caché de reservas:', error);
  }
}

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
  customerPhone: string,
  packs: number,
): Promise<ReservationConfirmation> {
  const supabase = requireSupabase();
  const trimmedName = customerName.trim();
  const trimmedPhone = customerPhone.trim();

  const { data, error } = await supabase.rpc('reserve_product', {
    p_product_id: productId,
    p_customer_name: trimmedName,
    p_customer_phone: trimmedPhone,
    p_packs: packs,
  });
  if (error) throw new Error(error.message);
  const booking: ReservationBookingRow | undefined = data?.[0];
  if (!booking) throw new Error('No recibimos la confirmación de la reserva. Actualiza la oferta e inténtalo otra vez.');

  // Guardar de forma inmediata el ticket y datos de contacto en el almacenamiento local
  await saveClientTicketCode(booking.ticket_code);
  await saveClientProfile(trimmedName, trimmedPhone);

  const { remaining_quantity: remainingQuantity, ...row } = booking;
  return { ...toReservation(row), remainingQuantity };
}

export async function getClientReservations(options?: { phone?: string }): Promise<ClientReservation[]> {
  const savedTickets = await getClientTicketCodes();
  const savedProfile = await getClientProfile();
  const rawPhone = options?.phone || savedProfile?.phone || '';
  const cleanPhone = rawPhone.replace(/\D/g, '');

  if (!hasSupabaseConfig()) {
    return getCachedClientReservations();
  }

  // Si no hay tickets guardados ni un teléfono de al menos 8 dígitos, retornamos la caché
  if (savedTickets.length === 0 && cleanPhone.length < 8) {
    return getCachedClientReservations();
  }

  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.rpc('get_client_reservations', {
      p_ticket_codes: savedTickets,
      p_customer_phone: cleanPhone,
    });

    if (error) {
      console.warn('Error en RPC get_client_reservations, usando caché:', error.message);
      return getCachedClientReservations();
    }

    const items = (data || []).map(toClientReservation);

    // Si encontramos reservas en Supabase asociadas al teléfono, guardamos sus tickets localmente también
    for (const item of items) {
      if (item.ticketCode) {
        await saveClientTicketCode(item.ticketCode);
      }
    }

    // Actualizar la caché local con los datos más recientes de Supabase
    await setCachedClientReservations(items);
    return items;
  } catch (err) {
    console.error('Error al consultar reservas del cliente:', err);
    return getCachedClientReservations();
  }
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

export async function cancelReservation(reservationId: string, ticketCode: string): Promise<void> {
  const cleanCode = ticketCode.trim().replace(/^#/, '');

  if (hasSupabaseConfig()) {
    const supabase = getSupabaseClient();
    const { error } = await supabase.rpc('cancel_reservation', {
      p_reservation_id: reservationId,
      p_ticket_code: cleanCode,
    });
    if (error) {
      throw new Error(error.message);
    }
  }

  const cached = await getCachedClientReservations();
  const nextCache = cached.map((r) =>
    r.id === reservationId ? { ...r, status: 'cancelled' as const } : r
  );
  await setCachedClientReservations(nextCache);
}
