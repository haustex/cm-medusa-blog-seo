import { model } from "@medusajs/framework/utils"
import AuthorTranslation from "./author-translation"
import Post from "./post"

/** Who writes: a person or the organization itself (JSON-LD author / publisher). Bio per locale in translations. */
const Author = model
  .define("bseo_author", {
    id: model.id({ prefix: "bseoauth" }).primaryKey(),
    slug: model.text(),
    name: model.text().searchable(),
    type: model.enum(["person", "organization"]).default("person"),
    /** File Module URL */
    avatar: model.text().nullable(),
    /** Profile or home page */
    url: model.text().nullable(),
    /** Other profiles (schema.org sameAs): string[] */
    same_as: model.json().nullable(),
    metadata: model.json().nullable(),
    translations: model.hasMany(() => AuthorTranslation, { mappedBy: "author" }),
    posts: model.hasMany(() => Post, { mappedBy: "author" }),
  })
  .cascades({ delete: ["translations"] })
  .indexes([{ on: ["slug"], unique: true, where: "deleted_at IS NULL" }])

export default Author
