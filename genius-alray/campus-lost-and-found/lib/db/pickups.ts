import type { DbClient, Pickup } from "@/lib/types"
import { unwrap } from "@/lib/db/types"

/** 领取：提交真实姓名 + 手机号。同一物品可被多人领取。 */
export async function createPickup(
  supabase: DbClient,
  input: { itemId: string; name: string; phone: string }
): Promise<string> {
  return unwrap(
    await supabase.rpc("create_pickup", {
      p_item_id: input.itemId,
      p_name: input.name,
      p_phone: input.phone,
    })
  )
}

/**
 * 我提交过的领取记录。
 * 【必须显式过滤 picker_id】pickups 的 RLS 是「picker_id = 我 或 该物品的 owner 是我」，
 * 不加过滤会把**别人在我的物品上提交的领取记录**也一起返回 —— 与 listMyItems 是同一类坑。
 */
export async function listMyPickups(
  supabase: DbClient,
  pickerId: string
): Promise<Pickup[]> {
  return unwrap(
    await supabase
      .from("pickups")
      .select(
        "id, found_item_id, picker_id, picker_name, picker_phone, created_at"
      )
      .eq("picker_id", pickerId)
      .order("created_at", { ascending: false })
  )
}

/** 拾主查看某个物品的领取人名单（RLS：物品 owner 可见） */
export async function listItemPickups(
  supabase: DbClient,
  itemId: string
): Promise<Pickup[]> {
  return unwrap(
    await supabase
      .from("pickups")
      .select(
        "id, found_item_id, picker_id, picker_name, picker_phone, created_at"
      )
      .eq("found_item_id", itemId)
      .order("created_at", { ascending: false })
  )
}
