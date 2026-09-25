'use client';
/* eslint-disable @typescript-eslint/no-explicit-any, react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Role = 'teacher' | 'parent' | 'principal';
type Status = 'present' | 'absent' | 'late';
type Profile = { id: string; school_id: string; role: Role; full_name: string };
type Update = {
  id: string;
  student_id: string;
  corrects_update_id?: string | null;
  category: string;
  title: string;
  message: string;
  importance: 'normal' | 'important';
  sent_at: string;
  acknowledgements?: { acknowledged_at: string; parent_id: string }[];
  students?: {
    full_name: string;
    roll_number?: string;
    classes?: { grade: string; division: string };
  };
  profiles?: { full_name: string };
};
type PendingTeacherSend = {
  requestId: string;
  classId: string;
  studentId: string;
  category: string;
  importance: 'normal' | 'important';
  title: string;
  message: string;
};
type Attendance = {
  id: string;
  class_id: string;
  student_id: string;
  attendance_date: string;
  status: Status;
  students?: any;
};
type Assignment = {
  id: string; class_id: string; subject: string; title: string; description: string;
  due_date: string; created_at: string;
  classes?: { grade: string; division: string }; profiles?: { full_name: string };
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

const normalizeCommunicationValue = (value: string) =>
  value.replace(/^[ \t\n\r]+|[ \t\n\r]+$/g, '');
const dueLabel = (dueDate: string) => {
  const delta = Math.round((new Date(`${dueDate}T00:00:00`).getTime() - new Date(`${today()}T00:00:00`).getTime()) / 86400000);
  if (delta === 0) return 'Due today';
  if (delta === 1) return 'Due tomorrow';
  if (delta > 1 && delta <= 7) return `Due in ${delta} days`;
  if (delta < 0) return 'Earlier homework';
  return `Due ${new Date(`${dueDate}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
};

const correctedUpdateIds = (updates: Update[]) =>
  new Set(
    updates
      .map((update) => update.corrects_update_id)
      .filter((id): id is string => Boolean(id)),
  );

const effectiveUpdates = (updates: Update[]) => {
  const corrected = correctedUpdateIds(updates);
  return updates.filter((update) => !corrected.has(update.id));
};

function Icon({ name }: { name: 'school' | 'student' | 'updates' | 'attendance' | 'notice' | 'important' | 'check' | 'search' | 'academic' | 'achievement' | 'behaviour' | 'homework' | 'general' }) {
  const paths = {
    school: <><path d="M3 10.5 12 5l9 5.5v8.5H3z" /><path d="M7 21v-6h10v6M9 12h.01M12 12h.01M15 12h.01" /></>,
    student: <><circle cx="12" cy="8" r="3.25" /><path d="M5.5 21c.7-3.65 2.85-5.5 6.5-5.5s5.8 1.85 6.5 5.5" /></>,
    updates: <><path d="M5 5h14v10H9l-4 4z" /><path d="M8 9h8M8 12h5" /></>,
    attendance: <><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M8 3v4M16 3v4M7.5 12l2.2 2.2 5-5" /></>,
    notice: <><path d="M6 5h12v14H6z" /><path d="M9 9h6M9 12h6M9 15h4" /></>,
    important: <><path d="M12 3 21 20H3z" /><path d="M12 9v4M12 17h.01" /></>,
    check: <path d="m5 12 4.2 4.2L19 6.5" />,
    search: <><circle cx="10.75" cy="10.75" r="6.25" /><path d="m16 16 4.25 4.25" /></>,
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
  { label: string; id: string; icon: 'school' | 'student' | 'updates' | 'attendance' | 'notice' | 'homework' }[]
> = {
  teacher: [
    { label: 'Overview', id: 'teacher-home', icon: 'school' },
    { label: 'Students', id: 'teacher-students', icon: 'student' },
    { label: 'Profile', id: 'teacher-profile', icon: 'student' },
    { label: 'Attendance', id: 'teacher-attendance', icon: 'attendance' },
    { label: 'Homework', id: 'teacher-homework', icon: 'homework' },
    { label: 'School notices', id: 'teacher-notices', icon: 'notice' },
  ],
  parent: [
    { label: 'Home', id: 'parent-home', icon: 'school' },
    { label: 'Profile', id: 'parent-profile', icon: 'student' },
    { label: 'Updates', id: 'parent-updates', icon: 'updates' },
    { label: 'Attendance', id: 'parent-attendance', icon: 'attendance' },
    { label: 'Homework', id: 'parent-homework', icon: 'homework' },
    { label: 'School notices', id: 'parent-notices', icon: 'notice' },
  ],
  principal: [
    { label: 'Overview', id: 'principal-overview', icon: 'school' },
    { label: 'Students', id: 'principal-students', icon: 'student' },
    { label: 'Communication', id: 'principal-communication', icon: 'updates' },
    { label: 'Attendance', id: 'principal-attendance', icon: 'attendance' },
    { label: 'Homework', id: 'principal-homework', icon: 'homework' },
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
                      item.id === 'teacher-homework' ||
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
  const activeClassIdRef = useRef('');
  const classRequestVersionRef = useRef(0);
  const activeStudentIdRef = useRef('');
  const studentRequestVersionRef = useRef(0);
  const activeAttendanceContextRef = useRef('');
  const attendanceRequestVersionRef = useRef(0);
  const [classes, setClasses] = useState<any[]>([]),
    [students, setStudents] = useState<any[]>([]),
    [classId, setClassId] = useState(''),
    [student, setStudent] = useState<any>(null),
    [studentSearch, setStudentSearch] = useState(''),
    [updates, setUpdates] = useState<Update[]>([]),
    [classLoading, setClassLoading] = useState(false),
    [updatesLoading, setUpdatesLoading] = useState(false),
    [updatesError, setUpdatesError] = useState(''),
    [mode, setMode] = useState<'updates' | 'attendance' | 'homework' | 'notices' | 'profile'>('updates'),
    [date, setDate] = useState(today()),
    [records, setRecords] = useState<Record<string, Status>>({}),
    [attendanceLoading, setAttendanceLoading] = useState(false),
    [attendanceSaving, setAttendanceSaving] = useState(false),
    [attendanceNote, setAttendanceNote] = useState(''),
    [sending, setSending] = useState(false),
    [correctionTarget, setCorrectionTarget] = useState<Update | null>(null),
    [pendingSend, setPendingSend] = useState<PendingTeacherSend | null>(null),
    [note, setNote] = useState('');
  const pendingSendStorageKey = `schovera:pending-teacher-update:${profile.id}`;
  const clearPendingSend = () => {
    sessionStorage.removeItem(pendingSendStorageKey);
    setPendingSend(null);
  };
  const persistPendingSend = (pending: PendingTeacherSend) => {
    sessionStorage.setItem(pendingSendStorageKey, JSON.stringify(pending));
    setPendingSend(pending);
  };
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem(pendingSendStorageKey);
      if (!stored) return;
      const candidate = JSON.parse(stored) as PendingTeacherSend;
      if (
        typeof candidate.requestId === 'string' &&
        typeof candidate.classId === 'string' &&
        typeof candidate.studentId === 'string' &&
        typeof candidate.category === 'string' &&
        (candidate.importance === 'normal' || candidate.importance === 'important') &&
        typeof candidate.title === 'string' &&
        typeof candidate.message === 'string'
      ) setPendingSend(candidate);
    } catch {
      sessionStorage.removeItem(pendingSendStorageKey);
    }
  }, [pendingSendStorageKey]);
  useEffect(() => {
    const navigateToSection = (event: Event) => {
      const id = (event as CustomEvent<{ id?: string }>).detail?.id;
      const nextMode =
        id === 'teacher-attendance'
          ? 'attendance'
          : id === 'teacher-students'
            ? 'updates'
            : id === 'teacher-profile'
              ? 'profile'
            : id === 'teacher-homework'
              ? 'homework'
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
    if (!pendingSend || classId || !classes.some((row) => row.id === pendingSend.classId)) return;
    setClassId(pendingSend.classId);
  }, [classes, classId, pendingSend]);
  useEffect(() => {
    if (!pendingSend || classId !== pendingSend.classId || student || !students.length) return;
    const pendingStudent = students.find((row) => row.id === pendingSend.studentId);
    if (pendingStudent) setStudent(pendingStudent);
  }, [classId, pendingSend, student, students]);
  useEffect(() => {
    activeClassIdRef.current = classId;
    const requestVersion = classRequestVersionRef.current + 1;
    classRequestVersionRef.current = requestVersion;
    activeStudentIdRef.current = '';
    studentRequestVersionRef.current += 1;
    setStudents([]);
    setStudent(null);
    setUpdates([]);
    setUpdatesError('');
    setCorrectionTarget(null);
    setRecords({});
    setAttendanceNote('');
    setNote('');
    if (!classId) {
      setClassLoading(false);
      return;
    }
    setClassLoading(true);
    db.from('students')
      .select('*')
      .eq('class_id', classId)
      .eq('active', true)
      .order('full_name')
      .then(({ data }) => {
        if (
          classId === activeClassIdRef.current &&
          requestVersion === classRequestVersionRef.current
        ) {
          setStudents(data || []);
          setClassLoading(false);
        }
      });
  }, [db, classId]);
  const refreshUpdates = async (
    targetStudentId = activeStudentIdRef.current,
    requestVersion = studentRequestVersionRef.current,
  ) => {
    if (!targetStudentId) return;
    const { data, error } = await db
      .from('student_updates')
      .select('*,acknowledgements(acknowledged_at,parent_id)')
      .eq('student_id', targetStudentId)
      .order('sent_at', { ascending: false });
    if (
      targetStudentId === activeStudentIdRef.current &&
      requestVersion === studentRequestVersionRef.current
    ) {
      setUpdates(data || []);
      setUpdatesError(error ? 'Could not load recent communication.' : '');
      setUpdatesLoading(false);
    }
  };
  useEffect(() => {
    const targetStudentId = student?.id || '';
    activeStudentIdRef.current = targetStudentId;
    const requestVersion = studentRequestVersionRef.current + 1;
    studentRequestVersionRef.current = requestVersion;
    setUpdates([]);
    setUpdatesError('');
    setCorrectionTarget(null);
    setNote('');
    if (!targetStudentId) {
      setUpdatesLoading(false);
      return;
    }
    setUpdatesLoading(true);
    refreshUpdates(targetStudentId, requestVersion);
  }, [student?.id]);
  const loadAttendance = async (
    targetClassId: string,
    targetDate: string,
    roster: any[],
    requestVersion: number,
  ) => {
    if (!targetClassId || !roster.length) return;
    const { data, error } = await db
      .from('attendance_records')
      .select('student_id,status')
      .eq('class_id', targetClassId)
      .eq('attendance_date', targetDate);
    const context = `${targetClassId}:${targetDate}`;
    if (
      context !== activeAttendanceContextRef.current ||
      requestVersion !== attendanceRequestVersionRef.current
    )
      return;
    if (error) {
      setAttendanceNote('Could not load attendance. Try again.');
      setAttendanceLoading(false);
      return;
    }
    const existing = Object.fromEntries(
      (data || []).map((row: any) => [row.student_id, row.status as Status]),
    );
    setRecords(
      Object.fromEntries(
        roster.map((row) => [row.id, existing[row.id] || 'present']),
      ),
    );
    setAttendanceLoading(false);
  };
  useEffect(() => {
    if (mode !== 'attendance') return;
    const context = `${classId}:${date}`;
    activeAttendanceContextRef.current = context;
    const requestVersion = attendanceRequestVersionRef.current + 1;
    attendanceRequestVersionRef.current = requestVersion;
    setRecords({});
    setAttendanceNote('');
    if (
      !classId ||
      classLoading ||
      !students.length ||
      students.some((row) => row.class_id !== classId)
    ) {
      setAttendanceLoading(classLoading);
      return;
    }
    setAttendanceLoading(true);
    loadAttendance(classId, date, students, requestVersion);
  }, [mode, classId, date, students, classLoading]);
  useEffect(() => {
    const channel = db
      .channel('teacher-acks')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'acknowledgements' },
        () => refreshUpdates(),
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [db, student]);
  const send = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!student || sending) return;
    const targetStudentId = student.id;
    const targetClassId = classId;
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const title = normalizeCommunicationValue(String(form.get('title') || ''));
    const message = normalizeCommunicationValue(String(form.get('message') || ''));
    const category = String(form.get('category') || '');
    const importance: 'normal' | 'important' = form.get('important') ? 'important' : 'normal';
    setNote('');
    if (!title || !message) {
      setNote('Please add a title and message before sending.');
      return;
    }
    const matchingPending = pendingSend &&
      pendingSend.classId === targetClassId &&
      pendingSend.studentId === targetStudentId &&
      pendingSend.category === category &&
      pendingSend.importance === importance &&
      pendingSend.title === title &&
      pendingSend.message === message;
    if (pendingSend && !matchingPending) {
      setNote('This pending send differs from the saved update. Discard it before sending changed information.');
      return;
    }
    if (!matchingPending && !globalThis.crypto?.randomUUID) {
      setNote('This browser cannot safely prepare a new update.');
      return;
    }
    const pending: PendingTeacherSend = matchingPending
      ? pendingSend
      : {
          requestId: globalThis.crypto.randomUUID(),
          classId: targetClassId,
          studentId: targetStudentId,
          category,
          importance,
          title,
          message,
        };
    const retrying = Boolean(matchingPending);
    persistPendingSend(pending);
    setSending(true);
    const { error } = await db.rpc('send_student_update', {
      p_class_id: targetClassId,
      p_student_id: targetStudentId,
      p_category: category,
      p_title: title,
      p_message: message,
      p_importance: importance,
      p_client_request_id: pending.requestId,
    });
    setSending(false);
    const contextIsCurrent =
      targetClassId === activeClassIdRef.current &&
      targetStudentId === activeStudentIdRef.current;
    if (error && contextIsCurrent) {
      const messageText = error.message.toLowerCase();
      if (messageText.includes('idempotency conflict'))
        setNote('This pending send differs from the saved update. Discard it before sending changed information.');
      else if (messageText.includes('not authorized')) {
        clearPendingSend();
        setNote('You are no longer permitted to send this update.');
      } else if (messageText.includes('invalid'))
        setNote('Could not send update. Check the information and try again.');
      else
        setNote('We could not confirm delivery. Retry sending safely.');
    }
    else if (!error && contextIsCurrent) {
      clearPendingSend();
      formElement.reset();
      setNote(retrying ? 'Your earlier update was already sent. No duplicate was created.' : 'Update sent and saved.');
      refreshUpdates(targetStudentId, studentRequestVersionRef.current);
    }
  };
  const sendCorrection = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!correctionTarget || sending) return;
    const formElement = e.currentTarget;
    const form = new FormData(formElement);
    const title = String(form.get('title') || '').trim();
    const message = String(form.get('message') || '').trim();
    setNote('');
    if (!title || !message) {
      setNote('Please add a corrected title and message.');
      return;
    }
    setSending(true);
    const { error } = await db.rpc('send_student_update_correction', {
      p_original_update_id: correctionTarget.id,
      p_title: title,
      p_message: message,
    });
    setSending(false);
    if (error) {
      setNote('Could not send correction. The update may already have been corrected.');
      return;
    }
    setCorrectionTarget(null);
    setNote('Correction sent and saved. The original remains in the history.');
    refreshUpdates(student?.id, studentRequestVersionRef.current);
  };
  const saveAttendance = async () => {
    if (!classId || !students.length) return;
    const targetContext = `${classId}:${date}`;
    setAttendanceSaving(true);
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
    setAttendanceSaving(false);
    if (targetContext === activeAttendanceContextRef.current)
      setAttendanceNote(
        error
          ? 'Could not save attendance. Check the roster and try again.'
          : `Attendance saved for ${new Date(`${date}T00:00:00`).toLocaleDateString()}.`,
      );
  };
  const attendanceBusy = attendanceLoading || attendanceSaving;
  const counts = students.reduce(
    (total, row) => ({
      ...total,
      [records[row.id] || 'present']: total[records[row.id] || 'present'] + 1,
    }),
    { present: 0, absent: 0, late: 0 } as Record<Status, number>,
  );
  const normalizedStudentSearch = studentSearch.trim().toLocaleLowerCase();
  const filteredStudents = normalizedStudentSearch
    ? students.filter((row) =>
        row.full_name.toLocaleLowerCase().includes(normalizedStudentSearch) ||
        String(row.roll_number || '')
          .toLocaleLowerCase()
          .includes(normalizedStudentSearch),
      )
    : students;
  const teacherCorrectedIds = correctedUpdateIds(updates);
  const pendingForSelectedStudent = pendingSend &&
    pendingSend.classId === classId &&
    pendingSend.studentId === student?.id
    ? pendingSend
    : null;
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
                activeClassIdRef.current = row.id;
                classRequestVersionRef.current += 1;
                activeStudentIdRef.current = '';
                studentRequestVersionRef.current += 1;
                activeAttendanceContextRef.current = '';
                attendanceRequestVersionRef.current += 1;
                setClassId(row.id);
                setStudents([]);
                setStudent(null);
                setStudentSearch('');
                setUpdates([]);
                setUpdatesError('');
                setCorrectionTarget(null);
                setRecords({});
                setAttendanceNote('');
                setNote('');
              }}
            >{`Grade ${row.grade}${row.division}`}</button>
          ))}
        </div>
        {(mode === 'updates' || mode === 'profile') && (
          <>
            <div className="section-heading">
              <p className="eyebrow">STUDENT UPDATES</p>
              <h2>Select a student</h2>
            </div>
            {classId ? (
              <div className="teacher-roster-search-area">
                <label className="teacher-roster-search">
                  <span className="sr-only">Search students</span>
                  <Icon name="search" />
                  <input
                    type="search"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                    placeholder="Search by name or roll number"
                    aria-describedby="teacher-roster-search-count"
                  />
                  {studentSearch && (
                    <button
                      type="button"
                      className="teacher-roster-search-clear"
                      onClick={() => setStudentSearch('')}
                      aria-label="Clear student search"
                    >
                      Clear
                    </button>
                  )}
                </label>
                <p id="teacher-roster-search-count" className="teacher-roster-search-count" aria-live="polite">
                  {normalizedStudentSearch
                    ? `${filteredStudents.length} of ${students.length} students`
                    : `${students.length} students`}
                </p>
              <div id="teacher-students"
                className="student-list"
                aria-label="Students in selected class"
              >
                {classLoading ? (
                  <Skeleton label="Loading students" rows={4} />
                ) : filteredStudents.map((row) => (
                  <button
                    className={
                      student?.id === row.id ? 'student active' : 'student'
                    }
                    key={row.id}
                    type="button"
                    aria-pressed={student?.id === row.id}
                    onClick={() => {
                      activeStudentIdRef.current = row.id;
                      studentRequestVersionRef.current += 1;
                      setStudent(row);
                      setUpdates([]);
                      setUpdatesError('');
                      setCorrectionTarget(null);
                      setNote('');
                    }}
                  >
                    <span className="student-name"><i>{initials(row.full_name)}</i><span>{row.full_name}<small>Grade {classes.find((item) => item.id === classId)?.grade}{classes.find((item) => item.id === classId)?.division} · Roll {row.roll_number}</small></span></span>
                    <span className="student-chevron" aria-hidden="true">›</span>
                  </button>
                ))}
                {normalizedStudentSearch && !filteredStudents.length && (
                  <div className="teacher-roster-no-results" role="status">
                    <span className="section-icon" aria-hidden="true"><Icon name="search" /></span>
                    <div><b>No students found</b><p>Try another name or roll number.</p></div>
                    <button type="button" onClick={() => setStudentSearch('')}>Clear search</button>
                  </div>
                )}
              </div>
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
          {pendingSend && !pendingForSelectedStudent && !correctionTarget && (
            <div className="pending-send-recovery pending-send-other" role="status">
              <span className="update-icon" aria-hidden="true"><Icon name="updates" /></span>
              <span><b>An earlier send still needs confirmation</b><small>Return to its student to retry it safely, or discard it before creating changed information.</small></span>
              <button type="button" className="link" onClick={() => { clearPendingSend(); setNote('Pending send discarded. You can create a new update.'); }}>Discard</button>
            </div>
          )}
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
                <span><small>Important update</small><b className={effectiveUpdates(updates).find((item) => item.importance === 'important' && !item.acknowledgements?.length) ? 'snapshot-awaiting' : 'snapshot-acknowledged'}>{effectiveUpdates(updates).find((item) => item.importance === 'important' && !item.acknowledgements?.length) ? 'Awaiting' : 'Up to date'}</b></span>
              </div>
              <button type="button" className="profile-link" onClick={() => setMode('profile')}>View student profile</button>
              <div className="teacher-form-heading">
                <div><p className="eyebrow">{correctionTarget ? 'CORRECTING SENT COMMUNICATION' : 'NEW COMMUNICATION'}</p><h2 className="form-title">{correctionTarget ? 'Send a correction' : 'Send an update'}</h2></div>
                <span>About {student.full_name.split(' ')[0]}</span>
              </div>
              {correctionTarget && (
                <div className="correction-context" role="status">
                  <span className="update-icon" aria-hidden="true"><Icon name="updates" /></span>
                  <span><b>Correcting: {correctionTarget.title}</b><small>The original stays in the family history. Category and importance are preserved.</small></span>
                  <button type="button" className="link" onClick={() => setCorrectionTarget(null)}>Cancel</button>
                </div>
              )}
              {pendingForSelectedStudent && !correctionTarget && (
                <div className="pending-send-recovery" role="status">
                  <span className="update-icon" aria-hidden="true"><Icon name="updates" /></span>
                  <span><b>We could not confirm delivery</b><small>Retrying uses the same send action, so no duplicate can be created.</small></span>
                  <button type="button" onClick={() => (document.getElementById('teacher-update-form') as HTMLFormElement | null)?.requestSubmit()}>Retry sending</button>
                  <button type="button" className="link" onClick={() => { clearPendingSend(); setNote('Pending send discarded. You can create a new update.'); }}>Discard</button>
                </div>
              )}
              <form id="teacher-update-form" className="teacher-update-form" onSubmit={correctionTarget ? sendCorrection : send}>
                {!correctionTarget && <label className="category-field">
                  <span><Icon name="updates" /> Category</span>
                  <select key={`category-${pendingForSelectedStudent?.requestId || 'new'}`} name="category" defaultValue={pendingForSelectedStudent?.category || 'academic'}>
                    {categories.map((category) => (
                      <option key={category} value={category}>
                        {nice(category)}
                      </option>
                    ))}
                  </select>
                </label>}
                <label>
                  Title
                  <input
                    name="title"
                    required
                    minLength={3}
                    maxLength={120}
                    key={`title-${correctionTarget?.id || pendingForSelectedStudent?.requestId || 'new'}`}
                    defaultValue={correctionTarget?.title || pendingForSelectedStudent?.title || ''}
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
                    key={`message-${correctionTarget?.id || pendingForSelectedStudent?.requestId || 'new'}`}
                    defaultValue={correctionTarget?.message || pendingForSelectedStudent?.message || ''}
                    placeholder="Write a short, kind, specific update…"
                  />
                </label>
                {!correctionTarget && <label className="check importance-control">
                  <input key={`important-${pendingForSelectedStudent?.requestId || 'new'}`} name="important" type="checkbox" defaultChecked={pendingForSelectedStudent?.importance === 'important'} />
                  <span><b>Important update</b><small>Ask the linked parent to acknowledge this message.</small></span>
                </label>}
                <button disabled={sending}>
                  {sending ? 'Sending…' : correctionTarget ? 'Send correction to parent' : 'Send update to parent'}
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
              {updatesLoading ? (
                <Skeleton label="Loading recent communication" rows={3} />
              ) : updatesError ? (
                <p className="error" role="alert">{updatesError}</p>
              ) : updates.length ? (
                updates.map((update) => (
                  <Card key={update.id} update={update} teacher corrected={teacherCorrectedIds.has(update.id)} correctionOf={update.corrects_update_id ? updates.find((item) => item.id === update.corrects_update_id)?.title : undefined} onCorrect={teacherCorrectedIds.has(update.id) ? undefined : setCorrectionTarget} />
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
      ) : mode === 'profile' ? (
        <div className="teacher-profile-panel"><StudentOverview student={student} classLabel={classes.find((row) => row.id === classId)} role="teacher" /></div>
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
          onDate={(nextDate: string) => {
            activeAttendanceContextRef.current = '';
            attendanceRequestVersionRef.current += 1;
            setDate(nextDate);
            setRecords({});
            setAttendanceNote('');
          }}
          onStatus={(studentId: string, status: Status) =>
            setRecords({ ...records, [studentId]: status })
          }
          onSave={saveAttendance}
        /></div>
      ) : mode === 'homework' ? (
        <div id="teacher-homework"><TeacherAssignments profile={profile} classId={classId} classLabel={classes.find((row) => row.id === classId)} studentsCount={students.length} /></div>
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

function AssignmentCard({ assignment, showClass = false }: { assignment: Assignment; showClass?: boolean }) {
  const className = assignment.classes ? `Grade ${assignment.classes.grade}${assignment.classes.division}` : '';
  return <article className={`assignment-card${assignment.due_date < today() ? ' assignment-past' : ''}`}>
    <header><span className="assignment-icon" aria-hidden="true"><Icon name="homework" /></span><div><p>{assignment.subject}</p><h3>{assignment.title}</h3></div><time dateTime={assignment.due_date}>{dueLabel(assignment.due_date)}</time></header>
    <p className="assignment-description">{assignment.description}</p>
    <footer><span>{showClass && className ? className : 'Class homework'}</span><time dateTime={assignment.due_date}>Due {new Date(`${assignment.due_date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</time></footer>
  </article>;
}

function TeacherAssignments({ profile, classId, classLabel, studentsCount }: { profile: Profile; classId: string; classLabel?: any; studentsCount: number }) {
  const db = useMemo(() => createClient(), []);
  const [assignments, setAssignments] = useState<Assignment[]>([]), [loading, setLoading] = useState(false), [sending, setSending] = useState(false), [error, setError] = useState(''), [note, setNote] = useState('');
  const refresh = async () => {
    if (!classId) { setAssignments([]); return; }
    setLoading(true);
    const { data, error: loadError } = await db.from('class_assignments').select('*').eq('class_id', classId).order('due_date', { ascending: true }).order('created_at', { ascending: false });
    setAssignments(data || []); setError(loadError ? "We couldn't load homework right now." : ''); setLoading(false);
  };
  useEffect(() => { refresh(); }, [classId]);
  useEffect(() => { const channel = db.channel(`teacher-homework-${classId || 'none'}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'class_assignments', ...(classId ? { filter: `class_id=eq.${classId}` } : {}) }, refresh).subscribe(); return () => { db.removeChannel(channel); }; }, [db, classId]);
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!classId || sending) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement); const subject = normalizeCommunicationValue(String(form.get('subject') || '')); const title = normalizeCommunicationValue(String(form.get('title') || '')); const description = normalizeCommunicationValue(String(form.get('description') || '')); const dueDate = String(form.get('due_date') || '');
    if (!subject || !title || !description || !dueDate) { setError('Please complete the subject, title, description, and due date.'); return; }
    setError(''); setNote(''); setSending(true);
    const { error: rpcError } = await db.rpc('create_class_assignment', { p_class_id: classId, p_subject: subject, p_title: title, p_description: description, p_due_date: dueDate, p_client_request_id: globalThis.crypto.randomUUID() });
    setSending(false);
    if (rpcError) setError(rpcError.message.toLowerCase().includes('due date') ? 'Choose today or a future due date.' : 'Homework could not be assigned. Please try again.');
    else { formElement.reset(); setNote('Homework assigned to the class.'); refresh(); }
  };
  const upcoming = assignments.filter((assignment) => assignment.due_date >= today()), past = assignments.filter((assignment) => assignment.due_date < today());
  return <section className="teacher-homework card" aria-labelledby="teacher-homework-heading"><header className="homework-heading"><span className="section-icon"><Icon name="homework" /></span><div><p className="eyebrow">CLASS HOMEWORK</p><h2 id="teacher-homework-heading">Homework & assignments</h2><p>{classId && classLabel ? `Grade ${classLabel.grade}${classLabel.division} · ${studentsCount} students` : 'Select an assigned class to create homework.'}</p></div></header>{!classId ? <p className="empty compact-empty">Choose a class in Your classroom to begin assigning homework.</p> : <><form className="assignment-form" onSubmit={create}><label>Subject<input name="subject" required maxLength={80} placeholder="Science" /></label><label>Title<input name="title" required maxLength={140} placeholder="Plant Cell Diagram" /></label><label className="assignment-description-field">Description<textarea name="description" required maxLength={1500} rows={3} placeholder="Explain what students should complete." /></label><label>Due date<input name="due_date" type="date" min={today()} defaultValue={today()} required /></label><button disabled={sending}>{sending ? 'Assigning…' : 'Assign homework'}</button></form>{error && <p className="error" role="alert">{error}</p>}{note && <p className="success" role="status">{note}</p>}<div className="assignment-list-heading"><div><p className="eyebrow">UPCOMING</p><h2>Upcoming assignments</h2></div><span>{upcoming.length}</span></div>{loading ? <Skeleton label="Loading homework" rows={3} /> : upcoming.length ? upcoming.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />) : <p className="empty compact-empty">No homework assigned yet.</p>}{past.length > 0 && <><div className="assignment-list-heading"><div><p className="eyebrow">EARLIER</p><h2>Past assignments</h2></div><span>{past.length}</span></div>{past.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}</>}</>}</section>;
}

function ParentHomework({ child, className }: { child?: any; className: string }) {
  const db = useMemo(() => createClient(), []); const [assignments, setAssignments] = useState<Assignment[]>([]), [loading, setLoading] = useState(false), [error, setError] = useState(''); const requestRef = useRef(0); const classId = child?.class_id;
  const refresh = async () => { const version = ++requestRef.current; if (!classId) { setAssignments([]); return; } setLoading(true); const { data, error: loadError } = await db.from('class_assignments').select('*').eq('class_id', classId).order('due_date', { ascending: true }); if (version === requestRef.current) { setAssignments(data || []); setError(loadError ? "We couldn't load homework right now." : ''); setLoading(false); } };
  useEffect(() => { refresh(); }, [classId]);
  useEffect(() => { const channel = db.channel(`parent-homework-${classId || 'none'}`).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'class_assignments', ...(classId ? { filter: `class_id=eq.${classId}` } : {}) }, refresh).subscribe(); return () => { db.removeChannel(channel); }; }, [db, classId]);
  const upcoming = assignments.filter((assignment) => assignment.due_date >= today()), past = assignments.filter((assignment) => assignment.due_date < today());
  return <section className="parent-homework" id="parent-homework" aria-labelledby="parent-homework-heading"><div className="section-heading"><p className="eyebrow">HOMEWORK</p><h2 id="parent-homework-heading">Homework for {child?.full_name?.split(' ')[0] || 'your child'}</h2><p className="hint">{className} · Class assignments from the teacher.</p></div>{error ? <p className="error" role="alert">{error}</p> : loading ? <Skeleton label="Loading homework" rows={2} /> : upcoming.length ? upcoming.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />) : <p className="empty compact-empty">No upcoming homework for {child?.full_name?.split(' ')[0] || 'your child'}.</p>}{past.length > 0 && <details className="assignment-past-details"><summary>Earlier homework ({past.length})</summary>{past.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} />)}</details>}</section>;
}

function PrincipalHomework({ profile }: { profile: Profile }) {
  const db = useMemo(() => createClient(), []); const [assignments, setAssignments] = useState<Assignment[]>([]); const refresh = async () => { const { data } = await db.from('class_assignments').select('*,classes(grade,division)').eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(8); setAssignments(data || []); };
  useEffect(() => { refresh(); const channel = db.channel('principal-homework').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'class_assignments' }, refresh).subscribe(); return () => { db.removeChannel(channel); }; }, [db, profile.school_id]);
  const upcoming = assignments.filter((assignment) => assignment.due_date >= today());
  return <section className="card principal-homework" id="principal-homework"><div className="homework-heading"><span className="section-icon"><Icon name="homework" /></span><div><p className="eyebrow">LEARNING ACTIVITY</p><h2>Homework activity</h2><p>Recent class assignments across your school.</p></div><b>{upcoming.length} upcoming</b></div>{assignments.length ? assignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} showClass />) : <p className="empty compact-empty">No assignments to show yet.</p>}</section>;
}

function Parent({ profile }: { profile: Profile }) {
  const db = useMemo(() => createClient(), []);
  const activeChildIdRef = useRef('');
  const childRequestVersionRef = useRef(0);
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
  const refresh = async (
    targetChildId = childId,
    requestVersion = childRequestVersionRef.current,
  ) => {
    if (!targetChildId) return;
    const { data } = await db
      .from('student_updates')
      .select(
        '*,profiles!student_updates_teacher_id_fkey(full_name),acknowledgements(acknowledged_at,parent_id)',
      )
      .eq('student_id', targetChildId)
      .order('sent_at', { ascending: false });
    if (
      targetChildId === activeChildIdRef.current &&
      requestVersion === childRequestVersionRef.current
    ) {
      setUpdates(data || []);
    }
  };
  const loadAttendance = async (
    targetChildId = childId,
    requestVersion = childRequestVersionRef.current,
  ) => {
    if (!targetChildId) return;
    const { data, error } = await db
      .from('attendance_records')
      .select('id,class_id,student_id,attendance_date,status')
      .eq('student_id', targetChildId)
      .order('attendance_date', { ascending: false })
      .limit(10);
    if (
      targetChildId === activeChildIdRef.current &&
      requestVersion === childRequestVersionRef.current
    ) {
      setAttendance(data || []);
      setAttendanceError(error ? 'Attendance could not be loaded.' : '');
    }
  };
  useEffect(() => {
    activeChildIdRef.current = childId;
    const requestVersion = childRequestVersionRef.current + 1;
    childRequestVersionRef.current = requestVersion;
    if (!childId) {
      setUpdates([]);
      setAttendance([]);
      setAttendanceError('');
      return;
    }
    setUpdates([]);
    setAttendance([]);
    setAttendanceError('');
    refresh(childId, requestVersion);
    loadAttendance(childId, requestVersion);
  }, [childId]);
  useEffect(() => {
    const channel = db
      .channel('parent-updates')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'student_updates' },
        () => refresh(),
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'acknowledgements',
          filter: `parent_id=eq.${profile.id}`,
        },
        () => refresh(),
      )
      .subscribe();
    return () => {
      db.removeChannel(channel);
    };
  }, [db, childId, profile.id]);
  const counts = attendance.reduce(
    (total, row) => ({ ...total, [row.status]: total[row.status] + 1 }),
    { present: 0, absent: 0, late: 0 } as Record<Status, number>,
  );
  const child = children.find((item) => item.id === childId);
  const className = child?.classes
    ? `Grade ${child.classes.grade}${child.classes.division}`
    : 'Your child';
  const parentCorrectedIds = correctedUpdateIds(updates);
  const awaitingAcknowledgement = effectiveUpdates(updates).filter(
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
      <StudentOverview student={child} classLabel={child?.classes} role="parent" />
      <section className="right-now" aria-labelledby="right-now-heading">
        <div className="section-heading"><p className="eyebrow">RIGHT NOW</p><h2 id="right-now-heading">At a glance</h2></div>
        <div className="right-now-grid">
          <div><Icon name="attendance" /><span>Attendance<b>{attendance[0] ? nice(attendance[0].status) : 'Not marked'}</b></span></div>
          <div><Icon name="important" /><span>Important<b>{awaitingAcknowledgement.length ? `${awaitingAcknowledgement.length} to read` : 'All caught up'}</b></span></div>
          <div><Icon name="updates" /><span>Latest update<b>{updates[0] ? nice(updates[0].category) : 'No updates'}</b></span></div>
        </div>
      </section>
      <ParentHomework child={child} className={className} />
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
          corrected={parentCorrectedIds.has(update.id)}
          correctionOf={update.corrects_update_id ? updates.find((item) => item.id === update.corrects_update_id)?.title : undefined}
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

function StudentOverview({ student, classLabel, role }: { student: any; classLabel?: any; role: Role }) {
  const db = useMemo(() => createClient(), []);
  const requestRef = useRef(0);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [updates, setUpdates] = useState<Update[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const [errors, setErrors] = useState({ attendance: '', updates: '', homework: '' });
  useEffect(() => {
    const version = ++requestRef.current;
    if (!student?.id) { setAttendance([]); setUpdates([]); setAssignments([]); setLoading(false); return; }
    setLoading(true);
    Promise.all([
      db.from('attendance_records').select('id,class_id,student_id,attendance_date,status').eq('student_id', student.id).order('attendance_date', { ascending: false }).limit(10),
      db.from('student_updates').select('*,acknowledgements(acknowledged_at,parent_id)').eq('student_id', student.id).order('sent_at', { ascending: false }).limit(12),
      db.from('class_assignments').select('*').eq('class_id', student.class_id).order('due_date', { ascending: true }).limit(8),
    ]).then(([attendanceResult, updatesResult, homeworkResult]) => {
      if (version !== requestRef.current) return;
      setAttendance(attendanceResult.data || []); setUpdates(updatesResult.data || []); setAssignments(homeworkResult.data || []);
      setErrors({ attendance: attendanceResult.error ? "We couldn't load attendance right now." : '', updates: updatesResult.error ? "We couldn't load recent updates right now." : '', homework: homeworkResult.error ? "We couldn't load homework right now." : '' });
      setLoading(false);
    });
  }, [db, student?.id, student?.class_id, refreshTick]);
  useEffect(() => {
    if (!student?.id || !student?.class_id) return;
    const channel = db.channel(`student-profile-${role}-${student.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'attendance_records', filter: `student_id=eq.${student.id}` }, () => setRefreshTick((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_updates', filter: `student_id=eq.${student.id}` }, () => setRefreshTick((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'acknowledgements' }, () => setRefreshTick((value) => value + 1))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'class_assignments', filter: `class_id=eq.${student.class_id}` }, () => setRefreshTick((value) => value + 1))
      .subscribe();
    return () => { db.removeChannel(channel); };
  }, [db, role, student?.id, student?.class_id]);
  if (!student) return <section className="card student-profile-empty" id={`${role}-profile`}><span className="section-icon"><Icon name="student" /></span><h2>Select a student to view their profile</h2><p>Choose an authorized student to see their current school context.</p></section>;
  const counts = attendance.reduce((total, row) => ({ ...total, [row.status]: total[row.status] + 1 }), { present: 0, absent: 0, late: 0 } as Record<Status, number>);
  const currentUpdates = effectiveUpdates(updates); const latest = currentUpdates[0];
  const awaiting = currentUpdates.filter((item) => item.importance === 'important' && !item.acknowledgements?.length).length;
  const upcoming = assignments.filter((item) => item.due_date >= today()); const next = upcoming[0];
  const grade = classLabel ? `Grade ${classLabel.grade}${classLabel.division}` : student.classes ? `Grade ${student.classes.grade}${student.classes.division}` : 'Class';
  return <section className="student-profile" id={`${role}-profile`} aria-labelledby={`${role}-profile-heading`}>
    <header className="student-profile-identity"><span className="student-avatar" aria-hidden="true">{initials(student.full_name)}</span><div><p className="eyebrow">STUDENT OVERVIEW</p><h1 id={`${role}-profile-heading`}>{student.full_name}</h1><p>{grade} · Roll {student.roll_number || '—'}</p><small>Schovera International School</small></div></header>
    {loading ? <Skeleton label="Loading student profile" rows={4} /> : <>
      <div className="student-profile-summary" aria-label="Student profile at a glance"><article><Icon name="attendance" /><span><small>Attendance</small><b>{attendance.length ? nice(attendance[0].status) : 'Not recorded'}</b></span></article><article><Icon name="updates" /><span><small>Communication</small><b>{awaiting ? `${awaiting} awaiting` : latest ? 'Up to date' : 'No updates'}</b></span></article><article><Icon name="homework" /><span><small>Homework</small><b>{upcoming.length ? `${upcoming.length} upcoming` : 'None upcoming'}</b></span></article></div>
      <div className="student-profile-grid">
        <section className="card profile-section"><p className="eyebrow">ATTENDANCE</p><h2>Recent attendance</h2>{errors.attendance ? <p className="error" role="alert">{errors.attendance}</p> : attendance.length ? <><div className="attendance-counts"><span><b>{counts.present}</b>Present</span><span><b>{counts.absent}</b>Absent</span><span><b>{counts.late}</b>Late</span></div><p className="hint">Latest: <b className={`status ${attendance[0].status}`}>{nice(attendance[0].status)}</b> · {new Date(`${attendance[0].attendance_date}T00:00:00`).toLocaleDateString([], { month: 'short', day: 'numeric' })}</p></> : <p className="empty compact-empty">No attendance recorded yet.</p>}</section>
        <section className="card profile-section"><p className="eyebrow">COMMUNICATION</p><h2>Teacher updates</h2>{errors.updates ? <p className="error" role="alert">{errors.updates}</p> : latest ? <><p className="profile-update-title"><span className="update-icon"><Icon name={categoryIcon(latest.category)} /></span><b>{latest.title}</b></p><p className="hint">{nice(latest.category)} · {displayDate(latest.sent_at)}</p>{latest.importance === 'important' && <p className={awaiting ? 'status pending' : 'status present'}>{awaiting ? 'Awaiting acknowledgement' : 'Acknowledged'}</p>}</> : <p className="empty compact-empty">No teacher updates yet.</p>}</section>
        <section className="card profile-section"><p className="eyebrow">HOMEWORK</p><h2>Upcoming homework</h2>{errors.homework ? <p className="error" role="alert">{errors.homework}</p> : next ? <><p className="profile-update-title"><span className="update-icon"><Icon name="homework" /></span><b>{next.title}</b></p><p className="hint">{next.subject} · {dueLabel(next.due_date)}</p><p className="hint">{upcoming.length} upcoming assignment{upcoming.length === 1 ? '' : 's'}</p></> : <p className="empty compact-empty">No upcoming homework.</p>}</section>
      </div>
    </>}
  </section>;
}

function PrincipalStudentOverview({ profile }: { profile: Profile }) {
  const db = useMemo(() => createClient(), []); const requestRef = useRef(0);
  const [query, setQuery] = useState(''); const [students, setStudents] = useState<any[]>([]); const [selected, setSelected] = useState<any>(null);
  useEffect(() => { const version = ++requestRef.current; db.from('students').select('*,classes(grade,division)').eq('school_id', profile.school_id).eq('active', true).order('full_name').then(({ data }) => { if (version === requestRef.current) setStudents(data || []); }); }, [db, profile.school_id]);
  const normalized = query.trim().toLocaleLowerCase(); const results = normalized ? students.filter((student) => student.full_name.toLocaleLowerCase().includes(normalized) || String(student.roll_number || '').toLocaleLowerCase().includes(normalized)) : students.slice(0, 8);
  return <section className="principal-students" id="principal-students"><div className="section-heading"><p className="eyebrow">STUDENT OVERVIEW</p><h2>Find a student</h2><p className="hint">Search students in your school by name or roll number.</p></div><label className="teacher-roster-search"><span className="sr-only">Search students</span><Icon name="search" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or roll number" /></label><div className="principal-student-results">{results.map((student) => <button type="button" key={student.id} className={selected?.id === student.id ? 'student active' : 'student'} onClick={() => setSelected(student)}><span className="student-name"><i>{initials(student.full_name)}</i><span>{student.full_name}<small>Grade {student.classes?.grade}{student.classes?.division} · Roll {student.roll_number}</small></span></span><span className="student-chevron">›</span></button>)}{normalized && !results.length && <p className="empty compact-empty">No students found.</p>}</div><StudentOverview student={selected} classLabel={selected?.classes} role="principal" /></section>;
}

function Principal({ profile }: { profile: Profile }) {
  const db = useMemo(() => createClient(), []);
  const [all, setAll] = useState<Update[]>([]),
    [classes, setClasses] = useState<any[]>([]),
    [todayAttendance, setTodayAttendance] = useState<Attendance[]>([]),
    [communicationFilter, setCommunicationFilter] = useState<'all' | 'awaiting'>('all'),
    [communicationLoading, setCommunicationLoading] = useState(true),
    [communicationError, setCommunicationError] = useState(''),
    [attendanceError, setAttendanceError] = useState('');
  const refresh = async () => {
    setCommunicationLoading(true);
    const { data, error } = await db
      .from('student_updates')
      .select('*,students(full_name,roll_number,classes(grade,division)),acknowledgements(acknowledged_at)')
      .eq('school_id', profile.school_id)
      .order('sent_at', { ascending: false });
    setAll(data || []);
    setCommunicationError(
      error ? 'Recent communication could not be loaded.' : '',
    );
    setCommunicationLoading(false);
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
  const principalCorrectedIds = correctedUpdateIds(all),
    important = effectiveUpdates(all).filter((update) => update.importance === 'important'),
    acknowledged = important.filter(
      (update) => update.acknowledgements?.length,
    ),
    awaitingUpdates = important.filter((update) => !update.acknowledgements?.length),
    awaiting = awaitingUpdates.length,
    communicationCoverage = important.length
      ? Math.round((acknowledged.length / important.length) * 100)
      : null,
    attendanceCounts = todayAttendance.reduce(
      (total, row) => ({ ...total, [row.status]: total[row.status] + 1 }),
      { present: 0, absent: 0, late: 0 } as Record<Status, number>,
    ),
    markedClassIds = new Set(todayAttendance.map((row) => row.class_id)),
    visibleCommunication = communicationFilter === 'awaiting'
      ? awaitingUpdates
      : all.slice(0, 6);
  const showAwaitingCommunication = () => {
    setCommunicationFilter('awaiting');
    window.requestAnimationFrame(() =>
      document
        .getElementById('principal-recent-communication')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
    );
  };
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
          <button
            type="button"
            className="principal-metric-card metric-awaiting principal-awaiting-metric"
            onClick={showAwaitingCommunication}
            aria-controls="principal-recent-communication"
            aria-label={`View ${awaiting} important update${awaiting === 1 ? '' : 's'} awaiting acknowledgement`}
          >
            <span className="metric-icon" aria-hidden="true"><Icon name="updates" /></span>
            <small>Awaiting</small>
            <b>{awaiting}</b>
            <p>Still awaiting acknowledgement</p>
            <span className="principal-metric-action">View details</span>
          </button>
        </div>
      </section>
      <div className="principal-main-grid">
        <div className="principal-primary-column">
      <PrincipalStudentOverview profile={profile} />
      <PrincipalHomework profile={profile} />
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
      <div className="card principal-recent-communication" id="principal-recent-communication">
        <div className="principal-communication-heading">
          <div>
            <p className="eyebrow">RECENT ACTIVITY</p>
            <h2>{communicationFilter === 'awaiting' ? 'Awaiting acknowledgement' : 'Recent communication'}</h2>
            <p className="hint">
              {communicationFilter === 'awaiting'
                ? 'Important student updates still waiting for a parent acknowledgement.'
                : 'Teacher updates shared with families. This is not teacher scoring.'}
            </p>
          </div>
          <div className="principal-communication-filter" role="group" aria-label="Filter recent communication">
            <button type="button" className={communicationFilter === 'all' ? 'active' : ''} aria-pressed={communicationFilter === 'all'} onClick={() => setCommunicationFilter('all')}>All</button>
            <button type="button" className={communicationFilter === 'awaiting' ? 'active' : ''} aria-pressed={communicationFilter === 'awaiting'} onClick={() => setCommunicationFilter('awaiting')}>Awaiting <span>{awaiting}</span></button>
          </div>
        </div>
        {communicationError ? (
          <p className="error">{communicationError}</p>
        ) : communicationLoading ? (
          <PrincipalCommunicationSkeleton />
        ) : visibleCommunication.length ? (
          visibleCommunication.map((update) => (
              <PrincipalCommunicationCard key={update.id} update={update} corrected={principalCorrectedIds.has(update.id)} correctionOf={update.corrects_update_id ? all.find((item) => item.id === update.corrects_update_id)?.title : undefined} />
            ))
        ) : communicationFilter === 'awaiting' ? (
          <div className="principal-awaiting-empty" role="status">
            <span className="section-icon" aria-hidden="true"><Icon name="check" /></span>
            <div><b>All important updates acknowledged</b><p>There are no important student updates currently waiting for acknowledgement.</p></div>
          </div>
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

function PrincipalCommunicationSkeleton() {
  return (
    <div className="principal-communication-skeleton" role="status" aria-label="Loading recent communication">
      <span className="principal-skeleton-avatar" />
      <div><span /><span /><span className="short" /></div>
    </div>
  );
}

function PrincipalCommunicationCard({ update, corrected, correctionOf }: { update: Update; corrected: boolean; correctionOf?: string }) {
  const studentName = update.students?.full_name || 'Student';
  const studentClass = update.students?.classes
    ? `Grade ${update.students.classes.grade}${update.students.classes.division}`
    : '';
  const studentContext = [studentClass, update.students?.roll_number ? `Roll ${update.students.roll_number}` : '']
    .filter(Boolean)
    .join(' Â· ');
  const acknowledged = Boolean(update.acknowledgements?.length);
  const needsAcknowledgement = update.importance === 'important';
  return (
    <article
      className={`principal-communication-card${needsAcknowledgement ? ' important-update' : ''}${acknowledged ? ' acknowledged-update' : ''}`}
      aria-label={`${studentName}: ${nice(update.category)} update sent ${displayDate(update.sent_at)}`}
    >
      <header>
        <span className="student-avatar" aria-hidden="true">{initials(studentName)}</span>
        <div>
          <p className="principal-student-label">{studentContext || 'STUDENT UPDATE'}</p>
          <h3>{studentName}</h3>
        </div>
      </header>
      <div className="principal-card-tags">
        <span className="principal-category"><Icon name={categoryIcon(update.category)} />{nice(update.category)}</span>
        {correctionOf && <span className="correction-badge">Correction</span>}
        {corrected && <span className="corrected-badge">Corrected</span>}
        <span className={needsAcknowledgement ? 'principal-importance important' : 'principal-importance'}>
          {needsAcknowledgement ? 'Important' : 'Normal'}
        </span>
      </div>
      <h4>{update.title}</h4>
      {correctionOf && <p className="correction-reference">Corrects: {correctionOf}</p>}
      {corrected && <p className="correction-reference">A newer correction is available in this history.</p>}
      <p className="principal-update-message">{update.message}</p>
      <footer>
        <time dateTime={update.sent_at}>{displayDate(update.sent_at)}</time>
        {needsAcknowledgement && (
          acknowledged ? (
            <span className="principal-acknowledgement acknowledged"><Icon name="check" />Acknowledged</span>
          ) : corrected ? (
            <span className="principal-acknowledgement corrected">Corrected</span>
          ) : (
            <span className="principal-acknowledgement awaiting"><Icon name="important" />Awaiting acknowledgement</span>
          )
        )}
      </footer>
    </article>
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
    const title = String(form.get('title') || '').trim();
    const body = String(form.get('body') || '').trim();
    setNote('');
    if (!title || !body) {
      setNote('Please add a title and message before publishing.');
      return;
    }
    setPublishing(true);
    const { error } = await db.rpc('publish_announcement', {
      p_title: title,
      p_body: body,
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
  corrected = false,
  correctionOf,
  onCorrect,
  acknowledging = false,
  acknowledge,
}: {
  update: Update;
  teacher?: boolean;
  parent?: string;
  childContext?: string;
  corrected?: boolean;
  correctionOf?: string;
  onCorrect?: (update: Update) => void;
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
      {correctionOf && <span className="correction-badge">Correction</span>}
      {corrected && <span className="corrected-badge">Corrected</span>}
      {update.importance === 'important' && (
        <span className="important">Important</span>
      )}</div>
      <h3>{update.title}</h3>
      {correctionOf && <p className="correction-reference">Corrects: {correctionOf}</p>}
      {corrected && <p className="correction-reference">This update was corrected by a newer communication.</p>}
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
      {teacher && onCorrect && (
        <button type="button" className="send-correction" onClick={() => onCorrect(update)}>
          Send correction
        </button>
      )}
      {update.importance === 'important' && (
        <div className={`ack${teacher ? ' teacher-ack' : ''}`}>
          {acknowledged ? (
            parent ? (
              <span className="parent-acknowledged" role="status"><Icon name="check" /><span><b>Acknowledged</b>{mine && <small>{displayDate(mine.acknowledged_at)}</small>}</span></span>
            ) : <b className="status present">{teacher && <Icon name="check" />}Acknowledged</b>
          ) : teacher && !corrected ? (
            <span className="status pending"><Icon name="important" /> Awaiting acknowledgement</span>
          ) : corrected ? (
            <span className="status neutral">Replaced by a newer correction</span>
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
