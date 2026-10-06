/**
 * Manufacturer logos for the Garage badge, picked from the vehicle's make.
 * Files are bundled (src/assets/make-logos, sources in its SOURCES.md) so no
 * lookup ever leaves the device. Only the URLs load eagerly; the browser
 * fetches a logo's image the first time it's shown.
 *
 * Every logo is transparent and drawn for a light background. Logos with
 * dark ink (Audi, VW, Toyota...) also have a `<slug>.dark.webp` with the dark
 * tones lightened, the way brands reverse their logos on dark backgrounds.
 */
const files = import.meta.glob<string>('../assets/make-logos/*.webp', {
  eager: true,
  query: '?url',
  import: 'default',
});

/** Logo URLs by file slug, e.g. "land-rover", with the dark-background version if there is one. */
const bySlug: Record<string, { light: string; dark?: string }> = {};
for (const [path, url] of Object.entries(files)) {
  const name = path.slice(path.lastIndexOf('/') + 1, -'.webp'.length);
  const isDark = name.endsWith('.dark');
  const slug = isDark ? name.slice(0, -'.dark'.length) : name;
  bySlug[slug] = { ...bySlug[slug], [isDark ? 'dark' : 'light']: url };
}

/** Lowercase letters and digits only, accents dropped: "Citroën" -> "citroen". */
function normalize(make: string): string {
  return make
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Common spellings and nicknames, normalized, mapped to a file slug. */
const ALIASES: Record<string, string> = {
  alfa: 'alfa-romeo',
  benz: 'mercedes-benz',
  caddy: 'cadillac',
  chevy: 'chevrolet',
  dsautomobiles: 'ds',
  lambo: 'lamborghini',
  mb: 'mercedes-benz',
  merc: 'mercedes-benz',
  mercedes: 'mercedes-benz',
  rangerover: 'land-rover',
  rolls: 'rolls-royce',
  vw: 'volkswagen',
};

/** Every normalized name a make can be written as, mapped to a file slug. */
const KEYS: Record<string, string> = { ...ALIASES };
for (const slug of Object.keys(bySlug)) KEYS[normalize(slug)] = slug;

// Longest first, so "mercedesbenz" wins over "mercedes" for "Mercedes-Benz AMG".
const PREFIXES = Object.keys(KEYS)
  .filter((k) => k.length >= 4)
  .sort((a, b) => b.length - a.length);

/** Which background the logo will sit on, so dark logos can be swapped for their light version. */
export type LogoBackground = 'light' | 'dark';

/**
 * The logo for a make, or null when there's no match. Matches exact names and
 * aliases, then longer names as a prefix ("Mercedes-AMG", "Mini Cooper").
 * Short names like "Ram" or "MG" only match exactly, so "Rambler" doesn't.
 */
export function makeLogoUrl(make: string | undefined, background: LogoBackground): string | null {
  if (!make) return null;
  const key = normalize(make);
  const match = key in KEYS ? key : PREFIXES.find((p) => key.startsWith(p));
  if (!match) return null;
  const logo = bySlug[KEYS[match]];
  return (background === 'dark' && logo.dark) || logo.light;
}
