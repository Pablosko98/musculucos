import * as Localization from 'expo-localization';
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';
import es from '@/locales/es.json';
import fr from '@/locales/fr.json';

const languageTag = Localization.getLocales()[0]?.languageTag ?? 'en';
const deviceLng = languageTag.startsWith('es') ? 'es' : languageTag.startsWith('fr') ? 'fr' : 'en';

i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es }, fr: { translation: fr } },
  lng: deviceLng,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export const SUPPORTED_LANGUAGES = ['device', 'en', 'es', 'fr'] as const;
export type AppLanguage = typeof SUPPORTED_LANGUAGES[number];

export function getDeviceLanguage(): string {
  return deviceLng;
}

export async function applyStoredLanguage(storedLng: string | null) {
  const effective = (!storedLng || storedLng === 'device') ? deviceLng : storedLng;
  if (i18n.language !== effective) {
    await i18n.changeLanguage(effective);
  }
}

export default i18n;
