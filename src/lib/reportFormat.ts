/** Shared number formats and chart colors for the Reports page. */

/*
 * Chart colors are fixed hex rather than CSS variables because Recharts writes
 * them into SVG attributes. Fuel and service were run through the dataviz
 * palette validator against the dark surface (colorblind-safe as a pair); the
 * service magenta stands in for the app's purple, which is too close to the
 * accent blue to tell apart in a stacked bar.
 */
export const CHART = {
  fuel: '#4f8cff',
  service: '#c9628f',
  grid: '#232833',
  axis: '#9aa1b0',
  surface: '#171a21',
};

function currencyFormat(currency: string, extra: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol', ...extra });
}

/** The currency's usual decimals: 2 for dollars and euros, 0 for yen. */
function minorDigits(currency: string): number {
  return currencyFormat(currency).resolvedOptions().maximumFractionDigits ?? 2;
}

/** An exact amount in the currency's usual decimals ("$842.10", "¥5,400"). */
export function amount(n: number, currency: string): string {
  return currencyFormat(currency).format(n);
}

/** "$842.10" below a thousand, "$4,213" from there up. */
export function money(n: number, currency: string): string {
  return n >= 1000 ? currencyFormat(currency, { maximumFractionDigits: 0 }).format(n) : amount(n, currency);
}

/** Cost per distance or per volume, to a tenth of a cent ("$0.183", "$4.019"). */
export function rate(n: number, currency: string): string {
  const digits = minorDigits(currency) + 1;
  return currencyFormat(currency, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(n);
}

/** Short chart axis ticks: "$850", "$1.2K". */
export function moneyTick(n: number, currency: string): string {
  return currencyFormat(currency, { notation: 'compact', minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(n);
}

export function shortDate(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
