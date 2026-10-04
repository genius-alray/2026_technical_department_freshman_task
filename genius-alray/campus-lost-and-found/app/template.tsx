import { PageTransition } from "@/components/motion/primitives"

/** 每次导航都重新挂载：统一做一次轻量的页面入场。 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <PageTransition>{children}</PageTransition>
}
