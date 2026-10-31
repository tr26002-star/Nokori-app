import ClientProductsScreen from '@/screens_new/client/ExploreScreen';
import SellerProductsScreen from '@/screens_new/seller/SellerProductsScreen';
import { useLocalSearchParams } from 'expo-router';

export default function ExploreScreen() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  return role === 'seller' ? <SellerProductsScreen /> : <ClientProductsScreen />;
}
