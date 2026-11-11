/**
 * Locale codes are BCP 47 tags ("id", "en", "pt-BR"). Comparison is case-insensitive; the canonical spelling is
 * language in lower case and region in upper case.
 */
export type Dir = "ltr" | "rtl"
export type LocaleSetting = { code: string; name: string; dir: Dir; enabled: boolean; rank: number }

const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ku", "ckb"])

/** "EN-us" → "en-US", "id" → "id"; null when it is not a plausible BCP 47 tag */
export function normalizeLocale(code: unknown): string | null {
  if (typeof code !== "string") return null
  const raw = code.trim().replace(/_/g, "-")
  if (!/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/.test(raw)) return null
  const [lang, ...rest] = raw.split("-")
  const parts = rest.map((p) => (p.length === 2 ? p.toUpperCase() : p.length === 4 ? p[0].toUpperCase() + p.slice(1).toLowerCase() : p.toLowerCase()))
  return [lang.toLowerCase(), ...parts].join("-")
}

export const languageOf = (code: string) => code.split("-")[0].toLowerCase()

/** Right-to-left for Arabic, Hebrew, Persian, Urdu, …; can be overridden per locale in the settings */
export const defaultDir = (code: string): Dir => (RTL_LANGUAGES.has(languageOf(code)) ? "rtl" : "ltr")

/** A readable name for well-known codes (settings show it until the admin writes a better one) */
export function defaultLocaleName(code: string): string {
  try {
    const dn = new Intl.DisplayNames([code], { type: "language" })
    const name = dn.of(code)
    if (name && name.toLowerCase() !== code.toLowerCase()) return name[0].toUpperCase() + name.slice(1)
  } catch {}
  return code
}

/**
 * Picks the enabled locale a request asked for: exact code first, then the same language ("en-GB" → "en",
 * "en" → "en-US"), else the default. Returns the canonical code of the settings entry.
 */
export function matchLocale(requested: unknown, locales: Pick<LocaleSetting, "code" | "enabled">[], fallback: string): string {
  const wanted = normalizeLocale(requested)
  const enabled = locales.filter((l) => l.enabled !== false)
  if (!wanted) return fallback
  const exact = enabled.find((l) => l.code.toLowerCase() === wanted.toLowerCase())
  if (exact) return exact.code
  const lang = languageOf(wanted)
  const sameLanguage = enabled.find((l) => languageOf(l.code) === lang)
  return sameLanguage ? sameLanguage.code : fallback
}
