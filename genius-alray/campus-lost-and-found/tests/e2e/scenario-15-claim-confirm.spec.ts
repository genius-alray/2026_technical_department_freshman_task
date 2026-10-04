import { expect, test } from "@playwright/test"
import type { TestContext } from "../helpers/supabase"
import {
  cleanupUserByUsername,
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  uniqueUsername,
  type E2EItem,
} from "./helpers"

const T = 30_000

/**
 * 场景 15（第 5 轮）：诚信认领二次确认
 * 点「确认认领」只弹 Dialog，不写库；取消不写；点「我确认」才产生 pickup 行。
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

  test("取消对话框不写库；确认后才产生记录并揭晓", async ({ page }) => {
    test.setTimeout(240_000)
    const username = uniqueUsername("confirm")
    await signUpViaUi(page, username)
    try {
      await page.goto("/items/" + item.id + "/claim")
      await expect(page.getByTestId("pickup-form")).toBeVisible({ timeout: T })
      await page.getByTestId("pickup-name").fill("王五")
      await page.getByTestId("pickup-phone").fill("13700137000")

      // 1) 点提交 → 只弹确认框，DB 仍然没有记录
      await page.getByTestId("pickup-submit").click()
      const dialog = page.getByTestId("claim-confirm")
      await expect(dialog).toBeVisible({ timeout: T })
      await expect(dialog).toContainText("诚信认领")
      expect(await pickupRows()).toBe(0)

      // 2) 取消 → 关闭，仍无记录，仍在认领页
      await page.getByTestId("claim-confirm-cancel").click()
      await expect(dialog).toHaveCount(0, { timeout: T })
      expect(await pickupRows()).toBe(0)
      await expect(page).toHaveURL(
        new RegExp("/items/" + item.id + "/claim$"),
        { timeout: T }
      )

      // 3) 再提交并确认 → 产生记录 + 整屏对勾 + 回详情揭晓
      await page.getByTestId("pickup-submit").click()
      await expect(dialog).toBeVisible({ timeout: T })
      await page.getByTestId("claim-confirm-ok").click()
      await expect(page.getByTestId("claim-success")).toBeVisible({
        timeout: T,
      })
      await page.waitForURL(new RegExp("/items/" + item.id + "$"), {
        timeout: T,
      })
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
      await cleanupUserByUsername(ctx, username)
    }
  })
})
