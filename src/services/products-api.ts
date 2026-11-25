import AsyncStorage from '@react-native-async-storage/async-storage';
import { getBusinessPhotoSignedUrl, getCurrentApprovedBusiness } from './account-api';
import { getSupabaseClient, hasSupabaseConfig } from './supabase';
import type { ClientProductRow, NearbyProductRow, ProductRow } from './supabase.types';

export const MIN_RESCUE_PRICE = 3.50;

export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  normalPrice: number | null;
  quantity: number;
  pickupStart: string;
  pickupEnd: string;
  sellerName: string;
  imageUrl: string | null;
  businessAddress: string | null;
  businessLatitude: number | null;
  businessLongitude: number | null;
  businessAvatarUrl: string | null;
  distanceKm: number | null;
  isPublished: boolean;
  createdAt: string;
};

export type NewProduct = Omit<
  Product,
  | 'id'
  | 'createdAt'
  | 'imageUrl'
  | 'normalPrice'
  | 'sellerName'
  | 'businessAddress'
  | 'businessLatitude'
  | 'businessLongitude'
  | 'businessAvatarUrl'
  | 'distanceKm'
  | 'isPublished'
> & {
  normalPrice: number;
  photo?: { base64: string; mimeType: string } | null;
};

export type EditableProduct = Pick<
  Product,
  'name' | 'description' | 'category' | 'price' | 'quantity' | 'pickupStart' | 'pickupEnd'
> & { normalPrice: number };

export type ReservationQuote = {
  unitPrice: number;
  totalPaid: number;
};

export type ClientPriceQuote = {
  clientPrice: number;
  discountPercent: number;
  savedAmount: number;
};

const LOCAL_PRODUCTS_KEY = '@nokori_seller_products';

