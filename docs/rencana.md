# medusa-blog-seo — riset & rencana (11 Nov 2026, belum coding)

Plugin open-source Medusa v2: blog multibahasa dengan SEO lengkap, diekstrak dari modul blog hauskayu.
Repo: `haustex/cm-medusa-blog-seo` (kosong, dicek 11 Nov). npm: `medusa-blog-seo` (kosong, dicek 11 Nov).

## 1. Audit modul blog hauskayu

Ukuran: backend ±2.900 baris (modul 600, lib/API 700, Admin 1.600), storefront ±1.900 baris. Modul sudah dibuat
tanpa impor ke kode toko (docs/keputusan.md "Blog"), jadi batas ekstraksinya jelas.

### Generik → masuk plugin

| Bagian hauskayu | Di plugin |
| --- | --- |
| `modules/blog` (model post + kategori, service) | Dipecah: `blog_post` + `blog_post_translation` per locale (lihat §3), `blog_category` + terjemahan, `blog_author` baru, `blog_settings` |
| `modules/blog/lib/sanitize.ts` (sanitize-html, hanya gambar dari origin sendiri, kartu produk, YouTube) | Sama; origin gambar dari File Module (`backend_url`/`MEDIA_URL`) jadi opsi |
| `modules/blog/lib/render.ts` (htmlparser2 → blocks/toc/faq/words) | Sama; FAQ rule (h3 diakhiri "?") jadi opsi `faq_from_headings` |
| `lib/slug.ts`, `lib/schedule.ts`, `lib/validate.ts` | Sama; "lengkap" dihitung per locale, bukan hard-code id+en |
| `lib/blog/posts.ts` (aturan tulis, event `blog.changed`, sinkron link produk) | Jadi workflows plugin (`createPostWorkflow`, `updatePostWorkflow`, `publishPostWorkflow`, …) |
| `links/blog-post-product.ts` | Sama (many-to-many, urutan di post) |
| `api/admin/blog/*`, `api/store/blog/*`, preview bertoken | Sama + validator zod + `applyLocale`; path `/admin/blog/*`, `/store/blog/*` |
| `api/admin/blog/uploads` (sharp: rotate, maks 2400px, buang EXIF, JPEG) | Sama, `sharp` jadi **optional peer dep**: tanpa sharp file disimpan apa adanya lewat File Module |
| `jobs/blog-publish-scheduled.ts` | Sama (cron opsi, default */5) |
| `subscribers/blog-revalidate.ts` (batch 2 s → POST storefront) | Jadi opsi plugin `revalidate: { url, secret, delay_ms }`; event publik tetap dipancarkan untuk subscriber sendiri |
| Admin: daftar, editor Tiptap (+tabel), kategori, product-picker | Sama, tab per locale dinamis + i18n teks Admin |
| Storefront `lib/data/blog.ts` (tipe + fetch), `seo/blog.ts` (BlogPosting, ItemList), `seo/blog-feed.ts` (RSS), `metadata.ts` (alternates) | Jadi helper bertipe di plugin: `medusa-blog-seo/sdk`, `/jsonld`, `/seo` (hreflang, sitemap, RSS) |

### Spesifik hauskayu → tetap di hauskayu

- Pipeline gambar `/img/{blog}/{slug}-{n}-{w}-{hash}` + `lib/image-names.ts` + `withImageNames()` di `view.ts`
  (plugin cukup mengembalikan `src` + `width/height` + urutan gambar; hauskayu memetakan namanya sendiri).
- `og:image` generator (`/og/{market}/blog/…`), `brandShareImage`, ORG/legalName, `STORE_NAME`.
- Desain: `modules/blog/components/*`, `blog.css`, template article/listing, kamus i18n toko, `optimisticRouting`.
- Routing market (`/` = id, `/us` = en) dan `marketAlternates` — plugin hanya menerima **pola** (lihat §4).
- `/api/revalidate` + Cache-Tag Cloudflare (`blog-post-{slug}`, `blog-list`, `blog-feed`, `sitemap`, `llms`) dan
  `llms.txt` — plugin memancarkan event + webhook; apa yang di-purge urusan toko.
