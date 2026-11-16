import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  COOKIE_SETTINGS_EVENT,
  readCookieConsent,
  saveCookieConsent,
  type CookieConsentRecord,
  type OptionalCookieChoices,
} from "../utils/cookieConsent";
import "./CookieConsent.css";

const noOptionalCookies: OptionalCookieChoices = {
  functional: false,
  analytics: false,
  marketing: false,
};

const cookieCategories: {
  key: keyof OptionalCookieChoices;
  title: string;
  description: string;
}[] = [
  { key: "functional", title: "Funcionais", description: "Podem lembrar escolhas e aprimorar recursos opcionais da experiência." },
  { key: "analytics", title: "Analíticos", description: "Podem medir o uso da loja para compreender seu desempenho." },
  { key: "marketing", title: "Publicidade e marketing", description: "Podem apoiar campanhas e medir sua efetividade." },
];

export default function CookieConsent() {
  const [consent, setConsent] = useState<CookieConsentRecord | null>(() => readCookieConsent());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [draft, setDraft] = useState<OptionalCookieChoices>(() => readCookieConsent() ?? noOptionalCookies);
  const [storageError, setStorageError] = useState(false);

  useEffect(() => {
    const openSettings = () => {
      setDraft(readCookieConsent() ?? noOptionalCookies);
      setSettingsOpen(true);
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, openSettings);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, openSettings);
  }, []);

  function commit(choices: OptionalCookieChoices) {
    try {
      const saved = saveCookieConsent(choices);
      setConsent(saved);
      setStorageError(false);
      setSettingsOpen(false);
    } catch {
      setStorageError(true);
    }
  }

  function openSettings() {
    setDraft(consent ?? noOptionalCookies);
    setSettingsOpen(true);
  }

  const showBanner = consent === null;

  return (
    <>
      {showBanner && (
        <aside className="cookie-banner" aria-label="Preferências de cookies">
          <div className="cookie-banner-copy">
            <span className="cookie-eyebrow">PRIVACIDADE ILUME</span>
            <h2>Você escolhe como usamos tecnologias opcionais.</h2>
            <p>
              Usamos armazenamento necessário para manter recursos essenciais. Não encontramos ferramentas de análise ou publicidade instaladas nesta versão. Veja a <Link to="/politica-de-cookies">Política de Cookies</Link>.
            </p>
            {storageError && <p className="cookie-error" role="alert">Não foi possível salvar sua escolha neste navegador. Verifique as configurações de armazenamento e tente novamente.</p>}
          </div>
          <div className="cookie-banner-actions">
            <button type="button" className="cookie-button cookie-button-primary" onClick={() => commit({ functional: true, analytics: true, marketing: true })}>Aceitar todos</button>
            <button type="button" className="cookie-button" onClick={() => commit(noOptionalCookies)}>Rejeitar não essenciais</button>
            <button type="button" className="cookie-button cookie-button-text" onClick={openSettings}>Personalizar preferências</button>
          </div>
        </aside>
      )}

      {settingsOpen && (
        <div className="cookie-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
          <section className="cookie-dialog" role="dialog" aria-modal="true" aria-labelledby="cookie-dialog-title">
            <span className="cookie-eyebrow">CONTROLE DE PRIVACIDADE</span>
            <h2 id="cookie-dialog-title">Preferências de cookies</h2>
            <p className="cookie-dialog-intro">As categorias opcionais começam desativadas. Você pode alterar sua escolha a qualquer momento pelo rodapé da loja.</p>

            <div className="cookie-category-list">
              <div className="cookie-category-row">
                <div><strong>Necessários</strong><p>Recursos indispensáveis ao funcionamento, à segurança e ao registro desta escolha.</p></div>
                <input type="checkbox" checked disabled aria-label="Cookies necessários sempre ativos" />
              </div>
              {cookieCategories.map(({ key, title, description }) => (
                <label className="cookie-category-row" key={key}>
                  <span><strong>{title}</strong><p>{description}</p></span>
                  <input
                    type="checkbox"
                    checked={draft[key]}
                    onChange={(event) => setDraft((previous) => ({ ...previous, [key]: event.target.checked }))}
                    aria-label={`Permitir categoria ${title}`}
                  />
                </label>
              ))}
            </div>

            {storageError && <p className="cookie-error" role="alert">Não foi possível salvar sua escolha neste navegador. Tente novamente.</p>}
            <div className="cookie-dialog-actions">
              <button type="button" className="cookie-button" onClick={() => setSettingsOpen(false)}>Cancelar</button>
              <button type="button" className="cookie-button" onClick={() => commit(noOptionalCookies)}>Rejeitar não essenciais</button>
              <button type="button" className="cookie-button cookie-button-primary" onClick={() => commit(draft)}>Salvar preferências</button>
            </div>
            <p className="cookie-dialog-note">Os recursos necessários não dependem de consentimento. Nenhuma ferramenta de análise ou publicidade está instalada nesta versão.</p>
          </section>
        </div>
      )}
    </>
  );
}
