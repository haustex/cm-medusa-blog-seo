import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { randomBytes } from "node:crypto"
import { BLOG_SEO_MODULE } from "../modules/blog-seo"
import { BlogSeoEvents, type PostEvent } from "./events"
import { getOptions, type ResolvedOptions } from "./options"
import { PRODUCT_ID_RE, sanitizeBody } from "./sanitize"
import { BlogRuleError, isDue, isPublic, planPublish } from "./schedule"
import { alternatesOf, rulesOf, toStoreCategory, type PostRow, type TranslationRow } from "./serialize"
import { enabledCodes, getSettings, localeOf, type BlogSettings } from "./settings"
import { isValidSlug, uniqueSlug } from "./slug"
import { httpUrl, plainLine, tagList } from "./text"
import { completeness } from "./validate"

/**
 * Everything that writes posts goes through here (Admin API, the publish job, migrations): input is cleaned
 * (bodies sanitized, plain fields stripped), the rules are checked (unique slug per locale, the default locale
 * complete before a post is scheduled or public), product links are kept in step, and events are emitted when
 * something the public can see changed.
 */
export const RELATIONS = ["translations", "category", "category.translations", "author", "author.translations"]

type Svc = Record<string, (...args: any[]) => Promise<any>>
const service = (container: MedusaContainer) => container.resolve<Svc>(BLOG_SEO_MODULE)

export type TranslationInput = {
  title?: unknown
  slug?: unknown
  /** true: a draft's slug follows its title again (the editor sends it while the slug was never set by hand) */
  auto_slug?: unknown
  excerpt?: unknown
  body?: unknown
  seo_title?: unknown
  seo_description?: unknown
  og_image?: unknown
  cover_alt?: unknown
  tags?: unknown
}
export type PostInput = {
  translations?: Record<string, TranslationInput> | null
  featured?: unknown
  cover?: unknown
  cover_wide?: unknown
  author_id?: unknown
  category_id?: unknown
  product_ids?: unknown
  metadata?: unknown
}

const LIMITS = { title: 200, excerpt: 500, seo_title: 120, seo_description: 320, alt: 300 }

async function context(container: MedusaContainer) {
  const options = getOptions(container)
  const settings = await getSettings(container)
  return { options, settings, rules: rulesOf(options) }
}

/** Only an allowed origin's file URL (covers, og image) */
const imageUrl = (v: unknown, settings: BlogSettings): string | null => {
  const url = httpUrl(v)
  if (!url) return null
  return settings.image_origins.some((o) => url.startsWith(`${o.replace(/\/+$/, "")}/`)) ? url : null
}

function cleanTranslation(input: TranslationInput, settings: BlogSettings, options: ResolvedOptions): Partial<TranslationRow> {
  const has = (k: keyof TranslationInput) => Object.prototype.hasOwnProperty.call(input, k)
  const nullable = (v: string) => (v ? v : null)
  const out: Partial<TranslationRow> = {}
  if (has("title")) out.title = plainLine(input.title, LIMITS.title)
  if (has("excerpt")) out.excerpt = plainLine(input.excerpt, LIMITS.excerpt)
  if (has("body")) {
    const raw = typeof input.body === "string" ? input.body : ""
    if (Buffer.byteLength(raw) > options.content.max_body_bytes) throw new BlogRuleError("invalid", "body too large")
    out.body = sanitizeBody(raw, { imageOrigins: settings.image_origins, siteHosts: options.content.site_hosts })
  }
  if (has("seo_title")) out.seo_title = nullable(plainLine(input.seo_title, LIMITS.seo_title))
  if (has("seo_description")) out.seo_description = nullable(plainLine(input.seo_description, LIMITS.seo_description))
  if (has("og_image")) out.og_image = imageUrl(input.og_image, settings)
  if (has("cover_alt")) out.cover_alt = nullable(plainLine(input.cover_alt, LIMITS.alt))
  if (has("tags")) out.tags = tagList(input.tags)
  if (has("slug")) out.slug = String(input.slug ?? "").trim().toLowerCase()
  return out
}

