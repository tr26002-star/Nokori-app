import {
  reserveProduct,
  type ReservationConfirmation,
} from './reservations-api';

export async function simulateWompiPayment(
  productId: string,
  customerName: string,
  packs: number,
  customerPhone: string,
): Promise<ReservationConfirmation> {
  return reserveProduct(productId, customerName, packs, customerPhone);
}
