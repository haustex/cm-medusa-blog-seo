# Contributing

Thank you for helping! Bug reports, fixes and translations (Admin texts in `src/admin/i18n/json`) are welcome.
For larger changes please open an issue first, so we can agree on the approach. Two things are not up for
discussion: languages stay configurable (nothing locale-specific in the code), and a changed slug never becomes
a 404 (slug history + 301).

## Setup

Node.js 20.19+ or 22.12+, Docker (for the end-to-end Postgres).

```bash
npm ci
npm run build
```

## Checks

Every pull request runs these in CI, against Medusa 2.19.0 and 2.22.2:

```bash
npm run lint
npm run typecheck        # the plugin and the Admin extension
npm run test:unit
npm run build
npm run pack:check       # what `npm pack` would publish
npm run test:e2e
```

To try another Medusa release locally: `node scripts/use-medusa.mjs 2.22.2` (not saved; `npm ci` goes back).

## End-to-end tests

`integration-tests/e2e.mjs` creates a fresh database, migrates, starts Medusa on port 9700 with the plugin and a
small hook server (records the revalidate webhook), then drives the Admin and Store APIs: settings and locales,
posts with several translations, categories, authors, uploads (a generated PNG), publish / schedule / unpublish,
fallback modes, slug history and redirects, preview tokens, the index view, product links.

```bash
docker run -d --name rw-spike-pg -e POSTGRES_PASSWORD=spike -e POSTGRES_DB=rw_spike \
  -p 127.0.0.1:55436:5432 postgres:17-alpine
npm run build && npm run test:e2e
```

`BSEO_ADMIN=1 BSEO_KEEP=1 npm run test:e2e` builds the Admin too and keeps the server running on
http://127.0.0.1:9700/app (login `admin@e2e.test` / `e2e-password-123`) to look at the Blog pages.
`BSEO_NO_SHARP=1` runs the upload checks without image processing; `BSEO_LOCK=1` starts the app with locales
fixed in the plugin options; `BSEO_CREDIT=1` turns `showCredit` on (the checks do; the default is off).

To click through the Admin with sample content instead of the test data:

```bash
BSEO_ADMIN=1 BSEO_SERVE=1 node integration-tests/e2e.mjs     # fresh database, no checks, server kept on 9700
node integration-tests/seed-demo.mjs                         # id + en: one published, one scheduled, one draft
BSEO_ADMIN=1 BSEO_SERVE=1 BSEO_KEEP_DB=1 node integration-tests/e2e.mjs   # restart on the same data after a rebuild
```

`integration-tests/admin-browser.mjs` drives that app in headless Chrome (missing-translation badges and filter,
side-by-side view, draft autosave, unsaved indicator and leave confirmation, slug change confirmation → 301). It
needs puppeteer, which is not a dependency: `PUPPETEER_DIR=/folder/with/node_modules/puppeteer node
integration-tests/admin-browser.mjs`. Not part of CI.

The suite removes its own folders (`integration-tests/.state`, `app/static`, `app/private`, `app/node_modules`,
the built server's `node_modules`) through one guarded function that refuses any path outside
`integration-tests/`.

Every Medusa command goes through `scripts/guard.mjs`, which refuses any database other than `127.0.0.1:55436`,
any Redis other than `127.0.0.1:56383` and HTTP ports below 9700.

## Database changes

Change a model in `src/modules/blog-seo/models`, then generate the migration against the throwaway database
(the command takes no module argument):

```bash
export DATABASE_URL=postgres://postgres:spike@127.0.0.1:55436/rw_spike REDIS_URL=redis://127.0.0.1:56383
npm run db:generate
```

Service method names follow the model names (`listBseoPosts`, `createBseoPostTranslations`,
`listBseoPostSlugHistories`…).

## Style

- Rules live in `src/lib/*` and throw `BlogRuleError(code)`; API routes map codes to HTTP status in
  `src/api/_lib.ts` (`withRules`) and validate with zod (`src/api/validators.ts`).
- Nothing locale-specific in the code: names, directions and lists come from the settings (`src/lib/locales.ts`
  only knows how to derive a default name and direction from a code).
- Store responses are built in `src/lib/serialize.ts`; add fields there, never ad hoc in a route.
- User-facing text in English and Indonesian (`src/admin/i18n/json`); every key in both files.
- Small commits with clear messages; update CHANGELOG.md under "Unreleased".
