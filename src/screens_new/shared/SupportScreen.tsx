import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Eyebrow, PageHeading, Panel, PrimaryButton, Screen, palette } from './screen-ui';

const SUPPORT_TOPICS = [
  'Problema con un pedido o ticket',
  'Duda sobre el funcionamiento',
  'Reportar un error técnico',
  'Compartir una sugerencia o mejora',
];

export default function SupportScreen() {
  const router = useRouter();
  const [topic, setTopic] = useState(SUPPORT_TOPICS[0]);
  const [message, setMessage] = useState('');
  const [topicOpen, setTopicOpen] = useState(false);

  function handleSend() {
    if (!message.trim()) {
      Alert.alert('Falta mensaje', 'Por favor escribe tu duda o el problema que deseas reportar.');
      return;
    }

    Alert.alert(
      '¡Mensaje enviado!',
      'Hemos recibido tu reporte. El equipo de soporte de Nokori se pondrá en contacto pronto.',
      [
        {
          text: 'Aceptar',
          onPress: () => {
            setMessage('');
            if (router.canGoBack()) router.back();
            else router.replace('/profile');
          },
        },
      ]
    );
  }

  return (
    <Screen>
      <Eyebrow>Nokory · Soporte y Ayuda</Eyebrow>
      <PageHeading
        title="Centro de ayuda"
        description="¿Tienes alguna duda con un producto, inconveniente con un pedido o sugerencia para mejorar Nokori? Estamos para ayudarte."
      />

      <Panel>
        <Text style={styles.sectionTitle}>Enviar un mensaje</Text>

        {/* Motivo */}
        <Text style={styles.fieldLabel}>Motivo de contacto</Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => setTopicOpen(!topicOpen)}
          style={styles.selectButton}
        >
          <Text style={styles.selectText}>{topic}</Text>
          <SymbolView
            name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }}
            tintColor={palette.text}
            size={16}
          />
        </Pressable>

        {topicOpen ? (
          <View style={styles.optionsList}>
            {SUPPORT_TOPICS.map((item) => (
              <Pressable
                key={item}
                onPress={() => {
                  setTopic(item);
                  setTopicOpen(false);
                }}
                style={styles.optionItem}
              >
                <Text style={[styles.selectText, item === topic && styles.selectedTopic]}>
                  {item}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Mensaje */}
        <Text style={styles.fieldLabel}>Descripción del problema o sugerencia</Text>
        <TextInput
          multiline
          numberOfLines={4}
          placeholder="Escribe los detalles aquí..."
          placeholderTextColor="#A39BA7"
          value={message}
          onChangeText={setMessage}
          style={styles.textArea}
        />

        <PrimaryButton label="Enviar reporte a soporte" onPress={handleSend} />
      </Panel>

      {/* Preguntas frecuentes rápidas */}
      <Panel>
        <Text style={styles.sectionTitle}>Preguntas frecuentes</Text>
        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>¿Cómo se realizan los pagos?</Text>
          <Text style={styles.faqAnswer}>
            Los pagos se realizan en efectivo o con los métodos de pago disponibles directamente en el establecimiento al momento de recoger el pedido.
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.faqItem}>
          <Text style={styles.faqQuestion}>¿Qué pasa si el cliente no recoge a tiempo?</Text>
          <Text style={styles.faqAnswer}>
            Los productos tienen un horario límite de recogida establecido por el comercio para garantizar su frescura y calidad.
          </Text>
        </View>
      </Panel>

      <Pressable
        accessibilityRole="button"
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
        style={styles.backButton}
      >
        <Text style={styles.backButtonText}>← Volver a mi perfil</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { color: palette.purpleDark, fontSize: 16, fontWeight: '800', marginBottom: 14 },
  fieldLabel: { color: palette.text, fontSize: 13, fontWeight: '700', marginBottom: 6, marginTop: 4 },
  selectButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 11,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 46,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  selectText: { color: palette.text, fontSize: 13 },
  optionsList: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 11,
    borderWidth: 1,
    marginBottom: 12,
    marginTop: -8,
    overflow: 'hidden',
  },
  optionItem: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12 },
  selectedTopic: { color: palette.purple, fontWeight: '800' },
  textArea: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 11,
    borderWidth: 1,
    color: palette.text,
    fontSize: 14,
    minHeight: 90,
    paddingHorizontal: 12,
    paddingTop: 10,
    textAlignVertical: 'top',
    marginBottom: 8,
  },
  faqItem: { marginVertical: 4 },
  faqQuestion: { color: palette.purpleDark, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  faqAnswer: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  divider: { backgroundColor: palette.border, height: 1, marginVertical: 10 },
  backButton: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  backButtonText: { color: palette.purple, fontSize: 14, fontWeight: '700' },
});
