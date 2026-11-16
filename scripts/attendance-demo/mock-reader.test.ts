import {it,expect} from 'vitest';
import {mockReaderEvent} from './mock-reader.mjs';
const enrollment={deviceId:'e9e2b460-d45b-4f41-88cf-693d88884180',credentialRef:'fictional-only',assignmentId:'158d1a25-c08f-45d4-86dd-1eb1888d54ab',capability:'synthetic-not-a-real-capability'};
it('preserves one event across replay while separate scans have distinct IDs/sequences',()=>{
  const time='2026-11-16T09:00:00Z',first=mockReaderEvent(enrollment,'scan',time);
  expect(mockReaderEvent(enrollment,'scan',time)).toEqual(first);
  expect(mockReaderEvent(enrollment,'separate',time).event_id).not.toBe(first.event_id);
  expect(mockReaderEvent(enrollment,'separate',time).device_sequence).toBe(2);
});
it('preserves the supplied reported time without inventing presence or a raw UID',()=>{
  const event=mockReaderEvent(enrollment,'delayed','2026-11-16T08:40:00Z');expect(event.observed_at).toBe('2026-11-16T08:40:00Z');
  expect(event).not.toHaveProperty('student_id');expect(event).not.toHaveProperty('attendance_status');expect(event).not.toHaveProperty('uid');
  expect(()=>mockReaderEvent(enrollment,'unknown','invalid')).toThrow();
});
