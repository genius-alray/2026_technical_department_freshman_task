import { expect, test } from "@playwright/test"
import type { TestContext } from "../helpers/supabase"
import {
  cardByTitle,
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  uniqueUsername,
  type E2EItem,
  type E2EUser,
} from "./helpers"

const T = 30_000

/**
 * 场景 10（第 4 轮）：认领即归属
 * - 认领后 DB status = claimed，但**失物墙仍然列出该物品**且带「已认领」角标
 * - 第二个账号打开详情页：看到 pickup-claimed，且没有认领入口（直接被拦）
 */
test.describe("场景 10：认领即归属", () => {
  let ctx: TestContext
  let owner: E2EUser
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 归属 " + Math.random().toString(36).slice(2, 6),
      contact: "13900139000",
      photos: 2,
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("认领后墙上仍列出并带「已认领」；第二个账号被拦", async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const claimerCtx = await browser.newContext()
    const claimer = await claimerCtx.newPage()
    const claimerName = uniqueUsername("claimer")
    try {
      await signUpViaUi(claimer, claimerName)
      await claimer.goto("/items/" + item.id + "/claim")
      await expect(
        claimer.getByRole("heading", { name: "认领物品" })
      ).toBeVisible({ timeout: T })
      await claimer.getByTestId("pickup-name").fill("李四")
      await claimer.getByTestId("pickup-phone").fill("13700137000")
      await claimer.getByTestId("pickup-submit").click()
      // D-2 修复后：整屏对勾必须真的可见
      await expect(claimer.getByTestId("claim-success")).toBeVisible({
        timeout: T,
      })
      await claimer.waitForURL(new RegExp("/items/" + item.id + "$"), {
        timeout: T,
      })
      await expect(claimer.getByTestId("reveal-contact")).toBeVisible({
        timeout: T,
      })
    } finally {
      await claimerCtx.close()

      // 手动清理 UI 注册的认领人（ctx.cleanup 只管 API 侧用户）
      const profile = await ctx.admin
        .from("profiles")
        .select("id")
        .eq("username", claimerName)
        .maybeSingle()
      if (profile.data?.id) {
        await ctx.admin.auth.admin.deleteUser(profile.data.id)
      }
    }

    // DB：claimed
    const row = await ctx.admin
      .from("found_items")
      .select("status")
      .eq("id", item.id)
      .single()
    expect(row.data?.status).toBe("claimed")

    // 第二个账号：墙上有卡片且带「已认领」角标
    const otherCtx = await browser.newContext()
    const other = await otherCtx.newPage()
    const otherName = uniqueUsername("other")
    try {
      await signUpViaUi(other, otherName)
      await other.goto("/")
      const card = cardByTitle(other, item.title)
      await expect(card).toBeVisible({ timeout: T })
      await expect(card).toContainText("已认领", { timeout: T })

      // 详情页：看到 pickup-claimed，没有认领入口
      await card.click()
      await other.waitForURL(new RegExp("/items/" + item.id + "$"), {
        timeout: T,
      })
      await expect(other.getByTestId("pickup-claimed")).toBeVisible({
        timeout: T,
      })
      await expect(other.getByTestId("pickup-open")).toHaveCount(0, {
        timeout: T,
      })

      // 直接访问认领页也会被退回详情页（服务端重定向）
      await other.goto("/items/" + item.id + "/claim")
      await expect(other).toHaveURL(new RegExp("/items/" + item.id + "$"), {
        timeout: T,
      })
      await expect(other.getByTestId("pickup-claimed")).toBeVisible({
        timeout: T,
      })
    } finally {
      await otherCtx.close()
      const profile = await ctx.admin
        .from("profiles")
        .select("id")
        .eq("username", otherName)
        .maybeSingle()
      if (profile.data?.id) {
        await ctx.admin.auth.admin.deleteUser(profile.data.id)
      }
    }
  })
})
