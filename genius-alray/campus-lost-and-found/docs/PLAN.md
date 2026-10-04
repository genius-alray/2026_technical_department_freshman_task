# 实现计划（简化版）

> 需求细节见 docs/REQUIREMENTS.md。本文件描述怎么做：架构约定、里程碑、测试策略、分工与验收。

---

## 0. 本轮架构变更（重要）

需求大幅简化，以下全部**已删除**：答题验证、人工审核、标签体系、寻物启事与相似度匹配、草稿系统、
以及 CLAIM 相关组件。数据表由 9 张减为 5 张，RPC 由 14 个减为 5 个，AI 能力由「视觉+出题+判分」减为「只有视觉」。

同时**用户改判了一条安全要求**：上一版要求「从后端禁止获取全部物品列表」，现改为公开的失物墙。
防护重心因此从「行级不可见」转为「**列级保密**」——见 REQUIREMENTS 第 4 节。

---

## 0.1 第 2 轮：UI 简约化与动效（已完成）

目标：**操作尽可能少、每一屏尽可能空**。规范见 `docs/UI-DESIGN.md`，需求见 `docs/REQUIREMENTS.md` §3.5。

| 变更     | 内容                                                                                                                                            |
| -------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 导航     | **删除底部导航栏**（`components/nav/bottom-nav.tsx` 已移除）；全站唯一「我的」入口 = 首页右上角 `AppHeader showMe`                              |
| 一步一屏 | `/publish` 改为三步向导：**拍照 → 确认信息 → 怎么还**，每屏一个主按钮；进入第 2 屏自动识别                                                      |
| 一屏一段 | `/me` 用 Base UI Tabs 拆成「我的发布」/「我的认领」                                                                                             |
| 动效     | 引入 `motion`；统一出口 `components/motion/primitives.tsx`；`MotionProvider`（`reducedMotion="user"`）挂在根布局；`app/template.tsx` 做页面入场 |
| 视觉留档 | `docs/screenshots/`（Pixel 7 视口实拍，可用 `pnpm dev` 重新生成）                                                                               |

新增共享件：`components/nav/app-header.tsx`（`title / subtitle / backHref / onBack / backTestId / showMe / action`）、`components/motion/{primitives,motion-provider}.tsx`、`app/template.tsx`。

---

## 0.2 第 3 轮：拍照建议 + 全屏加载 + 内容居中（已完成）

| 变更       | 内容                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------- |
| 拍照建议   | 每拍完一张照片，AI 用 `vision.review` 判断这组照片能不能直接用；建议补拍时底部并排「继续拍照」+「下一步」，永不阻塞流程    |
| 全屏加载   | 新增 `LoadingOverlay`；**修掉一个真实 bug**——生成描述时骨架屏没有替换输入框，屏上出现两套「物品名称/物品描述」             |
| 内容居中   | 内容量不大的屏（第 1 屏无照片、第 3 屏、首页空态、`/me` 空态）用 `my-auto` 垂直居中（不要用 `justify-center`，小屏会裁顶） |
| 测试可观测 | playwright 的 webServer 给 mock 加了 `MOCK_AI_DELAY_MS=800`，否则「加载态」这种瞬时中间状态永远测不到                      |

AI 契约扩展：`VisionProvider` 新增 `review({ imageUrls }): Promise<PhotoAdvice>`，
schema 用字符串枚举 `verdict: ok | retake`（boolean 在 StepFun 的结构化输出上不够稳），
已用 `pnpm test:live` 实测：真实模型返回 `{"ok":false,"reason":"物品不完整，请退后拍全貌"}`。

---

## 0.3 第 4 轮：认领即归属（已完成）

| 变更       | 内容                                                                                                                             |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- |
| 状态机     | `item_status` 由 `published \| closed` 改为 **`published \| claimed \| withdrawn`**；`closed_at` → `claimed_at` + `withdrawn_at` |
| 认领即归属 | `create_pickup` 成功时把物品置为 `claimed`；已被别人认领 / 已撤单 → P0001；拾主认领自己的 → 42501；本人重复提交为更新            |
| 墙上可见   | 已认领的物品**仍留在失物墙**上并带「已认领」标签；RLS 行级条件由 `status = published` 改为 `status <> withdrawn`                 |
| 撤单       | `close_found_item` → **`withdraw_found_item`**，且仅 `status = published` 时允许（已被认领 → P0001）                             |
| 一屏       | 认领表单从详情页内联卡片改为**独立一屏** `/items/[id]/claim`                                                                     |
| 滑动       | 详情页图片支持左右滑动（motion `drag="x"` + 位移阈值切图），按钮/圆点断言接口全部保留                                            |
| 文案       | 全站「领取 → 认领」「标记已找回 → 撤单」                                                                                         |
| 错误提示   | `lib/db/types.ts` 改为**优先透出服务端 raise 的中文消息**（否则「该物品已被认领」会被兜底映射成「当前状态不允许该操作」）        |

