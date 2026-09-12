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

function Icon({ name }: { name: 'school' | 'student' | 'updates' | 'attendance' | 'notice' | 'important' | 'check' }) {
  const paths = {
    school: <><path d="M3 10.5 12 5l9 5.5v8.5H3z" /><path d="M7 21v-6h10v6M9 12h.01M12 12h.01M15 12h.01" /></>,
    student: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 21c.7-3.65 2.85-5.5 6.5-5.5s5.8 1.85 6.5 5.5" /></>,
    updates: <><path d="M5 5h14v10H9l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
    attendance: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M7.5 12l2.2 2.2 5-5" /></>,
    notice: <><path d="M6 5h12v14H6z" /><path d="M9 9h6M9 12h6M9 15h4" /></>,
    important: <><path d="M12 3 21 20H3z" /><path d="M12 9v4M12 17h.01" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
  }[name];
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>;
}

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

export default function Page() {
  const db = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [showPassword, setShowPassword] = useState(false),
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
            <span>Email</span>
            <span className="field-with-icon"><Icon name="updates" /><input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@school.org"
            /></span>
          </label>
          <label>
            <span>Password</span>
            <span className="field-with-icon"><Icon name="student" /><input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            /><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></span>
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
    <main className={`app role-${profile.role}`}>
      <header className="role-header">
        <div className="role-school-lockup">
          <div className="logo small" aria-hidden="true">S</div>
          <div>
            <strong>Schovera</strong>
            <span>Schovera International School</span>
          </div>
        </div>
        <div className="account-actions">
          <span className="role-chip">{nice(profile.role)}</span>
          <span className="account-avatar" aria-hidden="true">{initials(profile.full_name)}</span>
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
      {profile.role !== 'parent' && (
        <section className="dashboard-hero">
          <div>
            <p className="eyebrow">{nice(profile.role)} workspace · Schovera International School</p>
            <h1>
              {profile.role === 'teacher'
                ? `Good morning, ${profile.full_name.split(' ')[0]}.`
                : 'Communication, clearly connected.'}
            </h1>
          </div>
          <p className="hero-support">
            {profile.role === 'teacher'
              ? 'Send clear student updates, record attendance and follow important acknowledgements.'
              : 'See communication coverage and attendance completion across your school.'}
          </p>
        </section>
      )}
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
    [sending, setSending] = useState(false),
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
    if (!student || sending) return;
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get('title') || '').trim();
    const message = String(form.get('message') || '').trim();
    setNote('');
    if (!title || !message) {
      setNote('Please add a title and message before sending.');
      return;
    }
    setSending(true);
    const { error } = await db.rpc('send_student_update', {
      p_class_id: classId,
      p_student_id: student.id,
      p_category: form.get('category'),
      p_title: title,
      p_message: message,
      p_importance: form.get('important') ? 'important' : 'normal',
    });
    setSending(false);
    if (error) setNote('Could not send update. Try again.');
    else {
      formElement.reset();
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
    <section className="teacher-workspace">
      <section className="teacher-today-card" aria-label="Today's teaching context">
        <div className="section-icon"><Icon name="school" /></div>
        <div>
          <p className="eyebrow">TODAY AT SCHOVERA</p>
          <h2>{classId ? `Grade ${classes.find((row) => row.id === classId)?.grade}${classes.find((row) => row.id === classId)?.division}` : 'Choose your class'}</h2>
          <p>{classId ? `${students.length || 'Your'} students · ${mode === 'attendance' ? 'Attendance register open' : 'Ready for parent updates'}` : 'Select your assigned class to begin.'}</p>
        </div>
        <span className="today-status">{mode === 'attendance' ? 'Attendance' : 'Student updates'}</span>
      </section>
    <section className="two">
      <aside className="card teacher-sidebar">
        <p className="eyebrow">YOUR CLASSROOM</p>
        <h2>Your classroom</h2>
        <p className="hint">Choose a class, then use one of the three school tools below.</p>
        <div className="chips" aria-label="Assigned classes">
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
            <Icon name="updates" /> Student updates
          </button>
          <button
            className={mode === 'attendance' ? 'active' : ''}
            onClick={() => setMode('attendance')}
          >
            <Icon name="attendance" /> Attendance
          </button>
          <span className="quick-action-static"><Icon name="notice" /> School notices</span>
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
                    <span className="student-name"><i>{initials(row.full_name)}</i><span>{row.full_name}<small>Grade {classes.find((item) => item.id === classId)?.grade}{classes.find((item) => item.id === classId)?.division} · Roll {row.roll_number}</small></span></span>
                    <span className="student-chevron" aria-hidden="true">›</span>
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
              <p className="eyebrow">STEP 3 · PARENT UPDATE FOR</p>
              <div className="selected-student">
                <span className="student-avatar">{initials(student.full_name)}</span>
                <div><h2>{student.full_name}</h2><span>Grade {classes.find((row) => row.id === classId)?.grade}{classes.find((row) => row.id === classId)?.division} · Roll {student.roll_number}</span></div>
              </div>
              <div className="student-snapshot" aria-label="Selected student context">
                <span><small>Students</small><b>{students.length}</b></span>
                <span><small>Attendance</small><b className={`status ${records[student.id] || 'present'}`}>{nice(records[student.id] || 'present')}</b></span>
                <span><small>Latest update</small><b>{updates[0] ? nice(updates[0].category) : 'None yet'}</b></span>
                <span><small>Important</small><b>{updates.find((item) => item.importance === 'important' && !item.acknowledgements?.length) ? 'Awaiting' : 'Up to date'}</b></span>
              </div>
              <h2 className="form-title">Send an update</h2>
              <form onSubmit={send}>
                <label>
                  Category
                  <select name="category">
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {nice(category)}
                      </option>
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
                <button disabled={sending}>
                  {sending ? 'Sending update…' : 'Send update to parent'}
                </button>
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
          classLabel={classes.find((row) => row.id === classId)}
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
    </section>
  );
}

