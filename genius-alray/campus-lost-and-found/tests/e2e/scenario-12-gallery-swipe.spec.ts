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

/**
 * 场景 12（第 5 轮）：详情页相册改成原生 scroll-snap 轮播
 * - 左右箭头已删除；用 gallery-track 的 scrollTo 驱动（原生滚动容器不响应 mouse 拖拽）
 * - 计数器与圆点 aria-current 必须跟着滚动走
 * - 页面无横向溢出
 */
test.describe("场景 12：相册 scroll-snap 轮播", () => {
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

  test("滚动切换 + 圆点同步 + 圆点跳转，且无横向溢出", async ({ page }) => {
    test.setTimeout(180_000)
    await signUpViaUi(page, uniqueUsername("swiper"))
    await page.goto("/items/" + item.id)

    const track = page.getByTestId("gallery-track")
    const counter = page.getByTestId("gallery-counter")
    await expect(track).toBeVisible({ timeout: T })
    await expect(counter).toHaveText("1/2", { timeout: T })
    await expect(page.getByTestId("gallery-dot-0")).toHaveAttribute(
      "aria-current",
      "true"
    )

    // 原生横向滚动到第二张（scroll-snap 容器；等价于手指左滑后的落点）
    await track.evaluate((el) => {
      el.scrollLeft = el.clientWidth
    })
    await expect(counter).toHaveText("2/2", { timeout: T })
    await expect(page.getByTestId("gallery-dot-1")).toHaveAttribute(
      "aria-current",
      "true"
    )

    // 点第 1 个圆点跳回第一张
    await page.getByTestId("gallery-dot-0").click()
    await expect(counter).toHaveText("1/2", { timeout: T })
    await expect(page.getByTestId("gallery-dot-0")).toHaveAttribute(
      "aria-current",
      "true"
    )

    // 移动端无横向溢出
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    )
    expect(overflow).toBeLessThanOrEqual(1)
  })
})
