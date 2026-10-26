import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { getProducts, type Product } from '@/services/products-api';
import { Eyebrow, PrimaryButton, Screen, palette } from './screen-ui';

function ProductCard({ product }: { product: Product }) {
  return (
    <View style={styles.card}>
      {product.imageUrl ? (
        <Image accessibilityLabel={product.name} source={{ uri: product.imageUrl }} style={styles.productImage} />
      ) : (
        <View style={styles.imagePlaceholder}><Text style={styles.imagePlaceholderIcon}>♡</Text><Text style={styles.imagePlaceholderLabel}>Pack Nokory</Text></View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTopline}>
          <Text style={styles.category}>{product.category}</Text>
          <Text style={styles.quantity}>{product.quantity} disponibles</Text>
        </View>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.description}>{product.description}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.sellerRow}><Text style={styles.pin}>⌖</Text><Text numberOfLines={1} style={styles.seller}>{product.sellerName}</Text></View>
          <Text style={styles.price}>${product.price.toFixed(2)}</Text>
        </View>
        <Text style={styles.pickup}>Recogida: {product.pickupStart} – {product.pickupEnd}</Text>
      </View>
    </View>
  );
}

export default function ProductsScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadProducts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await getProducts();
      setProducts(result);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los productos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = async () => {
        try {
          const result = await getProducts();
          if (active) {
            setProducts(result);
            setError('');
          }
        } catch (cause) {
          if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los productos.');
        } finally {
          if (active) setLoading(false);
        }
      };
      void refresh();
      const timer = setInterval(() => { void refresh(); }, 5000);
      return () => {
        active = false;
        clearInterval(timer);
      };
    }, []),
  );

  return (
    <Screen contentStyle={styles.screenContent}>
      <Eyebrow>Cerca de ti</Eyebrow>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>¿Qué rescatamos hoy?</Text>
          <Text style={styles.subtitle}>Packs compartidos por negocios de tu comunidad.</Text>
        </View>
        <Pressable accessibilityRole="button" onPress={() => router.push('/publish')} style={styles.publishButton}>
          <Text style={styles.publishButtonText}>＋</Text>
        </Pressable>
      </View>
      <View style={styles.syncRow}>
        <View style={styles.liveStatus}><View style={styles.liveDot} /><Text style={styles.liveText}>Actualización automática cada 5 s</Text></View>
        <Pressable accessibilityRole="button" disabled={refreshing} onPress={() => { void loadProducts(true); }}><Text style={styles.refreshText}>{refreshing ? 'Actualizando…' : 'Actualizar'}</Text></Pressable>
      </View>

      {error ? (
        <View style={styles.messageCard}>
          <Text style={styles.messageTitle}>No pudimos conectar con la API</Text>
          <Text style={styles.message}>{error}</Text>
          <PrimaryButton label="Reintentar" onPress={() => { void loadProducts(true); }} />
        </View>
      ) : null}

      {loading && products.length === 0 ? (
        <View style={styles.loading}><ActivityIndicator color={palette.purple} /><Text style={styles.message}>Cargando publicaciones…</Text></View>
      ) : products.length > 0 ? (
        <View style={styles.list}>
          {products.map((product) => <ProductCard key={product.id} product={product} />)}
        </View>
      ) : !error ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>♡</Text>
          <Text style={styles.messageTitle}>Aún no hay packs publicados</Text>
          <Text style={styles.message}>Cuando un negocio publique un producto, aparecerá aquí para todas las personas conectadas.</Text>
          <PrimaryButton label="Publicar el primer pack" onPress={() => router.push('/publish')} />
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flex: 1 },
  headingRow: { alignItems: 'center', flexDirection: 'row', gap: 12, marginBottom: 12 },
  headingCopy: { flex: 1 },
  title: { color: palette.purpleDark, fontSize: 28, fontWeight: '800', lineHeight: 34 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  publishButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 14, height: 46, justifyContent: 'center', width: 46 },
  publishButtonText: { color: palette.white, fontSize: 28, fontWeight: '500', lineHeight: 32 },
  syncRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 13 },
  liveStatus: { alignItems: 'center', flexDirection: 'row', gap: 7 },
  liveDot: { backgroundColor: palette.green, borderRadius: 4, height: 8, width: 8 },
  liveText: { color: palette.muted, fontSize: 10 },
  refreshText: { color: palette.purple, fontSize: 11, fontWeight: '700' },
  list: { gap: 13, paddingBottom: 28 },
  card: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 19, borderWidth: 1, overflow: 'hidden' },
  productImage: { backgroundColor: '#F4EFF9', height: 156, width: '100%' },
  imagePlaceholder: { alignItems: 'center', backgroundColor: '#EAF3D8', height: 128, justifyContent: 'center' },
  imagePlaceholderIcon: { color: '#54825D', fontSize: 31 },
  imagePlaceholderLabel: { color: '#54825D', fontSize: 11, fontWeight: '700', marginTop: 4 },
  cardBody: { padding: 14 },
  cardTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  category: { color: palette.purple, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  quantity: { color: '#54825D', fontSize: 10, fontWeight: '700' },
  productName: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 6 },
  description: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  sellerRow: { alignItems: 'center', flexDirection: 'row', flex: 1, gap: 4, marginRight: 12 },
  pin: { color: palette.green, fontSize: 16 },
  seller: { color: palette.muted, flex: 1, fontSize: 11, fontWeight: '600' },
  price: { color: palette.purpleDark, fontSize: 18, fontWeight: '900' },
  pickup: { color: palette.muted, fontSize: 10, marginTop: 6 },
  loading: { alignItems: 'center', gap: 11, paddingVertical: 55 },
  emptyCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 19, borderWidth: 1, marginTop: 17, padding: 22 },
  emptyIcon: { color: palette.purple, fontSize: 30, marginBottom: 6 },
  messageCard: { backgroundColor: palette.white, borderColor: '#F1CECE', borderRadius: 18, borderWidth: 1, marginVertical: 12, padding: 16 },
  messageTitle: { color: palette.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  message: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 7, textAlign: 'center' },
});
