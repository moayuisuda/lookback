import type { I18nKey } from "../i18n/t";

export type PiCaptainFeatureItem = {
  id: string;
  titleKey: I18nKey;
  descKey: I18nKey;
};

// PiCaptain 功能点的单一数据源，页面只负责按顺序渲染。
export const PICAPTAIN_FEATURE_LIST: PiCaptainFeatureItem[] = [
  {
    id: "daily-collection",
    titleKey: "picaptain.feature.daily.title",
    descKey: "picaptain.feature.daily.desc",
  },
  {
    id: "color-tone-search",
    titleKey: "picaptain.feature.colorTone.title",
    descKey: "picaptain.feature.colorTone.desc",
  },
  {
    id: "value-tone-search",
    titleKey: "picaptain.feature.valueTone.title",
    descKey: "picaptain.feature.valueTone.desc",
  },
  {
    id: "image-search",
    titleKey: "picaptain.feature.imageSearch.title",
    descKey: "picaptain.feature.imageSearch.desc",
  },
];
