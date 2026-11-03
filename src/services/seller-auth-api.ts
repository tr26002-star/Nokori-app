import type { User } from '@supabase/supabase-js';
import { getSupabaseClient, hasSupabaseConfig } from './supabase';

export type SellerAccount = {
  id: string;
  email: string;
  businessName: string;
};

function toSellerAccount(user: User, fallbackEmail: string): SellerAccount {
  return {
    id: user.id,
    email: user.email ?? fallbackEmail,
    businessName: typeof user.user_metadata.business_name === 'string'
      ? user.user_metadata.business_name
      : 'Lemus',
  };
}

export async function registerSeller(
  email: string,
  password: string,
  businessName: string,
): Promise<{ account: SellerAccount; emailConfirmationRequired: boolean }> {
  if (!hasSupabaseConfig()) {
    return {
      account: {
        id: `seller-${Date.now()}`,
        email,
        businessName: businessName || 'Lemus',
      },
      emailConfirmationRequired: false,
    };
  }

  const { data, error } = await getSupabaseClient().auth.signUp({
    email,
    password,
    options: { data: { business_name: businessName } },
  });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase no devolvió los datos de la cuenta creada.');
  return {
    account: toSellerAccount(data.user, email),
    emailConfirmationRequired: !data.session,
  };
}

export async function loginSeller(email: string, password: string): Promise<SellerAccount> {
  if (!hasSupabaseConfig()) {
    return {
      id: 'local-seller-1',
      email,
      businessName: 'Lemus',
    };
  }

  const { data, error } = await getSupabaseClient().auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase no devolvió los datos de la cuenta.');
  return toSellerAccount(data.user, email);
}

export async function logoutSeller(): Promise<void> {
  if (!hasSupabaseConfig()) {
    return;
  }
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
