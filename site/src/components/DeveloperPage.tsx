import { useSnapshot } from "valtio";
import { useT } from "../i18n/useT";
import { siteActions, siteState } from "../store/siteStore";

const PLUGIN_TYPES = [
  {
    id: "jsx",
    titleKey: "developer.jsx.title",
    descriptionKey: "developer.jsx.desc",
    reasonTitleKey: "developer.jsx.reasonTitle",
    outputKey: "developer.jsx.output",
    reasonKeys: [
      "developer.jsx.reason.1",
      "developer.jsx.reason.2",
      "developer.jsx.reason.3",
    ],
  },
  {
    id: "folder",
    titleKey: "developer.folder.title",
    descriptionKey: "developer.folder.desc",
    reasonTitleKey: "developer.folder.reasonTitle",
    outputKey: "developer.folder.output",
    reasonKeys: [
      "developer.folder.reason.1",
      "developer.folder.reason.2",
      "developer.folder.reason.3",
    ],
  },
] as const;

export function DeveloperPage() {
  const { t } = useT();
  const snap = useSnapshot(siteState);

  return (
    <section className="developer-page" aria-labelledby="developer-title">
      <div className="developer-glow developer-glow-a" />
      <div className="developer-glow developer-glow-b" />

      <header className="developer-head">
        <p className="developer-badge">{t("developer.badge")}</p>
        <h2 id="developer-title">{t("developer.title")}</h2>
        <p>{t("developer.desc")}</p>
      </header>

      <div
        className="developer-decision"
        aria-label={t("developer.decisionAria")}
      >
        <div>
          <span>{t("developer.decision.no")}</span>
          <i aria-hidden="true">→</i>
          <b>{t("developer.decision.jsx")}</b>
        </div>
        <div>
          <span>{t("developer.decision.yes")}</span>
          <i aria-hidden="true">→</i>
          <b>{t("developer.decision.folder")}</b>
        </div>
      </div>

      <div className="developer-grid">
        {PLUGIN_TYPES.map((plugin, index) => (
          <article
            key={plugin.id}
            className="developer-card"
            style={{ animationDelay: `${index * 90}ms` }}
          >
            <h3>{t(plugin.titleKey)}</h3>
            <p>{t(plugin.descriptionKey)}</p>
            <strong className="developer-reason-title">
              {t(plugin.reasonTitleKey)}
            </strong>
            <ul className="developer-reason-list">
              {plugin.reasonKeys.map((reasonKey) => (
                <li key={reasonKey}>{t(reasonKey)}</li>
              ))}
            </ul>
            <div className="developer-card-output">
              <strong>{t("developer.outputLabel")}</strong>
              <span>{t(plugin.outputKey)}</span>
            </div>
            <button
              type="button"
              className="developer-doc-link"
              disabled={snap.developerDocCopyingId !== null}
              onClick={() => {
                void siteActions.copyDeveloperDoc(plugin.id);
              }}
            >
              <span>
                {snap.developerDocCopyingId === plugin.id
                  ? t("developer.copyingDoc")
                  : snap.developerDocCopiedId === plugin.id
                    ? t("developer.copiedDoc")
                    : snap.developerDocCopyErrorId === plugin.id
                      ? t("developer.copyDocRetry")
                      : t("developer.copyDoc")}
              </span>
              <b aria-hidden="true">⧉</b>
            </button>
          </article>
        ))}
      </div>

      <aside className="developer-note">
        <span aria-hidden="true">✦</span>
        <p>{t("developer.note")}</p>
      </aside>
    </section>
  );
}
