"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { getAiProviders } from "@/lib/ai"
import { publishItem } from "@/lib/db/found-items"
import { createSignedUrlMap } from "@/lib/storage/signed"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import type { PhotoAdvice, VisionResult } from "@/lib/types"
import { publishItemSchema } from "@/lib/validation/schemas"

// ============================================================
// 发布招领的 Server Actions（单页流程，无草稿）
// 每个 action 都是不可信入口：先 getCurrentUser() 鉴权，再 zod 校验。
// ============================================================

export type AnalyzeResult =
  { ok: true; result: VisionResult } | { ok: false; error: string }

export type ReviewResult =
  { ok: true; advice: PhotoAdvice } | { ok: false; error: string }

export type PublishResult =
  | { ok: true; itemId: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> }

export type PublishInput = z.infer<typeof publishItemSchema>

/** 识别用：允许一批最多 20 个 path，真正的张数上限由发布 RPC 按 app_config 把关 */
const analyzePathsSchema = z
  .array(z.string().min(1).max(300))
  .min(1, "请至少上传一张照片")
  .max(20, "照片数量过多")

/** 路径必须是「自己 uid 前缀」下的对象：防止拿他人路径去签名 / 发布 */
function ownsPaths(userId: string, paths: string[]): boolean {
  return paths.every(
    (path) =>
      path.startsWith(userId + "/") &&
      !path.includes("..") &&
      !path.includes("//")
  )
}

function toMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message
  return "操作失败，请重试"
}

/** 识别与建议共用的入场逻辑：鉴权 → zod 校验 → 只能操作自己 uid 前缀下的 path */
async function authorizePaths(
  paths: string[]
): Promise<{ ok: true; paths: string[] } | { ok: false; error: string }> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "登录已过期，请重新登录" }

  const parsed = analyzePathsSchema.safeParse(paths)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "照片参数不合法",
    }
  }
  if (!ownsPaths(user.id, parsed.data)) {
    return { ok: false, error: "照片路径不合法，请重新上传" }
  }
  return { ok: true, paths: parsed.data }
}

/** 私有桶签名：按 path 顺序返回可用 URL，签不出来的 path 直接丢掉 */
async function signedImageUrls(paths: string[]): Promise<string[]> {
  const urlMap = await createSignedUrlMap(paths)
  return paths
    .map((path) => urlMap[path])
    .filter((url): url is string => Boolean(url))
}

// ============================================================
// 1. 识别：签名 URL → 视觉模型 → 名称 + 描述
// ============================================================
export async function analyzeItemAction(
  paths: string[]
): Promise<AnalyzeResult> {
  const auth = await authorizePaths(paths)
  if (!auth.ok) return { ok: false, error: auth.error }

  try {
    const imageUrls = await signedImageUrls(auth.paths)
    if (imageUrls.length === 0) {
      return { ok: false, error: "照片读取失败，请重新上传后再试" }
    }

    const raw = await getAiProviders().vision.analyze({ imageUrls })
    const title =
      typeof raw?.title === "string" ? raw.title.trim().slice(0, 60) : ""
    const description =
      typeof raw?.description === "string"
        ? raw.description.trim().slice(0, 600)
        : ""

    if (!title && !description) {
      return { ok: false, error: "识别结果为空，请手动填写名称与描述" }
    }
    return { ok: true, result: { title, description } }
  } catch {
    // 识别失败不阻塞发布：用户可以手填名称与描述
    return { ok: false, error: "识别失败，请手动填写名称与描述后发布" }
  }
}

// ============================================================
// 1.5 建议：同一组照片，AI 判断能不能直接用（只是建议，不阻塞发布）
//     任何失败都返回 { ok: false }，UI 侧静默降级为「没有建议」。
// ============================================================
export async function reviewPhotosAction(
  paths: string[]
): Promise<ReviewResult> {
  const auth = await authorizePaths(paths)
  if (!auth.ok) return { ok: false, error: auth.error }

  try {
    const imageUrls = await signedImageUrls(auth.paths)
    if (imageUrls.length === 0) {
      return { ok: false, error: "照片读取失败，请重新上传后再试" }
    }

    const advice = await getAiProviders().vision.review({ imageUrls })
    return {
      ok: true,
      advice: {
        ok: advice.ok === true,
        reason: advice.reason.trim().slice(0, 30),
      },
    }
  } catch {
    return { ok: false, error: "AI 建议暂时不可用" }
  }
}

// ============================================================
// 2. 发布：zod 校验 → publish_found_item RPC（照片路径一并入库）
// ============================================================
export async function publishItemAction(
  input: PublishInput
): Promise<PublishResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "登录已过期，请重新登录" }

  const parsed = publishItemSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join(".") || "form"
      if (!fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "请检查填写内容",
      fieldErrors,
    }
  }

  const data = parsed.data
  if (!ownsPaths(user.id, data.paths)) {
    return { ok: false, error: "照片路径不合法，请重新上传" }
  }

  try {
    const supabase = await createClient()
    const itemId = await publishItem(supabase, {
      title: data.title,
      description: data.description,
      custody: data.custody,
      contact: data.contact,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      locationLabel: data.locationLabel,
      paths: data.paths,
    })

    revalidatePath("/")
    revalidatePath("/me")
    return { ok: true, itemId }
  } catch (error) {
    return { ok: false, error: toMessage(error) }
  }
}
