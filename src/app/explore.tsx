import { useLocalSearchParams } from 'expo-router';
import SellerProductsScreen from '@/screens_new/seller/SellerProductsScreen';
import ClientProductsScreen from '@/screens_new/shared/ProductsScreen';

export default function ExploreScreen() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  return role === 'seller' ? <SellerProductsScreen /> : <ClientProductsScreen />;
}
