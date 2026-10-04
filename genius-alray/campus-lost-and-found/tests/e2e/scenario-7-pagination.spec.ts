import { expect, test } from "@playwright/test"
import {
  cardByTitle,
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signUpViaUi,
  uniqueUsername,
} from "./helpers"

const T = 30_000

/** 验收标准 1：首页双列瀑布流 + 分页「加载更多」 */
test.describe("场景 7：失物墙分页", () => {
  test("首屏 20 条；加载更多后能看到更早发布的物品", async ({ page }) => {
    test.setTimeout(300_000)
    const ctx = newTestContext()
    try {
      const owner = await createE2EUser(ctx, "page")
      const runId = Math.random().toString(36).slice(2, 6)
      const titles: string[] = []
      // 顺序创建 22 条（created_at 递增）：第 1 条最旧，应落在第 2 页
      for (let index = 1; index <= 22; index += 1) {
        const title = "E2E 分页 " + String(index).padStart(2, "0") + " " + runId
        titles.push(title)
        await createPublishedItem(ctx, owner, { title, photos: 1 })
      }

      await signUpViaUi(page, uniqueUsername("viewer"))
      await page.goto("/")
      await expect(page.getByTestId("item-wall")).toBeVisible({ timeout: T })

      const newest = titles[titles.length - 1]
      const oldest = titles[0]
      await expect(cardByTitle(page, newest)).toBeVisible({ timeout: T })
      // 先确保首屏确实渲染完成（newest 可见），再断言最旧的一条不在首屏
      await expect(cardByTitle(page, oldest)).toHaveCount(0, { timeout: T })

      // 点「加载更多」直到最旧的一条出现（最多 3 次，容忍库里已有的其它数据）
      let found = false
      for (let attempt = 0; attempt < 3 && !found; attempt += 1) {
        const loadMore = page.getByTestId("load-more")
        if ((await loadMore.count()) === 0) break
        await expect(loadMore).toBeVisible({ timeout: T })
        await loadMore.click()
        try {
          await expect(cardByTitle(page, oldest)).toBeVisible({
            timeout: 20_000,
          })
          found = true
        } catch {
          found = false
        }
      }
      expect(found).toBe(true)
    } finally {
      await ctx.cleanup()
    }
  })
})
