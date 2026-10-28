import { createProduct } from '@/services/products-api';
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

const categories = ['Panadería', 'Pupusería', 'Comida preparada', 'Postres', 'Otros'];
type SelectedPhoto = { uri: string; base64: string; mimeType: string };

function FormField({ label, children, style, ...inputProps }: TextInputProps & { label: string; children?: ReactNode }) {
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

export default function PublishProductScreen() {
  const router = useRouter();
  const { sellerName: sellerNameParam } = useLocalSearchParams<{ sellerName?: string }>();
  const sellerName = typeof sellerNameParam === 'string' && sellerNameParam.trim() ? sellerNameParam.trim() : 'Negocio Nokory';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [normalPrice, setNormalPrice] = useState('');
  const [rescuePrice, setRescuePrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [expiryDate, setExpiryDate] = useState('');
  const [pickupSchedule, setPickupSchedule] = useState('Hoy, 16:00 - 20:00');
  const [photo, setPhoto] = useState<SelectedPhoto | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

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

  async function publish() {
    const numericPrice = Number(rescuePrice.replace(',', '.'));
    const numericQuantity = Number(quantity);
    const pickupTimes = pickupSchedule.match(/(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})/);
    if (name.trim().length < 3) return setError('Escribe el nombre del producto o pack.');
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return setError('Ingresa un precio de rescate mayor que cero.');
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1) return setError('La cantidad debe ser al menos una unidad.');
    if (!pickupTimes) return setError('Indica el horario de recogida en formato HH:MM - HH:MM.');
    setSaving(true);
    setError('');
    try {
      await createProduct({
        name: name.trim(),
        description: description.trim(),
        category,
        price: numericPrice,
        quantity: numericQuantity,
        pickupStart: pickupTimes[1],
        pickupEnd: pickupTimes[2],
        sellerName,
        photo: photo ? { base64: photo.base64, mimeType: photo.mimeType } : null,
      });
      router.replace('/explore');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo publicar el producto.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={styles.headerEyebrow}>NUEVA PUBLICACIÓN</Text>
          <Text style={styles.headerTitle}>Publica un producto</Text>
        </View>
        <Pressable
          accessibilityLabel="Cerrar nueva publicación"
          accessibilityRole="button"
          onPress={() => router.canGoBack() ? router.back() : router.replace('/explore')}
          style={styles.closeButton}
        >
          <SymbolView name={{ ios: 'xmark', android: 'close', web: 'close' }} tintColor={palette.purpleDark} size={14} />
        </Pressable>
      </View>

      <View style={styles.photoUpload}>
        {photo ? (
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
        ) : (
          <View style={styles.photoPrompt}>
            <SymbolView name={{ ios: 'plus', android: 'add', web: 'add' }} tintColor={palette.purple} size={19} />
            <Text style={styles.photoPromptText}>Agrega una foto real del producto</Text>
          </View>
        )}
        <Pressable accessibilityRole="button" onPress={() => { void choosePhoto(); }} style={styles.addPhotoButton}>
          <SymbolView name={{ ios: 'pencil', android: 'edit', web: 'edit' }} tintColor={palette.white} size={12} />
          <Text style={styles.addPhotoText}>Agregar foto</Text>
        </Pressable>
      </View>

      <FormField
        autoCapitalize="sentences"
        label="Nombre del producto"
        onChangeText={setName}
        placeholder="Ej. Pack sorpresa"
        value={name}
      />

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

      <View style={styles.notice}>
        <Text style={styles.noticeText}>Solo se permiten alimentos y bebidas aptos para consumo.</Text>
      </View>

      <FormField
        keyboardType="decimal-pad"
        label="Precio normal (USD)"
        onChangeText={setNormalPrice}
        placeholder=""
        value={normalPrice}
      >
        <SymbolView name={{ ios: 'arrow.up.arrow.down', android: 'unfold_more', web: 'unfold_more' }} tintColor="#827A86" size={16} style={styles.trailingIcon} />
      </FormField>

      <FormField
        keyboardType="decimal-pad"
        label="Precio rescate (USD)"
        onChangeText={setRescuePrice}
        placeholder=""
        value={rescuePrice}
      />

      <FormField
        keyboardType="number-pad"
        label="Cantidad disponible"
        onChangeText={setQuantity}
        placeholder="1"
        value={quantity}
      />

      <FormField
        autoCapitalize="none"
        label="Vencimiento"
        onChangeText={setExpiryDate}
        placeholder="mm/dd/yyyy"
        value={expiryDate}
      >
        <SymbolView name={{ ios: 'calendar', android: 'calendar_month', web: 'calendar_month' }} tintColor={palette.text} size={15} style={styles.trailingIcon} />
      </FormField>

      <FormField
        autoCapitalize="none"
        label="Horario de recogida"
        onChangeText={setPickupSchedule}
        placeholder="Hoy, 16:00 - 20:00"
        value={pickupSchedule}
      />

      <FormField
        autoCapitalize="sentences"
        label="Descripción"
        multiline
        onChangeText={setDescription}
        placeholder="Describe qué puede recibir el cliente"
        style={styles.multiline}
        value={description}
      />

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: saving }}
          disabled={saving}
          onPress={() => { void publish(); }}
          style={[styles.publishButton, saving && styles.disabledButton]}
        >
          {saving ? <ActivityIndicator color={palette.white} size="small" /> : <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={palette.white} size={14} />}
          <Text style={styles.publishText}>{saving ? 'Publicando…' : 'Publicar producto'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.canGoBack() ? router.back() : router.replace('/explore')} style={styles.cancelButton}>
          <Text style={styles.cancelText}>Cancelar</Text>
        </Pressable>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 20 },
  header: { alignItems: 'center', borderBottomColor: '#F0EAF2', borderBottomWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, paddingBottom: 14 },
  headerCopy: { flex: 1 },
  headerEyebrow: { color: palette.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.1, marginBottom: 7 },
  headerTitle: { color: palette.purpleDark, fontSize: 20, fontWeight: '600' },
  closeButton: { alignItems: 'center', backgroundColor: '#F5ECFB', borderRadius: 18, height: 36, justifyContent: 'center', marginLeft: 10, width: 36 },
  photoUpload: { alignItems: 'center', backgroundColor: '#F7EEFC', borderColor: '#D9C6E8', borderRadius: 12, borderStyle: 'dashed', borderWidth: 1, height: 126, justifyContent: 'center', marginBottom: 14, overflow: 'hidden' },
  photoPreview: { height: '100%', position: 'absolute', width: '100%' },
  photoPrompt: { alignItems: 'center', gap: 3, marginTop: -23 },
  photoPromptText: { color: palette.purple, fontSize: 10, fontWeight: '700' },
  addPhotoButton: { alignItems: 'center', backgroundColor: palette.purpleDark, borderRadius: 7, bottom: 8, flexDirection: 'row', gap: 5, paddingHorizontal: 9, paddingVertical: 6, position: 'absolute', right: 9 },
  addPhotoText: { color: palette.white, fontSize: 9, fontWeight: '700' },
  fieldGroup: { marginBottom: 9 },
  label: { color: palette.purpleDark, fontSize: 11, fontWeight: '700', marginBottom: 5 },
  inputWrap: { justifyContent: 'center' },
  input: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 9, borderWidth: 1, color: palette.text, fontSize: 12, minHeight: 39, paddingHorizontal: 11, paddingVertical: 7 },
  inputWithIcon: { paddingRight: 33 },
  trailingIcon: { position: 'absolute', right: 10 },
  selectButton: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 9, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', minHeight: 39, paddingHorizontal: 11 },
  selectText: { color: palette.text, fontSize: 12 },
  categoryOptions: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 9, borderWidth: 1, marginTop: 3, overflow: 'hidden' },
  categoryOption: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 11 },
  selectedCategory: { color: palette.purple, fontWeight: '700' },
  notice: { backgroundColor: '#EEF7DB', borderRadius: 8, justifyContent: 'center', marginBottom: 10, minHeight: 30, paddingHorizontal: 9 },
  noticeText: { color: '#557946', fontSize: 9, fontWeight: '600' },
  multiline: { height: 72, paddingTop: 10, textAlignVertical: 'top' },
  error: { color: '#B23B45', fontSize: 11, lineHeight: 16, marginBottom: 7 },
  actions: { borderTopColor: palette.border, borderTopWidth: 1, marginTop: 1, paddingTop: 10 },
  publishButton: { alignItems: 'center', backgroundColor: '#41166B', borderRadius: 10, flexDirection: 'row', gap: 8, justifyContent: 'center', minHeight: 44 },
  publishText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  disabledButton: { opacity: 0.7 },
  cancelButton: { alignItems: 'center', backgroundColor: '#F5ECFB', borderRadius: 10, justifyContent: 'center', marginTop: 7, minHeight: 42 },
  cancelText: { color: palette.purpleDark, fontSize: 13, fontWeight: '700' },
});
