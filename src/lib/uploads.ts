import type { MedusaContainer } from "@medusajs/framework/types"
import { Modules } from "@medusajs/framework/utils"
import { getOptions } from "./options"
import { BlogRuleError } from "./schedule"
import { learnImageOrigin } from "./settings"

/**
 * Images for covers and article bodies go through the File Module. With sharp installed (optional peer) and
 * `uploads.process_images` on, the image is decoded (so it really is one), turned upright, limited to `max_side`,
 * stripped of EXIF/GPS and stored as JPEG; without sharp it is stored as sent, and the size comes from the
 * file's header when the format is known. The answer carries width/height so editors can write them into
 * the HTML (no layout shift).
 */
export type UploadResult = { url: string, width: number | null; height: number | null; size: number; mime_type: string; processed: boolean }

const MIME: Record<string, string> = { jpeg: "image/jpeg", jpg: "image/jpeg", png: "image/png", webp: "image/webp", avif: "image/avif", gif: "image/gif", heic: "image/heic", heif: "image/heif", svg: "image/svg+xml" }
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif", "image/heic", "image/heif"])

export function parseDataUrl(data: unknown): { buffer: Buffer; mimeType: string } | null {
  if (typeof data !== "string") return null
  const m = /^data:(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i.exec(data)
  if (!m) return null
  return { buffer: Buffer.from(m[2].replace(/\s/g, ""), "base64"), mimeType: m[1].toLowerCase() }
}

export function safeBaseName(filename: unknown, fallback = "image"): string {
  return (
    String(filename ?? "")
      .replace(/\.[A-Za-z0-9]+$/, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  )
}

let sharpModule: null | undefined | ((...args: any[]) => any) = undefined
export function loadSharp(): ((...args: any[]) => any) | null {
  if (sharpModule !== undefined) return sharpModule
  try {
    // optional peer dependency
    const mod = require("sharp")
    sharpModule = (mod?.default ?? mod) as (...args: any[]) => any
  } catch {
    sharpModule = null
  }
  return sharpModule
}

/** Width/height from the header of a JPEG, PNG, GIF or WebP (VP8/VP8L/VP8X); null when unknown */
export function imageSize(buf: Buffer): { width: number; height: number } | null {
  if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
  if (buf.length >= 10 && buf.toString("ascii", 0, 3) === "GIF") return { width: buf.readUInt16LE(6), height: buf.readUInt16LE(8) }
  if (buf.length >= 30 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
    const chunk = buf.toString("ascii", 12, 16)
    if (chunk === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff }
    if (chunk === "VP8L") {
      const b = buf.readUInt32LE(21)
      return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }
    }
    if (chunk === "VP8X") return { width: (buf.readUIntLE(24, 3) & 0xffffff) + 1, height: (buf.readUIntLE(27, 3) & 0xffffff) + 1 }
  }
  if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) return null
      const marker = buf[i + 1]
      if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xff) {
        i += marker === 0xff ? 1 : 2
        continue
      }
      const len = buf.readUInt16BE(i + 2)
      if ((marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc)) return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) }
      i += 2 + len
    }
  }
  return null
}

export async function storeImage(container: MedusaContainer, input: { buffer: Buffer; mimeType: string; filename?: unknown; prefix?: string }): Promise<UploadResult> {
  const { uploads } = getOptions(container)
  if (!input.buffer.length) throw new BlogRuleError("invalid", "empty file")
  if (input.buffer.length > uploads.max_bytes) throw new BlogRuleError("invalid", `image larger than ${Math.round(uploads.max_bytes / 1024 / 1024)} MB`)
  const base = `${input.prefix ?? "blog"}-${safeBaseName(input.filename)}`
  const sharp = uploads.process_images ? loadSharp() : null
  let out = input.buffer
  let mimeType = input.mimeType.toLowerCase()
  let width: number | null = null
  let height: number | null = null
  let processed = false
  if (sharp) {
    try {
      const result = await sharp(input.buffer, { limitInputPixels: 80_000_000, failOn: "error" })
        .rotate()
        .resize({ width: uploads.max_side, height: uploads.max_side, fit: "inside", withoutEnlargement: true })
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: uploads.jpeg_quality, mozjpeg: true, progressive: true })
        .toBuffer({ resolveWithObject: true })
      out = result.data
      width = result.info.width
      height = result.info.height
      mimeType = "image/jpeg"
      processed = true
    } catch {
      throw new BlogRuleError("invalid", "this file cannot be read as an image")
    }
  } else {
    if (!ALLOWED.has(mimeType)) throw new BlogRuleError("invalid", `unsupported image type ${mimeType}`)
    const size = imageSize(input.buffer)
    width = size?.width ?? null
    height = size?.height ?? null
  }
  const ext = Object.entries(MIME).find(([, m]) => m === mimeType)?.[0] ?? "bin"
  const file = await container.resolve(Modules.FILE).createFiles({ filename: `${base}.${ext === "jpg" ? "jpeg" : ext}`.replace(/\.jpeg$/, ".jpg"), mimeType, content: out.toString("base64"), access: "public" })
  await learnImageOrigin(container, file.url)
  return { url: file.url, width, height, size: out.length, mime_type: mimeType, processed }
}
