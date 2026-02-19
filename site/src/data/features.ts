import type { I18nKey } from '../i18n/t';

export type FeatureItem = {
  id: number;
  image: string;
  layout: 'xl' | 'wide' | 'tall' | 'compact';
  titleKey: I18nKey;
  descKey: I18nKey;
};

// 单一数据源：文案 key 与图片资源都在这里声明，页面仅做渲染。
export const FEATURE_LIST: FeatureItem[] = [
  {
    id: 0,
    image: '/autoLayout.jpg',
    layout: 'xl',
    titleKey: 'feature.0.title',
    descKey: 'feature.0.desc',
  },
  {
    id: 2,
    image: '/anchor.gif',
    layout: 'tall',
    titleKey: 'feature.2.title',
    descKey: 'feature.2.desc',
  },
  {
    id: 1,
    image: '/plugins.jpg',
    layout: 'compact',
    titleKey: 'feature.1.title',
    descKey: 'feature.1.desc',
  },
  {
    id: 3,
    image: '/image-gene.jpg',
    layout: 'wide',
    titleKey: 'feature.3.title',
    descKey: 'feature.3.desc',
  },
  {
    id: 6,
    image: '/on-top.jpg',
    layout: 'compact',
    titleKey: 'feature.6.title',
    descKey: 'feature.6.desc',
  },
  {
    id: 5,
    image: '/image-search.jpg',
    layout: 'wide',
    titleKey: 'feature.5.title',
    descKey: 'feature.5.desc',
  },
  {
    id: 4,
    image: '/moreway-import.jpg',
    layout: 'compact',
    titleKey: 'feature.4.title',
    descKey: 'feature.4.desc',
  },
];
