import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import PublishProductScreen from '@/screens_new/seller/PublishProductScreen';
import { getCurrentApprovedBusiness } from '@/services/account-api';
import { Eyebrow, PageHeading, PrimaryButton, Screen, palette } from '@/screens_new/shared/screen-ui';

export default function PublishRoute() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const [isApprovedSeller, setIsApprovedSeller] = useState<boolean | null>(null);
  const [verificationError, setVerificationError] = useState('');

  useEffect(() => {
    let active = true;
    void getCurrentApprovedBusiness()
      .then((business) => {
        if (active) setIsApprovedSeller(Boolean(business));
      })
      .catch((cause) => {
        if (active) {
          setVerificationError(cause instanceof Error ? cause.message : 'No se pudo verificar el acceso al negocio.');
        }
      });
    return () => { active = false; };
  }, []);

  if (verificationError) {
    return (
      <Screen>
        <Eyebrow>Cuenta</Eyebrow>
        <PageHeading title="No se pudo verificar tu perfil" description={verificationError} />
        <PrimaryButton accessibilityLabel="Volver a iniciar sesión" label="Volver a iniciar sesión" onPress={() => router.replace('/auth')} />
      </Screen>
    );
  }
  if (isApprovedSeller === null) {
    return (
      <View style={{ alignItems: 'center', backgroundColor: palette.background, flex: 1, justifyContent: 'center' }}>
        <ActivityIndicator accessibilityLabel="Verificando perfil" color={palette.purple} />
      </View>
    );
  }
  return isApprovedSeller && role === 'seller'
    ? <PublishProductScreen />
    : <Redirect href={{ pathname: '/explore', params: { role: 'client' } }} />;
}
