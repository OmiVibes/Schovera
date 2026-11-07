'use client';
import { UiText, useUiText } from '@/components/ui-text';

import { useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { schoolToday } from '@/lib/school-date.mjs';

type Assignment = { id: string; subject: string; title: string; description: string; due_date: string; updated_at: string };
export function AssignmentEditor({ assignment, onSaved }: { assignment: Assignment; onSaved: () => void }) {
  const ui = useUiText();
  const db = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [snapshot, setSnapshot] = useState(assignment);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = new FormData(event.currentTarget); setBusy(true); setError('');
    const { error: failed } = await db.rpc('edit_class_assignment', {
      p_assignment_id: assignment.id, p_subject: String(form.get('subject') ?? '').trim(),
      p_title: String(form.get('title') ?? '').trim(), p_description: String(form.get('description') ?? '').trim(),
      p_due_date: form.get('due_date'), p_expected_updated_at: snapshot.updated_at,
    });
    setBusy(false);
    if (failed) setError(failed.message.includes('changed') ? 'Homework changed in another session. Close this editor and refresh before retrying.' : 'Could not edit homework. Check the fields, connection and your class assignment.');
    else { setOpen(false); onSaved(); }
  }
  return <div className="assignment-editor">
    <button type="button" className="secondary" onClick={() => { if (!open) setSnapshot(assignment); setOpen(!open); setError(''); }} aria-expanded={open}>{open ? ui("Cancel homework edit") : ui("Edit homework")}</button>
    {open && <form className="assignment-form" onSubmit={save}>
      <label><UiText source={"Subject"} /><input name="subject" required minLength={2} maxLength={80} defaultValue={snapshot.subject} /></label>
      <label><UiText source={"Title"} /><input name="title" required minLength={3} maxLength={140} defaultValue={snapshot.title} /></label>
      <label className="assignment-description-field"><UiText source={"Description"} /><textarea name="description" required minLength={3} maxLength={1500} defaultValue={snapshot.description} /></label>
      <label><UiText source={"Due date"} /><input name="due_date" type="date" min={schoolToday()} defaultValue={snapshot.due_date} required /></label>
      <button disabled={busy}>{busy ? ui("Saving homework…") : ui("Save homework changes")}</button>
      {error && <p role="alert" className="error">{ui(error)}</p>}
    </form>}
  </div>;
}
