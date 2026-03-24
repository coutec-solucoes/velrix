import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { AppLanguage } from '@/types';
import { getTranslations, TranslationKey, Translations } from '@/i18n/translations';
import { getAppData, onDataChange } from '@/services/storageService';

interface I18nContextType {
  language: AppLanguage;
  t: (key: TranslationKey) => string;
  setLanguage: (lang: AppLanguage) => void;
}

const I18nContext = createContext<I18nContextType>({
  language: 'pt-BR',
  t: (key) => key,
  setLanguage: () => {},
});

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const getInitialLanguage = (): AppLanguage => {
    try {
      const data = getAppData();
      return (data.settings.company as any).language || 'pt-BR';
    } catch {
      return 'pt-BR';
    }
  };

  const [language, setLanguageState] = useState<AppLanguage>(getInitialLanguage);
  const [translations, setTranslations] = useState<Translations>(() => getTranslations(language));

  // Listen for storage changes (e.g. from Supabase sync or other components)
  useEffect(() => {
    const skipUpdate = { current: false };
    
    const unbind = onDataChange((table) => {
      if (table === 'companies' && !skipUpdate.current) {
        const newData = getAppData();
        const newLang = (newData.settings.company as any).language;
        if (newLang && newLang !== language) {
          setLanguageState(newLang);
        }
      }
    });
    return () => unbind();
  }, [language]);

  useEffect(() => {
    setTranslations(getTranslations(language));
  }, [language]);

  const t = useCallback((key: TranslationKey): string => {
    return translations[key] || key;
  }, [translations]);

  const setLanguage = useCallback((lang: AppLanguage) => {
    setLanguageState(lang);
    // Note: We don't automatically save to storage here to avoid feedback loops
    // Language is usually saved via the Settings page which calls updateSettings
  }, []);

  return (
    <I18nContext.Provider value={{ language, t, setLanguage }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
