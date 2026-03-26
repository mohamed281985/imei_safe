
import React, { createContext, useState, useContext, useEffect } from 'react';
import i18next from 'i18next';
import enTranslations from '../translations/en';
import arTranslations from '../translations/ar';
import frTranslations from '../translations/fr';
import hiTranslations from '../translations/hi';

export type LanguageCode = 'en' | 'ar' | 'fr' | 'hi';

interface Translations {
  [key: string]: string;
}

interface LanguageContextType {
  language: LanguageCode;
  translations: Translations;
  changeLanguage: (lang: LanguageCode) => void;
  t: (key: string, options?: { [key: string]: string }) => string;
}

const translations = {
  en: enTranslations,
  ar: arTranslations,
  fr: frTranslations,
  hi: hiTranslations
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguage] = useState<LanguageCode>(() => {
    const savedLang = localStorage.getItem('language') as LanguageCode;
    return savedLang || 'en';
  });

  useEffect(() => {
    localStorage.setItem('language', language);
    document.documentElement.dir = language === 'ar' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    i18next.changeLanguage(language);
  }, [language]);

  const changeLanguage = (lang: LanguageCode) => {
    setLanguage(lang);
    i18next.changeLanguage(lang);
  };

  const t = (key: string, options?: { [key: string]: string }): string => {
    let translatedString = translations[language][key] || key;

    if (options) {
      for (const optionKey in options) {
        translatedString = translatedString.replace(`{{${optionKey}}}`, options[optionKey]);
      }
    }
    return translatedString;
  };

  const value = {
    language,
    translations: translations[language],
    changeLanguage,
    t
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
};
