import { useSnapshot } from 'valtio';
import { siteActions, siteState } from '../store/siteStore';
import { t, type I18nKey } from './t';
import type { I18nParams, Locale } from './types';

export function useT() {
  const snap = useSnapshot(siteState);

  return {
    locale: snap.locale,
    setLocale: (locale: Locale) => siteActions.setLocale(locale),
    t: (key: I18nKey, params?: I18nParams) => t(snap.locale, key, params),
  };
}
