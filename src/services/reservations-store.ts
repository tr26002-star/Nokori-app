import { useSyncExternalStore } from 'react';
import type { Product } from './products-api';

export type Reservation = {
  id: string;
  productId: string;
  productName: string;
  sellerName: string;
  imageUrl: string | null;
  quantity: number;
  unitPrice: number;
  pickupStart: string;
  pickupEnd: string;
  customerName: string;
  customerPhone: string;
  status: 'active' | 'cancelled';
  createdAt: string;
};

// Las reservas viven en la memoria de la app mientras está abierta.
// Cuando exista un endpoint de reservas en la API, solo hay que cambiar este archivo.
let reservations: Reservation[] = [];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return reservations;
}

export function useReservations() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function reservedQuantity(list: Reservation[], productId: string) {
  return list
    .filter((item) => item.productId === productId && item.status === 'active')
    .reduce((total, item) => total + item.quantity, 0);
}

/** Packs que todavía se pueden reservar. Si llega a 0, el producto se oculta de Explorar. */
export function availableQuantity(product: Product, list: Reservation[]) {
  return Math.max(0, product.quantity - reservedQuantity(list, product.id));
}

export function addReservation(product: Product, quantity: number, customerName: string, customerPhone: string) {
  const reservation: Reservation = {
    id: `NK-${Math.floor(1000 + Math.random() * 9000)}`,
    productId: product.id,
    productName: product.name,
    sellerName: product.sellerName,
    imageUrl: product.imageUrl,
    quantity,
    unitPrice: product.price,
    pickupStart: product.pickupStart,
    pickupEnd: product.pickupEnd,
    customerName,
    customerPhone,
    status: 'active',
    createdAt: new Date().toISOString(),
  };
  reservations = [reservation, ...reservations];
  notify();
  return reservation;
}

/** Al cancelar, los packs vuelven a estar disponibles en Explorar. */
export function cancelReservation(id: string) {
  reservations = reservations.map((item) => (item.id === id ? { ...item, status: 'cancelled' as const } : item));
  notify();
}
