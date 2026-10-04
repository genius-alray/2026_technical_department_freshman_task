import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  createPickupRaw,
  itemStatus,
  pickupCount,
  publishItem,
  withdrawItem,
} from "../helpers/fixtures"
import {
  createTestContext,
  type TestContext,
  type TestUser,
} from "../helpers/supabase"

/**
 * 矩阵 6（第 4 轮）：create_pickup —— 认领即归属
 * - 成功即把物品置为 claimed
 * - 别人再认领 → P0001；拾主认领自己的 → 42501
 * - 同一认领人重复提交 = 更新同一条记录（行数不增加）
 * - 已撤单 → P0001；不存在 → P0002
 */
describe("矩阵 6：create_pickup（认领即归属）", () => {
  let ctx: TestContext
  let owner: TestUser
  let picker: TestUser
  let second: TestUser

  beforeAll(async () => {
    ctx = createTestContext()
    owner = await ctx.user("owner")
    picker = await ctx.user("picker")
    second = await ctx.user("second")
  }, 120_000)

  afterAll(async () => {
    await ctx.cleanup()
  })

  /** 每个用例用一件全新的物品，避免「已被认领」污染后续断言 */
  async function freshItem(title = "可认领的物品") {
    return publishItem(owner, { title })
  }

  it("矩阵 6：anon 调用被拒", async () => {
    const item = await freshItem()
    const result = await ctx.anon.rpc("create_pickup", {
      p_item_id: item.id,
      p_name: "张三",
      p_phone: "13800138000",
    })
    expect(result.error).not.toBeNull()
    expect(result.error?.code).toBe("42501")
  })

  it("矩阵 6：姓名/手机号非法 → 22023", async () => {
    const item = await freshItem()
    expect(
      (await createPickupRaw(picker, item.id, "张", "13800138000")).error?.code
    ).toBe("22023")
    expect(
      (await createPickupRaw(picker, item.id, "张".repeat(21), "13800138000"))
        .error?.code
    ).toBe("22023")
    for (const phone of ["1380013800a", "12345", "1".repeat(21)]) {
      const result = await createPickupRaw(picker, item.id, "李四", phone)
      expect(result.error?.code, phone).toBe("22023")
    }
    // 合法格式（含 + - 空格）通过
    const ok = await createPickupRaw(
      picker,
      item.id,
      "李四",
      "+86 138-0013-8000"
    )
    expect(ok.error).toBeNull()
  })

  it("矩阵 6：拾主认领自己的物品 → 42501（中文提示原样透出）", async () => {
    const item = await freshItem()
    const result = await createPickupRaw(
      owner,
      item.id,
      "拾主本人",
      "13800138000"
    )
    expect(result.error?.code).toBe("42501")
    expect(result.error?.message).toContain("不能认领自己发布的物品")
    expect(await itemStatus(ctx, item.id)).toBe("published")
    expect(await pickupCount(ctx, item.id)).toBe(0)
  })

  it("矩阵 6：首次认领成功 → 物品被置为 claimed，生成 1 条记录", async () => {
    const item = await freshItem()
    const result = await createPickupRaw(picker, item.id, "李四", "13900139000")
    expect(result.error).toBeNull()
    expect(typeof result.data).toBe("string")
    expect(await itemStatus(ctx, item.id)).toBe("claimed")
    expect(await pickupCount(ctx, item.id)).toBe(1)

    const row = await ctx.admin
      .from("found_items")
      .select("claimed_at")
      .eq("id", item.id)
      .single()
    expect(row.data?.claimed_at).not.toBeNull()
  })

  it("矩阵 6：别人再认领 → P0001「该物品已被认领」", async () => {
    const item = await freshItem()
    const first = await createPickupRaw(picker, item.id, "李四", "13900139000")
    expect(first.error).toBeNull()

    const secondAttempt = await createPickupRaw(
      second,
      item.id,
      "王五",
      "13700137000"
    )
    expect(secondAttempt.error?.code).toBe("P0001")
    expect(secondAttempt.error?.message).toContain("该物品已被认领")
    expect(await pickupCount(ctx, item.id)).toBe(1)
    expect(await itemStatus(ctx, item.id)).toBe("claimed")
  })

  it("矩阵 6：同一认领人重复提交 = 更新同一条记录（行数不增加）", async () => {
    const item = await freshItem()
    const first = await createPickupRaw(picker, item.id, "李四", "13900139000")
    expect(first.error).toBeNull()

    const again = await createPickupRaw(
      picker,
      item.id,
      "李四四",
      "13900139001"
    )
    expect(again.error).toBeNull()
    expect(again.data).toBe(first.data)
    expect(await pickupCount(ctx, item.id)).toBe(1)
    expect(await itemStatus(ctx, item.id)).toBe("claimed")

    const row = await ctx.admin
      .from("pickups")
      .select("picker_name, picker_phone")
      .eq("id", first.data as string)
      .single()
    expect(row.data?.picker_name).toBe("李四四")
    expect(row.data?.picker_phone).toBe("13900139001")
  })

  it("矩阵 6：已撤单物品 → P0001「该物品已撤单，无法认领」", async () => {
    const item = await freshItem("待撤单的物品")
    await withdrawItem(owner, item.id)

    const result = await createPickupRaw(picker, item.id, "李四", "13900139000")
    expect(result.error?.code).toBe("P0001")
    expect(result.error?.message).toContain("该物品已撤单")
    expect(await pickupCount(ctx, item.id)).toBe(0)
  })

  it("矩阵 6：不存在的物品 → P0002", async () => {
    const result = await createPickupRaw(
      picker,
      crypto.randomUUID(),
      "李四",
      "13900139000"
    )
    expect(result.error?.code).toBe("P0002")
  })

  it("第 5 轮：认领会把姓名/手机号写回 profiles（下次可直接预填）", async () => {
    const fresh = await freshItem("写回个人信息")
    // 先把 picker 的 profile 清空，确保是「认领写回」而不是残留
    await ctx.admin
      .from("profiles")
      .update({ real_name: "占位姓名", phone: "13900000000" })
      .eq("id", picker.id)

    const result = await createPickupRaw(
      picker,
      fresh.id,
      "王五",
      "13700137000"
    )
    expect(result.error).toBeNull()

    const profile = await ctx.admin
      .from("profiles")
      .select("real_name, phone")
      .eq("id", picker.id)
      .single()
    expect(profile.data?.real_name).toBe("王五")
    expect(profile.data?.phone).toBe("13700137000")

    // 与 pickups 行保持一致
    const pickup = await ctx.admin
      .from("pickups")
      .select("picker_name, picker_phone")
      .eq("id", result.data as string)
      .single()
    expect(pickup.data?.picker_name).toBe(profile.data?.real_name)
    expect(pickup.data?.picker_phone).toBe(profile.data?.phone)
  })
})
