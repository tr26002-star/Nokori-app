import { useLocalSearchParams } from 'expo-router';
import ClientReservationsScreen from '@/screens_new/client/ReservationsScreen';
import SellerReservationsScreen from '@/screens_new/seller/SellerReservationsScreen';

export default function ReservationsRoute() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  return role === 'seller' ? <SellerReservationsScreen /> : <ClientReservationsScreen />;
}