function cleanPost(input: PostInput, settings: BlogSettings): Record<string, unknown> {
  const has = (k: keyof PostInput) => Object.prototype.hasOwnProperty.call(input, k)
  const out: Record<string, unknown> = {}
  if (has("featured")) out.featured = input.featured === true
  if (has("cover")) out.cover = imageUrl(input.cover, settings)
  if (has("cover_wide")) out.cover_wide = imageUrl(input.cover_wide, settings)
  if (has("author_id")) out.author_id = typeof input.author_id === "string" && input.author_id ? input.author_id : null
  if (has("category_id")) out.category_id = typeof input.category_id === "string" && input.category_id ? input.category_id : null
  if (has("product_ids")) {
    const ids = Array.isArray(input.product_ids) ? input.product_ids.filter((p): p is string => typeof p === "string" && PRODUCT_ID_RE.test(p)) : []
    out.product_ids = Array.from(new Set(ids)).slice(0, 24)
  }
  if (has("metadata")) out.metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : null
  return out
}

export async function retrievePost(container: MedusaContainer, id: string): Promise<PostRow> {
  const [post] = await service(container).listBseoPosts({ id }, { relations: RELATIONS, take: 1 })
  if (!post) throw new BlogRuleError("not_found")
  return post
}

async function slugTaken(container: MedusaContainer, locale: string, slug: string, exceptPostId?: string) {
  const rows = await service(container).listBseoPostTranslations({ locale, slug }, { select: ["id", "post_id"], take: 2 })
  return rows.some((r: { post_id: string }) => r.post_id !== exceptPostId)
}

async function exists(container: MedusaContainer, method: string, id: string) {
  const rows = await service(container)[method]({ id }, { select: ["id"], take: 1 })
  return rows.length > 0
}

/** Only products that exist; the module link bseo_post <-> product is made to match */
async function syncProducts(container: MedusaContainer, postId: string, wanted: string[]): Promise<string[]> {
  const query = container.resolve(ContainerRegistrationKeys.QUERY)
  const link = container.resolve(ContainerRegistrationKeys.LINK)
  const existing = wanted.length ? (await query.graph({ entity: "product", fields: ["id"], filters: { id: wanted } })).data.map((p: any) => p.id as string) : []
  const keep = wanted.filter((id) => existing.includes(id))
  const { data } = await query.graph({ entity: "bseo_post", fields: ["id", "products.id"], filters: { id: postId } })
  const linked: string[] = ((data[0] as any)?.products ?? []).filter(Boolean).map((p: any) => p.id)
  const pair = (product_id: string) => ({ [BLOG_SEO_MODULE]: { bseo_post_id: postId }, [Modules.PRODUCT]: { product_id } })
  const add = keep.filter((id) => !linked.includes(id)).map(pair)
  const remove = linked.filter((id) => !keep.includes(id)).map(pair)
  if (add.length) await link.create(add)
  if (remove.length) await link.dismiss(remove)
  return keep
}

function eventOf(post: PostRow, settings: BlogSettings, options: ResolvedOptions): Omit<PostEvent, "previous_slugs" | "previous_category_slugs"> {
  const rules = rulesOf(options)
  const category_slugs: Record<string, string> = {}
  for (const code of enabledCodes(settings)) {
    const c = toStoreCategory(post.category, code, settings)
    if (c) category_slugs[code] = c.slug
  }
  return { id: post.id, slugs: alternatesOf(post, settings, rules), category_slugs }
}

async function emit(container: MedusaContainer, name: string, data: Record<string, unknown>) {
  try {
    await container.resolve(Modules.EVENT_BUS).emit({ name, data })
  } catch (e) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`[blog-seo] could not emit ${name}: ${(e as Error).message}`)
  }
}

type TranslationPlan = { locale: string; current: TranslationRow | undefined; patch: Partial<TranslationRow> }

