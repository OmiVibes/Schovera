'use client';
import { UiText, useUiText } from '@/components/ui-text';

import { useMemo, useRef, useState, type FormEvent } from 'react';
import { createClient } from '@/lib/supabase/client';
import { prepareWorkbookGrid, WORKBOOK_LIMITS } from '@/lib/workbook-grid';

type Kind = 'syllabus' | 'exam' | 'worksheet' | 'lesson-plan';
type SheetState = { name: string; rows: string[][] };

export function TeacherAIWorkspace() {
  const ui = useUiText();
  const hostedDemo = process.env.NEXT_PUBLIC_SCHOVERA_HOSTED_DEMO === 'true';
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
  const uploadVersion = useRef(0);

  const generate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
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

  const copyDraft = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(draft);
      setError(''); setNotice('Draft copied to clipboard.');
    } catch { setError('Clipboard access is unavailable. Select the draft text and copy it manually.'); }
  };

  const openWorkbook = async (file?: File) => {
    if (!file) return;
    const version = ++uploadVersion.current;
    setError(''); setNotice('');
    if (file.size > WORKBOOK_LIMITS.bytes) { setError('Choose a workbook smaller than 5 MB. Your current workbook has not changed.'); return; }
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError('Choose an Excel workbook (.xlsx/.xls) or CSV file.'); return; }
    try {
      const XLSX = await import('xlsx');
      const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', cellText: true, cellDates: false, bookVBA: false, sheetRows: WORKBOOK_LIMITS.rows });
      const name = workbook.SheetNames[0];
      if (!name) throw new Error('This workbook has no worksheets.');
      const raw = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], { header: 1, raw: false, defval: '', blankrows: true });
      if (!raw.length) throw new Error('This worksheet is empty.');
      const reference = workbook.Sheets[name]['!fullref'] || workbook.Sheets[name]['!ref'];
      const range = typeof reference === 'string' ? XLSX.utils.decode_range(reference) : null;
      const result = prepareWorkbookGrid(raw, range ? { rows: range.e.r + 1, columns: range.e.c + 1 } : undefined);
      if (version !== uploadVersion.current) return;
      setSheet({ name, rows: result.rows });
      setNotice(result.limited ? 'Workbook opened, but some content exceeds the editor limits (200 rows, 30 columns, 500 characters per cell). Keep the original file; the downloaded copy contains only the visible content.' : 'Workbook opened locally in this browser. Its contents are not sent to Schovera or the AI service.');
    } catch (caught) { if (version === uploadVersion.current) setError(`${caught instanceof Error ? caught.message : 'This workbook could not be opened.'} Your current workbook has not changed.`); }
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
    <section className="teacher-ai-intro"><span className="teacher-ai-mark" aria-hidden="true">✦</span><div><p className="eyebrow"><UiText source={"TEACHER PLANNING STUDIO"} /></p><h2 id="teacher-ai-title"><UiText source={"Create and refine teaching materials"} /></h2><p><UiText source={"Build a first draft for your own review, or make a simple local edit to an Excel workbook."} /></p></div></section>
    <div className="teacher-ai-grid">
      <section className="card teacher-ai-panel" aria-labelledby="ai-draft-heading">
        <p className="eyebrow"><UiText source={"AI DRAFTS"} /></p><h3 id="ai-draft-heading"><UiText source={"Start with a teaching goal"} /></h3>
        <p className="teacher-ai-disclaimer"><UiText source={"AI outputs can be wrong or misaligned. Check curriculum, age suitability, answer keys, and marks before use. Do not enter student names or personal information."} /></p>
        <form className="teacher-ai-form" onSubmit={generate}>
          <label><UiText source={"What do you want to draft?"} /><select value={kind} disabled={loading || hostedDemo} onChange={(event) => setKind(event.target.value as Kind)}><option value="syllabus"><UiText source={"Syllabus outline"} /></option><option value="exam"><UiText source={"Exam paper + answer key"} /></option><option value="worksheet"><UiText source={"Worksheet + answer key"} /></option><option value="lesson-plan"><UiText source={"Lesson plan"} /></option></select></label>
          <div className="teacher-ai-form-row"><label><UiText source={"Grade / level"} /><input required maxLength={40} value={grade} disabled={loading || hostedDemo} onChange={(event) => setGrade(event.target.value)} placeholder={ui("Grade 7")} /></label><label><UiText source={"Subject"} /><input required minLength={2} maxLength={80} value={subject} disabled={loading || hostedDemo} onChange={(event) => setSubject(event.target.value)} placeholder={ui("Science")} /></label></div>
          <label><UiText source={"Topic or unit"} /><input required minLength={3} maxLength={500} value={topic} disabled={loading || hostedDemo} onChange={(event) => setTopic(event.target.value)} placeholder={ui("Forces and motion")} /></label>
          <label><UiText source={"Teacher notes "} /><span className="hint"><UiText source={"(optional; no student data)"} /></span><textarea maxLength={1200} rows={3} value={details} disabled={loading || hostedDemo} onChange={(event) => setDetails(event.target.value)} placeholder={ui("Time available, learning goals, marks, or materials…")} /></label>
          <button className="primary" disabled={loading || hostedDemo}>{loading ? ui("Preparing a draft…") : ui("Generate a draft")}</button>
        </form>
        {hostedDemo && <p role="status"><UiText source={"Live drafting is unavailable on this server. Use the school's configured local model. Spreadsheet editing below still works locally in your browser."} /></p>}
        <p className="teacher-ai-provider-note"><UiText source={"Use the configured model for a first draft. With Ollama, prompts run on this computer and are not sent to a cloud AI provider. Schovera does not save prompts or generated drafts."} /></p>
        {error && <p className="error" role="alert">{ui(error)}</p>}{notice && <p className="success" role="status">{ui(notice)}</p>}
        {draft && <section className="teacher-ai-output" aria-labelledby="draft-output-heading"><div className="teacher-ai-output-heading"><div><h4 id="draft-output-heading"><UiText source={"Editable draft"} /></h4><p className="teacher-ai-model-label"><UiText source={"Generated with "} />{providerLabel}</p></div><button type="button" className="secondary" onClick={copyDraft}><UiText source={"Copy draft"} /></button></div><textarea aria-label={ui("Generated editable teaching draft")} rows={18} value={draft} onChange={(event) => setDraft(event.target.value)} /><p><UiText source={"Teacher review required · Not published or shared"} /></p></section>}
      </section>

      <section className="card teacher-sheet-panel" aria-labelledby="sheet-heading">
        <p className="eyebrow"><UiText source={"SPREADSHEET DESK"} /></p><h3 id="sheet-heading"><UiText source={"Edit a workbook locally"} /></h3>
        <p><UiText source={"Open the first worksheet, edit visible cells, then download an Excel copy. Workbook data stays in your browser and is never included in AI requests."} /></p>
        <label className="teacher-sheet-upload"><UiText source={"Choose .xlsx, .xls, or .csv"} /><input type="file" accept=".xlsx,.xls,.csv" onChange={(event) => { void openWorkbook(event.target.files?.[0]); event.currentTarget.value = ''; }} /></label>
        <p className="teacher-sheet-limit"><UiText source={"Limit: 5 MB, first worksheet, up to 200 rows × 30 columns, 500 characters per cell. This simple editor does not preserve workbook styling, macros, formulas, or multiple sheets; work on a copy."} /></p>
        {sheet && <><div className="teacher-sheet-toolbar"><b>{sheet.name}</b><span>{sheet.rows.length} <UiText source={"rows · local only"} /></span><button type="button" className="primary" onClick={downloadWorkbook}><UiText source={"Download edited .xlsx"} /></button></div><div className="teacher-sheet-scroll" role="region" aria-label={ui("{0} editable worksheet", [sheet.name])} tabIndex={0}><table><tbody>{sheet.rows.map((row, ri) => <tr key={ri}>{row.map((cell, ci) => <td key={ci}><label className="sr-only"><UiText source={"Row "} />{ri + 1}<UiText source={", column "} />{ci + 1}</label><input aria-label={ui("Row {0}, column {1}", [ri + 1, ci + 1])} value={cell} maxLength={500} onChange={(event) => updateCell(ri, ci, event.target.value)} /></td>)}</tr>)}</tbody></table></div></>}
      </section>
    </div>
  </section>;
}
