function getApiBaseUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (!value) {
    throw new Error('Configura EXPO_PUBLIC_API_URL en el archivo .env.');
  }
  return value.replace(/\/+$/, '');
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
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
