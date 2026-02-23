import type { I18nKey } from '../i18n/t';

export type FeatureItem = {
  id: number;
  image: string;
  layout: 'xl' | 'wide' | 'tall' | 'compact';
  titleKey: I18nKey;
  descKey: I18nKey;
  shortcutKeys?: I18nKey[];
};

// 单一数据源：文案 key 与图片资源都在这里声明，页面仅做渲染。
export const FEATURE_LIST: FeatureItem[] = [
  {
    id: 0,
    image: '/autoLayout.webp',
    layout: 'xl',
    titleKey: 'feature.0.title',
    descKey: 'feature.0.desc',
    shortcutKeys: ['feature.0.shortcut.0'],
  },
  {
    id: 2,
    image: '/anchor.webp',
    layout: 'tall',
    titleKey: 'feature.2.title',
    descKey: 'feature.2.desc',
    shortcutKeys: ['feature.2.shortcut.0', 'feature.2.shortcut.1'],
  },
  {
    id: 1,
    image: '/plugins.webp',
    layout: 'compact',
    titleKey: 'feature.1.title',
    descKey: 'feature.1.desc',
    shortcutKeys: ['feature.1.shortcut.0'],
  },
  {
    id: 3,
    image: '/image-gene.webp',
    layout: 'wide',
    titleKey: 'feature.3.title',
    descKey: 'feature.3.desc',
  },
  {
    id: 6,
    image: '/on-top.webp',
    layout: 'compact',
    titleKey: 'feature.6.title',
    descKey: 'feature.6.desc',
    shortcutKeys: ['feature.6.shortcut.0'],
  },
  {
    id: 5,
    image: '/image-search.webp',
    layout: 'wide',
    titleKey: 'feature.5.title',
    descKey: 'feature.5.desc',
  },
  {
    id: 4,
    image: '/moreway-import.webp',
    layout: 'compact',
    titleKey: 'feature.4.title',
    descKey: 'feature.4.desc',
  },
];
