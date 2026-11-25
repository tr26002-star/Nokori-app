import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { getCurrentApprovedBusiness } from '@/services/account-api';
import { Eyebrow, PageHeading, PrimaryButton, Screen, palette } from '@/screens_new/shared/screen-ui';
import SellerProductsScreen from '@/screens_new/seller/SellerProductsScreen';
import ClientProductsScreen from '@/screens_new/shared/ProductsScreen';

export default function ExploreScreen() {
  const router = useRouter();
  const { role: requestedRole, phone } = useLocalSearchParams<{ role?: string; phone?: string }>();
  const [sellerAccess, setSellerAccess] = useState<{ role: string; approved: boolean } | null>(null);
  const [error, setError] = useState('');
  const isSellerRequested = requestedRole === 'seller';
  const verifiedSellerAccess = isSellerRequested && sellerAccess?.role === requestedRole
    ? sellerAccess.approved
    : null;
  const role = !isSellerRequested ? 'client' : verifiedSellerAccess ? 'seller' : null;
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
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo validar el acceso a la cuenta.');
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
          onPress={() => router.replace({ pathname: '/explore', params: { role: 'client', ...(phone ? { phone } : {}) } })}
        />
      </Screen>
    );
  }
  if (!role) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: palette.background, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Verificando perfil" color={palette.purple} />
      </View>
    );
  }
  return role === 'seller' ? <SellerProductsScreen /> : <ClientProductsScreen />;
}
