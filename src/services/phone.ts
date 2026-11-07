export function normalizePhoneToE164(phone: string): string {
  const trimmedPhone = phone.trim();
  const digits = trimmedPhone.replace(/\D/g, '');
  let normalizedPhone: string;

  if (trimmedPhone.startsWith('+')) {
    normalizedPhone = `+${digits}`;
  } else if (trimmedPhone.startsWith('00')) {
    normalizedPhone = `+${digits.slice(2)}`;
  } else if (digits.length === 8) {
    normalizedPhone = `+503${digits}`;
  } else if (digits.length === 11 && digits.startsWith('503')) {
    normalizedPhone = `+${digits}`;
  } else {
    throw new Error('Ingresa el teléfono con prefijo de país en formato internacional, por ejemplo +503 0000 0000.');
  }

  if (!/^\+[1-9]\d{7,14}$/.test(normalizedPhone)) {
    throw new Error('Ingresa un número válido en formato internacional E.164, incluido el prefijo del país.');
  }

  return normalizedPhone;
}

export function formatPhoneForDisplay(phone: string): string {
  let normalizedPhone: string;
  try {
    normalizedPhone = normalizePhoneToE164(phone);
  } catch {
    return phone;
  }

  if (!normalizedPhone.startsWith('+503') || normalizedPhone.length !== 12) {
    return normalizedPhone;
  }

  const nationalNumber = normalizedPhone.slice(4);
  return `+503 ${nationalNumber.slice(0, 4)}-${nationalNumber.slice(4)}`;
}

export function formatSalvadoranNationalPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '').slice(0, 8);
  return digits.length > 4 ? `${digits.slice(0, 4)}-${digits.slice(4)}` : digits;
}
