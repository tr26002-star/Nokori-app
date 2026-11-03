import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { clientColors, Icon } from '../client/client-ui';
import { Field, PrimaryButton, Screen, palette } from './screen-ui';

const SUPPORT_EMAIL = 'al26001@esfe.agape.edu.sv';
const types = [
  { key: 'Problema', icon: 'chat' },
  { key: 'Mejora', icon: 'idea' },
] as const;

export default function SupportScreen() {
  const router = useRouter();
  const [type, setType] = useState<'Problema' | 'Mejora'>('Problema');
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace('/profile'));

  const send = async () => {
    if (comment.trim().length < 10) return setError('Cuéntanos un poco más (mínimo 10 caracteres).');
    if (name.trim().length < 3) return setError('Escribe tu nombre.');
    if (contact.trim().length < 6) return setError('Escribe un teléfono o correo para confirmarte.');
    setError('');
    const subject = encodeURIComponent(`Nokory · ${type}`);
    const body = encodeURIComponent(`Tipo: ${type}\n\n${comment.trim()}\n\nNombre: ${name.trim()}\nContacto: ${contact.trim()}`);
    try {
      await Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`);
      setSent(true);
    } catch {
      Alert.alert('No pudimos abrir tu correo', `Puedes escribirnos directamente a ${SUPPORT_EMAIL}.`);
    }
  };

  if (sent) {
    return (
      <Screen showBrand={false} showDecorations={false}>
        <View style={styles.done}>
          <View style={styles.doneIcon}><Icon name="check" size={26} color={clientColors.greenDark} /></View>
          <Text style={styles.doneTitle}>Comentario listo</Text>
          <Text style={styles.doneText}>Gracias, {name.trim()}. Tu {type.toLowerCase()} quedó preparada para enviarse a nuestro equipo y te contactaremos para confirmarla.</Text>
          <PrimaryButton label="Volver al perfil" onPress={goBack} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen showBrand={false} showDecorations={false}>
      <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
        <Icon name="back" size={14} />
        <Text style={styles.backText}>Perfil</Text>
      </Pressable>
      <Text style={styles.eyebrow}>ESTAMOS PARA AYUDARTE</Text>
      <Text style={styles.title}>Soporte</Text>
      <Text style={styles.subtitle}>Cuéntanos qué pasó o qué te gustaría mejorar. Revisamos cada comentario.</Text>

      <Text style={styles.label}>Tipo de comentario</Text>
      <View style={styles.segment}>
        {types.map((item) => (
          <Pressable key={item.key} onPress={() => setType(item.key)} style={[styles.segmentItem, type === item.key && styles.segmentOn]}>
            <Icon name={item.icon} size={16} color={type === item.key ? palette.purpleDark : palette.muted} />
            <Text style={[styles.segmentText, type === item.key && { color: palette.purpleDark }]}>{item.key}</Text>
          </Pressable>
        ))}
      </View>

      <Field containerStyle={styles.gap} label="Tu comentario" maxLength={400} multiline onChangeText={setComment} placeholder="Describe con detalle…" style={styles.textarea} textAlignVertical="top" value={comment} />
      <Text style={styles.counter}>{comment.length}/400</Text>
      <Field label="Nombre" onChangeText={setName} placeholder="Tu nombre" value={name} />
      <Field label="Teléfono o correo" onChangeText={setContact} placeholder="Para confirmar tu mensaje" value={contact} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <PrimaryButton label="Enviar comentario" onPress={() => { void send(); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  back: { alignItems: 'center', alignSelf: 'flex-start', backgroundColor: palette.palePurple, borderRadius: 10, flexDirection: 'row', gap: 6, marginBottom: 18, paddingHorizontal: 12, paddingVertical: 8 },
  backText: { color: palette.purple, fontSize: 12, fontWeight: '800' },
  eyebrow: { color: palette.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: palette.purpleDark, fontSize: 28, fontWeight: '800' },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginBottom: 20, marginTop: 6 },
  label: { color: palette.text, fontSize: 14, fontWeight: '700', marginBottom: 8 },
  segment: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  segmentItem: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 12, borderWidth: 1, flex: 1, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 48 },
  segmentOn: { backgroundColor: palette.palePurple, borderColor: palette.purple },
  segmentText: { color: palette.text, fontSize: 13, fontWeight: '700' },
  gap: { marginBottom: 4 },
  textarea: { minHeight: 120, paddingTop: 13 },
  counter: { color: palette.muted, fontSize: 11, marginBottom: 14, textAlign: 'right' },
  error: { color: clientColors.danger, fontSize: 12, fontWeight: '700', marginBottom: 4 },
  done: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, marginTop: 60, padding: 26 },
  doneIcon: { alignItems: 'center', backgroundColor: clientColors.paleGreen, borderRadius: 16, height: 52, justifyContent: 'center', marginBottom: 14, width: 52 },
  doneTitle: { color: palette.text, fontSize: 18, fontWeight: '800' },
  doneText: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 8, textAlign: 'center' },
});
