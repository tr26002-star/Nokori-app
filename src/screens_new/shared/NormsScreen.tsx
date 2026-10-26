import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { Eyebrow, PageHeading, Panel, PrimaryButton, Screen, palette } from './screen-ui';

const CLIENT_RULES = [
  'Reserva solo los packs que realmente vas a recoger.',
  'Llega dentro del horario de recogida indicado por el negocio.',
  'Presenta tu código de reserva al recoger y paga directamente en el negocio.',
  'Trata con respeto al personal del comercio.',
];

const SELLER_RULES = [
  'Publica únicamente alimentos y bebidas aptos para consumo.',
  'Usa fotos reales del producto y describe con honestidad qué incluye el pack.',
  'Respeta el precio, la cantidad y el horario que publicaste.',
  'Valida el código del cliente al momento de entregar cada pedido.',
];

function RulesPanel({ title, rules }: { title: string; rules: string[] }) {
  return (
    <Panel>
      <Text style={styles.cardTitle}>{title}</Text>
      {rules.map((rule) => (
        <View key={rule} style={styles.rule}>
          <View style={styles.dot} />
          <Text style={styles.ruleText}>{rule}</Text>
        </View>
      ))}
    </Panel>
  );
}

export default function NormsScreen() {
  const router = useRouter();
  return (
    <Screen>
      <Eyebrow>Nokory · Comunidad</Eyebrow>
      <PageHeading
        title="Normas de la comunidad"
        description="Nokory funciona cuando todos cuidamos la confianza. Estas son las reglas básicas para clientes y negocios."
      />
      <RulesPanel title="Para clientes" rules={CLIENT_RULES} />
      <RulesPanel title="Para vendedores" rules={SELLER_RULES} />
      <PrimaryButton label="Volver al perfil" onPress={() => router.canGoBack() ? router.back() : router.replace('/profile')} />
      <Text style={styles.note}>Gracias por ayudar a que Nokory sea una comunidad de confianza.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  cardTitle: { color: palette.purple, fontSize: 18, fontWeight: '800', marginBottom: 15 },
  rule: { flexDirection: 'row', gap: 11, marginBottom: 13 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.green, marginTop: 7 },
  ruleText: { color: palette.text, flex: 1, fontSize: 14, lineHeight: 21 },
  note: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 12, textAlign: 'center' },
});
