import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import { attendanceSnapshotSchema, attendanceWriteError } from './attendance-register';

describe('attendance snapshots', () => {
  const draft = { register_id: null, state: 'draft', revision: 0, records: [], confirmed_by: null, confirmed_at: null, legacy: false };
  it('keeps an empty unsaved register a draft', () => {
    expect(attendanceSnapshotSchema.parse(draft).state).toBe('draft');
  });
  it('requires confirmation identity and time for final records', () => {
    expect(attendanceSnapshotSchema.safeParse({ ...draft, state: 'finalized' }).success).toBe(false);
    expect(attendanceSnapshotSchema.parse({ ...draft, state: 'finalized', legacy: true, confirmed_by: randomUUID(), confirmed_at: '2026-11-16T09:00:00Z' }).state).toBe('finalized');
  });
  it('rejects duplicate students, unsupported statuses and invalid revisions', () => {
    const record = { student_id: randomUUID(), status: 'present' };
    for (const patch of [{ revision: -1 }, { records: [record, record] }, { records: [{ ...record, status: 'excused' }] }])
      expect(attendanceSnapshotSchema.safeParse({ ...draft, ...patch }).success).toBe(false);
  });
  it('shows stale/conflicting edits and missing reasons as failures', () => {
    expect(attendanceWriteError('attendance_conflict')).toContain('not saved');
    expect(attendanceWriteError('attendance_reason_required')).toContain('reason');
    expect(attendanceWriteError('network')).toContain('No confirmation');
  });
});
