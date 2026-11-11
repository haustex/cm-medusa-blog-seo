import type { MedusaContainer } from "@medusajs/framework/types"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { publishDue } from "../lib/posts"

/**
 * Every 5 minutes (BLOG_SEO_PUBLISH_CRON to change it): scheduled posts whose time has come go public and
 * `blog_seo.post.published` is emitted. A post that is no longer complete stays scheduled and is logged.
 */
export default async function blogSeoPublishScheduled(container: MedusaContainer) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  try {
    const { published, incomplete } = await publishDue(container)
    if (published.length) logger.info(`[blog-seo] published on schedule: ${published.join(", ")}`)
    if (incomplete.length) logger.warn(`[blog-seo] scheduled but incomplete, not published: ${incomplete.join(", ")}`)
  } catch (e) {
    logger.error(`[blog-seo] publish job failed: ${(e as Error).message}`)
  }
}

export const config = {
  name: "blog-seo-publish-scheduled",
  schedule: process.env.BLOG_SEO_PUBLISH_CRON || "*/5 * * * *",
}
