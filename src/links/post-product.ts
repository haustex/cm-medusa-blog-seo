import { defineLink } from "@medusajs/framework/utils"
import ProductModule from "@medusajs/medusa/product"
import BlogSeoModule from "../modules/blog-seo"

/**
 * Related products of an article ("shop this post"). Many to many; the display order is kept on the post
 * (product_ids). Deleting a product removes its links; lib/posts.ts keeps product_ids in step.
 */
export default defineLink({ linkable: BlogSeoModule.linkable.bseoPost, isList: true }, { linkable: ProductModule.linkable.product, isList: true })
