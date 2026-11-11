import { blogSeoAdmin, type AdminPost, type AdminPostInput, type AdminTranslationInput, type UploadResult } from "../../sdk"
import { sdk } from "./client"

export type { AdminAuthor, AdminCategory, AdminConfig, AdminPost, AdminSettings, Completeness } from "../../sdk"
export const api = blogSeoAdmin(sdk)

export type PostStatus = AdminPost["status"]
export const STATUSES: PostStatus[] = ["draft", "scheduled", "published"]
export const STATUS_COLOR: Record<PostStatus, "grey" | "orange" | "green"> = { draft: "grey", scheduled: "orange", published: "green" }

export const KEY = ["blog-seo"]
export const CONFIG_KEY = [...KEY, "config"]
export const SETTINGS_KEY = [...KEY, "settings"]
export const POSTS_KEY = [...KEY, "posts"]
export const CATEGORIES_KEY = [...KEY, "categories"]
export const AUTHORS_KEY = [...KEY, "authors"]
export const postKey = (id: string | undefined) => [...KEY, "post", id]

/** One locale's editable text */
export type TranslationFields = { title: string; slug: string; excerpt: string; body: string; seo_title: string; seo_description: string; og_image: string | null; cover_alt: string; tags: string[] }
/** The fields the editor edits (everything else on a post comes from the server) */
export type PostFields = {
  featured: boolean
  cover: string | null
  cover_wide: string | null
  category_id: string | null
  author_id: string | null
  product_ids: string[]
  translations: Record<string, TranslationFields>
}
export const TOP_KEYS = ["featured", "cover", "cover_wide", "category_id", "author_id", "product_ids"] as const
export const T_KEYS = ["title", "slug", "excerpt", "body", "seo_title", "seo_description", "og_image", "cover_alt", "tags"] as const

const text = (v: unknown) => (typeof v === "string" ? v : "")
export const emptyTranslation = (): TranslationFields => ({ title: "", slug: "", excerpt: "", body: "", seo_title: "", seo_description: "", og_image: null, cover_alt: "", tags: [] })

/** Server record → editor fields, one translation per enabled locale (missing ones empty) */
export function toFields(p: AdminPost, locales: string[]): PostFields {
  const translations: Record<string, TranslationFields> = {}
  for (const code of locales) {
    const t = p.translations[code]
    translations[code] = t
      ? { title: text(t.title), slug: text(t.slug), excerpt: text(t.excerpt), body: text(t.body), seo_title: text(t.seo_title), seo_description: text(t.seo_description), og_image: t.og_image ?? null, cover_alt: text(t.cover_alt), tags: Array.isArray(t.tags) ? t.tags : [] }
      : emptyTranslation()
  }
  return { featured: !!p.featured, cover: p.cover ?? null, cover_wide: p.cover_wide ?? null, category_id: p.category_id ?? null, author_id: p.author_id ?? null, product_ids: Array.isArray(p.product_ids) ? p.product_ids : [], translations }
}

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Only what differs from the last saved state (autosave sends partial updates); empty object when nothing */
export function changedFields(now: PostFields, saved: PostFields): AdminPostInput {
  const out: AdminPostInput = {}
  for (const k of TOP_KEYS) if (!same(now[k], saved[k])) (out as Record<string, unknown>)[k] = now[k]
  const translations: Record<string, AdminTranslationInput> = {}
  for (const [code, t] of Object.entries(now.translations)) {
    const s = saved.translations[code] ?? emptyTranslation()
    const patch: Record<string, unknown> = {}
    for (const k of T_KEYS) if (!same(t[k], s[k])) patch[k] = k === "og_image" ? t[k] || null : t[k]
    if (Object.keys(patch).length) translations[code] = patch
  }
  if (Object.keys(translations).length) out.translations = translations
  return out
}
export const isEmptyPatch = (p: AdminPostInput) => Object.keys(p).length === 0

// ---- dates (the browser's time zone) ----
export const lang = (l: string) => (l.startsWith("id") ? "id" : "en")
export function formatDateTime(iso: string | null | undefined, l: string) {
  if (!iso) return "–"
  return new Intl.DateTimeFormat(l === "id" ? "id-ID" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso))
}
export const formatTime = (d: Date, l: string) => new Intl.DateTimeFormat(l === "id" ? "id-ID" : "en-US", { timeStyle: "short" }).format(d)
/** ISO date → value of <input type="datetime-local"> in the browser's time zone */
export function toLocalInput(iso: string | Date) {
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}
/** Value of <input type="datetime-local"> → ISO date */
export function fromLocalInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) return null
  const d = new Date(value.slice(0, 16))
  return Number.isNaN(d.getTime()) ? null : d.toISOString()
}

// ---- images ----
const readDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result))
    r.onerror = () => reject(new Error("unreadable file"))
    r.readAsDataURL(file)
  })

/** One image → the upload route (with sharp: upright, resized, EXIF removed, JPEG) */
export async function uploadImage(file: File, kind: "cover" | "body" | "avatar" | "og", maxBytes = 25 * 1024 * 1024): Promise<UploadResult> {
  if (!file.type.startsWith("image/")) throw new Error("not_image")
  if (file.size > maxBytes) throw new Error("too_large")
  const data = await readDataUrl(file)
  return (await api.upload(file.name, data, kind)).file
}

// ---- products (Medusa Admin API) ----
export type ProductLite = { id: string; title: string; thumbnail: string | null; handle: string; status: string }

export async function searchProducts(q: string): Promise<ProductLite[]> {
  const query: Record<string, string> = { limit: "20", fields: "id,title,thumbnail,handle,status", order: "title" }
  if (q.trim()) query.q = q.trim()
  return (await sdk.client.fetch<{ products: ProductLite[] }>("/admin/products", { query })).products
}

export async function productsById(ids: string[]): Promise<ProductLite[]> {
  if (!ids.length) return []
  const found = (await sdk.client.fetch<{ products: ProductLite[] }>("/admin/products", { query: { limit: ids.length, fields: "id,title,thumbnail,handle,status", id: ids } })).products
  return ids.map((id) => found.find((x) => x.id === id)).filter((x): x is ProductLite => !!x)
}

/** A YouTube link or id → the 11-character video id */
export function youtubeId(input: string): string | null {
  const s = input.trim()
  if (/^[A-Za-z0-9_-]{11}$/.test(s)) return s
  try {
    const u = new URL(s)
    const host = u.hostname.replace(/^www\.|^m\./, "")
    let id: string | null = null
    if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0]
    else if (host === "youtube.com" || host === "youtube-nocookie.com") {
      if (u.pathname === "/watch") id = u.searchParams.get("v")
      else {
        const m = /^\/(embed|shorts|live)\/([^/?]+)/.exec(u.pathname)
        id = m ? m[2] : null
      }
    }
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null
  } catch {
    return null
  }
}

/** Latin title → slug preview (the server decides the final, unique slug) */
export function slugPreview(s: string) {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
}

/** Error from the API → the message to show (rule codes are translated by the caller) */
export function errorOf(e: unknown): { code: string | null; message: string } {
  const err = e as { message?: string; code?: string; status?: number }
  const m = err?.message ?? String(e)
  const code = err?.code ?? (/^(not_found|incomplete|slug_taken|invalid_slug|invalid_date|category_not_found|author_not_found|locale_unknown|invalid|locked)/.exec(m)?.[1] ?? null)
  return { code, message: m }
}
