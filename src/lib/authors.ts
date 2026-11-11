import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BLOG_SEO_MODULE } from "../modules/blog-seo"
import { BlogSeoEvents } from "./events"
import { getOptions } from "./options"
import { BlogRuleError } from "./schedule"
import type { AuthorRow } from "./serialize"
import { getSettings, localeOf, type BlogSettings } from "./settings"
import { isValidSlug, uniqueSlug } from "./slug"
import { httpUrl, plainLine, plainText } from "./text"

/** Authors: a person or an organization (JSON-LD author/publisher), with job title and bio per locale */
export const AUTHOR_RELATIONS = ["translations"]
type Svc = Record<string, (...args: any[]) => Promise<any>>
const service = (container: MedusaContainer) => container.resolve<Svc>(BLOG_SEO_MODULE)

export type AuthorTranslationInput = { job_title?: unknown; bio?: unknown }
export type AuthorInput = {
  name?: unknown
  slug?: unknown
  type?: unknown
  avatar?: unknown
  url?: unknown
  same_as?: unknown
  metadata?: unknown
  translations?: Record<string, AuthorTranslationInput> | null
}

export async function retrieveAuthor(container: MedusaContainer, id: string): Promise<AuthorRow> {
  const [row] = await service(container).listBseoAuthors({ id }, { relations: AUTHOR_RELATIONS, take: 1 })
  if (!row) throw new BlogRuleError("not_found")
  return row
}

async function slugTaken(container: MedusaContainer, slug: string, exceptId?: string) {
  const rows = await service(container).listBseoAuthors({ slug }, { select: ["id"], take: 2 })
  return rows.some((r: { id: string }) => r.id !== exceptId)
}

async function clean(container: MedusaContainer, input: AuthorInput, current: AuthorRow | null) {
  const has = (k: keyof AuthorInput) => Object.prototype.hasOwnProperty.call(input, k)
  const out: Record<string, unknown> = {}
  if (has("name")) {
    out.name = plainLine(input.name, 120)
    if (!out.name) throw new BlogRuleError("invalid", "name is required")
  }
  if (has("type")) out.type = input.type === "organization" ? "organization" : "person"
  if (has("avatar")) out.avatar = httpUrl(input.avatar)
  if (has("url")) out.url = httpUrl(input.url)
  if (has("same_as")) out.same_as = Array.isArray(input.same_as) ? input.same_as.map((u) => httpUrl(u)).filter((u): u is string => !!u).slice(0, 12) : []
  if (has("metadata")) out.metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : null
  const reserved = getOptions(container).content.reserved_slugs
  const wanted = has("slug") ? String(input.slug ?? "").trim().toLowerCase() : ""
  const taken = (s: string) => slugTaken(container, s, current?.id)
  if (wanted && wanted !== current?.slug) {
    if (!isValidSlug(wanted, reserved)) throw new BlogRuleError("invalid_slug", wanted)
    if (await taken(wanted)) throw new BlogRuleError("slug_taken", wanted)
    out.slug = wanted
  } else if (!current) out.slug = await uniqueSlug(String(out.name ?? ""), taken, { reserved, fallback: "author" })
  return out
}

async function writeTranslations(container: MedusaContainer, author: AuthorRow, input: Record<string, AuthorTranslationInput>, settings: BlogSettings) {
  const svc = service(container)
  for (const [rawLocale, t] of Object.entries(input)) {
    if (!t || typeof t !== "object") continue
    const locale = localeOf(settings, rawLocale)
    if (!locale) throw new BlogRuleError("locale_unknown", rawLocale)
    const current = (author.translations ?? []).find((x) => x.locale.toLowerCase() === locale.code.toLowerCase())
    const patch: Record<string, unknown> = {}
    if (Object.prototype.hasOwnProperty.call(t, "job_title")) patch.job_title = plainLine(t.job_title, 120) || null
    if (Object.prototype.hasOwnProperty.call(t, "bio")) patch.bio = plainText(t.bio, 2000) || null
    if (current) {
      if (Object.keys(patch).length) await svc.updateBseoAuthorTranslations({ id: current.id, ...patch })
    } else if (patch.job_title || patch.bio) await svc.createBseoAuthorTranslations({ author_id: author.id, locale: locale.code, job_title: patch.job_title ?? null, bio: patch.bio ?? null })
  }
}

async function emitChanged(container: MedusaContainer, id: string, slug: string) {
  try {
    await container.resolve(Modules.EVENT_BUS).emit({ name: BlogSeoEvents.AUTHOR_CHANGED, data: { id, slug } })
  } catch (e) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`[blog-seo] could not emit author event: ${(e as Error).message}`)
  }
}

export async function createAuthor(container: MedusaContainer, input: AuthorInput): Promise<AuthorRow> {
  const settings = await getSettings(container)
  if (!plainLine(input.name, 120)) throw new BlogRuleError("invalid", "name is required")
  const data = await clean(container, input, null)
  const created = await service(container).createBseoAuthors({ type: "person", ...data })
  const row = await retrieveAuthor(container, created.id)
  if (input.translations && typeof input.translations === "object") await writeTranslations(container, row, input.translations, settings)
  return retrieveAuthor(container, created.id)
}

export async function updateAuthor(container: MedusaContainer, id: string, input: AuthorInput): Promise<AuthorRow> {
  const settings = await getSettings(container)
  const before = await retrieveAuthor(container, id)
  const patch = await clean(container, input, before)
  if (Object.keys(patch).length) await service(container).updateBseoAuthors({ id, ...patch })
  if (input.translations && typeof input.translations === "object") await writeTranslations(container, before, input.translations, settings)
  const after = await retrieveAuthor(container, id)
  if (JSON.stringify(before) !== JSON.stringify(after)) await emitChanged(container, id, after.slug)
  return after
}

/** Posts keep existing without an author */
export async function deleteAuthor(container: MedusaContainer, id: string): Promise<void> {
  const before = await retrieveAuthor(container, id)
  const posts = await service(container).listBseoPosts({ author_id: id }, { select: ["id"], take: 5000 })
  if (posts.length) await service(container).updateBseoPosts(posts.map((p: { id: string }) => ({ id: p.id, author_id: null })))
  await service(container).softDeleteBseoAuthors([id])
  await emitChanged(container, id, before.slug)
}

export async function authorPostCounts(container: MedusaContainer, publicOnly = false): Promise<Record<string, number>> {
  const filters: Record<string, unknown> = { author_id: { $ne: null } }
  if (publicOnly) filters.status = "published"
  const posts = await service(container).listBseoPosts(filters, { select: ["id", "author_id"], take: 5000 })
  const counts: Record<string, number> = {}
  for (const p of posts) if (p.author_id) counts[p.author_id] = (counts[p.author_id] ?? 0) + 1
  return counts
}
