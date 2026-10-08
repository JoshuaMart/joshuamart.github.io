const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * "08 Sep" or "08 Sep 2026". Built by hand because ICU's en-GB short month
 * renders September as "Sept", which breaks the fixed-width date column.
 */
export function formatDate(date: Date, { year = false }: { year?: boolean } = {}): string {
  const day = String(date.getDate()).padStart(2, '0');
  const label = `${day} ${MONTHS[date.getMonth()]}`;
  return year ? `${label} ${date.getFullYear()}` : label;
}
