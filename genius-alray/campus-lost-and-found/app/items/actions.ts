"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"

import {
  getAppConfig,
  listImagesForItems,
  listWallItems,
  mergeImages,
  revealContact,
} from "@/lib/db/found-items"
import { createPickup } from "@/lib/db/pickups"
import { DbError } from "@/lib/db/types"
import { createSignedUrlMap } from "@/lib/storage/signed"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import { pickupSchema } from "@/lib/validation/schemas"
import type { RevealedContact } from "@/lib/types"

import type { LoadMoreResult, PickupResult } from "./types"

function messageOf(error: unknown): string {
  if (error instanceof DbError) return error.message
  if (error instanceof Error && error.message) return error.message
  return "操作失败，请稍后重试"
}

const offsetSchema = z.number().int().min(0).max(100000)

/**
 * 失物墙「加载更多」。
 * 只读动作，但仍是不可信入口：先鉴权，再用 zod 校验 offset；
 * 每页条数一律取自 app_config，绝不接受客户端传入。
 */
export async function loadMoreItemsAction(
  offset: number
): Promise<LoadMoreResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "请先登录" }

  const parsed = offsetSchema.safeParse(offset)
  if (!parsed.success) return { ok: false, error: "参数不合法" }

  const supabase = await createClient()
  try {
    const config = await getAppConfig(supabase)
    const limit = Math.max(config?.page_size ?? 20, 1)

    const items = await listWallItems(supabase, {
      limit,
      offset: parsed.data,
    })
    const images = await listImagesForItems(
      supabase,
      items.map((item) => item.id)
    )
    const urlByPath = await createSignedUrlMap(
      images.map((image) => image.storage_path)
    )

    return {
      ok: true,
      items: mergeImages(items, images, urlByPath),
      hasMore: items.length >= limit,
    }
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
}

/**
 * 认领：提交真实姓名 + 手机号。
 * 写入只能走 create_pickup RPC；认领即归属（物品置为 claimed），成功后立刻揭晓拾主的联系方式或位置。
 */
export async function createPickupAction(input: {
  itemId: string
  name: string
  phone: string
}): Promise<PickupResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, error: "请先登录" }

  const parsed = pickupSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "请检查填写内容",
    }
  }

  const supabase = await createClient()
  try {
    await createPickup(supabase, parsed.data)

    let revealed: RevealedContact | null = null
    try {
      revealed = await revealContact(supabase, parsed.data.itemId)
    } catch {
      revealed = null
    }

    revalidatePath("/items/[id]", "page")
    return { ok: true, revealed }
  } catch (error) {
    return { ok: false, error: messageOf(error) }
  }
}
