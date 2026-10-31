import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getProducts, type Product } from '@/services/products-api';
import { addReservation, availableQuantity, useReservations } from '@/services/reservations-store';
import { palette } from '../shared/screen-ui';
import { clientColors, Icon, money, Pill, pickupText, ProductArt, type IconName } from './client-ui';

function InfoRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <View style={styles.info}>
      <Icon name={icon} size={18} color={palette.green} />
      <View>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
    </View>
  );
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const reservations = useReservations();
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [quantity, setQuantity] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let active = true;
    getProducts()
      .then((list) => { if (active) setProduct(list.find((item) => item.id === id) ?? null); })
      .catch(() => { if (active) setProduct(null); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [id]);

  const goBack = () => (router.canGoBack() ? router.back() : router.replace({ pathname: '/explore', params: { role: 'client' } }));

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={palette.purple} /></View>;
  }

  if (!product) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyTitle}>Este producto ya no está disponible</Text>
        <Pressable onPress={goBack} style={styles.emptyButton}><Text style={styles.emptyButtonText}>Volver a Explorar</Text></Pressable>
      </View>
    );
  }

  const left = availableQuantity(product, reservations);
  const soldOut = left === 0;
  const safeQuantity = Math.min(quantity, Math.max(left, 1));

  const confirm = () => {
    const digits = phone.replace(/\D/g, '');
    if (name.trim().length < 3) return setFormError('Escribe tu nombre completo.');
    if (digits.length !== 8) return setFormError('Ingresa tu número salvadoreño de 8 dígitos.');
    addReservation(product, safeQuantity, name.trim(), `+503 ${digits}`);
    setFormOpen(false);
    router.replace({ pathname: '/reservations', params: { role: 'client' } });
  };

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <ProductArt product={product} height={250} />
        <View style={styles.body}>
          <View style={styles.row}>
            <Pill label={product.category} />
            <Text style={styles.left}>{soldOut ? 'Agotado' : `${left} disponibles`}</Text>
          </View>
          <Text style={styles.title}>{product.name}</Text>
          <View style={styles.sellerRow}>
            <Icon name="store" size={16} />
            <Text style={styles.seller}>{product.sellerName}</Text>
          </View>
          <Text style={styles.description}>{product.description || 'El negocio no agregó una descripción.'}</Text>
          <InfoRow icon="clock" label="Horario de recogida" value={pickupText(product)} />
          <InfoRow icon="store" label="Negocio" value={product.sellerName} />
          <InfoRow icon="leaf" label="Packs disponibles" value={String(left)} />
        </View>
      </ScrollView>

      <Pressable accessibilityLabel="Cerrar" onPress={goBack} style={[styles.close, { top: insets.top + 10 }]}>
        <Icon name="close" size={16} color={palette.purpleDark} />
      </Pressable>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <View style={styles.priceRow}>
          <View>
            <Text style={styles.price}>{money(product.price)}</Text>
            <Text style={styles.perPack}>por pack</Text>
          </View>
          <View style={styles.stepper}>
            <Pressable disabled={safeQuantity <= 1} onPress={() => setQuantity(safeQuantity - 1)} style={[styles.stepButton, safeQuantity <= 1 && styles.stepOff]}><Text style={styles.stepText}>−</Text></Pressable>
            <Text style={styles.stepValue}>{safeQuantity}</Text>
            <Pressable disabled={safeQuantity >= left} onPress={() => setQuantity(safeQuantity + 1)} style={[styles.stepButton, safeQuantity >= left && styles.stepOff]}><Text style={styles.stepText}>+</Text></Pressable>
          </View>
        </View>
        <Pressable disabled={soldOut} onPress={() => { setFormError(''); setFormOpen(true); }} style={({ pressed }) => [styles.reserve, soldOut && styles.reserveOff, pressed && !soldOut && { opacity: 0.88 }]}>
          <Text style={styles.reserveText}>{soldOut ? 'Producto agotado' : `Reservar por ${money(product.price * safeQuantity)}`}</Text>
        </Pressable>
      </View>

      <Modal animationType="slide" onRequestClose={() => setFormOpen(false)} transparent visible={formOpen}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
            <Text style={styles.sheetTitle}>Confirma tu reserva</Text>
            <Text style={styles.sheetText}>Pagas directamente en el negocio al recoger tu pack.</Text>
            <Text style={styles.label}>Nombre</Text>
            <TextInput onChangeText={setName} placeholder="Tu nombre" placeholderTextColor="#A39BA7" style={styles.input} value={name} />
            <Text style={styles.label}>Teléfono</Text>
            <TextInput keyboardType="phone-pad" maxLength={9} onChangeText={setPhone} placeholder="7000 0000" placeholderTextColor="#A39BA7" style={styles.input} value={phone} />
            {formError ? <Text style={styles.error}>{formError}</Text> : null}
            <Pressable onPress={confirm} style={styles.reserve}><Text style={styles.reserveText}>Confirmar reserva</Text></Pressable>
            <Pressable onPress={() => setFormOpen(false)} style={styles.cancel}><Text style={styles.cancelText}>Cancelar</Text></Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { backgroundColor: palette.background, flex: 1 },
  center: { alignItems: 'center', backgroundColor: palette.background, flex: 1, justifyContent: 'center', padding: 24 },
  emptyTitle: { color: palette.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyButton: { marginTop: 16, padding: 12 },
  emptyButtonText: { color: palette.purple, fontSize: 15, fontWeight: '800' },
  scroll: { paddingBottom: 190 },
  body: { padding: 20 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  left: { color: clientColors.greenDark, fontSize: 12, fontWeight: '800' },
  title: { color: palette.purpleDark, fontSize: 27, fontWeight: '800', lineHeight: 33, marginTop: 14 },
  sellerRow: { alignItems: 'center', flexDirection: 'row', gap: 7, marginTop: 8 },
  seller: { color: palette.purple, fontSize: 14, fontWeight: '800' },
  description: { color: palette.muted, fontSize: 14, lineHeight: 22, marginBottom: 12, marginTop: 10 },
  info: { alignItems: 'center', backgroundColor: clientColors.paleGreen, borderRadius: 12, flexDirection: 'row', gap: 12, marginTop: 8, paddingHorizontal: 13, paddingVertical: 11 },
  infoLabel: { color: palette.green, fontSize: 10, fontWeight: '700' },
  infoValue: { color: '#37513A', fontSize: 14, fontWeight: '800', marginTop: 1 },
  close: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.92)', borderRadius: 17, height: 34, justifyContent: 'center', position: 'absolute', right: 16, width: 34 },
  footer: { backgroundColor: palette.background, borderTopColor: palette.border, borderTopWidth: 1, bottom: 0, left: 0, paddingHorizontal: 20, paddingTop: 12, position: 'absolute', right: 0 },
  priceRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  price: { color: palette.purpleDark, fontSize: 28, fontWeight: '900' },
  perPack: { color: palette.muted, fontSize: 11 },
  stepper: { alignItems: 'center', flexDirection: 'row', gap: 14 },
  stepButton: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 10, height: 36, justifyContent: 'center', width: 36 },
  stepOff: { opacity: 0.4 },
  stepText: { color: palette.purple, fontSize: 20, fontWeight: '800' },
  stepValue: { color: palette.text, fontSize: 16, fontWeight: '800', minWidth: 16, textAlign: 'center' },
  reserve: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 13, justifyContent: 'center', marginTop: 12, minHeight: 54 },
  reserveOff: { opacity: 0.45 },
  reserveText: { color: palette.white, fontSize: 16, fontWeight: '800' },
  backdrop: { backgroundColor: 'rgba(40,20,55,0.45)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: palette.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  sheetTitle: { color: palette.purpleDark, fontSize: 21, fontWeight: '800' },
  sheetText: { color: palette.muted, fontSize: 13, marginTop: 5 },
  label: { color: palette.text, fontSize: 14, fontWeight: '700', marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 11, borderWidth: 1, color: palette.text, fontSize: 15, minHeight: 48, paddingHorizontal: 13 },
  error: { color: clientColors.danger, fontSize: 12, fontWeight: '700', marginTop: 10 },
  cancel: { alignItems: 'center', minHeight: 46, justifyContent: 'center', marginTop: 4 },
  cancelText: { color: palette.purple, fontSize: 15, fontWeight: '700' },
});
