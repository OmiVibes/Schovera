'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { schoolToday } from '@/lib/school-date.mjs';

type Assignment = { id: string; subject: string; title: string; description: string; due_date: string; updated_at: string };
export function AssignmentEditor({ assignment, onSaved }: { assignment: Assignment; onSaved: () => void }) {
  const db = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError('');
    const { error: failed } = await db.rpc('edit_class_assignment', {
      p_assignment_id: assignment.id, p_subject: String(form.get('subject') ?? '').trim(),
      p_title: String(form.get('title') ?? '').trim(), p_description: String(form.get('description') ?? '').trim(),
      p_due_date: form.get('due_date'), p_expected_updated_at: assignment.updated_at,
    });
    setBusy(false);
    if (failed) setError(failed.message.includes('changed') ? 'Homework changed in another session. Close this editor and refresh before retrying.' : 'Could not edit homework. Check the fields, connection and your class assignment.');
    else { setOpen(false); onSaved(); }
  }
  return <div className="assignment-editor">
    <button type="button" className="secondary" onClick={() => { setOpen(!open); setError(''); }} aria-expanded={open}>{open ? 'Cancel homework edit' : 'Edit homework'}</button>
    {open && <form className="assignment-form" onSubmit={save}>
      <label>Subject<input name="subject" required minLength={2} maxLength={80} defaultValue={assignment.subject} /></label>
      <label>Title<input name="title" required minLength={3} maxLength={140} defaultValue={assignment.title} /></label>
      <label className="assignment-description-field">Description<textarea name="description" required minLength={3} maxLength={1500} defaultValue={assignment.description} /></label>
      <label>Due date<input name="due_date" type="date" min={schoolToday()} defaultValue={assignment.due_date} required /></label>
      <button disabled={busy}>{busy ? 'Saving homework…' : 'Save homework changes'}</button>
      {error && <p role="alert" className="error">{error}</p>}
    </form>}
  </div>;
}
