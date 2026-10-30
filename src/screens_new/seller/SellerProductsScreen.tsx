import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  getSellerProducts,
  unpublishSellerProduct,
  updateSellerProduct,
  type Product,
} from '@/services/products-api';
import { Eyebrow, Screen, palette } from '../shared/screen-ui';

type ProductDraft = {
  name: string;
  description: string;
  category: string;
  price: string;
  quantity: string;
  pickupStart: string;
  pickupEnd: string;
};

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
          <SymbolView name={{ ios: 'shippingbox.fill', android: 'inventory_2', web: 'inventory_2' }} tintColor={palette.green} size={27} />
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
        <Text numberOfLines={2} style={styles.description}>{product.description}</Text>
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

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.summaryValue}>{value}</Text>
      <Text numberOfLines={1} style={styles.summaryDetail}>{detail}</Text>
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
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [draft, setDraft] = useState<ProductDraft | null>(null);
  const [saving, setSaving] = useState(false);

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
          if (active) setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus productos.');
        } finally {
          if (active) setLoading(false);
        }
      }
      void load();
      return () => { active = false; };
    }, []),
  );

  function openEditor(product: Product) {
    setEditingProduct(product);
    setDraft({
      name: product.name,
      description: product.description,
      category: product.category,
      price: String(product.price),
      quantity: String(product.quantity),
      pickupStart: product.pickupStart,
      pickupEnd: product.pickupEnd,
    });
    setError('');
  }

  async function saveProduct() {
    if (!editingProduct || !draft) return;
    const price = Number(draft.price.replace(',', '.'));
    const quantity = Number(draft.quantity);
    if (draft.name.trim().length < 3) {
      setError('Escribe un nombre de al menos 3 caracteres.');
      return;
    }
    if (!draft.category.trim()) {
      setError('Escribe una categoría.');
      return;
    }
    if (!Number.isFinite(price) || price <= 0) {
      setError('Ingresa un precio mayor que cero.');
      return;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      setError('La cantidad debe ser al menos un pack.');
      return;
    }
    if (!draft.pickupStart.trim() || !draft.pickupEnd.trim()) {
      setError('Completa el horario de recogida.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const updated = await updateSellerProduct(editingProduct.id, {
        name: draft.name.trim(),
        description: draft.description.trim(),
        category: draft.category.trim(),
        price,
        quantity,
        pickupStart: draft.pickupStart.trim(),
        pickupEnd: draft.pickupEnd.trim(),
      });
      setProducts((current) => current.map((item) => item.id === updated.id ? updated : item));
      setEditingProduct(null);
      setDraft(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar el producto.');
    } finally {
      setSaving(false);
    }
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
  const navigationParams = {
    role: 'seller',
    ...(typeof email === 'string' ? { email } : {}),
    ...(typeof businessName === 'string' ? { businessName } : {}),
  };

  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Eyebrow>Panel del negocio</Eyebrow>
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

      <View style={styles.summary}>
        <SummaryCard label="Publicados" value={String(publishedCount)} detail="productos activos" />
        <SummaryCard label="Packs disponibles" value={String(availablePacks)} detail="en oferta" />
        <SummaryCard label="Valor rescatado" value="$0.00" detail="ventas registradas" />
      </View>

      <View style={styles.listHeading}>
        <Text style={styles.listTitle}>Tus ofertas</Text>
        <Pressable accessibilityRole="button" disabled={refreshing} onPress={() => { void loadProducts(true); }}>
          <Text style={styles.refreshText}>{refreshing ? 'Actualizando…' : 'Actualizar'}</Text>
        </Pressable>
      </View>

      {error && !editingProduct ? (
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
        <View style={styles.emptyCard}>
          <View style={styles.emptyIcon}>
            <SymbolView name={{ ios: 'shippingbox', android: 'inventory_2', web: 'inventory_2' }} tintColor={palette.purple} size={25} />
          </View>
          <Text style={styles.emptyTitle}>Aún no tienes productos</Text>
          <Text style={styles.emptyDescription}>Publica tu primera oferta para que aparezca aquí.</Text>
          <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/publish', params: navigationParams })} style={styles.emptyAction}>
            <Text style={styles.emptyActionText}>Publicar producto</Text>
          </Pressable>
        </View>
      ) : null}

      <Modal
        animationType="slide"
        onRequestClose={() => {
          if (!saving) {
            setEditingProduct(null);
            setDraft(null);
          }
        }}
        transparent
        visible={editingProduct !== null && draft !== null}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeading}>
              <Text style={styles.modalTitle}>Editar producto</Text>
              <Pressable
                accessibilityLabel="Cerrar edición"
                accessibilityRole="button"
                disabled={saving}
                onPress={() => { setEditingProduct(null); setDraft(null); setError(''); }}
                style={styles.modalClose}
              >
                <Text style={styles.modalCloseText}>×</Text>
              </Pressable>
            </View>
            {draft ? (
              <>
                <TextInput accessibilityLabel="Nombre" onChangeText={(name) => setDraft({ ...draft, name })} placeholder="Nombre" style={styles.input} value={draft.name} />
                <TextInput accessibilityLabel="Descripción" multiline onChangeText={(description) => setDraft({ ...draft, description })} placeholder="Descripción" style={[styles.input, styles.descriptionInput]} value={draft.description} />
                <TextInput accessibilityLabel="Categoría" onChangeText={(category) => setDraft({ ...draft, category })} placeholder="Categoría" style={styles.input} value={draft.category} />
                <View style={styles.inputRow}>
                  <TextInput accessibilityLabel="Precio" keyboardType="decimal-pad" onChangeText={(price) => setDraft({ ...draft, price })} placeholder="Precio" style={[styles.input, styles.halfInput]} value={draft.price} />
                  <TextInput accessibilityLabel="Cantidad" keyboardType="number-pad" onChangeText={(quantity) => setDraft({ ...draft, quantity })} placeholder="Cantidad" style={[styles.input, styles.halfInput]} value={draft.quantity} />
                </View>
                <View style={styles.inputRow}>
                  <TextInput accessibilityLabel="Recogida desde" onChangeText={(pickupStart) => setDraft({ ...draft, pickupStart })} placeholder="Desde" style={[styles.input, styles.halfInput]} value={draft.pickupStart} />
                  <TextInput accessibilityLabel="Recogida hasta" onChangeText={(pickupEnd) => setDraft({ ...draft, pickupEnd })} placeholder="Hasta" style={[styles.input, styles.halfInput]} value={draft.pickupEnd} />
                </View>
              </>
            ) : null}
            {error ? <Text accessibilityRole="alert" style={styles.errorText}>{error}</Text> : null}
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => { void saveProduct(); }} style={[styles.saveButton, saving && styles.disabledButton]}>
              {saving ? <ActivityIndicator color={palette.white} /> : <Text style={styles.saveButtonText}>Guardar cambios</Text>}
            </Pressable>
          </View>
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { paddingBottom: 24, paddingHorizontal: 16, paddingTop: 22 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between', marginBottom: 20 },
  headerText: { flex: 1 },
  title: { color: palette.purpleDark, fontSize: 29, fontWeight: '800', lineHeight: 36 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 5 },
  addButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 15, height: 48, justifyContent: 'center', marginTop: 10, width: 48 },
  addButtonText: { color: palette.white, fontSize: 31, fontWeight: '400', lineHeight: 35, marginTop: -2 },
  summary: { flexDirection: 'row', gap: 8, marginBottom: 25 },
  summaryCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 15, borderWidth: 1, flex: 1, minHeight: 104, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 12 },
  summaryLabel: { color: palette.muted, fontSize: 10, fontWeight: '700', lineHeight: 14, minHeight: 28 },
  summaryValue: { color: palette.purpleDark, fontSize: 22, fontWeight: '900', marginTop: 3 },
  summaryDetail: { color: palette.muted, fontSize: 9, marginTop: 3 },
  listHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  listTitle: { color: palette.text, fontSize: 17, fontWeight: '800' },
  refreshText: { color: palette.purple, fontSize: 11, fontWeight: '700' },
  productList: { gap: 14, paddingBottom: 20 },
  productCard: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 17, borderWidth: 1, overflow: 'hidden' },
  productImage: { backgroundColor: '#F4EFF9', height: 160, width: '100%' },
  imagePlaceholder: { alignItems: 'center', backgroundColor: '#EAF3D8', height: 118, justifyContent: 'center' },
  productContent: { padding: 14 },
  productMeta: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  category: { color: palette.purple, flex: 1, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  statusPill: { borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 },
  statusActive: { backgroundColor: '#EDF5DC' },
  statusInactive: { backgroundColor: '#F2EEF3' },
  statusText: { fontSize: 10, fontWeight: '800' },
  statusTextActive: { color: '#54825D' },
  statusTextInactive: { color: palette.muted },
  productName: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 9 },
  description: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  schedule: { color: palette.muted, fontSize: 11, marginTop: 11 },
  availableQuantity: { color: palette.green, fontSize: 11, fontWeight: '700', marginTop: 5 },
  actions: { flexDirection: 'row', gap: 9, marginTop: 14 },
  editButton: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42 },
  editButtonText: { color: palette.purple, fontSize: 12, fontWeight: '800' },
  unpublishButton: { alignItems: 'center', backgroundColor: '#FFF0F1', borderRadius: 10, flex: 1, justifyContent: 'center', minHeight: 42 },
  unpublishButtonText: { color: '#A75252', fontSize: 12, fontWeight: '800' },
  disabledButton: { opacity: 0.5 },
  emptyCard: { alignItems: 'center', backgroundColor: palette.white, borderColor: palette.border, borderRadius: 18, borderWidth: 1, marginTop: 8, padding: 24 },
  emptyIcon: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 17, height: 58, justifyContent: 'center', marginBottom: 12, width: 58 },
  emptyTitle: { color: palette.purpleDark, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  emptyDescription: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 7, textAlign: 'center' },
  emptyAction: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 11, justifyContent: 'center', marginTop: 16, minHeight: 43, paddingHorizontal: 18 },
  emptyActionText: { color: palette.white, fontSize: 12, fontWeight: '800' },
  loading: { alignItems: 'center', gap: 11, paddingVertical: 40 },
  messageCard: { backgroundColor: palette.white, borderColor: '#F1CECE', borderRadius: 15, borderWidth: 1, marginVertical: 10, padding: 15 },
  errorText: { color: '#B23B45', fontSize: 12, lineHeight: 18 },
  retryButton: { alignSelf: 'flex-start', marginTop: 10 },
  retryText: { color: palette.purple, fontSize: 12, fontWeight: '800' },
  modalBackdrop: { backgroundColor: '#1C142466', flex: 1, justifyContent: 'flex-end' },
  modalCard: { backgroundColor: palette.background, borderTopLeftRadius: 22, borderTopRightRadius: 22, maxHeight: '90%', paddingBottom: 28, paddingHorizontal: 20, paddingTop: 18 },
  modalHeading: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  modalTitle: { color: palette.purpleDark, fontSize: 20, fontWeight: '800' },
  modalClose: { alignItems: 'center', backgroundColor: palette.palePurple, borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  modalCloseText: { color: palette.purple, fontSize: 25, lineHeight: 29 },
  input: { backgroundColor: palette.white, borderColor: palette.border, borderRadius: 11, borderWidth: 1, color: palette.text, fontSize: 14, marginBottom: 10, minHeight: 46, paddingHorizontal: 12 },
  descriptionInput: { minHeight: 74, paddingTop: 11, textAlignVertical: 'top' },
  inputRow: { flexDirection: 'row', gap: 9 },
  halfInput: { flex: 1, minWidth: 0 },
  saveButton: { alignItems: 'center', backgroundColor: palette.purple, borderRadius: 11, justifyContent: 'center', marginTop: 5, minHeight: 48 },
  saveButtonText: { color: palette.white, fontSize: 13, fontWeight: '800' },
});
