import { describe, expect, it } from 'vitest';
import { buildLcdWelcomeFrame, normalizeLcdName } from './lcd-protocol.mjs';

describe('Nano LCD confirmation protocol', () => {
  it('encodes a registered name as bounded ASCII hex without changing legacy scan framing', () => {
    expect(buildLcdWelcomeFrame('Synthetic Learner')).toBe('SCHOVERA_LCD,1,WELCOME,53796E746865746963204C6561726E6572\n');
    expect(normalizeLcdName('Synthetic Learner')).toBe('Synthetic Learner');
  });
  it('removes line and command injection by encoding the display name', () => {
    const frame = buildLcdWelcomeFrame('Learner, One\nSCHOVERA_SCAN,AA:BB:CC:DD,1');
    expect(frame).toMatch(/^SCHOVERA_LCD,1,WELCOME,[0-9A-F]+\n$/);
    expect(frame).not.toContain('SCHOVERA_SCAN');
  });
  it('normalizes common accented Latin names and bounds display length', () => {
    expect(normalizeLcdName('Jos\u00e9 \u00c1lvarez')).toBe('Jose Alvarez');
    expect(Buffer.byteLength(normalizeLcdName('A'.repeat(100)))).toBe(64);
  });
  it('rejects empty, oversized, and names that cannot be represented safely', () => {
    expect(() => buildLcdWelcomeFrame('  ')).toThrow('display_name_invalid');
    expect(() => buildLcdWelcomeFrame('x'.repeat(161))).toThrow('display_name_invalid');
    expect(() => buildLcdWelcomeFrame('\u0915\u0915\u094d\u0937\u093e')).toThrow('display_name_not_lcd_safe');
  });
});
