import { useSnapshot } from 'valtio';
import { FEATURE_LIST } from './data/features';
import { useT } from './i18n/useT';
import { siteActions, siteState } from './store/siteStore';

function App() {
  const { locale, setLocale, t } = useT();
  const snap = useSnapshot(siteState);

  function jumpToFeatures() {
    document.getElementById('features')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function jumpToFeature(id: number) {
    siteActions.setActiveFeature(id);
    document.getElementById(`feature-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="page-shell">
      <div className="bg-glow bg-glow-a" />
      <div className="bg-glow bg-glow-b" />

      <header className="topbar">
        <div className="brand">
          <span className="brand-dot" />
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
          <button type="button" className="nav-cta">
            {t('nav.cta')}
          </button>
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
              <button type="button" className="hero-btn primary">
                {t('hero.primary')}
              </button>
              <button type="button" className="hero-btn secondary" onClick={jumpToFeatures}>
                {t('hero.secondary')}
              </button>
            </div>
            <ul className="hero-meta">
              <li>{t('hero.meta.one')}</li>
              <li>{t('hero.meta.two')}</li>
              <li>{t('hero.meta.three')}</li>
            </ul>
          </div>

          <div className="hero-visual">
            <div className="hero-visual-card hero-visual-main">
              <img src="/stitch-export.jpg" alt={t('hero.previewAlt')} />
            </div>
            <div className="hero-visual-card hero-visual-float">
              <img src="/image-search.jpg" alt={t('hero.searchAlt')} />
            </div>
          </div>
        </section>

        <section className="feature-head" id="features">
          <h2>{t('features.title')}</h2>
          <p>{t('features.desc')}</p>
          <div className="feature-jump">
            <span>{t('features.jump')}</span>
            <div className="feature-jump-list">
              {FEATURE_LIST.map((feature) => (
                <button
                  key={feature.id}
                  type="button"
                  className={snap.activeFeatureId === feature.id ? 'jump-btn active' : 'jump-btn'}
                  onClick={() => jumpToFeature(feature.id)}
                >
                  {feature.id}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="feature-list">
          {FEATURE_LIST.map((feature) => (
            <article
              key={feature.id}
              id={`feature-${feature.id}`}
              className={snap.activeFeatureId === feature.id ? 'feature-card active' : 'feature-card'}
              onMouseEnter={() => siteActions.setActiveFeature(feature.id)}
            >
              <div className="feature-media">
                <img src={feature.image} alt={t('features.imageAlt', { index: feature.id + 1 })} />
              </div>
              <div className="feature-body">
                <p className="feature-index">{feature.id.toString().padStart(2, '0')}</p>
                <h3>{t(feature.titleKey)}</h3>
                <p>{t(feature.descKey)}</p>
              </div>
            </article>
          ))}
        </section>
      </main>

      <footer className="footer">{t('footer.line')}</footer>
    </div>
  );
}

export default App;
