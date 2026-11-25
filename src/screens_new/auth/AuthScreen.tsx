import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  completePendingProfilePhoto,
  validateProfilePhoto,
  type ProfilePhoto,
} from '@/services/account-api';
import {
  getClientAuthErrorMessage,
  getPersistedClientEmail,
  loginClient,
  registerClient,
} from '@/services/client-auth-api';
import { Checkbox, Eyebrow, Field, FormError, PageHeading, PrimaryButton, Screen, SecondaryButton, palette } from '../shared/screen-ui';

export default function AuthScreen() {
  const router = useRouter();
  const [isRegistering, setIsRegistering] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [profilePhoto, setProfilePhoto] = useState<ProfilePhoto | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const persistedEmail = await getPersistedClientEmail();
        if (!active || !persistedEmail) return;
        await completePendingProfilePhoto(persistedEmail);
        if (active) {
          router.replace({
            pathname: '/explore',
            params: {
              role: 'client',
              email: persistedEmail,
            },
          });
        }
      } catch (cause) {
        if (active) setError(getClientAuthErrorMessage(cause, 'No se pudo restaurar la sesión de cliente.'));
      }
    })();
    return () => { active = false; };
  }, [router]);

  async function chooseProfilePhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError('No se pudo leer la imagen. Elige otra foto.');
        return;
      }
      const photo = { base64: asset.base64, mimeType: asset.mimeType || 'image/jpeg' };
      validateProfilePhoto(photo);
      setProfilePhoto(photo);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir la galería.');
    }
  }

  async function continueToProfile() {
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      setError('Escribe un correo electrónico válido.');
      return;
    }

    if (isRegistering && fullName.trim().length < 2) {
      setError('Escribe tu nombre completo.');
      return;
    }
    if (!password) {
      setError('Escribe la contraseña de tu cuenta.');
      return;
    }
    if (isRegistering && Array.from(password).length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    if (isRegistering) {
      if (!profilePhoto) {
        setError('Selecciona una foto de perfil.');
        return;
      }
      if (!accepted) {
        setError('Acepta las normas de la comunidad para crear tu cuenta.');
        return;
      }
    }

    setSubmitting(true);
    setError('');
    setSuccess('');
    try {
      if (isRegistering) {
        const result = await registerClient(normalizedEmail, password, fullName, profilePhoto, accepted);
        setPassword('');
        setShowPassword(false);
        if (result.emailConfirmationRequired) {
          setIsRegistering(false);
          setSuccess('Cuenta creada. Confirma tu correo y luego inicia sesión con tu contraseña.');
        }
      } else {
        const authenticatedEmail = await loginClient(normalizedEmail, password);
        await completePendingProfilePhoto(authenticatedEmail);
        setPassword('');
        setShowPassword(false);
        router.replace({
          pathname: '/explore',
          params: {
            role: 'client',
            email: authenticatedEmail,
          },
        });
      }
    } catch (cause) {
      setError(getClientAuthErrorMessage(cause, 'No se pudo validar tu cuenta de cliente.'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Eyebrow>Cuenta de cliente</Eyebrow>
      <PageHeading
        title="Qué bueno verte."
        description="Accede a tu cuenta para continuar en Nokory."
      />
      <View style={styles.formCard}>
        <View style={styles.formHeading}>
          <View style={styles.avatar}>
            {profilePhoto ? (
              <Image
                accessibilityLabel="Foto de perfil seleccionada"
                source={{ uri: `data:${profilePhoto.mimeType};base64,${profilePhoto.base64}` }}
                style={styles.avatarImage}
              />
            ) : (
              <SymbolView name={{ ios: 'person.fill', android: 'person', web: 'person' }} tintColor={palette.purple} size={22} />
            )}
          </View>
          <View>
            <Text style={styles.roleLabel}>CLIENTE</Text>
            <Text style={styles.formTitle}>{isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}</Text>
          </View>
        </View>

        {isRegistering ? (
          <>
            <Field
              accessibilityLabel="Nombre completo"
              autoCapitalize="words"
              autoComplete="name"
              label="Nombre completo"
              onChangeText={setFullName}
              placeholder="Escribe tu nombre completo"
              value={fullName}
            />
            <SecondaryButton
              accessibilityLabel={profilePhoto ? 'Cambiar foto de perfil' : 'Seleccionar foto de perfil'}
              label={profilePhoto ? 'Cambiar foto de perfil' : 'Seleccionar foto de perfil'}
              onPress={() => { void chooseProfilePhoto(); }}
            />
            <Field
              accessibilityLabel="Correo electrónico del cliente"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              label="Correo electrónico"
              onChangeText={setEmail}
              placeholder="nombre@correo.com"
              value={email}
            />
            <View style={styles.passwordField}>
              <Text style={styles.fieldLabel}>Contraseña</Text>
              <TextInput
                accessibilityLabel="Contraseña de cliente"
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setPassword}
                placeholder="Crea una contraseña (mínimo 8 caracteres)"
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
            <Checkbox
              accessibilityLabel="Aceptar las normas de la comunidad"
              checked={accepted}
              label="Acepto las normas de la comunidad"
              onPress={() => setAccepted(!accepted)}
            />
          </>
        ) : (
          <>
            <Field accessibilityLabel="Correo electrónico del cliente" autoCapitalize="none" autoComplete="email" keyboardType="email-address" label="Correo electrónico" onChangeText={setEmail} placeholder="nombre@correo.com" value={email} />
            <View style={styles.passwordField}>
              <Text style={styles.fieldLabel}>Contraseña</Text>
              <TextInput
                accessibilityLabel="Contraseña de cliente"
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
          </>
        )}

        <FormError message={error} />
        {success ? <Text accessibilityRole="alert" style={styles.success}>{success}</Text> : null}
        <PrimaryButton
          disabled={submitting}
          label={submitting ? 'Validando…' : isRegistering ? 'Crear cuenta' : 'Iniciar sesión'}
          onPress={() => { void continueToProfile(); }}
        />
        {submitting ? <ActivityIndicator color={palette.purple} style={styles.spinner} /> : null}
        <View style={styles.divider} />
        <Text style={styles.switchPrompt}>{isRegistering ? '¿Ya tienes una cuenta?' : '¿Aún no tienes una cuenta?'}</Text>
        <Pressable
          accessibilityLabel={isRegistering ? 'Iniciar sesión' : 'Crear cuenta'}
          accessibilityRole="button"
          disabled={submitting}
          onPress={() => {
            setError('');
            setSuccess('');
            setPassword('');
            setShowPassword(false);
            setIsRegistering(!isRegistering);
          }}
        >
          <Text style={styles.switchLink}>{isRegistering ? 'Iniciar sesión' : 'Crear cuenta'}</Text>
        </Pressable>
        <Text style={styles.privacy}>Tu cuenta y tus reservas se vinculan a tu sesión de Supabase.</Text>
      </View>
      <Text style={styles.note}>Usa tu correo y contraseña. El inicio de sesión no solicita códigos ni enlaces mágicos.</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  formCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, padding: 18, shadowColor: '#334331', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.06, shadowRadius: 10, elevation: 2 },
  formHeading: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 22 },
  avatar: { alignItems: 'center', backgroundColor: '#EEF2E8', borderRadius: 14, height: 48, justifyContent: 'center', width: 48 },
  avatarImage: { ...StyleSheet.absoluteFill, borderRadius: 14 },
  roleLabel: { color: '#63834F', fontSize: 10, fontWeight: '800', letterSpacing: 1.3, marginBottom: 3 },
  formTitle: { color: palette.purpleDark, fontSize: 22, fontWeight: '700' },
  fieldLabel: { color: palette.text, fontSize: 13, fontWeight: '700', marginBottom: 8 },
  success: { color: '#477344', fontSize: 12, lineHeight: 18, marginTop: 2 },
  passwordField: { marginBottom: 16, position: 'relative' },
  passwordInput: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 11, borderWidth: 1, color: palette.text, fontSize: 15, minHeight: 48, paddingHorizontal: 13, paddingRight: 48 },
  passwordVisibility: { alignItems: 'center', height: 48, justifyContent: 'center', position: 'absolute', right: 4, top: 25, width: 40 },
  spinner: { marginTop: 10 },
  divider: { backgroundColor: palette.border, height: 1, marginVertical: 14 },
  switchPrompt: { color: palette.muted, fontSize: 12, textAlign: 'center' },
  switchLink: { color: palette.purple, fontSize: 13, fontWeight: '800', marginTop: 5, textAlign: 'center' },
  privacy: { color: palette.muted, fontSize: 10, marginTop: 18, textAlign: 'center' },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, marginTop: 13, textAlign: 'center' },
});
