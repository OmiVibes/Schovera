import { createHash } from 'node:crypto';

export const fictionalNames = ['Aarav Deshmukh','Siya Kulkarni','Rohan Patil','Ananya Joshi','Vedant Jadhav','Myra Shah','Kabir More','Ishita Nair','Aditya Pawar','Sara Khan','Vihaan Shinde','Aditi Chavan','Reyansh Salunkhe','Riya Mehta','Omkar Gaikwad','Sanvi Bhosale','Arjun Kadam','Meera Desai','Yash Malhotra','Fatima Shaikh'];
// Explicit export allowlist: never serialize select(*) results, Auth rows, audit
// metadata, credentials, devices, receipts, keys, tokens, phones or old passwords.
export const columns = {
  schools: 'id,name,timezone', profiles: 'id,full_name,role', classes: 'id,grade,division,academic_year',
  students: 'id,class_id,full_name,roll_number,active',
  teacher_class_assignments: 'id,teacher_id,class_id', parent_student_links: 'id,parent_id,student_id,status',
  attendance_records: 'id,class_id,student_id,marked_by,attendance_date,status',
  class_assignments: 'id,class_id,teacher_id,subject,title,description,due_date',
  timetable_entries: 'id,class_id,teacher_id,weekday,period_number,start_time,end_time,subject',
  student_updates: 'id,class_id,student_id,teacher_id,category,title,message,importance,sent_at,corrects_update_id',
  acknowledgements: 'id,update_id,parent_id,acknowledged_at',
  announcements: 'id,created_by,title,body,priority,created_at',
  communication_translations: 'id,student_update_id,announcement_id,language,title,body,status,source_hash,authored_by,approved_by,approved_at',
  school_entry_events: 'id,student_id,event_type,observed_at,received_at,sequence_state,timestamp_quality',
};
const links = { class_id:'classes',student_id:'students',teacher_id:'profiles',parent_id:'profiles',marked_by:'profiles',created_by:'profiles',authored_by:'profiles',approved_by:'profiles',update_id:'student_updates',student_update_id:'student_updates',corrects_update_id:'student_updates',announcement_id:'announcements' };

export function validateDataset(bundle) {
  if (bundle?.version !== 1 || bundle.fictional !== true || bundle.template !== 'task32r-20') throw new Error('Fictional Task 32R dataset required');
  if (Object.keys(bundle).some(k => !['version','fictional','template','tables','fallbackExamples'].includes(k))) throw new Error('Unexpected dataset material');
  if (!bundle.tables || Object.keys(bundle.tables).sort().join() !== Object.keys(columns).sort().join()) throw new Error('Unexpected table set');
  const ids = new Set();
  for (const [table, rows] of Object.entries(bundle.tables)) {
    if (!Array.isArray(rows) || rows.length > 2000) throw new Error('Bounded table rows required');
    const fields = columns[table].split(',');
    for (const row of rows) {
      if (!row || Object.keys(row).some(k => !fields.includes(k)) || typeof row.id !== 'string' || !row.id.startsWith(`${table}:`) || ids.has(row.id)) throw new Error('Unexpected column or duplicate row identity');
      ids.add(row.id);
      if (Object.values(row).some(v => v !== null && !['string','number','boolean'].includes(typeof v) || typeof v === 'string' && v.length > 4000)) throw new Error('Unexpected nested/oversized value');
    }
  }
  for (const rows of Object.values(bundle.tables)) for (const row of rows) for (const [key,target] of Object.entries(links)) {
    if (row[key] != null && (!String(row[key]).startsWith(`${target}:`) || !ids.has(row[key]))) throw new Error('Unresolved/cross-scope dataset relationship');
  }
  const t = bundle.tables;
  if (t.schools.length !== 1 || t.schools[0].name !== 'Schovera Model School — Demo Campus' || t.classes.length !== 2 || t.students.length !== 20
    || t.profiles.filter(p => p.role === 'principal').length !== 1 || t.profiles.filter(p => p.role === 'teacher').length !== 2 || t.profiles.filter(p => p.role === 'parent').length !== 10
    || t.profiles.length !== 13 || fictionalNames.some(n => !t.students.some(s => s.full_name === n))
    || t.classes.some(c => t.students.filter(s => s.class_id === c.id).length !== 10)) throw new Error('Expected fictional school roster required');
  if (t.parent_student_links.length !== 20 || t.students.some(s => !t.parent_student_links.some(l => l.student_id === s.id && l.status === 'active'))
    || t.profiles.filter(p => p.role === 'teacher').some(p => !t.teacher_class_assignments.some(a => a.teacher_id === p.id))
    || t.attendance_records.length < 200 || t.class_assignments.length < 6 || t.timetable_entries.length < 36 || t.school_entry_events.length < 20
    || !t.communication_translations.some(r => r.language === 'hi' && r.status === 'approved') || !t.communication_translations.some(r => r.language === 'mr' && r.status === 'approved')
    || !t.acknowledgements.length || !t.announcements.length || !t.student_updates.length) throw new Error('Connected presentation records missing');
  if (JSON.stringify(bundle.fallbackExamples) !== JSON.stringify([{channel:'sms',status:'delivered',simulated:true},{channel:'ivr',status:'delivered',simulated:true}])) throw new Error('Fixed fictional fallback examples only');
  return bundle;
}

export function makeDataset(raw) {
  const map = new Map(), tables = {};
  for (const table of Object.keys(columns)) raw[table].forEach((r,i) => { if(map.has(r.id)) throw new Error('Duplicate source identity'); map.set(r.id, `${table}:${i+1}`); });
  for (const [table, fields] of Object.entries(columns)) tables[table] = raw[table].map(row => Object.fromEntries(fields.split(',').map(key => {
    const value = row[key] ?? null;
    return [key, key === 'id' || links[key] ? (value === null ? null : map.get(value) ?? 'unresolved') : value];
  })));
  return validateDataset({version:1,fictional:true,template:'task32r-20',tables,fallbackExamples:[{channel:'sms',status:'delivered',simulated:true},{channel:'ivr',status:'delivered',simulated:true}]});
}
export function datasetDigest(bundle) { validateDataset(bundle); return createHash('sha256').update(JSON.stringify(bundle)).digest('hex'); }
