import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { sendSupportComment } from '@/services/support-api';
import { formatSalvadoranNationalPhone } from '@/services/phone';
import { Eyebrow, PageHeading, Panel, Screen, palette } from './screen-ui';

const COMMENT_MAX_LENGTH = 5000;
const SUBMISSION_COOLDOWN_SECONDS = 30;
const COMMENT_TYPES = ['Falla', 'Mejora'] as const;
type CommentType = typeof COMMENT_TYPES[number];
type SupportField = 'type' | 'name' | 'phone' | 'comment';
type SupportErrors = Partial<Record<SupportField, string>>;

export default function SupportScreen() {
  const router = useRouter();
  const { role: roleParam, phone: phoneParam } = useLocalSearchParams<{
    role?: string;
    phone?: string;
  }>();
  const role = roleParam === 'seller' ? 'seller' : 'client';
  const [type, setType] = useState<CommentType>('Falla');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState(typeof phoneParam === 'string' ? phoneParam.replace(/\D/g, '').slice(-8) : '');
  const [comment, setComment] = useState('');
  const [typeOpen, setTypeOpen] = useState(false);
  const [errors, setErrors] = useState<SupportErrors>({});
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const submittingRef = useRef(false);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  function validateForm(): boolean {
    const nextErrors: SupportErrors = {};
    if (!COMMENT_TYPES.includes(type)) nextErrors.type = 'Selecciona Falla o Mejora.';
    if (!name.trim()) nextErrors.name = 'Escribe tu nombre.';
    if (!/^\d{8}$/.test(phone.trim())) {
      nextErrors.phone = 'Ingresa un número de El Salvador de 8 dígitos.';
    }
    if (comment.trim().length < 10) {
      nextErrors.comment = 'El comentario debe tener al menos 10 caracteres.';
    }
    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function handleSend() {
    if (submittingRef.current || cooldown > 0 || !validateForm()) return;

    submittingRef.current = true;
    setSubmitting(true);
    setSubmitError('');
    setSuccess('');
    try {
      await sendSupportComment({
        type,
        name: name.trim(),
        role,
        phone: phone.trim(),
        comment: comment.trim(),
      });
      setType('Falla');
      setName('');
      setPhone('');
      setComment('');
      setErrors({});
      setSuccess('Tu comentario fue enviado correctamente. Gracias por ayudarnos a mejorar Nokory.');
      setCooldown(SUBMISSION_COOLDOWN_SECONDS);
    } catch (cause) {
      setSubmitError(cause instanceof Error
        ? cause.message
        : 'No se pudo enviar el comentario. Verifica tu conexión e inténtalo de nuevo.');
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  }

  function clearFieldError(field: SupportField) {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setSubmitError('');
    setSuccess('');
  }

  return (
    <Screen>
      <Eyebrow>Nokory · Soporte y Ayuda</Eyebrow>
      <PageHeading
        title="Centro de ayuda"
        description="Cuéntanos sobre una falla o una idea para mejorar Nokory. Revisaremos tu comentario."
      />

      <Panel>
        <Text style={styles.sectionTitle}>Enviar un comentario</Text>

        <Text style={styles.fieldLabel}>Tipo de comentario</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Tipo de comentario: ${type}`}
          accessibilityState={{ expanded: typeOpen }}
          onPress={() => setTypeOpen(!typeOpen)}
          style={styles.selectButton}
        >
          <Text style={styles.selectText}>{type}</Text>
          <SymbolView
            name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }}
            tintColor={palette.text}
            size={16}
          />
        </Pressable>
        {typeOpen ? (
          <View style={styles.optionsList}>
            {COMMENT_TYPES.map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item}
                onPress={() => {
                  setType(item);
                  setTypeOpen(false);
                  clearFieldError('type');
                }}
                style={styles.optionItem}
              >
                <Text style={[styles.selectText, item === type && styles.selectedType]}>{item}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {errors.type ? <Text accessibilityRole="alert" style={styles.fieldError}>{errors.type}</Text> : null}

        <Text style={styles.fieldLabel}>Nombre</Text>
        <TextInput
          autoCapitalize="words"
          autoComplete="name"
          maxLength={120}
          onChangeText={(value) => {
            setName(value);
            clearFieldError('name');
          }}
          placeholder="Escribe tu nombre"
          placeholderTextColor="#A39BA7"
          style={styles.input}
          value={name}
        />
        {errors.name ? <Text accessibilityRole="alert" style={styles.fieldError}>{errors.name}</Text> : null}

        <Text style={styles.fieldLabel}>Número de teléfono</Text>
        <View style={styles.phoneRow}>
          <View style={styles.countryCode}><Text style={styles.countryCodeText}>+503</Text></View>
          <TextInput
            accessibilityLabel="Número telefónico salvadoreño de 8 dígitos"
            autoComplete="tel-national"
            keyboardType="phone-pad"
            maxLength={9}
            onChangeText={(value) => {
              setPhone(value.replace(/\D/g, '').slice(0, 8));
              clearFieldError('phone');
            }}
            placeholder="0000-0000"
            placeholderTextColor="#A39BA7"
            style={[styles.input, styles.phoneInput]}
            value={formatSalvadoranNationalPhone(phone)}
          />
        </View>
        {errors.phone ? <Text accessibilityRole="alert" style={styles.fieldError}>{errors.phone}</Text> : null}

        <Text style={styles.fieldLabel}>Comentario</Text>
        <TextInput
          multiline
          maxLength={COMMENT_MAX_LENGTH}
          onChangeText={(value) => {
            setComment(value);
            clearFieldError('comment');
          }}
          numberOfLines={5}
          placeholder="Describe la falla o la mejora que propones..."
          placeholderTextColor="#A39BA7"
          style={[styles.input, styles.textArea]}
          textAlignVertical="top"
          value={comment}
        />
        <View style={styles.commentMeta}>
          {errors.comment
            ? <Text accessibilityRole="alert" style={styles.fieldError}>{errors.comment}</Text>
            : <View />}
          <Text style={styles.characterCount}>{comment.length}/{COMMENT_MAX_LENGTH}</Text>
        </View>

        {submitError ? <Text accessibilityRole="alert" style={styles.submitError}>{submitError}</Text> : null}
        {success ? <Text accessibilityRole="alert" style={styles.successMessage}>{success}</Text> : null}

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: submitting || cooldown > 0, busy: submitting }}
          disabled={submitting || cooldown > 0}
          onPress={() => { void handleSend(); }}
          style={({ pressed }) => [
            styles.submitButton,
            pressed && !submitting && cooldown === 0 && styles.submitPressed,
            (submitting || cooldown > 0) && styles.submitDisabled,
          ]}
        >
          {submitting ? <ActivityIndicator color={palette.white} size="small" /> : null}
          <Text style={styles.submitButtonText}>
            {submitting ? 'Enviando...' : cooldown > 0 ? `Espera ${cooldown} s para enviar` : 'Enviar comentario'}
          </Text>
        </Pressable>
      </Panel>

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
  input: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 11,
    borderWidth: 1,
    color: palette.text,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
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
    marginBottom: 8,
  },
  selectText: { color: palette.text, fontSize: 13 },
  optionsList: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 11,
    borderWidth: 1,
    marginBottom: 8,
    marginTop: -4,
    overflow: 'hidden',
  },
  optionItem: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12 },
  selectedType: { color: palette.purple, fontWeight: '800' },
  phoneRow: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 4 },
  countryCode: {
    alignItems: 'center',
    backgroundColor: palette.palePurple,
    borderColor: palette.border,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 12,
  },
  countryCodeText: { color: palette.purpleDark, fontSize: 14, fontWeight: '700' },
  phoneInput: { flex: 1, marginBottom: 0 },
  textArea: { minHeight: 112, paddingTop: 10, textAlignVertical: 'top' },
  commentMeta: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', minHeight: 22 },
  characterCount: { color: palette.muted, fontSize: 11, marginLeft: 'auto', marginTop: 4 },
  fieldError: { color: '#B23B45', fontSize: 12, lineHeight: 17, marginBottom: 8 },
  submitError: { color: '#B23B45', fontSize: 13, lineHeight: 18, marginBottom: 6 },
  successMessage: { color: '#527346', fontSize: 13, lineHeight: 19, marginBottom: 6 },
  submitButton: {
    alignItems: 'center',
    backgroundColor: palette.purple,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 9,
    justifyContent: 'center',
    minHeight: 54,
    marginTop: 14,
    paddingHorizontal: 20,
  },
  submitButtonText: { color: palette.white, fontSize: 15, fontWeight: '800' },
  submitPressed: { opacity: 0.86, transform: [{ scale: 0.99 }] },
  submitDisabled: { opacity: 0.5 },
  faqItem: { marginVertical: 4 },
  faqQuestion: { color: palette.purpleDark, fontSize: 13, fontWeight: '800', marginBottom: 4 },
  faqAnswer: { color: palette.muted, fontSize: 12, lineHeight: 18 },
  divider: { backgroundColor: palette.border, height: 1, marginVertical: 10 },
  backButton: { alignItems: 'center', paddingVertical: 14, marginTop: 4 },
  backButtonText: { color: palette.purple, fontSize: 14, fontWeight: '700' },
});
