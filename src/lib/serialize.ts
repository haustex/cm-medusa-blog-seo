import { renderBody, type Block, type FaqItem, type TocItem } from "./render"
import type { ResolvedOptions } from "./options"
import { completeness, isComplete } from "./validate"
import type { BlogSettings } from "./settings"

/**
 * Shapes the APIs answer. Store shapes are one language at a time (chosen by the request's locale and the
 * settings' fallback rule); Admin shapes carry every translation.
 */
export type TranslationRow = {
  id: string
  locale: string
  title: string
  slug: string
  excerpt: string
  body: string
  seo_title: string | null
  seo_description: string | null
  og_image: string | null
  cover_alt: string | null
  tags: string[] | null
}
export type CategoryTranslationRow = { id: string; locale: string; name: string; slug: string; description: string | null }
export type CategoryRow = { id: string; rank: number; metadata: Record<string, unknown> | null; translations?: CategoryTranslationRow[] | null; created_at?: Date | string; updated_at?: Date | string }
export type AuthorTranslationRow = { id: string; locale: string; job_title: string | null; bio: string | null }
export type AuthorRow = {
  id: string
  slug: string
  name: string
  type: "person" | "organization"
  avatar: string | null
  url: string | null
  same_as: string[] | null
  metadata: Record<string, unknown> | null
  translations?: AuthorTranslationRow[] | null
  created_at?: Date | string
  updated_at?: Date | string
}
export type PostRow = {
  id: string
  status: "draft" | "scheduled" | "published"
  published_at: Date | string | null
  content_updated_at: Date | string | null
  featured: boolean
  cover: string | null
  cover_wide: string | null
  preview_token: string
  product_ids: string[] | null
  metadata: Record<string, unknown> | null
  author_id?: string | null
  category_id?: string | null
  author?: AuthorRow | null
  category?: CategoryRow | null
  translations?: TranslationRow[] | null
  created_at?: Date | string
  updated_at?: Date | string
}

export const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null)

export type Rules = { require_excerpt: boolean; require_cover: boolean; reserved_slugs: readonly string[] }
export const rulesOf = (o: ResolvedOptions): Rules => ({ ...o.publish, reserved_slugs: o.content.reserved_slugs })

/**
 * The translation a reader in `locale` gets, after the fallback rule:
 *   - the locale's own complete translation → { translation, translated: true }
 *   - else fallback "default"/"label" → the default locale's translation, translated: false
 *   - else (fallback "hide", or no complete default either) → null: the post does not exist in that locale
 */
export function pickTranslation(post: Pick<PostRow, "translations">, locale: string, settings: BlogSettings, rules: Rules): { translation: TranslationRow; translated: boolean } | null {
  const rows = post.translations ?? []
  const own = rows.find((t) => t.locale.toLowerCase() === locale.toLowerCase())
  if (own && isComplete(own, rules)) return { translation: own, translated: true }
  if (settings.fallback === "hide") return null
  const def = rows.find((t) => t.locale.toLowerCase() === settings.default_locale.toLowerCase())
  if (def && isComplete(def, rules)) return { translation: def, translated: false }
  return null
}

/** Slug per locale where the post can be read (own translation or fallback): hreflang alternates */
export function alternatesOf(post: Pick<PostRow, "translations">, settings: BlogSettings, rules: Rules): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of settings.locales) {
    if (!l.enabled) continue
    const picked = pickTranslation(post, l.code, settings, rules)
    if (picked) out[l.code] = picked.translation.slug
  }
  return out
}

const pickPlain = <T extends { locale: string }>(rows: T[] | null | undefined, locale: string, settings: BlogSettings): T | null => {
  const list = rows ?? []
  return list.find((t) => t.locale.toLowerCase() === locale.toLowerCase()) ?? list.find((t) => t.locale.toLowerCase() === settings.default_locale.toLowerCase()) ?? list[0] ?? null
}

/** A category in one language (name/slug fall back to the default locale, then any) */
export function toStoreCategory(c: CategoryRow | null | undefined, locale: string, settings: BlogSettings) {
  if (!c) return null
  const t = pickPlain(c.translations, locale, settings)
  if (!t) return null
  return { id: c.id, slug: t.slug, name: t.name, description: t.description ?? null, locale: t.locale, rank: c.rank, alternates: Object.fromEntries((c.translations ?? []).map((x) => [x.locale, x.slug])) }
}

export function toStoreAuthor(a: AuthorRow | null | undefined, locale: string, settings: BlogSettings) {
  if (!a) return null
  const t = pickPlain(a.translations, locale, settings)
  return { id: a.id, slug: a.slug, name: a.name, type: a.type, avatar: a.avatar ?? null, url: a.url ?? null, same_as: a.same_as ?? [], job_title: t?.job_title ?? null, bio: t?.bio ?? null }
}

