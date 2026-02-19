import { proxy } from 'valtio';
import type { Locale } from '../i18n/types';

type SiteState = {
  locale: Locale;
  activeFeatureId: number;
};

export const siteState = proxy<SiteState>({
  locale: 'zh',
  activeFeatureId: 0,
});

export const siteActions = {
  setLocale(locale: Locale) {
    siteState.locale = locale;
  },
  setActiveFeature(id: number) {
    siteState.activeFeatureId = id;
  },
};
