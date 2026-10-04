import { z } from "zod"

// Next.js 只会在构建时内联「字面量」形式的环境变量访问，
// 因此这里逐个写出 process.env.XXX，不能动态取值。
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().min(1, "缺少 NEXT_PUBLIC_SUPABASE_URL"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(1, "缺少 NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(1, "缺少 SUPABASE_SERVICE_ROLE_KEY"),
  NEXT_PUBLIC_AUTH_EMAIL_DOMAIN: z.string().min(1).default("campus.local"),
  // 整套 AI 能力共用一个视觉多模态模型，因此只需要一个模型配置
  AI_PROVIDER: z.enum(["mock", "ai-sdk"]).default("mock"),
  AI_BASE_URL: z.string().default(""),
  AI_API_KEY: z.string().default(""),
  AI_MODEL: z.string().default(""),
})

function readServerEnv() {
  return serverSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    NEXT_PUBLIC_AUTH_EMAIL_DOMAIN: process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN,
    AI_PROVIDER: process.env.AI_PROVIDER,
    AI_BASE_URL: process.env.AI_BASE_URL,
    AI_API_KEY: process.env.AI_API_KEY,
    AI_MODEL: process.env.AI_MODEL,
  })
}

let cached: z.infer<typeof serverSchema> | null = null

export function serverEnv() {
  if (!cached) cached = readServerEnv()
  return cached
}

// 客户端组件只能拿到公开变量（字面量引用以保证被内联）
export const publicEnv = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  authEmailDomain: process.env.NEXT_PUBLIC_AUTH_EMAIL_DOMAIN ?? "campus.local",
} as const

// 用户名 → 内部邮箱（不做邮箱验证）
export function usernameToEmail(username: string) {
  const normalized = username.trim().toLowerCase()
  return normalized + "@" + (publicEnv.authEmailDomain || "campus.local")
}
