"use server"

import { redirect } from "next/navigation"
import { z } from "zod"

import { usernameToEmail } from "@/lib/env"
import { createClient, getCurrentUser } from "@/lib/supabase/server"
import { signInSchema, signUpSchema } from "@/lib/validation/schemas"

import { safeNextPath } from "./next-path"

export type AuthState = {
  formError?: string
  fieldErrors?: Record<string, string[] | undefined>
}

const ERROR_MESSAGES: Array<[RegExp, string]> = [
  [/already registered|already exists|user already/i, "该用户名已被注册"],
  [/invalid login credentials/i, "用户名或密码不正确"],
  [/password should be at least|password is too short/i, "密码至少 6 位"],
  [/duplicate key|profiles_username/i, "该用户名已被注册"],
]

function translateAuthError(message: string): string {
  for (const [pattern, text] of ERROR_MESSAGES) {
    if (pattern.test(message)) return text
  }
  return message
}

/**
 * 注册：用户名 → 内部邮箱；username 通过 options.data 交给
 * handle_new_user 触发器建立 profile。不做邮箱验证。
 */
export async function signUp(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = signUpSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const nextPath = safeNextPath(formData.get("next"))
  const supabase = await createClient()

  let formError: string | undefined
  try {
    const { data, error } = await supabase.auth.signUp({
      email: usernameToEmail(parsed.data.username),
      password: parsed.data.password,
      options: { data: { username: parsed.data.username } },
    })
    if (error) {
      formError = translateAuthError(error.message)
    } else if (!data.session) {
      formError = "注册成功但未能自动登录，请直接登录"
    }
  } catch (error) {
    formError = error instanceof Error ? error.message : "注册失败，请重试"
  }

  if (formError) return { formError }
  redirect(nextPath)
}

/** 登录：成功后回到 next（站内）或首页 */
export async function signIn(
  _prevState: AuthState,
  formData: FormData
): Promise<AuthState> {
  const parsed = signInSchema.safeParse({
    username: formData.get("username"),
    password: formData.get("password"),
  })
  if (!parsed.success) {
    return { fieldErrors: z.flattenError(parsed.error).fieldErrors }
  }

  const nextPath = safeNextPath(formData.get("next"))
  const supabase = await createClient()

  let formError: string | undefined
  try {
    const { error } = await supabase.auth.signInWithPassword({
      email: usernameToEmail(parsed.data.username),
      password: parsed.data.password,
    })
    if (error) formError = translateAuthError(error.message)
  } catch (error) {
    formError = error instanceof Error ? error.message : "登录失败，请重试"
  }

  if (formError) return { formError }
  redirect(nextPath)
}

/** 登出：清除会话后回到登录页 */
export async function signOut(): Promise<void> {
  const user = await getCurrentUser()
  if (!user) redirect("/login")

  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/login")
}
