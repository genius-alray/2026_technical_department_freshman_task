// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"

import { LocationLink } from "@/components/contact/location-link"

// vitest 没开 globals，RTL 的自动 cleanup 不会注册：必须在文件里显式清理，
// 否则同一个文件里的多个用例会共享 DOM（getByTestId 直接报 multiple elements）。
afterEach(cleanup)

/**
 * 位置组件不许把经纬度展示给用户：
 * 有位置详情就显示详情，否则统一显示「查看定位」。
 */
describe("LocationLink 的文案", () => {
  it("有位置详情 + 坐标：控件显示「查看定位」，不出现经纬度，也不把详情铺在按钮上", () => {
    render(
      <LocationLink
        label="图书馆 3 楼自习区"
        lat={31.230416}
        lng={121.473701}
      />
    )
    const link = screen.getByTestId("location-link")
    expect(link).toHaveTextContent("查看定位")
    expect(link).not.toHaveTextContent("图书馆 3 楼自习区")
    expect(link).not.toHaveTextContent(/31\.23|121\.47/)
  })

  it("只有坐标：显示「查看定位」，整页都不出现经纬度", () => {
    render(<LocationLink lat={31.230416} lng={121.473701} />)
    expect(screen.getByTestId("location-link")).toHaveTextContent("查看定位")
    expect(document.body.textContent).not.toMatch(/31\.23|121\.47/)
  })

  it("什么都没填：显示「未填写位置」", () => {
    render(<LocationLink />)
    expect(screen.getByTestId("location-link")).toHaveTextContent("未填写位置")
  })
})
