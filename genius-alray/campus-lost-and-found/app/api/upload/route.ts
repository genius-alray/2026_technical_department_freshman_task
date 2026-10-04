import {
  IMAGE_BUCKET,
  ImageValidationError,
  MAX_IMAGE_BYTES,
  assertValidImage,
  buildStoragePath,
} from "@/lib/storage/validate"
import { createAdminClient } from "@/lib/supabase/admin"
import { getCurrentUser } from "@/lib/supabase/server"
import { uploadMetaSchema } from "@/lib/validation/schemas"

// 唯一允许的 REST endpoint：Server Actions 默认请求体上限 1MB，
// 图片字节必须绕开它，因此单独提供 multipart 上传。
// 简化后没有草稿：这里只把对象写进私有桶（路径 {userId}/{batchId}/{uuid}.{ext}），
// 落库由发布 RPC publish_found_item 按 p_paths 完成。
export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type UploadErrorCode =
  | "unauthorized"
  | "invalid_body"
  | "missing_file"
  | "file_too_large"
  | "unsupported_type"
  | "storage_error"

function fail(status: number, code: UploadErrorCode, message: string) {
  return Response.json({ error: message, code }, { status })
}

export async function POST(request: Request) {
  // 1. 鉴权：不可信入口
  const user = await getCurrentUser()
  if (!user) return fail(401, "unauthorized", "请先登录")

  let form: FormData
  try {
    form = await request.formData()
  } catch {
    return fail(400, "invalid_body", "请求体必须是 multipart/form-data")
  }

  // 2. batchId 只做形状校验（uuid）；归属由路径前缀 {userId}/{batchId}/ 决定
  const parsed = uploadMetaSchema.safeParse({ batchId: form.get("batchId") })
  if (!parsed.success) {
    return fail(
      400,
      "invalid_body",
      parsed.error.issues[0]?.message ?? "batchId 不合法"
    )
  }
  const { batchId } = parsed.data

  const file = form.get("file")
  if (!(file instanceof File)) return fail(400, "missing_file", "缺少图片文件")

  // 3. 图片本体校验：类型 + 2MB（张数上限由客户端与发布 RPC 把关）
  try {
    assertValidImage(file)
  } catch (error) {
    if (error instanceof ImageValidationError) {
      const tooLarge = file.size > MAX_IMAGE_BYTES
      return fail(
        tooLarge ? 413 : 415,
        tooLarge ? "file_too_large" : "unsupported_type",
        error.message
      )
    }
    throw error
  }

  // 4. 上传到私有桶（service_role；客户端对桶没有任何策略）
  const admin = createAdminClient()
  const storagePath = buildStoragePath(user.id, batchId, file.type)
  const bytes = new Uint8Array(await file.arrayBuffer())

  const { error: uploadError } = await admin.storage
    .from(IMAGE_BUCKET)
    .upload(storagePath, bytes, { contentType: file.type, upsert: false })
  if (uploadError) return fail(500, "storage_error", "图片上传失败，请重试")

  return Response.json({ path: storagePath }, { status: 201 })
}
