import { en, zh } from './messages';
import type { I18nParams, Locale } from './types';

const dictionaries = {
  en,
  zh,
} as const;

export type I18nKey = keyof typeof en;

export function t(locale: Locale, key: I18nKey, params?: I18nParams): string {
  const template = dictionaries[locale][key];
  if (!params) return template;
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (match, name) => {
    const value = params[name];
    return value === undefined || value === null ? match : String(value);
  });
}
