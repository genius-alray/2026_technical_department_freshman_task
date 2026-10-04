# 实现计划（简化版）

> 需求细节见 docs/REQUIREMENTS.md。本文件描述怎么做：架构约定、里程碑、测试策略、分工与验收。

---

## 0. 变更历史（压缩版）

数据模型经过多轮简化，最终形态如下（细节以 `docs/REQUIREMENTS.md` 与 `docs/UI-DESIGN.md` 为准）：

| 轮次 | 主要变化                                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 数据层重写：5 张表 + RLS + RPC + 私有桶；**取消**答题验证、人工审核、标签体系、寻物启事、草稿、相似度匹配                          |
| 2    | UI 简约化：删掉底部导航栏、「我的」移到首页右上角、一步一屏、引入 `motion` 动效词汇                                                |
| 3    | 拍照后 AI 给「通过 / 建议补拍」建议；AI 写描述时全屏加载（修掉「骨架屏 + 输入框」两套界面）；内容量小的屏居中                      |
| 4    | **认领即归属**：状态机 `published \| claimed \| withdrawn`；已认领仍留在墙上；拾主只能在被认领前撤单；相册改 scroll-snap           |
| 5    | 标题栏统一到 layout；`/me/profile` 个人信息页；认领前「诚信认领」二次确认；toast 移到顶部；登录注册扁平化                          |
| 6    | 电话/位置统一组件（蓝色 + 二次确认 + `tel:` / 高德）；认领信息独立一屏；WGS84 → GCJ-02                                             |
| 7    | **账号体系改为手机号**：注册要姓名+手机号+同意条款，登录用手机号+密码；未登录可看信息流；`profiles` 去掉 username                  |
| 8    | 发布流程精简（去步骤条、上限 3 张、「添加照片」卡片、领取方式卡片化）；危险操作 danger + 二次确认；AI 切 DeepSeek 并修正结构化输出 |
| 9    | 认领确认后**立刻跳**认领信息；首页标题「失物招领墙」；登录/注册页「随便看看」；「领错了？」文案；测试与文档收敛（16 → 10 个 e2e spec、4 份文档压成当前版） |

安全模型的一处关键改判：早先要求「禁止获取全部物品列表」，现改为**公开的失物墙**，
防护重心从「行级不可见」转为「**列级保密**」（`contact` / `location_*` 列级 REVOKE），见 REQUIREMENTS 第 4 节。

---

## 1. 架构约定

### 1.1 写操作一律用 Server Actions

- 唯一 REST endpoint 是图片上传 `POST /api/upload`（Server Action 请求体上限 1MB，图片字节必须绕开）。
- 每个 action 都视为不可信入口：先 `getCurrentUser()` 鉴权，再用 zod 校验。
- 三个业务表对客户端**只有 SELECT 权限**，所有写入都经 SECURITY DEFINER RPC。

