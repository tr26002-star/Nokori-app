import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import ClientReservationsScreen from '@/screens_new/client/ReservationsScreen';
import SellerReservationsScreen from '@/screens_new/seller/SellerReservationsScreen';
import { getCurrentApprovedBusiness } from '@/services/account-api';
import { Eyebrow, PageHeading, PrimaryButton, Screen, palette } from '@/screens_new/shared/screen-ui';

export default function ReservationsRoute() {
  const { role: requestedRole, phone } = useLocalSearchParams<{ role?: string; phone?: string }>();
  const [sellerAccess, setSellerAccess] = useState<{ role: string; approved: boolean } | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();
  const isSellerRequested = requestedRole === 'seller';
  const verifiedSellerAccess = isSellerRequested && sellerAccess?.role === requestedRole
    ? sellerAccess.approved
    : null;
  const sessionRole = !isSellerRequested ? 'client' : verifiedSellerAccess ? 'seller' : null;
  const accessDenied = isSellerRequested && verifiedSellerAccess === false;

  useEffect(() => {
    let active = true;
    if (!isSellerRequested) return () => { active = false; };
    void getCurrentApprovedBusiness()
      .then((business) => {
        if (!active) return;
        setError('');
        setSellerAccess({ role: requestedRole, approved: Boolean(business) });
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo verificar el acceso a las reservas.');
      });

    return () => { active = false; };
  }, [isSellerRequested, requestedRole]);

  if (error && isSellerRequested) {
    return (
      <Screen>
        <Eyebrow>Cuenta</Eyebrow>
        <PageHeading title="No se pudo verificar tu perfil" description={error} />
        <PrimaryButton accessibilityLabel="Volver a iniciar sesión" label="Volver a iniciar sesión" onPress={() => router.replace('/auth')} />
      </Screen>
    );
  }
  if (accessDenied) {
    return (
      <Screen>
        <Eyebrow>Cuenta</Eyebrow>
        <PageHeading title="Modo negocio no disponible" description="El modo negocio solo está disponible para cuentas con un negocio aprobado." />
        <PrimaryButton
          accessibilityLabel="Continuar en modo cliente"
          label="Continuar en modo cliente"
          onPress={() => router.replace({ pathname: '/reservations', params: { role: 'client', ...(phone ? { phone } : {}) } })}
        />
      </Screen>
    );
  }
  if (!sessionRole) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: palette.background, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Verificando perfil" color={palette.purple} />
      </View>
    );
  }

  return sessionRole === 'seller' ? <SellerReservationsScreen /> : <ClientReservationsScreen />;
}
