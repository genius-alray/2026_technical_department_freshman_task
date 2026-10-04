import { expect, test } from "@playwright/test"
import type { TestContext } from "../helpers/supabase"
import {
  cleanupUserByUsername,
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  submitClaimWithConfirm,
  uniqueUsername,
  type E2EItem,
} from "./helpers"

const T = 30_000

/**
 * 场景 15：诚信认领二次确认（第 7 轮起在**详情页**完成）
 * 点「我要认领」只弹 Dialog，不写库；取消不写；点「我确认认领」才产生 pickup 行并跳转认领信息。
 */
test.describe("场景 15：认领二次确认", () => {
  let ctx: TestContext
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 诚信确认 " + Math.random().toString(36).slice(2, 6),
      contact: "13900139000",
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  /** 直接查库：这件物品现在有几条认领记录 */
  async function pickupRows(): Promise<number> {
    const result = await ctx.admin
      .from("pickups")
      .select("id", { count: "exact", head: true })
      .eq("found_item_id", item.id)
    return result.count ?? 0
  }

  test("取消对话框不写库；确认后立刻进入认领信息并产生记录", async ({
    page,
  }) => {
    test.setTimeout(240_000)
    const seed = uniqueUsername("confirm")
    await signUpViaUi(page, seed)
    try {
      await page.goto("/items/" + item.id)
      const open = page.getByTestId("pickup-open")
      await expect(open).toBeVisible({ timeout: T })

      // 1) 点入口 → 只弹确认框，DB 仍然没有记录
      await open.click()
      const dialog = page.getByTestId("claim-confirm")
      await expect(dialog).toBeVisible({ timeout: T })
      await expect(dialog).toContainText("诚信认领")
      expect(await pickupRows()).toBe(0)

      // 2) 取消 → 关闭，仍无记录，仍在详情页
      await page.getByTestId("claim-confirm-cancel").click()
      await expect(dialog).toHaveCount(0, { timeout: T })
      expect(await pickupRows()).toBe(0)
      await expect(page).toHaveURL(new RegExp("/items/" + item.id + "$"), {
        timeout: T,
      })

      // 3) 再点并确认 → 立刻跳到认领信息
      await submitClaimWithConfirm(page)
      await expect(page).toHaveURL(
        new RegExp("/items/" + item.id + "/claim$"),
        { timeout: T }
      )
      await expect(page.getByTestId("reveal-contact")).toBeVisible({
        timeout: T,
      })

      expect(await pickupRows()).toBe(1)
      const status = await ctx.admin
        .from("found_items")
        .select("status")
        .eq("id", item.id)
        .single()
      expect(status.data?.status).toBe("claimed")
    } finally {
      await cleanupUserByUsername(ctx, seed)
    }
  })
})
