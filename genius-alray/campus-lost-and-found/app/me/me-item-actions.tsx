"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { UndoIcon } from "lucide-react"
import { toast } from "@/components/ui/toast"

import { Button } from "@/components/ui/button"

import { withdrawItemAction } from "./actions"
import { useMeItemClose } from "./me-item-shell"

/** 拾主操作：撤单（仅未被认领时可用）。反馈统一走 Base UI toast（components/ui/toast）。 */
export function MeItemActions({ itemId }: { itemId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  // 卡片外层（MeItemShell）注册的淡出回调；不在列表里时为 null
  const closeCard = useMeItemClose()

  function run() {
    startTransition(async () => {
      const result = await withdrawItemAction(itemId)
      if (result.ok) {
        toast.add({ type: "success", title: result.message })
        closeCard?.()
        router.refresh()
      } else {
        toast.add({ type: "error", title: result.message })
      }
    })
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={run}
    >
      <UndoIcon aria-hidden />
      撤单
    </Button>
  )
}
