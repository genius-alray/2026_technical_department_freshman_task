import { expect, test } from "@playwright/test"
import {
  createE2EUser,
  createPublishedItem,
  newTestContext,
  signInViaUi,
  signUpViaUi,
  submitClaimWithConfirm,
  uniqueUsername,
  type E2EItem,
} from "./helpers"
import type { TestContext } from "../helpers/supabase"

const T = 30_000

/** 场景 3（第 4 轮）：拾主在「我的发布 → 查看认领人」看到认领人姓名与手机号 */
test.describe("场景 3：拾主查看认领人名单", () => {
  let ctx: TestContext
  let item: E2EItem
  let ownerUsername = ""

  test.beforeAll(async () => {
    test.setTimeout(120_000)
    ctx = newTestContext()
    const owner = await createE2EUser(ctx, "owner")
    ownerUsername = owner.username
    item = await createPublishedItem(ctx, owner, {
      title: "E2E 认领名单 " + Math.random().toString(36).slice(2, 6),
      custody: "kept",
      contact: "13900139000",
    })
  })

  test.afterAll(async () => {
    await ctx.cleanup()
  })

  test("认领人提交后，拾主能在名单里看到姓名与手机号", async ({ browser }) => {
    test.setTimeout(240_000)

    const pickerCtx = await browser.newContext()
    const pickerPage = await pickerCtx.newPage()
    const pickerName = uniqueUsername("picker")
    try {
      await signUpViaUi(pickerPage, pickerName)
      await pickerPage.goto("/items/" + item.id)
      await expect(pickerPage.getByTestId("pickup-open")).toBeVisible({
        timeout: T,
      })
      await pickerPage.getByTestId("pickup-open").click()
      await pickerPage.waitForURL(new RegExp("/items/" + item.id + "/claim$"), {
        timeout: T,
      })
      await expect(
        pickerPage.getByRole("heading", { name: "认领物品" })
      ).toBeVisible({ timeout: T })
      await pickerPage.getByTestId("pickup-name").fill("王五")
      await pickerPage.getByTestId("pickup-phone").fill("13700137000")
      await submitClaimWithConfirm(pickerPage)
      // D-2 修复后：整屏对勾必须真的可见
      await expect(pickerPage.getByTestId("claim-success")).toBeVisible({
        timeout: T,
      })
      await pickerPage.waitForURL(new RegExp("/items/" + item.id + "$"), {
        timeout: T,
      })
      await expect(pickerPage.getByTestId("reveal-contact")).toBeVisible({
        timeout: T,
      })
    } finally {
      // 注意：这里**不能**删认领人 —— pickups.picker_id 是 on delete cascade，
      // 删用户会把认领记录一起删掉，下面拾主就看不到名单了。留到用例最后再删。
      await pickerCtx.close()
    }

    const ownerCtx = await browser.newContext()
    const ownerPage = await ownerCtx.newPage()
    try {
      await signInViaUi(ownerPage, ownerUsername)
      await ownerPage.goto("/me")
      const pickersLink = ownerPage.locator(
        'a[href="/me/items/' + item.id + '/pickups"]'
      )
      await expect(pickersLink).toBeVisible({ timeout: T })
      await pickersLink.click()
      await ownerPage.waitForURL(
        new RegExp("/me/items/" + item.id + "/pickups"),
        { timeout: T }
      )

      await expect(ownerPage.getByText("王五")).toBeVisible({ timeout: T })
      await expect(ownerPage.getByText("13700137000")).toBeVisible({
        timeout: T,
      })
      await expect(ownerPage.getByText("认领人（1）")).toBeVisible({
        timeout: T,
      })
    } finally {
      await ownerCtx.close()
      const profile = await ctx.admin
        .from("profiles")
        .select("id")
        .eq("id", pickerName)
        .maybeSingle()
      if (profile.data?.id) {
        await ctx.admin.auth.admin.deleteUser(profile.data.id)
      }
    }
  })
})
