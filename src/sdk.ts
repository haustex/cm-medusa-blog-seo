/**
 * Typed helpers over `@medusajs/js-sdk` for the plugin's Store and Admin endpoints. Import from "medusa-blog-seo/sdk":
 *
 *   import Medusa from "@medusajs/js-sdk"
 *   import { blogSeoStore } from "medusa-blog-seo/sdk"
 *   const sdk = new Medusa({ baseUrl, publishableKey })
 *   const { posts, featured } = await blogSeoStore(sdk).listPosts({ locale: "id" })
 *
 * Only `sdk.client.fetch` is used, so any object with that shape works (your own fetch wrapper included).
 * The types below are the API's answer shapes; `medusa-blog-seo/seo` and `medusa-blog-seo/jsonld` build on them.
 */
export type FetchInit = { method?: string; body?: Record<string, any> | null; query?: Record<string, any>; headers?: Record<string, string>; cache?: RequestCache; next?: Record<string, unknown> }
export type FetchClient = { client: { fetch: <T>(path: string, init?: FetchInit) => Promise<T> } }
const bind = (sdk: FetchClient) => <T>(path: string, init?: FetchInit): Promise<T> => sdk.client.fetch<T>(path, init)

export type Dir = "ltr" | "rtl"
export type FallbackMode = "default" | "hide" | "label"
export type BlogLocale = { code: string; name: string; dir: Dir }
export type BlogRouting = {
  locales: Record<string, { prefix?: string; origin?: string }>
  base: string
  category: string
  page: string
  feed: string
  preview: string
  x_default: string | null
}
export type StoreBlogSettings = { locales: BlogLocale[]; default_locale: string; fallback: FallbackMode; routing: BlogRouting; x_default: string; storefront_url: string | null }

export type StoreCategory = { id: string; slug: string; name: string; description: string | null; locale: string; rank: number; alternates: Record<string, string> }
export type StoreAuthor = { id: string; slug: string; name: string; type: "person" | "organization"; avatar: string | null; url: string | null; same_as: string[]; job_title: string | null; bio: string | null }
export type StoreCard = {
  id: string
  /** The locale of the text shown (the default locale when `translated` is false) */
  locale: string
  /** false: the requested locale has no complete translation and the default locale's text is shown */
  translated: boolean
  dir: Dir
  slug: string
  title: string
  excerpt: string
  cover: string | null
  cover_wide: string | null
  cover_alt: string
  featured: boolean
  published_at: string | null
  updated_at: string | null
  reading_minutes: number
  category: StoreCategory | null
  author: StoreAuthor | null
  /** Slug per locale the post can be read in (hreflang) */
  alternates: Record<string, string>
}
export type FaqItem = { q: string; a: string }
export type TocItem = { id: string; label: string }
export type Block =
  | { type: "html"; html: string }
  | { type: "image"; src: string; alt: string; width: number | null; height: number | null; caption: string | null; position: number }
  | { type: "product"; id: string }
  | { type: "youtube"; id: string }
  | { type: "faq"; items: { q: string; a_html: string; a: string }[] }
export type StoreArticle = StoreCard & {
  seo_title: string
  seo_description: string
  og_image: string | null
  tags: string[]
  product_ids: string[]
  body_html: string
  blocks: Block[]
  toc: TocItem[]
  faq: FaqItem[]
  words: number
  text: string
  metadata: Record<string, unknown> | null
}
export type StorePreview = StoreArticle & { status: "draft" | "scheduled" | "published"; complete: boolean; preview: true }
export type IndexLocale = { slug: string; title: string; excerpt: string; translated: boolean; category_slug: string | null; category_name: string | null }
export type IndexRow = {
  id: string
  published_at: string | null
  updated_at: string | null
  cover: string | null
  cover_wide: string | null
  author: { id: string; slug: string; name: string; type: "person" | "organization" } | null
  images: { src: string; alt: string }[]
  locales: Record<string, IndexLocale>
}

export type StoreListPostsQuery = { locale?: string; category?: string; author?: string; tag?: string; featured?: "separate" | "none"; limit?: number; offset?: number }
export type StoreListPostsResponse = { posts: StoreCard[]; featured: StoreCard | null; category: StoreCategory | null; locale: string; count: number; limit: number; offset: number }

