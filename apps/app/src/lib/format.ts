/**
 * Format integer kobo as a naira string, e.g. 500000 -> "₦5,000.00".
 * Hand-rolled (no Intl) so it behaves identically on Hermes and web.
 */
export function naira(kobo: number, withKobo = true): string {
  const negative = kobo < 0;
  const abs = Math.abs(Math.trunc(kobo));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const grouped = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const kobos = withKobo ? `.${frac.toString().padStart(2, '0')}` : '';
  return `${negative ? '-' : ''}₦${grouped}${kobos}`;
}

/** A short relative-ish timestamp for chat/lists (HH:MM today, else D MMM). */
export function shortTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  }
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${d.getDate()} ${months[d.getMonth()]}`;
}
