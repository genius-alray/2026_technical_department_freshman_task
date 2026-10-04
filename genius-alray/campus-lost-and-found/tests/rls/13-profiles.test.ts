import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  createTestContext,
  type TestContext,
  type TestUser,
} from "../helpers/supabase"

/**
 * 第 5 轮新增：profiles 的「我的信息」（real_name / phone）
 * - 可读列：id, username, real_name, phone, created_at, updated_at
 * - 可写列：username, real_name, phone（其余列 42501）
 * - RLS：只能读/改自己那一行（profiles_select_own / profiles_update_own）
 * - CHECK：姓名 2-20 字、手机号 ^[0-9+\- ]{6,20}$（23514）
 */
const PROFILE_COLUMNS = "id, username, real_name, phone, created_at, updated_at"

describe("第 5 轮：profiles 个人信息列级与行级权限", () => {
  let ctx: TestContext
  let alice: TestUser
  let bob: TestUser

  beforeAll(async () => {
    ctx = createTestContext()
    alice = await ctx.user("alice")
    bob = await ctx.user("bob")
  }, 120_000)

  afterAll(async () => {
    await ctx.cleanup()
  })

  it("初始状态：姓名与手机号为 null，公开列可读", async () => {
    const result = await alice.client
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", alice.id)
      .single()

    expect(result.error).toBeNull()
    expect(result.data?.username).toBe(alice.username)
    expect(result.data?.real_name).toBeNull()
    expect(result.data?.phone).toBeNull()
    expect(result.data?.created_at).toBeTruthy()
  })

  it("可以更新自己的 real_name / phone，并读回", async () => {
    const updated = await alice.client
      .from("profiles")
      .update({ real_name: "张三", phone: "13800138000" })
      .eq("id", alice.id)
      .select(PROFILE_COLUMNS)
      .single()

    expect(updated.error).toBeNull()
    expect(updated.data?.real_name).toBe("张三")
    expect(updated.data?.phone).toBe("13800138000")

    const readBack = await alice.client
      .from("profiles")
      .select("real_name, phone")
      .eq("id", alice.id)
      .single()
    expect(readBack.data?.real_name).toBe("张三")
    expect(readBack.data?.phone).toBe("13800138000")
  })

  it("RLS：读不到别人的 profile，也改不动别人的行", async () => {
    const foreign = await alice.client
      .from("profiles")
      .select(PROFILE_COLUMNS)
      .eq("id", bob.id)
    expect(foreign.error).toBeNull()
    expect(foreign.data).toEqual([])

    const attempt = await alice.client
      .from("profiles")
      .update({ real_name: "冒充" })
      .eq("id", bob.id)
      .select("id")
    expect(attempt.error).toBeNull()
    expect(attempt.data).toEqual([])

    // Bob 的行没有被改动
    const bobRow = await ctx.admin
      .from("profiles")
      .select("real_name")
      .eq("id", bob.id)
      .single()
    expect(bobRow.data?.real_name).toBeNull()
  })

  it("列级：未授予的时刻列不可写（42501）", async () => {
    const result = await alice.client
      .from("profiles")
      .update({ created_at: new Date().toISOString() } as never)
      .eq("id", alice.id)
      .select("id")
    expect(result.error).not.toBeNull()
    expect(result.error?.code).toBe("42501")
  })

  it("CHECK 约束：姓名过短/过长、手机号格式非法都被数据库拒绝（23514）", async () => {
    const badName = await alice.client
      .from("profiles")
      .update({ real_name: "张" })
      .eq("id", alice.id)
      .select("id")
    expect(badName.error?.code).toBe("23514")

    for (const phone of ["abc", "12345", "1".repeat(21)]) {
      const badPhone = await alice.client
        .from("profiles")
        .update({ phone })
        .eq("id", alice.id)
        .select("id")
      expect(badPhone.error?.code, phone).toBe("23514")
    }

    // 合法值仍然可写（+ - 空格也接受）
    const ok = await alice.client
      .from("profiles")
      .update({ phone: "+86 138-0013-8000" })
      .eq("id", alice.id)
      .select("phone")
      .single()
    expect(ok.error).toBeNull()
    expect(ok.data?.phone).toBe("+86 138-0013-8000")
  })
})