## 0.4 第 5 轮：统一标题栏 + 扁平化 + 个人信息（已完成）

| 变更     | 内容                                                                                                                                         |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 标题栏   | `components/nav/title-bar.tsx` + `app/template.tsx` 统一提供「返回 + 标题」（sticky + 标题切换动画）；`components/nav/app-header.tsx` 已删除 |
| 个人信息 | `profiles.real_name / phone` + `lib/db/profiles.ts`；`/me/profile` 一屏填写；`create_pickup` 把认领用的姓名/手机号写回个人信息               |
| 认领确认 | 提交前必须过「诚信认领」对话框                                                                                                               |
| 拍照判断 | 由「每上传一张判断一次」改为「点下一步判断一次」，不通过用对话框给「继续拍照 / 仍然继续」                                                    |
| 反馈     | toast 改为**顶部居中**（Base UI 官方 top-center 变体）；富反馈用 Dialog                                                                      |
| 列表     | 「我的发布」「我的认领」卡片整卡点进详情页，不再内联认领信息                                                                                 |
| 认证页   | 登录/注册去掉 Card 容器，扁平居中                                                                                                            |
| 图片     | 详情页相册改为横向 scroll-snap 原生轮播（去掉 drag 与左右箭头）                                                                              |

---

## 1. 架构约定

### 1.1 写操作一律用 Server Actions

- 唯一 REST endpoint 是图片上传 `POST /api/upload`（Server Action 请求体上限 1MB，图片字节必须绕开）。
- 每个 action 都视为不可信入口：先 `getCurrentUser()` 鉴权，再用 zod 校验。
- 三个业务表对客户端**只有 SELECT 权限**，所有写入都经 SECURITY DEFINER RPC。

