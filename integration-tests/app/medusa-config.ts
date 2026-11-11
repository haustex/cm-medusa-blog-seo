import path from "node:path"
import { defineConfig } from "@medusajs/framework/utils"

// Test app for the E2E suite. Only started through scripts/guard.mjs, which on
// the Haus Kayu host allows nothing but the rw-spike-* containers and ports 9700+.
const pluginDir = process.env.BSEO_PLUGIN_DIR || path.resolve(__dirname, "../..")
const uploads = process.env.BSEO_UPLOAD_DIR || path.join(__dirname, "static")
const port = process.env.PORT || "9700"

module.exports = defineConfig({
  projectConfig: {
    databaseUrl: process.env.DATABASE_URL,
    workerMode: "shared",
    http: {
      storeCors: "*",
      adminCors: "*",
      authCors: "*",
      jwtSecret: "bseo-e2e-jwt",
      cookieSecret: "bseo-e2e-cookie",
    },
  },
  admin: { disable: process.env.BSEO_ADMIN !== "1", backendUrl: "/" },
  plugins: [
    {
      resolve: pluginDir,
      options: {
        // BSEO_LOCK=1: locales come from the options (locked in the Admin)
        ...(process.env.BSEO_LOCK === "1" ? { locales: [{ code: "id" }, { code: "en" }], default_locale: "id", fallback: "hide" } : {}),
        storefront_url: "https://storefront.e2e.test",
        routing: { locales: { en: { prefix: "/us" } } },
        content: { image_origins: ["https://cdn.e2e.test/media"], site_hosts: ["storefront.e2e.test"] },
        uploads: { process_images: process.env.BSEO_NO_SHARP !== "1" },
        revalidate: process.env.BSEO_REVALIDATE_URL ? { url: process.env.BSEO_REVALIDATE_URL, secret: "e2e-revalidate", delay_ms: 300 } : undefined,
        showCredit: true,
      },
    },
  ],
  modules: [
    {
      resolve: "@medusajs/medusa/file",
      options: { providers: [{ resolve: "@medusajs/medusa/file-local", id: "local", options: { upload_dir: uploads, backend_url: `http://127.0.0.1:${port}/static` } }] },
    },
  ],
})
