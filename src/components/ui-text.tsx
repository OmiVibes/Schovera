'use client';
import { memo, useCallback } from 'react';
import { useI18n } from '@/lib/i18n-provider';
import { uiText } from '@/lib/ui-copy';
export function useUiText() {
  const { language } = useI18n();
  return useCallback((source: unknown, values?: readonly unknown[]) => uiText(source, language, values), [language]);
}
export const UiText = memo(function UiText({ source }: { source: string }) {
  const ui = useUiText();
  return <>{ui(source)}</>;
});
