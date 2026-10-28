import { request } from './api-client';

export type SellerAccount = {
  email: string;
  businessName: string;
};

function isSellerAccount(value: unknown): value is SellerAccount {
  if (typeof value !== 'object' || value === null) return false;
  const account = value as Record<string, unknown>;
  return typeof account.email === 'string' && typeof account.businessName === 'string';
}

async function sellerRequest(path: string, body: Record<string, string>): Promise<SellerAccount> {
  const payload = await request<{ seller: unknown }>(path, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!isSellerAccount(payload.seller)) {
    throw new Error('La API no devolvió los datos esperados de la cuenta.');
  }
  return payload.seller;
}

export function registerSeller(email: string, password: string, businessName: string): Promise<SellerAccount> {
  return sellerRequest('/seller/register', { email, password, businessName });
}

export function loginSeller(email: string, password: string): Promise<SellerAccount> {
  return sellerRequest('/seller/login', { email, password });
}
