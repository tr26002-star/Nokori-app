import { decodeBase64Image, validateProfilePhoto, type ProfilePhoto } from './account-api';
import { normalizePhoneToE164 } from './phone';
import { getSupabaseClient, hasSupabaseConfig } from './supabase';

export type NewBusinessRequest = {
  managerName: string;
  businessName: string;
  businessEmail: string;
  businessPhone: string;
  address: string;
  latitude: number;
  longitude: number;
  description: string;
  photo: ProfilePhoto;
};

export type BusinessRequestSubmissionResult = {
  notificationSent: boolean;
  notificationMessage: string;
};

function validateSubmission(request: NewBusinessRequest) {
  const managerName = request.managerName.trim();
  const businessName = request.businessName.trim();
  const businessEmail = request.businessEmail.trim().toLowerCase();
  const address = request.address.trim();
  const description = request.description.trim();
  if (managerName.length < 2 || managerName.length > 120) {
    throw new Error('El nombre del encargado debe tener entre 2 y 120 caracteres.');
  }
  if (businessName.length < 2 || businessName.length > 120) {
    throw new Error('El nombre del negocio debe tener entre 2 y 120 caracteres.');
  }
  if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(businessEmail) || businessEmail.length > 254) {
    throw new Error('Escribe un correo electrónico válido para el negocio.');
  }
  const phone = normalizePhoneToE164(request.businessPhone);
  if (!phone.startsWith('+503') || phone.length !== 12) {
    throw new Error('El teléfono del negocio debe tener 8 dígitos de El Salvador.');
  }
  if (address.length < 5 || address.length > 300) {
    throw new Error('La dirección debe tener entre 5 y 300 caracteres.');
  }
  if (!Number.isFinite(request.latitude) || request.latitude < -90 || request.latitude > 90
    || !Number.isFinite(request.longitude) || request.longitude < -180 || request.longitude > 180) {
    throw new Error('Marca una ubicación válida para el negocio.');
  }
  if (description.length < 10 || description.length > 2000) {
    throw new Error('La descripción debe tener entre 10 y 2000 caracteres.');
  }
  validateProfilePhoto(request.photo);
  return {
    managerName,
    businessName,
    businessEmail,
    businessPhone: phone.slice(4),
    address,
    description,
  };
}

async function ensureEligibleUser(userId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const [requestResult, businessResult] = await Promise.all([
    supabase
      .from('business_requests')
      .select('id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', userId)
      .limit(1)
      .maybeSingle(),
  ]);
  if (requestResult.error) throw requestResult.error;
  if (businessResult.error) throw businessResult.error;
  if (requestResult.data || businessResult.data) {
    throw new Error('Esta cuenta ya tiene una solicitud o un negocio asociado.');
  }
}

async function notifySupport(
  requestId: string,
  accessToken: string,
): Promise<BusinessRequestSubmissionResult> {
  const backendUrl = process.env.EXPO_PUBLIC_BACKEND_URL?.trim().replace(/\/+$/, '');
  if (!backendUrl) {
    return {
      notificationSent: false,
      notificationMessage: 'La solicitud se registró, pero falta configurar el servicio de correo. Contacta a soporte para confirmar la recepción.',
    };
  }

  try {
    const response = await fetch(`${backendUrl}/api/business-requests`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ requestId }),
    });
    const body = await response.json().catch(() => null) as { message?: unknown } | null;
    if (!response.ok) {
      const message = typeof body?.message === 'string'
        ? body.message.slice(0, 300)
        : 'No se pudo notificar a soporte.';
      return {
        notificationSent: false,
        notificationMessage: `La solicitud se registró, pero no se pudo enviar el aviso a soporte: ${message}`,
      };
    }
    return {
      notificationSent: true,
      notificationMessage: 'La solicitud se registró y se notificó a soporte.',
    };
  } catch (cause) {
    const detail = cause instanceof Error ? ` ${cause.message}` : '';
    return {
      notificationSent: false,
      notificationMessage: `La solicitud se registró, pero no se pudo conectar con el servicio de correo.${detail}`,
    };
  }
}

export async function submitBusinessRequest(
  request: NewBusinessRequest,
): Promise<BusinessRequestSubmissionResult> {
  if (!hasSupabaseConfig()) {
    throw new Error('Configura Supabase para enviar una solicitud de afiliación.');
  }
  const fields = validateSubmission(request);
  const supabase = getSupabaseClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const user = userData.user;
  if (!user) throw new Error('Inicia sesión para solicitar la afiliación de un negocio.');
  await ensureEligibleUser(user.id);

  const extension = request.photo.mimeType === 'image/png'
    ? 'png'
    : request.photo.mimeType === 'image/webp'
      ? 'webp'
      : request.photo.mimeType === 'image/heic'
        ? 'heic'
        : request.photo.mimeType === 'image/heif'
          ? 'heif'
          : 'jpg';
  const photoPath = `${user.id}/request-${Date.now()}-${Math.floor(Math.random() * 1_000_000)}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from('business-photos')
    .upload(photoPath, decodeBase64Image(request.photo.base64), {
      contentType: request.photo.mimeType,
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: inserted, error: insertError } = await supabase
    .from('business_requests')
    .insert({
      user_id: user.id,
      manager_name: fields.managerName,
      business_name: fields.businessName,
      business_email: fields.businessEmail,
      business_phone: fields.businessPhone,
      address: fields.address,
      latitude: request.latitude,
      longitude: request.longitude,
      description: fields.description,
      photo_url: photoPath,
    })
    .select('id')
    .single();
  if (insertError) {
    const { error: cleanupError } = await supabase.storage
      .from('business-photos')
      .remove([photoPath]);
    if (cleanupError) {
      throw new Error(`${insertError.message} No se pudo retirar la foto que quedó sin asociar: ${cleanupError.message}`);
    }
    throw insertError;
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return {
      notificationSent: false,
      notificationMessage: `La solicitud se registró, pero no se pudo obtener la sesión para notificar a soporte: ${sessionError.message}`,
    };
  }
  const accessToken = sessionData.session?.access_token;
  if (!accessToken) {
    return {
      notificationSent: false,
      notificationMessage: 'La solicitud se registró, pero la sesión expiró antes de notificar a soporte.',
    };
  }
  return notifySupport(inserted.id, accessToken);
}
