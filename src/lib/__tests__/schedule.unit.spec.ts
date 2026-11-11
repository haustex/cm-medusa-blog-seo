import { BlogRuleError, isDue, isPublic, planPublish } from "../schedule"

const now = new Date("2026-11-06T03:00:00.000Z")
const post = (over: Partial<{ status: "draft" | "scheduled" | "published"; published_at: string | null }> = {}) => ({ id: "p", status: "draft" as const, published_at: null, ...over })

describe("planPublish", () => {
  it("without a date: published now", () => {
    expect(planPublish(post(), true, null, now)).toEqual({ status: "published", published_at: now })
  })
  it("a future date: scheduled for that time", () => {
    expect(planPublish(post(), true, "2026-11-07T02:00:00.000Z", now)).toEqual({ status: "scheduled", published_at: new Date("2026-11-07T02:00:00.000Z") })
  })
  it("a past date: published with that date (backdating)", () => {
    const at = new Date("2026-10-01T02:00:00.000Z")
    expect(planPublish(post(), true, at, now)).toEqual({ status: "published", published_at: at })
  })
  it("republishing keeps the first public date; a leftover future date does not delay it", () => {
    const first = new Date("2026-10-20T02:00:00.000Z")
    expect(planPublish(post({ published_at: first.toISOString() }), true, null, now).published_at).toEqual(first)
    expect(planPublish(post({ status: "scheduled", published_at: "2026-12-01T00:00:00.000Z" }), true, null, now)).toEqual({ status: "published", published_at: now })
  })
  it("refuses an incomplete post and a date that is not a date", () => {
    expect(() => planPublish(post(), false, null, now)).toThrow(BlogRuleError)
    expect(() => planPublish(post(), false, null, now)).toThrow("incomplete")
    expect(() => planPublish(post(), true, "tomorrow morning", now)).toThrow("invalid_date")
  })
})

describe("isPublic / isDue", () => {
  it("public: published and dated in the past", () => {
    expect(isPublic({ status: "published", published_at: "2026-11-06T02:00:00.000Z" }, now)).toBe(true)
    expect(isPublic({ status: "published", published_at: "2026-11-06T04:00:00.000Z" }, now)).toBe(false)
    expect(isPublic({ status: "scheduled", published_at: "2026-11-06T02:00:00.000Z" }, now)).toBe(false)
    expect(isPublic({ status: "published", published_at: null }, now)).toBe(false)
  })
  it("due: scheduled and the time has come (inclusive)", () => {
    expect(isDue({ status: "scheduled", published_at: now }, now)).toBe(true)
    expect(isDue({ status: "scheduled", published_at: "2026-11-06T03:00:01.000Z" }, now)).toBe(false)
    expect(isDue({ status: "scheduled", published_at: null }, now)).toBe(false)
    expect(isDue({ status: "draft", published_at: "2026-11-01T00:00:00.000Z" }, now)).toBe(false)
  })
})
