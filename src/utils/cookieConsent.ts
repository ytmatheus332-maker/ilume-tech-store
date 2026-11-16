export const COOKIE_CONSENT_STORAGE_KEY = "ilume_cookie_consent_v1";
export const COOKIE_POLICY_VERSION = "2026-11-16";
export const COOKIE_SETTINGS_EVENT = "ilume:open-cookie-preferences";

export type OptionalCookieCategory = "functional" | "analytics" | "marketing";

export interface CookieConsentRecord {
  version: string;
  savedAt: string;
  necessary: true;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

export type OptionalCookieChoices = Pick<CookieConsentRecord, OptionalCookieCategory>;

export function readCookieConsent(): CookieConsentRecord | null {
  try {
    const raw = window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CookieConsentRecord>;
    if (
      value.version !== COOKIE_POLICY_VERSION ||
      typeof value.functional !== "boolean" ||
      typeof value.analytics !== "boolean" ||
      typeof value.marketing !== "boolean"
    ) return null;

    return {
      version: COOKIE_POLICY_VERSION,
      savedAt: typeof value.savedAt === "string" ? value.savedAt : "",
      necessary: true,
      functional: value.functional,
      analytics: value.analytics,
      marketing: value.marketing,
    };
  } catch {
    return null;
  }
}

export function saveCookieConsent(choices: OptionalCookieChoices): CookieConsentRecord {
  const record: CookieConsentRecord = {
    version: COOKIE_POLICY_VERSION,
    savedAt: new Date().toISOString(),
    necessary: true,
    functional: choices.functional,
    analytics: choices.analytics,
    marketing: choices.marketing,
  };
  window.localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(record));
  return record;
}

/** Future optional integrations must check this before loading scripts or setting storage. */
export function hasCookieConsent(category: "necessary" | OptionalCookieCategory): boolean {
  if (category === "necessary") return true;
  return readCookieConsent()?.[category] === true;
}
