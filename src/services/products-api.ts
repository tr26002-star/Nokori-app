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

function getApiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!value) {
    throw new Error('Configura EXPO_PUBLIC_API_URL en el archivo .env.');
  }
  return value.replace(/\/+$/, '');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...init,
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    });
  } catch {
    throw new Error('No se pudo contactar la API. Confirma que el servidor esté encendido y que ambos dispositivos usen la misma red Wi‑Fi.');
  }

  const body = await response.text();
  let payload: unknown;
  if (body) {
    try {
      payload = JSON.parse(body) as unknown;
    } catch {
      payload = body;
    }
  }

  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'message' in payload
      ? String(payload.message)
      : `La API respondió con el código ${response.status}.`;
    throw new Error(message);
  }
  return payload as T;
}

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
