import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import {
  getSellerProducts,
  unpublishSellerProduct,
  type Product,
} from '@/services/products-api';
import { Eyebrow, Screen, palette } from '../shared/screen-ui';

function ProductCard({
  product,
  onEdit,
  onUnpublish,
}: {
  product: Product;
  onEdit: () => void;
  onUnpublish: () => void;
}) {
  const isAvailable = product.isPublished && product.quantity > 0;
  return (
    <View style={styles.productCard}>
      {product.imageUrl ? (
        <Image accessibilityLabel={product.name} source={{ uri: product.imageUrl }} style={styles.productImage} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <SymbolView name={{ ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }} tintColor={palette.purple} size={28} />
        </View>
      )}
      <View style={styles.productContent}>
        <View style={styles.productMeta}>
          <Text style={styles.category}>{product.category}</Text>
          <View style={[styles.statusPill, isAvailable ? styles.statusActive : styles.statusInactive]}>
            <Text style={[styles.statusText, isAvailable ? styles.statusTextActive : styles.statusTextInactive]}>
              {isAvailable ? 'Publicado' : 'Despublicado'}
            </Text>
          </View>
        </View>
        <Text style={styles.productName}>{product.name}</Text>
        {product.description ? (
          <Text numberOfLines={2} style={styles.description}>{product.description}</Text>
        ) : null}
        <Text style={styles.schedule}>Recogida: {product.pickupStart} – {product.pickupEnd}</Text>
        <Text style={styles.availableQuantity}>{product.quantity} packs disponibles · ${product.price.toFixed(2)}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onEdit} style={styles.editButton}>
            <Text style={styles.editButtonText}>Editar</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ disabled: !product.isPublished }}
            disabled={!product.isPublished}
            onPress={onUnpublish}
            style={[styles.unpublishButton, !product.isPublished && styles.disabledButton]}
          >
            <Text style={styles.unpublishButtonText}>Despublicar</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export default function SellerProductsScreen() {
  const router = useRouter();
  const { email, businessName } = useLocalSearchParams<{ email?: string; businessName?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const loadProducts = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      setProducts(await getSellerProducts());
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus productos.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      async function load() {
        setLoading(true);
        try {
          const result = await getSellerProducts();
          if (active) {
            setProducts(result);
            setError('');
          }
        } catch (cause) {
          if (active) {
            setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus productos.');
          }
        } finally {
          if (active) setLoading(false);
        }
      }
      void load();
      return () => { active = false; };
    }, []),
  );

  function openEditor(product: Product) {
    router.push({
      pathname: '/publish',
      params: {
        role: 'seller',
        id: product.id,
        name: product.name,
        description: product.description,
        category: product.category,
        price: String(product.price),
        quantity: String(product.quantity),
        pickupStart: product.pickupStart,
        pickupEnd: product.pickupEnd,
        isEditing: 'true',
        ...(typeof email === 'string' ? { email } : {}),
        ...(typeof businessName === 'string' ? { businessName } : {}),
      },
    });
  }

  function confirmUnpublish(product: Product) {
    Alert.alert(
      'Despublicar producto',
      `¿Quieres retirar “${product.name}” de las ofertas disponibles?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Despublicar',
          style: 'destructive',
          onPress: () => {
            void unpublishSellerProduct(product.id).then(() => {
              setProducts((current) => current.map((item) => item.id === product.id ? { ...item, isPublished: false } : item));
            }).catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : 'No se pudo despublicar el producto.');
            });
          },
        },
      ],
    );
  }

  const publishedCount = products.filter((product) => product.isPublished).length;
  const availablePacks = products.reduce(
    (total, product) => total + (product.isPublished ? product.quantity : 0),
    0,
  );
  const rescuedValueTotal = products
    .filter((product) => product.isPublished)
    .reduce((total, product) => total + (product.price * product.quantity), 0);

  const navigationParams = {
    role: 'seller',
    ...(typeof email === 'string' ? { email } : {}),
    ...(typeof businessName === 'string' ? { businessName } : {}),
  };

  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      {/* Cabecera idéntica al diseño del PDF */}
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Eyebrow>PANEL DEL NEGOCIO</Eyebrow>
          <Text style={styles.title}>Mis productos</Text>
          <Text style={styles.subtitle}>Gestiona tus ofertas y su disponibilidad.</Text>
        </View>
        <Pressable
          accessibilityLabel="Publicar un producto"
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/publish', params: navigationParams })}
          style={styles.addButton}
        >
          <Text style={styles.addButtonText}>+</Text>
        </Pressable>
      </View>

      {/* Métricas con diseño idéntico al PDF: 2 tarjetas arriba y 1 abajo con iconos */}
      <View style={styles.metricsContainer}>
        <View style={styles.metricsRowTop}>
          {/* Publicados */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricLabel}>Publicados</Text>
              <SymbolView
                name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }}
                tintColor={palette.purple}
                size={18}
              />
            </View>
            <Text style={styles.metricValue}>{publishedCount}</Text>
          </View>

          {/* Packs disponibles */}
          <View style={styles.metricCard}>
            <View style={styles.metricCardHeader}>
              <Text style={styles.metricLabel}>Packs disponibles</Text>
              <SymbolView
                name={{ ios: 'leaf', android: 'eco', web: 'eco' }}
                tintColor={palette.purple}
                size={18}
              />
            </View>
            <Text style={styles.metricValue}>{availablePacks}</Text>
          </View>
        </View>

        {/* Valor rescatado ancho */}
        <View style={styles.metricCardFull}>
          <View style={styles.metricCardHeader}>
            <Text style={styles.metricLabel}>Valor rescatado</Text>
            <SymbolView
              name={{ ios: 'heart', android: 'favorite_border', web: 'favorite_border' }}
              tintColor={palette.purple}
              size={18}
            />
          </View>
          <Text style={styles.metricValueLarge}>${rescuedValueTotal.toFixed(2)}</Text>
        </View>
      </View>

      {/* Título de lista de ofertas si existen */}
      {products.length > 0 ? (
        <View style={styles.listHeading}>
          <Text style={styles.listTitle}>Tus ofertas publicadas</Text>
          <Pressable accessibilityRole="button" disabled={refreshing} onPress={() => { void loadProducts(true); }}>
            <Text style={styles.refreshText}>{refreshing ? 'Actualizando…' : 'Actualizar'}</Text>
          </Pressable>
        </View>
      ) : null}

      {error ? (
        <View style={styles.messageCard}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={() => { void loadProducts(); }} style={styles.retryButton}>
            <Text style={styles.retryText}>Reintentar</Text>
          </Pressable>
        </View>
      ) : null}

      {loading && products.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.purple} />
          <Text style={styles.emptyDescription}>Cargando tus productos…</Text>
        </View>
      ) : products.length > 0 ? (
        <View style={styles.productList}>
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              onEdit={() => openEditor(product)}
              onUnpublish={() => confirmUnpublish(product)}
            />
          ))}
        </View>
      ) : !error ? (
        /* Estado vacío idéntico al PDF */
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <SymbolView
              name={{ ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }}
              tintColor={palette.purple}
              size={28}
            />
          </View>
          <Text style={styles.emptyTitle}>Aún no has publicado productos</Text>
          <Text style={styles.emptyDescription}>
            Crea tu primera publicación con su foto, precio de rescate, cantidad y horario de recogida.
          </Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 24, paddingHorizontal: 16, paddingTop: 20 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 20 },
  headerText: { flex: 1 },
  title: { color: palette.purpleDark, fontSize: 30, fontWeight: '800', lineHeight: 36 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 4 },
  addButton: {
    alignItems: 'center',
    backgroundColor: palette.purpleDark,
    borderRadius: 14,
    height: 48,
    justifyContent: 'center',
    marginTop: 4,
    width: 48,
    shadowColor: palette.purpleDark,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  addButtonText: { color: palette.white, fontSize: 28, fontWeight: '400', lineHeight: 32, marginTop: -2 },
  metricsContainer: { marginBottom: 24, gap: 10 },
  metricsRowTop: { flexDirection: 'row', gap: 10 },
  metricCard: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 16,
    borderWidth: 1,
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  metricCardFull: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 16,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  metricCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  metricLabel: { color: palette.muted, fontSize: 12, fontWeight: '600' },
  metricValue: { color: palette.purpleDark, fontSize: 26, fontWeight: '800' },
  metricValueLarge: { color: palette.purpleDark, fontSize: 30, fontWeight: '800' },
  listHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12, marginTop: 4 },
  listTitle: { color: palette.text, fontSize: 16, fontWeight: '800' },
  refreshText: { color: palette.purple, fontSize: 12, fontWeight: '700' },
  productList: { gap: 14, paddingBottom: 20 },
  productCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, overflow: 'hidden' },
  productImage: { backgroundColor: '#F4EFF9', height: 160, width: '100%' },
  imagePlaceholder: { alignItems: 'center', backgroundColor: '#F3EAF7', height: 120, justifyContent: 'center' },
  productContent: { padding: 14 },
  productMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  category: { color: palette.purple, flex: 1, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' },
  statusPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 4 },
  statusActive: { backgroundColor: '#EDF5DC' },
  statusInactive: { backgroundColor: '#F2EEF3' },
  statusText: { fontSize: 10, fontWeight: '800' },
  statusTextActive: { color: '#54825D' },
  statusTextInactive: { color: palette.muted },
  productName: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 8 },
  description: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  schedule: { color: palette.muted, fontSize: 11, marginTop: 10 },
  availableQuantity: { color: palette.green, fontSize: 12, fontWeight: '700', marginTop: 4 },
  actions: { flexDirection: 'row', gap: 10, marginTop: 14 },
  editButton: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42 },
  editButtonText: { color: palette.purple, fontSize: 13, fontWeight: '800' },
  unpublishButton: { alignItems: 'center', backgroundColor: '#FFF0F1', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42 },
  unpublishButtonText: { color: '#A75252', fontSize: 13, fontWeight: '800' },
  disabledButton: { opacity: 0.5 },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 20,
    borderWidth: 1,
    marginTop: 6,
    paddingHorizontal: 24,
    paddingVertical: 44,
  },
  emptyIcon: {
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
  loading: { alignItems: 'center', gap: 11, paddingVertical: 40 },
  messageCard: { backgroundColor: palette.white, borderColor: '#F1CECE', borderRadius: 15, borderWidth: 1, marginVertical: 10, padding: 15 },
  errorText: { color: '#B23B45', fontSize: 12, lineHeight: 18 },
  retryButton: { alignSelf: 'flex-start', marginTop: 10 },
  retryText: { color: palette.purple, fontSize: 12, fontWeight: '800' },
});
