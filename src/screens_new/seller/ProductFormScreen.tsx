import { createProduct, updateSellerProduct } from '@/services/products-api';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { Screen, palette } from '../shared/screen-ui';

const categories = [
  'Panadería',
  'Pupusería',
  'Frutas y Verduras',
  'Comida preparada',
  'Postres',
  'Lácteos',
  'Otros',
];

type SelectedPhoto = { uri: string; base64: string; mimeType: string };

function FormField({
  label,
  children,
  style,
  ...inputProps
}: TextInputProps & { label: string; children?: ReactNode }) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.inputWrap}>
        <TextInput
          placeholderTextColor="#A39BA7"
          style={[styles.input, children ? styles.inputWithIcon : undefined, style]}
          {...inputProps}
        />
        {children}
      </View>
    </View>
  );
}

export default function ProductFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    role?: string;
    email?: string;
    businessName?: string;
    id?: string;
    name?: string;
    description?: string;
    category?: string;
    price?: string;
    quantity?: string;
    pickupStart?: string;
    pickupEnd?: string;
    isEditing?: string;
  }>();

  const isEditing = params.isEditing === 'true' && Boolean(params.id);

  const exploreParams = {
    role: 'seller',
    ...(typeof params.email === 'string' ? { email: params.email } : {}),
    ...(typeof params.businessName === 'string' ? { businessName: params.businessName } : {}),
  };

  const [name, setName] = useState(params.name || '');
  const [description, setDescription] = useState(params.description || '');
  const [category, setCategory] = useState(params.category || categories[0]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [normalPrice, setNormalPrice] = useState('');
  const [rescuePrice, setRescuePrice] = useState(params.price || '');
  const [quantity, setQuantity] = useState(params.quantity || '1');
  const [expiryDate, setExpiryDate] = useState('Hoy');
  const [pickupSchedule, setPickupSchedule] = useState(
    params.pickupStart && params.pickupEnd
      ? `${params.pickupStart} - ${params.pickupEnd}`
      : '17:00 - 19:30'
  );
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Cálculo automático del porcentaje de descuento
  const numNormal = parseFloat(normalPrice.replace(',', '.')) || 0;
  const numRescue = parseFloat(rescuePrice.replace(',', '.')) || 0;
  const discountPercent =
    numNormal > numRescue && numNormal > 0
      ? Math.round(((numNormal - numRescue) / numNormal) * 100)
      : 0;
  const savedAmount = numNormal > numRescue ? (numNormal - numRescue).toFixed(2) : '0.00';

  async function choosePhoto() {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
        base64: true,
      });
      if (result.canceled) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError('No se pudo leer la imagen. Elige otra foto.');
        return;
      }
      const mimeType = asset.mimeType || 'image/jpeg';
      setPhoto({ uri: asset.uri, base64: asset.base64, mimeType });
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo abrir la galería.');
    }
  }

  async function handleSubmit() {
    const numericPrice = Number(rescuePrice.replace(',', '.'));
    const numericQuantity = Number(quantity);
    const pickupTimes = pickupSchedule.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);

    if (name.trim().length < 3) {
      return setError('Escribe el nombre del producto o pack (mínimo 3 letras).');
    }
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
      return setError('Ingresa un precio de rescate válido mayor a cero.');
    }
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1) {
      return setError('La cantidad debe ser al menos 1 pack.');
    }
    if (!pickupTimes) {
      return setError('Indica el horario de recogida en formato HH:MM - HH:MM (ej. 17:00 - 19:30).');
    }

    setSaving(true);
    setError('');

    try {
      if (isEditing && params.id) {
        // Modo Edición
        await updateSellerProduct(params.id, {
          name: name.trim(),
          description: description.trim(),
          category,
          price: numericPrice,
          quantity: numericQuantity,
          pickupStart: pickupTimes[1],
          pickupEnd: pickupTimes[2],
        });
      } else {
        // Modo Creación
        await createProduct({
          name: name.trim(),
          description: description.trim(),
          category,
          price: numericPrice,
          quantity: numericQuantity,
          pickupStart: pickupTimes[1],
          pickupEnd: pickupTimes[2],
          photo: photo ? { base64: photo.base64, mimeType: photo.mimeType } : null,
        });
      }

      router.replace({ pathname: '/explore', params: exploreParams });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo guardar el producto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      {/* Cabecera */}
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>
            {isEditing ? 'EDITAR PRODUCTO' : 'NUEVA PUBLICACIÓN'}
          </Text>
          <Text style={styles.headerTitle}>
            {isEditing ? 'Modifica tu oferta' : 'Publica un producto'}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Cerrar formulario"
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/explore', params: exploreParams }))}
          style={styles.closeButton}
        >
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={palette.purpleDark} size={16} />
        </Pressable>
      </View>

      {/* Selector de Foto */}
      <View style={styles.photoUpload}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
        ) : (
          <View style={styles.photoPrompt}>
            <SymbolView name={{ ios: 'camera.fill', android: 'photo_camera', web: 'photo_camera' }} tintColor={palette.purple} size={26} />
            <Text style={styles.photoPromptText}>Foto real del producto o pack</Text>
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={() => { void choosePhoto(); }} style={styles.addPhotoButton}>
          <SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} tintColor={palette.white} size={13} />
          <Text style={styles.addPhotoText}>{photo ? 'Cambiar foto' : 'Agregar foto'}</Text>
        </Pressable>
      </View>

      {/* Nombre */}
      <FormField
        autoCapitalize="sentences"
        label="Nombre del producto o pack"
        onChangeText={setName}
        placeholder="Ej. Pack sorpresa de pan dulce y repostería"
        value={name}
      />

      {/* Categoría */}
      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Categoría</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: categoryOpen }}
          onPress={() => setCategoryOpen(!categoryOpen)}
          style={styles.selectButton}
        >
          <Text style={styles.selectText}>{category}</Text>
          <SymbolView name={{ ios: 'chevron.down', android: 'keyboard_arrow_down', web: 'keyboard_arrow_down' }} tintColor={palette.text} size={17} />
        </Pressable>
        {categoryOpen ? (
          <View style={styles.categoryOptions}>
            {categories.map((item) => (
              <Pressable
                accessibilityRole="button"
                key={item}
                onPress={() => {
                  setCategory(item);
                  setCategoryOpen(false);
                }}
                style={styles.categoryOption}
              >
                <Text style={[styles.selectText, item === category && styles.selectedCategory]}>{item}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
      </View>

      {/* Aviso de alimentos */}
      <View style={styles.notice}>
        <Text style={styles.noticeText}>Solo se permiten alimentos y bebidas aptos para consumo.</Text>
      </View>

      {/* Precios: Normal vs Rescate */}
      <View style={styles.row}>
        <View style={[styles.flex1, { marginRight: 8 }]}>
          <FormField
            keyboardType="decimal-pad"
            label="Precio normal (USD)"
            onChangeText={setNormalPrice}
            placeholder="Ej. 10.00"
            value={normalPrice}
          />
        </View>

        <View style={[styles.flex1, { marginLeft: 8 }]}>
          <FormField
            keyboardType="decimal-pad"
            label="Precio rescate (USD)"
            onChangeText={setRescuePrice}
            placeholder="Ej. 4.50"
            value={rescuePrice}
          />
        </View>
      </View>

      {/* Banner de descuento calculado automáticamente */}
      {discountPercent > 0 ? (
        <View style={styles.discountBanner}>
          <SymbolView name={{ ios: 'tag.fill', android: 'local_offer', web: 'local_offer' }} tintColor="#2E7D32" size={16} />
          <Text style={styles.discountBannerText}>
            {discountPercent}% de descuento · Cliente ahorra ${savedAmount}
          </Text>
        </View>
      ) : null}

      {/* Packs y Horario */}
      <View style={styles.row}>
        <View style={[styles.flex1, { marginRight: 8 }]}>
          <FormField
            keyboardType="number-pad"
            label="Packs disponibles"
            onChangeText={setQuantity}
            placeholder="1"
            value={quantity}
          />
        </View>

        <View style={[styles.flex1, { marginLeft: 8 }]}>
          <FormField
            autoCapitalize="none"
            label="Horario recogida"
            onChangeText={setPickupSchedule}
            placeholder="17:00 - 19:30"
            value={pickupSchedule}
          />
        </View>
      </View>

      {/* Vencimiento */}
      <FormField
        autoCapitalize="none"
        label="Fecha de vencimiento"
        onChangeText={setExpiryDate}
        placeholder="Hoy, 30/10/2026"
        value={expiryDate}
      >
        <SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} tintColor={palette.muted} size={16} style={styles.trailingIcon} />
      </FormField>

      {/* Descripción */}
      <FormField
        autoCapitalize="sentences"
        label="Descripción del contenido"
        multiline
        onChangeText={setDescription}
        placeholder="Describe qué productos incluye el pack o detalles de recogida"
        style={styles.multiline}
        value={description}
      />

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

      {/* Botones de Acción */}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => { void handleSubmit(); }}
          style={[styles.publishButton, saving && styles.disabledButton]}
        >
          {saving ? (
            <ActivityIndicator color={palette.white} size="small" />
          ) : (
            <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={palette.white} size={15} />
          )}
          <Text style={styles.publishText}>
            {saving ? 'Guardando…' : isEditing ? 'Guardar cambios' : 'Publicar producto'}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/explore', params: exploreParams }))}
          style={styles.cancelButton}
        >
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 18, paddingTop: 14, paddingBottom: 24 },
  header: {
    alignItems: 'center',
    borderBottomColor: '#F0EAF2',
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 14,
  },
  headerCopy: { flex: 1 },
  headerEyebrow: { color: palette.purple, fontSize: 11, fontWeight: '800', letterSpacing: 1.1, marginBottom: 4 },
  headerTitle: { color: palette.purpleDark, fontSize: 24, fontWeight: '800' },
  closeButton: {
    alignItems: 'center',
    backgroundColor: '#F5ECFB',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    marginLeft: 10,
    width: 36,
  },
  photoUpload: {
    alignItems: 'center',
    backgroundColor: '#F8F1FC',
    borderColor: '#D9C6E8',
    borderRadius: 14,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    height: 136,
    justifyContent: 'center',
    marginBottom: 16,
    overflow: 'hidden',
  },
  photoPreview: { height: '100%', position: 'absolute', width: '100%' },
  photoPrompt: { alignItems: 'center', gap: 6 },
  photoPromptText: { color: palette.purple, fontSize: 12, fontWeight: '700' },
  addPhotoButton: {
    alignItems: 'center',
    backgroundColor: palette.purpleDark,
    borderRadius: 8,
    bottom: 10,
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    position: 'absolute',
    right: 10,
  },
  addPhotoText: { color: palette.white, fontSize: 11, fontWeight: '700' },
  fieldGroup: { marginBottom: 12 },
  label: { color: palette.purpleDark, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  inputWrap: { justifyContent: 'center' },
  input: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 11,
    borderWidth: 1,
    color: palette.text,
    fontSize: 14,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  inputWithIcon: { paddingRight: 38 },
  trailingIcon: { position: 'absolute', right: 12 },
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
  },
  selectText: { color: palette.text, fontSize: 13, fontWeight: '600' },
  categoryOptions: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 11,
    borderWidth: 1,
    marginTop: 4,
    overflow: 'hidden',
  },
  categoryOption: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 14 },
  selectedCategory: { color: palette.purple, fontWeight: '800' },
  notice: {
    backgroundColor: '#EDF5DC',
    borderRadius: 10,
    justifyContent: 'center',
    marginBottom: 12,
    minHeight: 34,
    paddingHorizontal: 12,
  },
  noticeText: { color: '#4F7744', fontSize: 11, fontWeight: '600' },
  row: { flexDirection: 'row' },
  flex1: { flex: 1 },
  discountBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  discountBannerText: { color: '#2E7D32', fontSize: 12, fontWeight: '700' },
  multiline: { height: 80, paddingTop: 10, textAlignVertical: 'top' },
  error: { color: '#B23B45', fontSize: 12, lineHeight: 17, marginBottom: 10 },
  actions: { borderTopColor: palette.border, borderTopWidth: 1, marginTop: 4, paddingTop: 14 },
  publishButton: {
    alignItems: 'center',
    backgroundColor: palette.purpleDark,
    borderRadius: 12,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 48,
  },
  publishText: { color: palette.white, fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.7 },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: '#F5ECFB',
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 8,
    minHeight: 44,
  },
  cancelText: { color: palette.purpleDark, fontSize: 14, fontWeight: '700' },
});