/** Works out what each locale's translation row will become (slugs made unique per locale); nothing is written yet */
async function planTranslations(container: MedusaContainer, post: PostRow, input: Record<string, TranslationInput>, settings: BlogSettings, options: ResolvedOptions): Promise<TranslationPlan[]> {
  const reserved = options.content.reserved_slugs
  const plans: TranslationPlan[] = []
  const planned = (locale: string) => plans.filter((p) => p.locale.toLowerCase() === locale.toLowerCase()).map((p) => p.patch.slug).filter(Boolean) as string[]
  for (const [rawLocale, t] of Object.entries(input)) {
    if (!t || typeof t !== "object") continue
    const locale = localeOf(settings, rawLocale)
    if (!locale) throw new BlogRuleError("locale_unknown", rawLocale)
    const current = (post.translations ?? []).find((x) => x.locale.toLowerCase() === locale.code.toLowerCase())
    const patch = cleanTranslation(t, settings, options)
    const title = patch.title ?? current?.title ?? ""
    const taken = async (s: string) => planned(locale.code).includes(s) || slugTaken(container, locale.code, s, post.id)
    if (patch.slug !== undefined && patch.slug !== (current?.slug ?? "")) {
      if (!patch.slug) delete patch.slug
      else {
        if (!isValidSlug(patch.slug, reserved)) throw new BlogRuleError("invalid_slug", patch.slug)
        if (await taken(patch.slug)) throw new BlogRuleError("slug_taken", patch.slug)
      }
    }
    if (patch.slug === undefined && (!current || (t.auto_slug === true && post.status === "draft"))) {
      // no slug yet, or the editor says the slug still follows the title: from the title, else from another locale's slug
      const base = title || (post.translations ?? []).find((x) => x.slug)?.slug || "post"
      const candidate = await uniqueSlug(base, taken, { reserved, fallback: "post" })
      if (!current || candidate !== current.slug) patch.slug = candidate
    }
    plans.push({ locale: locale.code, current, patch })
  }
  return plans
}

/** The translations as they will be after the plans are applied (for the completeness check before writing) */
function simulate(post: PostRow, plans: TranslationPlan[]): TranslationRow[] {
  const rows = (post.translations ?? []).map((t) => ({ ...t }))
  for (const p of plans) {
    const i = rows.findIndex((t) => t.locale.toLowerCase() === p.locale.toLowerCase())
    if (i >= 0) rows[i] = { ...rows[i], ...p.patch }
    else rows.push({ id: "", locale: p.locale, title: "", slug: "", excerpt: "", body: "", seo_title: null, seo_description: null, og_image: null, cover_alt: null, tags: null, ...p.patch })
  }
  return rows
}

async function applyTranslations(container: MedusaContainer, post: PostRow, plans: TranslationPlan[]) {
  const svc = service(container)
  for (const p of plans) {
    if (p.current) {
      if (Object.keys(p.patch).length) await svc.updateBseoPostTranslations({ id: p.current.id, ...p.patch })
      if (p.patch.slug && p.current.slug && p.patch.slug !== p.current.slug) await rememberSlug(container, post.id, p.locale, p.current.slug, p.patch.slug)
    } else await svc.createBseoPostTranslations({ post_id: post.id, locale: p.locale, title: "", excerpt: "", body: "", ...p.patch })
  }
}

/**
 * The old slug joins the post's history for that locale (old URLs redirect to the current slug); a history row for
 * the slug that just became live again is dropped. Rows point at the post, so there are no chains or loops.
 */
async function rememberSlug(container: MedusaContainer, postId: string, locale: string, oldSlug: string, newSlug: string) {
  const svc = service(container)
  const stale = await svc.listBseoPostSlugHistories({ post_id: postId, locale, slug: newSlug }, { select: ["id"] })
  if (stale.length) await svc.deleteBseoPostSlugHistories(stale.map((r: { id: string }) => r.id))
  const existing = await svc.listBseoPostSlugHistories({ post_id: postId, locale, slug: oldSlug }, { select: ["id"], take: 1 })
  if (!existing.length) await svc.createBseoPostSlugHistories({ post_id: postId, locale, slug: oldSlug })
}

