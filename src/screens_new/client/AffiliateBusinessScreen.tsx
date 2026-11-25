import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, View } from 'react-native';
import {
  getCurrentAccountProfile,
  validateProfilePhoto,
  type ProfilePhoto,
} from '@/services/account-api';
import { formatSalvadoranNationalPhone } from '@/services/phone';
import { submitBusinessRequest } from '@/services/business-requests-api';
import {
  Checkbox,
  Eyebrow,
  Field,
  FormError,
  PageHeading,
  Panel,
  PrimaryButton,
  Screen,
  SecondaryButton,
} from '../shared/screen-ui';

type BusinessCoordinates = {
  latitude: number;
  longitude: number;
};

export default function AffiliateBusinessScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const [managerName, setManagerName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [businessEmail, setBusinessEmail] = useState('');
  const [businessPhone, setBusinessPhone] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [coordinates, setCoordinates] = useState<BusinessCoordinates | null>(null);
  const [photo, setPhoto] = useState<ProfilePhoto | null>(null);
  const [photoPreviewUri, setPhotoPreviewUri] = useState<string | null>(null);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [error, setError] = useState('');
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [eligible, setEligible] = useState(false);
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    void getCurrentAccountProfile()
      .then((account) => {
        if (!active) return;
        if (!account) {
          setError('Inicia sesión para solicitar la afiliación de un negocio.');
        } else if (account.hasBusinessRecord || account.businessRequest) {
          router.replace({
            pathname: '/profile',
            params: { role: 'client', ...(phone ? { phone } : {}) },
          });
        } else {
          setEligible(true);
        }
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo verificar tu cuenta.');
      })
      .finally(() => {
        if (active) setLoadingAccount(false);
      });
    return () => { active = false; };
  }, [phone, router]);

  async function chooseBusinessPhoto() {
    setError('');
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
      if (!asset.base64) throw new Error('No se pudo leer la imagen. Elige otra foto.');
      const selectedPhoto = { base64: asset.base64, mimeType: asset.mimeType || 'image/jpeg' };
      validateProfilePhoto(selectedPhoto);
      setPhoto(selectedPhoto);
      setPhotoPreviewUri(asset.uri);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo seleccionar la foto del negocio.');
    }
  }

  async function markBusinessLocation() {
    if (locating) return;
    setLocating(true);
    setError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (!permission.granted) {
        throw new Error('Permite el acceso a la ubicación para marcar la ubicación del negocio.');
      }
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setCoordinates({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo obtener la ubicación del negocio.');
    } finally {
      setLocating(false);
    }
  }

  async function submit() {
    setError('');
    if (!eligible) {
      setError('No se puede enviar una solicitud con esta cuenta.');
      return;
    }
    if (!managerName.trim()) {
      setError('Escribe el nombre del encargado.');
      return;
    }
    if (!businessName.trim()) {
      setError('Escribe el nombre del negocio.');
      return;
    }
    if (!businessEmail.trim()) {
      setError('Escribe el correo del negocio.');
      return;
    }
    if (!businessPhone.replace(/\D/g, '')) {
      setError('Escribe el teléfono del negocio.');
      return;
    }
    if (!address.trim()) {
      setError('Escribe la dirección exacta del negocio.');
      return;
    }
    if (!coordinates) {
      setError('Marca la ubicación del negocio.');
      return;
    }
    if (!description.trim()) {
      setError('Describe los productos que ofrece el negocio.');
      return;
    }
    if (!photo) {
      setError('Selecciona una foto del negocio.');
      return;
    }
    if (!acceptedPrivacy) {
      setError('Acepta la política de privacidad para continuar.');
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitBusinessRequest({
        managerName,
        businessName,
        businessEmail,
        businessPhone,
        address,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
        description,
        photo,
      });
      Alert.alert('Solicitud registrada', result.notificationMessage, [
        {
          text: 'Entendido',
          onPress: () => router.replace({
            pathname: '/profile',
            params: { role: 'client', ...(phone ? { phone } : {}) },
          }),
        },
      ]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo enviar la solicitud.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Screen>
      <Eyebrow>Negocios</Eyebrow>
      <PageHeading
        title="Afiliar negocio"
        description="Completa la información para solicitar la revisión del negocio."
      />
      <Panel>
        <Field
          accessibilityLabel="Nombre del encargado"
          autoCapitalize="words"
          label="Nombre del encargado"
          onChangeText={setManagerName}
          placeholder="Nombre completo"
          value={managerName}
        />
        <Field
          accessibilityLabel="Nombre del negocio"
          autoCapitalize="words"
          label="Nombre del negocio"
          onChangeText={setBusinessName}
          placeholder="Nombre comercial"
          value={businessName}
        />
        <Field
          accessibilityLabel="Correo del negocio"
          autoCapitalize="none"
          keyboardType="email-address"
          label="Correo del negocio"
          onChangeText={setBusinessEmail}
          placeholder="negocio@correo.com"
          value={businessEmail}
        />
        <Field
          accessibilityLabel="Teléfono del negocio de ocho dígitos"
          keyboardType="phone-pad"
          label="Teléfono del negocio"
          maxLength={9}
          onChangeText={(value) => setBusinessPhone(formatSalvadoranNationalPhone(value))}
          placeholder="0000-0000"
          value={businessPhone}
        />
        <Field
          accessibilityLabel="Dirección exacta del negocio"
          autoCapitalize="sentences"
          label="Dirección exacta"
          onChangeText={setAddress}
          placeholder="Escribe la dirección del negocio"
          value={address}
        />
        <Field
          accessibilityLabel="Ubicación del negocio"
          editable={false}
          label="Ubicación del negocio"
          placeholder="Ubicación sin marcar"
          value={coordinates
            ? `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`
            : ''}
        />
        <SecondaryButton
          accessibilityLabel="Marcar ubicación del negocio"
          disabled={locating || submitting}
          label={locating ? 'Obteniendo ubicación…' : 'Marcar ubicación del negocio'}
          onPress={() => { void markBusinessLocation(); }}
        />
        <Field
          accessibilityLabel="Foto del negocio"
          editable={false}
          label="Foto del negocio"
          placeholder="Foto obligatoria"
          value={photo ? 'Foto seleccionada' : ''}
        />
        {photoPreviewUri ? (
          <View style={styles.photoPreview}>
            <Image
              accessibilityLabel="Vista previa circular de la foto del negocio"
              resizeMode="cover"
              source={{ uri: photoPreviewUri }}
              style={styles.photoPreviewImage}
            />
          </View>
        ) : null}
        <SecondaryButton
          accessibilityLabel={photo ? 'Cambiar foto del negocio' : 'Seleccionar foto del negocio'}
          disabled={submitting}
          label={photo ? 'Cambiar foto del negocio' : 'Seleccionar foto del negocio'}
          onPress={() => { void chooseBusinessPhoto(); }}
        />
        <Field
          accessibilityLabel="Descripción de lo que vende el negocio"
          autoCapitalize="sentences"
          label="Descripción de lo que vende"
          multiline
          onChangeText={setDescription}
          placeholder="Describe los productos que ofrece el negocio"
          value={description}
        />
        <Checkbox
          accessibilityLabel="Aceptar la política de privacidad"
          checked={acceptedPrivacy}
          label="Acepto la política de privacidad"
          onPress={() => setAcceptedPrivacy((current) => !current)}
        />
        <FormError message={error} />
        <PrimaryButton
          accessibilityLabel="Enviar solicitud de afiliación"
          disabled={loadingAccount || !eligible || submitting}
          label={submitting ? 'Enviando solicitud…' : 'Enviar solicitud'}
          onPress={() => { void submit(); }}
        />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  photoPreview: {
    alignSelf: 'center',
    borderRadius: 23,
    height: 46,
    marginVertical: 8,
    overflow: 'hidden',
    width: 46,
  },
  photoPreviewImage: {
    height: '100%',
    width: '100%',
  },
});
