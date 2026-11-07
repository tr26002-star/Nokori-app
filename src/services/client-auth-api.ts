import { getSupabaseClient, hasSupabaseConfig } from './supabase';

function requireSupabase() {
  if (!hasSupabaseConfig()) {
    throw new Error('Configura Supabase para autenticar tu cuenta de cliente.');
  }
  return getSupabaseClient();
}

function validateCredentials(email: string, password: string, isRegistration: boolean): string {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Escribe un correo electrónico válido.');
  }
  if (!password) {
    throw new Error('Escribe la contraseña de tu cuenta.');
  }
  if (isRegistration && Array.from(password).length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }
  return normalizedEmail;
}

function isSellerAccount(user: { user_metadata?: Record<string, unknown> }): boolean {
  return typeof user.user_metadata?.business_name === 'string';
}

function getAuthErrorDetails(cause: unknown): { code: string; message: string } {
  if (!cause || typeof cause !== 'object') return { code: '', message: String(cause ?? '') };
  const error = cause as { code?: unknown; message?: unknown };
  return {
    code: typeof error.code === 'string' ? error.code.toLowerCase() : '',
    message: typeof error.message === 'string' ? error.message.toLowerCase() : '',
  };
}

export function getClientAuthErrorMessage(cause: unknown, fallback: string): string {
  const { code, message } = getAuthErrorDetails(cause);
  const text = `${code} ${message}`;

  if (/network|fetch failed|failed to fetch|connection|offline|timeout|load failed/.test(text)) {
    return 'No hay conexión con el servicio. Revisa tu conexión a internet e inténtalo de nuevo.';
  }
  if (/email_exists|user_already_exists|already registered|already been registered|email.*exists/.test(text)) {
    return 'Ese correo ya está registrado. Inicia sesión con tu contraseña.';
  }
  if (/invalid_credentials|invalid login credentials|invalid_grant|password.*incorrect/.test(text)) {
    return 'El correo o la contraseña son incorrectos.';
  }
  if (/weak_password/.test(text)) {
    return 'La contraseña debe tener al menos 8 caracteres.';
  }
  if (/email_not_confirmed|email not confirmed/.test(text)) {
    return 'Confirma tu correo desde el mensaje de registro antes de iniciar sesión.';
  }
  if (/invalid_email|email.*invalid/.test(text)) {
    return 'Escribe un correo electrónico válido.';
  }

  return cause instanceof Error && cause.message ? cause.message : fallback;
}

export type ClientRegistrationResult = {
  email: string;
  emailConfirmationRequired: boolean;
};

export async function registerClient(email: string, password: string): Promise<ClientRegistrationResult> {
  const normalizedEmail = validateCredentials(email, password, true);
  const { data, error } = await requireSupabase().auth.signUp({
    email: normalizedEmail,
    password,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase no devolvió los datos de la cuenta creada.');
  if (data.user.identities?.length === 0) {
    throw new Error('email_exists: Ese correo ya está registrado.');
  }
  return {
    email: data.user.email ?? normalizedEmail,
    emailConfirmationRequired: !data.session,
  };
}

export async function loginClient(email: string, password: string): Promise<string> {
  const normalizedEmail = validateCredentials(email, password, false);
  const { data, error } = await requireSupabase().auth.signInWithPassword({
    email: normalizedEmail,
    password,
  });
  if (error) throw error;
  if (!data.user?.email) {
    throw new Error('Supabase no devolvió el correo de la cuenta autenticada.');
  }
  if (isSellerAccount(data.user)) {
    throw new Error('Esta cuenta corresponde al perfil de vendedor. Inicia sesión desde ese rol.');
  }
  return data.user.email;
}

export async function getAuthenticatedClientEmail(): Promise<string> {
  const { data, error } = await requireSupabase().auth.getUser();
  if (error) throw error;
  if (!data.user?.email) {
    throw new Error('Inicia sesión con tu correo para acceder a las reservas.');
  }
  if (isSellerAccount(data.user)) {
    throw new Error('Esta cuenta corresponde al perfil de vendedor. Inicia sesión como cliente.');
  }
  return data.user.email;
}

export async function getPersistedClientEmail(): Promise<string | null> {
  if (!hasSupabaseConfig()) return null;
  const { data, error } = await getSupabaseClient().auth.getSession();
  if (error) throw error;
  const user = data.session?.user;
  return user && !isSellerAccount(user) ? user.email ?? null : null;
}
