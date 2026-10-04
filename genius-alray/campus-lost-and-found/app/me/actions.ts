"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { withdrawItem } from "@/lib/db/found-items"
import { updateMyProfile } from "@/lib/db/profiles"
import { DbError } from "@/lib/db/types"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import { profileSchema } from "@/lib/validation/schemas"

export type WithdrawItemResult = { ok: boolean; message: string }

export type ProfileState = {
  ok?: boolean
  formError?: string
  fieldErrors?: Record<string, string[] | undefined>
}

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

/** 保存「我的信息」（真实姓名 + 手机号）。成功由前端 toast 后回 /me。 */
export async function saveProfileAction(
  _prevState: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const parsed = profileSchema.safeParse({
    realName: formData.get("realName"),
    phone: formData.get("phone"),
  })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  try {
    const supabase = await createClient()
    await updateMyProfile(supabase, user.id, parsed.data)
    revalidatePath("/me")
    return { ok: true }
  } catch (error) {
    return {
      formError: error instanceof DbError ? error.message : "保存失败，请重试",
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
