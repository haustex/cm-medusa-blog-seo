# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

### Added

- Blog module `blogSeo` (tables `bseo_*`): posts with per-locale translations (title, slug, excerpt, body,
  SEO title/description, OG image, cover alt, tags), categories (name/slug/description per locale), authors
  (person/organization, job title and bio per locale), settings.
- Locales are configured, not hard-coded: Admin settings (or plugin options, which lock them) hold the
  BCP 47 list, default locale and fallback rule (`default` / `hide` / `label`); RTL direction per locale.
- Draft → scheduled → published with a job (`*/5` by default), preview by secret token, one featured post,
  `content_updated_at` for public edits, republishing keeps the first public date.
- Sanitized bodies (sanitize-html) rendered into blocks, table of contents and FAQ items; product links
  through a module link (`product.bseo_posts`); uploads through the File Module with optional sharp processing.
- Store API `/store/blog-seo/*` (settings, posts, index view, post by slug, categories, authors, preview) and
  Admin API `/admin/blog-seo/*`; events `blog_seo.*` with slugs per locale and an optional batched
  revalidate webhook.
- Exports: `medusa-blog-seo/sdk` (typed client), `medusa-blog-seo/seo` (URLs, hreflang, sitemap entries,
  RSS), `medusa-blog-seo/jsonld` (BlogPosting, BreadcrumbList, FAQPage, ItemList).
