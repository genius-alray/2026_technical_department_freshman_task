import type { Metadata, Viewport } from "next"
import { Geist_Mono, Inter } from "next/font/google"

import "./globals.css"
import { MotionProvider } from "@/components/motion/motion-provider"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toast"
import { cn } from "@/lib/utils"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "校园失物招领",
  description: "拍照发布捡到的物品，浏览失物墙，留下领取信息找回失物。",
}

// 移动端优先：锁定 1:1 缩放，避免 412px 视口出现横向缩放
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="zh-CN"
      suppressHydrationWarning
      className={cn(
        "antialiased",
        fontMono.variable,
        "font-sans",
        inter.variable
      )}
    >
      <body>
        <ThemeProvider>
          {/* Base UI 的 Toaster 同时是 Provider，必须包裹整棵树 */}
          <Toaster>
            {/* MotionProvider：系统「减少动态效果」时全站动效自动退化 */}
            <MotionProvider>
              <div className="mx-auto flex min-h-svh w-full max-w-md flex-col">
                <main className="flex min-w-0 flex-1 flex-col">{children}</main>
              </div>
            </MotionProvider>
          </Toaster>
        </ThemeProvider>
      </body>
    </html>
  )
}
