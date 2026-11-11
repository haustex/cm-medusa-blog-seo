import { model } from "@medusajs/framework/utils"
import CategoryTranslation from "./category-translation"
import Post from "./post"

/** A category; name, slug and description live in the translations (one per locale). */
const Category = model
  .define("bseo_category", {
    id: model.id({ prefix: "bseocat" }).primaryKey(),
    /** Order in category lists, low first */
    rank: model.number().default(0),
    metadata: model.json().nullable(),
    translations: model.hasMany(() => CategoryTranslation, { mappedBy: "category" }),
    posts: model.hasMany(() => Post, { mappedBy: "category" }),
  })
  .cascades({ delete: ["translations"] })

export default Category
