import { model } from "@medusajs/framework/utils"

/**
 * One row: the languages of the blog. Edited in the Admin unless the same values are given as plugin options
 * (then they are locked and this row only mirrors them). lib/settings.ts resolves the effective settings.
 *
 * locales: [{ code: "id", name: "Bahasa Indonesia", dir: "ltr", enabled: true, rank: 0 }, …] (BCP 47 codes)
 * fallback: what a locale without its own translation shows — "default" (the default locale's text),
 *           "hide" (the post does not exist in that locale) or "label" (default text + a "not translated" flag)
 */
const Settings = model.define("bseo_settings", {
  id: model.id({ prefix: "bseoset" }).primaryKey(),
  locales: model.json(),
  default_locale: model.text(),
  fallback: model.enum(["default", "hide", "label"]).default("default"),
  routing: model.json().nullable(),
  metadata: model.json().nullable(),
})

export default Settings
