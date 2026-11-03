import {
  getSellerReservations,
  markReservationAsDelivered,
  type Reservation,
} from '@/services/reservations-api';
import { useFocusEffect } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Eyebrow, Screen, palette } from '../shared/screen-ui';

type FilterTab = 'all' | 'pending' | 'delivered';

export default function SellerReservationsScreen() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchCode, setSearchCode] = useState('');

  // Cargar reservas limpias cada vez que el vendedor entra a la pantalla
  const loadReservations = useCallback(async () => {
    try {
      const data = await getSellerReservations();
      setReservations(data);
    } catch (err) {
      console.error('Error al cargar reservas:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadReservations();
    }, [loadReservations])
  );

  // Filtrado reactivo por pestaña y por código/nombre
  const filteredReservations = useMemo(() => {
    return reservations.filter((item) => {
      const matchesTab = filterTab === 'all' ? true : item.status === filterTab;
      const matchesSearch = searchCode.trim()
        ? item.ticketCode.toLowerCase().includes(searchCode.trim().toLowerCase()) ||
          item.customerName.toLowerCase().includes(searchCode.trim().toLowerCase())
        : true;
      return matchesTab && matchesSearch;
    });
  }, [reservations, filterTab, searchCode]);

  async function handleMarkAsDelivered(reservation: Reservation) {
    Alert.alert(
      'Validar entrega de pedido',
      `¿Confirmas la entrega del ticket #${reservation.ticketCode} a ${reservation.customerName} y el cobro en el negocio de $${reservation.totalPrice.toFixed(2)}?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar entrega',
          onPress: async () => {
            try {
              const updated = await markReservationAsDelivered(reservation.id);
              setReservations(updated);
              Alert.alert(
                '¡Pedido entregado!',
                `El ticket #${reservation.ticketCode} fue marcado como entregado exitosamente.`
              );
            } catch {
              Alert.alert('Error', 'No se pudo actualizar el estado de la reserva.');
            }
          },
        },
      ]
    );
  }

  const pendingCount = reservations.filter((r) => r.status === 'pending').length;

  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      {/* Cabecera idéntica al diseño del PDF */}
      <View style={styles.header}>
        <Eyebrow>RECOGIDAS</Eyebrow>
        <Text style={styles.title}>Reservas del negocio</Text>
        <Text style={styles.subtitle}>Valida el ticket del cliente al entregar cada pedido.</Text>
      </View>

      {/* Buscador y pestañas solo se muestran si existen pedidos */}
      {reservations.length > 0 ? (
        <>
          <View style={styles.searchWrapper}>
            <SymbolView
              name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
              tintColor={palette.muted}
              size={18}
              style={styles.searchIcon}
            />
            <TextInput
              placeholder="Buscar por código de ticket o cliente..."
              placeholderTextColor="#A39BA7"
              value={searchCode}
              onChangeText={setSearchCode}
              style={styles.searchInput}
              autoCapitalize="characters"
            />
            {searchCode ? (
              <Pressable onPress={() => setSearchCode('')} style={styles.clearSearch}>
                <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor={palette.muted} size={16} />
              </Pressable>
            ) : null}
          </View>

          <View style={styles.tabBar}>
            <Pressable
              onPress={() => setFilterTab('all')}
              style={[styles.tabButton, filterTab === 'all' && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, filterTab === 'all' && styles.tabTextActive]}>
                Todas ({reservations.length})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFilterTab('pending')}
              style={[styles.tabButton, filterTab === 'pending' && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, filterTab === 'pending' && styles.tabTextActive]}>
                Pendientes ({pendingCount})
              </Text>
            </Pressable>

            <Pressable
              onPress={() => setFilterTab('delivered')}
              style={[styles.tabButton, filterTab === 'delivered' && styles.tabButtonActive]}
            >
              <Text style={[styles.tabText, filterTab === 'delivered' && styles.tabTextActive]}>
                Entregadas
              </Text>
            </Pressable>
          </View>
        </>
      ) : null}

      {/* Estado de carga */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={palette.purple} size="large" />
          <Text style={styles.loadingText}>Cargando reservas...</Text>
        </View>
      ) : reservations.length === 0 || filteredReservations.length === 0 ? (
        /* Estado Vacío idéntico al PDF */
        <View style={styles.emptyCard}>
          <View style={styles.receiptIcon}>
            <SymbolView
              name={{ ios: 'doc.text.fill', android: 'receipt_long', web: 'receipt_long' }}
              tintColor={palette.purple}
              size={28}
            />
          </View>
          <Text style={styles.emptyTitle}>Todavía no tienes pedidos</Text>
          <Text style={styles.emptyDescription}>
            Las reservas aparecerán aquí cuando un cliente compre uno de tus productos.
          </Text>
        </View>
      ) : (
        /* Lista de Reservas */
        <View style={styles.reservationsList}>
          {filteredReservations.map((item) => (
            <View key={item.id} style={styles.reservationCard}>
              <View style={styles.cardHeader}>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{item.customerName}</Text>
                  {item.customerPhone ? (
                    <Text style={styles.customerPhone}>Tel: {item.customerPhone}</Text>
                  ) : null}
                </View>

                <View style={styles.ticketBadge}>
                  <Text style={styles.ticketBadgeLabel}>TICKET</Text>
                  <Text style={styles.ticketCode}>#{item.ticketCode}</Text>
                </View>
              </View>

              <View style={styles.productDetailRow}>
                <View style={styles.packsIndicator}>
                  <Text style={styles.packsText}>{item.packs}x</Text>
                </View>
                <Text style={styles.productName} numberOfLines={2}>
                  {item.productName}
                </Text>
              </View>

              <View style={styles.divider} />

              <View style={styles.cardFooter}>
                <View>
                  <Text style={styles.footerLabel}>Horario de recogida</Text>
                  <Text style={styles.footerValue}>{item.pickupTime}</Text>
                </View>
                <View style={styles.priceContainer}>
                  <Text style={styles.footerLabel}>Cobrar en tienda</Text>
                  <Text style={styles.totalPrice}>${item.totalPrice.toFixed(2)}</Text>
                </View>
              </View>

              {item.status === 'pending' ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => { void handleMarkAsDelivered(item); }}
                  style={styles.deliverButton}
                >
                  <SymbolView
                    name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
                    tintColor={palette.white}
                    size={18}
                  />
                  <Text style={styles.deliverButtonText}>Marcar como entregado</Text>
                </Pressable>
              ) : (
                <View style={styles.deliveredBadge}>
                  <SymbolView
                    name={{ ios: 'checkmark', android: 'done', web: 'done' }}
                    tintColor="#2E7D32"
                    size={16}
                  />
                  <Text style={styles.deliveredBadgeText}>Entregado al cliente</Text>
                </View>
              )}
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 20, paddingBottom: 28 },
  header: { marginBottom: 18 },
  title: { color: palette.purpleDark, fontSize: 30, fontWeight: '800', lineHeight: 36 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  searchWrapper: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    marginBottom: 14,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  searchInput: {
    color: palette.text,
    flex: 1,
    fontSize: 13,
    minHeight: 44,
  },
  clearSearch: { padding: 4 },
  tabBar: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  tabButton: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 7,
  },
  tabButtonActive: {
    backgroundColor: palette.purpleDark,
    borderColor: palette.purpleDark,
  },
  tabText: {
    color: palette.muted,
    fontSize: 12,
    fontWeight: '600',
  },
  tabTextActive: {
    color: palette.white,
    fontWeight: '800',
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  loadingText: {
    color: palette.muted,
    fontSize: 13,
  },
  reservationsList: {
    gap: 14,
    paddingBottom: 20,
  },
  reservationCard: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    shadowColor: '#33233C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  customerInfo: { flex: 1, paddingRight: 8 },
  customerName: { color: palette.text, fontSize: 16, fontWeight: '800' },
  customerPhone: { color: palette.muted, fontSize: 12, marginTop: 2 },
  ticketBadge: {
    alignItems: 'center',
    backgroundColor: '#F3EAF7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  ticketBadgeLabel: { color: palette.purple, fontSize: 9, fontWeight: '800' },
  ticketCode: { color: palette.purpleDark, fontSize: 14, fontWeight: '900' },
  productDetailRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  packsIndicator: {
    alignItems: 'center',
    backgroundColor: '#EEF7DB',
    borderRadius: 8,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  packsText: { color: '#4E7743', fontSize: 12, fontWeight: '800' },
  productName: { color: palette.text, flex: 1, fontSize: 14, fontWeight: '600' },
  divider: { backgroundColor: '#F0EAF2', height: 1, marginBottom: 12 },
  cardFooter: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  priceContainer: { alignItems: 'flex-end' },
  footerLabel: { color: palette.muted, fontSize: 11, marginBottom: 2 },
  footerValue: { color: palette.text, fontSize: 13, fontWeight: '700' },
  totalPrice: { color: palette.purpleDark, fontSize: 18, fontWeight: '900' },
  deliverButton: {
    alignItems: 'center',
    backgroundColor: palette.purpleDark,
    borderRadius: 11,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
  },
  deliverButtonText: { color: palette.white, fontSize: 13, fontWeight: '800' },
  deliveredBadge: {
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 38,
  },
  deliveredBadgeText: { color: '#2E7D32', fontSize: 12, fontWeight: '800' },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  receiptIcon: {
    alignItems: 'center',
    backgroundColor: '#F3EAF7',
    borderRadius: 18,
    height: 64,
    justifyContent: 'center',
    marginBottom: 16,
    width: 64,
  },
  emptyTitle: { color: palette.purpleDark, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 8, textAlign: 'center' },
});