const BASE = "/store/blog-seo"
const q = (locale?: string) => (locale ? { locale } : undefined)

export function blogSeoStore(sdk: FetchClient) {
  const f = bind(sdk)
  return {
    settings: () => f<{ settings: StoreBlogSettings }>(`${BASE}/settings`),
    listPosts: (query: StoreListPostsQuery = {}) => f<StoreListPostsResponse>(`${BASE}/posts`, { query }),
    /** Every public post with every readable locale: sitemaps, feeds, llms.txt */
    index: () => f<{ posts: IndexRow[] }>(`${BASE}/posts`, { query: { view: "index" } }),
    getPost: (slug: string, locale?: string) => f<{ post: StoreArticle; more: StoreCard[] }>(`${BASE}/posts/${encodeURIComponent(slug)}`, { query: q(locale) }),
    categories: (locale?: string) => f<{ categories: (StoreCategory & { post_count: number })[]; locale: string }>(`${BASE}/categories`, { query: q(locale) }),
    authors: (locale?: string) => f<{ authors: (StoreAuthor & { post_count: number })[]; locale: string }>(`${BASE}/authors`, { query: q(locale) }),
    author: (slug: string, locale?: string) => f<{ author: StoreAuthor & { post_count: number }; locale: string }>(`${BASE}/authors/${encodeURIComponent(slug)}`, { query: q(locale) }),
    preview: (token: string, locale?: string) => f<{ post: StorePreview; more: StoreCard[] }>(`${BASE}/preview/${encodeURIComponent(token)}`, { query: q(locale), cache: "no-store" }),
  }
}

/* ---------- Admin ---------- */
export type AdminTranslation = { id: string; locale: string; title: string; slug: string; excerpt: string; body: string; seo_title: string | null; seo_description: string | null; og_image: string | null; cover_alt: string | null; tags: string[] | null }
export type Completeness = { publishable: boolean; cover_missing: boolean; locales: { locale: string; present: boolean; missing: ("title" | "excerpt" | "body" | "slug")[] }[] }
export type AdminPost = {
  id: string
  status: "draft" | "scheduled" | "published"
  published_at: string | null
  content_updated_at: string | null
  featured: boolean
  cover: string | null
  cover_wide: string | null
  preview_token: string
  product_ids: string[]
  metadata: Record<string, unknown> | null
  author_id: string | null
  category_id: string | null
  translations: Record<string, AdminTranslation>
  completeness: Completeness
  preview_urls: Record<string, string>
  public_urls: Record<string, string>
  created_at: string | null
  updated_at: string | null
}
export type AdminTranslationInput = Partial<Pick<AdminTranslation, "title" | "slug" | "excerpt" | "body" | "seo_title" | "seo_description" | "og_image" | "cover_alt" | "tags">> & { auto_slug?: boolean }
export type AdminPostInput = { translations?: Record<string, AdminTranslationInput>; featured?: boolean; cover?: string | null; cover_wide?: string | null; author_id?: string | null; category_id?: string | null; product_ids?: string[]; metadata?: Record<string, unknown> | null }
export type AdminListPostsQuery = { status?: AdminPost["status"]; category_id?: string; author_id?: string; missing_locale?: string; q?: string; limit?: number; offset?: number }
export type AdminCategory = { id: string; rank: number; metadata: Record<string, unknown> | null; translations: Record<string, { name: string; slug: string; description: string | null }>; post_count: number | null; created_at: string | null; updated_at: string | null }
export type AdminCategoryInput = { translations?: Record<string, { name?: string; slug?: string; description?: string | null }>; rank?: number; metadata?: Record<string, unknown> | null }
export type AdminAuthor = { id: string; slug: string; name: string; type: "person" | "organization"; avatar: string | null; url: string | null; same_as: string[]; metadata: Record<string, unknown> | null; translations: Record<string, { job_title: string | null; bio: string | null }>; post_count: number | null; created_at: string | null; updated_at: string | null }
export type AdminAuthorInput = { name?: string; slug?: string; type?: "person" | "organization"; avatar?: string | null; url?: string | null; same_as?: string[]; metadata?: Record<string, unknown> | null; translations?: Record<string, { job_title?: string | null; bio?: string | null }> }
export type AdminSettings = { locales: (BlogLocale & { enabled: boolean; rank: number })[]; default_locale: string; fallback: FallbackMode; routing: BlogRouting; image_origins: string[]; locked: { locales: boolean; default_locale: boolean; fallback: boolean } }
export type AdminSettingsInput = { locales?: (string | { code: string; name?: string; dir?: Dir; enabled?: boolean })[]; default_locale?: string; fallback?: FallbackMode; routing?: Partial<BlogRouting> | null }
export type AdminConfig = { show_credit: boolean; storefront_url: string | null; publish: { require_excerpt: boolean; require_cover: boolean }; uploads: { process_images: boolean; max_bytes: number; max_side: number }; content: { faq_from_headings: boolean; max_body_bytes: number; reserved_slugs: string[] }; revalidate: boolean }
export type UploadResult = { url: string; width: number | null; height: number | null; size: number; mime_type: string; processed: boolean }