- Aturan "tag hanya bahasa Indonesia" → di plugin tag per locale (hauskayu mengisi tag EN nanti, atau kosong).
- Seed `seed-blog-sample.ts` (contoh plugin diganti yang netral).

## 2. Pesaing (dicek 11 Nov 2026)

| Paket | Status | Yang ada | Yang tidak ada |
| --- | --- | --- | --- |
| `medusa-blog-management` 0.0.13 (Okt 2026, deskripsi masih "A starter for Medusa plugins") | v2, peer Medusa 2.12.4 persis | 1 model post, CRUD Admin, Tiptap (image/YouTube), store list/detail, `read_count`, helper metadata | kategori, penulis, i18n, jadwal, preview, sanitasi server, SEO/JSON-LD, sitemap/RSS, event cache, tes |
| `medusa-plugin-content` 0.2.6 (Agu 2026, pevey) | v2 ≥2.18, **Sustainable Use License** (bukan MIT) | CMS generik: koleksi + skema field dinamis, Markdown (MDXEditor), creator, tag, relasi, activity log, widget produk | bukan blog siap pakai: tanpa i18n, jadwal, preview, JSON-LD, sitemap/RSS; storefront harus merakit sendiri |
| `medusa-plugin-blog` 0.1.0 (pevey, ±2023) | eksperimental, tidak dilanjutkan (npm sudah 404) | – | – |
| `medusa-plugin-blogger` (MoscatelliMarco) | v1, Editor.js, mati ±2,5 tahun | – | – |
| `medusa-blog` 0.0.1 (2024) | v1 | – | – |
| CMS eksternal (Sanity/Contentful/Payload/Strapi) | integrasi resmi | editorial kuat | data di luar Medusa, biaya, tanpa relasi produk native + harga market |

Celah yang belum ada siapa pun: blog **multibahasa** (locale bebas + fallback), terjadwal + preview bertoken,
sanitasi server, produk shoppable dengan harga market, JSON-LD/hreflang/sitemap/RSS siap pakai, event purge cache,
tes CI di dua versi Medusa, lisensi MIT.

## 3. Fitur target & keputusan desain

### Bahasa (tidak di-hardcode)

- **Locale** = tabel `blog_settings` (satu baris): `locales: [{ code, name, dir, enabled, rank }]` (BCP-47, mis.
  `id`, `en`, `de`, `ja`, `pt-BR`, `ar`), `default_locale`, `fallback: "default" | "hide" | "label"`,
  `routing` (§4). Diatur di Admin → Blog → Pengaturan. Opsi `medusa-config` yang sama mengunci nilai (Admin
  menampilkannya read-only) — hauskayu memakai opsi config supaya ikut git.
- `dir` otomatis `rtl` untuk `ar, he, fa, ur` (bisa ditimpa); dikirim di Store API dan dipakai editor Admin.
- **Translation Module Medusa:** kalau aktif (flag `translation`), daftar locale toko (`store.supported_locales` +
  nama dari tabel `locale`) ditawarkan sebagai sumber daftar bahasa (tombol "ambil dari pengaturan toko"), dan
  `req.locale` bawaan (`?locale=` / `x-medusa-locale`) dipakai. **Isi artikel tidak disimpan di Translation Module**:
  body harus disanitasi di server, aturan "siap terbit per locale" butuh satu tempat, dan plugin harus jalan tanpa
  flag. Opsi lanjutan (fase 2): `translation_module.mirror: true` menyalin judul/ringkasan/SEO ke Translation
  Module supaya statistik & bulk editor Admin bawaan melihat blog (satu arah, body tidak ikut).
- **Fallback per locale** (dihitung di Store API, bukan di storefront):
  `default` → artikel tampil memakai terjemahan default + `translated: false`;
  `hide` → artikel tidak ada di locale itu (404, tidak masuk daftar/sitemap/RSS locale itu);
  `label` → seperti `default` + storefront menampilkan label "belum diterjemahkan" (teks dari toko).
- **Per locale:** `title`, `slug`, `excerpt`, `body`, `seo_title`, `seo_description`, `og_image` (opsional),
  `cover_alt`, `tags`. Kategori: `name`, `slug`, `description`. Penulis: `bio`.
  Slug unik per (locale) — artikel yang sama boleh `/blog/merawat-talenan` dan `/en/blog/cutting-board-care`.
