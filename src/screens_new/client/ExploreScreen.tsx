import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { getProducts, type Product } from '@/services/products-api';
import { availableQuantity, useReservations } from '@/services/reservations-store';
import { Screen, palette } from '../shared/screen-ui';
import { clientColors, Icon, money, pickupText, ProductArt } from './client-ui';

const categories = ['Todos', 'Panadería', 'Pupusería', 'Comida preparada', 'Postres', 'Otros'];

function ProductCard({ product, left, index, onPress }: { product: Product; left: number; index: number; onPress: () => void }) {
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 60).duration(380)}>
      <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <ProductArt product={product} height={148}>
          <View style={styles.badge}><Text style={styles.badgeText}>{product.category}</Text></View>
        </ProductArt>
        <View style={styles.cardBody}>
          <View style={styles.topline}>
            <Text numberOfLines={1} style={styles.seller}>{product.sellerName}</Text>
            <Text style={styles.left}>{left} {left === 1 ? 'disponible' : 'disponibles'}</Text>
          </View>
          <Text style={styles.name}>{product.name}</Text>
          <View style={styles.pickupRow}>
            <Icon name="clock" size={13} color={palette.muted} />
            <Text style={styles.pickup}>Recogida: {pickupText(product)}</Text>
          </View>
          <View style={styles.footer}>
            <Text style={styles.cta}>Ver detalle</Text>
            <Text style={styles.price}>{money(product.price)}</Text>
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export default function ExploreScreen() {
  const router = useRouter();
  const reservations = useReservations();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todos');

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = async () => {
        try {
          const result = await getProducts();
          if (active) { setProducts(result); setError(''); }
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los productos.');
        } finally {
          if (active) setLoading(false);
        }
      };
      void refresh();
      const timer = setInterval(() => { void refresh(); }, 5000);
      return () => { active = false; clearInterval(timer); };
    }, []),
  );

  // Solo se muestran los productos con packs disponibles: al agotarse desaparecen solos.
  const available = useMemo(
    () => products.map((product) => ({ product, left: availableQuantity(product, reservations) })).filter((item) => item.left > 0),
    [products, reservations],
  );
  const totalPacks = available.reduce((total, item) => total + item.left, 0);
  const visible = available.filter(({ product }) => {
    const text = `${product.name} ${product.sellerName}`.toLowerCase();
    return (category === 'Todos' || product.category === category) && text.includes(query.trim().toLowerCase());
  });

  return (
    <Screen showBottomNav showBrand={false}>
      <Text style={styles.eyebrow}>CERCA DE TI</Text>
      <Text style={styles.title}>¿Qué rescatamos hoy?</Text>
      <Text style={styles.subtitle}>Packs compartidos por negocios de tu comunidad.</Text>

      <View style={styles.search}>
        <Icon name="search" size={18} color="#A39BA7" />
        <TextInput onChangeText={setQuery} placeholder="Busca comida o un comercio" placeholderTextColor="#A39BA7" style={styles.searchInput} value={query} />
        {query ? <Pressable accessibilityLabel="Borrar búsqueda" onPress={() => setQuery('')}><Icon name="close" size={16} color="#A39BA7" /></Pressable> : null}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} style={styles.chipsScroll}>
        {categories.map((item) => (
          <Pressable key={item} onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipOn]}>
            <Text style={[styles.chipText, category === item && styles.chipTextOn]}>{item}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.impact}>
        <View style={styles.impactIcon}><Icon name="leaf" size={18} color="#FFFFFF" /></View>
        <Text style={styles.impactText}>{totalPacks} {totalPacks === 1 ? 'pack disponible' : 'packs disponibles'} ahora</Text>
      </View>

      <Text style={styles.section}>Ofertas disponibles</Text>
      <Text style={styles.count}>{visible.length} {visible.length === 1 ? 'opción' : 'opciones'} para rescatar</Text>

      {error ? (
        <View style={styles.message}>
          <Text style={styles.messageTitle}>No pudimos conectar con la API</Text>
          <Text style={styles.messageText}>{error}</Text>
        </View>
      ) : null}

      {loading && products.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={palette.purple} /></View>
      ) : visible.length > 0 ? (
        <View style={styles.list}>
          {visible.map(({ product, left }, index) => (
            <ProductCard index={index} key={product.id} left={left} onPress={() => router.push({ pathname: '/product-detail', params: { id: product.id } })} product={product} />
          ))}
        </View>
      ) : !error ? (
        <View style={styles.message}>
          <Text style={styles.messageTitle}>{available.length === 0 ? 'Por ahora no hay packs' : 'Sin resultados'}</Text>
          <Text style={styles.messageText}>{available.length === 0 ? 'Cuando un negocio publique un pack, aparecerá aquí.' : 'Prueba con otra palabra o categoría.'}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  eyebrow: { color: palette.green, fontSize: 10, fontWeight: '800', letterSpacing: 1.2, marginBottom: 8 },
  title: { color: palette.purpleDark, fontSize: 28, fontWeight: '800', lineHeight: 34 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginBottom: 16, marginTop: 6 },
  search: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 12, borderWidth: 1, flexDirection: 'row', gap: 9, minHeight: 48, paddingHorizontal: 13 },
  searchInput: { color: palette.text, flex: 1, fontSize: 15, minHeight: 46 },
  chipsScroll: { flexGrow: 0, marginHorizontal: -22 },
  chips: { gap: 8, paddingHorizontal: 22, paddingVertical: 14 },
  chip: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 20, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: palette.purple, borderColor: palette.purple },
  chipText: { color: palette.text, fontSize: 12, fontWeight: '700' },
  chipTextOn: { color: palette.white },
  impact: { alignItems: 'center', backgroundColor: clientColors.paleGreen, borderColor: '#DDEDB9', borderRadius: 16, borderWidth: 1, flexDirection: 'row', gap: 11, marginBottom: 18, padding: 12 },
  impactIcon: { alignItems: 'center', backgroundColor: palette.green, borderRadius: 10, height: 34, justifyContent: 'center', width: 34 },
  impactText: { color: clientColors.greenDark, fontSize: 13, fontWeight: '700' },
  section: { color: palette.purpleDark, fontSize: 18, fontWeight: '800' },
  count: { color: palette.muted, fontSize: 11, marginTop: 3 },
  list: { gap: 14, marginTop: 14, paddingBottom: 12 },
  card: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 19, borderWidth: 1, overflow: 'hidden' },
  cardPressed: { opacity: 0.92, transform: [{ scale: 0.985 }] },
  badge: { backgroundColor: clientColors.paleGreen, borderRadius: 10, left: 10, paddingHorizontal: 9, paddingVertical: 4, position: 'absolute', top: 10 },
  badgeText: { color: clientColors.greenDark, fontSize: 11, fontWeight: '800' },
  cardBody: { padding: 14 },
  topline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  seller: { color: palette.muted, flex: 1, fontSize: 11, fontWeight: '600', marginRight: 10 },
  left: { color: clientColors.greenDark, fontSize: 11, fontWeight: '800' },
  name: { color: palette.text, fontSize: 18, fontWeight: '800', marginTop: 5 },
  pickupRow: { alignItems: 'center', flexDirection: 'row', gap: 6, marginTop: 7 },
  pickup: { color: palette.muted, fontSize: 12 },
  footer: { alignItems: 'center', borderTopColor: '#F1ECF3', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingTop: 11 },
  cta: { color: palette.purple, fontSize: 12, fontWeight: '800' },
  price: { color: palette.purpleDark, fontSize: 20, fontWeight: '900' },
  loading: { paddingVertical: 50 },
  message: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, marginTop: 16, padding: 20 },
  messageTitle: { color: palette.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  messageText: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 7, textAlign: 'center' },
});
