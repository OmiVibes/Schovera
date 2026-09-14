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

function Icon({ name }: { name: 'school' | 'student' | 'updates' | 'attendance' | 'notice' | 'important' | 'check' | 'academic' | 'achievement' | 'behaviour' | 'homework' | 'general' }) {
  const paths = {
    school: <><path d="M3 10.5 12 5l9 5.5v8.5H3z" /><path d="M7 21v-6h10v6M9 12h.01M12 12h.01M15 12h.01" /></>,
    student: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 21c.7-3.65 2.85-5.5 6.5-5.5s5.8 1.85 6.5 5.5" /></>,
    updates: <><path d="M5 5h14v10H9l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
    attendance: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M7.5 12l2.2 2.2 5-5" /></>,
    notice: <><path d="M6 5h12v14H6z" /><path d="M9 9h6M9 12h6M9 15h4" /></>,
    important: <><path d="M12 3 21 20H3z" /><path d="M12 9v4M12 17h.01" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    academic: <><path d="m4 6 8-3 8 3-8 3zM6.5 10v5.5c3.2 2.1 7.8 2.1 11 0V10" /><path d="M20 6v6" /></>,
    achievement: <><path d="M8 4h8v5a4 4 0 0 1-8 0z" /><path d="M8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8.5 21h7M9 17h6" /></>,
    behaviour: <><circle cx="12" cy="8" r="3" /><path d="M6 21c.6-3.7 2.6-5.5 6-5.5s5.4 1.8 6 5.5M18 4l1 1 2-1" /></>,
    homework: <><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4v3M15 4v3M9 11h6M9 15h4" /></>,
    general: <><path d="M5 5h14v10H9l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
  }[name];
  return <svg className="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths}</svg>;
}

const initials = (name: string) =>
  name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

const categoryIcon = (category: string): 'academic' | 'attendance' | 'achievement' | 'behaviour' | 'homework' | 'general' =>
  category === 'homework_task'
    ? 'homework'
    : ['academic', 'attendance', 'achievement', 'behaviour', 'general'].includes(category)
      ? (category as 'academic' | 'attendance' | 'achievement' | 'behaviour' | 'general')
      : 'general';

const roleNavigation: Record<
  Role,
  { label: string; id: string; icon: 'school' | 'student' | 'updates' | 'attendance' | 'notice' }[]
> = {
  teacher: [
    { label: 'Overview', id: 'teacher-home', icon: 'school' },
    { label: 'Students', id: 'teacher-students', icon: 'student' },
    { label: 'Attendance', id: 'teacher-attendance', icon: 'attendance' },
    { label: 'School notices', id: 'teacher-notices', icon: 'notice' },
  ],
  parent: [
    { label: 'Home', id: 'parent-home', icon: 'school' },
    { label: 'Updates', id: 'parent-updates', icon: 'updates' },
    { label: 'Attendance', id: 'parent-attendance', icon: 'attendance' },
    { label: 'School notices', id: 'parent-notices', icon: 'notice' },
  ],
  principal: [
    { label: 'Overview', id: 'principal-overview', icon: 'school' },
    { label: 'Communication', id: 'principal-communication', icon: 'updates' },
    { label: 'Attendance', id: 'principal-attendance', icon: 'attendance' },
    { label: 'School notices', id: 'principal-notices', icon: 'notice' },
  ],
};

