import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { cancelReservation, useReservations, type Reservation } from '@/services/reservations-store';
import { Screen, palette } from '../shared/screen-ui';
import { clientColors, Icon, money, Pill, pickupText } from './client-ui';

function formatDate(iso: string) {
  const d = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} · ${two(d.getHours())}:${two(d.getMinutes())}`;
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.receiptRow}>
      <Text style={styles.receiptLabel}>{label}</Text>
      <Text style={styles.receiptValue}>{value}</Text>
    </View>
  );
}

function Receipt({ item, onClose }: { item: Reservation | null; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const active = item?.status === 'active';
  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={item !== null}>
      <View style={styles.backdrop}>
        <Pressable accessibilityLabel="Cerrar comprobante" onPress={onClose} style={StyleSheet.absoluteFill} />
        {item ? (
          <View style={[styles.receipt, { paddingBottom: insets.bottom + 16 }]}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={styles.receiptHeader}>
                <View>
                  <Text style={styles.brand}>Nokory</Text>
                  <Text style={styles.receiptTitle}>Comprobante de reserva</Text>
                </View>
                <Pressable accessibilityLabel="Cerrar" onPress={onClose} style={styles.closeButton}>
                  <Icon name="close" size={15} color={palette.purpleDark} />
                </Pressable>
              </View>
              <Pill label={active ? 'Por recoger' : 'Cancelada'} tone={active ? 'green' : 'purple'} />

              <View style={[styles.codeBox, !active && { opacity: 0.45 }]}>
                <Text style={styles.codeLabel}>CÓDIGO DE RECOGIDA</Text>
                <Text style={styles.codeValue}>{item.id}</Text>
                <Text style={styles.codeHint}>{active ? 'Dale este código al vendedor al recoger tu pedido.' : 'Esta reserva fue cancelada y el código ya no es válido.'}</Text>
              </View>

              <View style={styles.dash} />
              <ReceiptRow label="Negocio" value={item.sellerName} />
              <ReceiptRow label="Horario de recogida" value={pickupText(item)} />
              <ReceiptRow label="Reservado el" value={formatDate(item.createdAt)} />
              <ReceiptRow label="Cliente" value={item.customerName} />
              <ReceiptRow label="Teléfono" value={item.customerPhone} />
              <View style={styles.dash} />

              <Text style={styles.sectionLabel}>DETALLE DEL PEDIDO</Text>
              <View style={styles.itemRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemName}>{item.productName}</Text>
                  <Text style={styles.itemMeta}>{item.quantity} × {money(item.unitPrice)}</Text>
                </View>
                <Text style={styles.itemTotal}>{money(item.unitPrice * item.quantity)}</Text>
              </View>
              <View style={styles.dash} />
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>Total a pagar en el negocio</Text>
                <Text style={styles.totalValue}>{money(item.unitPrice * item.quantity)}</Text>
              </View>
              <Text style={styles.note}>El pago se realiza directamente en el negocio al recoger tu pack.</Text>
            </ScrollView>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

function Ticket({ item, active, onOpen }: { item: Reservation; active: boolean; onOpen: () => void }) {
  const confirmCancel = () => {
    Alert.alert('Cancelar reserva', `¿Quieres cancelar tu reserva de ${item.productName}?`, [
      { text: 'Conservar', style: 'cancel' },
      { text: 'Cancelar reserva', style: 'destructive', onPress: () => cancelReservation(item.id) },
    ]);
  };

  return (
    <Animated.View entering={FadeInDown.duration(350)}>
    <Pressable accessibilityHint="Abre el comprobante de la reserva" accessibilityRole="button" onPress={onOpen} style={({ pressed }) => [styles.ticket, pressed && { opacity: 0.93 }]}>
      <View style={styles.row}>
        <Text style={styles.code}>{item.id}</Text>
        <Pill label={active ? 'Por recoger' : 'Cancelada'} tone={active ? 'green' : 'purple'} />
      </View>
      <Text style={styles.name}>{item.productName}</Text>
      <Text style={styles.meta}>{item.sellerName} · {item.quantity} {item.quantity === 1 ? 'pack' : 'packs'}</Text>
      <View style={styles.dash} />
      <View style={styles.pickupRow}>
        <Icon name="clock" size={14} color={palette.muted} />
        <Text style={styles.meta}>Recogida: {pickupText(item)}</Text>
      </View>
      <Text style={[styles.meta, { marginTop: 4 }]}>A nombre de {item.customerName} · {item.customerPhone}</Text>
      <View style={[styles.row, { marginTop: 12 }]}>
        <Text style={styles.total}>{money(item.unitPrice * item.quantity)}</Text>
        {active ? (
          <Pressable accessibilityRole="button" onPress={confirmCancel} style={styles.cancel}>
            <Text style={styles.cancelText}>Cancelar</Text>
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.viewReceipt}>Ver comprobante ›</Text>
    </Pressable>
    </Animated.View>
  );
}

export default function ReservationsScreen() {
  const router = useRouter();
  const reservations = useReservations();
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = reservations.find((item) => item.id === selectedId) ?? null;
  const items = reservations.filter((item) => (tab === 'active' ? item.status === 'active' : item.status === 'cancelled'));

  return (
    <Screen showBottomNav navVariant="client" showBrand={false} showDecorations={false}>
      <Text style={styles.eyebrow}>TUS RESCATES</Text>
      <Text style={styles.title}>Mis reservas</Text>

      <View style={styles.tabs}>
        {(['active', 'history'] as const).map((key) => (
          <Pressable key={key} onPress={() => setTab(key)} style={[styles.tab, tab === key && styles.tabOn]}>
            <Text style={[styles.tabText, tab === key && styles.tabTextOn]}>{key === 'active' ? 'Activas' : 'Historial'}</Text>
          </Pressable>
        ))}
      </View>

      {items.length > 0 ? items.map((item) => <Ticket active={tab === 'active'} item={item} key={item.id} onOpen={() => setSelectedId(item.id)} />) : (
        <View style={styles.empty}>
          <View style={styles.emptyIcon}><Icon name="ticket" size={22} /></View>
          <Text style={styles.emptyTitle}>{tab === 'active' ? 'Aún no tienes reservas' : 'Todavía no hay historial'}</Text>
          <Text style={styles.emptyText}>{tab === 'active' ? 'Cuando reserves un pack aparecerá aquí.' : 'Tus reservas canceladas aparecerán aquí.'}</Text>
          {tab === 'active' ? (
            <Pressable onPress={() => router.replace('/client-explore')} style={styles.emptyButton}>
              <Text style={styles.emptyButtonText}>Explorar ofertas</Text>
            </Pressable>
          ) : null}
        </View>
      )}
      <Receipt item={selected} onClose={() => setSelectedId(null)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: palette.purpleDark, fontSize: 28, fontWeight: '800' },
  tabs: { borderBottomColor: palette.border, borderBottomWidth: 1, flexDirection: 'row', gap: 22, marginBottom: 6, marginTop: 16 },
  tab: { borderBottomColor: 'transparent', borderBottomWidth: 2, paddingVertical: 9 },
  tabOn: { borderBottomColor: palette.purple },
  tabText: { color: palette.muted, fontSize: 14, fontWeight: '700' },
  tabTextOn: { color: palette.purpleDark },
  ticket: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, marginTop: 12, padding: 15 },
  row: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  code: { color: palette.purple, fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  name: { color: palette.text, fontSize: 18, fontWeight: '800', marginTop: 10 },
  meta: { color: palette.muted, fontSize: 12, marginTop: 3 },
  dash: { borderColor: '#E3D9E8', borderStyle: 'dashed', borderTopWidth: 1.5, marginVertical: 11 },
  pickupRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  total: { color: palette.purpleDark, fontSize: 20, fontWeight: '900' },
  cancel: { backgroundColor: clientColors.dangerSoft, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  cancelText: { color: clientColors.danger, fontSize: 12, fontWeight: '800' },
  viewReceipt: { color: palette.purple, fontSize: 12, fontWeight: '800', marginTop: 12, textAlign: 'right' },
  backdrop: { backgroundColor: 'rgba(40,20,55,0.5)', flex: 1, justifyContent: 'flex-end' },
  receipt: { backgroundColor: palette.background, borderTopLeftRadius: 26, borderTopRightRadius: 26, maxHeight: '92%', paddingHorizontal: 22, paddingTop: 22 },
  receiptHeader: { alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  brand: { color: palette.purple, fontSize: 13, fontWeight: '900', letterSpacing: 0.5 },
  receiptTitle: { color: palette.purpleDark, fontSize: 21, fontWeight: '800', marginTop: 3 },
  closeButton: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 17, height: 34, justifyContent: 'center', width: 34 },
  codeBox: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 16, marginTop: 16, paddingHorizontal: 16, paddingVertical: 18 },
  codeLabel: { color: palette.purple, fontSize: 10, fontWeight: '800', letterSpacing: 1.3 },
  codeValue: { color: palette.purpleDark, fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }), fontSize: 32, fontWeight: '800', letterSpacing: 3, marginVertical: 8 },
  codeHint: { color: palette.muted, fontSize: 12, lineHeight: 18, textAlign: 'center' },
  receiptRow: { flexDirection: 'row', gap: 16, justifyContent: 'space-between', paddingVertical: 6 },
  receiptLabel: { color: palette.muted, fontSize: 12 },
  receiptValue: { color: palette.text, flexShrink: 1, fontSize: 13, fontWeight: '700', textAlign: 'right' },
  sectionLabel: { color: palette.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  itemRow: { alignItems: 'center', flexDirection: 'row', gap: 12 },
  itemName: { color: palette.text, fontSize: 15, fontWeight: '800' },
  itemMeta: { color: palette.muted, fontSize: 12, marginTop: 3 },
  itemTotal: { color: palette.text, fontSize: 15, fontWeight: '800' },
  totalRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  totalLabel: { color: palette.text, fontSize: 13, fontWeight: '700' },
  totalValue: { color: palette.purpleDark, fontSize: 24, fontWeight: '900' },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, marginBottom: 6, marginTop: 10 },
  empty: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, marginTop: 14, padding: 28 },
  emptyIcon: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 14, height: 46, justifyContent: 'center', marginBottom: 12, width: 46 },
  emptyTitle: { color: palette.text, fontSize: 15, fontWeight: '800' },
  emptyText: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 6, textAlign: 'center' },
  emptyButton: { backgroundColor: palette.purple, borderRadius: 12, marginTop: 16, paddingHorizontal: 22, paddingVertical: 13 },
  emptyButtonText: { color: palette.white, fontSize: 14, fontWeight: '800' },
});
