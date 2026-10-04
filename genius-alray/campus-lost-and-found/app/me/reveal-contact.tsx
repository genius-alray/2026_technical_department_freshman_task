"use client"

import { useState, useTransition } from "react"
import { MapPinIcon, PhoneIcon } from "lucide-react"
import { toast } from "@/components/ui/toast"

import { Collapse } from "@/components/motion/primitives"
import { Button } from "@/components/ui/button"
import type { RevealedContact } from "@/lib/types"

import { revealContactAction } from "./actions"

/** 认领人按需揭晓拾主提供的联系方式 / 位置 */
export function RevealContact({ itemId }: { itemId: string }) {
  const [pending, startTransition] = useTransition()
  const [revealed, setRevealed] = useState<RevealedContact | null>(null)

  function run() {
    if (revealed) {
      setRevealed(null)
      return
    }
    startTransition(async () => {
      const result = await revealContactAction(itemId)
      if (result.ok) {
        setRevealed(result.data)
      } else {
        toast.add({ type: "error", title: result.message })
      }
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={run}
      >
        {pending ? "获取中…" : revealed ? "收起联系方式" : "查看联系方式/位置"}
      </Button>

      <Collapse open={revealed !== null}>
        {revealed ? (
          <div className="flex flex-col gap-1 rounded-xl bg-muted/60 px-3 py-2 text-sm">
            <p className="text-xs text-muted-foreground">
              拾主填写，请自行核实
            </p>
            {revealed.custody === "kept" ? (
              <p className="flex items-center gap-1.5">
                <PhoneIcon className="size-4 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">
                  {revealed.contact || "拾主未填写联系方式"}
                </span>
              </p>
            ) : (
              <>
                <p className="flex items-center gap-1.5">
                  <MapPinIcon className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 break-words">
                    {revealed.location_label || "拾主未填写位置描述"}
                  </span>
                </p>
                {typeof revealed.location_lat === "number" &&
                typeof revealed.location_lng === "number" ? (
                  <p className="text-xs text-muted-foreground">
                    坐标：{revealed.location_lat.toFixed(5)},{" "}
                    {revealed.location_lng.toFixed(5)}
                  </p>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </Collapse>
    </div>
  )
}
