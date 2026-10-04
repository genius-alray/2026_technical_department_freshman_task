import { describe, expect, it } from "vitest"
import {
  photoAdviceSchema,
  pickupSchema,
  profileSchema,
  publishItemSchema,
  signUpSchema,
  uploadMetaSchema,
  phoneSchema,
} from "@/lib/validation/schemas"

const ITEM_ID = "11111111-1111-4111-8111-111111111111"
const PATHS = ["u1/a.jpg"]

function publishInput(overrides: Record<string, unknown> = {}) {
  return {
    paths: PATHS,
    title: "黑色钱包",
    description: "皮质钱包，内有若干卡片。",
    custody: "kept",
    contact: "13800138000",
    locationLabel: "",
    lat: null,
    lng: null,
    ...overrides,
  }
}

function issuePaths(result: { success: boolean; error?: unknown }): string[] {
  if (result.success) return []
  const error = result.error as {
    issues: Array<{ path: Array<string | number> }>
  }
  return error.issues.map((issue) => issue.path.join("."))
}

describe("publishItemSchema：联系方式与位置分支", () => {
  it("代为保管：没有联系方式必须失败（path=contact）", () => {
    const result = publishItemSchema.safeParse(publishInput({ contact: "" }))
    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain("contact")
  })

  it("代为保管：联系方式 4 字失败、5 字通过", () => {
    expect(
      publishItemSchema.safeParse(publishInput({ contact: "1234" })).success
    ).toBe(false)
    expect(
      publishItemSchema.safeParse(publishInput({ contact: "12345" })).success
    ).toBe(true)
  })

  it("留在原地：无坐标且无位置描述必须失败（path=locationLabel）", () => {
    const result = publishItemSchema.safeParse(
      publishInput({
        custody: "in_place",
        lat: null,
        lng: null,
        locationLabel: "",
      })
    )
    expect(result.success).toBe(false)
    expect(issuePaths(result)).toContain("locationLabel")
  })

  it("留在原地：有位置描述或坐标即可通过", () => {
    expect(
      publishItemSchema.safeParse(
        publishInput({ custody: "in_place", locationLabel: "图书馆 3 楼" })
      ).success
    ).toBe(true)
    expect(
      publishItemSchema.safeParse(
        publishInput({ custody: "in_place", lat: 31.23, lng: 121.47 })
      ).success
    ).toBe(true)
  })

  it("照片数量 1-5：0 张与 6 张失败，1 张与 5 张通过", () => {
    expect(
      publishItemSchema.safeParse(publishInput({ paths: [] })).success
    ).toBe(false)
    expect(
      publishItemSchema.safeParse(
        publishInput({ paths: ["a", "b", "c", "d", "e", "f"] })
      ).success
    ).toBe(false)
    expect(
      publishItemSchema.safeParse(publishInput({ paths: ["a"] })).success
    ).toBe(true)
    expect(
      publishItemSchema.safeParse(
        publishInput({ paths: ["a", "b", "c", "d", "e"] })
      ).success
    ).toBe(true)
  })

  it("名称 1-60 字、描述 1-600 字", () => {
    expect(
      publishItemSchema.safeParse(publishInput({ title: "" })).success
    ).toBe(false)
    expect(
      publishItemSchema.safeParse(publishInput({ title: "x".repeat(61) }))
        .success
    ).toBe(false)
    expect(
      publishItemSchema.safeParse(publishInput({ title: "x".repeat(60) }))
        .success
    ).toBe(true)
    expect(
      publishItemSchema.safeParse(publishInput({ description: "" })).success
    ).toBe(false)
    expect(
      publishItemSchema.safeParse(
        publishInput({ description: "x".repeat(601) })
      ).success
    ).toBe(false)
    expect(
      publishItemSchema.safeParse(
        publishInput({ description: "x".repeat(600) })
      ).success
    ).toBe(true)
  })

  it("custody 非法值失败", () => {
    expect(
      publishItemSchema.safeParse(publishInput({ custody: "somewhere" }))
        .success
    ).toBe(false)
  })
})

