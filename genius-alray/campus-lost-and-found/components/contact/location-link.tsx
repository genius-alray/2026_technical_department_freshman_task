"use client"

import * as React from "react"
import { MapPinIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { amapMarkerUrl, amapSearchUrl } from "@/lib/geo"
import { cn } from "@/lib/utils"

/**
 * 全站统一的位置展示：**定位图标 + 位置文字，蓝色**。
 * 点击弹二次确认，确认后用高德地图打开（有坐标就标记点，只有描述就搜索）。
 * 有坐标时会先把 WGS84 转成 GCJ-02，见 `lib/geo.ts`。
 */
export function LocationLink({
  label,
  lat,
  lng,
  className,
  testId = "location-link",
  children,
}: {
  label?: string | null
  lat?: number | null
  lng?: number | null
  className?: string
  testId?: string
  children?: React.ReactNode
}) {
  const [open, setOpen] = React.useState(false)
  const hasCoords = typeof lat === "number" && typeof lng === "number"
  const text = label?.trim()
    ? label
    : hasCoords
      ? lat.toFixed(5) + ", " + lng.toFixed(5)
      : "未填写位置"

  const url = hasCoords
    ? amapMarkerUrl({ lat, lng, label: label ?? undefined })
    : label
      ? amapSearchUrl(label)
      : ""

  return (
    <>
      <button
        type="button"
        data-testid={testId}
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex max-w-full min-w-0 items-start gap-1.5 text-left text-blue-600 underline-offset-4 hover:underline dark:text-blue-400",
          className
        )}
      >
        <MapPinIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        <span className="min-w-0 break-words">{children ?? text}</span>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          showCloseButton={false}
          className="max-w-xs gap-4"
          data-testid="map-open-dialog"
        >
          <DialogHeader>
            <DialogTitle>在地图中查看</DialogTitle>
            <DialogDescription>{text}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              data-testid="map-open-cancel"
              onClick={() => setOpen(false)}
            >
              取消
            </Button>
            {url ? (
              <Button
                data-testid="map-open-confirm"
                nativeButton={false}
                render={<a href={url} target="_blank" rel="noreferrer" />}
                onClick={() => setOpen(false)}
              >
                打开高德地图
              </Button>
            ) : null}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
