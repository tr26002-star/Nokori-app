import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import ClientReservationsScreen from '@/screens_new/client/ReservationsScreen';
import SellerReservationsScreen from '@/screens_new/seller/SellerReservationsScreen';
import { getSupabaseClient, hasSupabaseConfig } from '@/services/supabase';
import { palette } from '@/screens_new/shared/screen-ui';

export default function ReservationsRoute() {
  const { role } = useLocalSearchParams<{ role?: string }>();
  const [sessionRole, setSessionRole] = useState<'seller' | 'client' | null>(null);

  useEffect(() => {
    if (role === 'seller' || role === 'client' || !hasSupabaseConfig()) return;

    let active = true;
    void getSupabaseClient().auth.getUser().then(({ data, error }) => {
      if (!active) return;
      const businessName = data.user?.user_metadata?.business_name;
      setSessionRole(!error && typeof businessName === 'string' && businessName.trim() ? 'seller' : 'client');
    }).catch(() => {
      if (active) setSessionRole('client');
    });

    return () => { active = false; };
  }, [role]);

  const resolvedRole = role === 'seller' || role === 'client'
    ? role
    : sessionRole ?? (hasSupabaseConfig() ? null : 'client');

  if (!resolvedRole) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: palette.background, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator color={palette.purple} />
      </View>
    );
  }

  return resolvedRole === 'seller' ? <SellerReservationsScreen /> : <ClientReservationsScreen />;
}
