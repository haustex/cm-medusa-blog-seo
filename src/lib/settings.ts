import type { MedusaContainer } from "@medusajs/framework/types"
import { BLOG_SEO_MODULE } from "../modules/blog-seo"
import { defaultDir, defaultLocaleName, normalizeLocale, type LocaleSetting } from "./locales"
import { getOptions, resolveRouting, type FallbackMode, type ResolvedRouting, type RoutingOptions } from "./options"
import { BlogRuleError } from "./schedule"

/**
 * The blog's language settings as they apply: plugin options win (and lock the field in the Admin), then the
 * settings row written by the Admin, then defaults (one locale "en", fallback "default").
 */
export type BlogSettings = {
  locales: LocaleSetting[]
  default_locale: string
  fallback: FallbackMode
  routing: ResolvedRouting
  /** Where uploaded images are served from: plugin option + what uploads taught us (settings.metadata) */
  image_origins: string[]
  locked: { locales: boolean; default_locale: boolean; fallback: boolean }
}

type SettingsRow = { id: string; locales: unknown; default_locale: string | null; fallback: string | null; routing: unknown; metadata?: Record<string, unknown> | null }
type Service = {
  listBseoSettings: (f: Record<string, unknown>, c?: Record<string, unknown>) => Promise<SettingsRow[]>
  createBseoSettings: (d: Record<string, unknown>) => Promise<SettingsRow>
  updateBseoSettings: (d: Record<string, unknown>) => Promise<SettingsRow>
}

const service = (container: MedusaContainer) => container.resolve<Service>(BLOG_SEO_MODULE)

/** Cleans a list of locale settings: valid codes, no duplicates, names and directions filled in, ranked in order */
export function cleanLocales(input: unknown): LocaleSetting[] {
  if (!Array.isArray(input)) return []
  const seen = new Set<string>()
  const out: LocaleSetting[] = []
  for (const raw of input) {
    const r = (raw && typeof raw === "object" ? raw : { code: raw }) as Record<string, unknown>
    const code = normalizeLocale(r.code)
    if (!code || seen.has(code.toLowerCase())) continue
    seen.add(code.toLowerCase())
    const name = typeof r.name === "string" && r.name.trim() ? r.name.trim().slice(0, 80) : defaultLocaleName(code)
    out.push({ code, name, dir: r.dir === "rtl" || r.dir === "ltr" ? r.dir : defaultDir(code), enabled: r.enabled !== false, rank: out.length })
  }
  return out
}

const DEFAULT_LOCALES: LocaleSetting[] = [{ code: "en", name: "English", dir: "ltr", enabled: true, rank: 0 }]

export function mergeSettings(row: SettingsRow | null | undefined, container: MedusaContainer): BlogSettings {
  const options = getOptions(container)
  const locked = options.locked
  const rowLocales = cleanLocales(row?.locales)
  let locales: LocaleSetting[]
  if (locked?.locales.length) {
    // names/dirs the Admin stored for the same codes are kept unless the option sets them
    locales = cleanLocales(
      locked.locales.map((l) => {
        const stored = rowLocales.find((s) => s.code.toLowerCase() === (normalizeLocale(l.code) ?? "").toLowerCase())
        return { code: l.code, name: l.name ?? stored?.name, dir: l.dir ?? stored?.dir, enabled: true }
      })
    )
  } else locales = rowLocales.length ? rowLocales : DEFAULT_LOCALES
  const enabled = locales.filter((l) => l.enabled)
  const wantedDefault = normalizeLocale(locked?.default_locale) ?? normalizeLocale(row?.default_locale)
  const default_locale = (enabled.find((l) => l.code.toLowerCase() === wantedDefault?.toLowerCase()) ?? enabled[0] ?? locales[0] ?? DEFAULT_LOCALES[0]).code
  const fallback: FallbackMode = locked?.fallback ?? (row?.fallback === "hide" || row?.fallback === "label" || row?.fallback === "default" ? row.fallback : "default")
  // plugin options win over what the Admin stored, field by field
  const routing = resolveRouting({ ...((row?.routing as RoutingOptions | null) ?? {}), ...options.routing_raw })
  const learned = Array.isArray(row?.metadata?.image_origins) ? (row!.metadata!.image_origins as unknown[]).filter((x): x is string => typeof x === "string") : []
  return {
    locales,
    default_locale,
    fallback,
    routing,
    image_origins: Array.from(new Set([...options.content.image_origins, ...learned])),
    locked: { locales: !!locked?.locales.length, default_locale: !!locked?.default_locale || !!locked?.locales.length, fallback: !!locked?.fallback },
  }
}

