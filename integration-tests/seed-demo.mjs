// Sample content for a kept test app (BSEO_ADMIN=1 BSEO_SERVE=1 node integration-tests/e2e.mjs):
// locales id (default) + en with fallback "hide", one category, one author, three posts with covers made by
// sharp: one published (id + en, featured), one scheduled for the day after tomorrow (id + en), one draft (id only).
// Idempotent enough for a demo: run it once per fresh database. Talks only to 127.0.0.1:9700.
import sharp from "sharp"

const BASE = process.env.BSEO_BASE || "http://127.0.0.1:9700"
const ADMIN = { email: "admin@e2e.test", password: "e2e-password-123" }
let auth = ""

async function api(method, url, body) {
  const res = await fetch(BASE + url, { method, headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) }, body: body ? JSON.stringify(body) : undefined })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${JSON.stringify(json)}`)
  return json
}

/** A cover: wood-coloured 1200×900 with a label, JPEG through the plugin's upload route */
async function cover(label, hue) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900">
    <rect width="1200" height="900" fill="${hue}"/>
    <rect x="60" y="60" width="1080" height="780" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="6"/>
    <text x="600" y="470" font-family="sans-serif" font-size="72" fill="#fff" text-anchor="middle">${label}</text>
  </svg>`
  const png = await sharp(Buffer.from(svg)).png().toBuffer()
  const r = await api("POST", "/admin/blog-seo/uploads", { filename: `${label.toLowerCase().replace(/\W+/g, "-")}.png`, data: `data:image/png;base64,${png.toString("base64")}`, kind: "cover" })
  return r.file.url
}

const p = (...paras) => paras.map((t) => `<p>${t}</p>`).join("")
const h2 = (t) => `<h2>${t}</h2>`
const h3 = (t) => `<h3>${t}</h3>`

