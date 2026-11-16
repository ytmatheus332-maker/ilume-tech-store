import { Link } from "react-router-dom";
import { COOKIE_SETTINGS_EVENT } from "../utils/cookieConsent";
import "./SiteFooter.css";

const legalLinks = [
  ["Termos de Uso", "/termos-de-uso"],
  ["Privacidade", "/politica-de-privacidade"],
  ["Cookies", "/politica-de-cookies"],
  ["Entrega e frete", "/entrega-e-frete"],
  ["Trocas e devoluções", "/trocas-e-devolucoes"],
  ["Garantia", "/garantia"],
] as const;

export default function SiteFooter() {
  function openCookiePreferences() {
    window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
  }

  return (
    <footer className="footer site-footer">
      <Link className="site-footer-brand" to="/">ILUME</Link>
      <p>Tecnologia. Sem excessos.</p>

      <div className="footer-signature">
        <strong>ILUME AUTHENTIC</strong>
        <span>SELEÇÃO COM CRITÉRIO</span>
      </div>

      <nav className="site-footer-links" aria-label="Informações institucionais">
        {legalLinks.map(([label, path]) => <Link key={path} to={path}>{label}</Link>)}
      </nav>

      <a className="site-footer-email" href="mailto:suporteilumeonline@gmail.com">suporteilumeonline@gmail.com</a>
      <button className="site-footer-cookie-link" type="button" onClick={openCookiePreferences}>Preferências de cookies</button>
      <small>© 2026 ILUME TECH STORE.</small>
    </footer>
  );
}
