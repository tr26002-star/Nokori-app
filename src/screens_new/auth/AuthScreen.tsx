import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Eyebrow, Field, PageHeading, PrimaryButton, Screen, palette } from '../shared/screen-ui';

export default function AuthScreen() {
  const router = useRouter();
  const { role } = useLocalSearchParams<{ role?: string }>();
  const isSeller = role === 'seller';
  const [isRegistering, setIsRegistering] = useState(false);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');

  function continueToProfile() {
    if (isSeller) {
      if (isRegistering && businessName.trim().length < 2) {
        setError('Escribe el nombre de tu negocio.');
        return;
      }
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        setError('Escribe un correo electrónico válido.');
        return;
      }
      if (password.length < 6) {
        setError('La contraseña debe tener al menos 6 caracteres.');
        return;
      }
      if (isRegistering && !accepted) {
        setError('Acepta las normas para crear tu cuenta.');
        return;
      }
      router.push({ pathname: '/profile', params: { role: 'seller', email: email.trim(), businessName: businessName.trim() } });
      return;
    }

    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 8) {
      setError('Ingresa tu número salvadoreño de 8 dígitos.');
      return;
    }
    router.push({ pathname: '/profile', params: { role: 'client', phone: `+503 ${digits}` } });
  }

  return (
    <Screen>
      <Eyebrow>Cuenta de {isSeller ? 'vendedor' : 'cliente'}</Eyebrow>
      <PageHeading title="Qué bueno verte." description="Accede a tu cuenta para continuar en Nokory." />
      <Pressable onPress={() => router.replace('/role-select')} style={styles.changeRole}>
        <Text style={styles.changeRoleText}>‹  Cambiar tipo de perfil</Text>
      </Pressable>
      <View style={styles.formCard}>
        <View style={styles.formHeading}>
          <View style={[styles.avatar, isSeller ? styles.sellerAvatar : null]}><Text style={styles.avatarText}>{isSeller ? '▣' : '♡'}</Text></View>
          <View>
            <Text style={styles.roleLabel}>{isSeller ? 'VENDEDOR' : 'CLIENTE'}</Text>
            <Text style={styles.formTitle}>{isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
          </View>
        </View>

        {isSeller ? (
          <>
            {isRegistering ? <Field autoCapitalize="words" label="Nombre del negocio" onChangeText={setBusinessName} placeholder="Nombre comercial" value={businessName} /> : null}
            <Field autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="Correo electrónico" onChangeText={setEmail} placeholder="nombre@correo.com" value={email} />
            <Field autoCapitalize="none" autoComplete={isRegistering ? 'new-password' : 'current-password'} label="Contraseña" onChangeText={setPassword} placeholder="Ingresa tu contraseña" secureTextEntry value={password} />
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
        <PrimaryButton label={isRegistering ? 'Crear cuenta' : 'Iniciar sesión'} onPress={continueToProfile} />
        <View style={styles.divider} />
        <Text style={styles.switchPrompt}>{isRegistering ? '¿Ya tienes una cuenta?' : '¿Aún no tienes cuenta?'}</Text>
        <Pressable onPress={() => { setError(''); setIsRegistering(!isRegistering); }}>
          <Text style={styles.switchLink}>{isRegistering ? 'Iniciar sesión' : 'Registrarme'}</Text>
        </Pressable>
        <Text style={styles.privacy}>◉  Solo usamos tus datos para identificar tu cuenta.</Text>
      </View>
      <Text style={styles.note}>Prototipo visual: el acceso aún no está conectado a un servicio de autenticación.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  changeRole: { marginBottom: 13, marginTop: -10, paddingVertical: 8 },
  changeRoleText: { color: palette.muted, fontSize: 13, fontWeight: '600' },
  formCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 22, borderWidth: 1, padding: 17, shadowColor: '#51396B', shadowOffset: { width: 0, height: 5 }, shadowOpacity: 0.07, shadowRadius: 12, elevation: 2 },
  formHeading: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 20 },
  avatar: { alignItems: 'center', backgroundColor: '#F1E5F7', borderRadius: 13, height: 45, justifyContent: 'center', width: 45 },
  sellerAvatar: { backgroundColor: '#EAF3D8' },
  avatarText: { color: palette.purple, fontSize: 23, fontWeight: '800' },
  roleLabel: { color: '#54825D', fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 2 },
  formTitle: { color: palette.purpleDark, fontSize: 22, fontWeight: '700' },
  fieldLabel: { color: palette.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  phoneRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 0 },
  phoneField: { flex: 1, marginBottom: 0 },
  phoneInput: { borderBottomLeftRadius: 0, borderTopLeftRadius: 0 },
  countryCode: { alignItems: 'center', backgroundColor: '#F4EFF9', borderColor: palette.border, borderBottomLeftRadius: 13, borderTopLeftRadius: 13, borderWidth: 1, height: 52, justifyContent: 'center', marginTop: 0, width: 58 },
  countryText: { color: palette.purple, fontSize: 14, fontWeight: '800' },
  termsRow: { alignItems: 'center', flexDirection: 'row', gap: 9, marginBottom: 12, marginTop: -3 },
  checkbox: { alignItems: 'center', borderColor: '#C8C0CC', borderRadius: 5, borderWidth: 1.5, height: 19, justifyContent: 'center', width: 19 },
  checkboxActive: { backgroundColor: palette.purple, borderColor: palette.purple },
  checkmark: { color: palette.white, fontSize: 13, fontWeight: '800' },
  termsText: { color: palette.text, fontSize: 12 },
  error: { color: '#B23B45', fontSize: 12, marginTop: -4 },
  divider: { backgroundColor: palette.border, height: 1, marginVertical: 14 },
  switchPrompt: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  switchLink: { color: palette.purple, fontSize: 13, fontWeight: '800', marginTop: 5, textAlign: 'center' },
  privacy: { color: palette.muted, fontSize: 10, marginTop: 18, textAlign: 'center' },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 13, textAlign: 'center' },
});
