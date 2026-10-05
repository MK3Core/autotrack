/** Most vehicles from 1981 on have a 17-character VIN. */
export const VIN_LENGTH = 17;

/** Uppercase with spaces and dashes removed, as VINs are usually written. */
export function normalizeVin(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}
