"use client"

import { useState } from "react"
import { AnimatePresence, motion } from "motion/react"
import type { PanInfo } from "motion/react"
import { ChevronLeftIcon, ChevronRightIcon, ImageIcon } from "lucide-react"

import { DURATION, EASE_OUT } from "@/components/motion/primitives"
import { cn } from "@/lib/utils"

const fade = { duration: DURATION.fast, ease: EASE_OUT }

/** 触发换图的位移 / 速度阈值 */
const SWIPE_DISTANCE = 60
const SWIPE_VELOCITY = 400

/** 详情页照片浏览：左右滑动（或点按钮）切换，切图用交叉淡化；E2E 可直接点按钮 */
export function ItemGallery({
  images,
  title,
}: {
  images: Array<{ path: string; url: string }>
  title: string
}) {
  const [index, setIndex] = useState(0)

  if (images.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-muted text-muted-foreground ring-1 ring-foreground/10">
        <ImageIcon className="size-8" aria-hidden />
      </div>
    )
  }

  const safeIndex = Math.min(index, images.length - 1)
  const current = images[safeIndex]
  const canSwipe = images.length > 1

  function handleDragEnd(info: PanInfo) {
    const forward =
      info.offset.x < -SWIPE_DISTANCE || info.velocity.x < -SWIPE_VELOCITY
    const backward =
      info.offset.x > SWIPE_DISTANCE || info.velocity.x > SWIPE_VELOCITY
    if (forward) {
      setIndex((prev) => Math.min(images.length - 1, prev + 1))
    } else if (backward) {
      setIndex((prev) => Math.max(0, prev - 1))
    }
  }

  // 只有多张照片才拖拽：松手即回弹，换图仍走 index state
  const dragProps = canSwipe
    ? {
        drag: "x" as const,
        dragConstraints: { left: 0, right: 0 },
        dragElastic: 0.15,
        dragMomentum: false,
        onDragEnd: (_event: unknown, info: PanInfo) => handleDragEnd(info),
      }
    : {}
  const dragCursor = canSwipe ? "cursor-grab active:cursor-grabbing" : ""

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-muted ring-1 ring-foreground/10">
        <AnimatePresence initial={false}>
          {current.url ? (
            <motion.img
              key={current.path}
              src={current.url}
              alt={title}
              draggable={false}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={fade}
              className={cn(
                "absolute inset-0 h-full w-full object-cover select-none",
                dragCursor
              )}
              {...dragProps}
            />
          ) : (
            <motion.div
              key={"no-image-" + safeIndex}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0 }}
              transition={fade}
              className={cn(
                "absolute inset-0 flex items-center justify-center text-muted-foreground select-none",
                dragCursor
              )}
              {...dragProps}
            >
              <ImageIcon className="size-8" aria-hidden />
            </motion.div>
          )}
        </AnimatePresence>

        {images.length > 1 ? (
          <>
            <button
              type="button"
              aria-label="上一张照片"
              data-testid="gallery-prev"
              disabled={safeIndex === 0}
              onClick={() => setIndex((prev) => Math.max(0, prev - 1))}
              className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white disabled:opacity-40"
            >
              <ChevronLeftIcon className="size-5" aria-hidden />
            </button>
            <button
              type="button"
              aria-label="下一张照片"
              data-testid="gallery-next"
              disabled={safeIndex >= images.length - 1}
              onClick={() =>
                setIndex((prev) => Math.min(images.length - 1, prev + 1))
              }
              className="absolute top-1/2 right-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-black/45 text-white disabled:opacity-40"
            >
              <ChevronRightIcon className="size-5" aria-hidden />
            </button>
          </>
        ) : null}
      </div>

      {images.length > 1 ? (
        <div className="flex items-center justify-center gap-2">
          {images.map((image, imageIndex) => (
            <button
              key={image.path}
              type="button"
              aria-label={"第 " + (imageIndex + 1) + " 张照片"}
              aria-current={imageIndex === safeIndex}
              data-testid={"gallery-dot-" + imageIndex}
              onClick={() => setIndex(imageIndex)}
              className={cn(
                "size-2 rounded-full transition-colors",
                imageIndex === safeIndex ? "bg-foreground" : "bg-foreground/25"
              )}
            />
          ))}
          <span
            className="ml-1 text-xs text-muted-foreground"
            data-testid="gallery-counter"
          >
            {safeIndex + 1}/{images.length}
          </span>
        </div>
      ) : null}
    </div>
  )
}
