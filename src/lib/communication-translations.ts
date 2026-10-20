import type { Language } from './i18n';

export type CommunicationSource = { kind: 'update' | 'announcement'; id: string; title: string; body: string };
export type ReviewedTranslation = {
  id: string; language: Language; title: string; body: string;
  status: 'draft' | 'in_review' | 'approved' | 'needs_review'; updated_at: string;
};
export const sourceColumn = (source: CommunicationSource) => source.kind === 'update' ? 'student_update_id' : 'announcement_id';
// Only the RLS-authorized, approved query result can replace displayed content.
export function displayedCommunication(source: CommunicationSource, translation: ReviewedTranslation | null) {
  return translation?.status === 'approved' ? { title: translation.title, body: translation.body, language: translation.language } : { title: source.title, body: source.body, language: undefined };
}
