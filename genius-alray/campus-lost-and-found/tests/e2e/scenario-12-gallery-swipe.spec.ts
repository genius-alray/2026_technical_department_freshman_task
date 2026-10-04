import { expect, test } from "@playwright/test"
import type { TestContext } from "../helpers/supabase"
import {
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  uniqueUsername,
  type E2EItem,
} from "./helpers"

const T = 30_000

/** 场景 12（第 4 轮）：详情页相册支持左右滑动（motion drag），且无横向溢出 */
test.describe("场景 12：相册左右滑动", () => {
  let ctx: TestContext
  let item: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 相册 " + Math.random().toString(36).slice(2, 6),
      photos: 2,
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("拖拽相册：计数器 1/2 → 2/2 → 1/2，且页面无横向溢出", async ({
    page,
  }) => {
    test.setTimeout(180_000)
    await signUpViaUi(page, uniqueUsername("swiper"))
    await page.goto("/items/" + item.id)

    const counter = page.getByTestId("gallery-counter")
    await expect(counter).toHaveText("1/2", { timeout: T })
    await expect(page.getByTestId("gallery-prev")).toBeDisabled()

    const image = page.getByRole("img", { name: item.title }).first()
    await expect(image).toBeVisible({ timeout: T })
    const box = await image.boundingBox()
    expect(box).not.toBeNull()
    const cx = box!.x + box!.width / 2
    const cy = box!.y + box!.height / 2

    // 向左拖 → 下一张
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(cx - step * 16, cy)
    }
    await page.mouse.up()
    await expect(counter).toHaveText("2/2", { timeout: T })
    await expect(page.getByTestId("gallery-next")).toBeDisabled()

    // 向右拖 → 上一张
    await page.mouse.move(cx, cy)
    await page.mouse.down()
    for (let step = 1; step <= 10; step += 1) {
      await page.mouse.move(cx + step * 16, cy)
    }
    await page.mouse.up()
    await expect(counter).toHaveText("1/2", { timeout: T })

    // 移动端无横向溢出
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
