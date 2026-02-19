import { useSnapshot } from 'valtio';
import { FEATURE_LIST } from './data/features';
import { useT } from './i18n/useT';
import { siteActions, siteState } from './store/siteStore';
import sitePackage from '../package.json';

const LATEST_RELEASE_API = 'https://api.github.com/repos/moayuisuda/lookback/releases/latest';
const LATEST_RELEASE_PAGE = 'https://github.com/moayuisuda/lookback/releases/latest';

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
};

type LatestRelease = {
  html_url: string;
  assets: ReleaseAsset[];
};

function detectPlatform() {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'win';
  return 'other';
}

function pickPlatformAsset(assets: ReleaseAsset[], platform: ReturnType<typeof detectPlatform>) {
  if (platform === 'mac') {
    return assets.find((asset) => asset.name.toLowerCase().endsWith('.dmg')) ?? null;
  }
  if (platform === 'win') {
    return assets.find((asset) => asset.name.toLowerCase().endsWith('.exe')) ?? null;
  }
  return null;
}

function App() {
  const { locale, setLocale, t } = useT();
  const snap = useSnapshot(siteState);
  const activeFeature = FEATURE_LIST[snap.activeFeatureId];

  function jumpToFeatures() {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function jumpToFeature(id: number) {
    siteActions.setActiveFeature(id);
    document.getElementById(`feature-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function downloadByPlatform() {
    const platform = detectPlatform();
    try {
      const resp = await fetch(LATEST_RELEASE_API);
      if (!resp.ok) {
        window.location.assign(LATEST_RELEASE_PAGE);
        return;
      }

      const release = (await resp.json()) as LatestRelease;
      const asset = pickPlatformAsset(release.assets, platform);
      window.location.assign(asset?.browser_download_url ?? release.html_url ?? LATEST_RELEASE_PAGE);
    } catch {
      window.location.assign(LATEST_RELEASE_PAGE);
    }
  }

  return (
    <div className="page-shell">
      <div className="bg-glow bg-glow-a" />
      <div className="bg-glow bg-glow-b" />

      <header className="topbar">
        <div className="brand">
          <img className="brand-icon" src="/icon.png" alt="" aria-hidden="true" />
          <span className="brand-name">{t('nav.brand')}</span>
        </div>
        <div className="topbar-actions">
          <div className="locale-box" aria-label={t('nav.language')}>
            <button
              type="button"
              className={locale === 'zh' ? 'locale-btn active' : 'locale-btn'}
              onClick={() => setLocale('zh')}
            >
              {t('nav.language.zh')}
            </button>
            <button
              type="button"
              className={locale === 'en' ? 'locale-btn active' : 'locale-btn'}
              onClick={() => setLocale('en')}
            >
              {t('nav.language.en')}
            </button>
          </div>
        </div>
      </header>

      <main className="content">
        <section className="hero">
          <div className="hero-copy">
            <p className="hero-badge">{t('hero.badge')}</p>
            <h1>{t('hero.title')}</h1>
            <p className="hero-subtitle">{t('hero.subtitle')}</p>
            <p className="hero-desc">{t('hero.desc')}</p>
            <div className="hero-actions">
              <button type="button" className="hero-btn primary" onClick={downloadByPlatform}>
                {`${t('hero.primary')} ${t('hero.version', { version: sitePackage.version })}`}
              </button>
              <button type="button" className="hero-btn secondary" onClick={jumpToFeatures}>
                {t('hero.secondary')}
              </button>
            </div>
          </div>

          <div className="hero-stage">
            <div className="stage-orbit stage-orbit-a" />
            <div className="stage-orbit stage-orbit-b" />
            <div className="stage-card stage-main">
              <img src="/autoLayout.jpg" alt={t('features.imageAlt', { index: 1 })} />
            </div>
            <div className="stage-card stage-secondary">
              <img src="/stitch-export.jpg" alt={t('hero.previewAlt')} />
            </div>
            <div className="stage-card stage-tertiary">
              <img src="/image-search.jpg" alt={t('hero.searchAlt')} />
            </div>
          </div>
        </section>

        <section className="feature-stage" id="features">
          <aside className="feature-sidebar">
            <p className="feature-sidebar-label">{t('features.jump')}</p>
            <h2>{t('features.title')}</h2>
            <p>{t('features.desc')}</p>
            <div className="feature-jump-list">
              {FEATURE_LIST.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  className={snap.activeFeatureId === feature.id ? 'jump-btn active' : 'jump-btn'}
                  onClick={() => jumpToFeature(feature.id)}
                >
                  <span>{feature.id.toString().padStart(2, '0')}</span>
                  <strong>{t(feature.titleKey)}</strong>
                </button>
              ))}
            </div>
            <div className="feature-focus">
              <div className="feature-focus-media">
                <img
                  src={activeFeature.image}
                  alt={t('features.imageAlt', { index: activeFeature.id + 1 })}
                />
              </div>
              <p>{activeFeature.id.toString().padStart(2, '0')}</p>
              <h3>{t(activeFeature.titleKey)}</h3>
              <p>{t(activeFeature.descKey)}</p>
            </div>
          </aside>

          <div className="feature-canvas">
            {FEATURE_LIST.map((feature) => (
              <article
                key={feature.id}
                id={`feature-${feature.id}`}
                className={
                  snap.activeFeatureId === feature.id
                    ? `feature-card layout-${feature.layout} active`
                    : `feature-card layout-${feature.layout}`
                }
                onMouseEnter={() => siteActions.setActiveFeature(feature.id)}
                onFocus={() => siteActions.setActiveFeature(feature.id)}
                tabIndex={0}
              >
                <div className="feature-card-top">
                  <p>{feature.id.toString().padStart(2, '0')}</p>
                  <h3>{t(feature.titleKey)}</h3>
                </div>
                <div className="feature-media">
                  <img src={feature.image} alt={t('features.imageAlt', { index: feature.id + 1 })} />
                </div>
                <p className="feature-desc">{t(feature.descKey)}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="footer">{t('footer.line')}</footer>
    </div>
  );
}

export default App;
