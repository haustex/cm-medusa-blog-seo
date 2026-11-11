import { model } from "@medusajs/framework/utils"
import Author from "./author"

const AuthorTranslation = model
  .define("bseo_author_translation", {
    id: model.id({ prefix: "bseoautr" }).primaryKey(),
    locale: model.text(),
    /** e.g. "Founder" / "Pendiri" */
    job_title: model.text().nullable(),
    /** Plain text, a few sentences */
    bio: model.text().nullable(),
    author: model.belongsTo(() => Author, { mappedBy: "translations" }),
  })
  .indexes([{ on: ["author_id", "locale"], unique: true, where: "deleted_at IS NULL" }])

export default AuthorTranslation
