import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import * as Location from 'expo-location';
import * as Linking from 'expo-linking';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { getCurrentBusinessRequest } from '@/services/account-api';
import { getNearbyProducts, type Product } from '@/services/products-api';
import { productCategories } from './product-categories';
import { Eyebrow, FormError, PageHeading, Panel, PrimaryButton, Screen, SecondaryButton, palette } from './screen-ui';

type RadiusKm = 2 | 3 | 5;

const radiusOptions: RadiusKm[] = [2, 3, 5];

function formatDistance(distanceKm: number | null): string {
  return distanceKm === null ? '' : `${distanceKm.toFixed(1)} km`;
}

function ProductCard({ product, onPress }: { product: Product; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${product.name}, ${product.quantity > 0 ? `${product.quantity} unidades disponibles` : 'agotado'}, ${formatDistance(product.distanceKm)}, $${product.price.toFixed(2)}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {product.imageUrl ? (
        <Image accessibilityLabel={product.name} source={{ uri: product.imageUrl }} style={styles.productImage} />
      ) : (
        <View style={styles.imagePlaceholder}>
          <SymbolView name={{ ios: 'leaf.fill', android: 'eco', web: 'eco' }} tintColor="#63834F" size={28} />
          <Text style={styles.imagePlaceholderLabel}>Pack Nokory</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTopline}>
          <Text style={styles.category}>{product.category}</Text>
          <Text style={[styles.quantity, product.quantity === 0 && styles.soldOutText]}>
            {product.quantity > 0 ? `${product.quantity} disponibles` : 'Agotado'}
          </Text>
        </View>
        <Text style={styles.productName}>{product.name}</Text>
        <Text style={styles.description}>{product.description}</Text>
        <View style={styles.cardFooter}>
          <View style={styles.sellerRow}>
            <SymbolView name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} tintColor={palette.green} size={15} />
            <Text numberOfLines={1} style={styles.seller}>{product.sellerName}</Text>
          </View>
          <Text style={styles.price}>${product.price.toFixed(2)}</Text>
        </View>
        <Text style={styles.pickup}>
          {product.distanceKm === null ? '' : `${formatDistance(product.distanceKm)} · `}
          Recogida: {product.pickupStart} – {product.pickupEnd}
        </Text>
      </View>
    </Pressable>
  );
}

function BusinessApprovalBanner() {
  return (
    <View accessibilityRole="alert" style={styles.availabilityCard}>
      <View style={styles.leafIcon}>
        <SymbolView name={{ ios: 'leaf.fill', android: 'eco', web: 'eco' }} tintColor="#63834F" size={21} />
      </View>
      <View style={styles.availabilityCopy}>
        <Text style={styles.availabilityTitle}>Tu negocio fue aprobado</Text>
        <Text style={styles.availabilityDescription}>Desde tu perfil puedes cambiar a modo negocio.</Text>
      </View>
    </View>
  );
}

