import { IMAGE_BUCKET } from "@/lib/storage/signed"

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
}

export class ImageValidationError extends Error {}

export function assertValidImage(file: { type: string; size: number }): void {
  if (
    !ALLOWED_MIME_TYPES.includes(
      file.type as (typeof ALLOWED_MIME_TYPES)[number]
    )
  ) {
    throw new ImageValidationError("只支持 jpeg / png / webp 图片")
  }
  if (file.size <= 0) {
    throw new ImageValidationError("图片内容为空")
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageValidationError("图片不能超过 2MB")
  }
}

export function extensionForMime(mime: string): string {
  return EXTENSION_BY_MIME[mime] ?? "jpg"
}

/** 存储路径固定为 {userId}/{itemId}/{uuid}.{ext}，不可枚举 */
export function buildStoragePath(
  userId: string,
  itemId: string,
  mime: string
): string {
  return (
    userId +
    "/" +
    itemId +
    "/" +
    crypto.randomUUID() +
    "." +
    extensionForMime(mime)
  )
}

export { IMAGE_BUCKET }
