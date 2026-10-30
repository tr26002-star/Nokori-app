import { SymbolView } from 'expo-symbols';
import { StyleSheet, Text, View } from 'react-native';
import { Eyebrow, Screen, palette } from '../shared/screen-ui';

export default function SellerReservationsScreen() {
  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      <Eyebrow>Recogidas</Eyebrow>
      <Text style={styles.title}>Reservas del negocio</Text>
      <Text style={styles.subtitle}>Valida el ticket del cliente al entregar cada pedido.</Text>

      <View style={styles.emptyCard}>
        <View style={styles.receiptIcon}>
          <SymbolView
            name={{ ios: 'doc.text', android: 'receipt_long', web: 'receipt_long' }}
            tintColor={palette.purple}
            size={24}
          />
        </View>
        <Text style={styles.emptyTitle}>Todavía no tienes pedidos</Text>
        <Text style={styles.emptyDescription}>
          Las reservas aparecerán aquí cuando un cliente compre uno de tus productos.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 28 },
  title: { color: palette.purpleDark, fontSize: 29, fontWeight: '700', lineHeight: 37 },
  subtitle: { color: palette.muted, fontSize: 14, lineHeight: 21, marginTop: 7 },
  emptyCard: {
    alignItems: 'center',
    borderColor: '#DCCBE7',
    borderRadius: 19,
    borderStyle: 'dashed',
    borderWidth: 1.5,
    height: 315,
    justifyContent: 'center',
    marginTop: 28,
    paddingHorizontal: 22,
    paddingVertical: 28,
  },
  receiptIcon: {
    alignItems: 'center',
    backgroundColor: palette.palePurple,
    borderRadius: 17,
    height: 66,
    justifyContent: 'center',
    marginBottom: 17,
    width: 66,
  },
  emptyTitle: { color: palette.purpleDark, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyDescription: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 8, textAlign: 'center' },
});
