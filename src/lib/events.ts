/**
 * Events emitted by the plugin. Payloads carry ids and the public slugs per locale, so a subscriber can purge or
 * re-render pages without another lookup. Only public changes emit post events (a draft being edited does not).
 */
export const BlogSeoEvents = {
  POST_PUBLISHED: "blog_seo.post.published", // { id, slugs: { [locale]: slug }, category_slugs: { [locale]: slug } }
  POST_UPDATED: "blog_seo.post.updated", // same; also carries previous slugs when they changed
  POST_UNPUBLISHED: "blog_seo.post.unpublished",
  POST_DELETED: "blog_seo.post.deleted",
  CATEGORY_CHANGED: "blog_seo.category.changed", // { id | null, all: true }
  AUTHOR_CHANGED: "blog_seo.author.changed", // { id, all: true }
  SETTINGS_CHANGED: "blog_seo.settings.changed", // { all: true }
} as const

export type PostEvent = {
  id: string
  slugs: Record<string, string>
  previous_slugs?: Record<string, string>
  category_slugs: Record<string, string>
  previous_category_slugs?: Record<string, string>
}
export type GlobalEvent = { id?: string | null; all: true }