const ADMIN = "/admin/blog-seo"

export function blogSeoAdmin(sdk: FetchClient) {
  const f = bind(sdk)
  return {
    config: () => f<AdminConfig>(`${ADMIN}/config`),
    settings: () => f<{ settings: AdminSettings }>(`${ADMIN}/settings`),
    saveSettings: (body: AdminSettingsInput) => f<{ settings: AdminSettings }>(`${ADMIN}/settings`, { method: "POST", body }),
    listPosts: (query: AdminListPostsQuery = {}) => f<{ posts: AdminPost[]; count: number; limit: number; offset: number; counts: Record<AdminPost["status"], number> }>(`${ADMIN}/posts`, { query }),
    getPost: (id: string) => f<{ post: AdminPost }>(`${ADMIN}/posts/${id}`),
    createPost: (body: AdminPostInput) => f<{ post: AdminPost }>(`${ADMIN}/posts`, { method: "POST", body }),
    updatePost: (id: string, body: AdminPostInput) => f<{ post: AdminPost }>(`${ADMIN}/posts/${id}`, { method: "POST", body }),
    deletePost: (id: string) => f<{ id: string; deleted: true }>(`${ADMIN}/posts/${id}`, { method: "DELETE" }),
    /** `at` in the future schedules the post; null/omitted publishes now */
    publishPost: (id: string, at?: string | null) => f<{ post: AdminPost }>(`${ADMIN}/posts/${id}/publish`, { method: "POST", body: { at: at ?? null } }),
    unpublishPost: (id: string) => f<{ post: AdminPost }>(`${ADMIN}/posts/${id}/unpublish`, { method: "POST", body: {} }),
    rotatePreviewToken: (id: string) => f<{ post: AdminPost }>(`${ADMIN}/posts/${id}/preview-token`, { method: "POST", body: {} }),
    listCategories: () => f<{ categories: AdminCategory[] }>(`${ADMIN}/categories`),
    createCategory: (body: AdminCategoryInput) => f<{ category: AdminCategory }>(`${ADMIN}/categories`, { method: "POST", body }),
    updateCategory: (id: string, body: AdminCategoryInput) => f<{ category: AdminCategory }>(`${ADMIN}/categories/${id}`, { method: "POST", body }),
    deleteCategory: (id: string) => f<{ id: string; deleted: true }>(`${ADMIN}/categories/${id}`, { method: "DELETE" }),
    listAuthors: () => f<{ authors: AdminAuthor[] }>(`${ADMIN}/authors`),
    createAuthor: (body: AdminAuthorInput) => f<{ author: AdminAuthor }>(`${ADMIN}/authors`, { method: "POST", body }),
    updateAuthor: (id: string, body: AdminAuthorInput) => f<{ author: AdminAuthor }>(`${ADMIN}/authors/${id}`, { method: "POST", body }),
    deleteAuthor: (id: string) => f<{ id: string; deleted: true }>(`${ADMIN}/authors/${id}`, { method: "DELETE" }),
    /** JSON upload: a data URL ("data:image/png;base64,…") */
    upload: (filename: string, dataUrl: string, kind?: "cover" | "body" | "avatar" | "og") => f<{ files: UploadResult[]; file: UploadResult }>(`${ADMIN}/uploads`, { method: "POST", body: { filename, data: dataUrl, kind } }),
  }
}
