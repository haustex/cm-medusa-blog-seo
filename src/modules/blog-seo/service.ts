import { MedusaService } from "@medusajs/framework/utils"
import { Author, AuthorTranslation, Category, CategoryTranslation, Post, PostTranslation, Settings } from "./models"

/**
 * Keys match the DML model names (bseo_post → BseoPost), so Query (query.graph, product.bseo_posts) finds
 * `listBseoPosts` and friends on the service.
 */
class BlogSeoModuleService extends MedusaService({
  BseoSettings: Settings,
  BseoAuthor: Author,
  BseoAuthorTranslation: AuthorTranslation,
  BseoCategory: Category,
  BseoCategoryTranslation: CategoryTranslation,
  BseoPost: Post,
  BseoPostTranslation: PostTranslation,
}) {}

export default BlogSeoModuleService
