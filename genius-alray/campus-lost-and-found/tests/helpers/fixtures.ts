import { publishItem as dbPublishItem } from "@/lib/db/found-items"
import type { TestContext, TestUser } from "./supabase"
import { IMAGE_BUCKET, PNG_BYTES } from "./supabase"

// ============================================================
// 简化版模型的测试夹具
//   found_items / found_item_images / pickups 对客户端只有 SELECT，
//   写入一律走 SECURITY DEFINER RPC，因此夹具也走真实 RPC（不是 admin 直插），
//   这样测到的就是产品代码实际会走的路径。
// ============================================================

export const DEFAULT_CONTACT = "13800138000"
export const DEFAULT_TITLE = "测试物品"
export const DEFAULT_DESCRIPTION =
  "这是一段测试用的物品描述，长度满足 1-600 字要求。"

/** 私有桶路径固定为 {uid}/{uuid}.ext —— RPC 会校验前缀必须是调用者 uid */
export function imagePathFor(ownerId: string): string {
  return ownerId + "/" + crypto.randomUUID() + ".jpg"
}

export function fakePaths(ownerId: string, count: number): string[] {
  return Array.from({ length: count }, () => imagePathFor(ownerId))
}

export type PublishOptions = {
  title?: string
  description?: string
  custody?: "kept" | "in_place"
  contact?: string
  lat?: number | null
  lng?: number | null
  locationLabel?: string
  /** 直接指定照片路径（用于非法路径/超限等用例） */
  photoPaths?: string[]
  /** 未指定 photoPaths 时生成几张（默认 1） */
  photoCount?: number
}

export type PublishedItem = {
  id: string
  title: string
  description: string
  photoPaths: string[]
}

type RpcResult<T> = {
  data: T | null
  error: { code?: string; message: string } | null
}

/** 走 publish_found_item RPC 发布一个物品 */
export async function publishItem(
  owner: TestUser,
  options: PublishOptions = {}
): Promise<PublishedItem> {
  const custody = options.custody ?? "kept"
  const title = options.title ?? DEFAULT_TITLE
  const description = options.description ?? DEFAULT_DESCRIPTION
  const photoPaths =
    options.photoPaths ?? fakePaths(owner.id, options.photoCount ?? 1)

  // 走产品自己的封装（lib/db/found-items.ts）而不是手写 RPC 参数：
  // 这样 PostgREST 的函数匹配语义（参数是否有 DEFAULT）一旦漂移，测试会直接失败。
  // 曾经因为可选参数没有 DEFAULT，lib/db 传 undefined 导致 8 键不齐 → PGRST202。
  const id = await dbPublishItem(owner.client, {
    title,
    description,
    custody,
    contact: custody === "kept" ? (options.contact ?? DEFAULT_CONTACT) : "",
    lat: options.lat ?? null,
    lng: options.lng ?? null,
    locationLabel: options.locationLabel ?? "",
    paths: photoPaths,
  })

  return { id, title, description, photoPaths }
}

/** 直接调用 publish RPC 并返回原始结果（用于断言错误码） */
export function publishItemRaw(
  owner: TestUser,
  input: {
    title: string
    description: string
    custody: "kept" | "in_place"
    contact?: string
    lat?: number
    lng?: number
    locationLabel?: string
    paths: string[]
  }
): PromiseLike<RpcResult<string>> {
  // 同上：8 个参数必须齐全，缺失用 null
  return owner.client.rpc("publish_found_item", {
    p_title: input.title,
    p_description: input.description,
    p_custody: input.custody,
    p_contact: input.contact === undefined ? null : input.contact,
    p_location_lat: input.lat === undefined ? null : input.lat,
    p_location_lng: input.lng === undefined ? null : input.lng,
    p_location_label:
      input.locationLabel === undefined ? null : input.locationLabel,
    p_paths: input.paths,
  } as never) as unknown as PromiseLike<RpcResult<string>>
}

/** 真的往私有桶写一个对象（service_role），用于签名 URL / 直读权限用例 */
export async function uploadObject(
  ctx: TestContext,
  path: string,
  bytes: Buffer = PNG_BYTES,
  contentType = "image/png"
): Promise<void> {
  const upload = await ctx.admin.storage
    .from(IMAGE_BUCKET)
    .upload(path, bytes, { contentType, upsert: true })
  if (upload.error) {
    throw new Error("上传测试对象失败：" + upload.error.message)
  }
  ctx.trackStoragePath(path)
}

