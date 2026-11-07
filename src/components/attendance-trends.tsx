'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useI18n } from '@/lib/i18n-provider';
import { schoolToday } from '@/lib/school-date.mjs';
import {
  attendanceTrend,
  attendanceTotals,
  groupAttendanceRate,
  trendStart,
  type TrendRecord,
  type TrendGroup,
} from '@/lib/attendance-trend';

const copy = {
  en: {
    title: 'Attendance history',
    help: 'Recorded classroom entries only. Missing dates are not absences.',
    week: '7 days',
    month: '1 month',
    sixMonths: '6 months',
    year: 'Academic year',
    all: 'All available years',
    class: 'Class',
    allClasses: 'All available classes',
    refresh: 'Refresh',
    empty: 'No records in this period.',
    error: 'Could not load history. Please refresh.',
    loading: 'Loading history…',
    details: 'View records',
    date: 'Date',
    present: 'Present',
    absent: 'Absent',
    late: 'Late',
    limited:
      'Showing the first 5,000 entries. Choose a class or a shorter period.',
    totals: 'Recorded entries',
    recent: 'Recent records first',
  },
  hi: {
    title: 'उपस्थिति का इतिहास',
    help: 'केवल दर्ज कक्षा उपस्थिति। बिना रिकॉर्ड वाली तारीख अनुपस्थिति नहीं है।',
    week: '7 दिन',
    month: '1 महीना',
    sixMonths: '6 महीने',
    year: 'शैक्षणिक वर्ष',
    all: 'सभी उपलब्ध वर्ष',
    class: 'कक्षा',
    allClasses: 'सभी उपलब्ध कक्षाएँ',
    refresh: 'रीफ़्रेश',
    empty: 'इस अवधि में कोई रिकॉर्ड नहीं है।',
    error: 'इतिहास लोड नहीं हुआ। कृपया रीफ़्रेश करें।',
    loading: 'इतिहास लोड हो रहा है…',
    details: 'रिकॉर्ड देखें',
    date: 'तारीख',
    present: 'उपस्थित',
    absent: 'अनुपस्थित',
    late: 'देर से',
    limited: 'पहली 5,000 प्रविष्टियाँ दिखाई गई हैं। कक्षा या छोटी अवधि चुनें।',
    totals: 'दर्ज प्रविष्टियाँ',
    recent: 'हाल के रिकॉर्ड पहले',
  },
  mr: {
    title: 'उपस्थितीचा इतिहास',
    help: 'फक्त वर्गात नोंदवलेली उपस्थिती. नोंद नसलेला दिवस म्हणजे गैरहजेरी नाही.',
    week: '7 दिवस',
    month: '1 महिना',
    sixMonths: '6 महिने',
    year: 'शैक्षणिक वर्ष',
    all: 'सर्व उपलब्ध वर्षे',
    class: 'वर्ग',
    allClasses: 'सर्व उपलब्ध वर्ग',
    refresh: 'पुन्हा लोड करा',
    empty: 'या कालावधीत नोंदी नाहीत.',
    error: 'इतिहास लोड झाला नाही. पुन्हा प्रयत्न करा.',
    loading: 'इतिहास लोड होत आहे…',
    details: 'नोंदी पाहा',
    date: 'तारीख',
    present: 'हजर',
    absent: 'गैरहजर',
    late: 'उशिरा',
    limited: 'पहिल्या 5,000 नोंदी दाखवल्या आहेत. वर्ग किंवा कमी कालावधी निवडा.',
    totals: 'नोंदवलेल्या नोंदी',
    recent: 'नवीन नोंदी आधी',
  },
};
type ClassOption = {
  id: string;
  grade: string;
  division: string;
  academic_year: string;
};
const visualCopy = {
  en: {
    overline: 'Classroom attendance',
    trend: 'Attendance over time',
    mix: 'Attendance breakdown',
    rate: 'Attendance rate',
    rateHelp: 'Present or late ÷ recorded entries',
    entries: 'Recorded entries',
    dates: 'Dates with records',
    recent: 'Recent recorded dates',
    calendar: 'Day-by-day history',
    month: 'Record month',
    missing: 'No record',
    outside: 'Outside this period',
    selected: 'Selected date',
    chartHelp: 'Each point is a recorded date; missing dates are not plotted.',
    monthlyHelp: 'Monthly totals of recorded entries.',
    limit: 'Latest 60 chart points. All loaded dates are in View records.',
    allRecords: 'Show all saved records',
    emptyHelp: 'Try a longer period or another academic year.',
    latest: 'Latest record',
    tableHelp: 'Counts are recorded entries, not a count of calendar days.',
  },
  hi: {
    overline: 'कक्षा की उपस्थिति',
    trend: 'समय के साथ उपस्थिति',
    mix: 'उपस्थिति का विवरण',
    rate: 'उपस्थिति प्रतिशत',
    rateHelp: 'उपस्थित या देर से आए ÷ दर्ज प्रविष्टियाँ',
    entries: 'दर्ज प्रविष्टियाँ',
    dates: 'रिकॉर्ड वाली तारीखें',
    recent: 'हाल की दर्ज तारीखें',
    calendar: 'दिन के अनुसार इतिहास',
    month: 'रिकॉर्ड का महीना',
    missing: 'रिकॉर्ड नहीं',
    outside: 'इस अवधि के बाहर',
    selected: 'चुनी हुई तारीख',
    chartHelp:
      'हर बिंदु एक दर्ज तारीख है; बिना रिकॉर्ड वाली तारीखें नहीं दिखाई गई हैं।',
    monthlyHelp: 'दर्ज प्रविष्टियों के मासिक योग।',
    limit: 'ग्राफ़ में हाल के 60 बिंदु। सभी लोड तारीखें रिकॉर्ड देखें में हैं।',
    allRecords: 'सभी सहेजे रिकॉर्ड दिखाएँ',
    emptyHelp: 'लंबी अवधि या दूसरा शैक्षणिक वर्ष चुनें।',
    latest: 'नवीनतम रिकॉर्ड',
    tableHelp: 'गिनती दर्ज प्रविष्टियों की है, कैलेंडर दिनों की नहीं।',
  },
  mr: {
    overline: 'वर्गातील उपस्थिती',
    trend: 'कालावधीनुसार उपस्थिती',
    mix: 'उपस्थितीचा तपशील',
    rate: 'उपस्थितीचे प्रमाण',
    rateHelp: 'हजर किंवा उशिरा आलेले ÷ नोंदवलेल्या नोंदी',
    entries: 'नोंदवलेल्या नोंदी',
    dates: 'नोंदी असलेल्या तारखा',
    recent: 'अलीकडील नोंदवलेल्या तारखा',
    calendar: 'दिवसानुसार इतिहास',
    month: 'नोंदींचा महिना',
    missing: 'नोंद नाही',
    outside: 'या कालावधीबाहेर',
    selected: 'निवडलेली तारीख',
    chartHelp:
      'प्रत्येक बिंदू नोंदवलेली तारीख आहे; नोंद नसलेल्या तारखा दाखवलेल्या नाहीत.',
    monthlyHelp: 'नोंदवलेल्या नोंदींचे मासिक एकूण.',
    limit: 'आलेखात अलीकडील 60 बिंदू. सर्व लोड तारखा नोंदी पाहा मध्ये आहेत.',
    allRecords: 'सर्व जतन केलेल्या नोंदी दाखवा',
    emptyHelp: 'मोठा कालावधी किंवा दुसरे शैक्षणिक वर्ष निवडा.',
    latest: 'अलीकडील नोंद',
    tableHelp: 'ही नोंदींची संख्या आहे, दिनदर्शिकेतील दिवसांची नाही.',
  },
};
type Labels = typeof visualCopy.en;
type StatusLabels = {
  present: string;
  late: string;
  absent: string;
  date: string;
  details: string;
  recent: string;
};
const states = ['present', 'late', 'absent'] as const;
export function AttendanceTrends({
  schoolId,
  classId,
  studentId,
}: {
  schoolId: string;
  classId?: string;
  studentId?: string;
}) {
  const db = useMemo(() => createClient(), []);
  const { language } = useI18n();
  const text = copy[language];
  const [period, setPeriod] = useState<
    'week' | 'month' | 'sixMonths' | 'history'
  >('month');
  const [year, setYear] = useState('');
  const [selectedClass, setSelectedClass] = useState('');
  const [classes, setClasses] = useState<ClassOption[]>([]);
  const [tick, setTick] = useState(0);
  const [result, setResult] = useState<{
    key: string;
    rows: TrendRecord[];
    error: boolean;
    limited: boolean;
  } | null>(null);
  const end = schoolToday();
  const start = period === 'history' ? '' : trendStart(end, period);
  const historyLabel =
    language === 'hi'
      ? 'सभी सुरक्षित रिकॉर्ड'
      : language === 'mr'
        ? 'सर्व जतन केलेल्या नोंदी'
        : 'All saved records';
  const key = JSON.stringify([
    schoolId,
    classId,
    studentId,
    period,
    year,
    selectedClass,
    tick,
    end,
  ]);
  useEffect(() => {
    let active = true;
    db.from('classes')
      .select('id,grade,division,academic_year')
      .eq('school_id', schoolId)
      .order('academic_year', { ascending: false })
      .then(({ data }) => {
        if (active) setClasses((data ?? []) as ClassOption[]);
      });
    return () => {
      active = false;
    };
  }, [db, schoolId]);
  useEffect(() => {
    let active = true;
    async function load() {
      const rows: TrendRecord[] = [];
      const allowed = classes
        .filter((c) => !year || c.academic_year === year)
        .map((c) => c.id);
      if (year && !allowed.length) {
        if (active) setResult({ key, rows, error: false, limited: false });
        return;
      }
      try {
        for (let offset = 0; offset < 5000; offset += 500) {
          let query = db
            .from('attendance_records')
            .select('attendance_date,status,id')
            .eq('school_id', schoolId)
            .lte('attendance_date', end)
            .order('attendance_date', { ascending: false })
            .order('id')
            .range(offset, offset + 499);
          if (start) query = query.gte('attendance_date', start);
          if (studentId) query = query.eq('student_id', studentId);
          if (classId || selectedClass)
            query = query.eq('class_id', classId || selectedClass);
          if (year) query = query.in('class_id', allowed);
          const { data, error } = await query;
          if (!active) return;
          if (error) throw error;
          rows.push(...((data ?? []) as TrendRecord[]));
          if ((data?.length ?? 0) < 500) break;
        }
        if (active)
          setResult({ key, rows, error: false, limited: rows.length === 5000 });
      } catch {
        if (active) setResult({ key, rows: [], error: true, limited: false });
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [
    db,
    key,
    classes,
    schoolId,
    classId,
    studentId,
    selectedClass,
    year,
    start,
    end,
  ]);
  const current = result?.key === key ? result : null;
  const groups = attendanceTrend(
    current?.rows ?? [],
    period === 'sixMonths' || period === 'history',
  );
  const visual = visualCopy[language];
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat(
      language === 'hi' ? 'hi-IN' : language === 'mr' ? 'mr-IN' : 'en-GB',
      {
        month: 'short',
        year: 'numeric',
        ...(date.length === 7 ? {} : { day: 'numeric' as const }),
        timeZone: 'UTC',
      },
    ).format(new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`));
  const options = classes.filter((c) => !classId || c.id === classId);
  return (
    <section
      className="card attendance-trends"
      aria-label={text.title}
      data-loaded={Boolean(current)}
    >
      <header>
        <div>
          <span className="attendance-overline">{visual.overline}</span>
          <h2>{text.title}</h2>
        </div>
        <button
          type="button"
          className="secondary"
          onClick={() => setTick((t) => t + 1)}
        >
          <span aria-hidden="true">↻ </span>
          {text.refresh}
        </button>
      </header>
      <div className="trend-filters">
        <div className="trend-periods" role="group" aria-label={text.title}>
          {(['week', 'month', 'sixMonths'] as const).map((p) => (
            <button
              type="button"
              key={p}
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
            >
              {text[p]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={period === 'history'}
            onClick={() => setPeriod('history')}
          >
            {historyLabel}
          </button>
        </div>
        <label>
          {text.year}
          <select
            value={year}
            onChange={(e) => {
              setYear(e.target.value);
              setSelectedClass('');
            }}
          >
            <option value="">{text.all}</option>
            {[
              ...new Set(options.map((c) => c.academic_year).filter(Boolean)),
            ].map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
        {!classId && !studentId && (
          <label>
            {text.class}
            <select
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
            >
              <option value="">{text.allClasses}</option>
              {options
                .filter((c) => !year || c.academic_year === year)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.grade}
                    {c.division} · {c.academic_year}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <div className="attendance-range">
        <span>
          {start ? dateLabel(start) : historyLabel} — {dateLabel(end)}
        </span>
        <p>{text.help}</p>
      </div>
      {!current ? (
        <div className="attendance-empty" role="status">
          {text.loading}
        </div>
      ) : current.error ? (
        <div className="attendance-empty" role="alert">
          {text.error}
        </div>
      ) : !groups.length ? (
        <div className="attendance-empty">
          <span aria-hidden="true">◷</span>
          <h3>{text.empty}</h3>
          <p>{visual.emptyHelp}</p>
          <button
            type="button"
            className="secondary"
            onClick={() => setPeriod('history')}
          >
            {visual.allRecords}
          </button>
        </div>
      ) : (
        <>
          {current.limited && <p role="status">{text.limited}</p>}
          <AttendanceVisuals
            key={key}
            rows={current.rows}
            groups={groups}
            student={Boolean(studentId)}
            start={start}
            end={end}
            language={language}
            text={text}
            visual={visual}
            dateLabel={dateLabel}
          />
        </>
      )}
    </section>
  );
}

function AttendanceVisuals({
  rows,
  groups,
  student,
  start,
  end,
  language,
  text,
  visual,
  dateLabel,
}: {
  rows: TrendRecord[];
  groups: TrendGroup[];
  student: boolean;
  start: string;
  end: string;
  language: string;
  text: StatusLabels;
  visual: Labels;
  dateLabel: (date: string) => string;
}) {
  const id = useId().replace(/:/g, '');
  const totals = attendanceTotals(rows);
  const plotRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => {
    const target = plotRef.current;
    if (!target || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      setWidth(Math.max(220, Math.round(entries[0].contentRect.width)));
    });
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  const chartGroups = groups.slice(-60);
  const [selected, setSelected] = useState(chartGroups.at(-1)!.date);
  const focused =
    chartGroups.find((group) => group.date === selected) ?? chartGroups.at(-1)!;
  const points = chartGroups.map((group, index) => ({
    group,
    x:
      chartGroups.length === 1
        ? (width + 28) / 2
        : 40 + (index / (chartGroups.length - 1)) * (width - 52),
    y: 20 + (100 - (groupAttendanceRate(group) ?? 0)) * 1.7,
  }));
  const path = points
    .map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`)
    .join(' ');
  const ticks = [
    ...new Set(
      width < 480
        ? [0, points.length - 1]
        : [
            0,
            Math.floor((points.length - 1) / 3),
            Math.floor(((points.length - 1) * 2) / 3),
            points.length - 1,
          ],
    ),
  ];
  const tickLabel = (date: string) =>
    new Intl.DateTimeFormat(language, {
      month: 'short',
      ...(date.length === 7
        ? { year: '2-digit' as const }
        : { day: 'numeric' as const }),
      timeZone: 'UTC',
    }).format(new Date(`${date.length === 7 ? `${date}-01` : date}T00:00:00Z`));
  const daily = attendanceTrend(rows, false);
  return (
    <>
      <div className="attendance-metrics">
        {states.map((status) => (
          <div className={`attendance-metric ${status}`} key={status}>
            <span className="attendance-metric-symbol" aria-hidden="true">
              {status === 'present' ? '✓' : status === 'late' ? '◷' : '−'}
            </span>
            <div>
              <span>{text[status]}</span>
              <strong>{totals[status]}</strong>
            </div>
          </div>
        ))}
        <div className="attendance-metric recorded">
          <span className="attendance-metric-symbol" aria-hidden="true">
            ▦
          </span>
          <div>
            <span>{visual.dates}</span>
            <strong>{totals.days}</strong>
          </div>
        </div>
      </div>
      <div className="attendance-chart-grid">
        <section className="attendance-plot-panel">
          <div className="attendance-panel-heading">
            <div>
              <h3>{visual.trend}</h3>
              <p>
                {groups[0].date.length === 7
                  ? visual.monthlyHelp
                  : visual.chartHelp}
              </p>
            </div>
            <span className="attendance-period-badge">
              {dateLabel(chartGroups[0].date)} —{' '}
              {dateLabel(chartGroups.at(-1)!.date)}
            </span>
          </div>
          <div className="attendance-line-wrap" ref={plotRef}>
            <svg
              className="attendance-line-chart"
              viewBox={`0 0 ${width} 205`}
              role="group"
              aria-label={visual.trend}
            >
              <defs>
                <linearGradient id={`${id}-area`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--brand)" stopOpacity=".2" />
                  <stop
                    offset="100%"
                    stopColor="var(--brand)"
                    stopOpacity=".015"
                  />
                </linearGradient>
              </defs>
              {[0, 25, 50, 75, 100].map((rate) => (
                <g key={rate} aria-hidden="true">
                  <line
                    x1="40"
                    x2={width - 12}
                    y1={20 + (100 - rate) * 1.7}
                    y2={20 + (100 - rate) * 1.7}
                    className="attendance-chart-gridline"
                  />
                  <text x="32" y={24 + (100 - rate) * 1.7} textAnchor="end">
                    {rate}%
                  </text>
                </g>
              ))}
              {points.length > 1 && (
                <path
                  d={`${path} L${points.at(-1)!.x},190 L${points[0].x},190 Z`}
                  fill={`url(#${id}-area)`}
                  aria-hidden="true"
                />
              )}
              {points.length > 1 && (
                <path
                  d={path}
                  className="attendance-chart-line"
                  aria-hidden="true"
                />
              )}
              {points.map(({ group, x, y }) => (
                <g
                  className="attendance-chart-point"
                  key={group.date}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selected === group.date}
                  aria-label={`${dateLabel(group.date)}: ${text.present} ${group.present}, ${text.late} ${group.late}, ${text.absent} ${group.absent}`}
                  onMouseEnter={() => setSelected(group.date)}
                  onClick={() => setSelected(group.date)}
                  onFocus={() => setSelected(group.date)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      setSelected(group.date);
                    }
                  }}
                >
                  <circle cx={x} cy={y} r="15" fill="transparent" />
                  <circle
                    cx={x}
                    cy={y}
                    r={selected === group.date ? 7 : 4.5}
                    className={selected === group.date ? 'selected' : ''}
                  />
                </g>
              ))}
            </svg>
            <div className="attendance-chart-dates" aria-hidden="true">
              {ticks.map((index) => (
                <span key={index}>{tickLabel(points[index].group.date)}</span>
              ))}
            </div>
          </div>
          <div className="attendance-point-detail" role="status">
            <strong>{dateLabel(focused.date)}</strong>
            <span>
              {visual.rate}:{' '}
              <b>{Math.round(groupAttendanceRate(focused) ?? 0)}%</b>
            </span>
            {states.map((status) => (
              <span key={status} className={`attendance-status ${status}`}>
                {text[status]} {focused[status]}
              </span>
            ))}
          </div>
          {groups.length > 60 && <p className="hint">{visual.limit}</p>}
        </section>
        <section className="attendance-mix-panel">
          <h3>{visual.mix}</h3>
          <div className="attendance-ring">
            <svg
              viewBox="0 0 200 200"
              role="img"
              aria-label={`${visual.rate}: ${Math.round(totals.rate ?? 0)}%. ${states.map((s) => `${text[s]} ${totals[s]}`).join(', ')}`}
            >
              <circle
                cx="100"
                cy="100"
                r="78"
                className="attendance-ring-track"
              />
              {states.map((status, index) => {
                const percent = (totals[status] / totals.total) * 100;
                const previous = states.slice(0, index).reduce((sum, state) => sum + totals[state] / totals.total * 100, 0);
                return (
                  <circle
                    key={status}
                    cx="100"
                    cy="100"
                    r="78"
                    pathLength="100"
                    strokeDasharray={`${percent} ${100 - percent}`}
                    strokeDashoffset={-previous}
                    className={`attendance-ring-segment ${status}`}
                    transform="rotate(-90 100 100)"
                  />
                );
              })}
            </svg>
            <div>
              <strong>
                {Math.round(totals.rate ?? 0)}
                <small>%</small>
              </strong>
              <span>{visual.rate}</span>
            </div>
          </div>
          <p className="attendance-rate-note">{visual.rateHelp}</p>
          <ul className="attendance-mix-legend">
            {states.map((status) => (
              <li key={status}>
                <i className={status} aria-hidden="true" />
                <span>{text[status]}</span>
                <b>{totals[status]}</b>
                <small>
                  {Math.round((totals[status] / totals.total) * 100)}%
                </small>
              </li>
            ))}
          </ul>
          <div className="attendance-entry-total">
            <span>{visual.entries}</span>
            <strong>{totals.total}</strong>
          </div>
        </section>
      </div>
      <div
        className={`attendance-history-grid ${student ? 'with-calendar' : ''}`}
      >
        {student && (
          <AttendanceCalendar
            rows={rows}
            start={start}
            end={end}
            language={language}
            text={text}
            visual={visual}
            dateLabel={dateLabel}
          />
        )}
        <section className="attendance-records-panel">
          <div className="attendance-panel-heading">
            <h3>{visual.recent}</h3>
            <span>{visual.latest}</span>
          </div>
          <div className="attendance-record-list">
            {daily
              .slice(-6)
              .reverse()
              .map((group) => (
                <div className="attendance-record-item" key={group.date}>
                  <div className="attendance-date-tile">
                    <strong>
                      {new Date(`${group.date}T00:00:00Z`).getUTCDate()}
                    </strong>
                    <span>
                      {new Intl.DateTimeFormat(language, {
                        month: 'short',
                        timeZone: 'UTC',
                      }).format(new Date(`${group.date}T00:00:00Z`))}
                    </span>
                  </div>
                  <div>
                    <strong>{dateLabel(group.date)}</strong>
                    <div className="attendance-record-tags">
                      {states
                        .filter((status) => group[status] > 0)
                        .map((status) => (
                          <span
                            className={`attendance-status ${status}`}
                            key={status}
                          >
                            {text[status]}
                            {!student && ` · ${group[status]}`}
                          </span>
                        ))}
                    </div>
                  </div>
                  <span className="attendance-record-rate">
                    {Math.round(groupAttendanceRate(group) ?? 0)}%
                  </span>
                </div>
              ))}
          </div>
        </section>
      </div>
      <details className="attendance-all-records">
        <summary>
          {text.details} · {text.recent}
        </summary>
        <p>{visual.tableHelp}</p>
        <div className="trend-table">
          <table>
            <thead>
              <tr>
                <th scope="col">{text.date}</th>
                {states.map((status) => (
                  <th scope="col" key={status}>
                    {text[status]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[...daily].reverse().map((group) => (
                <tr key={group.date}>
                  <th scope="row">{dateLabel(group.date)}</th>
                  {states.map((status) => (
                    <td key={status}>{group[status]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function AttendanceCalendar({
  rows,
  start,
  end,
  language,
  text,
  visual,
  dateLabel,
}: {
  rows: TrendRecord[];
  start: string;
  end: string;
  language: string;
  text: StatusLabels;
  visual: Labels;
  dateLabel: (date: string) => string;
}) {
  const months = [
    ...new Set(rows.map((row) => row.attendance_date.slice(0, 7))),
  ]
    .sort()
    .reverse();
  const [month, setMonth] = useState(months[0]);
  const [day, setDay] = useState(
    rows
      .map((row) => row.attendance_date)
      .sort()
      .at(-1)!,
  );
  const counts = new Map(
    attendanceTrend(rows, false).map((group) => [group.date, group]),
  );
  const first = new Date(`${month}-01T00:00:00Z`);
  const length = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const padding = (first.getUTCDay() + 6) % 7;
  const selected = counts.get(day);
  const weekday = new Intl.DateTimeFormat(language, {
    weekday: 'short',
    timeZone: 'UTC',
  });
  return (
    <section className="attendance-calendar">
      <div className="attendance-panel-heading">
        <h3>{visual.calendar}</h3>
        <label>
          <span className="sr-only">{visual.month}</span>
          <select
            value={month}
            onChange={(event) => {
              const value = event.target.value;
              setMonth(value);
              setDay(
                rows
                  .filter((row) => row.attendance_date.startsWith(value))
                  .map((row) => row.attendance_date)
                  .sort()
                  .at(-1)!,
              );
            }}
          >
            {months.map((value) => (
              <option key={value} value={value}>
                {new Intl.DateTimeFormat(language, {
                  month: 'long',
                  year: 'numeric',
                  timeZone: 'UTC',
                }).format(new Date(`${value}-01T00:00:00Z`))}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="attendance-calendar-weekdays" aria-hidden="true">
        {Array.from({ length: 7 }, (_, index) => (
          <span key={index}>
            {weekday.format(new Date(Date.UTC(2026, 10, 2 + index)))}
          </span>
        ))}
      </div>
      <div
        className="attendance-calendar-days"
        role="group"
        aria-label={visual.calendar}
      >
        {Array.from({ length: padding }, (_, index) => (
          <span key={`blank-${index}`} aria-hidden="true" />
        ))}
        {Array.from({ length }, (_, index) => {
          const date = `${month}-${String(index + 1).padStart(2, '0')}`;
          const group = counts.get(date);
          const status = group
            ? states.find((state) => group[state] > 0)
            : undefined;
          const outside = (Boolean(start) && date < start) || date > end;
          const label = outside
            ? visual.outside
            : status
              ? text[status]
              : visual.missing;
          return (
            <button
              type="button"
              key={date}
              className={`attendance-calendar-day ${outside ? 'outside' : (status ?? 'unrecorded')}`}
              disabled={outside}
              aria-pressed={day === date}
              aria-label={`${dateLabel(date)}: ${label}`}
              onClick={() => setDay(date)}
            >
              <span>{index + 1}</span>
              <i aria-hidden="true">
                {status === 'present'
                  ? '✓'
                  : status === 'late'
                    ? '·'
                    : status === 'absent'
                      ? '−'
                      : ''}
              </i>
            </button>
          );
        })}
      </div>
      <div className="attendance-calendar-key">
        {states.map((status) => (
          <span key={status}>
            <i className={status} />
            {text[status]}
          </span>
        ))}
        <span>
          <i className="unrecorded" />
          {visual.missing}
        </span>
      </div>
      <div className="attendance-calendar-selection" role="status">
        <span>{visual.selected}</span>
        <strong>{dateLabel(day)}</strong>
        <span
          className={`attendance-status ${selected ? states.find((status) => selected[status] > 0) : 'unrecorded'}`}
        >
          {selected
            ? states
                .filter((status) => selected[status] > 0)
                .map((status) => text[status])
                .join(' · ')
            : visual.missing}
        </span>
      </div>
    </section>
  );
}
