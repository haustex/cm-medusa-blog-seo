import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { adminPostView, withRules } from "../../../_lib"
import { getOptions } from "../../../../lib/options"
import { createPost, RELATIONS } from "../../../../lib/posts"
import { rulesOf, type PostRow } from "../../../../lib/serialize"
import { enabledCodes, getSettings } from "../../../../lib/settings"
import { completeness } from "../../../../lib/validate"
import { BLOG_SEO_MODULE } from "../../../../modules/blog-seo"
import type { AdminListPostsType, AdminPostBodyType } from "../../../validators"

const STATUSES = ["draft", "scheduled", "published"] as const

/**
 * GET /admin/blog-seo/posts?status=&category_id=&author_id=&missing_locale=en&q=&limit=&offset=
 * Newest change first. `q` matches titles and slugs in any locale; `missing_locale` lists posts whose translation
 * in that locale is missing or incomplete. Bodies are left out of the answer (the editor loads one post).
 */
export async function GET(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  const q = req.validatedQuery as AdminListPostsType
  const svc = req.scope.resolve(BLOG_SEO_MODULE) as any
  const settings = await getSettings(req.scope)
  const rules = rulesOf(getOptions(req.scope))
  const limit = q.limit ?? 20
  const offset = q.offset ?? 0
  const filters: Record<string, unknown> = {}
  if (q.status) filters.status = q.status
  if (q.category_id) filters.category_id = q.category_id === "none" ? null : q.category_id
  if (q.author_id) filters.author_id = q.author_id === "none" ? null : q.author_id
  const needle = (q.q ?? "").trim().toLowerCase()
  // in-memory filters (titles per locale, completeness) over at most 5000 posts
  const all: PostRow[] = await svc.listBseoPosts(filters, { relations: RELATIONS, order: { updated_at: "DESC", id: "DESC" }, take: 5000 })
  const codes = enabledCodes(settings)
  const rows = all.filter((p) => {
    if (needle && !(p.translations ?? []).some((t) => t.title.toLowerCase().includes(needle) || t.slug.includes(needle))) return false
    if (q.missing_locale) {
      const c = completeness(p, codes, settings.default_locale, rules).locales.find((l) => l.locale.toLowerCase() === q.missing_locale!.toLowerCase())
      if (!c || c.missing.length === 0) return false
    }
    return true
  })
  const counts = Object.fromEntries(STATUSES.map((s) => [s, all.filter((p) => p.status === s).length]))
  const posts = rows.slice(offset, offset + limit).map((p) => {
    const v = adminPostView(req, p, settings)
    const translations = Object.fromEntries(Object.entries(v.translations).map(([k, t]) => [k, { ...t, body: undefined }]))
    return { ...v, translations }
  })
  res.json({ posts, count: rows.length, limit, offset, counts })
}

/** POST /admin/blog-seo/posts — a new draft; any field optional, slugs come from the titles */
export async function POST(req: AuthenticatedMedusaRequest<AdminPostBodyType>, res: MedusaResponse) {
  await withRules(res, async () => {
    const post = await createPost(req.scope, req.validatedBody ?? {})
    res.status(201).json({ post: adminPostView(req, post, await getSettings(req.scope)) })
  })
}
