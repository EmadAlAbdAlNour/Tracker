export function formatWesternNumber(value: number | string): string {
  // Use en-US locale to ensure Western (0-9) digits are used even when app locale is Arabic
  try {
    const num = typeof value === 'string' ? Number(value) : value;
    if (isNaN(num)) return String(value);
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(num);
  } catch {
    return String(value);
  }
}
