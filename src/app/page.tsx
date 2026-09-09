'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Role = 'teacher' | 'parent' | 'principal';
type Status = 'present' | 'absent' | 'late';
type Profile = { id: string; school_id: string; role: Role; full_name: string };
type Update = {
  id: string;
  student_id: string;
  category: string;
  title: string;
  message: string;
  importance: 'normal' | 'important';
  sent_at: string;
  acknowledgements?: { acknowledged_at: string; parent_id: string }[];
  students?: { full_name: string };
  profiles?: { full_name: string };
};
type Attendance = {
  id: string;
  class_id: string;
  student_id: string;
  attendance_date: string;
  status: Status;
  students?: any;
};
type Announcement = {
  id: string;
  title: string;
  body: string;
  priority: 'normal' | 'important';
  published_at: string;
};
const categories = [
  'academic',
  'attendance',
  'achievement',
  'behaviour',
  'homework_task',
  'general',
];
const today = () => new Date().toISOString().slice(0, 10);
const nice = (value: string) =>
  value.replace('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
const displayDate = (value: string) =>
  new Date(value).toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export default function Page() {
  const db = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [signingIn, setSigningIn] = useState(false);
  const load = async () => {
    setBusy(true);
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) {
      setProfile(null);
      setBusy(false);
      return;
    }
    const { data, error: profileError } = await db
      .from('profiles')
      .select('id,school_id,role,full_name')
      .eq('id', user.id)
      .single();
    setProfile(profileError ? null : (data as Profile));
    if (profileError) setError('Your profile could not be loaded.');
    setBusy(false);
  };
  useEffect(() => {
    load();
    const { data } = db.auth.onAuthStateChange(load);
    return () => data.subscription.unsubscribe();
  }, [db]);
  if (busy)
    return (
      <main className="center" aria-live="polite">
        <p className="loading-copy">Loading Schovera…</p>
      </main>
    );
  if (!profile)
    return (
      <main className="login">
        <section className="login-intro" aria-labelledby="login-title">
          <div className="brand-lockup">
            <b className="logo" aria-hidden="true">
              S
            </b>
            <span>Schovera</span>
          </div>
          <p className="eyebrow">SCHOOL. HOME. TOGETHER.</p>
          <h1>
            School. Home.
            <br />
            Together.
          </h1>
          <p className="lead" id="login-title">
            Structured school-to-home communication that keeps teachers, parents
            and principals connected.
          </p>
          <p className="login-note">
            One secure place for clear updates, attendance and official school
            notices.
          </p>
        </section>
        <form
          className="card login-card"
          onSubmit={async (e) => {
            e.preventDefault();
            setError('');
            setSigningIn(true);
            const { error: signInError } = await db.auth.signInWithPassword({
              email,
              password,
            });
            if (signInError) {
              setError('Sign-in failed. Check your credentials.');
              setSigningIn(false);
            }
          }}
        >
          <p className="eyebrow">SECURE SIGN IN</p>
          <h2>Welcome to Schovera</h2>
          <p className="form-intro">
            Sign in with the account provided by your school.
          </p>
          <label>
            Email
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@school.org"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button disabled={signingIn}>
            {signingIn ? 'Signing in…' : 'Sign in securely'}
          </button>
        </form>
      </main>
    );
  return (
    <main className="app">
      <header className="app-header">
        <div className="brand-lockup compact">
          <b className="logo small" aria-hidden="true">
            S
          </b>
          <strong>Schovera</strong>
        </div>
        <div className="account-actions">
          <span className="role-chip">{nice(profile.role)}</span>
          <span className="account-name">{profile.full_name}</span>
          <button
            className="link"
            type="button"
            onClick={() => db.auth.signOut()}
          >
            Sign out
          </button>
        </div>
      </header>
      <section className="dashboard-hero">
        <div>
          <p className="eyebrow">{nice(profile.role)} workspace</p>
          <h1>
            {profile.role === 'teacher'
              ? 'Keep every family informed.'
              : profile.role === 'parent'
                ? 'Your child’s school day, clearly connected.'
                : 'Communication, clearly connected.'}
          </h1>
        </div>
        <p className="hero-support">
          {profile.role === 'teacher'
            ? 'Send clear student updates, record attendance and follow important acknowledgements.'
            : profile.role === 'parent'
              ? 'See child-specific updates, attendance and official school notices in one trusted place.'
              : 'See communication coverage and attendance completion across your school.'}
        </p>
      </section>
      <div className="dashboard-content">
        {profile.role === 'teacher' ? (
          <Teacher profile={profile} />
        ) : profile.role === 'parent' ? (
          <Parent profile={profile} />
        ) : (
          <Principal profile={profile} />
        )}
      </div>
    </main>
  );
}