### 1.2 目录结构

    app/
      (auth)/login, signup          登录注册
      page.tsx                      失物墙（双列瀑布流）
      publish/                      发布招领（三步向导：拍照 → 确认 → 怎么还）
      items/[id]/                   物品详情 + 实名领取
      me/                           我的发布 / 我的领取
      me/items/[id]/pickups/        拾主查看领取人名单
      api/upload/route.ts           唯一 REST endpoint
    lib/
      types.ts                      类型与 AI 接口（Lead 冻结）
      validation/schemas.ts         zod schema
      db/{found-items,pickups,types}.ts
      ai/{index,mock,ai-sdk}.ts     只有 vision
      storage/{signed,validate}.ts
      supabase/{client,server,admin}.ts
    components/
      motion/{primitives,motion-provider}.tsx   动效统一出口（只准用，不准各自写）
      nav/app-header.tsx                        全站唯一的顶部栏（含「我的」入口）
      ui/**                                     shadcn 组件
    supabase/migrations/            5 个迁移
    tests/{unit,rls,e2e,live,helpers}/

### 1.3 数据访问纪律

- **禁止对 `found_items` 做星号 select**：`contact` 与 `location_*` 已被列级 REVOKE，会直接 42501。
- 查询统一走 `lib/db/` 包装或显式列，并有单测扫描源码防回归。
- `service_role` 只出现在 `lib/supabase/admin.ts`、`/api/upload` 与服务端读取私有列处。

### 1.4 Next.js 16 注意

- `proxy.ts` 在项目根目录（16 起替代 middleware），只做 session 刷新与乐观跳转；API 路由自行返回 401。
- `cookies()` 是异步的，必须 `await`。
- `allowedDevOrigins` 已配置，否则 127.0.0.1 访问时开发资源被拦、整站不 hydrate。

---

## 2. 里程碑

| M   | 目标                                                 | 完成判据                                      |
| --- | ---------------------------------------------------- | --------------------------------------------- |
| M0  | 环境与基线（本地 Supabase、依赖、测试骨架、docs）    | `pnpm test` 与 `pnpm build` 通过              |
| M1  | 数据层重写（5 表 + RLS + 5 RPC + 私有桶 + 类型生成） | `pnpm db:reset` 从零重放通过，schema 自检通过 |
| M2  | 契约冻结（types / validation / db / ai / storage）   | `pnpm typecheck` 对契约层为 0 错误            |
| M3  | 发布招领（拍照 → AI 名称/描述 → 电话或位置）         | E2E 场景 1、3 通过                            |
| M4  | 失物墙 + 详情 + 实名领取                             | E2E 场景 2、5 通过                            |
| M5  | 我的发布 / 我的领取 / 领取人名单                     | E2E 场景 4 通过                               |
| M6  | 测试与独立验证（新安全矩阵 + 单元 + E2E）            | `pnpm verify` 全绿                            |
| M7  | AI 真机验证与人工验收                                | `pnpm test:live` 通过 + 人类走查              |

---

## 3. 测试策略

| 层          | 命令             | 覆盖                                                                     |
| ----------- | ---------------- | ------------------------------------------------------------------------ |
| 单元 + 组件 | `pnpm test:unit` | mock 确定性、zod schema、错误码映射、源码纪律                            |
| 安全矩阵    | `pnpm test:rls`  | 联系方式/位置不可读、写权限只走 RPC、领取可见性、发布校验                |
| E2E         | `pnpm test:e2e`  | 发布 → 失物墙 → 详情 → 实名领取 → 揭晓 → 下架；页面无隐私泄露            |
| 真机 AI     | `pnpm test:live` | StepFun step-5-preview 的拍照识别可用（默认跳过，需 AI_PROVIDER=ai-sdk） |
| 全量        | `pnpm verify`    | 以上除 live 之外的全部                                                   |

### 安全测试矩阵（本轮重点）

1. 登录用户可读 published 物品的公开列。
2. **读 `contact / location_lat / location_lng / location_label` 必须 42501，星号 select 同样 42501。**
3. 未登录读 `found_items` 拿不到任何行。
4. 客户端对三张业务表没有任何写权限（insert/update/delete 全拒）。
5. `reveal_found_item_contact`：未领取时 42501；领取后与拾主本人可拿到。
6. `create_pickup`：未登录拒绝、格式非法 22023、物品已下架 P0001、重复提交是更新而非新增。
7. pickups 可见性：本人与拾主可见，无关第三人看不到。
8. 私有桶不可匿名或直接读取。
9. `publish_found_item`：路径前缀非本人 42501；张数越界/保管信息缺失 22023。
10. 源码中不存在对 `found_items` 的星号 select；客户端文件不 import admin client。

---

## 4. 分工（写作用域互不重叠）

**第 1 轮（数据层 + 功能）**

| 角色       | 写作用域                                                       |
| ---------- | -------------------------------------------------------------- |
| Lead       | supabase/migrations、lib/**、docs/**、proxy.ts、最终集成与终验 |
| ui-shell   | app/layout.tsx、app/me/**、components/nav/**、app/(auth)/**    |
| found-flow | app/publish/**、app/api/upload/**                              |
| lost-claim | app/page.tsx、app/items/**                                     |
| verifier   | tests/**、docs/VERIFICATION.md                                 |

**第 2 轮（UI 简约化 + 动效）**：Lead 先交付共享件（`components/motion/**`、`components/nav/app-header.tsx`、`app/template.tsx`、`app/layout.tsx`、删除底栏），再并行三个实现者，最后独立验证。

| 角色           | 写作用域                                                                                       | 交付                                                      |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Lead           | components/motion/**、components/nav/app-header.tsx、app/template.tsx、app/layout.tsx、docs/** | 动效原语、顶部栏、页面入场、规范与需求同步、终验          |
| publish-wizard | app/publish/**                                                                                 | 三步向导 + 步骤动效                                       |
| wall-detail    | app/page.tsx、app/items/**                                                                     | 首页「我的」入口、瀑布流入场、详情与领取动效              |
| me-auth        | app/me/**、app/(auth)/**                                                                       | 双标签页、卡片淡出、文案精简                              |
| verifier       | tests/**、docs/VERIFICATION.md                                                                 | 更新场景 1、新增场景 8/9、全量 verify + build、对抗式反证 |

---

## 5. 环境备忘（已在本机验证）

- 本机无 Docker；容器由 rootless podman 提供，`podman run` 直连可用。
- Supabase CLI 固定为项目 devDependency：`supabase@2.119.0`。
- `vector` 容器会 bind-mount `/var/run/docker.sock`，rootless 下不存在 → `pnpm db:start` 已内置排除参数。
- 启动：`pnpm db:start && pnpm db:env`；重置：`pnpm db:reset`；类型：`pnpm db:types`。
- AI：StepFun `step-5-preview` 配置在 `.env.local`；离线测试强制 mock。

---

## 6. 完成定义

- `pnpm verify` 全绿（typecheck + lint + unit + rls + e2e）。
- 安全测试矩阵 10 条全部通过。
- `pnpm test:live` 通过（真实 StepFun 模型）。
- 独立验证 agent 报告无阻塞项，且明确区分产品缺陷与测试自身缺陷。
- 人类以真实照片完整走查一遍发布 → 浏览 → 领取 → 下架。

第 2 轮追加：

- `pnpm build` 通过（Next 16 的构建会类型检查 `tests/**`）。
- 无底部导航栏；「我的」入口在首页右上角（按 boundingBox 位置断言，不是只断言存在）。
- 发布流程一屏只出现一件事（拍照屏不得有任何文本表单）；`/me` 同一时刻只有一段列表。
- `reducedMotion: "reduce"` 下主流程仍可完整走通（场景 9）。
