import type { AuthenticatedMedusaRequest, MedusaResponse } from "@medusajs/framework/http"
import { withRules } from "../../../_lib"
import { BlogRuleError } from "../../../../lib/schedule"
import { parseDataUrl, storeImage, type UploadResult } from "../../../../lib/uploads"

type UploadedFile = { buffer: Buffer; mimetype: string; originalname: string }

/**
 * POST /admin/blog-seo/uploads
 *   multipart/form-data, field "files" (one or more), or
 *   JSON { filename, data: "data:image/…;base64,…", kind? }
 * Answers { files: [{ url, width, height, size, mime_type, processed }] } (and `file` for the first one).
 */
export async function POST(req: AuthenticatedMedusaRequest, res: MedusaResponse) {
  await withRules(res, async () => {
    const files = ((req as AuthenticatedMedusaRequest & { files?: UploadedFile[] }).files ?? []) as UploadedFile[]
    const body = (req.body ?? {}) as { filename?: unknown; data?: unknown; kind?: unknown }
    const prefix = typeof body.kind === "string" && /^[a-z]{1,12}$/.test(body.kind) ? `blog-${body.kind}` : "blog"
    const inputs: { buffer: Buffer; mimeType: string; filename: unknown }[] = files.map((f) => ({ buffer: f.buffer, mimeType: f.mimetype, filename: f.originalname }))
    if (!inputs.length) {
      const parsed = parseDataUrl(body.data)
      if (!parsed) throw new BlogRuleError("invalid", "send one or more images (multipart field `files`) or { filename, data: data-URL }")
      inputs.push({ ...parsed, filename: body.filename })
    }
    const out: UploadResult[] = []
    for (const input of inputs) out.push(await storeImage(req.scope, { ...input, prefix }))
    res.status(201).json({ files: out, file: out[0] })
  })
}
