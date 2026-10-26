import { useLocalSearchParams, useRouter } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, PrimaryButton, Screen, palette } from '../shared/screen-ui';

function SettingsRow({ icon, title, detail, onPress, tone = 'purple' }: { icon: string; title: string; detail: string; onPress: () => void; tone?: 'purple' | 'green' }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.settingsRow}>
      <View style={[styles.rowIcon, tone === 'green' && styles.greenIcon]}><Text style={[styles.rowIconText, tone === 'green' && styles.greenText]}>{icon}</Text></View>
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
    <Screen>
      <Eyebrow>Tu cuenta</Eyebrow>
      <Text style={styles.title}>Perfil</Text>
      <View style={styles.profileCard}>
        <View style={[styles.avatar, isSeller && styles.sellerAvatar]}><Text style={styles.avatarText}>{isSeller ? '▣' : '♙'}</Text></View>
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
          <View style={styles.impactIcon}><Text style={styles.impactIconText}>✓</Text></View>
          <View style={styles.impactCopy}>
            <Text style={styles.impactTitle}>Tu impacto comienza aquí</Text>
            <Text style={styles.impactDescription}>Cada rescate ayuda a evitar desperdicios y apoyar a negocios locales.</Text>
          </View>
        </View>
      ) : null}

      <Text style={styles.sectionLabel}>Configuración</Text>
      <Text style={styles.sectionDescription}>Tu cuenta está lista para empezar a ahorrar o compartir.</Text>
      <View style={styles.settingsCard}>
        <SettingsRow icon="▤" title="Normas de la comunidad" detail="Conoce las reglas de Nokory" onPress={() => router.push('/norms')} />
        <View style={styles.separator} />
        <SettingsRow icon="?" title="Soporte" detail="Reporta un problema o pide ayuda" onPress={() => Alert.alert('Soporte', 'Esta pantalla será conectada desde el trabajo de tu equipo.')} tone="green" />
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.replace('/role-select')} style={styles.signOut}>
        <Text style={styles.signOutText}>↪  Cerrar sesión</Text>
      </Pressable>
      <Text style={styles.footer}>Versión de prototipo · Nokory</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: palette.purpleDark, fontSize: 29, fontWeight: '800', marginBottom: 17 },
  profileCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 20, borderWidth: 1, flexDirection: 'row', gap: 13, marginBottom: 15, padding: 16 },
  avatar: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 15, height: 50, justifyContent: 'center', width: 50 },
  sellerAvatar: { backgroundColor: '#54825D' },
  avatarText: { color: palette.white, fontSize: 24, fontWeight: '700' },
  userCopy: { flex: 1 },
  userName: { color: palette.text, fontSize: 16, fontWeight: '800', textTransform: 'capitalize' },
  contact: { color: palette.muted, fontSize: 12, marginTop: 3 },
  rolePill: { alignSelf: 'flex-start', backgroundColor: '#F1E5F7', borderRadius: 10, marginTop: 7, paddingHorizontal: 9, paddingVertical: 4 },
  sellerPill: { backgroundColor: '#EAF3D8' },
  roleText: { color: palette.purple, fontSize: 10, fontWeight: '800' },
  sellerText: { color: '#54825D' },
  impactCard: { alignItems: 'center', backgroundColor: '#EAF3D8', borderRadius: 17, flexDirection: 'row', gap: 12, marginBottom: 21, padding: 15 },
  impactIcon: { alignItems: 'center', backgroundColor: '#D8EAB9', borderRadius: 12, height: 38, justifyContent: 'center', width: 38 },
  impactIconText: { color: '#54825D', fontSize: 18, fontWeight: '900' },
  impactCopy: { flex: 1, gap: 4 },
  impactTitle: { color: '#386B47', fontSize: 13, fontWeight: '800' },
  impactDescription: { color: '#55745A', fontSize: 11, lineHeight: 16 },
  sectionLabel: { color: palette.text, fontSize: 14, fontWeight: '800', marginTop: 2 },
  sectionDescription: { color: palette.muted, fontSize: 11, lineHeight: 16, marginBottom: 11, marginTop: 4 },
  settingsCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 13 },
  settingsRow: { alignItems: 'center', flexDirection: 'row', gap: 11, minHeight: 68, paddingVertical: 9 },
  rowIcon: { alignItems: 'center', backgroundColor: '#F1E5F7', borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  greenIcon: { backgroundColor: '#EAF3D8' },
  rowIconText: { color: palette.purple, fontSize: 16, fontWeight: '800' },
  greenText: { color: '#54825D' },
  rowCopy: { flex: 1, gap: 3 },
  rowTitle: { color: palette.text, fontSize: 13, fontWeight: '800' },
  rowDetail: { color: palette.muted, fontSize: 11 },
  chevron: { color: '#9E96A3', fontSize: 24, marginLeft: 4 },
  separator: { backgroundColor: palette.border, height: 1, marginLeft: 45 },
  signOut: { alignItems: 'center', backgroundColor: '#FFF0F0', borderRadius: 12, marginTop: 14, minHeight: 45, justifyContent: 'center' },
  signOutText: { color: '#B64D55', fontSize: 13, fontWeight: '800' },
  footer: { color: palette.muted, fontSize: 10, marginTop: 18, textAlign: 'center' },
});