async function getLocalProducts(): Promise<Product[]> {
  try {
    const raw = await AsyncStorage.getItem(LOCAL_PRODUCTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    console.error('Error leyendo productos locales:', error);
    return [];
  }
}

function toProduct(row: Omit<ProductRow, 'normal_price'> & { normal_price?: number | null }): Product {
  const price = Number(row.price);
  const quantity = Number(row.quantity);
  const normalPrice = row.normal_price === null || row.normal_price === undefined
    ? null
    : Number(row.normal_price);
  if (
    !Number.isFinite(price)
    || !Number.isFinite(quantity)
    || (normalPrice !== null && !Number.isFinite(normalPrice))
  ) {
    throw new Error('Supabase devolvió un producto con precio o cantidad no válidos.');
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price,
    normalPrice,
    quantity,
    pickupStart: row.pickup_start,
    pickupEnd: row.pickup_end,
    sellerName: row.seller_name,
    imageUrl: row.image_url,
    businessAddress: null,
    businessLatitude: null,
    businessLongitude: null,
    businessAvatarUrl: null,
    distanceKm: null,
    isPublished: row.is_published,
    createdAt: row.created_at,
  };
}

export async function getNearbyProducts(
  latitude: number,
  longitude: number,
  radiusKm: 2 | 3 | 5,
): Promise<Product[]> {
  if (!hasSupabaseConfig()) {
    throw new Error('Configura Supabase para consultar ofertas cercanas.');
  }
  const { data, error } = await getSupabaseClient().rpc('get_nearby_products', {
    p_lat: latitude,
    p_lng: longitude,
    p_radius_km: radiusKm,
  });
  if (error) throw error;

  return data.map((row: NearbyProductRow) => {
    const distanceKm = Number(row.distance_km);
    if (!Number.isFinite(distanceKm)) {
      throw new Error('Supabase devolvió una distancia no válida para una oferta.');
    }
    return {
      ...toProduct(row),
      sellerName: row.business_name,
      businessAddress: row.business_address,
      businessLatitude: Number(row.business_latitude),
      businessLongitude: Number(row.business_longitude),
      distanceKm,
    };
  });
}

export async function getProducts(): Promise<Product[]> {
  if (!hasSupabaseConfig()) {
    const local = await getLocalProducts();
    return local.filter((p) => p.isPublished);
  }
  const { data, error } = await getSupabaseClient()
    .from('products')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(toProduct);
}

export async function getProduct(id: string): Promise<Product | null> {
  if (!hasSupabaseConfig()) {
    const local = await getLocalProducts();
    return local.find((product) => product.id === id && product.isPublished) ?? null;
  }
  const { data, error } = await getSupabaseClient().rpc('get_client_product', {
    p_product_id: id,
  });
  if (error) throw error;
  const row: ClientProductRow | undefined = data?.[0];
  if (!row) return null;

  return {
    ...toProduct(row),
    sellerName: row.business_name,
    businessAddress: row.business_address,
    businessLatitude: row.business_latitude,
    businessLongitude: row.business_longitude,
    businessAvatarUrl: await getBusinessPhotoSignedUrl(row.business_avatar_url, row.business_photo_url),
  };
}

export async function getClientPriceQuote(
  rescuePrice: number,
  normalPrice: number | null,
): Promise<ClientPriceQuote> {
  if (!hasSupabaseConfig()) throw new Error('Configura Supabase para consultar el precio final.');
  const { data, error } = await getSupabaseClient().rpc('quote_client_price', {
    p_rescue_price: rescuePrice,
    p_normal_price: normalPrice,
  });
  if (error) throw error;
  const row = data?.[0];
  const clientPrice = Number(row?.client_price);
  const discountPercent = Number(row?.discount_percent);
  const savedAmount = Number(row?.saved_amount);
  if (
    !Number.isFinite(clientPrice)
    || !Number.isFinite(discountPercent)
    || !Number.isFinite(savedAmount)
    || clientPrice <= 0
    || discountPercent < 0
    || savedAmount < 0
  ) {
    throw new Error('El servidor devolvió un precio final no válido.');
  }
  return { clientPrice, discountPercent, savedAmount };
}

export async function getReservationQuote(productId: string, packs: number): Promise<ReservationQuote> {
  if (!hasSupabaseConfig()) throw new Error('Configura Supabase para consultar el total de la reserva.');
  const { data, error } = await getSupabaseClient().rpc('get_reservation_quote', {
    p_product_id: productId,
    p_packs: packs,
  });
  if (error) throw error;
  const row = data?.[0];
  const unitPrice = Number(row?.unit_price);
  const totalPaid = Number(row?.total_paid);
  if (!Number.isFinite(unitPrice) || !Number.isFinite(totalPaid) || unitPrice <= 0 || totalPaid <= 0) {
    throw new Error('El servidor devolvió un total de reserva no válido.');
  }
  return { unitPrice, totalPaid };
}

async function getCurrentSellerId(): Promise<string> {
  const business = await getCurrentApprovedBusiness();
  if (!business) throw new Error('Solo un negocio aprobado puede gestionar productos.');
  return business.ownerId;
}

export async function getSellerProducts(): Promise<Product[]> {
  if (!hasSupabaseConfig()) throw new Error('Configura Supabase para gestionar productos de un negocio aprobado.');
  const sellerId = await getCurrentSellerId();
  const { data, error } = await getSupabaseClient()
    .from('products')
    .select('*')
    .eq('seller_id', sellerId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data.map(toProduct);
}

export async function createProduct(product: NewProduct): Promise<Product> {
  if (!hasSupabaseConfig()) throw new Error('Configura Supabase para publicar productos de un negocio aprobado.');
  const business = await getCurrentApprovedBusiness();
  if (!business) throw new Error('Solo un negocio aprobado puede publicar productos.');
  const imageUrl = product.photo
    ? `data:${product.photo.mimeType};base64,${product.photo.base64}`
    : null;

  const supabase = getSupabaseClient();
  const { photo: _photo, ...fields } = product;
  const { data, error } = await supabase
    .from('products')
    .insert({
      name: fields.name,
      description: fields.description,
      category: fields.category,
      price: fields.price,
      normal_price: fields.normalPrice,
      quantity: fields.quantity,
      pickup_start: fields.pickupStart,
      pickup_end: fields.pickupEnd,
      seller_id: business.ownerId,
      business_id: business.id,
      seller_name: business.name,
      image_url: imageUrl,
      is_published: true,
      created_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return toProduct(data);
}

export async function updateSellerProduct(id: string, product: EditableProduct): Promise<Product> {
  if (!hasSupabaseConfig()) throw new Error('Configura Supabase para modificar productos de un negocio aprobado.');

  const sellerId = await getCurrentSellerId();
  const { data, error } = await getSupabaseClient()
    .from('products')
    .update({
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      normal_price: product.normalPrice,
      quantity: product.quantity,
      pickup_start: product.pickupStart,
      pickup_end: product.pickupEnd,
    })
    .eq('id', id)
    .eq('seller_id', sellerId)
    .select('*')
    .single();
  if (error) throw error;
  return toProduct(data);
}

export async function unpublishSellerProduct(id: string): Promise<void> {
  if (!hasSupabaseConfig()) throw new Error('Configura Supabase para despublicar productos de un negocio aprobado.');

  const sellerId = await getCurrentSellerId();
  const { data, error } = await getSupabaseClient()
    .from('products')
    .update({ is_published: false })
    .eq('id', id)
    .eq('seller_id', sellerId)
    .select('id')
    .single();
  if (error) throw error;
  if (!data) throw new Error('No se encontró el producto o no tienes permiso para despublicarlo.');
}
