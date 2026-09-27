'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import {
  getLanguagePreference,
  isLanguage,
  languageOptions,
  languageStorageKey,
  translate,
  type Language,
} from './i18n';

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);
const preferenceChangedEvent = 'schovera:language-preference-changed';
let inMemoryPreference: Language | undefined;

function getPreferenceSnapshot(): Language {
  if (inMemoryPreference) return inMemoryPreference;
  return getLanguagePreference({ getItem: (key) => window.localStorage.getItem(key) });
}

function getServerPreferenceSnapshot(): Language {
  return 'en';
}

function subscribeToPreference(callback: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === languageStorageKey || event.key === null) {
      inMemoryPreference = undefined;
      callback();
    }
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(preferenceChangedEvent, callback);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(preferenceChangedEvent, callback);
  };
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const language = useSyncExternalStore(
    subscribeToPreference,
    getPreferenceSnapshot,
    getServerPreferenceSnapshot,
  );

  useEffect(() => {
    document.documentElement.lang = language;
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    const safeLanguage = isLanguage(next) ? next : 'en';
    inMemoryPreference = safeLanguage;
    try {
      window.localStorage.setItem(languageStorageKey, safeLanguage);
    } catch {
      // Private browsing or storage restrictions should not interrupt the app.
    }
    window.dispatchEvent(new Event(preferenceChangedEvent));
  }, []);
  const value = useMemo<I18nContextValue>(() => ({
    language,
    setLanguage,
    t: (key, values) => translate(language, key, values),
  }), [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const context = useContext(I18nContext);
  if (!context) throw new Error('useI18n must be used inside I18nProvider.');
  return context;
}

export function LanguageSelector() {
  const { language, setLanguage, t } = useI18n();
  return (
    <label className="language-selector">
      <span className="sr-only">{t('language.label')}</span>
      <select
        aria-label={t('language.label')}
        value={language}
        onChange={(event) => setLanguage(event.target.value as Language)}
      >
        {languageOptions.map((option) => <option key={option.code} value={option.code}>{option.label}</option>)}
      </select>
    </label>
  );
}
