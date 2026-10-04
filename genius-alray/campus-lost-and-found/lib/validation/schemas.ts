import { z } from "zod"

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9_]{3,20}$/, "用户名需为 3-20 位小写字母、数字或下划线")

export const passwordSchema = z.string().min(6, "密码至少 6 位").max(72)

export const signUpSchema = z
  .object({
    username: usernameSchema,
    password: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: "两次输入的密码不一致",
    path: ["confirmPassword"],
  })

export const signInSchema = z.object({
  username: usernameSchema,
  password: z.string().min(1, "请输入密码"),
})

export const custodyKindSchema = z.enum(["kept", "in_place"])

/** 发布招领：拍照 → AI 名称/描述（可改）→ 电话或位置 */
export const publishItemSchema = z
  .object({
    paths: z
      .array(z.string().min(1))
      .min(1, "请至少上传一张照片")
      .max(5, "最多 5 张照片"),
    title: z.string().trim().min(1, "请填写物品名称").max(60, "名称最多 60 字"),
    description: z
      .string()
      .trim()
      .min(1, "请填写物品描述")
      .max(600, "描述最多 600 字"),
    custody: custodyKindSchema,
    contact: z.string().trim().max(100).optional().default(""),
    locationLabel: z.string().trim().max(200).optional().default(""),
    lat: z.number().min(-90).max(90).nullable().optional(),
    lng: z.number().min(-180).max(180).nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.custody === "kept") {
      if (v.contact.length < 5) {
        ctx.addIssue({
          code: "custom",
          path: ["contact"],
          message: "代为保管需要填写联系方式（至少 5 个字符）",
        })
      }
      return
    }
    const hasCoords = typeof v.lat === "number" && typeof v.lng === "number"
    if (!hasCoords && v.locationLabel.length < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["locationLabel"],
        message: "请允许定位或填写位置描述",
      })
    }
  })

/**
 * AI 给的照片建议（generateObject 用）。
 * 刻意用字符串枚举而不是 boolean：StepFun 的 json_schema 对枚举最稳，
 * 历史上 json_object / 自由键 / 嵌套结构都翻过车（见 docs/REQUIREMENTS.md §5.1）。
 */
export const photoAdviceSchema = z.object({
  verdict: z.enum(["ok", "retake"]),
  reason: z.string().min(1).max(30),
})

/** 「我的信息」：真实姓名 + 手机号（认领时也会用同一套规则校验） */
export const profileSchema = z.object({
  realName: z
    .string()
    .trim()
    .min(2, "请填写真实姓名（2-20 字）")
    .max(20, "姓名最多 20 字"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\- ]{6,20}$/, "请填写有效的手机号"),
})

/** 领取：必须留下真实姓名与手机号 */
export const pickupSchema = z.object({
  itemId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(2, "请填写真实姓名（2-20 字）")
    .max(20, "姓名最多 20 字"),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\- ]{6,20}$/, "请填写有效的手机号"),
})

/** 上传：只做形状校验，MIME 与体积在 /api/upload 里校验 */
export const uploadMetaSchema = z.object({
  batchId: z.string().uuid(),
})
