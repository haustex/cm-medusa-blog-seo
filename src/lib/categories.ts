import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys, Modules } from "@medusajs/framework/utils"
import { BLOG_SEO_MODULE } from "../modules/blog-seo"
import { BlogSeoEvents } from "./events"
import { getOptions } from "./options"
import { BlogRuleError } from "./schedule"
import type { CategoryRow } from "./serialize"
import { getSettings, localeOf, type BlogSettings } from "./settings"
import { isValidSlug, uniqueSlug } from "./slug"
import { plainLine, plainText } from "./text"

/**
 * Categories: a rank and a name/slug/description per locale. A category must have its name in the default locale;
 * other locales fall back to it (categories are never hidden by the fallback rule: they are navigation, not content).
 */
export const CATEGORY_RELATIONS = ["translations"]
type Svc = Record<string, (...args: any[]) => Promise<any>>
const service = (container: MedusaContainer) => container.resolve<Svc>(BLOG_SEO_MODULE)

export type CategoryTranslationInput = { name?: unknown; slug?: unknown; description?: unknown }
export type CategoryInput = { translations?: Record<string, CategoryTranslationInput> | null; rank?: unknown; metadata?: unknown }

export async function retrieveCategory(container: MedusaContainer, id: string): Promise<CategoryRow> {
  const [row] = await service(container).listBseoCategories({ id }, { relations: CATEGORY_RELATIONS, take: 1 })
  if (!row) throw new BlogRuleError("not_found")
  return row
}

async function slugTaken(container: MedusaContainer, locale: string, slug: string, exceptId?: string) {
  const rows = await service(container).listBseoCategoryTranslations({ locale, slug }, { select: ["id", "category_id"], take: 2 })
  return rows.some((r: { category_id: string }) => r.category_id !== exceptId)
}

async function writeTranslations(container: MedusaContainer, category: CategoryRow, input: Record<string, CategoryTranslationInput>, settings: BlogSettings) {
  const svc = service(container)
  const reserved = getOptions(container).content.reserved_slugs
  for (const [rawLocale, t] of Object.entries(input)) {
    if (!t || typeof t !== "object") continue
    const locale = localeOf(settings, rawLocale)
    if (!locale) throw new BlogRuleError("locale_unknown", rawLocale)
    const current = (category.translations ?? []).find((x) => x.locale.toLowerCase() === locale.code.toLowerCase())
    const has = (k: keyof CategoryTranslationInput) => Object.prototype.hasOwnProperty.call(t, k)
    const patch: Record<string, unknown> = {}
    if (has("name")) patch.name = plainLine(t.name, 120)
    if (has("description")) patch.description = plainText(t.description, 1000) || null
    const name = (patch.name as string | undefined) ?? current?.name ?? ""
    // an empty name removes the translation (never the default locale's)
    if (!name) {
      if (current && locale.code.toLowerCase() !== settings.default_locale.toLowerCase()) await svc.deleteBseoCategoryTranslations([current.id])
      else if (current) throw new BlogRuleError("invalid", "the default locale needs a name")
      continue
    }
    const taken = (s: string) => slugTaken(container, locale.code, s, category.id)
    const wanted = has("slug") ? String(t.slug ?? "").trim().toLowerCase() : ""
    if (wanted && wanted !== current?.slug) {
      if (!isValidSlug(wanted, reserved)) throw new BlogRuleError("invalid_slug", wanted)
      if (await taken(wanted)) throw new BlogRuleError("slug_taken", wanted)
      patch.slug = wanted
    } else if (!current) patch.slug = await uniqueSlug(name, taken, { reserved, fallback: "category" })
    if (current) {
      if (Object.keys(patch).length) await svc.updateBseoCategoryTranslations({ id: current.id, ...patch })
    } else await svc.createBseoCategoryTranslations({ category_id: category.id, locale: locale.code, name, slug: patch.slug, description: patch.description ?? null })
  }
}

function cleanCategory(input: CategoryInput) {
  const out: Record<string, unknown> = {}
  if (Object.prototype.hasOwnProperty.call(input, "rank")) out.rank = Math.max(0, Math.min(10000, Math.trunc(Number(input.rank) || 0)))
  if (Object.prototype.hasOwnProperty.call(input, "metadata")) out.metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata) ? input.metadata : null
  return out
}

async function emitChanged(container: MedusaContainer, id: string, slugs: Record<string, string>) {
  try {
    await container.resolve(Modules.EVENT_BUS).emit({ name: BlogSeoEvents.CATEGORY_CHANGED, data: { id, slugs } })
  } catch (e) {
    container.resolve(ContainerRegistrationKeys.LOGGER).warn(`[blog-seo] could not emit category event: ${(e as Error).message}`)
  }
}
const slugsOf = (c: CategoryRow) => Object.fromEntries((c.translations ?? []).map((t) => [t.locale, t.slug]))

export async function createCategory(container: MedusaContainer, input: CategoryInput): Promise<CategoryRow> {
  const settings = await getSettings(container)
  const translations = input.translations && typeof input.translations === "object" ? input.translations : {}
  const def = translations[settings.default_locale] ?? translations[Object.keys(translations).find((k) => k.toLowerCase() === settings.default_locale.toLowerCase()) ?? ""]
  if (!def || !plainLine(def.name, 120)) throw new BlogRuleError("invalid", `a name in the default locale (${settings.default_locale}) is needed`)
  const data = cleanCategory(input)
  const created = await service(container).createBseoCategories({ ...data, rank: data.rank ?? 0 })
  try {
    await writeTranslations(container, await retrieveCategory(container, created.id), translations, settings)
  } catch (e) {
    // a refused slug must not leave a category without translations behind
    await service(container).deleteBseoCategories([created.id])
    throw e
  }
  return retrieveCategory(container, created.id)
}

export async function updateCategory(container: MedusaContainer, id: string, input: CategoryInput): Promise<CategoryRow> {
  const settings = await getSettings(container)
  const before = await retrieveCategory(container, id)
  const patch = cleanCategory(input)
  if (Object.keys(patch).length) await service(container).updateBseoCategories({ id, ...patch })
  if (input.translations && typeof input.translations === "object") await writeTranslations(container, before, input.translations, settings)
  const after = await retrieveCategory(container, id)
  if (JSON.stringify(before.translations) !== JSON.stringify(after.translations) || before.rank !== after.rank) await emitChanged(container, id, { ...slugsOf(before), ...slugsOf(after) })
  return after
}

/** Posts in the category keep existing without a category */
export async function deleteCategory(container: MedusaContainer, id: string): Promise<void> {
  const before = await retrieveCategory(container, id)
  const posts = await service(container).listBseoPosts({ category_id: id }, { select: ["id"], take: 5000 })
  if (posts.length) await service(container).updateBseoPosts(posts.map((p: { id: string }) => ({ id: p.id, category_id: null })))
  await service(container).softDeleteBseoCategories([id])
  await emitChanged(container, id, slugsOf(before))
}

export async function categoryPostCounts(container: MedusaContainer, publicOnly = false): Promise<Record<string, number>> {
  const filters: Record<string, unknown> = { category_id: { $ne: null } }
  if (publicOnly) filters.status = "published"
  const posts = await service(container).listBseoPosts(filters, { select: ["id", "category_id"], take: 5000 })
  const counts: Record<string, number> = {}
  for (const p of posts) if (p.category_id) counts[p.category_id] = (counts[p.category_id] ?? 0) + 1
  return counts
}
