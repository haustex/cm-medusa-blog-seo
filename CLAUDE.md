# CLAUDE.md — medusa-blog-seo (multilingual blog + SEO for Medusa v2, by Haus Kayu)

## ⚠️ Server rules (read before doing anything)

This host also runs the **hauskayu.com production store**.

- **Never** send requests to ports `9000`, `8000`, `80`, `443`, `5432`, `6379` or any `*.hauskayu.com` domain from tests.
- **Never** touch the `hauskayu-*` containers or the `~/hauskayu` repo from this plugin's work.
- Test **only** on ports `9700+` and the `rw-spike-*` containers (Postgres `127.0.0.1:55436`, Redis `127.0.0.1:56383`).
- Every medusa/db command goes **through `scripts/guard.mjs`**.
- Any `rm` (in shell or in a script) is shown to the maintainer first, uses `${VAR:?}` guards and absolute paths
  inside the repo; `integration-tests/e2e.mjs` has exactly one `fs.rmSync` call, behind `rmGuarded()`.
- **Never commit** secrets or `.env` files. Do not publish to npm or push to GitHub until the maintainer (Haus Kayu) says OK.

## Technical decisions

- One module `blogSeo`, tables `bseo_*` (settings, author, author_translation, category, category_translation,
  post, post_translation, post_slug_history), link table post ↔ product (`product.bseo_posts`). Prefix and route
  names (`/store/blog-seo`, `/admin/blog-seo`, Admin route `/blog-seo`) are chosen so the plugin can run next to
  hauskayu's old blog module during the migration.
- **Service keys = DML model names** (`BseoPost` → `listBseoPosts`, `createBseoPostTranslations`,
  `listBseoPostSlugHistories`…); Query relations need those names.
- Languages are data: `bseo_settings` row (Admin) or plugin options (locked). `src/lib/locales.ts` only derives
  a default name (`Intl.DisplayNames`) and direction from a BCP 47 code. Request locale: `?locale` →
  `x-medusa-locale` → `req.locale` → default; exact match → same language → default.
- Fallback computed server-side (`pickTranslation` in `src/lib/serialize.ts`): `default` / `label` answer the
  default locale's text with `translated: false`; `hide` leaves the locale out of `alternates`.
- Completeness check before writing: `planTranslations` → `simulate` → `applyTranslations` (`src/lib/posts.ts`),
  so a refused update never leaves half-written translations. Created rows are deleted when a later rule fails.
- Slug history (`rememberSlug`): rows point at the post, never at another slug (no chains); live slugs win over
  history; a slug that returns to use deletes its history row. Store `GET /posts/{slug}` answers
  `{ post: null, redirect, status: 301 }` (HTTP 200) so storefront helpers decide the redirect.
- Bodies: sanitize-html allow-list, rendered into blocks/toc/faq in `src/lib/render.ts`; images only from the File
  Module's origin (learned from uploads into `settings.metadata.image_origins`) and `content.image_origins`.
- Uploads: `storeImage` with optional `sharp` (`loadSharp()`), header parser for dimensions without sharp.
- Public lists load up to 5000 posts (`listPublicPosts`), documented as a limit in the README.
- **Admin Tailwind and plugins**: `@medusajs/admin-bundler` adds `dirname(require.resolve("<plugin>/admin"))` to
  Tailwind's `content`, so the plugin's built Admin bundle is scanned and its utility classes exist at runtime, in
  npm, Yarn and default pnpm installs. The resolve happens from the bundler's real location: it fails silently when
  the package is not reachable from there (pnpm without hoisting; a plugin symlinked from outside the project, which
  is what the old test harness did and why layouts looked one-column on 11 Nov 2026). The harness now installs the
  `npm pack` tarball and links it into the plugin's node_modules; `BSEO_ADMIN=1` checks the resolve and that every
  class of the bundle is in the Admin CSS (`scripts/admin-classes.mjs`). `src/admin/components/styles.tsx`
  (`.bseo-*`) stays: it works either way. Use only tokens Medusa UI defines (`ui-fg-warning` does not exist).
- Admin UI: Medusa UI + react-i18next (`src/admin/i18n`), Tiptap 3 editor, drafts autosave through `changedFields`
  (diff only), published posts save on demand; routes under `/blog-seo`.
- E2E (`integration-tests/e2e.mjs`): hook server on 9701 records the revalidate webhook; `makePng()` builds a real
  PNG; `BSEO_ADMIN=1` also builds the Admin.

## Backlog

- Admin: routing editor (today options only), bulk translate-status export.
- Import script from other blog modules (hauskayu's old `blog_post` first, see `docs/rencana.md` §6).
