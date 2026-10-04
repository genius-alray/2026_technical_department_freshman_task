import { expect, test } from "@playwright/test"
import { createPickup } from "../helpers/fixtures"
import type { TestContext } from "../helpers/supabase"
import {
  cleanupUserByUsername,
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signInViaUi,
  signUpViaUi,
  submitClaimWithConfirm,
  uniqueUsername,
  uploadPhoto,
  type E2EItem,
  type E2EUser,
} from "./helpers"

const T = 30_000

/** 场景 8：UI 简化要求（第 2 轮起，第 3/4 轮同步更新选择器与文案） */
test.describe("场景 8：UI 简化要求", () => {
  let ctx: TestContext
  let ownerA: E2EUser
  let itemA: E2EItem
  let itemB: E2EItem
  let tabUser: E2EUser
  let tabItem: E2EItem

  test.beforeAll(async () => {
    test.setTimeout(180_000)
    ctx = newTestContext()
    ownerA = await createE2EUser(ctx, "owner")
    const ownerB = await createE2EUser(ctx, "other")
    tabUser = await createE2EUser(ctx, "tab")

    const rand = Math.random().toString(36).slice(2, 6)
    itemA = await createPublishedItem(ctx, ownerA, {
      title: "E2E UI 甲 " + rand,
      contact: "13900139000",
      photos: 2,
    })
    itemB = await createPublishedItem(ctx, ownerB, {
      title: "E2E UI 乙 " + rand,
      contact: "13500135000",
    })
    tabItem = await createPublishedItem(ctx, tabUser, {
      title: "E2E UI 丙 " + rand,
    })
    // tabUser 认领了别人的物品 → 「我的认领」有一段，且与「我的发布」内容不同
    await createPickup(tabUser.user, itemB.id, "王五", "13700137000")
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("1) /、/items/[id]、/me 都没有底部导航；「我的」在首页右上角且可进入 /me", async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const context = await browser.newContext()
    const page = await context.newPage()
    const username = uniqueUsername("nav")
    try {
      await signUpViaUi(page, username)

      await page.goto("/")
      const meEntry = page.getByTestId("me-entry")
      await expect(meEntry).toBeVisible({ timeout: T })
      await expect(
        page.getByRole("navigation", { name: "主导航" })
      ).toHaveCount(0, { timeout: T })

      const box = await meEntry.boundingBox()
      const viewport = page.viewportSize()
      expect(box).not.toBeNull()
      expect(viewport).not.toBeNull()
      const width = viewport!.width
      expect(box!.x, "「我的」入口必须在视口右半边").toBeGreaterThan(width / 2)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)

      await meEntry.click()
      await page.waitForURL(/\/me$/, { timeout: T })
      await expect(
        page.getByRole("navigation", { name: "主导航" })
      ).toHaveCount(0, { timeout: T })

      await page.goto("/items/" + itemA.id)
      await expect(page.getByTestId("item-back")).toBeVisible({ timeout: T })
      await expect(
        page.getByRole("navigation", { name: "主导航" })
      ).toHaveCount(0, { timeout: T })
    } finally {
      await context.close()
      await cleanupUserByUsername(ctx, username)
    }
  })

  test("2) 发布一步一屏：拍照屏没有文本表单；切屏后旧屏内容消失；返回退回上一步", async ({
    page,
  }) => {
    test.setTimeout(300_000)
    const username = uniqueUsername("wizard")
    await signUpViaUi(page, username)
    try {
      await page.goto("/publish")

      await expect(page.getByRole("button", { name: /选择照片/ })).toBeVisible({
        timeout: T,
      })
      for (const selector of [
        "#title",
        "#description",
        "#contact",
        "#locationLabel",
      ]) {
        await expect(
          page.locator(selector),
          selector + " 不应出现在拍照屏"
        ).toHaveCount(0, { timeout: T })
      }
      await expect(
        page.locator('input[type="text"], input[type="tel"], textarea')
      ).toHaveCount(0, { timeout: T })
      await expect(page.getByText("确认信息")).toHaveCount(0, { timeout: T })

      await uploadPhoto(page, "photo-1.png")
      await expect(page.getByText("已上传 1/5")).toBeVisible({
        timeout: 60_000,
      })
      await page.getByRole("button", { name: "下一步" }).click()
      // 第 5 轮：1 张 → 先弹补拍对话框；「仍然继续」才进第 2 屏
      await expect(page.getByTestId("photo-advice-dialog")).toBeVisible({
        timeout: T,
      })
      await page.getByTestId("photo-advice-skip").click()

      // 第 2 屏（进入即自动识别，加载期间没有输入框）
      await expect(page.locator("#title")).toBeVisible({ timeout: 60_000 })
      await expect(page.locator("#title")).not.toHaveValue("", {
        timeout: 60_000,
      })
      await expect(page.locator("#description")).toBeVisible({ timeout: T })
      await expect(page.getByRole("button", { name: /选择照片/ })).toHaveCount(
        0,
        { timeout: T }
      )
      await expect(page.getByText("已上传 1/5")).toHaveCount(0, { timeout: T })
      await expect(page.locator("#contact")).toHaveCount(0, { timeout: T })

      // 返回退回上一步，URL 仍是 /publish（已有照片时是「继续添加」）
      await page.getByLabel("返回").click()
      await expect(
        page.getByRole("button", { name: /选择照片|继续添加|继续拍照/ }).first()
      ).toBeVisible({ timeout: T })
      await expect(page.getByText("已上传 1/5")).toBeVisible({ timeout: T })
      await expect(page.locator("#title")).toHaveCount(0, { timeout: T })
      expect(new URL(page.url()).pathname).toBe("/publish")

      // 再前进到第 2、3 屏（1 张 → 仍需在弹出的对话框里选「仍然继续」）
      await page.getByRole("button", { name: "下一步" }).click()
      await expect(page.getByTestId("photo-advice-dialog")).toBeVisible({
        timeout: T,
      })
      await page.getByTestId("photo-advice-skip").click()
      await expect(page.locator("#title")).toBeVisible({ timeout: 60_000 })
      await expect(page.locator("#title")).not.toHaveValue("", {
        timeout: 60_000,
      })
      await page.getByRole("button", { name: "下一步" }).click()
      await expect(page.getByRole("button", { name: "代为保管" })).toBeVisible({
        timeout: T,
      })
      await expect(page.locator("#title")).toHaveCount(0, { timeout: T })

      await page.getByRole("button", { name: "代为保管" }).click()
      await expect(page.locator("#contact")).toBeVisible({ timeout: T })
      await page.locator("#contact").fill("13500135000")
      await page.getByRole("button", { name: "发布", exact: true }).click()
      await expect(page.getByTestId("publish-success")).toBeVisible({
        timeout: T,
      })
      await page.waitForURL(/\/$/, { timeout: T })
    } finally {
      await cleanupUserByUsername(ctx, username)
    }
  })

  test("3) /me 标签页一屏一段列表：默认只看到「我的发布」", async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const context = await browser.newContext()
    const page = await context.newPage()
    try {
      await signInViaUi(page, tabUser.username)
      await page.goto("/me")

      const publishedTab = page.getByRole("tab", { name: /我的发布/ })
      const pickupsTab = page.getByRole("tab", { name: /我的认领/ })
      await expect(publishedTab).toBeVisible({ timeout: T })
      await expect(pickupsTab).toBeVisible({ timeout: T })

      await expect(page.getByText(tabItem.title).first()).toBeVisible({
        timeout: T,
      })
      const pickupCard = page.getByTestId("me-pickup-card")
      await expect(pickupCard.first()).toBeHidden({ timeout: T })

      await pickupsTab.click()
      // 第 5 轮：/me 只做导航 —— 卡片上是物品标题 + 状态，不再内联姓名/手机号/揭晓
      // （注意：页面顶部「我的信息」入口会显示本人的姓名 · 手机号，那是设计内行为，
      //  所以这里只针对领取卡片断言，不用全页 getByText）
      await expect(pickupCard.first()).toBeVisible({ timeout: T })
      await expect(pickupCard.first()).toContainText(itemB.title, {
        timeout: T,
      })
      await expect(pickupCard.first()).not.toContainText("王五")
      await expect(pickupCard.first()).not.toContainText("13700137000")
      await expect(page.getByText(tabItem.title).first()).toBeHidden({
        timeout: T,
      })

      // 整卡点进物品详情
      await pickupCard.first().click()
      await page.waitForURL(new RegExp("/items/" + itemB.id + "$"), {
        timeout: T,
      })
      await expect(
        page.getByRole("heading", { name: itemB.title })
      ).toBeVisible({ timeout: T })
    } finally {
      await context.close()
    }
  })

  test("4) 认领流程的动效不阻碍交互（链接 → 独立一屏 → 提交 → 揭晓）", async ({
    browser,
  }) => {
    test.setTimeout(240_000)
    const context = await browser.newContext()
    const page = await context.newPage()
    const username = uniqueUsername("motion")
    try {
      await signUpViaUi(page, username)
      await page.goto("/items/" + itemA.id)

      await expect(page.getByTestId("pickup-open")).toBeVisible({ timeout: T })
      await page.getByTestId("pickup-open").click()
      await page.waitForURL(new RegExp("/items/" + itemA.id + "/claim$"), {
        timeout: T,
      })
      await expect(page.getByTestId("pickup-form")).toBeVisible({ timeout: T })
      await submitClaimWithConfirm(page)
      // D-2 修复后：整屏对勾必须真的可见
      await expect(page.getByTestId("claim-success")).toBeVisible({
        timeout: T,
      })
      await page.waitForURL(new RegExp("/items/" + itemA.id + "$"), {
        timeout: T,
      })
      await expect(page.getByTestId("reveal-contact")).toBeVisible({
        timeout: T,
      })
      await expect(page.getByTestId("reveal-contact")).toContainText(
        itemA.contact,
        { timeout: T }
      )
    } finally {
      await context.close()
      await cleanupUserByUsername(ctx, username)
    }
  })
})
