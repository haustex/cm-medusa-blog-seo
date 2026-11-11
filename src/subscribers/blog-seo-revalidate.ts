import type { SubscriberArgs, SubscriberConfig } from "@medusajs/framework"
import { ContainerRegistrationKeys } from "@medusajs/framework/utils"
import { BlogSeoEvents, type GlobalEvent, type PostEvent } from "../lib/events"
import { getOptions } from "../lib/options"

/**
 * With `revalidate.url` set: public changes are batched (delay_ms) and sent as one POST
 *   { blog_seo: { posts: [{ id, slugs, previous_slugs, category_slugs, previous_category_slugs }], categories: [id…], all } }
 * with the secret in the `x-revalidate-secret` header (or `revalidate.header`). A storefront revalidates or purges
 * the pages it derives from that. Without the option the subscriber does nothing.
 */
type Batch = { posts: Map<string, PostEvent>; categories: Set<string>; all: boolean; timer: NodeJS.Timeout | null }
const batch: Batch = { posts: new Map(), categories: new Set(), all: false, timer: null }

async function flush(container: SubscriberArgs["container"]) {
  const logger = container.resolve(ContainerRegistrationKeys.LOGGER)
  const o = getOptions(container).revalidate
  const body = { blog_seo: { posts: [...batch.posts.values()].slice(0, 50), categories: [...batch.categories].slice(0, 50), all: batch.all } }
  batch.posts = new Map()
  batch.categories = new Set()
  batch.all = false
  batch.timer = null
  if (!o) return
  try {
    const res = await fetch(o.url, {
      method: "POST",
      headers: { "content-type": "application/json", ...(o.secret ? { [o.header]: o.secret } : {}) },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    })
    logger.info(`[blog-seo] revalidate ${res.status} posts=${body.blog_seo.posts.length} categories=${body.blog_seo.categories.length} all=${body.blog_seo.all}`)
  } catch (e) {
    logger.warn(`[blog-seo] revalidate failed: ${(e as Error).message}`)
  }
}

export default async function blogSeoRevalidate({ event, container }: SubscriberArgs<PostEvent | GlobalEvent>) {
  const o = getOptions(container).revalidate
  if (!o) return
  const data = event.data as Partial<PostEvent & GlobalEvent>
  if (event.name.startsWith("blog_seo.post.") && data.id && data.slugs) {
    const prev = batch.posts.get(data.id)
    batch.posts.set(data.id, {
      id: data.id,
      slugs: data.slugs,
      previous_slugs: { ...(prev?.previous_slugs ?? {}), ...(data.previous_slugs ?? {}) },
      category_slugs: data.category_slugs ?? {},
      previous_category_slugs: { ...(prev?.previous_category_slugs ?? {}), ...(data.previous_category_slugs ?? {}) },
    })
  } else if (event.name === BlogSeoEvents.CATEGORY_CHANGED && data.id) {
    batch.categories.add(data.id)
    batch.all = true
  } else batch.all = true
  if (!batch.timer) batch.timer = setTimeout(() => void flush(container), o.delay_ms)
}

export const config: SubscriberConfig = {
  event: Object.values(BlogSeoEvents),
  context: { subscriberId: "blog-seo-revalidate" },
}