export type StoreCard = ReturnType<typeof toStoreCard>
export type Picked = { translation: TranslationRow; translated: boolean }
/** `force`: show this translation whatever the fallback rule says (previews of incomplete drafts) */
export function toStoreCard(post: PostRow, locale: string, settings: BlogSettings, options: ResolvedOptions, force?: Picked) {
  const picked = force ?? pickTranslation(post, locale, settings, rulesOf(options))
  if (!picked) return null
  const { translation: t, translated } = picked
  const r = renderBody(t.body, { faq_from_headings: options.content.faq_from_headings, words_per_minute: options.content.words_per_minute })
  const dir = settings.locales.find((l) => l.code.toLowerCase() === t.locale.toLowerCase())?.dir ?? "ltr"
  return {
    id: post.id,
    locale: t.locale,
    translated,
    dir,
    slug: t.slug,
    title: t.title,
    excerpt: t.excerpt,
    cover: post.cover ?? null,
    cover_wide: post.cover_wide ?? null,
    cover_alt: t.cover_alt || t.title,
    featured: !!post.featured,
    published_at: iso(post.published_at),
    updated_at: iso(post.content_updated_at ?? post.published_at),
    reading_minutes: r.reading_minutes,
    category: toStoreCategory(post.category, locale, settings),
    author: toStoreAuthor(post.author, locale, settings),
    alternates: alternatesOf(post, settings, rulesOf(options)),
  }
}

export type StoreArticle = ReturnType<typeof toStoreArticle>
export function toStoreArticle(post: PostRow, locale: string, settings: BlogSettings, options: ResolvedOptions, force?: Picked) {
  const card = toStoreCard(post, locale, settings, options, force)
  if (!card) return null
  const t = force?.translation ?? post.translations!.find((x) => x.locale === card.locale)!
  const r = renderBody(t.body, { faq_from_headings: options.content.faq_from_headings, words_per_minute: options.content.words_per_minute })
  return {
    ...card,
    seo_title: t.seo_title || t.title,
    seo_description: t.seo_description || t.excerpt,
    og_image: t.og_image ?? null,
    tags: t.tags ?? [],
    product_ids: post.product_ids ?? [],
    body_html: t.body,
    blocks: r.blocks as Block[],
    toc: r.toc as TocItem[],
    faq: r.faq.map(({ q, a }) => ({ q, a })) as Pick<FaqItem, "q" | "a">[],
    words: r.words,
    text: r.text,
    metadata: post.metadata ?? null,
  }
}

/** One row per public post with every readable locale: sitemaps, feeds, hreflang (`medusa-blog-seo/seo`) */
export function toIndexRow(post: PostRow, settings: BlogSettings, options: ResolvedOptions) {
  const rules = rulesOf(options)
  const locales: Record<string, { slug: string; title: string; excerpt: string; translated: boolean; category_slug: string | null; category_name: string | null }> = {}
  for (const l of settings.locales) {
    if (!l.enabled) continue
    const picked = pickTranslation(post, l.code, settings, rules)
    if (!picked) continue
    const cat = toStoreCategory(post.category, l.code, settings)
    locales[l.code] = { slug: picked.translation.slug, title: picked.translation.title, excerpt: picked.translation.excerpt, translated: picked.translated, category_slug: cat?.slug ?? null, category_name: cat?.name ?? null }
  }
  const images = new Map<string, { src: string; alt: string }>()
  for (const t of post.translations ?? []) {
    for (const b of renderBody(t.body).blocks) if (b.type === "image" && !images.has(b.src)) images.set(b.src, { src: b.src, alt: b.alt })
  }
  return {
    id: post.id,
    published_at: iso(post.published_at),
    updated_at: iso(post.content_updated_at ?? post.published_at),
    cover: post.cover ?? null,
    cover_wide: post.cover_wide ?? null,
    author: post.author ? { id: post.author.id, slug: post.author.slug, name: post.author.name, type: post.author.type } : null,
    images: Array.from(images.values()),
    locales,
  }
}

/** Admin: everything, every translation */
export function toAdminPost(post: PostRow, settings: BlogSettings, options: ResolvedOptions) {
  const rules = rulesOf(options)
  const byLocale = Object.fromEntries((post.translations ?? []).map((t) => [t.locale, t]))
  return {
    id: post.id,
    status: post.status,
    published_at: iso(post.published_at),
    content_updated_at: iso(post.content_updated_at),
    featured: !!post.featured,
    cover: post.cover ?? null,
    cover_wide: post.cover_wide ?? null,
    preview_token: post.preview_token,
    product_ids: post.product_ids ?? [],
    metadata: post.metadata ?? null,
    author_id: post.author?.id ?? post.author_id ?? null,
    category_id: post.category?.id ?? post.category_id ?? null,
    translations: byLocale,
    completeness: completenessOf(post, settings, rules),
    created_at: iso(post.created_at),
    updated_at: iso(post.updated_at),
  }
}

export function completenessOf(post: PostRow, settings: BlogSettings, rules: Rules) {
  return completeness(post, settings.locales.filter((l) => l.enabled).map((l) => l.code), settings.default_locale, rules)
}

export function toAdminCategory(c: CategoryRow, extra: { post_count?: number } = {}) {
  return { id: c.id, rank: c.rank, metadata: c.metadata ?? null, translations: Object.fromEntries((c.translations ?? []).map((t) => [t.locale, { name: t.name, slug: t.slug, description: t.description ?? null }])), post_count: extra.post_count ?? null, created_at: iso(c.created_at), updated_at: iso(c.updated_at) }
}

export function toAdminAuthor(a: AuthorRow, extra: { post_count?: number } = {}) {
  return { id: a.id, slug: a.slug, name: a.name, type: a.type, avatar: a.avatar ?? null, url: a.url ?? null, same_as: a.same_as ?? [], metadata: a.metadata ?? null, translations: Object.fromEntries((a.translations ?? []).map((t) => [t.locale, { job_title: t.job_title ?? null, bio: t.bio ?? null }])), post_count: extra.post_count ?? null, created_at: iso(a.created_at), updated_at: iso(a.updated_at) }
}
