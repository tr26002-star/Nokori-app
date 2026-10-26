import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { createProduct } from '@/services/products-api';
import { Eyebrow, Field, PageHeading, PrimaryButton, Screen, palette } from '../shared/screen-ui';

const categories = ['Panadería', 'Pupusería', 'Comida preparada', 'Postres', 'Otros'];
type SelectedPhoto = { uri: string; base64: string; mimeType: string };

export default function PublishProductScreen() {
  const router = useRouter();
  const { sellerName: sellerNameParam } = useLocalSearchParams<{ sellerName?: string }>();
  const sellerName = typeof sellerNameParam === 'string' && sellerNameParam.trim() ? sellerNameParam.trim() : 'Negocio Nokory';
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [price, setPrice] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [pickupStart, setPickupStart] = useState('16:00');
  const [pickupEnd, setPickupEnd] = useState('18:00');
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
    const numericPrice = Number(price.replace(',', '.'));
    const numericQuantity = Number(quantity);
    if (name.trim().length < 3) return setError('Escribe el nombre del producto o pack.');
    if (!Number.isFinite(numericPrice) || numericPrice <= 0) return setError('Ingresa un precio mayor que cero.');
    if (!Number.isInteger(numericQuantity) || numericQuantity < 1) return setError('La cantidad debe ser al menos una unidad.');
    if (!pickupStart.trim() || !pickupEnd.trim()) return setError('Indica el horario de recogida.');
    setSaving(true);
    setError('');
    try {
      await createProduct({
        name: name.trim(),
        description: description.trim(),
        category,
        price: numericPrice,
        quantity: numericQuantity,
        pickupStart: pickupStart.trim(),
        pickupEnd: pickupEnd.trim(),
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
    <Screen>
      <Eyebrow>Panel del negocio</Eyebrow>
      <PageHeading title="Publica un pack" description="Tu publicación se guardará en la API y aparecerá en Explorar en los demás dispositivos." />
      <Field autoCapitalize="sentences" label="Nombre del producto" onChangeText={setName} placeholder="Ej. Pack sorpresa del día" value={name} />
      <Text style={styles.label}>Categoría</Text>
      <View style={styles.categories}>
        {categories.map((item) => (
          <Pressable key={item} onPress={() => setCategory(item)} style={[styles.categoryChip, category === item && styles.categoryChipActive]}>
            <Text style={[styles.categoryChipText, category === item && styles.categoryChipTextActive]}>{item}</Text>
          </Pressable>
        ))}
      </View>
      <Field autoCapitalize="sentences" label="Descripción" multiline onChangeText={setDescription} placeholder="¿Qué incluye el pack?" style={styles.multiline} value={description} />
      <View style={styles.twoColumns}>
        <Field containerStyle={styles.column} keyboardType="decimal-pad" label="Precio (USD)" onChangeText={setPrice} placeholder="4.50" value={price} />
        <Field containerStyle={styles.column} keyboardType="number-pad" label="Cantidad" onChangeText={setQuantity} placeholder="1" value={quantity} />
      </View>
      <View style={styles.twoColumns}>
        <Field autoCapitalize="none" containerStyle={styles.column} label="Recogida desde" onChangeText={setPickupStart} placeholder="16:00" value={pickupStart} />
        <Field autoCapitalize="none" containerStyle={styles.column} label="Recogida hasta" onChangeText={setPickupEnd} placeholder="18:00" value={pickupEnd} />
      </View>
      <Text style={styles.label}>Foto del producto</Text>
      {photo ? (
        <View style={styles.photoPreviewWrap}>
          <Image source={{ uri: photo.uri }} style={styles.photoPreview} />
          <Pressable accessibilityRole="button" onPress={() => setPhoto(null)} style={styles.removePhoto}><Text style={styles.removePhotoText}>Quitar foto</Text></Pressable>
        </View>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => { void choosePhoto(); }} style={styles.photoButton}>
          <Text style={styles.photoButtonIcon}>＋</Text>
          <Text style={styles.photoButtonText}>Elegir foto de la galería</Text>
        </Pressable>
      )}
      <View style={styles.infoBox}><Text style={styles.infoText}>Negocio: {sellerName}. La foto se subirá al almacenamiento compartido para verla desde otros teléfonos.</Text></View>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      <PrimaryButton disabled={saving} label={saving ? 'Publicando…' : 'Publicar para todos'} onPress={() => { void publish(); }} />
      {saving ? <ActivityIndicator color={palette.purple} style={styles.spinner} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { color: palette.text, fontSize: 14, fontWeight: '700', marginBottom: 9 },
  categories: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 15 },
  categoryChip: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 14, borderWidth: 1, paddingHorizontal: 11, paddingVertical: 8 },
  categoryChipActive: { backgroundColor: '#F1E5F7', borderColor: palette.purple },
  categoryChipText: { color: palette.muted, fontSize: 11, fontWeight: '600' },
  categoryChipTextActive: { color: palette.purple, fontWeight: '800' },
  multiline: { height: 86, paddingTop: 12, textAlignVertical: 'top' },
  twoColumns: { flexDirection: 'row', gap: 12 },
  column: { flex: 1 },
  photoButton: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 15, borderStyle: 'dashed', borderWidth: 1.5, flexDirection: 'row', gap: 10, justifyContent: 'center', minHeight: 57 },
  photoButtonIcon: { color: palette.purple, fontSize: 23, fontWeight: '600' },
  photoButtonText: { color: palette.purple, fontSize: 12, fontWeight: '800' },
  photoPreviewWrap: { borderRadius: 15, overflow: 'hidden' },
  photoPreview: { backgroundColor: '#EAF3D8', height: 170, width: '100%' },
  removePhoto: { alignItems: 'center', backgroundColor: '#FFF0F0', minHeight: 38, justifyContent: 'center' },
  removePhotoText: { color: '#B64D55', fontSize: 12, fontWeight: '700' },
  infoBox: { backgroundColor: '#EAF3D8', borderRadius: 14, marginTop: 2, padding: 12 },
  infoText: { color: '#4F7054', fontSize: 11, lineHeight: 17 },
  error: { color: '#B23B45', fontSize: 12, lineHeight: 18, marginTop: 10 },
  spinner: { marginTop: 10 },
});
