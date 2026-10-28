import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, Screen, palette } from './screen-ui';

const choices = [
  {
    role: 'client',
    icon: 'favorite',
    title: 'Quiero rescatar',
    description: 'Descubre comida deliciosa cerca de ti a un precio mejor.',
    action: 'Continuar como cliente',
  },
  {
    role: 'seller',
    icon: 'storefront',
    title: 'Tengo un negocio',
    description: 'Publica tus excedentes y conecta con nuevos clientes.',
    action: 'Continuar como vendedor',
  },
];

export default function RoleSelectScreen() {
  const router = useRouter();
  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.intro}>
        <Eyebrow>Pequeñas acciones, grandes cambios</Eyebrow>
        <Text style={styles.title}>Lo bueno también se comparte.</Text>
        <Text style={styles.description}>Rescata comida de calidad, ayuda a comercios locales y evita que alimentos deliciosos terminen en la basura.</Text>
      </View>
      <Text style={styles.chooseLabel}>¿Cómo quieres participar?</Text>
      <View style={styles.choices}>
        {choices.map((choice, index) => (
          <Pressable
            accessibilityRole="button"
            key={choice.role}
            onPress={() => router.push({ pathname: '/auth', params: { role: choice.role } })}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <View style={[styles.iconWrap, index === 0 ? styles.clientIcon : styles.sellerIcon]}>
              <SymbolView name={{ ios: index === 0 ? 'heart.fill' : 'storefront.fill', android: index === 0 ? 'favorite' : 'storefront', web: index === 0 ? 'favorite' : 'storefront' }} tintColor={index === 0 ? palette.purple : '#63834F'} size={22} />
            </View>
            <View style={styles.copy}>
              <Text style={styles.cardTitle}>{choice.title}</Text>
              <Text style={styles.cardDescription}>{choice.description}</Text>
              <View style={styles.actionRow}>
                <Text style={[styles.action, index === 0 ? styles.clientText : styles.sellerText]}>{choice.action}</Text>
                <SymbolView name={{ ios: 'arrow.right', android: 'arrow_forward', web: 'arrow_forward' }} tintColor={index === 0 ? palette.purple : '#63834F'} size={16} />
              </View>
            </View>
          </Pressable>
        ))}
      </View>
      <Text style={styles.footnote}>Para comercios salvadoreños</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingTop: 22 },
  intro: { alignItems: 'flex-start', marginBottom: 27 },
  title: { color: palette.purpleDark, fontSize: 28, fontWeight: '700', lineHeight: 34, maxWidth: 340, marginTop: 2 },
  description: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 13 },
  chooseLabel: { color: palette.text, fontSize: 15, fontWeight: '800' },
  choices: { gap: 12, marginTop: 13 },
  card: { alignItems: 'flex-start', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 13, padding: 15, shadowColor: '#493354', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 9, elevation: 2 },
  iconWrap: { alignItems: 'center', borderRadius: 13, height: 44, justifyContent: 'center', width: 44 },
  clientIcon: { backgroundColor: '#F3EAF7' },
  sellerIcon: { backgroundColor: '#EDF5DC' },
  clientText: { color: palette.purple },
  sellerText: { color: '#54825D' },
  copy: { flex: 1 },
  cardTitle: { color: palette.text, fontSize: 16, fontWeight: '800', marginTop: 1 },
  cardDescription: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 5 },
  actionRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 12 },
  action: { fontSize: 12, fontWeight: '800' },
  pressed: { opacity: 0.82, transform: [{ scale: 0.99 }] },
  footnote: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 24, textAlign: 'center' },
});
