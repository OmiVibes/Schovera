'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';

type Kind = 'syllabus' | 'exam' | 'worksheet' | 'lesson-plan';
type SheetState = { name: string; rows: string[][] };
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 200;
const MAX_COLS = 30;

const normalizeGrid = (value: unknown[][]) => value.slice(0, MAX_ROWS).map((row) =>
  Array.from({ length: Math.min(MAX_COLS, Math.max(1, ...value.slice(0, MAX_ROWS).map((item) => item.length))) }, (_, index) => String(row[index] ?? '').slice(0, 500)),
);

export function TeacherAIWorkspace() {
  const supabase = useMemo(() => createClient(), []);
  const [kind, setKind] = useState<Kind>('syllabus');
  const [grade, setGrade] = useState('');
  const [subject, setSubject] = useState('');
  const [topic, setTopic] = useState('');
  const [details, setDetails] = useState('');
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [providerLabel, setProviderLabel] = useState('');
  const [sheet, setSheet] = useState<SheetState | null>(null);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true); setError(''); setNotice('');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Your session expired. Sign in again and retry.');
      const response = await fetch('/api/teacher-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ kind, grade, subject, topic, details }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'The draft could not be generated.');
      setDraft(result.draft);
      setProviderLabel(result.provider || 'Configured AI provider');
      setNotice(`Draft ready with ${result.provider || 'the configured model'}. Review it carefully before using it with your class.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The draft could not be generated.');
    } finally { setLoading(false); }
  };

  const openWorkbook = async (file?: File) => {
    setError(''); setNotice(''); setSheet(null);
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) { setError('Choose a workbook smaller than 5 MB.'); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError('Choose an Excel workbook (.xlsx/.xls) or CSV file.'); return; }
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellText: true, cellDates: false, bookVBA: false, sheetRows: MAX_ROWS });
      const name = workbook.SheetNames[0];
      if (!name) throw new Error('This workbook has no worksheets.');
      const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false });
      if (!raw.length) throw new Error('This worksheet is empty.');
      setSheet({ name, rows: normalizeGrid(raw) });
      setNotice('Workbook opened locally in this browser. Its contents are not sent to Schovera or the AI service.');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'This workbook could not be opened.'); }
  };

  const updateCell = (rowIndex: number, colIndex: number, value: string) => {
    setSheet((current) => current ? { ...current, rows: current.rows.map((row, ri) => ri === rowIndex ? row.map((cell, ci) => ci === colIndex ? value : cell) : row) } : current);
  };
  const downloadWorkbook = async () => {
    if (!sheet) return;
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31) || 'Sheet1');
    XLSX.writeFile(workbook, `${sheet.name.replace(/[\\/:*?"<>|]/g, '_')}-edited.xlsx`, { bookType: 'xlsx' });
    setNotice('Edited workbook downloaded. Review formulas, formatting, and values before sharing.');
  };

  return <section className="teacher-ai-workspace" aria-labelledby="teacher-ai-title">
    <section className="teacher-ai-intro"><span className="teacher-ai-mark" aria-hidden="true">✦</span><div><p className="eyebrow">TEACHER PLANNING STUDIO</p><h2 id="teacher-ai-title">Create and refine teaching materials</h2><p>Build a first draft for your own review, or make a simple local edit to an Excel workbook.</p></div></section>
    <div className="teacher-ai-grid">
      <section className="card teacher-ai-panel" aria-labelledby="ai-draft-heading">
        <p className="eyebrow">AI DRAFTS</p><h3 id="ai-draft-heading">Start with a teaching goal</h3>
        <p className="teacher-ai-disclaimer">AI outputs can be wrong or misaligned. Check curriculum, age suitability, answer keys, and marks before use. Do not enter student names or personal information.</p>
        <form className="teacher-ai-form" onSubmit={generate}>
          <label>What do you want to draft?<select value={kind} onChange={(event) => setKind(event.target.value as Kind)}><option value="syllabus">Syllabus outline</option><option value="exam">Exam paper + answer key</option><option value="worksheet">Worksheet + answer key</option><option value="lesson-plan">Lesson plan</option></select></label>
          <div className="teacher-ai-form-row"><label>Grade / level<input required maxLength={40} value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="Grade 7" /></label><label>Subject<input required minLength={2} maxLength={80} value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Science" /></label></div>
          <label>Topic or unit<input required minLength={3} maxLength={500} value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Forces and motion" /></label>
          <label>Teacher notes <span className="hint">(optional; no student data)</span><textarea maxLength={1200} rows={3} value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Time available, learning goals, marks, or materials…" /></label>
          <button className="primary" disabled={loading}>{loading ? 'Preparing a draft…' : 'Generate a draft'}</button>
        </form>
        <p className="teacher-ai-provider-note">Use the configured model for a first draft. With Ollama, prompts run on this computer and are not sent to a cloud AI provider. Schovera does not save prompts or generated drafts.</p>
        {error && <p className="error" role="alert">{error}</p>}{notice && <p className="success" role="status">{notice}</p>}
        {draft && <section className="teacher-ai-output" aria-labelledby="draft-output-heading"><div className="teacher-ai-output-heading"><div><h4 id="draft-output-heading">Editable draft</h4><p className="teacher-ai-model-label">Generated with {providerLabel}</p></div><button type="button" className="secondary" onClick={() => navigator.clipboard.writeText(draft).then(() => setNotice('Draft copied to clipboard.')).catch(() => setError('Clipboard access was blocked by your browser.'))}>Copy draft</button></div><textarea aria-label="Generated editable teaching draft" rows={18} value={draft} onChange={(event) => setDraft(event.target.value)} /><p>Teacher review required · Not published or shared</p></section>}
      </section>

      <section className="card teacher-sheet-panel" aria-labelledby="sheet-heading">
        <p className="eyebrow">SPREADSHEET DESK</p><h3 id="sheet-heading">Edit a workbook locally</h3>
        <p>Open the first worksheet, edit visible cells, then download an Excel copy. Workbook data stays in your browser and is never included in AI requests.</p>
        <label className="teacher-sheet-upload">Choose .xlsx, .xls, or .csv<input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { void openWorkbook(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        <p className="teacher-sheet-limit">Limit: 5 MB, first worksheet, up to 200 rows × 30 columns. This simple editor does not preserve workbook styling, macros, formulas, or multiple sheets; work on a copy.</p>
        {sheet && <><div className="teacher-sheet-toolbar"><b>{sheet.name}</b><span>{sheet.rows.length} rows · local only</span><button type="button" className="primary" onClick={downloadWorkbook}>Download edited .xlsx</button></div><div className="teacher-sheet-scroll" role="region" aria-label={`${sheet.name} editable worksheet`} tabIndex={0}><table><tbody>{sheet.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}><label className="sr-only">Row {ri + 1}, column {ci + 1}</label><input aria-label={`Row ${ri + 1}, column ${ci + 1}`} value={cell} maxLength={500} onChange={(event) => updateCell(ri, ci, event.target.value)} /></td>)}</tr>)}</tbody></table></div></>}
      </section>
    </div>
  </section>;
}
