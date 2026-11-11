/**
 * Publishing and scheduling. Times are instants (UTC in the database); the Admin shows and enters them in the
 * browser's time zone.
 *
 *   publish now        → status published, published_at = now (an earlier public date is kept, so correcting and
 *                        republishing an article does not move it to the top again)
 *   publish at T > now → status scheduled, published_at = T; the job publishes it once T has passed
 *   unpublish          → draft; published_at stays as the date it had
 */
export type PostStatus = "draft" | "scheduled" | "published"
export type PostState = { id: string; status: PostStatus; published_at?: Date | string | null }
export type Transition = { status: "scheduled" | "published"; published_at: Date }

/** Thrown for input the rules refuse; the API answers 400 (404 for not_found) with a message. */
export class BlogRuleError extends Error {
  constructor(
    public code: "not_found" | "incomplete" | "slug_taken" | "invalid_slug" | "invalid_date" | "category_not_found" | "author_not_found" | "locale_unknown" | "invalid" | "locked",
    public detail?: string
  ) {
    super(detail ? `${code}: ${detail}` : code)
  }
}

const toDate = (v: Date | string | null | undefined) => (v ? new Date(v) : null)

export function planPublish(post: PostState, publishable: boolean, at: Date | string | null | undefined, now: Date): Transition {
  if (!publishable) throw new BlogRuleError("incomplete")
  const when = toDate(at)
  if (when && Number.isNaN(when.getTime())) throw new BlogRuleError("invalid_date")
  if (when && when.getTime() > now.getTime()) return { status: "scheduled", published_at: when }
  // now (or a past date given on purpose: backdating)
  if (when) return { status: "published", published_at: when }
  const previous = toDate(post.published_at)
  return { status: "published", published_at: previous && previous.getTime() <= now.getTime() ? previous : now }
}

/** Visible on the storefront: published and not dated in the future */
export const isPublic = (post: Pick<PostState, "status" | "published_at">, now: Date) =>
  post.status === "published" && !!post.published_at && new Date(post.published_at).getTime() <= now.getTime()

/** Scheduled posts whose time has come */
export const isDue = (post: Pick<PostState, "status" | "published_at">, now: Date) =>
  post.status === "scheduled" && !!post.published_at && new Date(post.published_at).getTime() <= now.getTime()
