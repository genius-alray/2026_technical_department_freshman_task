"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { revealContact, withdrawItem } from "@/lib/db/found-items"
import { DbError } from "@/lib/db/types"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import type { RevealedContact } from "@/lib/types"

export type WithdrawItemResult = { ok: boolean; message: string }

export type RevealContactResult =
  { ok: true; data: RevealedContact } | { ok: false; message: string }

const itemIdSchema = z.object({ itemId: z.string().uuid("物品不存在") })

/** 拾主撤单：只在物品还没被认领时可用（数据库侧强制）。内部重做鉴权与校验。 */
export async function withdrawItemAction(
  itemId: string
): Promise<WithdrawItemResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, message: "登录状态已失效，请重新登录" }

  const parsed = itemIdSchema.safeParse({ itemId })
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    }
  }

  try {
    const supabase = await createClient()
    await withdrawItem(supabase, parsed.data.itemId)
    revalidatePath("/me")
    revalidatePath("/me/items/" + parsed.data.itemId + "/pickups")
    revalidatePath("/")
    return { ok: true, message: "已撤单" }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof DbError ? error.message : "操作失败，请重试",
    }
  }
}

/** 揭晓拾主提供的联系方式 / 位置：仅拾主本人或已认领的人能拿到 */
export async function revealContactAction(
  itemId: string
): Promise<RevealContactResult> {
  const user = await getCurrentUser()
  if (!user) return { ok: false, message: "登录状态已失效，请重新登录" }

  const parsed = itemIdSchema.safeParse({ itemId })
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? "参数不合法",
    }
  }

  try {
    const supabase = await createClient()
    const data = await revealContact(supabase, parsed.data.itemId)
    if (!data) return { ok: false, message: "暂时拿不到联系方式" }
    return { ok: true, data }
  } catch (error) {
    return {
      ok: false,
      message: error instanceof DbError ? error.message : "暂时拿不到联系方式",
    }
  }
}

/** 退出登录 */
export async function signOutAction(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath("/", "layout")
  redirect("/login")
}
