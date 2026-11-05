import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  cancelReservation,
  getClientReservations,
  type ClientReservation,
} from '@/services/reservations-api';
import { Eyebrow, Screen, palette } from '../shared/screen-ui';

type ReservationTab = 'active' | 'history';

function BarcodeGraphic() {
  const bars = [2, 1, 3, 1, 2, 4, 1, 3, 2, 1, 4, 2, 1, 3, 1, 2];
  return (
    <View style={styles.barcodeWrapper} accessible={false} importantForAccessibility="no">
      {bars.map((width, i) => (
        <View key={i} style={[styles.barcodeBar, { width }]} />
      ))}
    </View>
  );
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Hoy';
    const now = new Date();
    const diffMinutes = Math.floor((now.getTime() - date.getTime()) / 60000);
    if (diffMinutes < 5) return 'Ahora';
    if (diffMinutes < 60) return `Hace ${diffMinutes} min`;
    const isToday =
      date.getDate() === now.getDate() &&
      date.getMonth() === now.getMonth() &&
      date.getFullYear() === now.getFullYear();
    if (isToday) return 'Hoy';
    return date.toLocaleDateString('es-SV', { day: 'numeric', month: 'short' });
  } catch {
    return 'Hoy';
  }
}

export default function ReservationsScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const [selectedTab, setSelectedTab] = useState<ReservationTab>('active');
  const [reservations, setReservations] = useState<ClientReservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Estado para el diálogo de confirmación de cancelación
  const [reservationToCancel, setReservationToCancel] = useState<ClientReservation | null>(null);
  const [cancelling, setCancelling] = useState(false);

  const loadReservations = useCallback(async (isPullToRefresh = false) => {
    if (isPullToRefresh) setRefreshing(true);
    else setLoading(true);
    setErrorMessage('');

    try {
      const data = await getClientReservations({ phone });
      setReservations(data);
    } catch (cause) {
      console.error('Error al cargar reservas del cliente:', cause);
      setErrorMessage(cause instanceof Error ? cause.message : 'No se pudieron cargar tus reservas.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [phone]);

  useFocusEffect(
    useCallback(() => {
      void loadReservations();
    }, [loadReservations])
  );

  const activeReservations = useMemo(
    () => reservations.filter((r) => r.status === 'pending'),
    [reservations]
  );

  const historyReservations = useMemo(
    () => reservations.filter((r) => r.status === 'delivered' || r.status === 'cancelled'),
    [reservations]
  );

  const displayedReservations = selectedTab === 'active' ? activeReservations : historyReservations;

  function handlePromptCancel(item: ClientReservation) {
    if (item.status !== 'pending') {
      Alert.alert(
        'No cancelable',
        'Solo se pueden cancelar reservas que todavía estén activas y pendientes de recogida.',
        [{ text: 'Entendido', style: 'default' }]
      );
      return;
    }
    // Abre el diálogo de confirmación sin cambiar nada todavía
    setReservationToCancel(item);
  }

  async function handleConfirmCancel() {
    if (!reservationToCancel || cancelling) return;

    // Validación de seguridad previa: debe ser activa
    if (reservationToCancel.status !== 'pending') {
      Alert.alert('No cancelable', 'Esta reserva ya no está activa.');
      setReservationToCancel(null);
      return;
    }

    setCancelling(true);
    try {
      await cancelReservation(reservationToCancel.id, reservationToCancel.ticketCode);
      const cancelledItem = reservationToCancel;
      setReservationToCancel(null);

      // Recargar la lista fresca desde Supabase/caché
      await loadReservations();

      Alert.alert(
        'Reserva cancelada',
        `Tu reserva #${cancelledItem.ticketCode} para ${cancelledItem.productName} fue cancelada exitosamente y las unidades fueron devueltas al inventario.`,
        [{ text: 'Aceptar', style: 'default' }]
      );
    } catch (cause) {
      console.error('Error cancelando reserva:', cause);
      Alert.alert(
        'Error al cancelar',
        cause instanceof Error
          ? cause.message
          : 'No se pudo cancelar la reserva. Por favor intenta de nuevo.',
        [{ text: 'Entendido', style: 'default' }]
      );
    } finally {
      setCancelling(false);
    }
  }

  return (
    <Screen
      activeNavRoute="/reservations"
      contentStyle={styles.screenContent}
      showBottomNav
      showBrand={false}
      showDecorations={false}
    >
      <Eyebrow>TUS RESCATES</Eyebrow>
      <Text style={styles.title}>Mis reservas</Text>

      {/* Selector de pestañas idéntico a la referencia */}
      <View accessibilityRole="tablist" style={styles.tabs}>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTab === 'active' }}
          onPress={() => setSelectedTab('active')}
          style={[styles.tab, selectedTab === 'active' && styles.activeTab]}
        >
          <Text style={[styles.tabLabel, selectedTab === 'active' && styles.activeTabLabel]}>
            Activas {activeReservations.length > 0 ? `(${activeReservations.length})` : ''}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="tab"
          accessibilityState={{ selected: selectedTab === 'history' }}
          onPress={() => setSelectedTab('history')}
          style={[styles.tab, selectedTab === 'history' && styles.activeTab]}
        >
          <Text style={[styles.tabLabel, selectedTab === 'history' && styles.activeTabLabel]}>
            Historial {historyReservations.length > 0 ? `(${historyReservations.length})` : ''}
          </Text>
        </Pressable>
      </View>

      {/* Estado de carga */}
      {loading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={palette.purple} size="large" />
          <Text style={styles.loadingText}>Cargando tus reservas…</Text>
        </View>
      ) : errorMessage ? (
        /* Estado de error */
        <View accessibilityRole="alert" style={styles.stateCard}>
          <Text style={styles.stateTitle}>No pudimos cargar tus reservas</Text>
          <Text style={styles.stateDescription}>{errorMessage}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void loadReservations(); }} style={styles.retryButton}>
            <Text style={styles.retryButtonText}>Intentar de nuevo</Text>
          </Pressable>
        </View>
      ) : displayedReservations.length === 0 ? (
        /* Estado vacío idéntico a la pantalla actual (Image 3) */
        <View style={styles.emptyCard}>
          <View style={styles.ticketIcon}>
            <SymbolView
              name={{ ios: 'ticket.fill', android: 'confirmation_number', web: 'confirmation_number' }}
              tintColor={palette.purple}
              size={24}
            />
          </View>
          <Text style={styles.emptyTitle}>
            {selectedTab === 'active' ? 'Aún no tienes reservas' : 'Historial vacío'}
          </Text>
          <Text style={styles.emptyDescription}>
            {selectedTab === 'active'
              ? 'Cuando reserves un pack aparecerá aquí.'
              : 'Los pedidos que recojas o canceles se archivarán aquí.'}
          </Text>
          {selectedTab === 'active' ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/explore', params: { role: 'client', ...(phone ? { phone } : {}) } })}
              style={styles.exploreButton}
            >
              <Text style={styles.exploreButtonText}>Explorar comida cercana</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        /* Lista de tarjetas con el diseño de la referencia (Image 1) */
        <View style={styles.reservationsList}>
          {displayedReservations.map((item) => {
            const isPending = item.status === 'pending';
            const isDelivered = item.status === 'delivered';
            const isCancelled = item.status === 'cancelled';
            const cleanCode = item.ticketCode.startsWith('#') ? item.ticketCode : `#${item.ticketCode}`;

            return (
              <View key={item.id} style={styles.card}>
                {/* Imagen del producto o fallback estilizado */}
                {item.imageUrl ? (
                  <Image source={{ uri: item.imageUrl }} style={styles.cardImage} resizeMode="cover" />
                ) : (
                  <View style={styles.imagePlaceholder}>
                    <SymbolView
                      name={{ ios: 'bag.fill', android: 'shopping_bag', web: 'shopping_bag' }}
                      tintColor="#5A7E4F"
                      size={32}
                    />
                    <Text style={styles.imagePlaceholderText}>{item.category || 'Rescate de comida'}</Text>
                  </View>
                )}

                <View style={styles.cardBody}>
                  {/* Fila de estado y fecha relativa */}
                  <View style={styles.statusRow}>
                    <View
                      style={
                        isPending
                          ? styles.pendingPill
                          : isCancelled
                          ? styles.cancelledPill
                          : styles.deliveredPill
                      }
                    >
                      <Text
                        style={
                          isPending
                            ? styles.pendingPillText
                            : isCancelled
                            ? styles.cancelledPillText
                            : styles.deliveredPillText
                        }
                      >
                        {isPending ? 'Reservada' : isCancelled ? 'Cancelada' : 'Entregada'}
                      </Text>
                    </View>
                    <Text style={styles.timeTag}>{formatRelativeTime(item.createdAt)}</Text>
                  </View>

                  {/* Nombre y comercio */}
                  <Text style={styles.productName} numberOfLines={2}>
                    {item.productName}
                  </Text>
                  <Text style={styles.sellerSubtitle} numberOfLines={1}>
                    {item.sellerName} · {item.packs} {item.packs === 1 ? 'pack' : 'packs'}
                  </Text>

                  {/* Descripción si existe */}
                  {item.description ? (
                    <Text style={styles.cardDescription} numberOfLines={2}>
                      {item.description}
                    </Text>
                  ) : null}

                  {/* Horario de recogida con icono de reloj */}
                  <View style={styles.pickupRow}>
                    <SymbolView
                      name={{ ios: 'clock', android: 'schedule', web: 'schedule' }}
                      tintColor={palette.muted}
                      size={14}
                    />
                    <Text style={styles.pickupText}>
                      Recogida: {item.pickupTime}
                    </Text>
                  </View>

                  {/* Caja de código de recogida con código y código de barras (Image 1) */}
                  <View style={styles.ticketBox}>
                    <View style={styles.ticketInfo}>
                      <Text style={styles.ticketBoxLabel}>CÓDIGO DE RECOGIDA</Text>
                      <Text style={styles.ticketBoxCode}>{cleanCode}</Text>
                    </View>
                    <BarcodeGraphic />
                  </View>

                  {/* Fila de precio total y botón de acción */}
                  <View style={styles.footerRow}>
                    <Text style={styles.totalPriceText}>
                      ${item.totalPrice.toFixed(2)}
                    </Text>

                    {isPending ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => handlePromptCancel(item)}
                        style={styles.cancelButton}
                      >
                        <Text style={styles.cancelButtonText}>Cancelar reserva</Text>
                      </Pressable>
                    ) : isDelivered ? (
                      <View style={styles.completedBadge}>
                        <SymbolView
                          name={{ ios: 'checkmark.circle.fill', android: 'check_circle', web: 'check_circle' }}
                          tintColor="#2E7D32"
                          size={15}
                        />
                        <Text style={styles.completedBadgeText}>Completada</Text>
                      </View>
                    ) : (
                      <View style={styles.cancelledBadge}>
                        <SymbolView
                          name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }}
                          tintColor="#C2414C"
                          size={15}
                        />
                        <Text style={styles.cancelledBadgeText}>Cancelada</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      )}

      {/* Diálogo modal de confirmación de cancelación */}
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(reservationToCancel)}
        onRequestClose={() => {
          if (!cancelling) setReservationToCancel(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            accessibilityLabel="Cerrar diálogo"
            disabled={cancelling}
            onPress={() => setReservationToCancel(null)}
            style={styles.modalBackdrop}
          />
          <View accessibilityRole="alertdialog" style={styles.modalCard}>
            <View style={styles.modalIconWrap}>
              <SymbolView
                name={{ ios: 'exclamationmark.triangle.fill', android: 'warning', web: 'warning' }}
                tintColor="#D32F2F"
                size={26}
              />
            </View>

            <Text style={styles.modalTitle}>¿Estás seguro de que quieres cancelar esta reserva?</Text>

            {reservationToCancel ? (
              <Text style={styles.modalDescription}>
                Se cancelará tu pedido de{' '}
                <Text style={styles.boldText}>
                  {reservationToCancel.productName} ({reservationToCancel.packs}{' '}
                  {reservationToCancel.packs === 1 ? 'pack' : 'packs'})
                </Text>{' '}
                en {reservationToCancel.sellerName}. Las unidades se devolverán a la tienda.
              </Text>
            ) : null}

            <View style={styles.modalButtons}>
              <Pressable
                accessibilityRole="button"
                disabled={cancelling}
                onPress={() => setReservationToCancel(null)}
                style={styles.modalBackButton}
              >
                <Text style={styles.modalBackButtonText}>No, volver</Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                disabled={cancelling}
                onPress={() => { void handleConfirmCancel(); }}
                style={[styles.modalConfirmButton, cancelling && styles.disabledButton]}
              >
                {cancelling ? (
                  <ActivityIndicator color={palette.white} size="small" style={styles.loadingSpinner} />
                ) : null}
                <Text style={styles.modalConfirmButtonText}>
                  {cancelling ? 'Cancelando…' : 'Sí, cancelar reserva'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1, paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },
  title: { color: palette.purpleDark, fontSize: 30, fontWeight: '700', lineHeight: 38, marginBottom: 28 },
  tabs: { borderBottomColor: palette.border, borderBottomWidth: 1, flexDirection: 'row', gap: 20, marginBottom: 20 },
  tab: { alignItems: 'center', borderBottomColor: 'transparent', borderBottomWidth: 2, marginBottom: -1, minWidth: 76, paddingBottom: 12, paddingHorizontal: 3 },
  activeTab: { borderBottomColor: palette.purple },
  tabLabel: { color: palette.muted, fontSize: 14, fontWeight: '600' },
  activeTabLabel: { color: palette.purple, fontWeight: '800' },

  loadingContainer: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 12 },
  loadingText: { color: palette.muted, fontSize: 13 },

  emptyCard: {
    alignItems: 'center',
    borderColor: '#DCCBE7',
    borderRadius: 19,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    justifyContent: 'center',
    marginTop: 12,
    minHeight: 315,
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  ticketIcon: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 17, height: 66, justifyContent: 'center', marginBottom: 17, width: 66 },
  emptyTitle: { color: palette.purpleDark, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 8, textAlign: 'center' },
  exploreButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 12, marginTop: 18, minHeight: 42, justifyContent: 'center', paddingHorizontal: 18 },
  exploreButtonText: { color: palette.white, fontSize: 13, fontWeight: '800' },

  stateCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, padding: 24, marginTop: 14 },
  stateTitle: { color: palette.purpleDark, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  stateDescription: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' },
  retryButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 10, marginTop: 14, minHeight: 40, justifyContent: 'center', paddingHorizontal: 16 },
  retryButtonText: { color: palette.white, fontSize: 12, fontWeight: '800' },

  reservationsList: { gap: 18, paddingBottom: 20 },
  card: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#33233C',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardImage: { height: 160, width: '100%', backgroundColor: '#F3EAF7' },
  imagePlaceholder: { alignItems: 'center', backgroundColor: '#EDF5DC', height: 130, justifyContent: 'center', width: '100%', gap: 6 },
  imagePlaceholderText: { color: '#4E7743', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' },

  cardBody: { padding: 16 },
  statusRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  pendingPill: { backgroundColor: '#EEF7DB', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  pendingPillText: { color: '#4E7743', fontSize: 11, fontWeight: '800' },
  deliveredPill: { backgroundColor: '#E8F5E9', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  deliveredPillText: { color: '#2E7D32', fontSize: 11, fontWeight: '800' },
  cancelledPill: { backgroundColor: '#FFF0F1', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4 },
  cancelledPillText: { color: '#C2414C', fontSize: 11, fontWeight: '800' },
  timeTag: { color: palette.muted, fontSize: 11 },

  productName: { color: palette.purpleDark, fontSize: 18, fontWeight: '800', lineHeight: 24 },
  sellerSubtitle: { color: palette.muted, fontSize: 13, fontWeight: '600', marginTop: 4 },
  cardDescription: { color: '#7D7582', fontSize: 12, lineHeight: 17, marginTop: 6 },

  pickupRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 12 },
  pickupText: { color: palette.text, fontSize: 12, fontWeight: '600' },

  ticketBox: {
    alignItems: 'center',
    backgroundColor: '#F3EAF7',
    borderColor: '#E8DCF0',
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  ticketInfo: { flex: 1 },
  ticketBoxLabel: { color: palette.purple, fontSize: 9, fontWeight: '800', letterSpacing: 0.7 },
  ticketBoxCode: { color: palette.purpleDark, fontSize: 22, fontWeight: '900', marginTop: 3 },

  barcodeWrapper: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingLeft: 12 },
  barcodeBar: { backgroundColor: palette.purpleDark, height: 26, borderRadius: 1 },

  footerRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingTop: 2 },
  totalPriceText: { color: palette.purpleDark, fontSize: 22, fontWeight: '900' },

  cancelButton: {
    backgroundColor: '#FFF0F1',
    borderColor: '#FBD4D8',
    borderRadius: 10,
    borderWidth: 1,
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  cancelButtonText: { color: '#C2414C', fontSize: 12, fontWeight: '700' },

  completedBadge: {
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  completedBadgeText: { color: '#2E7D32', fontSize: 11, fontWeight: '800' },

  cancelledBadge: {
    alignItems: 'center',
    backgroundColor: '#FFF0F1',
    borderRadius: 10,
    flexDirection: 'row',
    gap: 5,
    minHeight: 32,
    paddingHorizontal: 10,
  },
  cancelledBadgeText: { color: '#C2414C', fontSize: 11, fontWeight: '800' },

  /* Estilos del diálogo de confirmación */
  modalOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(25, 12, 33, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 22,
  },
  modalBackdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  modalCard: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 24,
    borderWidth: 1,
    elevation: 6,
    maxWidth: 420,
    paddingHorizontal: 22,
    paddingVertical: 26,
    shadowColor: '#33233C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 18,
    width: '100%',
  },
  modalIconWrap: {
    alignItems: 'center',
    backgroundColor: '#FDE8E8',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    marginBottom: 14,
    width: 48,
  },
  modalTitle: {
    color: palette.purpleDark,
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 25,
    textAlign: 'center',
  },
  modalDescription: {
    color: palette.muted,
    fontSize: 13,
    lineHeight: 19,
    marginTop: 10,
    textAlign: 'center',
  },
  boldText: {
    color: palette.text,
    fontWeight: '700',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 22,
    width: '100%',
  },
  modalBackButton: {
    alignItems: 'center',
    backgroundColor: '#F7F4F9',
    borderColor: '#E6DCED',
    borderRadius: 12,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  modalBackButtonText: {
    color: palette.purpleDark,
    fontSize: 13,
    fontWeight: '700',
  },
  modalConfirmButton: {
    alignItems: 'center',
    backgroundColor: '#D32F2F',
    borderRadius: 12,
    flex: 1.2,
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
    minHeight: 46,
    paddingHorizontal: 14,
  },
  modalConfirmButtonText: {
    color: palette.white,
    fontSize: 13,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.65,
  },
  loadingSpinner: {
    marginRight: 2,
  },
});
