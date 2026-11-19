import { describe, expect, it } from 'vitest';
import { parseProposalPage } from './timetable-proposals';
import { uiText } from './ui-copy';
const school = '00000000-0000-4000-8000-000000000001';
const actor = '00000000-0000-4000-8000-000000000002';
const klass = '00000000-0000-4000-8000-000000000003';
const row = { id: '00000000-0000-4000-8000-000000000004', school_id: school, proposed_by: actor, teacher_id: actor,
  class_id: klass, class_grade: '8', class_division: 'A', proposer_name: 'Synthetic Teacher', entry_id: null,
  expected_updated_at: null, subject: 'Science', weekday: 1, period_number: 1, start_time: '09:00:00', end_time: '09:45:00',
  room: null, reason: 'Allow science practice', status: 'pending', created_at: '2026-11-19T07:00:00+00:00',
  decided_by: null, decider_name: null, decided_at: null, decision_reason: null, published_entry_id: null,
  published_updated_at: null, published_snapshot: null };
describe('Authorized proposal response boundary', () => {
  it('accepts pending intentions and empty history', () => {
    expect(parseProposalPage({ items: [row], has_more: false }, school, actor, klass).items[0].subject).toBe('Science');
    expect(parseProposalPage({ items: [], has_more: false }, school).items).toEqual([]);
  });
  it('refuses foreign school, author and class data', () => {
    for (const scope of [[actor, actor, klass], [school, school, klass], [school, actor, actor]]) {
      expect(() => parseProposalPage({ items: [row], has_more: false }, ...scope as [string, string, string])).toThrow();
    }
  });
  it('refuses duplicate rows and missing cursor candidates', () => {
    expect(() => parseProposalPage({ items: [row, row], has_more: false }, school)).toThrow();
    expect(() => parseProposalPage({ items: [], has_more: true }, school)).toThrow();
  });
  it('does not treat an incomplete decision as publication', () => {
    expect(() => parseProposalPage({ items: [{ ...row, status: 'approved', decided_by: actor, decided_at: row.created_at }], has_more: false }, school)).toThrow();
    expect(() => parseProposalPage({ items: [{ ...row, published_entry_id: actor }], has_more: false }, school)).toThrow();
  });
  it('refuses mismatched source version and Teacher identity', () => {
    for (const patch of [{ expected_updated_at: row.created_at }, { teacher_id: school }])
      expect(() => parseProposalPage({ items: [{ ...row, ...patch }], has_more: false }, school)).toThrow();
  });
  it('localizes new workflow controls without translating authored content', () => {
    for (const language of ['hi', 'mr'] as const) for (const key of ['Timetable proposals', 'Submit proposal', 'Approve and publish', 'Reject proposal', 'Withdraw proposal', 'No proposals in this view.'])
      expect(uiText(key, language)).not.toBe(key);
    expect(uiText('Synthetic authored subject', 'mr')).toBe('Synthetic authored subject');
  });
});
