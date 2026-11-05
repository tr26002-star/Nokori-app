import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getProduct, type Product } from '@/services/products-api';
import { getClientProfile, reserveProduct, type ReservationConfirmation } from '@/services/reservations-api';
import { Screen, palette } from '../shared/screen-ui';

function isValidPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 8 && digits.length <= 15;
}

export default function ProductDetailScreen() {
  const router = useRouter();
  const { id, phone } = useLocalSearchParams<{ id?: string; phone?: string }>();
  const [product, setProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState(phone ?? '');
  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [confirmation, setConfirmation] = useState<ReservationConfirmation | null>(null);

  useEffect(() => {
    void getClientProfile().then((saved) => {
      if (saved) {
        setCustomerName((current) => current || saved.name);
        setCustomerPhone((current) => current || saved.phone);
      }
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        if (!id) {
          setLoadError('No encontramos el producto solicitado.');
          setLoading(false);
          return;
        }
        try {
          const result = await getProduct(id);
          if (active) {
            setProduct(result);
            setLoadError(result ? '' : 'Este producto ya no está publicado.');
            setQuantity((current) => result
              ? Math.max(1, Math.min(current, Math.max(1, result.quantity)))
              : 1);
          }
        } catch (cause) {
          if (active) {
            setLoadError(cause instanceof Error ? cause.message : 'No se pudo cargar el producto.');
          }
        } finally {
          if (active) setLoading(false);
        }
      }
      void load();
      return () => { active = false; };
    }, [id]),
  );

  async function confirmReservation() {
    if (!product || product.quantity < 1 || booking) return;
    if (customerName.trim().length < 2) {
      setBookingError('Escribe tu nombre para continuar con la reserva.');
      return;
    }
    if (!customerPhone.trim()) {
      setBookingError('Escribe tu número de teléfono para coordinar la recogida.');
      return;
    }
    if (!isValidPhone(customerPhone)) {
      setBookingError('Revisa el teléfono. Ingresa entre 8 y 15 dígitos.');
      return;
    }

    setBooking(true);
    setBookingError('');
    try {
      const result = await reserveProduct(product.id, customerName, customerPhone, quantity);
      setConfirmation(result);
      setProduct((current) => current ? { ...current, quantity: result.remainingQuantity } : current);
    } catch (cause) {
      setBookingError(cause instanceof Error ? cause.message : 'No se pudo completar la reserva. Inténtalo otra vez.');
      try {
        const latest = await getProduct(product.id);
        if (latest) {
          setProduct(latest);
          setQuantity((current) => Math.max(1, Math.min(current, Math.max(1, latest.quantity))));
        }
      } catch (refreshCause) {
        console.error('No se pudo actualizar la disponibilidad después del error de reserva:', refreshCause);
      }
    } finally {
      setBooking(false);
    }
  }

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace({ pathname: '/explore', params: { role: 'client', ...(phone ? { phone } : {}) } });
  };

  return (
    <Screen activeNavRoute="/explore" contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      <Pressable accessibilityRole="button" onPress={goBack} style={styles.backButton}>
        <SymbolView name={{ ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' }} tintColor={palette.purple} size={18} />
        <Text style={styles.backLabel}>Volver a explorar</Text>
      </Pressable>

      {loading ? (
        <View style={styles.stateCard}>
          <ActivityIndicator color={palette.purple} />
          <Text style={styles.stateText}>Cargando producto…</Text>
        </View>
      ) : loadError ? (
        <View style={styles.stateCard}>
          <Text style={styles.stateTitle}>No pudimos abrir esta oferta</Text>
          <Text style={styles.stateText}>{loadError}</Text>
        </View>
      ) : product ? (
        <>
          <View style={styles.productCard}>
            {product.imageUrl ? (
              <Image accessibilityLabel={product.name} source={{ uri: product.imageUrl }} style={styles.productImage} />
            ) : (
              <View style={styles.imagePlaceholder}>
                <SymbolView name={{ ios: 'leaf.fill', android: 'eco', web: 'eco' }} tintColor={palette.green} size={34} />
                <Text style={styles.placeholderLabel}>Pack Nokory</Text>
              </View>
            )}
            <View style={styles.productContent}>
              <Text style={styles.category}>{product.category}</Text>
              <Text style={styles.productName}>{product.name}</Text>
              {product.description ? <Text style={styles.description}>{product.description}</Text> : null}
              <Text style={styles.sellerName}>{product.sellerName}</Text>
              <View style={styles.detailRow}>
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Precio por unidad</Text>
                  <Text style={styles.price}>${product.price.toFixed(2)}</Text>
                </View>
                <View style={styles.detailBlock}>
                  <Text style={styles.detailLabel}>Recogida</Text>
                  <Text style={styles.pickup}>{product.pickupStart} – {product.pickupEnd}</Text>
                </View>
              </View>
              {product.quantity === 0 ? (
                <View accessibilityRole="alert" style={styles.soldOutNotice}>
                  <SymbolView name={{ ios: 'exclamationmark.circle.fill', android: 'error', web: 'error' }} tintColor="#A75252" size={18} />
                  <Text style={styles.soldOutText}>Agotado. Ya no quedan unidades para reservar.</Text>
                </View>
              ) : (
                <View style={styles.stockRow}>
                  <SymbolView name={{ ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }} tintColor={palette.green} size={17} />
                  <Text style={styles.stockText}>
                    {product.quantity} {product.quantity === 1 ? 'unidad disponible' : 'unidades disponibles'}
                  </Text>
                </View>
              )}
            </View>
          </View>

          {confirmation ? (
            <View accessibilityRole="alert" style={styles.successCard}>
              <View style={styles.successIcon}>
                <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} tintColor={palette.white} size={23} />
              </View>
              <Text style={styles.successTitle}>¡Reserva confirmada!</Text>
              <Text style={styles.successDescription}>Presenta este código en el comercio al recoger tu pedido.</Text>
              <View style={styles.ticketBox}>
                <Text style={styles.ticketLabel}>CÓDIGO DE RESERVA</Text>
                <Text style={styles.ticketCode}>#{confirmation.ticketCode}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Producto</Text>
                <Text style={styles.summaryValue}>{confirmation.productName}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Cantidad</Text>
                <Text style={styles.summaryValue}>{confirmation.packs}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total a pagar en tienda</Text>
                <Text style={styles.summaryValue}>${confirmation.totalPrice.toFixed(2)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Horario de recogida</Text>
                <Text style={styles.summaryValue}>{confirmation.pickupStart} – {confirmation.pickupEnd}</Text>
              </View>
              <Text style={styles.successCustomer}>Reserva a nombre de {confirmation.customerName}</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/reservations', params: { role: 'client', phone: customerPhone } })}
                style={styles.viewReservationsButton}
              >
                <Text style={styles.viewReservationsButtonText}>Ver en Mis reservas</Text>
              </Pressable>
            </View>
          ) : product.quantity > 0 ? (
            <View style={styles.bookingCard}>
              <Text style={styles.sectionTitle}>Reserva tu pack</Text>
              <Text style={styles.sectionDescription}>Elige cuántas unidades quieres y déjanos tus datos para la recogida.</Text>
              <Text style={styles.fieldLabel}>Cantidad</Text>
              <View style={styles.quantityPicker}>
                <Pressable
                  accessibilityLabel="Disminuir cantidad"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: quantity <= 1 }}
                  disabled={quantity <= 1}
                  onPress={() => setQuantity((current) => Math.max(1, current - 1))}
                  style={[styles.quantityButton, quantity <= 1 && styles.quantityButtonDisabled]}
                >
                  <Text style={styles.quantityButtonText}>−</Text>
                </Pressable>
                <Text accessibilityLiveRegion="polite" style={styles.quantityValue}>{quantity}</Text>
                <Pressable
                  accessibilityLabel="Aumentar cantidad"
                  accessibilityRole="button"
                  accessibilityState={{ disabled: quantity >= product.quantity }}
                  disabled={quantity >= product.quantity}
                  onPress={() => setQuantity((current) => Math.min(product.quantity, current + 1))}
                  style={[styles.quantityButton, quantity >= product.quantity && styles.quantityButtonDisabled]}
                >
                  <Text style={styles.quantityButtonText}>+</Text>
                </Pressable>
              </View>
              <Text style={styles.subtotal}>Total: ${(product.price * quantity).toFixed(2)}</Text>

              <Text style={styles.fieldLabel}>Tu nombre</Text>
              <TextInput
                accessibilityLabel="Tu nombre"
                autoCapitalize="words"
                autoComplete="name"
                onChangeText={setCustomerName}
                placeholder="Nombre y apellido"
                placeholderTextColor="#A39BA7"
                style={styles.input}
                value={customerName}
              />
              <Text style={styles.fieldLabel}>Número de teléfono</Text>
              <TextInput
                accessibilityLabel="Número de teléfono"
                autoComplete="tel"
                keyboardType="phone-pad"
                onChangeText={setCustomerPhone}
                placeholder="Ej. 7000 0000"
                placeholderTextColor="#A39BA7"
                style={styles.input}
                value={customerPhone}
              />
              {bookingError ? <Text accessibilityRole="alert" style={styles.errorText}>{bookingError}</Text> : null}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ disabled: booking }}
                disabled={booking}
                onPress={() => { void confirmReservation(); }}
                style={[styles.reserveButton, booking && styles.disabledButton]}
              >
                {booking ? <ActivityIndicator color={palette.white} /> : null}
                <Text style={styles.reserveButtonText}>{booking ? 'Confirmando…' : 'Confirmar reserva'}</Text>
              </Pressable>
              <Text style={styles.pickupNote}>Recogida en el comercio · {product.pickupStart} – {product.pickupEnd}</Text>
            </View>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1, paddingBottom: 24, paddingHorizontal: 18, paddingTop: 16 },
  backButton: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 7, marginBottom: 15, minHeight: 34 },
  backLabel: { color: palette.purple, fontSize: 13, fontWeight: '700' },
  productCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 19, borderWidth: 1, marginBottom: 15, overflow: 'hidden' },
  productImage: { backgroundColor: '#F4EFF9', height: 205, width: '100%' },
  imagePlaceholder: { alignItems: 'center', backgroundColor: '#F0F6E8', height: 170, justifyContent: 'center' },
  placeholderLabel: { color: '#54825D', fontSize: 12, fontWeight: '700', marginTop: 6 },
  productContent: { padding: 16 },
  category: { color: palette.purple, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  productName: { color: palette.purpleDark, fontSize: 23, fontWeight: '800', lineHeight: 30, marginTop: 5 },
  description: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 8 },
  sellerName: { color: palette.green, fontSize: 12, fontWeight: '700', marginTop: 10 },
  detailRow: { borderTopColor: palette.border, borderTopWidth: 1, flexDirection: 'row', gap: 12, marginTop: 14, paddingTop: 13 },
  detailBlock: { flex: 1, gap: 4 },
  detailLabel: { color: palette.muted, fontSize: 11 },
  price: { color: palette.purpleDark, fontSize: 18, fontWeight: '900' },
  pickup: { color: palette.text, fontSize: 12, fontWeight: '700' },
  stockRow: { alignItems: 'center', backgroundColor: '#F0F6E8', borderRadius: 10, flexDirection: 'row', gap: 7, marginTop: 14, padding: 10 },
  stockText: { color: '#49683B', fontSize: 12, fontWeight: '700' },
  soldOutNotice: { alignItems: 'center', backgroundColor: '#FFF0F1', borderRadius: 10, flexDirection: 'row', gap: 8, marginTop: 14, padding: 11 },
  soldOutText: { color: '#A75252', flex: 1, fontSize: 12, fontWeight: '700' },
  bookingCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 19, borderWidth: 1, padding: 16 },
  sectionTitle: { color: palette.purpleDark, fontSize: 18, fontWeight: '800' },
  sectionDescription: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 16 },
  fieldLabel: { color: palette.text, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 11 },
  quantityPicker: { alignItems: 'center', alignSelf: 'flex-start', flexDirection: 'row', gap: 16 },
  quantityButton: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 11, height: 40, justifyContent: 'center', width: 44 },
  quantityButtonDisabled: { opacity: 0.4 },
  quantityButtonText: { color: palette.purple, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  quantityValue: { color: palette.purpleDark, fontSize: 17, fontWeight: '800', minWidth: 22, textAlign: 'center' },
  subtotal: { color: palette.purpleDark, fontSize: 14, fontWeight: '800', marginTop: 8 },
  input: { backgroundColor: '#FFFEFD', borderColor: palette.border, borderRadius: 11, borderWidth: 1, color: palette.text, fontSize: 14, minHeight: 46, paddingHorizontal: 12 },
  errorText: { color: '#A13D45', fontSize: 12, lineHeight: 18, marginTop: 11 },
  reserveButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 12, flexDirection: 'row', gap: 9, justifyContent: 'center', marginTop: 15, minHeight: 48 },
  reserveButtonText: { color: palette.white, fontSize: 14, fontWeight: '800' },
  disabledButton: { opacity: 0.65 },
  pickupNote: { color: palette.muted, fontSize: 11, marginTop: 10, textAlign: 'center' },
  stateCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, gap: 10, padding: 24 },
  stateTitle: { color: palette.purpleDark, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  stateText: { color: palette.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  successCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: '#DDEBD0', borderRadius: 19, borderWidth: 1, padding: 18 },
  successIcon: { alignItems: 'center', backgroundColor: palette.green, borderRadius: 25, height: 50, justifyContent: 'center', width: 50 },
  successTitle: { color: palette.purpleDark, fontSize: 20, fontWeight: '800', marginTop: 11 },
  successDescription: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 5, textAlign: 'center' },
  ticketBox: { alignItems: 'center', backgroundColor: '#F3EAF7', borderRadius: 12, marginVertical: 16, paddingHorizontal: 25, paddingVertical: 12 },
  ticketLabel: { color: palette.purple, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  ticketCode: { color: palette.purpleDark, fontSize: 22, fontWeight: '900', marginTop: 3 },
  summaryRow: { alignSelf: 'stretch', borderTopColor: palette.border, borderTopWidth: 1, flexDirection: 'row', gap: 10, justifyContent: 'space-between', paddingVertical: 9 },
  summaryLabel: { color: palette.muted, flex: 1, fontSize: 11 },
  summaryValue: { color: palette.text, flex: 1, fontSize: 11, fontWeight: '700', textAlign: 'right' },
  successCustomer: { color: '#49683B', fontSize: 12, fontWeight: '700', marginTop: 8 },
  viewReservationsButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 12, justifyContent: 'center', marginTop: 14, minHeight: 46, paddingHorizontal: 16, width: '100%' },
  viewReservationsButtonText: { color: palette.white, fontSize: 14, fontWeight: '800' },
});
