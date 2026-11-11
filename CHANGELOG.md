# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [Unreleased]

## [0.1.2] - 2026-11-11

### Changed

- Tests: the E2E app installs the plugin from its `npm pack` tarball instead of a symlink to the source tree, and
  with the Admin built (CI on the latest Medusa) checks that `@medusajs/admin-bundler` resolves
  `medusa-blog-seo/admin` and that every Tailwind class of the plugin's Admin bundle is in the Admin CSS
  (`scripts/admin-classes.mjs`). The earlier symlinked setup made the bundler's resolve fail silently, which is why
  0.1.0 moved the layout to the plugin's own `.bseo-*` CSS; that CSS stays (it works in both cases), the wrong
  explanation in `CLAUDE.md` is corrected.

### Documentation

- README: note on Admin Tailwind classes when the plugin is not resolvable from `@medusajs/admin-bundler` (pnpm without
  hoisting, locally symlinked plugin).

## [0.1.1] - 2026-11-11

### Changed

- No functional changes. First release built and published by GitHub Actions (`release.yml`) through npm
  trusted publishing, with provenance attached; 0.1.0 was published by hand to create the package.

## [0.1.0] - 2026-11-11

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
  RSS, `postRedirectUrl`), `medusa-blog-seo/jsonld` (BlogPosting, BreadcrumbList, FAQPage, ItemList).
- Slug history per locale (`bseo_post_slug_history`): a changed slug (edited, or a locale that leaves the fallback
  for its own translation) keeps its old address; `GET /store/blog-seo/posts/{slug}` answers
  `{ post: null, redirect, status: 301 }` for it. No chains or loops: history points at the post, live slugs win.
- Admin UI under **Blog**: post list with status tiles, filters (status, category, missing translation, search),
  editor with one tab per language (or side by side with the default language), completeness badges, rich editor
  (Tiptap: headings, lists, tables, photos, YouTube, product cards, Q&A), SEO fields, covers, products, publish /
  schedule (browser time zone) / unpublish / delete, preview links, autosave for drafts; categories, authors and
  settings pages (locales, default, fallback; fields fixed by options are read-only). English and Indonesian.

[Unreleased]: https://github.com/haustex/cm-medusa-blog-seo/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/haustex/cm-medusa-blog-seo/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/haustex/cm-medusa-blog-seo/compare/f2fcafc...v0.1.1
[0.1.0]: https://github.com/haustex/cm-medusa-blog-seo/commit/f2fcafc
