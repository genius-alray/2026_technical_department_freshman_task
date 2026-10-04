import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  DEFAULT_CONTACT,
  DEFAULT_DESCRIPTION,
  publishItem,
  publishItemRaw,
} from "../helpers/fixtures"
import {
  createTestContext,
  type TestContext,
  type TestUser,
} from "../helpers/supabase"

/**
 * 安全矩阵 9：publish_found_item 的服务端校验
 * - 路径必须属于调用者（前缀 = 自己的 uid）
 * - 照片数量 1..max_photos
 * - kept 必须有联系方式；in_place 必须有坐标或位置描述
 * - 名称/描述长度
 */
describe("矩阵 9：发布 RPC 的校验", () => {
  let ctx: TestContext
  let owner: TestUser
  let other: TestUser

  beforeAll(async () => {
    ctx = createTestContext()
    owner = await ctx.user("owner")
    other = await ctx.user("other")
  }, 120_000)

  afterAll(async () => {
    await ctx.cleanup()
  })

  it("矩阵 9：anon 调用被拒", async () => {
    const result = await ctx.anon.rpc("publish_found_item", {
      p_title: "匿名发布",
      p_description: "匿名描述",
      p_custody: "kept",
      p_contact: DEFAULT_CONTACT,
      p_location_lat: null,
      p_location_lng: null,
      p_location_label: null,
      p_paths: ["x/y.jpg"],
    } as never)
    expect(result.error).not.toBeNull()
    expect(result.error?.code).toBe("42501")
  })

  it("矩阵 9：照片路径不属于自己 → 42501", async () => {
    const cases = [
      [other.id + "/stolen.jpg"],
      [owner.id + "X/prefix-not-exact.jpg"],
      ["no-slash.jpg"],
      [owner.id + "/ok.jpg", other.id + "/stolen.jpg"],
    ]
    for (const paths of cases) {
      const result = await publishItemRaw(owner, {
        title: "路径非法",
        description: DEFAULT_DESCRIPTION,
        custody: "kept",
        contact: DEFAULT_CONTACT,
        paths,
      })
      expect(result.error?.code, JSON.stringify(paths)).toBe("42501")
      expect(result.data).toBeNull()
    }
  })

  it("矩阵 9：0 张或超过 max_photos → 22023", async () => {
    const config = await owner.client.rpc("get_app_config", {})
    const maxPhotos = config.data?.[0]?.max_photos ?? 3
    expect(maxPhotos).toBe(3)

    const none = await publishItemRaw(owner, {
      title: "没有照片",
      description: DEFAULT_DESCRIPTION,
      custody: "kept",
      contact: DEFAULT_CONTACT,
      paths: [],
    })
    expect(none.error?.code).toBe("22023")

    const tooMany = await publishItemRaw(owner, {
      title: "照片太多",
      description: DEFAULT_DESCRIPTION,
      custody: "kept",
      contact: DEFAULT_CONTACT,
      paths: Array.from(
        { length: maxPhotos + 1 },
        (_, i) => owner.id + "/p" + i + ".jpg"
      ),
    })
    expect(tooMany.error?.code).toBe("22023")
  })

  it("矩阵 9：kept 缺少联系方式 / 联系方式过短 → 22023", async () => {
    const missing = await publishItemRaw(owner, {
      title: "没有电话",
      description: DEFAULT_DESCRIPTION,
      custody: "kept",
      paths: [owner.id + "/a.jpg"],
    })
    expect(missing.error?.code).toBe("22023")

    const tooShort = await publishItemRaw(owner, {
      title: "电话太短",
      description: DEFAULT_DESCRIPTION,
      custody: "kept",
      contact: "1234",
      paths: [owner.id + "/b.jpg"],
    })
    expect(tooShort.error?.code).toBe("22023")
  })

  it("矩阵 9：in_place 无坐标且无位置描述 → 22023", async () => {
    const result = await publishItemRaw(owner, {
      title: "没有位置",
      description: DEFAULT_DESCRIPTION,
      custody: "in_place",
      paths: [owner.id + "/c.jpg"],
    })
    expect(result.error?.code).toBe("22023")
  })

  it("矩阵 9：名称/描述长度非法 → 22023", async () => {
    const paths = [owner.id + "/d.jpg"]
    const cases: Array<{ title: string; description: string }> = [
      { title: "", description: DEFAULT_DESCRIPTION },
      { title: "x".repeat(61), description: DEFAULT_DESCRIPTION },
      { title: "正常名称", description: "" },
      { title: "正常名称", description: "x".repeat(601) },
    ]
    for (const item of cases) {
      const result = await publishItemRaw(owner, {
        title: item.title,
        description: item.description,
        custody: "kept",
        contact: DEFAULT_CONTACT,
        paths,
      })
      expect(
        result.error?.code,
        item.title.length + "/" + item.description.length
      ).toBe("22023")
    }
  })

  it("矩阵 9：合法输入成功发布，并写入对应数量的照片记录", async () => {
    const paths = [
      owner.id + "/p0.jpg",
      owner.id + "/p1.jpg",
      owner.id + "/p2.jpg",
    ]
    const result = await publishItemRaw(owner, {
      title: "三张照片的水杯",
      description: "棕色圆柱形水杯。",
      custody: "kept",
      contact: DEFAULT_CONTACT,
      paths,
    })
    expect(result.error).toBeNull()
    expect(typeof result.data).toBe("string")

    const itemId = result.data as string
    const item = await ctx.admin
      .from("found_items")
      .select("title, status, custody, contact")
      .eq("id", itemId)
      .single()
    expect(item.data?.title).toBe("三张照片的水杯")
    expect(item.data?.status).toBe("published")
    expect(item.data?.contact).toBe(DEFAULT_CONTACT)

    const images = await ctx.admin
      .from("found_item_images")
      .select("storage_path, position")
      .eq("found_item_id", itemId)
      .order("position")
    expect(images.data?.length).toBe(3)
    expect(images.data?.map((row) => row.position)).toEqual([0, 1, 2])
    expect(images.data?.map((row) => row.storage_path)).toEqual(paths)
  })

  it("矩阵 9：in_place 只填位置描述、或只给坐标，都可以发布", async () => {
    const byLabel = await publishItem(owner, {
      custody: "in_place",
      title: "只填位置描述",
      locationLabel: "图书馆 3 楼自习区",
    })
    const labelSecret = await ctx.admin
      .from("found_items")
      .select("contact, location_lat, location_label")
      .eq("id", byLabel.id)
      .single()
    expect(labelSecret.data?.contact).toBeNull()
    expect(labelSecret.data?.location_label).toBe("图书馆 3 楼自习区")
    expect(labelSecret.data?.location_lat).toBeNull()

    const byCoords = await publishItem(owner, {
      custody: "in_place",
      title: "只给坐标",
      lat: 31.230416,
      lng: 121.473701,
    })
    const coordSecret = await ctx.admin
      .from("found_items")
      .select("contact, location_lat, location_lng, location_label")
      .eq("id", byCoords.id)
      .single()
    expect(coordSecret.data?.contact).toBeNull()
    expect(coordSecret.data?.location_lat).toBeCloseTo(31.230416, 5)
    expect(coordSecret.data?.location_lng).toBeCloseTo(121.473701, 5)
  })
})
