import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSupabaseClient, hasSupabaseConfig } from './supabase';
import type { ProductRow } from './supabase.types';

export type Product = {
  id: string;
  name: string;
  description: string;
  category: string;
  price: number;
  quantity: number;
  pickupStart: string;
  pickupEnd: string;
  sellerName: string;
  imageUrl: string | null;
  isPublished: boolean;
  createdAt: string;
};

export type NewProduct = Omit<Product, 'id' | 'createdAt' | 'imageUrl' | 'sellerName' | 'isPublished'> & {
  sellerName?: string;
  photo?: { base64: string; mimeType: string } | null;
};

export type EditableProduct = Pick<
  Product,
  'name' | 'description' | 'category' | 'price' | 'quantity' | 'pickupStart' | 'pickupEnd'
>;

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

async function saveLocalProducts(products: Product[]): Promise<void> {
  await AsyncStorage.setItem(LOCAL_PRODUCTS_KEY, JSON.stringify(products));
}

function toProduct(row: ProductRow): Product {
  const price = Number(row.price);
  const quantity = Number(row.quantity);
  if (!Number.isFinite(price) || !Number.isFinite(quantity)) {
    throw new Error('Supabase devolvió un producto con precio o cantidad no válidos.');
  }
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category,
    price,
    quantity,
    pickupStart: row.pickup_start,
    pickupEnd: row.pickup_end,
    sellerName: row.seller_name,
    imageUrl: row.image_url,
    isPublished: row.is_published,
    createdAt: row.created_at,
  };
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

async function getCurrentSellerId(): Promise<string> {
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  if (!data.user) {
    throw new Error('Inicia sesión con tu cuenta de vendedor para gestionar tus productos.');
  }
  return data.user.id;
}

export async function getSellerProducts(): Promise<Product[]> {
  if (!hasSupabaseConfig()) {
    return getLocalProducts();
  }
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
  const imageUrl = product.photo
    ? `data:${product.photo.mimeType};base64,${product.photo.base64}`
    : null;

  if (!hasSupabaseConfig()) {
    const local = await getLocalProducts();
    const newProduct: Product = {
      id: `prod-${Date.now()}`,
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
      quantity: product.quantity,
      pickupStart: product.pickupStart,
      pickupEnd: product.pickupEnd,
      sellerName: product.sellerName || 'Lemus',
      imageUrl,
      isPublished: true,
      createdAt: new Date().toISOString(),
    };
    await saveLocalProducts([newProduct, ...local]);
    return newProduct;
  }

  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) {
    throw new Error('Inicia sesión con una cuenta de vendedor para publicar productos.');
  }
  const businessName = user.user_metadata.business_name;
  if (typeof businessName !== 'string' || !businessName.trim()) {
    throw new Error('La cuenta no tiene un nombre de negocio válido. Vuelve a registrarte o contacta con soporte.');
  }
  const { photo: _photo, ...fields } = product;
  const { data, error } = await supabase
    .from('products')
    .insert({
      name: fields.name,
      description: fields.description,
      category: fields.category,
      price: fields.price,
      quantity: fields.quantity,
      pickup_start: fields.pickupStart,
      pickup_end: fields.pickupEnd,
      seller_id: user.id,
      seller_name: businessName.trim(),
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
  if (!hasSupabaseConfig()) {
    const local = await getLocalProducts();
    let updated: Product | null = null;
    const next = local.map((p) => {
      if (p.id === id) {
        updated = { ...p, ...product };
        return updated;
      }
      return p;
    });
    if (!updated) throw new Error('No se encontró el producto a actualizar.');
    await saveLocalProducts(next);
    return updated;
  }

  const sellerId = await getCurrentSellerId();
  const { data, error } = await getSupabaseClient()
    .from('products')
    .update({
      name: product.name,
      description: product.description,
      category: product.category,
      price: product.price,
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
  if (!hasSupabaseConfig()) {
    const local = await getLocalProducts();
    const next = local.map((p) => (p.id === id ? { ...p, isPublished: false } : p));
    await saveLocalProducts(next);
    return;
  }

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