- **Admin:** tab per bahasa (urutan `rank`, default dulu), "berdampingan" untuk 2 tab di layar lebar; indikator
  per tab ("EN: belum ada" / "EN: isi kosong"); daftar artikel punya filter `missing_locale=<code>` dan kolom
  kelengkapan; kategori sama.
- **Teks Admin plugin:** `src/admin/i18n/{en,id}.json`, dipilih dari bahasa Admin Medusa (`i18next` yang dipakai
  dashboard) dengan fallback `en`; kontributor tinggal menambah file.

### Konten & alur

- Model: `blog_post` (status draft/scheduled/published, `published_at`, `content_updated_at`, `featured`,
  `cover`, `cover_wide`, `preview_token`, `author_id`, `category_id`, `product_ids`, `metadata`),
  `blog_post_translation` (unik `post_id+locale`), `blog_category` + `blog_category_translation`, `blog_author`
  (`name`, `slug`, `avatar`, `url`, `same_as[]`, `type: person|organization`), `blog_settings`.
- Status per artikel; kesiapan per locale (judul + ringkasan + isi). Terbit/terjadwal butuh **locale default
  lengkap**; locale lain mengikuti aturan fallback. Job cron menerbitkan yang jatuh tempo.
- Preview bertoken per artikel, semua locale, `no-store`; endpoint `/store/blog/preview/{token}?locale=`.
- Editor Tiptap seperti hauskayu (heading, list, quote, link, gambar via File Module, tabel, kartu produk, YouTube).
  Dependensi Tiptap dibundel di plugin (bukan peer) supaya versi tidak bentrok.
- Gambar: `POST /admin/blog/uploads` → File Module (`access: public`), `sharp` opsional. Store API mengirim
  `src`, `width`, `height`, `position`; nama bersih urusan toko.
- Relasi produk: link `blog_post ↔ product`; Store API mengembalikan `product_ids` berurutan, storefront mengambil
  harga market sendiri (contoh komponen di README).
- Event: `blog.post.published | updated | unpublished | deleted`, `blog.category.changed` dengan payload
  `{ id, slugs: { [locale]: slug }, category_slugs, all }`; webhook opsional `revalidate.url` (batch).
- Opsional Meilisearch (fase 2): opsi `search.meilisearch { host, api_key, index_prefix }` → satu index per locale
  (`blog_{locale}`), diisi saat publish/update/unpublish; klien `meilisearch` optional peer dep.
- `showCredit` default `false` (teks kecil di halaman Admin plugin), kredit Haus Kayu di README.

### Store API & SDK

- `GET /store/blog/settings` → locales (code, name, dir), default, fallback, routing.
- `GET /store/blog/posts?locale=&category=&author=&tag=&limit=&offset=` (featured terpisah seperti sekarang),
  `GET /store/blog/posts/{slug}?locale=`, `GET /store/blog/categories`, `GET /store/blog/authors`,
  `GET /store/blog/index` (semua artikel publik: slug per locale, lastmod, gambar → sitemap/hreflang/RSS/llms).
- `medusa-blog-seo/sdk`: `blogStore(sdk)` bertipe (`Post`, `PostCard`, `Block`, `Settings`, …).
- `medusa-blog-seo/jsonld`: `blogPosting()`, `breadcrumbList()`, `faqPage()`, `itemList()` — input: artikel +
  `{ origin, url, organization, author }`.
- `medusa-blog-seo/seo`: `alternates()` (hreflang + x-default), `sitemapEntries()`, `rss()` — semua dari `index` +
  pola routing §4.

## 4. Routing per bahasa (opsi `routing`)

```ts
routing: {
  // pola per locale; {slug} wajib, {page} untuk paginasi; prefix "" = tanpa prefix
  locales: { id: { prefix: "" }, en: { prefix: "/us" } },        // hauskayu
  // atau domain berbeda: { de: { origin: "https://example.de" } }
  base: "/blog", category: "kategori", page: "page", feed: "feed.xml",  // segmen bisa per locale juga
  x_default: "en",
}
```

Helper `postUrl(locale, slug)`, `categoryUrl()`, `alternates(post)` memakai ini; storefront bebas memakai atau
mengabaikannya. Tidak ada redirect geo di plugin.

