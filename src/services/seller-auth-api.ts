import { getSupabaseClient, hasSupabaseConfig } from './supabase';

export async function logoutAccount(): Promise<void> {
  if (!hasSupabaseConfig()) {
    return;
  }
  const { error } = await getSupabaseClient().auth.signOut();
  if (error) throw error;
}
