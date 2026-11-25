export function getGoogleMapsUrl(latitude: number | null, longitude: number | null): string | null {
  if (
    latitude === null
    || longitude === null
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || latitude < -90
    || latitude > 90
    || longitude < -180
    || longitude > 180
  ) {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
}
