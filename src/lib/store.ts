import type { MedusaContainer } from "@medusajs/framework/types"
import { BLOG_SEO_MODULE } from "../modules/blog-seo"
import { getOptions, type ResolvedOptions } from "./options"
import { RELATIONS } from "./posts"
import { isPublic } from "./schedule"
import { pickTranslation, rulesOf, toStoreCard, toStoreCategory, type CategoryRow, type PostRow } from "./serialize"
import { getSettings, type BlogSettings } from "./settings"

/**
 * Reading the public blog. Lists are filtered in memory after the SQL filters (status, date, category, author):
 * whether a post exists in a locale depends on its translation being complete and on the fallback rule, which
 * no SQL filter can express. Public posts are loaded in one go (at most 5000).
 */
export type StoreContext = { settings: BlogSettings; options: ResolvedOptions; locale: string; now: Date }

export async function storeContext(container: MedusaContainer, locale: string, now = new Date()): Promise<StoreContext> {
  return { settings: await getSettings(container), options: getOptions(container), locale, now }
}

export const publicFilter = (now: Date) => ({ status: "published", published_at: { $lte: now } })

export async function listPublicPosts(container: MedusaContainer, ctx: StoreContext, filters: Record<string, unknown> = {}): Promise<PostRow[]> {
  const svc = container.resolve(BLOG_SEO_MODULE) as any
  const rows: PostRow[] = await svc.listBseoPosts({ ...publicFilter(ctx.now), ...filters }, { relations: RELATIONS, order: { published_at: "DESC", id: "DESC" }, take: 5000 })
  return rows.filter((p) => isPublic(p, ctx.now))
}

/** Posts readable in the context's locale (own translation, or the fallback) */
export function readable(posts: PostRow[], ctx: StoreContext): PostRow[] {
  const rules = rulesOf(ctx.options)
  return posts.filter((p) => pickTranslation(p, ctx.locale, ctx.settings, rules))
}

/** A category by its slug in the request locale (or any locale: the slug of another language still resolves) */
export async function findCategoryBySlug(container: MedusaContainer, ctx: StoreContext, slug: string): Promise<CategoryRow | null> {
  const svc = container.resolve(BLOG_SEO_MODULE) as any
  const rows = await svc.listBseoCategoryTranslations({ slug }, { select: ["id", "locale", "category_id"], take: 50 })
  if (!rows.length) return null
  const hit = rows.find((r: { locale: string }) => r.locale.toLowerCase() === ctx.locale.toLowerCase()) ?? rows.find((r: { locale: string }) => r.locale.toLowerCase() === ctx.settings.default_locale.toLowerCase()) ?? rows[0]
  const [category] = await svc.listBseoCategories({ id: hit.category_id }, { relations: ["translations"], take: 1 })
  return category ?? null
}

/** A public post by the slug a reader in the locale sees: its own translation's slug, or (fallback) the default locale's */
export async function findPublicPostBySlug(container: MedusaContainer, ctx: StoreContext, slug: string): Promise<PostRow | null> {
  const svc = container.resolve(BLOG_SEO_MODULE) as any
  const locales = Array.from(new Set([ctx.locale, ctx.settings.default_locale]))
  const hits = await svc.listBseoPostTranslations({ slug, locale: locales }, { select: ["id", "locale", "post_id"], take: 10 })
  const rules = rulesOf(ctx.options)
  for (const locale of locales) {
    const hit = hits.find((h: { locale: string }) => h.locale.toLowerCase() === locale.toLowerCase())
    if (!hit) continue
    const [post] = (await svc.listBseoPosts({ id: hit.post_id, ...publicFilter(ctx.now) }, { relations: RELATIONS, take: 1 })) as PostRow[]
    if (!post || !isPublic(post, ctx.now)) continue
    const picked = pickTranslation(post, ctx.locale, ctx.settings, rules)
    // the slug must be the one this locale actually shows (a stale default-locale slug must not resolve a translated post)
    if (picked && picked.translation.slug === slug) return post
  }
  return null
}

/** Up to `n` other readable posts: same category first, then newest */
export function morePosts(all: PostRow[], post: PostRow, ctx: StoreContext, n = 3) {
  const others = readable(all, ctx).filter((p) => p.id !== post.id)
  const same = others.filter((p) => post.category_id && p.category_id === post.category_id)
  const rest = others.filter((p) => !same.includes(p))
  return [...same, ...rest].slice(0, n).map((p) => toStoreCard(p, ctx.locale, ctx.settings, ctx.options))
}

export const categoryView = (c: CategoryRow | null | undefined, ctx: StoreContext) => toStoreCategory(c, ctx.locale, ctx.settings)
