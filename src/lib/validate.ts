import { hasContent } from "./render"
import { isValidSlug } from "./slug"

/**
 * "Complete" per locale: title and body, plus the excerpt when the plugin requires one. Once per post: a valid slug
 * in that locale and, when required, the cover. SEO fields, tags, alt texts and the wide cover are optional.
 */
export type TranslationContent = { locale: string; title?: string | null; slug?: string | null; excerpt?: string | null; body?: string | null }
export type PostContent = { cover?: string | null; translations?: TranslationContent[] | null }
export type MissingField = "title" | "excerpt" | "body" | "slug"
export type LocaleCompleteness = { locale: string; present: boolean; missing: MissingField[] }
export type Completeness = {
  /** The default locale is complete (and the cover is there when required): the post may be scheduled or published */
  publishable: boolean
  cover_missing: boolean
  locales: LocaleCompleteness[]
}
export type CompletenessRules = { require_excerpt: boolean; require_cover: boolean; reserved_slugs?: readonly string[] }

const filled = (v: unknown) => typeof v === "string" && v.trim().length > 0

/** What one translation lacks; `present` = it has at least a title or a body (something was written) */
export function translationCompleteness(t: TranslationContent | undefined, rules: CompletenessRules): LocaleCompleteness {
  const missing: MissingField[] = []
  if (!filled(t?.title)) missing.push("title")
  if (rules.require_excerpt && !filled(t?.excerpt)) missing.push("excerpt")
  if (!hasContent(t?.body)) missing.push("body")
  if (!filled(t?.slug) || !isValidSlug(String(t?.slug), rules.reserved_slugs ?? [])) missing.push("slug")
  return { locale: t?.locale ?? "", present: !!t && (filled(t.title) || hasContent(t.body)), missing }
}

export function completeness(post: PostContent, locales: string[], defaultLocale: string, rules: CompletenessRules): Completeness {
  const byLocale = new Map((post.translations ?? []).map((t) => [t.locale, t]))
  const out = locales.map((code) => ({ ...translationCompleteness(byLocale.get(code), rules), locale: code }))
  const def = out.find((l) => l.locale === defaultLocale) ?? { locale: defaultLocale, present: false, missing: ["title", "body", "slug"] as MissingField[] }
  const cover_missing = rules.require_cover && !filled(post.cover)
  return { publishable: def.missing.length === 0 && !cover_missing, cover_missing, locales: out }
}

/** A translation counts as available to readers when it is complete (title, body, [excerpt], slug) */
export const isComplete = (t: TranslationContent | undefined, rules: CompletenessRules) => !!t && translationCompleteness(t, rules).missing.length === 0
