import { request } from './api-client';

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
  createdAt: string;
};

export type NewProduct = Omit<Product, 'id' | 'createdAt' | 'imageUrl'> & {
  photo?: { base64: string; mimeType: string } | null;
};

function isProduct(value: unknown): value is Product {
  if (typeof value !== 'object' || value === null) return false;
  const item = value as Record<string, unknown>;
  return typeof item.id === 'string'
    && typeof item.name === 'string'
    && typeof item.description === 'string'
    && typeof item.category === 'string'
    && typeof item.price === 'number'
    && typeof item.quantity === 'number'
    && typeof item.pickupStart === 'string'
    && typeof item.pickupEnd === 'string'
    && typeof item.sellerName === 'string'
    && (typeof item.imageUrl === 'string' || item.imageUrl === null)
    && typeof item.createdAt === 'string';
}

export async function getProducts(): Promise<Product[]> {
  const payload = await request<{ products: unknown }>('/products');
  if (!Array.isArray(payload.products) || !payload.products.every(isProduct)) {
    throw new Error('La respuesta de /products no coincide con el formato esperado.');
  }
  return payload.products;
}

export async function createProduct(product: NewProduct): Promise<Product> {
  let imageUrl: string | null = null;
  if (product.photo) {
    const uploaded = await request<{ imageUrl: string }>('/uploads', {
      method: 'POST',
      body: JSON.stringify(product.photo),
    });
    imageUrl = uploaded.imageUrl;
  }

  const payload = await request<{ product: unknown }>('/products', {
    method: 'POST',
    body: JSON.stringify({ ...product, photo: undefined, imageUrl }),
  });
  if (!isProduct(payload.product)) {
    throw new Error('La API no devolvió el producto creado en el formato esperado.');
  }
  return payload.product;
}