### 1.2 目录结构

    app/
      (auth)/login, signup          手机号登录 / 注册（姓名 + 手机号 + 同意条款）
      page.tsx                      失物墙（公开双列瀑布流）
      publish/                      发布招领（四屏：拍照 → 确认信息 → 怎么还 → 详细设置）
      items/[id]/                   物品详情（相册轮播 + 认领入口）
      items/[id]/claim/             认领信息（指引 + 拾主联系方式/位置）
      me/                           我的（头像/姓名/手机号 + 我的发布 / 我的认领）
      me/profile/                   我的信息（真实姓名 + 手机号）
      me/items/[id]/pickups/        拾主查看认领人名单
      api/upload/route.ts           唯一 REST endpoint
    lib/
      types.ts                      类型与 AI 接口（Lead 冻结）
      validation/schemas.ts         zod schema
      geo.ts                        WGS84 → GCJ-02 + 高德 URL
      db/{found-items,pickups,profiles,types}.ts
      ai/{index,mock,ai-sdk}.ts     vision.analyze + vision.review
      storage/{signed,validate}.ts
      supabase/{client,server,admin}.ts
    components/
      motion/{primitives,motion-provider}.tsx   动效统一出口（只准用，不准各自写）
      nav/title-bar.tsx                         全站唯一的标题栏（含首页右上角「我的」入口）
      ui/**                                     shadcn 组件
    supabase/migrations/            5 个迁移（extensions / core / rls_and_grants / rpcs / storage）
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
| M1  | 数据层重写（5 表 + RLS + 7 RPC + 私有桶 + 类型生成） | `pnpm db:reset` 从零重放通过，schema 自检通过 |
| M2  | 契约冻结（types / validation / db / ai / storage）   | `pnpm typecheck` 对契约层为 0 错误            |
| M3  | 发布招领（拍照 → AI 名称/描述 → 怎么还 → 详细设置）  | `01-publish-wizard` 通过                     |
| M4  | 失物墙 + 详情 + 认领                                 | `02-claim-flow`、`08-item-detail` 通过      |
| M5  | 我的发布 / 我的认领 / 认领人名单                     | `03-multi-claim`、`05-me` 通过              |
| M6  | 测试与独立验证（新安全矩阵 + 单元 + E2E）            | `pnpm verify` 全绿                            |
| M7  | AI 真机验证与人工验收                                | `pnpm test:live` 通过 + 人类走查              |

---

## 3. 测试策略

| 层          | 命令             | 覆盖                                                                     |
| ----------- | ---------------- | ------------------------------------------------------------------------ |
| 单元 + 组件 | `pnpm test:unit` | mock 确定性、zod schema、错误码映射、源码纪律                            |
| 安全矩阵    | `pnpm test:rls`  | 列级保密、写权限只走 RPC、认领可见性与多人认领、发布校验（13 条见 VERIFICATION §2） |
| E2E         | `pnpm test:e2e`  | 10 个按功能划分的 spec：发布向导 / 认领 / 多人认领 / 撤单与撤回 / 我的 / 列级隐私 / 失物墙 / 相册 / reduced-motion / 标题栏 |
| 真机 AI     | `pnpm test:live` | DeepSeek `deepseek-flash` 的拍照识别可用（默认跳过，需 AI_PROVIDER=ai-sdk） |
| 全量        | `pnpm verify`    | 以上除 live 之外的全部                                                   |

### 安全测试矩阵

完整矩阵（13 条，含行级/列级/写入/存储/源码纪律）见 [`docs/VERIFICATION.md`](./VERIFICATION.md) §2；这里不重复，
避免两份清单随实现漂移。刷新矩阵时改 VERIFICATION 一处。

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

**第 2 轮（UI 简约化 + 动效）**：Lead 先交付共享件（`components/motion/**`、`components/nav/title-bar.tsx`、`app/template.tsx`、`app/layout.tsx`、删除底栏），再并行三个实现者，最后独立验证。

| 角色           | 写作用域                                                                                       | 交付                                                      |
| -------------- | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Lead           | components/motion/**、components/nav/title-bar.tsx、app/template.tsx、app/layout.tsx、docs/** | 动效原语、标题栏、页面入场、规范与需求同步、终验          |
| publish-wizard | app/publish/**                                                                                 | 三步向导 + 步骤动效                                       |
| wall-detail    | app/page.tsx、app/items/**                                                                     | 首页「我的」入口、瀑布流入场、详情与领取动效              |
| me-auth        | app/me/**、app/(auth)/**                                                                       | 双标签页、卡片淡出、文案精简                              |
| verifier       | tests/**、docs/VERIFICATION.md                                                                 | 更新场景 1、新增场景 8/9、全量 verify + build、对抗式反证 |

**第 7–9 轮（账号改手机号 / UI 精简 / 文档与测试收敛）**：由 Lead 单人完成（改动横跨迁移、页面、测试与文档，
拆成并行写作用域反而会产生互相覆盖；独立验证仍由 `pnpm verify` + `pnpm build` + `pnpm test:live` 承担）。
测试从「按轮次累积的 16 个 spec」收敛为**按功能划分的 10 个 spec**：删掉重复的发布/认领主链路，
只保留每类行为的一条主链路 + 各自的特有断言。

---

## 5. 环境备忘（已在本机验证）

- 本机无 Docker；容器由 rootless podman 提供，`podman run` 直连可用。
- Supabase CLI 固定为项目 devDependency：`supabase@2.119.0`。
- `vector` 容器会 bind-mount `/var/run/docker.sock`，rootless 下不存在 → `pnpm db:start` 已内置排除参数。
- 启动：`pnpm db:start && pnpm db:env`；重置：`pnpm db:reset`；类型：`pnpm db:types`。
- AI：DeepSeek `deepseek-flash`（`AI_BASE_URL=https://api.deepseek.com/v1`）配置在 `.env.local`；离线测试强制 mock。

---

## 6. 完成定义

- `pnpm verify` 全绿（typecheck + lint + unit + rls + e2e）。
- 安全测试矩阵（VERIFICATION §2，13 条）全部通过。
- `pnpm test:live` 通过（真实 DeepSeek 模型）。
- 独立验证 agent 报告无阻塞项，且明确区分产品缺陷与测试自身缺陷。
- 人类以真实照片完整走查一遍发布 → 浏览 → 认领 → 撤单。

第 2 轮追加：

- `pnpm build` 通过（Next 16 的构建会类型检查 `tests/**`）。
- 无底部导航栏；「我的」入口在首页右上角（按 boundingBox 位置断言，不是只断言存在）。
- 发布流程一屏只出现一件事（拍照屏不得有任何文本表单）；`/me` 同一时刻只有一段列表。
- `reducedMotion: "reduce"` 下主流程仍可完整走通（`09-reduced-motion.spec.ts`）。