function Teacher({ profile }: { profile: Profile }) {
  const db = useMemo(() => createClient(), []);
  const [classes, setClasses] = useState<any[]>([]),
    [students, setStudents] = useState<any[]>([]),
    [classId, setClassId] = useState(''),
    [student, setStudent] = useState<any>(null),
    [updates, setUpdates] = useState<Update[]>([]),
    [mode, setMode] = useState<'updates' | 'attendance'>('updates'),
    [date, setDate] = useState(today()),
    [records, setRecords] = useState<Record<string, Status>>({}),
    [attendanceBusy, setAttendanceBusy] = useState(false),
    [attendanceNote, setAttendanceNote] = useState(''),
    [note, setNote] = useState('');
  useEffect(() => {
    db.from('teacher_class_assignments')
      .select('classes(id,grade,division)')
      .eq('teacher_id', profile.id)
      .is('ended_at', null)
      .then(({ data }) =>
        setClasses((data || []).map((row: any) => row.classes).filter(Boolean)),
      );
  }, [db, profile]);
  useEffect(() => {
    if (!classId) {
      setStudents([]);
      return;
    }
    db.from('students')
      .select('*')
      .eq('class_id', classId)
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => setStudents(data || []));
  }, [db, classId]);
  const loadAttendance = async () => {
    if (!classId || !students.length) return;
    setAttendanceBusy(true);
    setAttendanceNote('');
    const { data, error } = await db
      .from('attendance_records')
      .select('student_id,status')
      .eq('class_id', classId)
      .eq('attendance_date', date);
    if (error) {
      setAttendanceNote('Could not load attendance. Try again.');
      setAttendanceBusy(false);
      return;
    }
    const existing = Object.fromEntries(
      (data || []).map((row: any) => [row.student_id, row.status as Status]),
    );
    setRecords(
      Object.fromEntries(
        students.map((row) => [row.id, existing[row.id] || 'present']),
      ),
    );
    setAttendanceBusy(false);
  };
  useEffect(() => {
    if (mode === 'attendance') loadAttendance();
  }, [mode, classId, date, students]);
  const refreshUpdates = async () => {
    if (!student) return;
    const { data } = await db
      .from('student_updates')
      .select('*,acknowledgements(acknowledged_at,parent_id)')
      .eq('student_id', student.id)
      .order('sent_at', { ascending: false });
    setUpdates(data || []);
  };
  useEffect(() => {
    refreshUpdates();
  }, [student]);
  useEffect(() => {
    const channel = db
      .channel('teacher-acks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acknowledgements' },
        refreshUpdates,
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [db, student]);
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!student) return;
    const form = new FormData(e.currentTarget);
    setNote('');
    const { error } = await db.rpc('send_student_update', {
      p_class_id: classId,
      p_student_id: student.id,
      p_category: form.get('category'),
      p_title: form.get('title'),
      p_message: form.get('message'),
      p_importance: form.get('important') ? 'important' : 'normal',
    });
    if (error) setNote('Could not send update. Try again.');
    else {
      e.currentTarget.reset();
      setNote('Update sent and saved.');
      refreshUpdates();
    }
  };
  const saveAttendance = async () => {
    if (!classId || !students.length) return;
    setAttendanceBusy(true);
    setAttendanceNote('');
    const p_records = students.map((row) => ({
      student_id: row.id,
      status: records[row.id] || 'present',
    }));
    const { error } = await db.rpc('save_class_attendance', {
      p_class_id: classId,
      p_attendance_date: date,
      p_records,
    });
    setAttendanceBusy(false);
    setAttendanceNote(
      error
        ? 'Could not save attendance. Check the roster and try again.'
        : `Attendance saved for ${new Date(`${date}T00:00:00`).toLocaleDateString()}.`,
    );
  };
  const counts = students.reduce(
    (total, row) => ({
      ...total,
      [records[row.id] || 'present']: total[records[row.id] || 'present'] + 1,
    }),
    { present: 0, absent: 0, late: 0 } as Record<Status, number>,
  );
  return (
    <section className="two">
      <aside className="card teacher-sidebar">
        <p className="eyebrow">YOUR CLASSROOM</p>
        <h2>Choose your class</h2>
        <p className="hint">
          Start with a class, then choose the task you need.
        </p>
        <div className="chips">
          {classes.map((row) => (
            <button
              key={row.id}
              className={classId === row.id ? 'active' : ''}
              onClick={() => {
                setClassId(row.id);
                setStudent(null);
              }}
            >{`Grade ${row.grade}${row.division}`}</button>
          ))}
        </div>
        <div className="chips">
          <button
            className={mode === 'updates' ? 'active' : ''}
            onClick={() => setMode('updates')}
          >
            Student updates
          </button>
          <button
            className={mode === 'attendance' ? 'active' : ''}
            onClick={() => setMode('attendance')}
          >
            Attendance
          </button>
        </div>
        {mode === 'updates' && (
          <>
            <div className="section-heading">
              <p className="eyebrow">STUDENT UPDATES</p>
              <h2>Select a student</h2>
            </div>
            {classId ? (
              <div
                className="student-list"
                aria-label="Students in selected class"
              >
                {students.map((row) => (
                  <button
                    className={
                      student?.id === row.id ? 'student active' : 'student'
                    }
                    key={row.id}
                    type="button"
                    aria-pressed={student?.id === row.id}
                    onClick={() => setStudent(row)}
                  >
                    <span>{row.full_name}</span>
                    <small>Roll {row.roll_number}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="empty compact-empty">
                Select a class to view students.
              </p>
            )}
          </>
        )}
        <Announcements profile={profile} />
      </aside>
      {mode === 'updates' ? (
        <div className="card">
          {student ? (
            <>
              <p className="eyebrow">PARENT UPDATE FOR</p>
              <div className="selected-student">
                <h2>{student.full_name}</h2>
                <span>Roll {student.roll_number}</span>
              </div>
              <h2 className="form-title">Send a structured update</h2>
              <form onSubmit={send}>
                <label>
                  Category
                  <select name="category">
                    {categories.map((category) => (
                      <option key={category}>{nice(category)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Title
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={120}
                    placeholder="Clear update title"
                  />
                </label>
                <label>
                  Message
                  <textarea
                    name="message"
                    required
                    minLength={3}
                    maxLength={1000}
                    rows={4}
                    placeholder="Write a short, kind, specific update…"
                  />
                </label>
                <label className="check">
                  <input name="important" type="checkbox" /> Important —
                  acknowledgement required
                </label>
                <button>Send update to parent</button>
              </form>
              {note && (
                <p className={note.startsWith('Could') ? 'error' : 'success'}>
                  {note}
                </p>
              )}
              <div className="section-heading history-heading">
                <p className="eyebrow">SENT UPDATES</p>
                <h2>Recent communication</h2>
              </div>
              {updates.length ? (
                updates.map((update) => (
                  <Card key={update.id} update={update} teacher />
                ))
              ) : (
                <p className="empty compact-empty">
                  No updates have been sent for this student yet.
                </p>
              )}
            </>
          ) : (
            <p className="empty">
              Choose a student to create a clear, structured parent update.
            </p>
          )}
        </div>
      ) : (
        <AttendanceMarker
          classId={classId}
          students={students}
          date={date}
          records={records}
          counts={counts}
          busy={attendanceBusy}
          note={attendanceNote}
          onDate={setDate}
          onStatus={(studentId: string, status: Status) =>
            setRecords({ ...records, [studentId]: status })
          }
          onSave={saveAttendance}
        />
      )}
    </section>
  );
}

function AttendanceMarker({
  classId,
  students,
  date,
  records,
  counts,
  busy,
  note,
  onDate,
  onStatus,
  onSave,
}: any) {
  return (
    <div className="card">
      {!classId ? (
        <p className="empty">Select an assigned class to mark attendance.</p>
      ) : (
        <>
          <p className="eyebrow">DAILY ATTENDANCE</p>
          <h2>Fast class marking</h2>
          <label>
            Date
            <input
              type="date"
              max={today()}
              value={date}
              onChange={(e) => onDate(e.target.value)}
            />
          </label>
          <div className="attendance-counts">
            <span>
              <b>{students.length}</b>Total
            </span>
            <span>
              <b>{counts.present}</b>Present
            </span>
            <span>
              <b>{counts.absent}</b>Absent
            </span>
            <span>
              <b>{counts.late}</b>Late
            </span>
          </div>
          {busy ? (
            <p>Loading attendance…</p>
          ) : (
            <div className="roster">
              {students.map((student: any) => (
                <label className="roster-row" key={student.id}>
                  <span>
                    {student.full_name}
                    <small>Roll {student.roll_number}</small>
                  </span>
                  <select
                    value={records[student.id] || 'present'}
                    onChange={(e) => onStatus(student.id, e.target.value)}
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                    <option value="late">Late</option>
                  </select>
                </label>
              ))}
            </div>
          )}
          <button disabled={busy || !students.length} onClick={onSave}>
            Save attendance
          </button>
          {note && (
            <p className={note.startsWith('Could') ? 'error' : 'success'}>
              {note}
            </p>
          )}
          <p className="hint">
            Everyone starts as Present. Change only Absent or Late students,
            then save.
          </p>
        </>
      )}
    </div>
  );
}

function Parent({ profile }: { profile: Profile }) {
  const db = useMemo(() => createClient(), []);
  const [children, setChildren] = useState<any[]>([]),
    [childId, setChildId] = useState(''),
    [updates, setUpdates] = useState<Update[]>([]),
    [attendance, setAttendance] = useState<Attendance[]>([]),
    [attendanceError, setAttendanceError] = useState(''),
    [acknowledgementNote, setAcknowledgementNote] = useState(''),
    [acknowledgementError, setAcknowledgementError] = useState('');
  useEffect(() => {
    db.from('parent_student_links')
      .select('students(*)')
      .eq('parent_id', profile.id)
      .eq('status', 'active')
      .then(({ data }) => {
        const linked = (data || []).map((row: any) => row.students);
        setChildren(linked);
        setChildId(linked[0]?.id || '');
      });
  }, [db, profile]);
  const refresh = async () => {
    if (!childId) return;
    const { data } = await db
      .from('student_updates')
      .select(
        '*,profiles!student_updates_teacher_id_fkey(full_name),acknowledgements(acknowledged_at,parent_id)',
      )
      .eq('student_id', childId)
      .order('sent_at', { ascending: false });
    setUpdates(data || []);
  };
  const loadAttendance = async () => {
    if (!childId) return;
    const { data, error } = await db
      .from('attendance_records')
      .select('id,class_id,student_id,attendance_date,status')
      .eq('student_id', childId)
      .order('attendance_date', { ascending: false })
      .limit(10);
    setAttendance(data || []);
    setAttendanceError(error ? 'Attendance could not be loaded.' : '');
  };
  useEffect(() => {
    refresh();
    loadAttendance();
  }, [childId]);
  useEffect(() => {
    const channel = db
      .channel('parent-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'student_updates' },
        refresh,
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [db, childId]);
  const counts = attendance.reduce(
    (total, row) => ({ ...total, [row.status]: total[row.status] + 1 }),
    { present: 0, absent: 0, late: 0 } as Record<Status, number>,
  );
  return (
    <section className="timeline">
      <div className="card">
        <p className="eyebrow">YOUR CHILD</p>
        <h2>Stay connected</h2>
        <label>
          Child
          <select value={childId} onChange={(e) => setChildId(e.target.value)}>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.full_name}
              </option>
            ))}
          </select>
        </label>
        <p className="hint">
          Important updates require acknowledgement. Normal updates are for your
          information.
        </p>
      </div>
      <AttendanceSummary
        attendance={attendance}
        counts={counts}
        error={attendanceError}
      />
      <Announcements profile={profile} parentView />
      <section aria-labelledby="child-updates-heading">
        <div className="section-heading">
          <p className="eyebrow">CHILD-SPECIFIC UPDATES</p>
          <h2 id="child-updates-heading">
            Updates from your child&apos;s teacher
          </h2>
        </div>
        {acknowledgementNote && (
          <p className="success" role="status">
            {acknowledgementNote}
          </p>
        )}
        {acknowledgementError && (
          <p className="error" role="alert">
            {acknowledgementError}
          </p>
        )}
      </section>
      {updates.map((update) => (
        <Card
          key={update.id}
          update={update}
          parent={profile.id}
          acknowledge={async (updateId) => {
            setAcknowledgementNote('');
            setAcknowledgementError('');
            const { error } = await db.rpc('acknowledge_update', {
              p_update_id: updateId,
            });
            if (error)
              setAcknowledgementError(
                'We couldn’t save your acknowledgement. Please try again.',
              );
            else {
              setAcknowledgementNote(
                'Acknowledgement saved. Your child’s teacher can now see it.',
              );
              refresh();
            }
          }}
        />
      ))}
      {childId && !updates.length && (
        <p className="empty">You’re all caught up. No updates yet.</p>
      )}
    </section>
  );
}

function AttendanceSummary({
  attendance,
  counts,
  error,
}: {
  attendance: Attendance[];
  counts: Record<Status, number>;
  error: string;
}) {
  if (error)
    return (
      <div className="card">
        <h2>Attendance</h2>
        <p className="error" role="alert">
          {error}
        </p>
      </div>
    );
  if (!attendance.length)
    return (
      <div className="card">
        <h2>Attendance</h2>
        <p className="empty">
          No attendance has been marked for this child yet.
        </p>
      </div>
    );
  return (
    <div className="card">
      <p className="eyebrow">ATTENDANCE</p>
      <h2>Recent attendance</h2>
      <div className="attendance-counts">
        <span>
          <b>{counts.present}</b>Present
        </span>
        <span>
          <b>{counts.absent}</b>Absent
        </span>
        <span>
          <b>{counts.late}</b>Late
        </span>
      </div>
      <div className="history-list">
        {attendance.slice(0, 5).map((row) => (
          <p key={row.id}>
            <span>
              {new Date(`${row.attendance_date}T00:00:00`).toLocaleDateString()}
            </span>
            <b className={`status ${row.status}`}>{nice(row.status)}</b>
          </p>
        ))}
      </div>
    </div>
  );
}

function Principal({ profile }: { profile: Profile }) {
  const db = useMemo(() => createClient(), []);
  const [all, setAll] = useState<Update[]>([]),
    [classes, setClasses] = useState<any[]>([]),
    [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]),
    [attendanceError, setAttendanceError] = useState('');
  const refresh = async () => {
    const { data } = await db
      .from('student_updates')
      .select('*,students(full_name),acknowledgements(acknowledged_at)')
      .eq('school_id', profile.school_id)
      .order('sent_at', { ascending: false });
    setAll(data || []);
  };
  const loadAttendance = async () => {
    const [classResult, attendanceResult] = await Promise.all([
      db
        .from('classes')
        .select('id,grade,division')
        .eq('school_id', profile.school_id)
        .eq('active', true),
      db
        .from('attendance_records')
        .select(
          'id,class_id,student_id,attendance_date,status,students(full_name)',
        )
        .eq('school_id', profile.school_id)
        .eq('attendance_date', today())
        .order('updated_at', { ascending: false }),
    ]);
    setClasses(classResult.data || []);
    setTodayAttendance(attendanceResult.data || []);
    setAttendanceError(
      classResult.error || attendanceResult.error
        ? 'Attendance overview could not be loaded.'
        : '',
    );
  };
  useEffect(() => {
    refresh();
    loadAttendance();
    const channel = db
      .channel('principal-coverage')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'student_updates' },
        refresh,
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acknowledgements' },
        refresh,
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [db, profile]);
  const important = all.filter((update) => update.importance === 'important'),
    acknowledged = important.filter(
      (update) => update.acknowledgements?.length,
    ),
    attendanceCounts = todayAttendance.reduce(
      (total, row) => ({ ...total, [row.status]: total[row.status] + 1 }),
      { present: 0, absent: 0, late: 0 } as Record<Status, number>,
    ),
    markedClassIds = new Set(todayAttendance.map((row) => row.class_id));
  return (
    <section>
      <div className="metrics">
        {[
          ['Total updates', all.length],
          ['Important', important.length],
          ['Acknowledged', acknowledged.length],
          ['Awaiting', important.length - acknowledged.length],
        ].map(([label, value]) => (
          <div className="card" key={String(label)}>
            <small>{label}</small>
            <b>{value}</b>
          </div>
        ))}
      </div>
      <Announcements profile={profile} publish />
      <div className="card">
        <p className="eyebrow">TODAY’S ATTENDANCE</p>
        <h2>Operational completion</h2>
        {attendanceError ? (
          <p className="error">{attendanceError}</p>
        ) : (
          <>
            <div className="attendance-counts">
              <span>
                <b>{markedClassIds.size}</b>Marked classes
              </span>
              <span>
                <b>{Math.max(0, classes.length - markedClassIds.size)}</b>
                Pending classes
              </span>
              <span>
                <b>{attendanceCounts.present}</b>Present
              </span>
              <span>
                <b>{attendanceCounts.absent}</b>Absent
              </span>
              <span>
                <b>{attendanceCounts.late}</b>Late
              </span>
            </div>
            <div className="history-list">
              {classes.map((row) => (
                <p key={row.id}>
                  <span>{`Grade ${row.grade}${row.division}`}</span>
                  <b
                    className={
                      markedClassIds.has(row.id)
                        ? 'status present'
                        : 'status pending'
                    }
                  >
                    {markedClassIds.has(row.id) ? 'Marked' : 'Pending'}
                  </b>
                </p>
              ))}
            </div>
            {!classes.length && (
              <p className="empty compact-empty">
                No active classes are available for today&apos;s attendance
                view.
              </p>
            )}
            {todayAttendance.length > 0 && (
              <p className="hint">
                Latest activity:{' '}
                {todayAttendance[0].students?.full_name || 'Student'} attendance
                recorded today.
              </p>
            )}
          </>
        )}
      </div>
      <div className="card">
        <p className="eyebrow">RECENT ACTIVITY</p>
        <h2>Communication coverage, not teacher scoring.</h2>
        {all.length ? (
          all
            .slice(0, 6)
            .map((update) => <Card key={update.id} update={update} teacher />)
        ) : (
          <p className="empty compact-empty">
            No student updates have been sent yet. Communication activity will
            appear here when teachers share updates with families.
          </p>
        )}
      </div>
    </section>
  );
}

function Announcements({
  profile,
  publish = false,
  parentView = false,
}: {
  profile: Profile;
  publish?: boolean;
  parentView?: boolean;
}) {
  const db = useMemo(() => createClient(), []);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [note, setNote] = useState('');
  const load = async () => {
    setLoading(true);
    const { data, error } = await db
      .from('announcements')
      .select('id,title,body,priority,published_at')
      .order('published_at', { ascending: false })
      .limit(6);
    setAnnouncements(data || []);
    setNote(error ? 'Announcements could not be loaded.' : '');
    setLoading(false);
  };
  useEffect(() => {
    load();
  }, [db, profile.id]);
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setNote('');
    const { error } = await db.rpc('publish_announcement', {
      p_title: form.get('title'),
      p_body: form.get('body'),
      p_priority: form.get('priority'),
    });
    if (error) setNote('Could not publish announcement. Try again.');
    else {
      event.currentTarget.reset();
      setNote('Announcement published.');
      load();
    }
  };
  return (
    <div className="card announcements">
      <p className="eyebrow">OFFICIAL SCHOOL ANNOUNCEMENTS</p>
      <h2>
        {publish ? 'Publish an official notice' : 'School-wide announcements'}
      </h2>
      {parentView && (
        <p className="hint">
          These are school-wide notices, separate from updates about your child.
        </p>
      )}
      {publish && (
        <form onSubmit={submit}>
          <label>
            Title
            <input
              name="title"
              required
              minLength={3}
              maxLength={120}
              placeholder="Clear school notice title"
            />
          </label>
          <label>
            Message
            <textarea
              name="body"
              required
              minLength={3}
              maxLength={1000}
              rows={3}
              placeholder="Write a concise official notice"
            />
          </label>
          <label>
            Priority
            <select name="priority">
              <option value="normal">Normal</option>
              <option value="important">Important</option>
            </select>
          </label>
          <button>Publish announcement</button>
        </form>
      )}
      {note && (
        <p
          className={
            note.startsWith('Could') || note.includes('loaded')
              ? 'error'
              : 'success'
          }
        >
          {note}
        </p>
      )}
      {loading ? (
        <p>Loading announcements…</p>
      ) : announcements.length ? (
        <div className="announcement-list">
          {announcements.map((announcement) => (
            <article key={announcement.id}>
              <span className="badge">Official notice</span>
              {announcement.priority === 'important' && (
                <span className="important">Important</span>
              )}
              <h3>{announcement.title}</h3>
              <p>{announcement.body}</p>
              <small>Published {displayDate(announcement.published_at)}</small>
            </article>
          ))}
        </div>
      ) : (
        <p className="empty">
          No school announcements have been published yet.
        </p>
      )}
    </div>
  );
}

function Card({
  update,
  teacher,
  parent,
  acknowledge,
}: {
  update: Update;
  teacher?: boolean;
  parent?: string;
  acknowledge?: (id: string) => void;
}) {
  const mine = update.acknowledgements?.find(
    (acknowledgement) => acknowledgement.parent_id === parent,
  );
  return (
    <article
      className={
        update.importance === 'important'
          ? 'update-card important-update'
          : 'update-card'
      }
    >
      <span className="badge">{nice(update.category)}</span>
      {update.importance === 'important' && (
        <span className="important">Acknowledgement required</span>
      )}
      <h3>{update.title}</h3>
      <p>{update.message}</p>
      <small>
        {update.profiles?.full_name && `${update.profiles.full_name} · `}
        {update.students?.full_name && `${update.students.full_name} · `}
        {displayDate(update.sent_at)}
      </small>
      {update.importance === 'important' && (
        <div className="ack">
          {mine || (!parent && update.acknowledgements?.length) ? (
            <b className="status present">Acknowledged</b>
          ) : teacher ? (
            <span className="status pending">Awaiting acknowledgement</span>
          ) : (
            <button onClick={() => acknowledge?.(update.id)}>
              Acknowledge update
            </button>
          )}
        </div>
      )}
    </article>
  );
}
