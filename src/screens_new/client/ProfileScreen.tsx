import * as ImagePicker from 'expo-image-picker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  getCurrentAccountProfile,
  updateCurrentAccountPhoto,
  validateProfilePhoto,
  type AccountProfile,
} from '@/services/account-api';
import { logoutAccount } from '@/services/seller-auth-api';
import { Eyebrow, Screen, SecondaryButton, palette } from '../shared/screen-ui';

function SettingsRow({ icon, title, detail, onPress, tone = 'purple' }: { icon: 'checkmark.shield' | 'heart'; title: string; detail: string; onPress: () => void; tone?: 'purple' | 'green' }) {
  return (
    <Pressable accessibilityLabel={`${title}. ${detail}`} accessibilityRole="button" onPress={onPress} style={styles.settingsRow}>
      <View style={[styles.rowIcon, tone === 'green' && styles.greenIcon]}>
        <SymbolView name={{ ios: icon, android: icon === 'checkmark.shield' ? 'verified_user' : 'favorite', web: icon === 'checkmark.shield' ? 'verified_user' : 'favorite' }} tintColor={tone === 'green' ? '#63834F' : palette.purple} size={17} />
      </View>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const { phone, role } = useLocalSearchParams<{ phone?: string; role?: string }>();
  const [account, setAccount] = useState<AccountProfile | null>(null);
  const [accountError, setAccountError] = useState('');
  const [signOutError, setSignOutError] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const isSeller = role === 'seller' && account?.hasApprovedBusiness === true;
  const displayName = (isSeller ? account?.businessName : account?.name) || 'Tu cuenta';
  const contact = (isSeller ? account?.businessEmail : null) || account?.email;

  useFocusEffect(useCallback(() => {
    let active = true;
    void getCurrentAccountProfile()
      .then((profile) => {
        if (active) {
          setAccount(profile);
          setAccountError('');
        }
      })
      .catch((cause) => {
        if (active) setAccountError(cause instanceof Error ? cause.message : 'No se pudo cargar tu perfil.');
      });
    return () => { active = false; };
  }, []));

  async function signOut() {
    setSigningOut(true);
    setSignOutError('');
    try {
      await logoutAccount();
      router.replace('/auth');
    } catch (cause) {
      setSignOutError(cause instanceof Error ? cause.message : 'No se pudo cerrar la sesión.');
    } finally {
      setSigningOut(false);
    }
  }

  async function changePhoto() {
    if (changingPhoto) return;
    setChangingPhoto(true);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('No se pudo leer la imagen. Elige otra foto.');
      const photo = { base64: asset.base64, mimeType: asset.mimeType || 'image/jpeg' };
      validateProfilePhoto(photo);
      await updateCurrentAccountPhoto(photo, isSeller ? 'business' : 'profile');
      const updatedProfile = await getCurrentAccountProfile();
      if (!updatedProfile) throw new Error('No se pudo actualizar tu perfil.');
      setAccount(updatedProfile);
      setAccountError('');
    } catch (cause) {
      setAccountError(cause instanceof Error ? cause.message : 'No se pudo cambiar la foto.');
    } finally {
      setChangingPhoto(false);
    }
  }

  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      <Eyebrow>TU CUENTA</Eyebrow>
      <Text style={styles.title}>Perfil</Text>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          {(isSeller ? account?.businessAvatarUrl : account?.clientAvatarUrl) ? (
            <Image
              accessibilityLabel={isSeller ? 'Foto del negocio' : 'Foto de perfil'}
              source={{ uri: isSeller ? account?.businessAvatarUrl || '' : account?.clientAvatarUrl || '' }}
              style={styles.avatarImage}
            />
          ) : (
            <SymbolView name={{ ios: isSeller ? 'storefront.fill' : 'person.fill', android: isSeller ? 'storefront' : 'person', web: isSeller ? 'storefront' : 'person' }} tintColor={palette.white} size={24} />
          )}
        </View>
        <View style={styles.userCopy}>
          <Text style={styles.userName}>{displayName}</Text>
          {contact ? <Text style={styles.contact}>{contact}</Text> : null}
          <View style={styles.rolePill}><Text style={styles.roleText}>{isSeller ? 'Vendedor' : 'Cliente'}</Text></View>
        </View>
      </View>
      {account ? (
        <SecondaryButton
          accessibilityLabel={isSeller ? 'Cambiar foto del negocio' : 'Cambiar foto de perfil'}
          disabled={changingPhoto}
          label={changingPhoto ? 'Guardando foto…' : 'Cambiar foto'}
          onPress={() => { void changePhoto(); }}
        />
      ) : null}
      {account?.hasApprovedBusiness ? (
        <SecondaryButton
          accessibilityLabel={isSeller ? 'Cambiar a modo cliente' : 'Cambiar a modo negocio'}
          label={isSeller ? 'Cambiar a modo cliente' : 'Cambiar a modo negocio'}
          onPress={() => router.replace({
            pathname: '/explore',
            params: {
              role: isSeller ? 'client' : 'seller',
              ...(phone ? { phone } : {}),
            },
          })}
        />
      ) : null}
      {account?.businessRequest?.status === 'pendiente' ? (
        <View style={styles.profileCard}>
          <View style={styles.userCopy}>
            <Text style={styles.userName}>En revisión</Text>
            <Text style={styles.sectionDescription}>Tu solicitud de afiliación está en revisión.</Text>
          </View>
        </View>
      ) : account?.businessRequest?.status === 'rechazada' ? (
        <View style={styles.profileCard}>
          <View style={styles.userCopy}>
            <Text style={styles.userName}>Solicitud rechazada</Text>
            <Text style={styles.sectionDescription}>
              {account.businessRequest.rejectionReason || 'La solicitud no fue aprobada.'}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={styles.settingsCard}>
        <Text style={styles.sectionLabel}>Configuración</Text>
        <Text style={styles.sectionDescription}>Tu cuenta está lista para empezar a ahorrar o compartir.</Text>
        {accountError ? <Text accessibilityRole="alert" style={styles.error}>{accountError}</Text> : null}
        <SettingsRow
          icon="checkmark.shield"
          title="Normas de la comunidad"
          detail="Conoce las reglas para clientes y vendedores"
          onPress={() => router.push('/norms')}
        />
        {account && !account.hasBusinessRecord && !account.businessRequest ? (
          <SettingsRow
            icon="heart"
            title="Afiliar negocio"
            detail="Solicita la revisión de tu negocio"
            onPress={() => router.push({
              pathname: '/affiliate',
              params: {
                role: 'client',
                ...(phone ? { phone } : {}),
              },
            })}
            tone="green"
          />
        ) : null}
        <SettingsRow
          icon="heart"
          title="Soporte"
          detail="Reporta un problema o comparte una mejora"
          onPress={() => router.push({
            pathname: '/support',
            params: {
              role: isSeller ? 'seller' : 'client',
              ...(phone ? { phone } : {}),
            },
          })}
          tone="green"
        />
        {signOutError ? <Text accessibilityRole="alert" style={styles.error}>{signOutError}</Text> : null}
        <Pressable
          accessibilityLabel="Cerrar sesión"
          accessibilityRole="button"
          accessibilityState={{ disabled: signingOut }}
          disabled={signingOut}
          onPress={() => { void signOut(); }}
          style={styles.signOut}
        >
          <View style={styles.signOutContent}>
            {signingOut
              ? <ActivityIndicator color="#A75252" size="small" />
              : <SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor="#A75252" size={15} />}
            <Text style={styles.signOutText}>{signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</Text>
          </View>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 16, paddingTop: 16 },
  title: { color: palette.purpleDark, fontSize: 26, fontWeight: '800', marginBottom: 17 },
  profileCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, marginBottom: 12, padding: 14 },
  avatar: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 12, height: 46, justifyContent: 'center', width: 46 },
  avatarImage: { ...StyleSheet.absoluteFill, borderRadius: 12 },
  userCopy: { flex: 1 },
  userName: { color: palette.purpleDark, fontSize: 16, fontWeight: '800' },
  contact: { color: palette.muted, fontSize: 12, marginTop: 2 },
  rolePill: { alignSelf: 'flex-start', backgroundColor: '#F3EAF7', borderRadius: 9, marginTop: 6, paddingHorizontal: 9, paddingVertical: 3 },
  roleText: { color: palette.purple, fontSize: 10, fontWeight: '800' },
  sectionLabel: { color: palette.text, fontSize: 15, fontWeight: '800', marginTop: 1 },
  sectionDescription: { color: palette.muted, fontSize: 12, lineHeight: 16, marginBottom: 14, marginTop: 4 },
  settingsCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 16, borderWidth: 1, padding: 14 },
  settingsRow: { alignItems: 'center', borderColor: palette.border, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 48, marginBottom: 8, paddingHorizontal: 10, paddingVertical: 6 },
  rowIcon: { alignItems: 'center', backgroundColor: '#F3EAF7', borderRadius: 9, height: 32, justifyContent: 'center', width: 32 },
  greenIcon: { backgroundColor: '#EDF5DC' },
  rowCopy: { flex: 1, gap: 2 },
  rowTitle: { color: palette.text, fontSize: 12, fontWeight: '800' },
  rowDetail: { color: palette.muted, fontSize: 10 },
  chevron: { color: '#9E96A3', fontSize: 24, marginLeft: 4 },
  error: { color: '#B23B45', fontSize: 11, lineHeight: 16, marginBottom: 8 },
  signOut: { alignItems: 'center', backgroundColor: '#FFF0F1', borderRadius: 10, marginTop: 8, minHeight: 38, justifyContent: 'center' },
  signOutContent: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  signOutText: { color: '#B64D55', fontSize: 12, fontWeight: '800' },
});
