import { expect, test } from "@playwright/test"
import {
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  submitClaimWithConfirm,
  uniqueUsername,
  type E2EItem,
} from "./helpers"
import type { TestContext } from "../helpers/supabase"

const T = 30_000

/** 场景 5（第 4 轮）：留在原地分支 —— 认领后揭晓位置描述 */
test.describe("场景 5：留在原地分支", () => {
  let ctx: TestContext
  let item: E2EItem
  const locationLabel = "图书馆 3 楼自习区靠窗第三排"

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 留在原地 " + Math.random().toString(36).slice(2, 6),
      custody: "in_place",
      locationLabel,
      photos: 2,
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("详情页不含位置；认领后揭晓位置描述", async ({ page }) => {
    test.setTimeout(180_000)
    await signUpViaUi(page, uniqueUsername("viewer"))

    await page.goto("/items/" + item.id)
    await expect(page.getByTestId("item-back")).toBeVisible({ timeout: T })
    await expect(page.getByTestId("pickup-open")).toBeVisible({ timeout: T })

    const bodyBefore = await page.locator("body").innerText()
    expect(bodyBefore).not.toContain(locationLabel)

    await page.getByTestId("pickup-open").click()
    await page.waitForURL(new RegExp("/items/" + item.id + "/claim$"), {
      timeout: T,
    })
    await page.getByTestId("pickup-name").fill("赵六")
    await page.getByTestId("pickup-phone").fill("13600136000")
    await submitClaimWithConfirm(page)
    // D-2 修复后：整屏对勾必须真的可见（服务端 revalidate 不得抢先重定向）
    await expect(page.getByTestId("claim-success")).toBeVisible({ timeout: T })
    await page.waitForURL(new RegExp("/items/" + item.id + "$"), { timeout: T })
    await expect(page.getByTestId("reveal-location")).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("reveal-location")).toContainText(
      locationLabel,
      { timeout: T }
    )
  })
})
