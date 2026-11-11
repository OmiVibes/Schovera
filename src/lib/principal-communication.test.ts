import { describe, expect, it } from 'vitest';
import { parsePrincipalCommunication } from './principal-communication';
const school = '12d3f57b-0d1d-48ae-b546-daf69fd11b6b';
const result = (total: number, acknowledged = 0) => ({school_id: school, summary: {
  total_count: total, effective_count: total, important_count: total,
  acknowledged_count: acknowledged, awaiting_count: total - acknowledged,
  coverage: total ? Math.round(acknowledged / total * 100) : null,
}, updates: [], has_more: false});
describe('authoritative Principal communication response', () => {
  it.each([0, 1, 999, 1000, 1001, 1002, 2501])('does not infer the %i total from feed length', total => {
    expect(parsePrincipalCommunication(result(total), school).summary.important_count).toBe(total);
  });
  it('rejects missing totals instead of inventing zero', () => {
    expect(() => parsePrincipalCommunication({school_id: school, updates: [], has_more: false}, school)).toThrow();
  });
  it('rejects contradictory totals and coverage', () => {
    const value = result(1002, 501); value.summary.awaiting_count--;
    expect(() => parsePrincipalCommunication(value, school)).toThrow();
    const incorrect = result(1002, 501); incorrect.summary.coverage = 49;
    expect(() => parsePrincipalCommunication(incorrect, school)).toThrow();
  });
  it('rejects a foreign school and an impossible continuation', () => {
    expect(() => parsePrincipalCommunication(result(1), '14a73077-d843-423d-b3f7-dd1b81eb4d13')).toThrow();
    expect(() => parsePrincipalCommunication({...result(1), has_more: true}, school)).toThrow();
  });
});