async function writeTranslations(container: MedusaContainer, post: PostRow, input: Record<string, TranslationInput>, settings: BlogSettings, options: ResolvedOptions) {
  await applyTranslations(container, post, await planTranslations(container, post, input, settings, options))
}

const PUBLIC_POST_FIELDS = ["featured", "cover", "cover_wide", "author_id", "category_id", "product_ids", "metadata"]
const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)

export async function createPost(container: MedusaContainer, input: PostInput): Promise<PostRow> {
  const { settings, options } = await context(container)
  const data = cleanPost(input, settings)
  if (data.category_id && !(await exists(container, "listBseoCategories", data.category_id as string))) throw new BlogRuleError("category_not_found")
  if (data.author_id && !(await exists(container, "listBseoAuthors", data.author_id as string))) throw new BlogRuleError("author_not_found")
  const { product_ids, ...rest } = data
  const created = await service(container).createBseoPosts({ ...rest, status: "draft", preview_token: newToken() })
  const post = await retrievePost(container, created.id)
  const translations = input.translations && typeof input.translations === "object" ? input.translations : {}
  // every post has its default locale's row, so a slug exists from the start
  if (!translations[settings.default_locale]) translations[settings.default_locale] = {}
  try {
    await writeTranslations(container, post, translations, settings, options)
  } catch (e) {
    // a refused slug or locale must not leave an empty post behind
    await service(container).deleteBseoPosts([post.id])
    throw e
  }
  if (Array.isArray(product_ids) && product_ids.length) {
    const kept = await syncProducts(container, post.id, product_ids as string[])
    await service(container).updateBseoPosts({ id: post.id, product_ids: kept })
  }
  return retrievePost(container, post.id)
}

export async function updatePost(container: MedusaContainer, id: string, input: PostInput, now = new Date()): Promise<PostRow> {
  const { settings, options, rules } = await context(container)
  const before = await retrievePost(container, id)
  const patch = cleanPost(input, settings)
  if (patch.category_id && !(await exists(container, "listBseoCategories", patch.category_id as string))) throw new BlogRuleError("category_not_found")
  if (patch.author_id && !(await exists(container, "listBseoAuthors", patch.author_id as string))) throw new BlogRuleError("author_not_found")
  const plans = input.translations && typeof input.translations === "object" ? await planTranslations(container, before, input.translations, settings, options) : []
  // A scheduled or public article must stay publishable: finish the default locale or take it back to draft first
  if (before.status !== "draft") {
    const c = completeness({ ...before, ...patch, translations: simulate(before, plans) }, enabledCodes(settings), settings.default_locale, rules)
    if (!c.publishable) throw new BlogRuleError("incomplete", describe(c))
  }
  if (patch.product_ids) patch.product_ids = await syncProducts(container, id, patch.product_ids as string[])
  await applyTranslations(container, before, plans)
  const afterTranslations = await retrievePost(container, id)
  const translationsChanged = JSON.stringify(before.translations ?? []) !== JSON.stringify(afterTranslations.translations ?? [])
  const publicChange = translationsChanged || PUBLIC_POST_FIELDS.some((f) => f in patch && !same(patch[f], (before as any)[f]))
  const wasPublic = isPublic(before, now)
  if (publicChange && before.status === "published") patch.content_updated_at = now
  if (Object.keys(patch).length) await service(container).updateBseoPosts({ id, ...patch })
  // one featured article at a time
  if (patch.featured === true && !before.featured) {
    const others = await service(container).listBseoPosts({ featured: true }, { select: ["id"] })
    const ids = others.map((p: { id: string }) => p.id).filter((x: string) => x !== id)
    if (ids.length) await service(container).updateBseoPosts(ids.map((x: string) => ({ id: x, featured: false })))
  }
  const after = await retrievePost(container, id)
  if (wasPublic && publicChange) {
    const prev = eventOf(before, settings, options)
    await emit(container, BlogSeoEvents.POST_UPDATED, { ...eventOf(after, settings, options), previous_slugs: prev.slugs, previous_category_slugs: prev.category_slugs })
  }
  return after
}