function AttendanceMarker({
  classId,
  classLabel,
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
          <p className="eyebrow">
            {classLabel
              ? `GRADE ${classLabel.grade}${classLabel.division} · DAILY ATTENDANCE`
              : 'DAILY ATTENDANCE'}
          </p>
          <h2>Attendance register</h2>
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
            <Skeleton label="Loading attendance" rows={4} />
          ) : (
            <div className="roster">
              {students.map((student: any) => (
                <label className="roster-row" key={student.id}>
                  <span>
                    {student.full_name}
                    <small>Roll {student.roll_number}</small>
                  </span>
                  <span className="attendance-segments" role="group" aria-label={`Attendance for ${student.full_name}`}>
                    {(['present', 'absent', 'late'] as Status[]).map((status) => <button type="button" key={status} className={`attendance-choice ${status} ${(records[student.id] || 'present') === status ? 'selected' : ''}`} aria-pressed={(records[student.id] || 'present') === status} onClick={() => onStatus(student.id, status)}>{nice(status)}</button>)}
                  </span>
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

function Skeleton({ label, rows = 3 }: { label: string; rows?: number }) {
  return <div className="skeleton" role="status" aria-label={label}>{Array.from({ length: rows }, (_, index) => <span key={index} />)}</div>;
}

function Parent({ profile }: { profile: Profile }) {
  const db = useMemo(() => createClient(), []);
  const [children, setChildren] = useState<any[]>([]),
    [childId, setChildId] = useState(''),
    [updates, setUpdates] = useState<Update[]>([]),
    [attendance, setAttendance] = useState<Attendance[]>([]),
    [attendanceError, setAttendanceError] = useState(''),
    [acknowledgementNote, setAcknowledgementNote] = useState(''),
    [acknowledgingId, setAcknowledgingId] = useState(''),
    [acknowledgementError, setAcknowledgementError] = useState('');
  useEffect(() => {
    db.from('parent_student_links')
      .select('students(*,classes(grade,division))')
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
  const child = children.find((item) => item.id === childId);
  const className = child?.classes
    ? `Grade ${child.classes.grade}${child.classes.division}`
    : 'Your child';
  const awaitingAcknowledgement = updates.filter(
    (update) =>
      update.importance === 'important' &&
      !update.acknowledgements?.some(
        (acknowledgement) => acknowledgement.parent_id === profile.id,
      ),
  );
  const acknowledgeUpdate = async (updateId: string) => {
    if (acknowledgingId) return;
    setAcknowledgementNote('');
    setAcknowledgementError('');
    setAcknowledgingId(updateId);
    const { error } = await db.rpc('acknowledge_update', { p_update_id: updateId });
    setAcknowledgingId('');
    if (error) {
      setAcknowledgementError('We could not save your acknowledgement. Please try again.');
    } else {
      setAcknowledgementNote('Acknowledgement saved. Your child’s teacher can now see it.');
      refresh();
    }
  };
  return (
    <section className="parent-dashboard">
      <section
        className="parent-welcome child-identity-card"
        aria-labelledby="parent-child-heading"
      >
        <span className="child-avatar" aria-hidden="true">{initials(child?.full_name || 'Your child')}</span>
        <div className="child-identity-copy">
          <p className="eyebrow">YOUR CHILD</p>
          <h1 id="parent-child-heading">{child?.full_name || 'Your child'}</h1>
          <p className="parent-class">{className}</p>
          <p className="child-status">Latest attendance: {attendance[0] ? <b className={`status ${attendance[0].status}`}>{nice(attendance[0].status)}</b> : 'Not marked yet'}</p>
        </div>
        {children.length > 1 && (
          <label className="child-switcher">
            Viewing
            <select
              value={childId}
              onChange={(e) => setChildId(e.target.value)}
            >
              {children.map((child) => (
                <option key={child.id} value={child.id}>
                  {child.full_name}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>
      <section className="attention-panel" aria-labelledby="important-heading">
        <p className="eyebrow">IMPORTANT FOR YOU</p>
        <h2 id="important-heading">
          {awaitingAcknowledgement.length
            ? 'A teacher update needs your attention'
            : 'You are all caught up'}
        </h2>
        {awaitingAcknowledgement.length ? (
          <Card update={awaitingAcknowledgement[0]} parent={profile.id} acknowledging={acknowledgingId === awaitingAcknowledgement[0].id} acknowledge={acknowledgeUpdate} />
        ) : (
          <p className="attention-copy">No important updates need your attention right now.</p>
        )}
      </section>
      <section className="right-now" aria-labelledby="right-now-heading">
        <div className="section-heading"><p className="eyebrow">RIGHT NOW</p><h2 id="right-now-heading">At a glance</h2></div>
        <div className="right-now-grid">
          <div><Icon name="attendance" /><span>Attendance<b>{attendance[0] ? nice(attendance[0].status) : 'Not marked'}</b></span></div>
          <div><Icon name="important" /><span>Important<b>{awaitingAcknowledgement.length ? `${awaitingAcknowledgement.length} to read` : 'All caught up'}</b></span></div>
          <div><Icon name="updates" /><span>Latest update<b>{updates[0] ? nice(updates[0].category) : 'No updates'}</b></span></div>
        </div>
      </section>
      <AttendanceSummary
        attendance={attendance}
        counts={counts}
        error={attendanceError}
      />
      <Announcements profile={profile} parentView />
      <section className="parent-updates" aria-labelledby="child-updates-heading">
        <div className="section-heading">
          <p className="eyebrow">CHILD-SPECIFIC UPDATES</p>
          <h2 id="child-updates-heading">Recent updates</h2>
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
      {updates.map((update) => (
        <Card
          key={update.id}
          update={update}
          parent={profile.id}
          acknowledging={acknowledgingId === update.id}
          acknowledge={async (updateId) => {
            if (acknowledgingId) return;
            setAcknowledgementNote('');
            setAcknowledgementError('');
            setAcknowledgingId(updateId);
            const { error } = await db.rpc('acknowledge_update', {
              p_update_id: updateId,
            });
            setAcknowledgingId('');
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
      </section>
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
      <div className="card attendance-card">
        <h2>Attendance</h2>
        <p className="error" role="alert">
          {error}
        </p>
      </div>
    );
  if (!attendance.length)
    return (
      <div className="card attendance-card">
        <h2>Attendance</h2>
        <p className="empty">
          No attendance has been marked for this child yet.
        </p>
      </div>
    );
  return (
    <div className="card attendance-card">
      <p className="eyebrow">ATTENDANCE</p>
      <h2>Attendance</h2>
      <p className="attendance-today">
        Latest:{' '}
        <b className={`status ${attendance[0].status}`}>
          {nice(attendance[0].status)}
        </b>
      </p>
      <h3 className="attendance-recent-heading">Recent attendance</h3>
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
    <section className="principal-dashboard">
      <section className="communication-overview" aria-labelledby="communication-overview-heading">
        <div className="overview-heading"><span className="section-icon"><Icon name="updates" /></span><div><p className="eyebrow">COMMUNICATION COVERAGE</p><h2 id="communication-overview-heading">School-to-home communication</h2></div></div>
        <div className="metrics">
        {[
          ['Important updates', important.length],
          ['Acknowledged', acknowledged.length],
          ['Awaiting acknowledgement', important.length - acknowledged.length],
        ].map(([label, value]) => (
          <div className="metric-cell" key={String(label)}>
            <small>{label}</small>
            <b>{value}</b>
          </div>
        ))}
        </div>
      </section>
      <Announcements profile={profile} publish />
      <div className="card attendance-overview">
        <p className="eyebrow">TODAY’S ATTENDANCE</p>
        <h2>Today&apos;s attendance</h2>
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
        <h2>Recent communication</h2>
        <p className="hint">
          A simple school-wide view of family communication. This is not teacher
          scoring.
        </p>
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
  const [publishing, setPublishing] = useState(false);
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
    if (publishing) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setNote('');
    setPublishing(true);
    const { error } = await db.rpc('publish_announcement', {
      p_title: form.get('title'),
      p_body: form.get('body'),
      p_priority: form.get('priority'),
    });
    setPublishing(false);
    if (error) setNote('Could not publish announcement. Try again.');
    else {
      formElement.reset();
      setNote('Announcement published.');
      load();
    }
  };
  return (
    <div className="card announcements">
      <p className="eyebrow">SCHOOL NOTICES</p>
      <h2>{publish ? 'Publish a school notice' : 'School Notices'}</h2>
      {parentView && (
        <p className="hint">
          These are school-wide notices. They are separate from updates about
          your child.
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
          <button disabled={publishing}>
            {publishing ? 'Publishing notice…' : 'Publish notice'}
          </button>
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
        <Skeleton label="Loading school notices" rows={3} />
      ) : announcements.length ? (
        <div className="announcement-list">
          {announcements.map((announcement) => (
            <article key={announcement.id}>
              <span className="badge">School-wide notice</span>
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
        <p className="empty">No new school notices.</p>
      )}
    </div>
  );
}

function Card({
  update,
  teacher,
  parent,
  acknowledging = false,
  acknowledge,
}: {
  update: Update;
  teacher?: boolean;
  parent?: string;
  acknowledging?: boolean;
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
      <div className="card-topline"><span className="update-icon"><Icon name="updates" /></span><span className="badge">{nice(update.category)}</span>
      {update.importance === 'important' && (
        <span className="important">Important</span>
      )}</div>
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
            <b className="status present">✓ Acknowledged</b>
          ) : teacher ? (
            <span className="status pending">Awaiting acknowledgement</span>
          ) : (
            <>
              <span>Please acknowledge this update.</span>
              <button
                disabled={acknowledging}
                onClick={() => acknowledge?.(update.id)}
              >
                {acknowledging ? 'Acknowledging…' : 'Acknowledge'}
              </button>
            </>
          )}
        </div>
      )}
    </article>
  );
}
