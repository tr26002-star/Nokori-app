import AsyncStorage from '@react-native-async-storage/async-storage';
import type { User } from '@supabase/supabase-js';
import { getSupabaseClient, hasSupabaseConfig } from './supabase';

const PENDING_AVATAR_KEY = '@nokory_pending_profile_photo';

export type ProfilePhoto = {
  base64: string;
  mimeType: string;
};

export type ApprovedBusiness = {
  id: string;
  ownerId: string;
  name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  avatarPath: string | null;
  photoPath: string | null;
  phone: string | null;
  email: string | null;
  description: string | null;
};

export type AccountProfile = {
  email: string;
  name: string;
  clientAvatarUrl: string | null;
  businessAvatarUrl: string | null;
  businessName: string | null;
  businessEmail: string | null;
  hasApprovedBusiness: boolean;
  hasBusinessRecord: boolean;
  businessRequest: BusinessRequestSummary | null;
};

export type BusinessRequestSummary = {
  id: string;
  status: 'pendiente' | 'aprobada' | 'rechazada';
  rejectionReason: string | null;
  createdAt: string;
  reviewedAt: string | null;
};

export function validateProfilePhoto(photo: ProfilePhoto): void {
  if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(photo.mimeType)) {
    throw new Error('El formato de la foto no es compatible.');
  }
  if (!photo.base64 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(photo.base64)) {
    throw new Error('El contenido de la foto de perfil no es válido.');
  }
  const padding = photo.base64.endsWith('==') ? 2 : photo.base64.endsWith('=') ? 1 : 0;
  const sizeInBytes = (photo.base64.length / 4) * 3 - padding;
  if (sizeInBytes > 5 * 1024 * 1024) {
    throw new Error('La foto de perfil no puede superar 5 MB.');
  }
}

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Configura Supabase para consultar tu cuenta.');
  }
  return getSupabaseClient();
}

