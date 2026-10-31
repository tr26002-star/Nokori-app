import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, Screen, palette } from '../shared/screen-ui';

function SettingsRow({ icon, title, detail, onPress, tone = 'purple' }: { icon: 'checkmark.shield' | 'heart'; title: string; detail: string; onPress: () => void; tone?: 'purple' | 'green' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingsRow}>
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
  const { role, phone, email, businessName } = useLocalSearchParams<{ role?: string; phone?: string; email?: string; businessName?: string }>();
  const isSeller = role === 'seller';
  const displayName = isSeller ? (businessName || 'Tu negocio') : 'Tu cuenta';
  const contact = isSeller ? email : phone;

  return (
    <Screen contentStyle={styles.screenContent} navVariant={role === 'client' ? 'client' : 'seller'} showBottomNav showBrand={false} showDecorations={false}>
      <Eyebrow>Tu cuenta</Eyebrow>
      <Text style={styles.title}>Perfil</Text>
      <View style={styles.profileCard}>
        <View style={styles.avatar}>
          <SymbolView name={{ ios: isSeller ? 'storefront.fill' : 'person.fill', android: isSeller ? 'storefront' : 'person', web: isSeller ? 'storefront' : 'person' }} tintColor={palette.white} size={24} />
        </View>
        <View style={styles.userCopy}>
          <Text style={styles.userName}>{displayName}</Text>
          {contact ? <Text style={styles.contact}>{contact}</Text> : null}
          <View style={styles.rolePill}><Text style={styles.roleText}>{isSeller ? 'Vendedor' : 'Cliente'}</Text></View>
        </View>
      </View>

      <View style={styles.settingsCard}>
        <Text style={styles.sectionLabel}>Configuración</Text>
        <Text style={styles.sectionDescription}>{isSeller ? 'Tu cuenta está vinculada al perfil de vendedor con el que te registraste.' : 'Tu cuenta está lista para empezar a ahorrar o compartir.'}</Text>
        <SettingsRow icon="checkmark.shield" title="Normas de la comunidad" detail="Conoce las reglas para clientes y vendedores" onPress={() => router.push('/norms')} />
       <SettingsRow icon="heart" title="Soporte" detail="Reporta un problema o comparte una mejora" onPress={() => router.push('/support')} tone="green" />
        <Pressable accessibilityRole="button" onPress={() => router.replace('/role-select')} style={styles.signOut}>
          <View style={styles.signOutContent}>
            <SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor="#A75252" size={15} />
            <Text style={styles.signOutText}>Cerrar sesión</Text>
          </View>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 16, paddingTop: 16 },
  title: { color: palette.purpleDark, fontSize: 22, fontWeight: '700', marginBottom: 17 },
  profileCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, marginBottom: 9, padding: 12 },
  avatar: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 10, height: 40, justifyContent: 'center', width: 40 },
  userCopy: { flex: 1 },
  userName: { color: palette.purpleDark, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  contact: { color: palette.muted, fontSize: 10, marginTop: 3 },
  rolePill: { alignSelf: 'flex-start', backgroundColor: '#F3EAF7', borderRadius: 9, marginTop: 7, paddingHorizontal: 8, paddingVertical: 3 },
  roleText: { color: palette.purple, fontSize: 8, fontWeight: '800' },
  sectionLabel: { color: palette.text, fontSize: 12, fontWeight: '800', marginTop: 1 },
  sectionDescription: { color: palette.muted, fontSize: 8, lineHeight: 12, marginBottom: 10, marginTop: 4 },
  settingsCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 16, borderWidth: 1, padding: 12 },
  settingsRow: { alignItems: 'center', borderColor: palette.border, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 45, marginBottom: 7, paddingHorizontal: 8, paddingVertical: 6 },
  rowIcon: { alignItems: 'center', backgroundColor: '#F3EAF7', borderRadius: 9, height: 29, justifyContent: 'center', width: 29 },
  greenIcon: { backgroundColor: '#EDF5DC' },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: palette.text, fontSize: 10, fontWeight: '800' },
  rowDetail: { color: palette.muted, fontSize: 7 },
  chevron: { color: '#9E96A3', fontSize: 24, marginLeft: 4 },
  signOut: { alignItems: 'center', backgroundColor: '#FFF0F1', borderRadius: 10, marginTop: 4, minHeight: 31, justifyContent: 'center' },
  signOutContent: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  signOutText: { color: '#B64D55', fontSize: 11, fontWeight: '800' },
});
