const MAX_NAME_CHARS = 160;
const MAX_LCD_NAME_BYTES = 64;

export function normalizeLcdName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > MAX_NAME_CHARS) {
    throw new Error('display_name_invalid');
  }
  const ascii = value.normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/[\r\n\t ]+/g, ' ')
    .trim()
    .slice(0, MAX_LCD_NAME_BYTES);
  if (!ascii || !/[A-Za-z0-9]/.test(ascii)) throw new Error('display_name_not_lcd_safe');
  return ascii;
}

/** Host-to-Nano command. The name is hex encoded, so commas/control bytes cannot
 * turn into another command. Call only after an accepted backend receipt. */
export function buildLcdWelcomeFrame(displayName) {
  const name = normalizeLcdName(displayName);
  return `SCHOVERA_LCD,1,WELCOME,${Buffer.from(name, 'ascii').toString('hex').toUpperCase()}\n`;
}