async function getApprovedBusinessForUser(userId: string): Promise<ApprovedBusiness | null> {
  const { data, error } = await requireSupabase()
    .from('businesses')
    .select('id, owner_id, name, address, latitude, longitude, avatar_url, photo_url, phone, email, description')
    .eq('owner_id', userId)
    .eq('status', 'approved')
    .eq('is_approved', true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? {
    id: data.id,
    ownerId: data.owner_id,
    name: data.name,
    address: data.address,
    latitude: data.latitude,
    longitude: data.longitude,
    avatarPath: data.avatar_url,
    photoPath: data.photo_url,
    phone: data.phone,
    email: data.email,
    description: data.description,
  } : null;
}

export async function getCurrentApprovedBusiness(): Promise<ApprovedBusiness | null> {
  if (!hasSupabaseConfig()) return null;
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  return data.user ? getApprovedBusinessForUser(data.user.id) : null;
}

async function getBusinessRequestForUser(userId: string): Promise<BusinessRequestSummary | null> {
  const { data, error } = await requireSupabase()
    .from('business_requests')
    .select('id, status, rejection_reason, created_at, reviewed_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data ? {
    id: data.id,
    status: data.status,
    rejectionReason: data.rejection_reason,
    createdAt: data.created_at,
    reviewedAt: data.reviewed_at,
  } : null;
}

export async function getCurrentBusinessRequest(): Promise<BusinessRequestSummary | null> {
  if (!hasSupabaseConfig()) return null;
  const { data, error } = await getSupabaseClient().auth.getUser();
  if (error) throw error;
  return data.user ? getBusinessRequestForUser(data.user.id) : null;
}

export async function getCurrentAccountProfile(): Promise<AccountProfile | null> {
  if (!hasSupabaseConfig()) return null;
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  const user = data.user;
  if (!user?.email) return null;

  const [businessesResult, profileResult, businessRequest] = await Promise.all([
    supabase
      .from('businesses')
      .select('id, owner_id, name, address, latitude, longitude, avatar_url, photo_url, phone, email, description, status, is_approved')
      .eq('owner_id', user.id)
      .order('created_at', { ascending: true }),
    supabase
      .from('profiles')
      .select('full_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle(),
    getBusinessRequestForUser(user.id),
  ]);
  if (businessesResult.error) throw businessesResult.error;
  if (profileResult.error) throw profileResult.error;
  const profile = profileResult.data;
  if (!profile) throw new Error('No encontramos el perfil de esta cuenta.');

  const ownedBusinesses = businessesResult.data || [];
  const business = ownedBusinesses.find((item) => item.status === 'approved' && item.is_approved) || null;
  return {
    email: user.email,
    name: profile.full_name,
    clientAvatarUrl: await getAvatarSignedUrl(profile.avatar_url),
    businessAvatarUrl: business
      ? await getBusinessPhotoSignedUrl(business.avatar_url, business.photo_url)
      : null,
    businessName: business?.name || null,
    businessEmail: business?.email || null,
    hasApprovedBusiness: Boolean(business),
    hasBusinessRecord: ownedBusinesses.length > 0,
    businessRequest,
  };
}

export async function getAvatarSignedUrl(path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await requireSupabase().storage.from('avatars').createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

export async function getBusinessPhotoSignedUrl(
  avatarPath: string | null,
  photoPath: string | null,
): Promise<string | null> {
  if (avatarPath) return getAvatarSignedUrl(avatarPath);
  if (!photoPath) return null;
  const { data, error } = await requireSupabase()
    .storage
    .from('business-photos')
    .createSignedUrl(photoPath, 3600);
  if (error) throw error;
  return data.signedUrl;
}

async function getCurrentUser(): Promise<User> {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error('Inicia sesión para guardar tu foto de perfil.');
  return data.user;
}

async function uploadAccountPhoto(photo: ProfilePhoto, target: 'profile' | 'business'): Promise<void> {
  validateProfilePhoto(photo);
  const supabase = requireSupabase();
  const user = await getCurrentUser();
  if (target === 'business' && !await getApprovedBusinessForUser(user.id)) {
    throw new Error('Solo un negocio aprobado puede cambiar su foto.');
  }
  const image = decodeBase64Image(photo.base64);
  const path = `${user.id}/${target}`;
  const { error: uploadError } = await supabase.storage
    .from('avatars')
    .upload(path, image, { contentType: photo.mimeType, upsert: true });
  if (uploadError) throw uploadError;

  const { error } = target === 'profile'
    ? await supabase.from('profiles').update({ avatar_url: path }).eq('id', user.id).select('id').single()
    : await supabase.from('businesses')
      .update({ avatar_url: path })
      .eq('owner_id', user.id)
      .eq('status', 'approved')
      .eq('is_approved', true)
      .select('owner_id')
      .single();
  if (error) throw error;
}

export async function updateCurrentAccountPhoto(
  photo: ProfilePhoto,
  target: 'profile' | 'business',
): Promise<void> {
  await uploadAccountPhoto(photo, target);
}

export function decodeBase64Image(value: string): ArrayBuffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((value.length / 4) * 3 - padding);
  let offset = 0;

  for (let index = 0; index < value.length; index += 4) {
    const first = alphabet.indexOf(value[index]);
    const second = alphabet.indexOf(value[index + 1]);
    const third = value[index + 2] === '=' ? 0 : alphabet.indexOf(value[index + 2]);
    const fourth = value[index + 3] === '=' ? 0 : alphabet.indexOf(value[index + 3]);
    bytes[offset++] = (first << 2) | (second >> 4);
    if (value[index + 2] !== '=') bytes[offset++] = ((second & 15) << 4) | (third >> 2);
    if (value[index + 3] !== '=') bytes[offset++] = ((third & 3) << 6) | fourth;
  }
  return bytes.buffer;
}

export async function savePendingProfilePhoto(email: string, photo: ProfilePhoto): Promise<void> {
  await AsyncStorage.setItem(`${PENDING_AVATAR_KEY}:${email.trim().toLowerCase()}`, JSON.stringify(photo));
}

export async function completePendingProfilePhoto(email: string): Promise<void> {
  const key = `${PENDING_AVATAR_KEY}:${email.trim().toLowerCase()}`;
  const rawPhoto = await AsyncStorage.getItem(key);
  if (!rawPhoto) return;

  let photo: ProfilePhoto;
  try {
    const parsed: unknown = JSON.parse(rawPhoto);
    if (
      typeof parsed !== 'object'
      || parsed === null
      || !('base64' in parsed)
      || typeof parsed.base64 !== 'string'
      || !('mimeType' in parsed)
      || typeof parsed.mimeType !== 'string'
    ) {
      throw new Error('El archivo pendiente no contiene una foto válida.');
    }
    photo = { base64: parsed.base64, mimeType: parsed.mimeType };
  } catch (cause) {
    throw new Error(cause instanceof Error ? cause.message : 'No se pudo leer la foto de perfil pendiente.');
  }

  try {
    await uploadAccountPhoto(photo, 'profile');
    await AsyncStorage.removeItem(key);
  } catch (cause) {
    const { error: signOutError } = await getSupabaseClient().auth.signOut();
    if (signOutError) {
      throw new Error(`No se pudo cerrar la sesión después de un error al guardar la foto: ${signOutError.message}`);
    }
    throw new Error(cause instanceof Error ? `No se pudo guardar tu foto de perfil: ${cause.message}` : 'No se pudo guardar tu foto de perfil.');
  }
}
