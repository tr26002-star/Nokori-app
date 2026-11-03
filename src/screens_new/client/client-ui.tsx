import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import type { Product } from '@/services/products-api';
import { palette } from '../shared/screen-ui';

export const clientColors = {
  paleGreen: '#EDF5DC',
  green: '#63834F',
  greenDark: '#3F6B2F',
  danger: '#B64D55',
  dangerSoft: '#FFF0F1',
};

const icons = {
  search: { ios: 'magnifyingglass', android: 'search', web: 'search' },
  clock: { ios: 'clock', android: 'schedule', web: 'schedule' },
  store: { ios: 'storefront', android: 'storefront', web: 'storefront' },
  leaf: { ios: 'leaf', android: 'eco', web: 'eco' },
  box: { ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' },
  close: { ios: 'xmark', android: 'close', web: 'close' },
  back: { ios: 'chevron.left', android: 'arrow_back', web: 'arrow_back' },
  chat: { ios: 'bubble.left', android: 'chat_bubble', web: 'chat_bubble' },
  idea: { ios: 'lightbulb', android: 'lightbulb', web: 'lightbulb' },
  check: { ios: 'checkmark.circle', android: 'check_circle', web: 'check_circle' },
  ticket: { ios: 'ticket', android: 'confirmation_number', web: 'confirmation_number' },
} as const;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 18, color = palette.purple }: { name: IconName; size?: number; color?: string }) {
  const icon = icons[name];
  return <SymbolView name={{ ios: icon.ios, android: icon.android, web: icon.web }} size={size} tintColor={color} />;
}

export const money = (value: number) => `$${value.toFixed(2)}`;
export const pickupText = (item: { pickupStart: string; pickupEnd: string }) => `${item.pickupStart} – ${item.pickupEnd}`;

/** Foto del producto; si el vendedor no subió foto, muestra un fondo de respaldo. */
export function ProductArt({ product, height, children }: { product: Pick<Product, 'name' | 'imageUrl'>; height: number; children?: ReactNode }) {
  return (
    <View style={{ height, width: '100%' }}>
      {product.imageUrl ? (
        <Image accessibilityLabel={product.name} resizeMode="cover" source={{ uri: product.imageUrl }} style={StyleSheet.absoluteFill} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
          <Icon name="leaf" size={34} color="#7FA06B" />
          <Text style={styles.placeholderText}>Pack Nokory</Text>
        </View>
      )}
      {children}
    </View>
  );
}

export function Pill({ label, tone = 'purple' }: { label: string; tone?: 'purple' | 'green' }) {
  return (
    <View style={[styles.pill, tone === 'green' && { backgroundColor: clientColors.paleGreen }]}>
      <Text style={[styles.pillText, tone === 'green' && { color: clientColors.greenDark }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { alignItems: 'center', backgroundColor: '#E6EFD6', justifyContent: 'center', gap: 6 },
  placeholderText: { color: '#6C8F58', fontSize: 11, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', backgroundColor: palette.palePurple, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  pillText: { color: palette.purple, fontSize: 11, fontWeight: '800' },
});
