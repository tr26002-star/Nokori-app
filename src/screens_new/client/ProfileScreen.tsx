import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, PrimaryButton, Screen, palette } from '../shared/screen-ui';

function SettingsRow({ icon, title, detail, onPress, tone = 'purple' }: { icon: 'doc.text' | 'questionmark.circle'; title: string; detail: string; onPress: () => void; tone?: 'purple' | 'green' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingsRow}>
      <View style={[styles.rowIcon, tone === 'green' && styles.greenIcon]}>
        <SymbolView name={{ ios: icon, android: icon === 'doc.text' ? 'article' : 'help', web: icon === 'doc.text' ? 'article' : 'help' }} tintColor={tone === 'green' ? '#63834F' : palette.purple} size={17} />
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
    <Screen showBottomNav>
      <Eyebrow>Tu cuenta</Eyebrow>
      <Text style={styles.title}>Perfil</Text>
      <View style={styles.profileCard}>
        <View style={[styles.avatar, isSeller && styles.sellerAvatar]}>
          <SymbolView name={{ ios: isSeller ? 'storefront.fill' : 'person.fill', android: isSeller ? 'storefront' : 'person', web: isSeller ? 'storefront' : 'person' }} tintColor={palette.white} size={24} />
        </View>
        <View style={styles.userCopy}>
          <Text style={styles.userName}>{displayName}</Text>
          {contact ? <Text style={styles.contact}>{contact}</Text> : null}
          <View style={[styles.rolePill, isSeller && styles.sellerPill]}><Text style={[styles.roleText, isSeller && styles.sellerText]}>{isSeller ? 'Vendedor' : 'Cliente'}</Text></View>
        </View>
      </View>

      <PrimaryButton
        label={isSeller ? '＋  Publicar producto' : 'Explorar productos'}
        onPress={() => isSeller
          ? router.push({ pathname: '/publish', params: { sellerName: displayName } })
          : router.push('/explore')}
      />

      {!isSeller ? (
        <View style={styles.impactCard}>
          <View style={styles.impactIcon}><SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor="#63834F" size={19} /></View>
          <View style={styles.impactCopy}>
            <Text style={styles.impactTitle}>Tu impacto comienza aquí</Text>
            <Text style={styles.impactDescription}>Cada rescate ayuda a evitar desperdicios y apoyar a negocios locales.</Text>
          </View>
        </View>
      ) : null}

      <View style={styles.settingsCard}>
        <Text style={styles.sectionLabel}>Configuración</Text>
        <Text style={styles.sectionDescription}>Tu cuenta está lista para empezar a ahorrar o compartir.</Text>
        <SettingsRow icon="doc.text" title="Normas de la comunidad" detail="Conoce las reglas de Nokory" onPress={() => router.push('/norms')} />
        <SettingsRow icon="questionmark.circle" title="Soporte" detail="Reporta un problema o pide ayuda" onPress={() => Alert.alert('Soporte', 'Esta pantalla será conectada desde el trabajo de tu equipo.')} tone="green" />
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/role-select')} style={styles.signOut}>
        <View style={styles.signOutContent}>
          <SymbolView name={{ ios: 'rectangle.portrait.and.arrow.right', android: 'logout', web: 'logout' }} tintColor="#A75252" size={17} />
          <Text style={styles.signOutText}>Cerrar sesión</Text>
        </View>
      </Pressable>
      <Text style={styles.footer}>Versión de prototipo · Nokory</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.purpleDark, fontSize: 29, fontWeight: '800', marginBottom: 17 },
  profileCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 13, marginBottom: 15, padding: 15 },
  avatar: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 15, height: 52, justifyContent: 'center', width: 52 },
  sellerAvatar: { backgroundColor: '#63834F' },
  userCopy: { flex: 1 },
  userName: { color: palette.purpleDark, fontSize: 12, fontWeight: '800', textTransform: 'uppercase' },
  contact: { color: palette.muted, fontSize: 12, marginTop: 3 },
  rolePill: { alignSelf: 'flex-start', backgroundColor: '#F3EAF7', borderRadius: 9, marginTop: 7, paddingHorizontal: 9, paddingVertical: 4 },
  sellerPill: { backgroundColor: '#F3EAF7' },
  roleText: { color: palette.purple, fontSize: 10, fontWeight: '800' },
  sellerText: { color: '#54825D' },
  impactCard: { alignItems: 'center', backgroundColor: '#EAF0E3', borderRadius: 15, flexDirection: 'row', gap: 12, marginBottom: 21, padding: 15 },
  impactIcon: { alignItems: 'center', backgroundColor: '#DCE8D1', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  impactCopy: { flex: 1, gap: 4 },
  impactTitle: { color: '#386B47', fontSize: 13, fontWeight: '800' },
  impactDescription: { color: '#55745A', fontSize: 11, lineHeight: 16 },
  sectionLabel: { color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  sectionDescription: { color: palette.muted, fontSize: 11, lineHeight: 16, marginBottom: 10, marginTop: 4 },
  settingsCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 16, borderWidth: 1, padding: 13 },
  settingsRow: { alignItems: 'center', borderColor: palette.border, borderRadius: 11, borderWidth: 1, flexDirection: 'row', gap: 10, minHeight: 59, marginBottom: 8, paddingHorizontal: 9, paddingVertical: 8 },
  rowIcon: { alignItems: 'center', backgroundColor: '#F3EAF7', borderRadius: 9, height: 34, justifyContent: 'center', width: 34 },
  greenIcon: { backgroundColor: '#EDF5DC' },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: palette.text, fontSize: 13, fontWeight: '800' },
  rowDetail: { color: palette.muted, fontSize: 11 },
  chevron: { color: '#9E96A3', fontSize: 24, marginLeft: 4 },
  signOut: { alignItems: 'center', backgroundColor: '#F8ECEA', borderRadius: 12, marginTop: 14, minHeight: 45, justifyContent: 'center' },
  signOutContent: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  signOutText: { color: '#B64D55', fontSize: 13, fontWeight: '800' },
  footer: { color: palette.muted, fontSize: 10, marginTop: 18, textAlign: 'center' },
});
