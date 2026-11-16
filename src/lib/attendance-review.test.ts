import { describe,it,expect } from 'vitest';
import { exceptionCodes,meaningfulAttendanceReason,heldOperationAdvice,attendanceOperationState,attendanceRegisterLabel,principalAttendanceReviewSchema } from './attendance-review';
const base={configured:true,classroom_status:null,reliable_entries:0,check_ins:0,timing_issues:0,delayed_sync:0,sequence_issues:0};
describe('evidence-only reconciliation',()=>{
  it('does not turn a missing card, unconfigured reader or draft default into absence',()=>{
    expect(exceptionCodes(base)).toEqual([]);
    expect(exceptionCodes({...base,configured:false,classroom_status:'present'})).toEqual([]);
    expect(exceptionCodes({...base,classroom_status:'present'})).toEqual(['no_matching_scan']);
  });
  it('separates unconfirmed gate evidence, contradiction and separate scans',()=>{
    expect(exceptionCodes({...base,reliable_entries:1,check_ins:1})).toEqual(['gate_without_confirmation']);
    expect(exceptionCodes({...base,classroom_status:'absent',reliable_entries:2,check_ins:2})).toEqual(['gate_class_mismatch','separate_scans']);
    expect(exceptionCodes({...base,classroom_status:'present',reliable_entries:1,check_ins:1})).toEqual([]);
  });
  it('flags uncertain/delayed/sequence evidence without inferring lateness',()=>{
    expect(exceptionCodes({...base,timing_issues:1,delayed_sync:1,sequence_issues:1})).toEqual(['uncertain_time','delayed_receipt','sequence_review']);
  });
  it('requires a bounded multiword explanation without language remapping',()=>{
    for(const value of ['','  ','yes','correction','x'.repeat(501)])expect(meaningfulAttendanceReason(value)).toBe(false);
    for(const value of ['Teacher checked classroom presence','शिक्षकांनी वर्गात तपासले','शिक्षक ने कक्षा जाँची'])expect(meaningfulAttendanceReason(value)).toBe(true);
  });
  it('keeps another class/day held work out of this register state',()=>{
    const rows=[{operation_id:'owned',kind:'attendance',state:'review',error:'attendance_conflict',class_id:'A',attendance_date:'2026-11-16'}];
    expect(attendanceOperationState(rows,'A','2026-11-16')).toBe('review');expect(attendanceOperationState(rows,'B','2026-11-16')).toBe('none');
    expect(heldOperationAdvice('attendance_conflict')).toContain('new correction');expect(heldOperationAdvice('attendance_reason_required')).toContain('must not be edited');
  });
  it('does not accept contradictory aggregate totals as exact',()=>{
    expect(principalAttendanceReviewSchema.safeParse({attendance_date:'2026-11-16',summary:{classes:0,finalized_registers:0,draft_registers:0,legacy_registers:0,unmarked_registers:0,students:1001,saved:1000,present:1001,absent:0,late:0,unresolved:0},classes:[],has_more:false,unresolved_card_receipts:0}).success).toBe(false);
  });
  it('never calls an unavailable register a draft or a confirmed record',()=>{
    expect(attendanceRegisterLabel(null,false,'none',false)).toContain('unavailable');
    expect(attendanceRegisterLabel(null,false,'none',true)).toContain('Loading');
    expect(attendanceRegisterLabel('draft',false,'none',false)).toContain('Draft');
    expect(attendanceRegisterLabel('finalized',false,'pending',false)).toContain('Pending');
    expect(attendanceRegisterLabel('finalized',true,'none',false)).toContain('Unsaved');
  });
});