export default function ProductsScreen() {
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('Todas');
  const [radiusKm, setRadiusKm] = useState<RadiusKm>(3);
  const [location, setLocation] = useState<Location.LocationObject | null>(null);
  const [locationPermission, setLocationPermission] = useState<Location.LocationPermissionResponse | null>(null);
  const [locationError, setLocationError] = useState('');
  const [locationIntro, setLocationIntro] = useState(false);
  const [checkingLocation, setCheckingLocation] = useState(true);
  const [locationActionLoading, setLocationActionLoading] = useState(false);
  const [businessApprovalNotice, setBusinessApprovalNotice] = useState(false);
  const [businessRequestError, setBusinessRequestError] = useState('');
  const deferredIntro = useRef(false);

  const availableProducts = useMemo(() => products.filter((product) => product.quantity > 0), [products]);
  const categories = useMemo(
    () => ['Todas', ...new Set([...productCategories, ...products.map((product) => product.category).filter(Boolean)])],
    [products],
  );
  const filteredProducts = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return products.filter((product) => {
      const matchesCategory = selectedCategory === 'Todas' || product.category === selectedCategory;
      const matchesSearch = !query || [product.name, product.description, product.sellerName, product.category]
        .some((value) => value.toLocaleLowerCase().includes(query));
      return matchesCategory && matchesSearch;
    });
  }, [products, search, selectedCategory]);
  const availableOfferCount = filteredProducts.filter((product) => product.quantity > 0).length;
  const lastUnitProducts = useMemo(
    () => filteredProducts.filter((product) => product.quantity > 0 && product.quantity <= 3),
    [filteredProducts],
  );
  const nearestProducts = useMemo(
    () => [...filteredProducts].sort((a, b) => (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE)),
    [filteredProducts],
  );
  const availablePacks = availableProducts.reduce((total, product) => total + product.quantity, 0);

  const loadProducts = useCallback(async (isRefresh = false) => {
    if (!location) {
      setProducts([]);
      setError(false);
      setLoading(false);
      setRefreshing(false);
      return;
    }
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await getNearbyProducts(
        location.coords.latitude,
        location.coords.longitude,
        radiusKm,
      );
      setProducts(result);
      setError(false);
      setSelectedCategory((current) =>
        current === 'Todas' || productCategories.some((category) => category === current) ||
          result.some((product) => product.category === current && product.quantity > 0)
          ? current
          : 'Todas',
      );
    } catch (cause) {
      console.error('Error al cargar las ofertas:', cause);
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [location, radiusKm]);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void getCurrentBusinessRequest()
        .then((request) => {
          if (active) {
            setBusinessApprovalNotice(request?.status === 'aprobada');
            setBusinessRequestError('');
          }
        })
        .catch((cause) => {
          if (active) {
            console.error('Error al consultar el estado de afiliación:', cause);
            setBusinessRequestError(cause instanceof Error ? cause.message : 'No se pudo consultar el estado de afiliación.');
          }
        });
      return () => { active = false; };
    }, []),
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;
      const refresh = async () => {
        if (!location) {
          if (active) {
            setProducts([]);
            setError(false);
            setLoading(false);
          }
          return;
        }
        try {
          const result = await getNearbyProducts(
            location.coords.latitude,
            location.coords.longitude,
            radiusKm,
          );
          if (active) {
            setProducts(result);
            setError(false);
            setSelectedCategory((current) =>
              current === 'Todas' || productCategories.some((category) => category === current) ||
                result.some((product) => product.category === current && product.quantity > 0)
                ? current
                : 'Todas',
            );
          }
        } catch (cause) {
          if (active) {
            console.error('Error al cargar las ofertas:', cause);
            setError(true);
          }
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
    }, [location, radiusKm]),
  );

  const refreshLocation = useCallback(async (showIntroIfUndetermined: boolean, showLoader: boolean) => {
    if (showLoader) setCheckingLocation(true);
    try {
      const permission = await Location.getForegroundPermissionsAsync();
      setLocationPermission(permission);
      if (!permission.granted) {
        setLocation(null);
        setLocationIntro(
          showIntroIfUndetermined
          && permission.status === 'undetermined'
          && !deferredIntro.current,
        );
        setLocationError('');
        return;
      }

      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(currentLocation);
      setLocationIntro(false);
      setLocationError('');
    } catch (cause) {
      console.error('Error al obtener la ubicación del cliente:', cause);
      setLocation(null);
      setLocationIntro(false);
      setLocationError('No se pudo obtener tu ubicación. Comprueba los permisos y vuelve a intentarlo.');
    } finally {
      if (showLoader) setCheckingLocation(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshLocation(true, true);
    }, [refreshLocation]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshLocation(false, false);
    });
    return () => subscription.remove();
  }, [refreshLocation]);

  async function requestLocation() {
    setLocationActionLoading(true);
    setLocationError('');
    try {
      const permission = await Location.requestForegroundPermissionsAsync();
      setLocationPermission(permission);
      if (!permission.granted) {
        setLocation(null);
        setLocationIntro(false);
        return;
      }
      const currentLocation = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setLocation(currentLocation);
      setLocationIntro(false);
    } catch (cause) {
      console.error('Error al solicitar la ubicación del cliente:', cause);
      setLocation(null);
      setLocationIntro(false);
      setLocationError('No se pudo obtener tu ubicación. Comprueba los permisos y vuelve a intentarlo.');
    } finally {
      setLocationActionLoading(false);
    }
  }

  async function activateLocation() {
    if (locationPermission && !locationPermission.granted && !locationPermission.canAskAgain) {
      setLocationActionLoading(true);
      try {
        await Linking.openSettings();
      } catch (cause) {
        console.error('No se pudieron abrir los ajustes de ubicación:', cause);
        setLocationError('No se pudieron abrir los ajustes de ubicación.');
      } finally {
        setLocationActionLoading(false);
      }
      return;
    }
    if (locationPermission?.granted) {
      await requestLocation();
      return;
    }
    await requestLocation();
  }

  const openProfile = () => {
    router.push({ pathname: '/profile', params: { role: 'client', ...(phone ? { phone } : {}) } });
  };

  function renderProductCarousel(items: Product[]) {
    return (
      <ScrollView
        horizontal
        decelerationRate="fast"
        contentContainerStyle={styles.carouselList}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
      >
        {items.map((product) => (
          <View key={product.id} style={styles.carouselCard}>
            <ProductCard
              onPress={() => router.push({
                pathname: '/product',
                params: {
                  id: product.id,
                  role: 'client',
                  ...(product.distanceKm !== null ? { distanceKm: String(product.distanceKm) } : {}),
                  ...(phone ? { phone } : {}),
                },
              })}
              product={product}
            />
          </View>
        ))}
      </ScrollView>
    );
  }

  if (locationIntro) {
    return (
      <Screen activeNavRoute="/explore" showBottomNav showBrand={false} showDecorations={false}>
        <Eyebrow>Tu ubicación</Eyebrow>
        <PageHeading
          title="Activa tu ubicación"
          description="La usamos para mostrarte únicamente los packs disponibles en comercios cercanos."
        />
        {businessRequestError ? <FormError message={businessRequestError} /> : null}
        {businessApprovalNotice ? <BusinessApprovalBanner /> : null}
        <Panel>
          <PrimaryButton
            accessibilityLabel="Permitir ubicación al usar la aplicación"
            disabled={locationActionLoading}
            label={locationActionLoading ? 'Solicitando permiso…' : 'Permitir al usar la app'}
            onPress={() => { void requestLocation(); }}
          />
          <SecondaryButton
            accessibilityLabel="Continuar sin activar la ubicación"
            disabled={locationActionLoading}
            label="Ahora no"
            onPress={() => {
              deferredIntro.current = true;
              setLocationIntro(false);
            }}
          />
        </Panel>
      </Screen>
    );
  }

  return (
    <Screen contentStyle={styles.screenContent} showBottomNav showBrand={false} showDecorations={false}>
      <Eyebrow>Cerca de ti</Eyebrow>
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.title}>¿Qué rescatamos hoy?</Text>
          <Text style={styles.subtitle}>Packs compartidos por comercios cercanos, listos para rescatar.</Text>
        </View>
        <Pressable
          accessibilityLabel="Abrir ajustes de tu cuenta"
          accessibilityRole="button"
          onPress={openProfile}
          style={({ pressed }) => [styles.settingsButton, pressed && styles.pressed]}
        >
          <SymbolView name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }} tintColor={palette.purple} size={20} />
        </Pressable>
      </View>

      {checkingLocation && !location ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.purple} />
          <Text style={styles.message}>Comprobando ubicación…</Text>
        </View>
      ) : !location ? (
        <>
          {businessRequestError ? <FormError message={businessRequestError} /> : null}
          {businessApprovalNotice ? <BusinessApprovalBanner /> : null}
          <View style={styles.messageCard}>
            <View style={styles.messageIcon}>
              <SymbolView name={{ ios: 'mappin', android: 'location_on', web: 'location_on' }} tintColor={palette.green} size={21} />
            </View>
            <Text style={styles.messageTitle}>Ubicación desactivada</Text>
            <Text style={styles.message}>
              Activa el acceso a tu ubicación para consultar packs cercanos.
              {locationError ? ` ${locationError}` : ''}
            </Text>
            <PrimaryButton
              accessibilityLabel="Activar ubicación"
              disabled={locationActionLoading}
              label={locationActionLoading ? 'Abriendo ajustes…' : 'Activar ubicación'}
              onPress={() => { void activateLocation(); }}
            />
          </View>
        </>
      ) : (
        <>
      <View style={styles.searchBox}>
        <SymbolView name={{ ios: 'magnifyingglass', android: 'search', web: 'search' }} tintColor={palette.muted} size={19} />
        <TextInput
          accessibilityLabel="Buscar comida o comercios"
          onChangeText={setSearch}
          placeholder="Busca comida o comercios"
          placeholderTextColor="#A39BA7"
          returnKeyType="search"
          style={styles.searchInput}
          value={search}
        />
        {search ? (
          <Pressable accessibilityLabel="Borrar búsqueda" accessibilityRole="button" onPress={() => setSearch('')}>
            <SymbolView name={{ ios: 'xmark.circle.fill', android: 'cancel', web: 'cancel' }} tintColor={palette.muted} size={18} />
          </Pressable>
        ) : null}
      </View>

      <ScrollView
        horizontal
        contentContainerStyle={styles.categoryList}
        style={styles.categoryScroller}
        showsHorizontalScrollIndicator={false}
      >
        {categories.map((category) => {
          const selected = selectedCategory === category;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={category}
              onPress={() => setSelectedCategory(category)}
              style={[styles.categoryChip, selected && styles.categoryChipSelected]}
            >
              <Text
                numberOfLines={1}
                style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}
              >
                {category}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Text style={styles.sectionSubtitle}>Radio máximo</Text>
      <ScrollView
        horizontal
        contentContainerStyle={styles.categoryList}
        style={styles.categoryScroller}
        showsHorizontalScrollIndicator={false}
      >
        {radiusOptions.map((radius) => {
          const selected = radiusKm === radius;
          return (
            <Pressable
              accessibilityLabel={`Buscar ofertas en un radio de ${radius} kilómetros`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={radius}
              onPress={() => setRadiusKm(radius)}
              style={[styles.categoryChip, selected && styles.categoryChipSelected]}
            >
              <Text style={[styles.categoryChipText, selected && styles.categoryChipTextSelected]}>
                {radius} km
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {businessRequestError ? <FormError message={businessRequestError} /> : null}
      {businessApprovalNotice ? <BusinessApprovalBanner /> : null}

      <View style={styles.availabilityCard}>
        <View style={styles.leafIcon}>
          <SymbolView name={{ ios: 'leaf.fill', android: 'eco', web: 'eco' }} tintColor="#63834F" size={21} />
        </View>
        <View style={styles.availabilityCopy}>
          <Text style={styles.availabilityTitle}>
            {loading && products.length === 0
              ? 'Buscando packs…'
              : error && products.length === 0
                ? 'Disponibilidad no disponible'
                : `${availablePacks} ${availablePacks === 1 ? 'pack disponible' : 'packs disponibles'}`}
          </Text>
          <Text style={styles.availabilityDescription}>
            {loading && products.length === 0
              ? 'Estamos consultando los packs de comercios cercanos.'
              : error && products.length === 0
                ? 'Revisa tu conexión para consultar los packs cercanos.'
                : 'Aprovecha alimentos y apoya a los comercios de tu zona.'}
          </Text>
        </View>
      </View>

      <View style={styles.offersHeading}>
        <View style={styles.offersCopy}>
          <Text style={styles.sectionTitle}>Ofertas disponibles</Text>
          <Text style={styles.sectionSubtitle}>
            {loading && products.length === 0
              ? 'Buscando ofertas…'
              : error && products.length === 0
                ? 'No se pudo consultar la disponibilidad'
                : `${availableOfferCount} ${availableOfferCount === 1 ? 'opción para rescatar' : 'opciones para rescatar'}`}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Actualizar ofertas"
          accessibilityRole="button"
          disabled={refreshing}
          onPress={() => { void loadProducts(true); }}
          style={styles.refreshButton}
        >
          {refreshing
            ? <ActivityIndicator color={palette.purple} size="small" />
            : <SymbolView name={{ ios: 'arrow.clockwise', android: 'refresh', web: 'refresh' }} tintColor={palette.purple} size={17} />}
          <Text style={styles.refreshText}>{refreshing ? 'Actualizando' : 'Actualizar'}</Text>
        </Pressable>
      </View>

      {error ? (
        <View style={styles.messageCard}>
          <View style={styles.messageIcon}>
            <SymbolView name={{ ios: 'wifi.slash', android: 'wifi_off', web: 'wifi_off' }} tintColor="#A75252" size={21} />
          </View>
          <Text style={styles.messageTitle}>No pudimos cargar las ofertas</Text>
          <Text style={styles.message}>Revisa tu conexión e inténtalo de nuevo. Volveremos a buscar packs en cuanto sea posible.</Text>
          <PrimaryButton label="Intentar de nuevo" onPress={() => { void loadProducts(true); }} />
        </View>
      ) : loading && products.length === 0 ? (
        <View style={styles.loading}>
          <ActivityIndicator color={palette.purple} />
          <Text style={styles.message}>Buscando packs cercanos…</Text>
        </View>
      ) : availableOfferCount > 0 ? (
        <View>
          {renderProductCarousel(filteredProducts)}
          {lastUnitProducts.length > 0 ? (
            <View style={styles.carouselSection}>
              <Text style={styles.sectionTitle}>Últimas unidades</Text>
              <Text style={styles.sectionSubtitle}>Packs con pocas unidades disponibles</Text>
              {renderProductCarousel(lastUnitProducts)}
            </View>
          ) : null}
          {nearestProducts.length > 0 ? (
            <View style={styles.carouselSection}>
              <Text style={styles.sectionTitle}>Cerca de ti</Text>
              <Text style={styles.sectionSubtitle}>Ofertas ordenadas por distancia</Text>
              {renderProductCarousel(nearestProducts)}
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <View style={styles.messageIcon}>
            <SymbolView name={{ ios: 'leaf', android: 'eco', web: 'eco' }} tintColor={palette.green} size={23} />
          </View>
          <Text style={styles.messageTitle}>
            {availableProducts.length === 0 ? 'No hay packs cerca todavía' : 'No encontramos coincidencias'}
          </Text>
          <Text style={styles.message}>
            {availableProducts.length === 0
              ? 'Amplía el radio para encontrar comercios cercanos. Vuelve a consultar más tarde.'
              : 'Prueba con otra búsqueda o elige una categoría diferente.'}
          </Text>
          {availableProducts.length > 0 && (search || selectedCategory !== 'Todas') ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => { setSearch(''); setSelectedCategory('Todas'); }}
              style={styles.clearFilters}
            >
              <Text style={styles.clearFiltersText}>Limpiar búsqueda y filtros</Text>
            </Pressable>
          ) : null}
        </View>
      )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  screenContent: { flexGrow: 1, paddingBottom: 20, paddingHorizontal: 18, paddingTop: 16 },
  headingRow: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, marginBottom: 16 },
  headingCopy: { flex: 1 },
  title: { color: palette.purpleDark, fontSize: 29, fontWeight: '800', lineHeight: 36 },
  subtitle: { color: palette.muted, fontSize: 13, lineHeight: 19, marginTop: 6 },
  settingsButton: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 23,
    borderWidth: 1,
    elevation: 2,
    height: 46,
    justifyContent: 'center',
    shadowColor: '#493354',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    width: 46,
  },
  pressed: { opacity: 0.8 },
  searchBox: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 15,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    minHeight: 52,
    paddingHorizontal: 14,
    shadowColor: '#493354',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
  },
  searchInput: { color: palette.text, flex: 1, fontSize: 14, minHeight: 50, paddingVertical: 0 },
  categoryScroller: {
    alignSelf: 'stretch',
    flexGrow: 0,
    flexShrink: 0,
    height: 54,
    width: '100%',
  },
  categoryList: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'nowrap',
    gap: 8,
    paddingRight: 18,
  },
  categoryChip: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 18,
    borderWidth: 1,
    flexGrow: 0,
    flexShrink: 0,
    height: 35,
    justifyContent: 'center',
    paddingHorizontal: 15,
  },
  categoryChipSelected: { backgroundColor: palette.purple, borderColor: palette.purple },
  categoryChipText: { color: palette.text, flexShrink: 0, fontSize: 12, fontWeight: '600' },
  categoryChipTextSelected: { color: palette.white, fontWeight: '700' },
  availabilityCard: {
    alignItems: 'center',
    backgroundColor: '#F0F6E8',
    borderColor: '#E1EBD4',
    borderRadius: 17,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    marginBottom: 20,
    padding: 13,
  },
  leafIcon: { alignItems: 'center', backgroundColor: '#E3EFD5', borderRadius: 13, height: 42, justifyContent: 'center', width: 42 },
  availabilityCopy: { flex: 1, gap: 3 },
  availabilityTitle: { color: '#49683B', fontSize: 14, fontWeight: '800' },
  availabilityDescription: { color: '#73816A', fontSize: 11, lineHeight: 16 },
  offersHeading: { alignItems: 'flex-start', flexDirection: 'row', gap: 8, justifyContent: 'space-between', marginBottom: 13 },
  offersCopy: { flex: 1 },
  sectionTitle: { color: palette.purpleDark, fontSize: 19, fontWeight: '800' },
  sectionSubtitle: { color: palette.muted, fontSize: 12, marginTop: 3 },
  refreshButton: { alignItems: 'center', flexDirection: 'row', flexShrink: 0, gap: 5, minHeight: 34, paddingHorizontal: 3 },
  refreshText: { color: palette.purple, fontSize: 11, fontWeight: '700' },
  carouselSection: { marginTop: 16 },
  carouselList: { gap: 13, paddingBottom: 18, paddingRight: 18, paddingTop: 12 },
  carouselCard: { width: '88%' },
  card: {
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 19,
    borderWidth: 1,
    elevation: 2,
    overflow: 'hidden',
    shadowColor: '#493354',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
  },
  cardPressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  productImage: { backgroundColor: '#F4EFF9', height: 156, width: '100%' },
  imagePlaceholder: { alignItems: 'center', backgroundColor: '#F0F6E8', height: 128, justifyContent: 'center' },
  imagePlaceholderLabel: { color: '#54825D', fontSize: 11, fontWeight: '700', marginTop: 5 },
  cardBody: { padding: 14 },
  cardTopline: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  category: { color: palette.purple, flex: 1, fontSize: 10, fontWeight: '800', textTransform: 'uppercase' },
  quantity: { color: '#54825D', fontSize: 10, fontWeight: '700' },
  soldOutText: { color: '#A75252' },
  productName: { color: palette.text, fontSize: 17, fontWeight: '800', marginTop: 6 },
  description: { color: palette.muted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  cardFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  sellerRow: { alignItems: 'center', flex: 1, flexDirection: 'row', gap: 4, marginRight: 12 },
  seller: { color: palette.muted, flex: 1, fontSize: 11, fontWeight: '600' },
  price: { color: palette.purpleDark, fontSize: 18, fontWeight: '900' },
  pickup: { color: palette.muted, fontSize: 10, marginTop: 6 },
  loading: { alignItems: 'center', gap: 11, paddingVertical: 38 },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: palette.border,
    borderRadius: 19,
    borderWidth: 1,
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 205,
    marginTop: 2,
    paddingHorizontal: 22,
    paddingVertical: 20,
  },
  messageCard: {
    alignItems: 'center',
    backgroundColor: palette.white,
    borderColor: '#F1CECE',
    borderRadius: 18,
    borderWidth: 1,
    marginVertical: 4,
    padding: 18,
  },
  messageIcon: { alignItems: 'center', backgroundColor: '#F3EAF7', borderRadius: 14, height: 46, justifyContent: 'center', marginBottom: 11, width: 46 },
  messageTitle: { color: palette.text, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  message: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 7, textAlign: 'center' },
  clearFilters: { marginTop: 14, padding: 8 },
  clearFiltersText: { color: palette.purple, fontSize: 12, fontWeight: '800' },
});
