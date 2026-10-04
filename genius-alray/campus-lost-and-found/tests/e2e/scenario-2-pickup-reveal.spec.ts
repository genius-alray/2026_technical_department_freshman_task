import { expect, test } from "@playwright/test"
import {
  cardByTitle,
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

/**
 * 场景 2（第 4 轮）：公开浏览 → 详情不含电话 → 认领独立一屏 → 认领即归属并立即揭晓。
 */
test.describe("场景 2：公开浏览 → 认领后揭晓", () => {
  let ctx: TestContext
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 钱包 " + Math.random().toString(36).slice(2, 6),
      description: "黑色皮质钱包，内含数张卡片。",
      custody: "kept",
      contact: "13900139000",
      photos: 2,
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("卡片可见 → 详情不含电话 → 认领 → 立即揭晓真实电话", async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await signUpViaUi(page, uniqueUsername("viewer"))

    await page.goto("/")
    await expect(page.getByTestId("item-wall")).toBeVisible({ timeout: T })
    const card = cardByTitle(page, item.title)
    await expect(card).toBeVisible({ timeout: T })
    await expect(card.locator("img").first()).toBeVisible({ timeout: T })
    await expect(card).toContainText(item.description, { timeout: T })

    await card.click()
    await page.waitForURL(new RegExp("/items/" + item.id + "$"), { timeout: T })
    await expect(page.getByRole("heading", { name: item.title })).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("item-back")).toBeVisible({ timeout: T })

    // 详情页不含拾主真实电话；且详情页没有内联表单（认领是独立一屏）
    const bodyBefore = await page.locator("body").innerText()
    expect(bodyBefore).not.toContain(item.contact)
    await expect(page.getByTestId("pickup-form")).toHaveCount(0)

    await page.getByTestId("pickup-open").click()
    await page.waitForURL(new RegExp("/items/" + item.id + "/claim$"), {
      timeout: T,
    })
    await expect(page.getByRole("heading", { name: "认领物品" })).toBeVisible({
      timeout: T,
    })
    await expect(page.getByTestId("pickup-form")).toBeVisible({ timeout: T })

    await page.getByTestId("pickup-name").fill("李四")
    await page.getByTestId("pickup-phone").fill("13700137000")
    await submitClaimWithConfirm(page)
    // D-2 修复后：整屏对勾必须真的可见（服务端 revalidate 不得抢先重定向）
    await expect(page.getByTestId("claim-success")).toBeVisible({ timeout: T })
    await page.waitForURL(new RegExp("/items/" + item.id + "$"), { timeout: T })
    await expect(page.getByTestId("reveal-contact")).toBeVisible({ timeout: T })
    await expect(page.getByTestId("reveal-contact")).toContainText(
      item.contact,
      { timeout: T }
    )

    await page.reload()
    await expect(page.getByTestId("reveal-contact")).toContainText(
      item.contact,
      { timeout: T }
    )

    // 认领即归属：物品被置为 claimed
    const row = await ctx.admin
      .from("found_items")
      .select("status, claimed_at")
      .eq("id", item.id)
      .single()
    expect(row.data?.status).toBe("claimed")
    expect(row.data?.claimed_at).not.toBeNull()
  })
})
