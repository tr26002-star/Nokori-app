import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, Screen, palette } from './screen-ui';

const choices = [
  {
    role: 'client',
    icon: '♡',
    title: 'Quiero rescatar',
    description: 'Descubre comida deliciosa cerca de ti a un precio mejor.',
    action: 'Continuar como cliente',
  },
  {
    role: 'seller',
    icon: '▣',
    title: 'Tengo un negocio',
    description: 'Publica tus excedentes y conecta con nuevos clientes.',
    action: 'Continuar como vendedor',
  },
];

export default function RoleSelectScreen() {
  const router = useRouter();
  return (
    <Screen contentStyle={styles.content}>
      <Eyebrow>Pequeñas acciones, grandes cambios</Eyebrow>
      <Text style={styles.title}>Lo bueno también se comparte.</Text>
      <Text style={styles.description}>Rescata comida de calidad, ayuda a comercios locales y evita que alimentos deliciosos terminen en la basura.</Text>
      <View style={styles.choices}>
        {choices.map((choice, index) => (
          <Pressable
            accessibilityRole="button"
            key={choice.role}
            onPress={() => router.push({ pathname: '/auth', params: { role: choice.role } })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={[styles.iconWrap, index === 0 ? styles.clientIcon : styles.sellerIcon]}>
              <Text style={[styles.icon, index === 0 ? styles.clientText : styles.sellerText]}>{choice.icon}</Text>
            </View>
            <View style={styles.copy}>
              <Text style={styles.cardTitle}>{choice.title}</Text>
              <Text style={styles.cardDescription}>{choice.description}</Text>
              <Text style={[styles.action, index === 0 ? styles.clientText : styles.sellerText]}>{choice.action}  ›</Text>
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={styles.footnote}>Prototipo para comercios salvadoreños · Puedes cambiar de rol en tu perfil.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 30 },
  title: { color: palette.purpleDark, fontSize: 30, fontWeight: '800', lineHeight: 37, maxWidth: 340, marginTop: 2 },
  description: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 15 },
  choices: { gap: 14, marginTop: 29 },
  card: { alignItems: 'flex-start', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 22, borderWidth: 1, flexDirection: 'row', gap: 13, padding: 17, shadowColor: '#51396B', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  iconWrap: { alignItems: 'center', borderRadius: 13, height: 42, justifyContent: 'center', width: 42 },
  clientIcon: { backgroundColor: '#F1E5F7' },
  sellerIcon: { backgroundColor: '#EAF3D8' },
  icon: { fontSize: 23, fontWeight: '700' },
  clientText: { color: palette.purple },
  sellerText: { color: '#54825D' },
  copy: { flex: 1 },
  cardTitle: { color: palette.text, fontSize: 16, fontWeight: '800', marginTop: 1 },
  cardDescription: { color: palette.muted, fontSize: 13, lineHeight: 18, marginTop: 5 },
  action: { fontSize: 13, fontWeight: '800', marginTop: 10 },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  footnote: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 28, textAlign: 'center' },
});