export async function getSettings(container: MedusaContainer): Promise<BlogSettings> {
  const [row] = await service(container).listBseoSettings({}, { take: 1, order: { created_at: "ASC" } })
  return mergeSettings(row, container)
}

/** Admin → Settings. Locked fields are refused. */
export async function saveSettings(container: MedusaContainer, input: { locales?: unknown; default_locale?: unknown; fallback?: unknown; routing?: unknown }): Promise<BlogSettings> {
  const svc = service(container)
  const [row] = await svc.listBseoSettings({}, { take: 1, order: { created_at: "ASC" } })
  const current = mergeSettings(row, container)
  const patch: Record<string, unknown> = {}
  if (input.locales !== undefined) {
    if (current.locked.locales) throw new BlogRuleError("locked", "locales are set in the plugin options")
    const locales = cleanLocales(input.locales)
    if (!locales.some((l) => l.enabled)) throw new BlogRuleError("invalid", "at least one enabled locale is needed")
    patch.locales = locales
  }
  if (input.default_locale !== undefined) {
    if (current.locked.default_locale) throw new BlogRuleError("locked", "default_locale is set in the plugin options")
    const code = normalizeLocale(input.default_locale)
    const locales = (patch.locales as LocaleSetting[] | undefined) ?? current.locales
    if (!code || !locales.some((l) => l.enabled && l.code.toLowerCase() === code.toLowerCase())) throw new BlogRuleError("locale_unknown", String(input.default_locale))
    patch.default_locale = locales.find((l) => l.code.toLowerCase() === code.toLowerCase())!.code
  }
  if (input.fallback !== undefined) {
    if (current.locked.fallback) throw new BlogRuleError("locked", "fallback is set in the plugin options")
    if (input.fallback !== "default" && input.fallback !== "hide" && input.fallback !== "label") throw new BlogRuleError("invalid", "fallback must be default, hide or label")
    patch.fallback = input.fallback
  }
  if (input.routing !== undefined) patch.routing = input.routing && typeof input.routing === "object" ? input.routing : null
  if (row) await svc.updateBseoSettings({ id: row.id, ...patch })
  else await svc.createBseoSettings({ locales: patch.locales ?? current.locales, default_locale: patch.default_locale ?? current.default_locale, fallback: patch.fallback ?? current.fallback, routing: patch.routing ?? null })
  return getSettings(container)
}

export const enabledCodes = (s: BlogSettings) => s.locales.filter((l) => l.enabled).map((l) => l.code)
export const localeOf = (s: BlogSettings, code: string) => s.locales.find((l) => l.code.toLowerCase() === code.toLowerCase())

/** Remember the origin of an uploaded file, so images from there pass the sanitizer (at most 8 origins) */
export async function learnImageOrigin(container: MedusaContainer, fileUrl: string): Promise<void> {
  let origin: string
  try {
    const u = new URL(fileUrl)
    origin = `${u.origin}${u.pathname.replace(/\/[^/]*$/, "")}`
  } catch {
    return
  }
  const svc = service(container)
  const [row] = await svc.listBseoSettings({}, { take: 1, order: { created_at: "ASC" } })
  const known = Array.isArray(row?.metadata?.image_origins) ? (row!.metadata!.image_origins as string[]) : []
  if (known.includes(origin)) return
  const metadata = { ...(row?.metadata ?? {}), image_origins: [...known, origin].slice(-8) }
  if (row) await svc.updateBseoSettings({ id: row.id, metadata })
  else {
    const s = mergeSettings(null, container)
    await svc.createBseoSettings({ locales: s.locales, default_locale: s.default_locale, fallback: s.fallback, routing: null, metadata })
  }
}
