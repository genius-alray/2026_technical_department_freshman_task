import Link from "next/link"
import { ChevronLeftIcon, UserRoundIcon } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * 顶部栏：标题 + 可选返回 + 可选右上角动作。
 * 全站唯一的导航入口在首页右上角的「我的」，没有底部导航栏。
 */
export function AppHeader({
  title,
  subtitle,
  backHref,
  backLabel = "返回",
  backTestId,
  onBack,
  showMe = false,
  action,
  className,
}: {
  title: string
  subtitle?: string
  backHref?: string
  backLabel?: string
  backTestId?: string
  /** 客户端自定义返回行为（例如多步向导退回上一步），优先级高于 backHref */
  onBack?: () => void
  showMe?: boolean
  action?: React.ReactNode
  className?: string
}) {
  const backClassName =
    "-ml-2 flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"

  return (
    <header className={cn("flex min-w-0 items-center gap-3", className)}>
      {onBack ? (
        <button
          type="button"
          aria-label={backLabel}
          data-testid={backTestId}
          onClick={onBack}
          className={backClassName}
        >
          <ChevronLeftIcon className="size-5" aria-hidden />
        </button>
      ) : backHref ? (
        <Link
          href={backHref}
          aria-label={backLabel}
          data-testid={backTestId}
          className={backClassName}
        >
          <ChevronLeftIcon className="size-5" aria-hidden />
        </Link>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <h1 className="truncate font-heading text-lg font-semibold tracking-tight">
          {title}
        </h1>
        {subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      {action}

      {showMe ? (
        <Link
          href="/me"
          aria-label="我的"
          data-testid="me-entry"
          title="我的"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted text-foreground transition-colors hover:bg-accent active:scale-95"
        >
          <UserRoundIcon className="size-5" aria-hidden />
        </Link>
      ) : null}
    </header>
  )
}
