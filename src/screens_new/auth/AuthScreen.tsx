import { loginSeller, registerSeller } from '@/services/seller-auth-api';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Eyebrow, Field, PageHeading, PrimaryButton, Screen, palette } from '../shared/screen-ui';

function getPasswordRequirements(password: string) {
  const missing = [];
  if (Array.from(password).length < 8) missing.push('al menos 8 caracteres');
  if (!/\p{Lu}/u.test(password)) missing.push('una letra mayúscula');
  if (!/[0-9]/.test(password)) missing.push('un número');
  return missing;
}

export default function AuthScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const isSeller = role === 'seller';
  const [isRegistering, setIsRegistering] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const missingPasswordRequirements = isRegistering && password.length > 0
    ? getPasswordRequirements(password)
    : [];

  async function continueToProfile() {
    if (isSeller) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        setError('Escribe un correo electrónico válido.');
        return;
      }

      if (isRegistering) {
        if (businessName.trim().length < 2) {
          setError('Escribe el nombre de tu negocio.');
          return;
        }
        const missingRequirements = getPasswordRequirements(password);
        if (missingRequirements.length > 0) {
          setError(`La contraseña necesita:\n${missingRequirements.map((requirement) => `• ${requirement}`).join('\n')}.`);
          return;
        }
        if (!accepted) {
          setError('Acepta las normas para crear tu cuenta.');
          return;
        }
      } else if (!password) {
        setError('Escribe la contraseña de tu cuenta de vendedor.');
        return;
      }

      setSubmitting(true);
      setError('');
      setSuccess('');
      try {
        if (isRegistering) {
          const result = await registerSeller(email.trim(), password, businessName.trim());
          setPassword('');
          setShowPassword(false);
          if (result.emailConfirmationRequired) {
            setIsRegistering(false);
            setSuccess('Cuenta creada. Confirma tu correo y luego inicia sesión.');
          } else {
            router.push({
              pathname: '/profile',
              params: {
                role: 'seller',
                email: result.account.email,
                businessName: result.account.businessName,
              },
            });
          }
        } else {
          const seller = await loginSeller(email.trim(), password);
          router.push({
            pathname: '/profile',
            params: { role: 'seller', email: seller.email, businessName: seller.businessName },
          });
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'No se pudo validar la cuenta de vendedor.');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 8) {
      setError('Ingresa tu número salvadoreño de 8 dígitos.');
      return;
    }
   router.replace({ pathname: '/explore', params: { role: 'client', phone: `+503 ${digits}` } });  }

  return (
    <Screen>
      <Eyebrow>Cuenta de {isSeller ? 'vendedor' : 'cliente'}</Eyebrow>
      <PageHeading
        title="Qué bueno verte."
        description="Accede a tu cuenta para continuar en Nokory."
      />
      <Pressable onPress={() => router.replace('/role-select')} style={styles.changeRole}>
        <View style={styles.changeRoleContent}>
          <SymbolView name={{ ios: 'arrow.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={palette.muted} size={16} />
          <Text style={styles.changeRoleText}>Cambiar tipo de perfil</Text>
        </View>
      </Pressable>
      <View style={styles.formCard}>
        <View style={styles.formHeading}>
          <View style={[styles.avatar, isSeller ? styles.sellerAvatar : null]}>
            <SymbolView name={{ ios: isSeller ? 'storefront.fill' : 'heart.fill', android: isSeller ? 'storefront' : 'favorite', web: isSeller ? 'storefront' : 'favorite' }} tintColor={isSeller ? '#527346' : palette.purple} size={22} />
          </View>
          <View>
            <Text style={styles.roleLabel}>{isSeller ? 'VENDEDOR' : 'CLIENTE'}</Text>
            <Text style={styles.formTitle}>{isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
          </View>
        </View>

        {isSeller ? (
          <>
            {isRegistering ? <Field autoCapitalize="words" label="Nombre del negocio" onChangeText={setBusinessName} placeholder="Escribe el nombre de tu negocio" value={businessName} /> : null}
            <Field autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="Correo electrónico" onChangeText={setEmail} placeholder="nombre@correo.com" value={email} />
            <View style={styles.passwordField}>
              <Text style={styles.fieldLabel}>Contraseña</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete={isRegistering ? 'new-password' : 'current-password'}
                onChangeText={setPassword}
                placeholder="Ingresa tu contraseña"
                placeholderTextColor="#A39BA7"
                secureTextEntry={!showPassword}
                style={styles.passwordInput}
                value={password}
              />
              <Pressable
                accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                accessibilityRole="button"
                onPress={() => setShowPassword(!showPassword)}
                style={styles.passwordVisibility}
              >
                <SymbolView
                  name={{ ios: showPassword ? 'eye' : 'eye.slash', android: showPassword ? 'visibility' : 'visibility_off', web: showPassword ? 'visibility' : 'visibility_off' }}
                  tintColor={palette.muted}
                  size={19}
                />
              </Pressable>
            </View>
            {missingPasswordRequirements.length > 0 ? (
              <View accessibilityLiveRegion="polite" style={styles.passwordRequirements}>
                {missingPasswordRequirements.map((requirement) => (
                  <Text key={requirement} style={styles.passwordRequirement}>• {requirement}</Text>
                ))}
              </View>
            ) : null}
            {isRegistering ? (
              <Pressable onPress={() => setAccepted(!accepted)} style={styles.termsRow}>
                <View style={[styles.checkbox, accepted && styles.checkboxActive]}>{accepted ? <Text style={styles.checkmark}>✓</Text> : null}</View>
                <Text style={styles.termsText}>Acepto las normas de la comunidad</Text>
              </Pressable>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.fieldLabel}>Número telefónico</Text>
            <View style={styles.phoneRow}>
              <View style={styles.countryCode}><Text style={styles.countryText}>+503</Text></View>
              <Field
                accessibilityLabel="Número telefónico salvadoreño"
                autoComplete="tel-national"
                keyboardType="phone-pad"
                label=""
                maxLength={8}
                onChangeText={(value) => setPhone(value.replace(/\D/g, '').slice(0, 8))}
                placeholder="0000 0000"
                value={phone}
                containerStyle={styles.phoneField}
                style={styles.phoneInput}
              />
            </View>
          </>
        )}

        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
        {isSeller ? (
          <>
            <PrimaryButton
              disabled={submitting}
              label={submitting ? 'Validando…' : isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}
              onPress={() => { void continueToProfile(); }}
            />
            {submitting ? <ActivityIndicator color={palette.purple} style={styles.spinner} /> : null}
            <View style={styles.divider} />
            <Text style={styles.switchPrompt}>{isRegistering ? '¿Ya tienes una cuenta?' : '¿Aún no tienes una cuenta?'}</Text>
            <Pressable
              disabled={submitting}
              onPress={() => {
                setError('');
                setSuccess('');
                setPassword('');
                setShowPassword(false);
                setIsRegistering(!isRegistering);
              }}
            >
              <Text style={styles.switchLink}>{isRegistering ? 'Iniciar sesión' : 'Regístrate'}</Text>
            </Pressable>
            <Text style={styles.privacy}>◉  Solo usamos tus datos para identificar tu cuenta.</Text>
          </>
        ) : <PrimaryButton label="Continuar" onPress={() => { void continueToProfile(); }} />}
      </View>
      <Text style={styles.note}>{isSeller ? 'Tu cuenta se autentica de forma segura con Supabase.' : 'Para comercios salvadoreños'}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  changeRole: { marginBottom: 13, marginTop: -10, paddingVertical: 8 },
  changeRoleContent: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  changeRoleText: { color: palette.muted, fontSize: 13, fontWeight: '600' },
  formCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, padding: 18, shadowColor: '#334331', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  formHeading: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 22 },
  avatar: { alignItems: 'center', backgroundColor: '#EEF2E8', borderRadius: 14, height: 48, justifyContent: 'center', width: 48 },
  sellerAvatar: { backgroundColor: '#E5EDDB' },
  roleLabel: { color: '#63834F', fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 3 },
  formTitle: { color: palette.purpleDark, fontSize: 22, fontWeight: '700' },
  fieldLabel: { color: palette.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  phoneRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 0 },
  phoneField: { flex: 1, marginBottom: 0 },
  phoneInput: { borderBottomLeftRadius: 0, borderTopLeftRadius: 0 },
  countryCode: { alignItems: 'center', backgroundColor: '#F1F3ED', borderColor: palette.border, borderBottomLeftRadius: 12, borderTopLeftRadius: 12, borderWidth: 1, height: 52, justifyContent: 'center', marginTop: 0, width: 58 },
  countryText: { color: palette.purple, fontSize: 14, fontWeight: '800' },
  termsRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 12, marginTop: -3 },
  checkbox: { alignItems: 'center', borderColor: '#B9C1B5', borderRadius: 5, borderWidth: 1.5, height: 19, justifyContent: 'center', width: 19 },
  checkboxActive: { backgroundColor: palette.purple, borderColor: palette.purple },
  checkmark: { color: palette.white, fontSize: 13, fontWeight: '800' },
  termsText: { color: palette.text, fontSize: 12 },
  error: { color: '#B23B45', fontSize: 12, marginTop: -4 },
  success: { color: '#477344', fontSize: 12, lineHeight: 18, marginTop: 2 },
  passwordField: { marginBottom: 16, position: 'relative' },
  passwordInput: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 11, borderWidth: 1, color: palette.text, fontSize: 15, minHeight: 48, paddingHorizontal: 13, paddingRight: 48 },
  passwordVisibility: { alignItems: 'center', height: 48, justifyContent: 'center', position: 'absolute', right: 4, top: 25, width: 40 },
  passwordRequirements: { marginBottom: 12, marginTop: -10 },
  passwordRequirement: { color: '#B23B45', fontSize: 11, lineHeight: 16 },
  spinner: { marginTop: 10 },
  divider: { backgroundColor: palette.border, height: 1, marginVertical: 14 },
  switchPrompt: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  switchLink: { color: palette.purple, fontSize: 13, fontWeight: '800', marginTop: 5, textAlign: 'center' },
  privacy: { color: palette.muted, fontSize: 10, marginTop: 18, textAlign: 'center' },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 13, textAlign: 'center' },
});
