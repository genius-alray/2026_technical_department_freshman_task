# 校园失物招领

手机端优先的校园失物招领站：拍照发布拾到的物品、在公开失物墙上浏览、认领时留下联系方式。
匿名可看失物墙，发布与认领需要登录（手机号 + 密码）。

技术栈：Next.js 16（App Router / Server Actions）、React 19、TypeScript、Supabase（Postgres / Auth / Storage）、
Tailwind CSS 4、Base UI（shadcn 组件，style `base-maia`）。AI 只用来读照片：识别物品名称与描述，
并给出「通过 / 建议补拍」建议，经 Vercel AI SDK 以 OpenAI 兼容协议接入。
PWA：可添加到主屏幕，带离线页。

## 本地跑起来

前置：Node 22、pnpm、可用的容器运行时（本机是 rootless podman）；Supabase CLI 已是项目 devDependency。

```bash
pnpm install
pnpm db:start     # 起本地 Supabase（已排除 vector 等用不到的容器）
pnpm db:env       # 从 supabase status 生成 .env.local
pnpm db:reset     # 重放 supabase/migrations 下的迁移
pnpm dev          # http://localhost:3000
```

`pnpm db:env` 会写 `.env.local`（已被忽略，模板见 `.env.example`）。
AI 默认 `AI_PROVIDER=mock`，不联网也能走完发布与浏览。

账号：注册填真实姓名 + 手机号 + 密码；内部把手机号映射成
`<手机号>@$NEXT_PUBLIC_AUTH_EMAIL_DOMAIN` 的内部邮箱，不发短信验证码（见 `lib/env.ts` 的 `phoneToEmail`）。

## 常用脚本

| 命令                                               | 作用                                           |
| -------------------------------------------------- | ---------------------------------------------- |
| `pnpm dev`                                         | 开发服务器（:3000）                            |
| `pnpm build` / `pnpm start`                        | 生产构建 / 启动；构建会一并类型检查 `tests/**` |
| `pnpm typecheck` / `pnpm lint`                     | 静态检查                                       |
| `pnpm test`                                        | typecheck + lint + 单元与组件测试              |
| `pnpm test:rls`                                    | 安全矩阵（列级保密、RPC 边界、客户端写入拒绝） |
| `pnpm test:e2e`                                    | Playwright（Pixel 7，强制 `AI_PROVIDER=mock`） |
| `pnpm verify`                                      | 以上除 live 之外的全部                         |
| `pnpm test:live`                                   | 真实模型视觉识别，需要网络与 key               |
| `pnpm db:start` / `pnpm db:stop` / `pnpm db:reset` | 本地 Supabase 生命周期                         |
| `pnpm db:env`                                      | 由本地 Supabase 生成 `.env.local`              |
| `pnpm db:types`                                    | 由本地库生成 `lib/database.types.ts`           |
| `pnpm db:status` / `pnpm db:check`                 | 查看状态 / 探测数据库连通性                    |
| `pnpm db:prune-drafts`                             | 回收被放弃的发布草稿（登记行 + 存储对象）；默认 dry-run，`--apply` 才删 |

测试前置：`pnpm db:start && pnpm db:env && pnpm db:reset`。
E2E 要求 3000 端口空闲——配置里是 `reuseExistingServer: false`，宁可端口冲突报错，也不复用来源不明的 dev server。

## 环境变量

变量名与默认值以 `lib/env.ts` 为准，模板见 `.env.example`。
接真实模型时填 `AI_API_KEY` 与 `AI_MODEL`；`AI_BASE_URL` 留空时代码回落到
`https://api.deepseek.com/v1`（`lib/ai/ai-sdk.ts`）。

## 文档

- [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) —— 需求与安全模型
- [docs/PLAN.md](docs/PLAN.md) —— 架构约定、里程碑、测试策略
- [docs/UI-DESIGN.md](docs/UI-DESIGN.md) —— UI 规范与 testid 清单
- [docs/VERIFICATION.md](docs/VERIFICATION.md) —— 验证记录与已知限制
- [docs/SKILL-AUDIT.md](docs/SKILL-AUDIT.md) —— shadcn 技能合规审计

## 目录

    app/         页面与 Server Actions：(auth) 登录注册、(wall) 失物墙、publish、items、me、api/upload
    components/  nav 标题栏、motion 动效、contact 电话/位置、claim、media、pwa、ui（shadcn）
    lib/         db 数据访问、ai 提供方、supabase 客户端、validation zod schema、geo、env
    supabase/    migrations（6 个）与本地配置
    tests/       unit、component、rls、e2e、live
    docs/        需求、计划、UI 规范、验证记录、技能审计