// ---------- 读取（service_role oracle，用于断言“页面上不该出现什么”） ----------

export type ItemSecret = {
  id: string
  owner_id: string
  status: string
  custody: string
  contact: string | null
  location_lat: number | null
  location_lng: number | null
  location_label: string | null
}

export async function readSecret(
  ctx: TestContext,
  itemId: string
): Promise<ItemSecret> {
  const result = await ctx.admin
    .from("found_items")
    .select(
      "id, owner_id, status, custody, contact, location_lat, location_lng, location_label"
    )
    .eq("id", itemId)
    .single()
  if (result.error || !result.data) {
    throw new Error(
      "读取物品机密列失败：" + (result.error?.message ?? "unknown")
    )
  }
  return result.data as unknown as ItemSecret
}

export async function itemStatus(
  ctx: TestContext,
  itemId: string
): Promise<string> {
  const result = await ctx.admin
    .from("found_items")
    .select("status")
    .eq("id", itemId)
    .single()
  if (result.error || !result.data) {
    throw new Error("读取物品状态失败：" + (result.error?.message ?? "unknown"))
  }
  return result.data.status
}

export async function pickupCount(
  ctx: TestContext,
  itemId: string
): Promise<number> {
  const result = await ctx.admin
    .from("pickups")
    .select("id", { count: "exact", head: true })
    .eq("found_item_id", itemId)
  if (result.error) {
    throw new Error("统计领取记录失败：" + result.error.message)
  }
  return result.count ?? 0
}

export async function imageCount(
  ctx: TestContext,
  itemId: string
): Promise<number> {
  const result = await ctx.admin
    .from("found_item_images")
    .select("id", { count: "exact", head: true })
    .eq("found_item_id", itemId)
  if (result.error) {
    throw new Error("统计图片失败：" + result.error.message)
  }
  return result.count ?? 0
}

// ---------- 领取 ----------

export type PickupRow = { id: string }

export async function createPickup(
  picker: TestUser,
  itemId: string,
  name = picker.realName,
  phone = picker.phone
): Promise<string> {
  const result = (await picker.client.rpc("create_pickup", {
    p_item_id: itemId,
    p_name: name,
    p_phone: phone,
  })) as unknown as RpcResult<string>
  if (result.error || !result.data) {
    throw new Error(
      "创建领取记录失败：" +
        result.error?.code +
        " " +
        (result.error?.message ?? "unknown")
    )
  }
  return result.data
}

/** 直接调用 create_pickup 返回原始结果（用于断言错误码/幂等） */
export function createPickupRaw(
  picker: TestUser,
  itemId: string,
  name: string,
  phone: string
): PromiseLike<RpcResult<string>> {
  return picker.client.rpc("create_pickup", {
    p_item_id: itemId,
    p_name: name,
    p_phone: phone,
  }) as unknown as PromiseLike<RpcResult<string>>
}

export function revealRaw(
  viewer: TestUser,
  itemId: string
): PromiseLike<
  RpcResult<
    Array<{
      out_custody: string
      out_contact: string | null
      out_location_lat: number | null
      out_location_lng: number | null
      out_location_label: string | null
    }>
  >
> {
  return viewer.client.rpc("reveal_found_item_contact", {
    p_item_id: itemId,
  }) as unknown as PromiseLike<
    RpcResult<
      Array<{
        out_custody: string
        out_contact: string | null
        out_location_lat: number | null
        out_location_lng: number | null
        out_location_label: string | null
      }>
    >
  >
}

/** 拾主撤单（第 4 轮：只有 status = published 时才能成功） */
export async function withdrawItem(
  owner: TestUser,
  itemId: string
): Promise<void> {
  const result = (await owner.client.rpc("withdraw_found_item", {
    p_item_id: itemId,
  })) as unknown as RpcResult<string>
  if (result.error) {
    throw new Error("撤单失败：" + result.error.message)
  }
}

/** 直接调用 withdraw_found_item，返回原始结果（用于断言错误码/中文提示） */
export function withdrawItemRaw(
  owner: TestUser,
  itemId: string
): PromiseLike<RpcResult<string>> {
  return owner.client.rpc("withdraw_found_item", {
    p_item_id: itemId,
  }) as unknown as PromiseLike<RpcResult<string>>
}
