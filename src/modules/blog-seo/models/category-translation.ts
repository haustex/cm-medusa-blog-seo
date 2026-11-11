import { model } from "@medusajs/framework/utils"
import Category from "./category"

const CategoryTranslation = model
  .define("bseo_category_translation", {
    id: model.id({ prefix: "bseocatr" }).primaryKey(),
    locale: model.text(),
    name: model.text().searchable(),
    /** Unique per locale: /blog/category/{slug} */
    slug: model.text(),
    description: model.text().nullable(),
    category: model.belongsTo(() => Category, { mappedBy: "translations" }),
  })
  .indexes([
    { on: ["category_id", "locale"], unique: true, where: "deleted_at IS NULL" },
    { on: ["locale", "slug"], unique: true, where: "deleted_at IS NULL" },
  ])

export default CategoryTranslation