async function main() {
  const login = await api("POST", "/auth/user/emailpass", ADMIN)
  auth = `Bearer ${login.token}`

  await api("POST", "/admin/blog-seo/settings", { locales: [{ code: "id", name: "Bahasa Indonesia" }, { code: "en", name: "English" }], default_locale: "id", fallback: "hide" })

  const { category } = await api("POST", "/admin/blog-seo/categories", { translations: { id: { name: "Perawatan", description: "Cara merawat perabot kayu jati." }, en: { name: "Care", slug: "care", description: "Looking after teak homeware." } }, rank: 1 })
  const { category: stories } = await api("POST", "/admin/blog-seo/categories", { translations: { id: { name: "Cerita Bengkel" }, en: { name: "Workshop stories", slug: "workshop" } }, rank: 2 })
  const { author } = await api("POST", "/admin/blog-seo/authors", { name: "Haus Kayu", type: "organization", url: "https://hauskayu.com", same_as: ["https://instagram.com/hauskayu"], translations: { id: { job_title: "Pengrajin kayu jati, Jepara", bio: "Perabot dan perkakas dapur dari kayu jati, dibuat tangan di Jepara." }, en: { job_title: "Teak woodworkers, Jepara", bio: "Teak furniture and kitchenware, handmade in Jepara." } } })

  // 1. published, id + en, featured
  const c1 = await cover("Merawat talenan jati", "#7a4f2a")
  const post1 = (await api("POST", "/admin/blog-seo/posts", {
    cover: c1, category_id: category.id, author_id: author.id, featured: true,
    translations: {
      id: {
        title: "Cara merawat talenan kayu jati supaya awet bertahun-tahun",
        excerpt: "Cuci tangan, keringkan tegak, olesi minyak sebulan sekali. Tiga kebiasaan kecil yang bikin talenan jati tahan puluhan tahun.",
        cover_alt: "Talenan kayu jati di atas meja dapur",
        tags: ["talenan", "perawatan", "jati"],
        body: h2("Kenapa jati?") + p("Kayu jati punya minyak alami yang membuatnya tahan air dan jarang retak. Itu sebabnya talenan jati bisa dipakai puluhan tahun kalau dirawat dengan benar.")
          + h2("Tiga kebiasaan harian") + `<ul><li>Cuci dengan tangan, air hangat, sabun sedikit.</li><li>Jangan direndam dan jangan masuk mesin cuci piring.</li><li>Keringkan berdiri supaya kedua sisinya kering merata.</li></ul>`
          + h2("Minyak sebulan sekali") + p("Pakai minyak mineral food-grade atau minyak kelapa. Oleskan tipis, diamkan semalam, lap sisanya.")
          + h3("Boleh pakai minyak zaitun?") + p("Sebaiknya tidak. Minyak zaitun bisa tengik dan meninggalkan bau di permukaan kayu."),
      },
      en: {
        title: "How to care for a teak cutting board so it lasts for years",
        excerpt: "Hand wash, dry upright, oil once a month. Three small habits that keep a teak board going for decades.",
        cover_alt: "Teak cutting board on a kitchen counter",
        tags: ["cutting board", "care", "teak"],
        body: h2("Why teak?") + p("Teak has natural oils that make it water-resistant and slow to crack. That is why a teak board can serve for decades with the right care.")
          + h2("Three daily habits") + `<ul><li>Wash by hand with warm water and a little soap.</li><li>Never soak it, never put it in the dishwasher.</li><li>Dry it standing up so both faces dry evenly.</li></ul>`
          + h2("Oil once a month") + p("Use food-grade mineral oil or coconut oil. Apply a thin coat, leave it overnight, wipe off the rest.")
          + h3("Can I use olive oil?") + p("Better not. Olive oil can go rancid and leave a smell in the wood."),
      },
    },
  })).post
  await api("POST", `/admin/blog-seo/posts/${post1.id}/publish`, {})

  // 2. scheduled (day after tomorrow, 09:00 local), id + en
  const c2 = await cover("Dari gelondong ke tray", "#4e5b3a")
  const post2 = (await api("POST", "/admin/blog-seo/posts", {
    cover: c2, category_id: stories.id, author_id: author.id,
    translations: {
      id: {
        title: "Dari gelondong ke tray: satu minggu di bengkel Jepara",
        excerpt: "Ikuti perjalanan sebatang kayu jati bekas rumah tua sampai jadi tray sarapan yang halus.",
        cover_alt: "Tray kayu jati setengah jadi di meja kerja",
        tags: ["bengkel", "tray"],
        body: h2("Hari 1–2: memilih kayu") + p("Kami memakai jati bekas rumah lama. Kayunya sudah kering puluhan tahun, jadi tidak akan melengkung.") + h2("Hari 3–5: membentuk") + p("Dipotong, diserut, diamplas dari grit 80 sampai 320.") + h2("Hari 6–7: finishing") + p("Minyak food-grade, dua lapis, dijemur di tempat teduh."),
      },
      en: {
        title: "From log to tray: a week in our Jepara workshop",
        excerpt: "Follow a piece of reclaimed teak from an old house all the way to a smooth breakfast tray.",
        cover_alt: "Half-finished teak tray on a workbench",
        tags: ["workshop", "tray"],
        body: h2("Days 1–2: choosing the wood") + p("We use teak reclaimed from old houses. It has dried for decades, so it will not warp.") + h2("Days 3–5: shaping") + p("Cut, planed, sanded from 80 to 320 grit.") + h2("Days 6–7: finishing") + p("Food-grade oil, two coats, dried in the shade."),
      },
    },
  })).post
  const at = new Date()
  at.setDate(at.getDate() + 2)
  at.setHours(9, 0, 0, 0)
  await api("POST", `/admin/blog-seo/posts/${post2.id}/publish`, { at: at.toISOString() })

  // 3. draft, id only, no cover yet
  const post3 = (await api("POST", "/admin/blog-seo/posts", {
    category_id: category.id, author_id: author.id,
    translations: {
      id: {
        title: "Mangkuk kayu retak? Begini cara memperbaikinya",
        excerpt: "Retak halus di mangkuk jati biasanya bisa ditutup sendiri dengan lem kayu dan serbuk amplas.",
        tags: ["mangkuk", "perbaikan"],
        body: p("(Draf: masih ditulis.)"),
      },
    },
  })).post

  console.log(JSON.stringify({ published: post1.id, scheduled: post2.id, scheduled_at: at.toISOString(), draft: post3.id }, null, 2))
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