/** Publish now, or schedule when `at` is in the future. Throws BlogRuleError("incomplete", …) when not publishable. */
export async function publishPost(container: MedusaContainer, id: string, at: string | Date | null | undefined, now = new Date()): Promise<PostRow> {
  const { settings, options, rules } = await context(container)
  const before = await retrievePost(container, id)
  const c = completeness(before, enabledCodes(settings), settings.default_locale, rules)
  let plan
  try {
    plan = planPublish(before, c.publishable, at, now)
  } catch (e) {
    if (e instanceof BlogRuleError && e.code === "incomplete") throw new BlogRuleError("incomplete", describe(c))
    throw e
  }
  const wasPublic = isPublic(before, now)
  await service(container).updateBseoPosts({
    id,
    status: plan.status,
    published_at: plan.published_at,
    ...(plan.status === "published" ? { content_updated_at: before.content_updated_at && wasPublic ? before.content_updated_at : plan.published_at } : {}),
  })
  const after = await retrievePost(container, id)
  if (isPublic(after, now)) await emit(container, wasPublic ? BlogSeoEvents.POST_UPDATED : BlogSeoEvents.POST_PUBLISHED, eventOf(after, settings, options))
  else if (wasPublic) await emit(container, BlogSeoEvents.POST_UNPUBLISHED, eventOf(before, settings, options))
  return after
}

export async function unpublishPost(container: MedusaContainer, id: string, now = new Date()): Promise<PostRow> {
  const { settings, options } = await context(container)
  const before = await retrievePost(container, id)
  await service(container).updateBseoPosts({ id, status: "draft" })
  if (isPublic(before, now)) await emit(container, BlogSeoEvents.POST_UNPUBLISHED, eventOf(before, settings, options))
  return retrievePost(container, id)
}

export async function deletePost(container: MedusaContainer, id: string, now = new Date()): Promise<void> {
  const { settings, options } = await context(container)
  const before = await retrievePost(container, id)
  await syncProducts(container, id, [])
  await service(container).softDeleteBseoPosts([id])
  if (isPublic(before, now)) await emit(container, BlogSeoEvents.POST_DELETED, eventOf(before, settings, options))
}

/** A new secret for the preview link (the old link stops working) */
export async function rotatePreviewToken(container: MedusaContainer, id: string): Promise<PostRow> {
  await retrievePost(container, id)
  await service(container).updateBseoPosts({ id, preview_token: newToken() })
  return retrievePost(container, id)
}

/** The job: scheduled posts whose time has come go public. Returns what happened, for the log and the tests. */
export async function publishDue(container: MedusaContainer, now = new Date()): Promise<{ published: string[]; incomplete: string[] }> {
  const { settings, options, rules } = await context(container)
  const scheduled: PostRow[] = await service(container).listBseoPosts({ status: "scheduled", published_at: { $lte: now } }, { relations: RELATIONS, take: 100 })
  const published: string[] = []
  const incomplete: string[] = []
  for (const p of scheduled) {
    if (!isDue(p, now)) continue
    if (!completeness(p, enabledCodes(settings), settings.default_locale, rules).publishable) {
      incomplete.push(p.id)
      continue
    }
    await service(container).updateBseoPosts({ id: p.id, status: "published", content_updated_at: p.published_at })
    const after = await retrievePost(container, p.id)
    await emit(container, BlogSeoEvents.POST_PUBLISHED, eventOf(after, settings, options))
    published.push(p.id)
  }
  return { published, incomplete }
}

const newToken = () => randomBytes(24).toString("base64url")

/** "default (id): title, body · en: excerpt · cover" */
export function describe(c: ReturnType<typeof completeness>): string {
  const parts = c.locales.filter((l) => l.missing.length).map((l) => `${l.locale}: ${l.missing.join(", ")}`)
  if (c.cover_missing) parts.push("cover")
  return parts.join(" · ")
}
