export type SupportComment = {
  type: 'Falla' | 'Mejora';
  name: string;
  role: 'seller' | 'client';
  email?: string;
  phone?: string;
  comment: string;
};

export async function sendSupportComment(comment: SupportComment): Promise<void> {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, '');
  if (!backendUrl) {
    throw new Error('Configura EXPO_PUBLIC_BACKEND_URL para conectar con el servidor de soporte.');
  }

  let response: Response;
  try {
    response = await fetch(`${backendUrl}/api/support`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comment),
    });
  } catch {
    throw new Error('No se pudo conectar con soporte. Verifica tu conexión a internet e inténtalo de nuevo.');
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('El servidor devolvió una respuesta no válida. Inténtalo de nuevo más tarde.');
  }

  if (typeof payload !== 'object'
    || payload === null
    || Array.isArray(payload)
    || !('message' in payload)
    || typeof payload.message !== 'string') {
    throw new Error('El servidor devolvió una respuesta no válida. Inténtalo de nuevo más tarde.');
  }
  if (!response.ok) throw new Error(payload.message);
}
