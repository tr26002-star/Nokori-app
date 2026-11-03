import AsyncStorage from '@react-native-async-storage/async-storage';

export type Reservation = {
  id: string;
  ticketCode: string;
  customerName: string;
  customerPhone?: string;
  productName: string;
  packs: number;
  totalPrice: number;
  pickupTime: string;
  status: 'pending' | 'delivered';
  createdAt: string;
};

const STORAGE_KEY = '@nokori_seller_reservations';

/**
 * Obtiene las reservas del negocio almacenadas localmente.
 * Inicia completamente vacía (0 reservas) por defecto.
 */
export async function getSellerReservations(): Promise<Reservation[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    // Filtrar para asegurar que no queden datos viejos de demo
    if (Array.isArray(parsed)) {
      return parsed.filter((item: Reservation) => !item.id.startsWith('res-1') && !item.id.startsWith('res-2') && !item.id.startsWith('res-3'));
    }
    return [];
  } catch (error) {
    console.error('Error al obtener reservas del vendedor:', error);
    return [];
  }
}

/**
 * Valida y marca una reserva como entregada en el negocio (Requisito F11).
 */
export async function markReservationAsDelivered(id: string): Promise<Reservation[]> {
  const current = await getSellerReservations();
  const updated = current.map((item) =>
    item.id === id ? { ...item, status: 'delivered' as const } : item
  );
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return updated;
}

/**
 * Registra una nueva reserva cuando un cliente reserva o para pruebas funcionales.
 */
export async function createReservation(
  newRes: Omit<Reservation, 'id' | 'createdAt' | 'status'>
): Promise<Reservation> {
  const current = await getSellerReservations();
  const reservation: Reservation = {
    ...newRes,
    id: `res-${Date.now()}`,
    status: 'pending',
    createdAt: 'Justo ahora',
  };
  const updated = [reservation, ...current];
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  return reservation;
}

/**
 * Limpia todas las reservas dejando la lista vacía.
 */
export async function clearReservations(): Promise<Reservation[]> {
  await AsyncStorage.removeItem(STORAGE_KEY);
  return [];
}