## 5. Pola repo (sama dengan plugin sebelumnya)

`~/plugins/medusa-blog-seo` → `haustex/cm-medusa-blog-seo`; MIT; `medusa plugin:build`; exports `./sdk`, `./jsonld`,
`./seo`, `./admin`, `./modules/*`; CI matrix Medusa 2.19.0 + 2.22.2 (`scripts/use-medusa.mjs`), lint + typecheck +
unit + build + `check-pack` + E2E (Postgres container); release lewat npm trusted publishing + provenance; README
dwibahasa (EN + ID), tabel kompatibilitas, `docs/` dengan contoh Next.js (listing, artikel, sitemap, RSS, hreflang),
CHANGELOG, SECURITY, CONTRIBUTING. `.translatable()` butuh ≥2.13 — aman di 2.19.

Tes: unit (sanitize, render, slug, schedule, completeness per locale, fallback, url helper) + E2E (locale
id/en/de: tulis → terbit ditolak sampai default lengkap → jadwal → job → Store API per locale + fallback 3 mode →
preview → kategori/penulis → event + webhook → unpublish/hapus; upload tanpa sharp dan dengan sharp).

Urutan kerja (setelah OK): (1) skeleton + settings + model + migrasi, (2) workflows + Admin API + Store API +
fallback, (3) Admin UI (tab locale, filter), (4) helper sdk/jsonld/seo + README contoh, (5) tes + CI + rilis
0.1.0, (6) fase 2: mirror Translation Module, Meilisearch.

## 6. Migrasi hauskayu (nanti, setelah plugin 0.1.0) — berdampingan, tanpa rename tabel lama

Syarat: URL artikel, kategori, dan gambar tidak berubah; data tidak hilang. Tabel plugin berprefix `bseo_*`,
key modul `blogSeo`, route `/store/blog-seo/*` + `/admin/blog-seo/*`: tidak bentrok dengan modul lama
(`blog_post`, `/store/blog/*`), jadi keduanya bisa hidup bersamaan.

1. Backup DB (`deploy/backup.sh`).
2. Pasang plugin berdampingan: opsi `locales: id (default), en; fallback: "hide"; routing id "" / en "/us";
   storefront_url; content.image_origins` (origin R2/`/static` hauskayu); `medusa db:migrate` membuat `bseo_*`.
3. Skrip `medusa exec` menyalin (idempoten, by `metadata.hk_id`): post → `bseo_post` + 2 baris
   `bseo_post_translation` (`id`, `en`) dengan **slug sama** untuk keduanya (hauskayu satu slug per market);
   kategori → `bseo_category` + terjemahan (slug sama); teks `author` lama → `bseo_author` (default "HAUS KAYU"
   tipe organization, dipetakan per nama); `preview_token`, `status`, `published_at`, `content_updated_at`,
   `featured`, `product_ids` + link; tag → tag locale `id` (EN kosong). URL file `cover`/`cover_wide`/`<img src>`
   disalin apa adanya → nama `/img/blog/{slug}-{n}` tetap karena slug + file sama.
4. Verifikasi sebelum pindah: dump URL dari API lama (`/store/blog/posts?view=index`) vs plugin
   (`/store/blog-seo/posts?view=index` + helper `seo`): daftar URL sitemap, RSS, `llms-full`, dan URL gambar
   harus identik.
5. Storefront dipindah ke plugin: `lib/data/blog.ts` → `medusa-blog-seo/sdk`, JSON-LD/RSS/sitemap → helper
   `seo`/`jsonld` tapi tetap dibungkus `/img`, `/og`, Cache-Tag, dan `llms.txt` sendiri; subscriber revalidate
   lama diganti opsi `revalidate.url` (payload baru: `blog_seo.posts[].slugs/previous_slugs`).
6. Modul lama dimatikan (hapus modul, API, Admin, job, subscriber); E2E `blog-publish.mjs` + `image-urls.mjs`
   hijau; Rich Results Test satu artikel.
7. Tabel lama (`blog_post`, `blog_category`, `blog_blog_post_product_product`) di-drop belakangan, setelah
   backup berikutnya dan beberapa hari produksi tanpa keluhan.
