import { proxy } from 'valtio';
import type { Locale } from '../i18n/types';

export const LATEST_RELEASE_API = 'https://api.github.com/repos/moayuisuda/lookback-release/releases/latest';
export const LATEST_RELEASE_PAGE = 'https://github.com/moayuisuda/lookback-release/releases/latest';

export type Platform = 'mac' | 'win' | 'other';

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type LatestReleaseApi = {
  tag_name: string;
  html_url: string;
  assets: ReleaseAsset[];
};

type LatestRelease = {
  tagName: string;
  htmlUrl: string;
  assets: ReleaseAsset[];
};

type SiteState = {
  locale: Locale;
  activeFeatureId: number;
  release: LatestRelease | null;
  releaseVersion: string;
};

export const siteState = proxy<SiteState>({
  locale: 'zh',
  activeFeatureId: 0,
  release: null,
  releaseVersion: '',
});

function normalizeVersion(tagName: string) {
  return tagName.replace(/^v/i, '');
}

export const siteActions = {
  setLocale(locale: Locale) {
    siteState.locale = locale;
  },
  setActiveFeature(id: number) {
    siteState.activeFeatureId = id;
  },
  setLocalVersion(version: string) {
    siteState.releaseVersion = version;
  },
  setLatestRelease(release: LatestRelease) {
    siteState.release = release;
    siteState.releaseVersion = normalizeVersion(release.tagName);
  },
  async loadLatestRelease() {
    try {
      const resp = await fetch(LATEST_RELEASE_API);
      if (!resp.ok) return null;
      const raw = (await resp.json()) as LatestReleaseApi;
      const release: LatestRelease = {
        tagName: raw.tag_name,
        htmlUrl: raw.html_url,
        assets: raw.assets,
      };
      siteActions.setLatestRelease(release);
      return release;
    } catch {
      return null;
    }
  },
  pickPlatformAsset(assets: ReleaseAsset[], platform: Platform) {
    if (platform === 'mac') {
      return assets.find((asset) => asset.name.toLowerCase().endsWith('.dmg')) ?? null;
    }
    if (platform === 'win') {
      return assets.find((asset) => asset.name.toLowerCase().endsWith('.exe')) ?? null;
    }
    return null;
  },
  async resolveDownloadUrl(platform: Platform) {
    const release = siteState.release ?? (await siteActions.loadLatestRelease());
    if (!release) return LATEST_RELEASE_PAGE;
    const asset = siteActions.pickPlatformAsset(release.assets, platform);
    return asset?.browser_download_url ?? release.htmlUrl;
  },
};
