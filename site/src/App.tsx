import { useEffect } from 'react';
import { useSnapshot } from 'valtio';
import { FEATURE_LIST } from './data/features';
import { useT } from './i18n/useT';
import {
  LATEST_RELEASE_PAGE,
  siteActions,
  siteState,
  type FaqPlatform,
  type Platform,
} from './store/siteStore';
import sitePackage from '../package.json';

function detectPlatform(): Platform {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('mac')) return 'mac';
  if (ua.includes('win')) return 'win';
  return 'other';
}

function App() {
  const { locale, setLocale, t } = useT();
  const snap = useSnapshot(siteState);

  useEffect(() => {
    // 先显示本地版本，随后异步刷新为最新 release 版本。
    siteActions.setLocalVersion(sitePackage.version);
    siteActions.setFaqPlatform(detectPlatform() === 'win' ? 'win' : 'mac');
    void siteActions.loadLatestRelease();
  }, []);

  function jumpToFeatures() {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function jumpToFeature(id: number) {
    siteActions.setActiveFeature(id);
    document.getElementById(`feature-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function downloadByPlatform() {
    const platform = detectPlatform();
    const downloadUrl = await siteActions.resolveDownloadUrl(platform);
    window.location.assign(downloadUrl);
  }

  function switchFaqPlatform(platform: FaqPlatform) {
    siteActions.setFaqPlatform(platform);
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
                {`${t('hero.primary')} ${t('hero.version', { version: snap.releaseVersion })}`}
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
                {feature.shortcutKeys && feature.shortcutKeys.length > 0 && (
                  <div className="feature-shortcuts">
                    <p>{t('features.shortcutLabel')}</p>
                    <ul>
                      {feature.shortcutKeys.map((shortcutKey) => (
                        <li key={shortcutKey}>{t(shortcutKey)}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="download-guide" aria-labelledby="download-guide-title">
          <div className="download-guide-head">
            <p className="download-guide-badge">{t('download.badge')}</p>
            <h2 id="download-guide-title">{t('download.title')}</h2>
            <p>{t('download.desc')}</p>
            <div className="download-guide-actions">
              <button type="button" className="hero-btn primary" onClick={downloadByPlatform}>
                {`${t('hero.primary')} ${t('hero.version', { version: snap.releaseVersion })}`}
              </button>
              <a
                className="download-guide-release"
                href={LATEST_RELEASE_PAGE}
                target="_blank"
                rel="noopener noreferrer"
              >
                {t('download.release')}
              </a>
            </div>
          </div>
          <ol className="download-guide-list">
            <li>
              <h3>{t('download.step.1.title')}</h3>
              <p>{t('download.step.1.desc')}</p>
            </li>
            <li>
              <h3>{t('download.step.2.title')}</h3>
              <p>{t('download.step.2.desc')}</p>
            </li>
            <li>
              <h3>{t('download.step.3.title')}</h3>
              <p>{t('download.step.3.desc')}</p>
            </li>
          </ol>
          <div className="download-faq" aria-labelledby="download-faq-title">
            <div className="download-faq-head">
              <h3 id="download-faq-title">{t('download.faq.title')}</h3>
              <div className="download-faq-tabs" role="tablist" aria-label={t('download.faq.tabLabel')}>
                <button
                  type="button"
                  role="tab"
                  aria-selected={snap.faqPlatform === 'mac'}
                  className={snap.faqPlatform === 'mac' ? 'download-faq-tab active' : 'download-faq-tab'}
                  onClick={() => switchFaqPlatform('mac')}
                >
                  {t('download.faq.tab.mac')}
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={snap.faqPlatform === 'win'}
                  className={snap.faqPlatform === 'win' ? 'download-faq-tab active' : 'download-faq-tab'}
                  onClick={() => switchFaqPlatform('win')}
                >
                  {t('download.faq.tab.win')}
                </button>
              </div>
            </div>
            <p className="download-faq-desc">{t('download.faq.desc')}</p>
            <article className="download-faq-item">
              <h4>{snap.faqPlatform === 'mac' ? t('download.faq.mac.title') : t('download.faq.win.title')}</h4>
              <ol>
                <li>
                  {snap.faqPlatform === 'mac'
                    ? t('download.faq.mac.step.1')
                    : t('download.faq.win.step.1')}
                </li>
                <li>
                  {snap.faqPlatform === 'mac'
                    ? t('download.faq.mac.step.2')
                    : t('download.faq.win.step.2')}
                </li>
              </ol>
            </article>
          </div>
        </section>
      </main>

      <footer className="footer">
        <p className="footer-line">{t('footer.line')}</p>
        <div className="footer-meta">
          <a className="footer-link" href="mailto:ahhcr68@gmail.com">
            {t('footer.contact')}
          </a>
          <p>{t('footer.copyright')}</p>
        </div>
        <a
          href="https://afdian.com/a/rinnko"
          className="sponsor-link"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t('footer.sponsor')}
        >
          <img
            width={200}
            src="https://pic1.afdiancdn.com/static/img/welcome/button-sponsorme.png"
            alt={t('footer.sponsor')}
          />
        </a>
      </footer>
    </div>
  );
}

export default App;
