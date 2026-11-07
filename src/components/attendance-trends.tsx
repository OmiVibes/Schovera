'use client';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n-provider';
import { schoolToday } from '@/lib/school-date.mjs';
import { attendanceTrend, trendStart, type TrendRecord } from '@/lib/attendance-trend';

const copy = {
  en: { title: 'Attendance history', help: 'Recorded classroom entries only. Missing dates are not absences.', week: '7 days', month: '1 month', sixMonths: '6 months', year: 'Academic year', all: 'All available years', class: 'Class', allClasses: 'All available classes', refresh: 'Refresh', empty: 'No records in this period.', error: 'Could not load history. Please refresh.', loading: 'Loading history…', details: 'View records', date: 'Date', present: 'Present', absent: 'Absent', late: 'Late', limited: 'Showing the first 5,000 entries. Choose a class or a shorter period.', totals: 'Recorded entries', recent: 'Recent records first' },
  hi: { title: 'उपस्थिति का इतिहास', help: 'केवल दर्ज कक्षा उपस्थिति। बिना रिकॉर्ड वाली तारीख अनुपस्थिति नहीं है।', week: '7 दिन', month: '1 महीना', sixMonths: '6 महीने', year: 'शैक्षणिक वर्ष', all: 'सभी उपलब्ध वर्ष', class: 'कक्षा', allClasses: 'सभी उपलब्ध कक्षाएँ', refresh: 'रीफ़्रेश', empty: 'इस अवधि में कोई रिकॉर्ड नहीं है।', error: 'इतिहास लोड नहीं हुआ। कृपया रीफ़्रेश करें।', loading: 'इतिहास लोड हो रहा है…', details: 'रिकॉर्ड देखें', date: 'तारीख', present: 'उपस्थित', absent: 'अनुपस्थित', late: 'देर से', limited: 'पहली 5,000 प्रविष्टियाँ दिखाई गई हैं। कक्षा या छोटी अवधि चुनें।', totals: 'दर्ज प्रविष्टियाँ', recent: 'हाल के रिकॉर्ड पहले' },
  mr: { title: 'उपस्थितीचा इतिहास', help: 'फक्त वर्गात नोंदवलेली उपस्थिती. नोंद नसलेला दिवस म्हणजे गैरहजेरी नाही.', week: '7 दिवस', month: '1 महिना', sixMonths: '6 महिने', year: 'शैक्षणिक वर्ष', all: 'सर्व उपलब्ध वर्षे', class: 'वर्ग', allClasses: 'सर्व उपलब्ध वर्ग', refresh: 'पुन्हा लोड करा', empty: 'या कालावधीत नोंदी नाहीत.', error: 'इतिहास लोड झाला नाही. पुन्हा प्रयत्न करा.', loading: 'इतिहास लोड होत आहे…', details: 'नोंदी पाहा', date: 'तारीख', present: 'हजर', absent: 'गैरहजर', late: 'उशिरा', limited: 'पहिल्या 5,000 नोंदी दाखवल्या आहेत. वर्ग किंवा कमी कालावधी निवडा.', totals: 'नोंदवलेल्या नोंदी', recent: 'नवीन नोंदी आधी' },
};
type ClassOption = { id: string; grade: string; division: string; academic_year: string };
export function AttendanceTrends({ schoolId, classId, studentId }: { schoolId: string; classId?: string; studentId?: string }) {
  const db = useMemo(() => createClient(), []);
  const { language } = useI18n(); const text = copy[language];
  const [period, setPeriod] = useState<'week' | 'month' | 'sixMonths' | 'history'>('week');
  const [year, setYear] = useState(''); const [selectedClass, setSelectedClass] = useState('');
  const [classes, setClasses] = useState<ClassOption[]>([]); const [tick, setTick] = useState(0);
  const [result, setResult] = useState<{ key: string; rows: TrendRecord[]; error: boolean; limited: boolean } | null>(null);
  const end = schoolToday(); const start = period === 'history' ? '' : trendStart(end, period);
  const historyLabel = language === 'hi' ? 'सभी सुरक्षित रिकॉर्ड' : language === 'mr' ? 'सर्व जतन केलेल्या नोंदी' : 'All saved records';
  const key = JSON.stringify([schoolId, classId, studentId, period, year, selectedClass, tick, end]);
  useEffect(() => {
    let active = true;
    db.from('classes').select('id,grade,division,academic_year').eq('school_id', schoolId).order('academic_year', { ascending: false }).then(({ data }) => { if (active) setClasses((data ?? []) as ClassOption[]); });
    return () => { active = false; };
  }, [db, schoolId]);
  useEffect(() => {
    let active = true;
    async function load() {
      const rows: TrendRecord[] = [];
      const allowed = classes.filter(c => !year || c.academic_year === year).map(c => c.id);
      if (year && !allowed.length) { if (active) setResult({ key, rows, error: false, limited: false }); return; }
      try {
        for (let offset = 0; offset < 5000; offset += 500) {
          let query = db.from('attendance_records').select('attendance_date,status,id').eq('school_id', schoolId).lte('attendance_date', end).order('attendance_date', { ascending: false }).order('id').range(offset, offset + 499);
          if (start) query = query.gte('attendance_date', start);
          if (studentId) query = query.eq('student_id', studentId);
          if (classId || selectedClass) query = query.eq('class_id', classId || selectedClass);
          if (year) query = query.in('class_id', allowed);
          const { data, error } = await query;
          if (!active) return;
          if (error) throw error;
          rows.push(...(data ?? []) as TrendRecord[]);
          if ((data?.length ?? 0) < 500) break;
        }
        if (active) setResult({ key, rows, error: false, limited: rows.length === 5000 });
      } catch { if (active) setResult({ key, rows: [], error: true, limited: false }); }
    }
    void load(); return () => { active = false; };
  }, [db, key, classes, schoolId, classId, studentId, selectedClass, year, start, end]);
  const current = result?.key === key ? result : null;
  const groups = attendanceTrend(current?.rows ?? [], period === 'sixMonths' || period === 'history');
  const max = Math.max(1, ...groups.map(g => g.present + g.absent + g.late));
  const dateLabel = (date: string) => new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-GB', { month: 'short', ...(date.length === 7 ? { year: '2-digit' as const } : { day: 'numeric' as const }), timeZone: 'UTC' }).format(new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`));
  const options = classes.filter(c => !classId || c.id === classId);
  return <section className="card attendance-trends" aria-label={text.title} data-loaded={Boolean(current)}>
    <header><h2>{text.title}</h2><button type="button" className="secondary" onClick={() => setTick(t => t + 1)}>{text.refresh}</button></header>
    <div className="trend-filters"><div className="trend-periods" role="group" aria-label={text.title}>{(['week', 'month', 'sixMonths'] as const).map(p => <button type="button" key={p} aria-pressed={period === p} onClick={() => setPeriod(p)}>{text[p]}</button>)}<button type="button" aria-pressed={period === 'history'} onClick={() => setPeriod('history')}>{historyLabel}</button></div>
      <label>{text.year}<select value={year} onChange={e => { setYear(e.target.value); setSelectedClass(''); }}><option value="">{text.all}</option>{[...new Set(options.map(c => c.academic_year).filter(Boolean))].map(y => <option key={y}>{y}</option>)}</select></label>
      {!classId && !studentId && <label>{text.class}<select value={selectedClass} onChange={e => setSelectedClass(e.target.value)}><option value="">{text.allClasses}</option>{options.filter(c => !year || c.academic_year === year).map(c => <option key={c.id} value={c.id}>{c.grade}{c.division} · {c.academic_year}</option>)}</select></label>}
    </div>
    <p className="hint">{start || historyLabel} — {end} · {text.help}</p>
    {!current ? <p role="status">{text.loading}</p> : current.error ? <p role="alert">{text.error}</p> : !groups.length ? <p>{text.empty}</p> : <>
      <p>{text.totals}: <b>{current.rows.length}</b></p>{current.limited && <p role="status">{text.limited}</p>}
      <div className="trend-legend">{(['present', 'late', 'absent'] as const).map(s => <span key={s}><i className={`trend-${s}`} />{text[s]} <b>{groups.reduce((total, group) => total + group[s], 0)}</b></span>)}</div>
      <div className="trend-chart" role="img" aria-label={`${text.title}: ${groups.map(g => `${g.date}: ${text.present} ${g.present}, ${text.late} ${g.late}, ${text.absent} ${g.absent}`).join('; ')}`}>
        {groups.map(g => <div className="trend-column" key={g.date}><b>{g.present + g.late + g.absent}</b><div className="trend-stack">{(['absent', 'late', 'present'] as const).map(s => <span key={s} className={`trend-${s}`} style={{ height: `${g[s] / max * 100}%` }} />)}</div><small>{dateLabel(g.date)}</small></div>)}
      </div>
      <details><summary>{text.details} · {text.recent}</summary><div className="trend-table"><table><thead><tr><th>{text.date}</th><th>{text.present}</th><th>{text.late}</th><th>{text.absent}</th></tr></thead><tbody>{[...groups].reverse().map(g => <tr key={g.date}><td>{g.date}</td><td>{g.present}</td><td>{g.late}</td><td>{g.absent}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
