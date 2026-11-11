import { z } from "@medusajs/framework/zod"

/**
 * Shapes only: strings are cleaned and the rules (slug uniqueness, completeness, allowed origins…) are applied in
 * src/lib/*. Unknown keys are dropped. `translations` is keyed by locale code.
 */
const nullableString = (max: number) => z.string().max(max).nullable().optional()
const metadata = z.record(z.string(), z.unknown()).nullable().optional()

const PostTranslation = z.object({
  title: z.string().max(500).optional(),
  slug: z.string().max(120).optional(),
  auto_slug: z.boolean().optional(),
  excerpt: z.string().max(2000).optional(),
  body: z.string().optional(),
  seo_title: nullableString(300),
  seo_description: nullableString(600),
  og_image: nullableString(2000),
  cover_alt: nullableString(600),
  tags: z.array(z.string().max(80)).max(40).optional(),
})
export const AdminPostBody = z.object({
  translations: z.record(z.string().max(16), PostTranslation).optional(),
  featured: z.boolean().optional(),
  cover: nullableString(2000),
  cover_wide: nullableString(2000),
  author_id: nullableString(64),
  category_id: nullableString(64),
  product_ids: z.array(z.string().max(64)).max(50).optional(),
  metadata,
})
export type AdminPostBodyType = z.infer<typeof AdminPostBody>

export const AdminPublishBody = z.object({ at: z.string().max(40).nullable().optional() })
export type AdminPublishBodyType = z.infer<typeof AdminPublishBody>

export const AdminListPosts = z.object({
  status: z.enum(["draft", "scheduled", "published"]).optional(),
  category_id: z.string().max(64).optional(),
  author_id: z.string().max(64).optional(),
  /** posts whose translation in this locale is missing or incomplete */
  missing_locale: z.string().max(16).optional(),
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})
export type AdminListPostsType = z.infer<typeof AdminListPosts>

const CategoryTranslation = z.object({ name: z.string().max(300).optional(), slug: z.string().max(120).optional(), description: nullableString(4000) })
export const AdminCategoryBody = z.object({
  translations: z.record(z.string().max(16), CategoryTranslation).optional(),
  rank: z.number().int().optional(),
  metadata,
})
export type AdminCategoryBodyType = z.infer<typeof AdminCategoryBody>

const AuthorTranslation = z.object({ job_title: nullableString(300), bio: nullableString(8000) })
export const AdminAuthorBody = z.object({
  name: z.string().max(300).optional(),
  slug: z.string().max(120).optional(),
  type: z.enum(["person", "organization"]).optional(),
  avatar: nullableString(2000),
  url: nullableString(2000),
  same_as: z.array(z.string().max(2000)).max(20).optional(),
  metadata,
  translations: z.record(z.string().max(16), AuthorTranslation).optional(),
})
export type AdminAuthorBodyType = z.infer<typeof AdminAuthorBody>

const Locale = z.union([z.string().max(16), z.object({ code: z.string().max(16), name: z.string().max(80).optional(), dir: z.enum(["ltr", "rtl"]).optional(), enabled: z.boolean().optional() })])
export const AdminSettingsBody = z.object({
  locales: z.array(Locale).max(50).optional(),
  default_locale: z.string().max(16).optional(),
  fallback: z.enum(["default", "hide", "label"]).optional(),
  routing: z
    .object({
      locales: z.record(z.string().max(16), z.object({ prefix: z.string().max(100).optional(), origin: z.string().max(300).optional() })).optional(),
      base: z.string().max(100).optional(),
      category: z.string().max(60).optional(),
      page: z.string().max(60).optional(),
      feed: z.string().max(60).optional(),
      preview: z.string().max(60).optional(),
      x_default: z.string().max(16).optional(),
    })
    .nullable()
    .optional(),
})
export type AdminSettingsBodyType = z.infer<typeof AdminSettingsBody>

export const AdminUploadBody = z.object({ filename: z.string().max(300).optional(), data: z.string().optional(), kind: z.enum(["cover", "body", "avatar", "og"]).optional() })
export type AdminUploadBodyType = z.infer<typeof AdminUploadBody>

export const StoreListPosts = z.object({
  locale: z.string().max(16).optional(),
  category: z.string().max(120).optional(),
  author: z.string().max(120).optional(),
  tag: z.string().max(80).optional(),
  view: z.enum(["index"]).optional(),
  /** "none": no separate featured article (default when a filter is given) */
  featured: z.enum(["separate", "none"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  offset: z.coerce.number().int().min(0).optional(),
})
export type StoreListPostsType = z.infer<typeof StoreListPosts>

export const StoreLocaleQuery = z.object({ locale: z.string().max(16).optional() })
