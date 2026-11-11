import { Module } from "@medusajs/framework/utils"
import BlogSeoModuleService from "./service"

/** Module key and table prefix are unique on purpose: a project may already have its own "blog" module. */
export const BLOG_SEO_MODULE = "blogSeo"

export default Module(BLOG_SEO_MODULE, {
  service: BlogSeoModuleService,
})

export type { default as BlogSeoModuleService } from "./service"