export default function Page() {
  const db = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<Profile | null>(null),
    [busy, setBusy] = useState(true),
    [error, setError] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [showPassword, setShowPassword] = useState(false),
    [signingIn, setSigningIn] = useState(false),
    [activeSection, setActiveSection] = useState('');
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
          <div className="password-field-wrap"><label>
            <span>Password</span>
            <span className="field-with-icon"><Icon name="student" /><input
              type={showPassword ? 'text' : 'password'}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            /></span>
          </label><button className="password-toggle" type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? 'Hide' : 'Show'}</button></div>
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
      <header className="application-shell">
        <div className="role-header">
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
        </div>
        <nav className="app-section-nav" aria-label={`${nice(profile.role)} workspace sections`}>
          {roleNavigation[profile.role].map((item, index) => {
            const isActive = activeSection
              ? activeSection === item.id
              : index === 0;
            return (
              <a
                key={item.id}
                className={isActive ? 'active' : ''}
                href={`#${item.id}`}
                aria-current={isActive ? 'location' : undefined}
                onClick={(event) => {
                  setActiveSection(item.id);
                  if (
                    profile.role === 'teacher' &&
                    (item.id === 'teacher-students' ||
                      item.id === 'teacher-attendance' ||
                      item.id === 'teacher-notices')
                  ) {
                    event.preventDefault();
                    window.history.replaceState(null, '', `#${item.id}`);
                    window.dispatchEvent(
                      new CustomEvent('schovera:section-navigation', {
                        detail: { id: item.id },
                      }),
                    );
                  }
                }}
              >
                <Icon name={item.icon} />
                {item.label === 'School notices' ? (
                  <>
                    <span className="nav-label-long">School notices</span>
                    <span className="nav-label-short">Notices</span>
                  </>
                ) : (
                  <span>{item.label}</span>
                )}
              </a>
            );
          })}
        </nav>
      </header>
      {profile.role !== 'parent' && (
        <section className="dashboard-hero">
          <div>
            <p className="eyebrow">{nice(profile.role)} workspace · Schovera International School</p>
            <h1>
              {profile.role === 'teacher'
                ? `Good morning, ${profile.full_name.split(' ')[0]}.`
                : `Welcome, ${profile.full_name.split(' ').slice(0, 2).join(' ')}.`}
            </h1>
          </div>
          <p className="hero-support">
            {profile.role === 'teacher'
              ? 'Send clear student updates, record attendance and follow important acknowledgements.'
              : 'Here\'s your school communication overview.'}
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
    [mode, setMode] = useState<'updates' | 'attendance' | 'notices'>('updates'),
    [date, setDate] = useState(today()),
    [records, setRecords] = useState<Record<string, Status>>({}),
    [attendanceBusy, setAttendanceBusy] = useState(false),
    [attendanceNote, setAttendanceNote] = useState(''),
    [sending, setSending] = useState(false),
    [note, setNote] = useState('');
  useEffect(() => {
    const navigateToSection = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const nextMode =
        id === 'teacher-attendance'
          ? 'attendance'
          : id === 'teacher-students'
            ? 'updates'
            : id === 'teacher-notices'
              ? 'notices'
              : null;
      if (!nextMode || !id) return;
      setMode(nextMode);
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById(id)
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      });
    };
    window.addEventListener('schovera:section-navigation', navigateToSection);
    return () =>
      window.removeEventListener(
        'schovera:section-navigation',
        navigateToSection,
      );
  }, []);
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
    <section className="teacher-workspace" id="teacher-home">
      <section className="teacher-today-card" aria-label="Today's teaching context">
        <div className="section-icon"><Icon name="school" /></div>
        <div>
          <p className="eyebrow">TODAY AT SCHOVERA</p>
          <h2>{classId ? `Grade ${classes.find((row) => row.id === classId)?.grade}${classes.find((row) => row.id === classId)?.division}` : 'Choose your class'}</h2>
          <p>{classId ? `${students.length || 'Your'} students · ${mode === 'attendance' ? 'Attendance register open' : mode === 'notices' ? 'Official school notices' : 'Ready for parent updates'}` : 'Select your assigned class to begin.'}</p>
        </div>
        <span className="today-status">{mode === 'attendance' ? 'Attendance' : mode === 'notices' ? 'School notices' : 'Student updates'}</span>
      </section>
    <section className={`two teacher-mode-${mode}`}>
      <aside className="card teacher-sidebar teacher-class-panel">
        <p className="eyebrow">YOUR CLASSROOM</p>
        <h2>Your classroom</h2>
        <p className="hint">Choose the class you are working with now.</p>
        <div className="teacher-class-status" aria-label="Current class status">
          <span><small>Class</small><b>{classId ? `Grade ${classes.find((row) => row.id === classId)?.grade}${classes.find((row) => row.id === classId)?.division}` : 'Not selected'}</b></span>
          <span><small>Students</small><b>{classId ? students.length : '—'}</b></span>
          <span><small>Selected</small><b>{student ? student.full_name : 'None'}</b></span>
        </div>
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
        {mode === 'updates' && (
          <>
            <div className="section-heading">
              <p className="eyebrow">STUDENT UPDATES</p>
              <h2>Select a student</h2>
            </div>
            {classId ? (
              <div id="teacher-students"
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
        {mode !== 'notices' && <div className="teacher-sidebar-notices"><Announcements profile={profile} /></div>}
      </aside>
      {mode === 'updates' ? (
        <div className="card teacher-task-panel">
          {student ? (
            <>
              <p className="eyebrow">PARENT UPDATE FOR</p>
              <div className="selected-student">
                <span className="student-avatar">{initials(student.full_name)}</span>
                <div><h2>{student.full_name}</h2><span>Grade {classes.find((row) => row.id === classId)?.grade}{classes.find((row) => row.id === classId)?.division} · Roll {student.roll_number}</span></div>
                <span className="selected-indicator"><Icon name="check" /> Selected</span>
              </div>
              <div className="student-snapshot" aria-label="Selected student context">
                <span><small>Attendance</small><b className={`status ${records[student.id] || 'present'}`}>{nice(records[student.id] || 'present')}</b></span>
                <span><small>Latest update</small><b>{updates[0] ? nice(updates[0].category) : 'None yet'}</b></span>
                <span><small>Last sent</small><b>{updates[0] ? new Date(updates[0].sent_at).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '—'}</b></span>
                <span><small>Important update</small><b className={updates.find((item) => item.importance === 'important' && !item.acknowledgements?.length) ? 'snapshot-awaiting' : 'snapshot-acknowledged'}>{updates.find((item) => item.importance === 'important' && !item.acknowledgements?.length) ? 'Awaiting' : 'Up to date'}</b></span>
              </div>
              <div className="teacher-form-heading">
                <div><p className="eyebrow">NEW COMMUNICATION</p><h2 className="form-title">Send an update</h2></div>
                <span>About {student.full_name.split(' ')[0]}</span>
              </div>
              <form className="teacher-update-form" onSubmit={send}>
                <label className="category-field">
                  <span><Icon name="updates" /> Category</span>
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
                <label className="check importance-control">
                  <input name="important" type="checkbox" />
                  <span><b>Important update</b><small>Ask the linked parent to acknowledge this message.</small></span>
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
      ) : mode === 'attendance' ? (
        <div id="teacher-attendance" className="teacher-attendance-panel"><AttendanceMarker
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
        /></div>
      ) : (
        <div id="teacher-notices" className="teacher-notices-panel"><Announcements profile={profile} /></div>
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
  const saved = note.startsWith('Attendance saved');
  return (
    <div className="card teacher-attendance-register">
      {!classId ? (
        <div className="attendance-empty-state">
          <span className="section-icon"><Icon name="attendance" /></span>
          <h2>Select a class to begin</h2>
          <p>Choose one of your assigned classes to open its daily register.</p>
        </div>
      ) : (
        <>
          <header className="attendance-register-header">
            <div>
              <p className="eyebrow">DAILY ATTENDANCE</p>
              <h2>Attendance register</h2>
              <p>{classLabel ? `Grade ${classLabel.grade}${classLabel.division}` : 'Selected class'} · {students.length} students</p>
            </div>
            <label className="attendance-date-field">
              <span>Date</span>
              <input
                type="date"
                max={today()}
                value={date}
                onChange={(e) => onDate(e.target.value)}
              />
            </label>
          </header>
          <div className="attendance-register-guidance">
            <span className="section-icon"><Icon name="check" /></span>
            <p>Everyone starts as Present. Change only Absent or Late students.</p>
            <span className={saved ? 'attendance-state saved' : 'attendance-state pending'}>{saved ? <><Icon name="check" /> Saved</> : <>Ready to mark</>}</span>
          </div>
          <div className="attendance-counts attendance-live-summary" aria-label="Live attendance summary" aria-live="polite">
            <span className="attendance-total"><b>{students.length}</b>Total</span>
            <span className="attendance-present"><b>{counts.present}</b>Present</span>
            <span className="attendance-absent"><b>{counts.absent}</b>Absent</span>
            <span className="attendance-late"><b>{counts.late}</b>Late</span>
          </div>
          {busy ? (
            <Skeleton label="Loading attendance" rows={4} />
          ) : (
            <div className="roster">
              <div className="attendance-roster-heading" aria-hidden="true"><span>Student</span><span>Status</span></div>
              {students.map((student: any) => (
                <div className={`roster-row attendance-row ${records[student.id] || 'present'}`} key={student.id}>
                  <span className="attendance-student-identity">
                    <i aria-hidden="true">{initials(student.full_name)}</i>
                    <span><b>{student.full_name}</b><small>Roll {student.roll_number}</small></span>
                  </span>
                  <span className="attendance-segments" role="group" aria-label={`Attendance status for ${student.full_name}`}>
                    {(['present', 'absent', 'late'] as Status[]).map((status) => <button type="button" key={status} className={`attendance-choice ${status} ${(records[student.id] || 'present') === status ? 'selected' : ''}`} aria-pressed={(records[student.id] || 'present') === status} onClick={() => onStatus(student.id, status)}>{status === 'present' ? <Icon name="check" /> : status === 'absent' ? <Icon name="important" /> : <Icon name="attendance" />}{nice(status)}</button>)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="attendance-save-area">
            <div><b>{counts.present} Present · {counts.absent} Absent · {counts.late} Late</b><span>{saved ? 'Attendance is saved for this date.' : 'Review exceptions, then save the register.'}</span></div>
            <button disabled={busy || !students.length} onClick={onSave}>
              {busy ? 'Saving attendance…' : saved ? 'Save changes' : 'Save attendance'}
            </button>
          </div>
          {note && (
            <p className={note.startsWith('Could') ? 'error' : 'success'}>
              {note}
            </p>
          )}
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
    <section className="parent-dashboard" id="parent-home">
      <div className="parent-top-grid">
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
          <Card update={awaitingAcknowledgement[0]} parent={profile.id} childContext={`${child?.full_name || 'Your child'} • ${className}`} acknowledging={acknowledgingId === awaitingAcknowledgement[0].id} acknowledge={acknowledgeUpdate} />
        ) : (
          <p className="attention-copy">No important updates need your attention right now.</p>
        )}
      </section>
      </div>
      <section className="right-now" aria-labelledby="right-now-heading">
        <div className="section-heading"><p className="eyebrow">RIGHT NOW</p><h2 id="right-now-heading">At a glance</h2></div>
        <div className="right-now-grid">
          <div><Icon name="attendance" /><span>Attendance<b>{attendance[0] ? nice(attendance[0].status) : 'Not marked'}</b></span></div>
          <div><Icon name="important" /><span>Important<b>{awaitingAcknowledgement.length ? `${awaitingAcknowledgement.length} to read` : 'All caught up'}</b></span></div>
          <div><Icon name="updates" /><span>Latest update<b>{updates[0] ? nice(updates[0].category) : 'No updates'}</b></span></div>
        </div>
      </section>
      <div id="parent-attendance"><AttendanceSummary
        attendance={attendance}
        counts={counts}
        error={attendanceError}
      /></div>
      <div id="parent-notices"><Announcements profile={profile} parentView /></div>
      <section className="parent-updates" id="parent-updates" aria-labelledby="child-updates-heading">
        <div className="section-heading">
          <p className="eyebrow">CHILD-SPECIFIC UPDATES</p>
          <h2 id="child-updates-heading">Recent updates</h2>
          <p className="hint">Recent communication from your child&apos;s teacher.</p>
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
          childContext={`${child?.full_name || 'Your child'} • ${className}`}
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
      <div className={`attendance-latest ${attendance[0].status}`}>
        <span className="attendance-latest-icon" aria-hidden="true"><Icon name={attendance[0].status === 'present' ? 'check' : attendance[0].status === 'absent' ? 'important' : 'attendance'} /></span>
        <div><span>Latest attendance</span><b>{nice(attendance[0].status)}</b><time dateTime={attendance[0].attendance_date}>{new Date(`${attendance[0].attendance_date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time></div>
      </div>
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
          <div className={`attendance-history-row ${row.status}`} key={row.id}>
            <time dateTime={row.attendance_date}>{new Date(`${row.attendance_date}T00:00:00`).toLocaleDateString()}</time>
            <span><Icon name={row.status === 'present' ? 'check' : row.status === 'absent' ? 'important' : 'attendance'} />{nice(row.status)}</span>
          </div>
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
    awaiting = important.length - acknowledged.length,
    communicationCoverage = important.length
      ? Math.round((acknowledged.length / important.length) * 100)
      : null,
    attendanceCounts = todayAttendance.reduce(
      (total, row) => ({ ...total, [row.status]: total[row.status] + 1 }),
      { present: 0, absent: 0, late: 0 } as Record<Status, number>,
    ),
    markedClassIds = new Set(todayAttendance.map((row) => row.class_id));
  return (
    <section className="principal-dashboard" id="principal-overview">
      <section
        className="principal-communication-overview"
        id="principal-communication"
        aria-labelledby="communication-overview-heading"
      >
        <div className="principal-overview-heading">
          <span className="section-icon" aria-hidden="true"><Icon name="updates" /></span>
          <div>
            <p className="eyebrow">COMMUNICATION HEALTH</p>
            <h2 id="communication-overview-heading">School-to-home communication</h2>
          </div>
          {communicationCoverage !== null && (
            <p className="communication-coverage" aria-label={`${communicationCoverage}% of important updates have been acknowledged`}>
              <b>{communicationCoverage}%</b><span>acknowledged</span>
            </p>
          )}
        </div>
        <div className="principal-metrics" aria-label="Important school-to-home communication metrics">
          <article className="principal-metric-card metric-important">
            <span className="metric-icon" aria-hidden="true"><Icon name="important" /></span>
            <small>Important sent</small>
            <b>{important.length}</b>
            <p>Updates requiring a parent response</p>
          </article>
          <article className="principal-metric-card metric-acknowledged">
            <span className="metric-icon" aria-hidden="true"><Icon name="check" /></span>
            <small>Acknowledged</small>
            <b>{acknowledged.length}</b>
            <p>Confirmed by a parent</p>
          </article>
          <article className="principal-metric-card metric-awaiting">
            <span className="metric-icon" aria-hidden="true"><Icon name="updates" /></span>
            <small>Awaiting</small>
            <b>{awaiting}</b>
            <p>Still awaiting acknowledgement</p>
          </article>
        </div>
      </section>
      <div className="principal-main-grid">
        <div className="principal-primary-column">
      <div className="card attendance-overview" id="principal-attendance">
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
      <div className="card principal-recent-communication">
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
        </div>
        <aside className="principal-support-column" id="principal-notices" aria-label="School notices">
          <Announcements profile={profile} publish />
        </aside>
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
    <section className={`card announcements ${publish ? 'announcements-publish' : ''}`} aria-labelledby={publish ? 'notice-publish-heading' : 'school-notices-heading'}>
      <div className="notice-section-heading">
        <span className="notice-section-icon" aria-hidden="true"><Icon name="notice" /></span>
        <div>
          <p className="eyebrow">{publish ? 'CREATE NOTICE' : 'SCHOOL NOTICES'}</p>
          <h2 id={publish ? 'notice-publish-heading' : 'school-notices-heading'}>{publish ? 'Publish a school notice' : 'Official updates from your school'}</h2>
        </div>
      </div>
      {parentView && (
        <p className="hint">
          These are school-wide notices. They are separate from updates about
          your child.
        </p>
      )}
      {publish && (
        <form className="notice-composer" onSubmit={submit}>
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
              ? 'error notice-feedback'
              : 'success notice-feedback'
          }
          role={note.startsWith('Could') || note.includes('loaded') ? 'alert' : 'status'}
        >
          {!note.startsWith('Could') && !note.includes('loaded') && <Icon name="check" />}
          {note}
        </p>
      )}
      {publish && !loading && <div className="published-notices-heading"><span>RECENT SCHOOL NOTICES</span><p>Official messages already shared with your school community.</p></div>}
      {loading ? (
        <NoticeSkeleton />
      ) : announcements.length ? (
        <div className="announcement-list">
          {announcements.map((announcement) => (
            <article className={`school-notice-card ${announcement.priority === 'important' ? 'important-notice' : ''}`} key={announcement.id}>
              <header>
                <span className="notice-card-icon" aria-hidden="true"><Icon name="school" /></span>
                <span className="notice-origin">School-wide notice</span>
                {announcement.priority === 'important' && <span className="notice-important"><Icon name="important" /> Important</span>}
              </header>
              <h3>{announcement.title}</h3>
              <p>{announcement.body}</p>
              <footer>
                <Icon name="school" />
                <span>Schovera International School</span>
                <span aria-hidden="true">•</span>
                <time dateTime={announcement.published_at}>Published {displayDate(announcement.published_at)}</time>
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="notice-empty-state">
          <span className="notice-card-icon" aria-hidden="true"><Icon name="notice" /></span>
          <div><h3>{publish ? 'No notices published yet' : 'No school notices yet'}</h3><p>{publish ? 'Publish the first school notice above.' : 'New school-wide announcements will appear here.'}</p></div>
        </div>
      )}
    </section>
  );
}

function NoticeSkeleton() {
  return (
    <div className="notice-skeleton" aria-label="Loading school notices" role="status">
      <span className="notice-skeleton-icon" />
      <div><span className="notice-skeleton-title" /><span className="notice-skeleton-line" /><span className="notice-skeleton-line short" /><span className="notice-skeleton-meta" /></div>
    </div>
  );
}

function Card({
  update,
  teacher,
  parent,
  childContext,
  acknowledging = false,
  acknowledge,
}: {
  update: Update;
  teacher?: boolean;
  parent?: string;
  childContext?: string;
  acknowledging?: boolean;
  acknowledge?: (id: string) => void;
}) {
  const mine = update.acknowledgements?.find(
    (acknowledgement) => acknowledgement.parent_id === parent,
  );
  const acknowledged = Boolean(mine || (!parent && update.acknowledgements?.length));
  return (
    <article
      className={
        update.importance === 'important'
          ? `update-card important-update${teacher ? ' teacher-update-card' : ''}${parent ? ' parent-update-card' : ''}${parent && acknowledged ? ' acknowledged-update' : ''}`
          : `update-card${teacher ? ' teacher-update-card' : ''}${parent ? ' parent-update-card' : ''}${parent && acknowledged ? ' acknowledged-update' : ''}`
      }
    >
      <div className="card-topline"><span className="update-icon" aria-hidden="true"><Icon name={teacher || parent ? categoryIcon(update.category) : 'updates'} /></span><span className="badge">{nice(update.category)}</span>
      {update.importance === 'important' && (
        <span className="important">Important</span>
      )}</div>
      <h3>{update.title}</h3>
      {parent && childContext && <p className="parent-update-context"><Icon name="student" /> About {childContext}</p>}
      <p>{update.message}</p>
      <small className={teacher ? 'teacher-update-meta' : undefined}>
        {update.profiles?.full_name && `${update.profiles.full_name} · `}
        {update.students?.full_name && `${update.students.full_name} · `}
        {displayDate(update.sent_at)}
      </small>
      {parent && (
        <footer className="parent-update-meta">
          {update.profiles?.full_name && <span>From {update.profiles.full_name}</span>}
          <time dateTime={update.sent_at}>{displayDate(update.sent_at)}</time>
        </footer>
      )}
      {update.importance === 'important' && (
        <div className={`ack${teacher ? ' teacher-ack' : ''}`}>
          {acknowledged ? (
            parent ? (
              <span className="parent-acknowledged" role="status"><Icon name="check" /><span><b>Acknowledged</b>{mine && <small>{displayDate(mine.acknowledged_at)}</small>}</span></span>
            ) : <b className="status present">{teacher && <Icon name="check" />}Acknowledged</b>
          ) : teacher ? (
            <span className="status pending"><Icon name="important" /> Awaiting acknowledgement</span>
          ) : (
            <>
              <span className="ack-copy">Acknowledgement requested</span>
              <button
                disabled={acknowledging}
                aria-busy={acknowledging}
                aria-label={`Acknowledge update: ${update.title}`}
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
