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

/** "$842.10" below a thousand, "$4,213" from there up. */
export function money(n: number): string {
  return n >= 1000 ? `$${Math.round(n).toLocaleString()}` : `$${n.toFixed(2)}`;
}

/** Cost per distance or per volume, to a tenth of a cent ("$0.183", "$4.019"). */
export function rate(n: number): string {
  return `$${n.toFixed(3)}`;
}

export function shortDate(date: string, withYear = false): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
  });
}