describe("pickupSchema：实名领取", () => {
  it("姓名 1 字失败、21 字失败、2 字与 20 字通过", () => {
    const base = { itemId: ITEM_ID, phone: "13800138000" }
    expect(pickupSchema.safeParse({ ...base, name: "张" }).success).toBe(false)
    expect(
      pickupSchema.safeParse({ ...base, name: "张".repeat(21) }).success
    ).toBe(false)
    expect(pickupSchema.safeParse({ ...base, name: "张三" }).success).toBe(true)
    expect(
      pickupSchema.safeParse({ ...base, name: "张".repeat(20) }).success
    ).toBe(true)
  })

  it("手机号：含字母/过短/过长失败，含 +-空格 的合法号通过", () => {
    const base = { itemId: ITEM_ID, name: "张三" }
    for (const phone of [
      "1380013800a",
      "12345",
      "1".repeat(21),
      "电话13800138000",
    ]) {
      expect(pickupSchema.safeParse({ ...base, phone }).success, phone).toBe(
        false
      )
    }
    expect(
      pickupSchema.safeParse({ ...base, phone: "13800138000" }).success
    ).toBe(true)
    expect(
      pickupSchema.safeParse({ ...base, phone: "+86 138-0013-8000" }).success
    ).toBe(true)
  })

  it("itemId 必须是 uuid", () => {
    expect(
      pickupSchema.safeParse({
        itemId: "abc",
        name: "张三",
        phone: "13800138000",
      }).success
    ).toBe(false)
  })
})

describe("账号与上传元数据", () => {
  it("用户名小写化与字符集", () => {
    expect(phoneSchema.parse("Alice_01")).toBe("alice_01")
    expect(phoneSchema.safeParse("ab").success).toBe(false)
    expect(phoneSchema.safeParse("a-b").success).toBe(false)
  })

  it("两次密码不一致失败", () => {
    const result = signUpSchema.safeParse({
      username: "alice",
      password: "abcdef",
      confirmPassword: "abcdefg",
    })
    expect(result.success).toBe(false)
  })

  it("uploadMetaSchema 要求合法 uuid", () => {
    expect(uploadMetaSchema.safeParse({ batchId: ITEM_ID }).success).toBe(true)
    expect(uploadMetaSchema.safeParse({ batchId: "nope" }).success).toBe(false)
  })
})

describe("第 5 轮：profileSchema 与 photoAdviceSchema", () => {
  it("profileSchema：姓名 1 字/21 字失败，2 字与 20 字通过", () => {
    const base = { phone: "13800138000" }
    expect(profileSchema.safeParse({ ...base, realName: "张" }).success).toBe(
      false
    )
    expect(
      profileSchema.safeParse({ ...base, realName: "张".repeat(21) }).success
    ).toBe(false)
    expect(profileSchema.safeParse({ ...base, realName: "张三" }).success).toBe(
      true
    )
    expect(
      profileSchema.safeParse({ ...base, realName: "张".repeat(20) }).success
    ).toBe(true)
  })

  it("profileSchema：手机号含字母/过短/过长失败，合法与 +-空格 通过", () => {
    const base = { realName: "张三" }
    for (const phone of [
      "1380013800a",
      "12345",
      "1".repeat(21),
      "电话13800138000",
    ]) {
      expect(profileSchema.safeParse({ ...base, phone }).success, phone).toBe(
        false
      )
    }
    expect(
      profileSchema.safeParse({ ...base, phone: "13800138000" }).success
    ).toBe(true)
    expect(
      profileSchema.safeParse({ ...base, phone: "+86 138-0013-8000" }).success
    ).toBe(true)
  })

  it("profileSchema：姓名会 trim 后校验", () => {
    const result = profileSchema.safeParse({
      realName: "  张三  ",
      phone: "13800138000",
    })
    expect(result.success).toBe(true)
    if (result.success) expect(result.data.realName).toBe("张三")
  })

  it("photoAdviceSchema：verdict 只能是 ok/retake，reason 1-30 字", () => {
    expect(
      photoAdviceSchema.safeParse({ verdict: "ok", reason: "可以用" }).success
    ).toBe(true)
    expect(
      photoAdviceSchema.safeParse({ verdict: "retake", reason: "再拍一张" })
        .success
    ).toBe(true)
    expect(
      photoAdviceSchema.safeParse({ verdict: "maybe", reason: "x" }).success
    ).toBe(false)
    expect(
      photoAdviceSchema.safeParse({ verdict: "ok", reason: "" }).success
    ).toBe(false)
    expect(
      photoAdviceSchema.safeParse({ verdict: "ok", reason: "x".repeat(31) })
        .success
    ).toBe(false)
    // AI SDK 的 schema 不再用 boolean 字段（StepFun 对枚举更稳）
    expect(photoAdviceSchema.safeParse({ ok: true, reason: "x" }).success).toBe(
      false
    )
  })
})
