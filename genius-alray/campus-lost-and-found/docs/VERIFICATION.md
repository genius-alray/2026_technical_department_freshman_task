# 独立验证报告（verifier · 简化架构）

> 验证者：独立验证 agent（只写 tests/** 与本文件，不修改产品代码）
> 契约依据：docs/REQUIREMENTS.md（简化版：拍照 → AI 名称/描述 → 电话或位置；公开失物墙；实名领取）
> 本轮已删除：答题验证、人工审核、标签体系、寻物启事、草稿、相似度匹配

---

## 1. 验证环境

| 项          | 值                                                                                                                   |
| ----------- | -------------------------------------------------------------------------------------------------------------------- |
| 应用        | Next.js 16.3.6（App Router / Turbopack）+ React 19 + Tailwind v4                                                     |
| 数据库      | 本地 Supabase（podman）：Postgres 127.0.0.1:54322，REST 127.0.0.1:54321                                              |
| 移动端视口  | Playwright mobile-chrome = Pixel 7（412 x 915）                                                                      |
| Node        | v22.23.1                                                                                                             |
| AI provider | 离线基线强制 mock（tests/setup.ts、playwright.config.ts）；真实模型仅 pnpm test:live                                 |
| E2E server  | 仓库根 playwright.config.ts，baseURL http://localhost:3000，reuseExistingServer=false（避免复用来源不明的旧 server） |
| 数据隔离    | 随机后缀账号 + 随机存储路径；结束删除用户（级联物品/图片/领取）并清理私有桶对象                                      |

复现命令：

    pnpm test:unit                       # 5 files / 35 tests
    pnpm test:rls                        # 11 files / 66 tests
    pnpm test:e2e                        # 7 tests（Pixel 7）
    pnpm test:live                       # 真实模型（仅 AI_PROVIDER=ai-sdk）
    pnpm exec eslint tests --max-warnings=0

---

## 2. 结论总览

| 层          | 命令                                                      | 结果                                                                                              |
| ----------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| 安全矩阵    | pnpm test:rls                                             | **12 files / 72 tests 全绿**（第 3+4 轮后，含认领即归属 / 撤单状态机）                            |
| 单元 + 组件 | pnpm test:unit                                            | **5 files / 40 tests 全绿**（含 review 契约与中文错误透传）                                       |
| E2E         | pnpm test:e2e                                             | **18 passed（1.6m）**：场景 1-13（含认领独立一屏、认领即归属、撤单、相册滑动、拍照建议/全屏加载） |
| 静态检查    | eslint --max-warnings=0 / tsc --noEmit / prettier --check | 0 error / 0 warning；tests/** 对 tsc 0 错误                                                       |
| 全量验收    | pnpm verify                                               | **EXIT=0**（typecheck + lint + unit 40 + rls 72 + e2e 18）                                        |
| 生产构建    | pnpm build                                                | **EXIT=0**，Compiled successfully                                                                 |
| 真实模型    | pnpm test:live                                            | **3 passed / 0 failed（EXIT=0，44s）**，StepFun step-5-preview                                    |

产品缺陷：历史 1 个（D-1，已修复复验）+ 契约变更 1 项（C-1，已被回归覆盖）；
第 3+4 轮新发现 1 个产品侧竞态（D-2，认领成功整屏对勾被服务端重定向提前打断，见 §9.4）。
第 2 轮 UI 改造的独立验证见 §8；第 3+4 轮见 §9。

> 说明：§5 的「7 passed」是第 2 轮改造前的稳定性证据；§8 是第 2 轮（12 passed）；§9 是最新一轮（18 passed）。

---

## 3. 安全矩阵（tests/rls）

### 矩阵 1/3：公开浏览的行级可见性（01-public-read，7 条）

- published 物品的公开列（id/owner_id/title/description/custody/status/时间戳）登录用户可读并取到数据；
  图片记录可读；集合查询可用（证明「公开失物墙」成立）
- 他人看不到已下架物品；owner 自己看得到
- anon 读 found_items / found_item_images 拿不到任何行（表级权限已撤）

### 矩阵 2：列级保密（02-column-privacy，6 条）—— 本轮最关键

- contact / location_lat / location_lng / location_label：owner 与他人查询均 **42501**，data 为 null
- `select("*")` 同样 42501（owner / 其他登录用户 / anon 三视角）——星号无法绕过列级权限
- 公开列查询正常，且返回对象里不含任何机密键
- 前提校验：service_role oracle 确认这些列在库里确有值（排除「没值所以读不到」的假通过）

### 矩阵 4：客户端零写权限（03-client-write-denied，5 条）

- found_items / found_item_images / pickups 的 insert / update / delete 全部 42501（含 anon）
- 断言这些尝试之后数据库未被改动（标题、状态、图片数不变）

### 矩阵 5：揭晓授权（04-reveal，7 条）

- anon 被拒；**未提交领取记录的第三人 42501**；
- 提交领取记录后同一第三人可取得，且与库中真实值一致（三方视角，按 Lead 更正后的口径）；
- 拾主本人无需领取记录即可取得（对照组）；
- 一个物品的领取记录不能解锁另一个物品；
- 物品下架后，已领取的人与拾主仍可回看（对应「我的领取」）

### 矩阵 6：create_pickup（05-create-pickup，8 条）

- anon 被拒；姓名 1 字 / 21 字 → 22023；手机号含字母 / 过短 / 过长 → 22023；`+86 138-0013-8000` 通过
- 同一人重复提交返回**同一个 id**、行数不增加、姓名与手机号被更新（unique(found_item_id, picker_id) 生效）
- 同一物品可被不同人分别领取；已下架 → P0001；不存在 → P0002

### 矩阵 7：领取记录可见性（06-pickups-visibility，6 条）

- 领取人本人可见自己的记录；看不到别人的记录
- 物品 owner 可见该物品全部记录，且列表只含自己物品的记录
- 无关第三人 0 行；anon 0 行

### 矩阵 8：私有桶（07-storage-privacy，6 条）

- 匿名与 authenticated 直接 GET 对象均 ≥400；public URL 路径同样不可读
- 匿名/authenticated 无法签发签名 URL；service_role 签发的 URL 能读回同一份字节
- 匿名/他人 list 桶为空；客户端直传被拒（无写入策略）

### 矩阵 9：发布校验（08-publish-validation，8 条）

- anon 被拒；照片路径前缀不是本人（`uidX/`、无斜杠、混入他人路径）→ 42501
- 0 张 / 超过 max_photos(5) → 22023；kept 无联系方式或 <5 字 → 22023；in_place 无坐标且无位置描述 → 22023
- 名称 0/61 字、描述 0/601 字 → 22023
- 合法发布：status=published、contact 落库、照片 position 依次 0..n-1 且路径与入参一致
- in_place 仅位置描述 / 仅坐标两种分支均可发布，另一侧为 null

### 矩阵 10：源码纪律（09-discipline，5 条）

- 受保护表（found_items / found_item_images / pickups）不存在星号 select
- "use client" 文件不引用 `@/lib/supabase/admin`、不出现 createAdminClient / SERVICE_ROLE
- 引用 admin client 的文件均在服务端上下文（admin.ts / api 路由 / use server / server-only）
- admin.ts 带 server-only 守卫；不存在旧式 middleware.ts

### 附加 A：RPC 契约守卫（10-rpc-contract，6 条）

> PostgREST 按请求体里出现的参数名匹配函数：可选参数若无 DEFAULT，调用方省略键就会得到 PGRST202（本轮真实翻车点 D-1）。

- get_app_config() 无参调用成功；publish_found_item 只给 title/description/custody → 业务错误 22023 而非 PGRST202
- create_pickup / close_found_item / reveal_found_item_contact 只给必填参数 → P0002 而非 PGRST202
- **直接调用 lib/db 的 publishItem()** 发布 kept 与 in_place 各一条成功（夹具与断言都走产品封装，防止契约漂移）

### 附加 B：我的查询必须按调用者收窄（11-my-queries，2 条）

- `listMyItems(client, ownerId)` 只返回自己的物品（不传/传错 id 会看到他人 published 行，RLS 公开可读后的风险点）
- `listMyPickups(client, pickerId)` 只返回自己提交的领取；owner 视角用 `listItemPickups(client, itemId)` 看全部

---

## 4. 单元与组件（tests/unit，35 条）

| 覆盖点             | 结论 | 证据                                                                                                                                                                                                                     |
| ------------------ | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 视觉 mock 确定性   | 通过 | 同输入两次结果相同（含跨实例）；仅签名 token 不同结果相同；照片顺序无关；不同输入得到不同结果（非常量）                                                                                                                  |
| 视觉 mock 输出洁净 | 通过 | 600 组输入：title/description 非空、无 undefined、无 [object Object]、长度 ≤60/≤600，描述含「照片共 N 张」                                                                                                               |
| publishItemSchema  | 通过 | kept 无联系方式 / 4 字失败；in_place 无坐标且无描述失败；0 张与 6 张失败、1 与 5 张通过；名称 61 字、描述 601 字失败；custody 非法失败                                                                                   |
| pickupSchema       | 通过 | 姓名 1/21 字失败；手机号含字母/过短/过长失败；`+86 138-0013-8000` 通过；itemId 非 uuid 失败                                                                                                                              |
| 账号与上传元数据   | 通过 | 用户名小写化与字符集；两次密码不一致失败；uploadMetaSchema 要求 uuid                                                                                                                                                     |
| lib/db 错误映射    | 通过 | 42501/P0001/P0002/22023 → 中文；未知码透传；null → 未知错误；unwrap / unwrapMaybe 语义                                                                                                                                   |
| lib/db 真实封装    | 通过 | createPickup 不存在物品 → 记录不存在；revealContact 未领取 → 没有权限执行该操作；publishItem 非法 → 参数不合法；closeItem 非 owner → 42501；getItem 未命中 → null；listPublishedItems / listItemPickups / closeItem 正常 |

---

## 5. E2E（tests/e2e，Pixel 7，7/7 通过）

**稳定性证据（加固后连续 3 次完整运行）**：

| 次数    | 结果                | 耗时  | 退出码 |
| ------- | ------------------- | ----- | ------ |
| 第 1 次 | 7 passed / 0 failed | 27.4s | 0      |
| 第 2 次 | 7 passed / 0 failed | 27.1s | 0      |
| 第 3 次 | 7 passed / 0 failed | 27.1s | 0      |

命令：`pnpm test:e2e`（仓库根 config；每次由 Playwright 自起 dev server，reuseExistingServer=false）。

| #   | 场景                                                                       | 结论 | 关键断言                                                                                                                                                                             |
| --- | -------------------------------------------------------------------------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 注册 → /publish 上传 2 张 → 识别（mock）→ 编辑名称 → 代为保管填电话 → 发布 | 通过 | 上传计数 1/5→2/5；识别后 #title/#description 非空；发布后回到失物墙且卡片出现；DB：published + custody=kept + contact 落库 + 2 张照片；owner 详情页有 item-owner-notice 且无领取入口 |
| 2   | 公开浏览 → 详情不可见电话 → 实名领取后立即揭晓                             | 通过 | 卡片有图片、名称、描述；详情页正文**不含**真实电话（service_role oracle 取真值反证）；领取后 reveal-contact 含真实电话且刷新后仍在；物品状态仍 published                             |
| 3   | 拾主查看领取人名单                                                         | 通过 | 领取人经 UI 提交；拾主 /me → /me/items/[id]/pickups 看到「王五」与「13700137000」以及「领取人（1）」                                                                                 |
| 4   | 拾主「标记已找回」                                                         | 通过 | 标记后墙上该卡 count=0；owner 详情页显示已找回且无 pickup-open；他人访问该物品详情返回 **404**（RLS 隐藏已下架物品）                                                                 |
| 5   | 留在原地分支                                                               | 通过 | 详情页正文不含位置描述；领取后 reveal-location 含「图书馆 3 楼自习区靠窗第三排」                                                                                                     |
| 6   | 第二账号会话直连 PostgREST                                                 | 通过 | 公开列 200 且返回对象不含 contact；contact/location_lat/location_lng/location_label 与 `select=*` 均 **42501 且非 404**；按 id 精确取机密列同样 42501；私有桶对象直连不可读          |
| 7   | 失物墙分页                                                                 | 通过 | 首屏看不到最旧的一条；点「加载更多」后出现（每页 app_config.page_size=20）                                                                                                           |

### 三条关键不变量的覆盖位置

| 不变量                                    | 覆盖                                                                                                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| a) 列表与详情页不出现拾主电话与位置       | 场景 2（电话）、场景 5（位置）：先用 service_role 读出真实值，再断言页面正文不含该值；矩阵 2 另有 DB 层 42501 |
| b) 领取后立即揭晓且值与库中一致           | 场景 2（电话）、场景 5（位置描述）；矩阵 5 另有 RPC 层三方视角                                                |
| c) 标记已找回后墙上消失、详情页无领取入口 | 场景 4（卡片 count=0、owner 页无 pickup-open、他人 404）                                                      |

---

## 6. 缺陷与变更记录

### D-1（已修复 · 复验通过）：publish_found_item 参数契约导致经 lib/db 发布必然 PGRST202

- 严重级别：阻塞（发布功能不可用，E2E 场景 1/2/5 均被挡）
- 最小复现（真实 PostgREST + 真实登录会话）：
  - 8 个命名参数全给（缺失显式传 null）→ OK，返回物品 uuid
  - 按 lib/db/found-items.ts publishItem 的形状（缺失项传 undefined）→ `PGRST202 Could not find the function public.publish_found_item(...)`
- 根因：RPC 的 8 个参数原先都没有 DEFAULT，PostgREST 按请求体出现的键精确匹配函数，而 supabase-js 会丢掉 undefined 键。kept 分支缺 3 键、in_place 仅位置描述缺 2 键 → 多数分支必然失败。
- 修复（Lead）：迁移 20261004120300_rpcs.sql 给 p_contact / p_location_lat / p_location_lng / p_location_label / p_paths 加 `default null`（第 26-30 行，已核实），并重新生成 lib/database.types.ts；lib/db 无需改动。
- 复验：tests/rls/10-rpc-contract.test.ts 的「只给必填参数」5 条 RPC 守卫 + 「lib/db 真实发布路径」通过。
- 备注：全库排查确认仅此一处；上一轮废弃架构的同类教训是 OUT 参数与列名撞名（42702），REQUIREMENTS §4.3 已固化 `out_` 前缀约定。

### C-1（契约变更 · 已被回归覆盖）：listMyItems / listMyPickups 新增 id 参数

- 背景：RLS 改为公开可读后，这两个查询不再被隐式收窄 —— `listMyItems` 会带出他人的 published 行，`listMyPickups` 会带出「别人在我的物品上提交的领取记录」。
- 处理（Lead）：`listMyItems(supabase, ownerId)`、`listMyPickups(supabase, pickerId)`。
- 我的独立验证：tests/rls/11-my-queries.test.ts 断言两者只返回调用者自己的数据，owner 侧改用 `listItemPickups`；用例通过。

### 已接受的已知限制（Lead 决策，非阻塞）

1. 客户端删除「已上传但未发布」的照片时只从选择列表移除，桶内对象留存（孤儿对象）；删除已发布物品时图片行级联删除但桶内对象同样留存。
   接受理由：唯一 REST endpoint 必须是 POST /api/upload；路径不可枚举 + 私有桶 → 不构成泄露面。
2. 领取人手机号对拾主完整展示（REQUIREMENTS §8 待确认项）。

### 观察项（非缺陷）

- E2E 期间 dev server 日志偶发 `Error: The destination stream closed early.`（浏览器上下文关闭时中断流式响应），全部用例仍通过，属 dev 环境噪声。
- docs/PLAN.md 仍描述旧架构（M3-M6 的草稿/出题/匹配/审核分工与旧安全矩阵）。以 docs/REQUIREMENTS.md 为准，建议后续同步或归档 PLAN.md。

### 测试自身缺陷（开发过程中发现并修正）

| #   | 现象                                                   | 根因                                | 处理                                 |
| --- | ------------------------------------------------------ | ----------------------------------- | ------------------------------------ |
| T-1 | 06-pickups-visibility 的 owner 断言 found_item_id 失败 | select 未包含该字段                 | 补上字段                             |
| T-2 | 09-discipline 起初正则未终止                           | 生成测试时正则转义多了一层          | 改为 indexOf 字符串匹配，避免转义    |
| T-3 | 夹具曾手写 8 个 RPC 参数                               | 未走产品封装，掩盖了 D-1 的真实形状 | 改为直接调用 lib/db 的 publishItem() |

### F-1（测试自身偶发 · 已加固）：scenario-4 的 toHaveCount(0) 用默认 5s 超时

- 现象（Lead 在 db:reset 后用干净库复现，紧接着原样重跑即通过）：
  `await expect(cardByTitle(ownerPage, item.title)).toHaveCount(0)` 超时 5000ms；位置在「标记已找回后墙上消失」那句。
- 根因：**Playwright 断言默认超时 5s**，而这是整套里唯一没有显式 timeout 的渲染断言；
  dev（Turbopack 首次渲染 / RSC 重取）下 page.goto("/") 偶发超过 5s。产品侧的 close 实际已成功（前一条「已找回」断言已通过）。
- 加固三件套：
  1. **显式超时审计**：所有 E2E 的 toBeVisible / toHaveCount / toContainText 统一显式 `{ timeout: 30_000 }`（多行断言也补齐）；
     上传/识别等更慢的步骤用 60s。
  2. **产品行为与 UI 渲染解耦**：场景 4 点击「标记已找回」后，先用 `expect.poll`（30s）通过 service_role 断言 DB 里 status=closed，
     失败信息会直接指向「closeItemAction 没生效（产品侧问题）」，而不是笼统的 UI 超时。
  3. **正向锚点先于否定断言**：隐私/消失类断言前先等一个正向元素可见（详情页 item-back / 领取按钮；墙上对照组卡片），
     避免「还没渲染就断言不存在」的假通过。场景 4 因此新增了一条对照物品（另一个 owner 发布、始终 published）。
- 同类排查：场景 2（领取揭晓）、场景 5（留在原地）原有 3 处隐式 5s 断言一并补齐；场景 1/3/7 同步审计。
- 复验：连续 3 次 `pnpm test:e2e` 全部 7 passed（27.4s / 27.1s / 27.1s，EXIT=0），见 §5。

### 产品缺陷 vs 测试缺陷的判定

| 类型     | 判定依据                                              | 本轮实例      |
| -------- | ----------------------------------------------------- | ------------- |
| 产品缺陷 | 独立于 UI 的最小复现（PostgREST/db 直连）即可稳定复现 | D-1           |
| 契约变更 | 由架构变更引发、需调用方同步的显式改动                | C-1           |
| 测试缺陷 | 断言/选择器/转义/夹具写法问题，产品行为正确           | T-1、T-2、T-3 |

---

## 7. 残留风险与说明

1. E2E/RLS 用例写入随机数据；结束删除用户（级联物品/图片/领取）并清理私有桶对象。进程被强杀时可能留下孤儿对象（见已知限制 1）。
2. tests/unit 的 db-errors 与全部 tests/rls 依赖本地 Supabase 运行。
3. 真实模型（StepFun step-5-preview）仅由 pnpm test:live 覆盖且需要 AI_API_KEY；本次未执行（无 key），离线基线全部走 mock。
4. 失物墙为公开浏览（与最初 PRD 相反），安全性完全依赖列级 REVOKE：矩阵 2 与 E2E 场景 6 都在钉这一点；若将来放开某些列，必须同步更新这两处断言。
5. E2E 通过仓库根 config 运行，同目录不能存在另一个 next dev（Next 16 目录级锁）；运行前确认 3000 空闲（reuseExistingServer=false 会强制失败而不是复用）。

---

## 8. 第 2 轮 UI 改造验证（task-13）

### 8.1 本轮要求与验证方式

| 要求（REQUIREMENTS §3.5 / §7 第 11-13 条、UI-DESIGN） | 验证方式（E2E 断言）                                                                                                                                                                                                                          |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 无底部导航栏                                          | `/`、`/items/[id]`、`/me` 三处断言 `getByRole("navigation", { name: "主导航" })` 计数为 0；并先用正向锚点（me-entry / item-back）证明页面确实渲染了，避免空白页造成假通过                                                                     |
| 「我的」在首页右上角                                  | `getByTestId("me-entry")` 可见 + **boundingBox().x > 视口宽度/2**（真判位置）+ 入口不溢出视口；点击后 URL 变 `/me`                                                                                                                            |
| 一步一屏（发布）                                      | 拍照屏：拍照按钮可见（正向锚点），且 #title / #description / #contact / #locationLabel 计数为 0，`input[type=text], input[type=tel], textarea` 计数为 0；第 2 屏 #title 可见且非空、拍照按钮与「已上传 1/5」计数为 0；第 3 屏 #title 计数为 0 |
| 返回退回上一步                                        | 第 2 屏点 aria-label「返回」→ 回到第 1 屏（照片按钮可见、已上传 1/5 可见、#title 计数 0），pathname 仍是 `/publish`                                                                                                                           |
| /me 一屏一段列表                                      | 两个 tab（我的发布/我的领取）可见；默认只看到「我的发布」内容、领取内容 `toBeHidden`；切到领取 tab 后反之                                                                                                                                     |
| 动效不阻碍交互                                        | 领取面板：pickup-open → 表单可见 → 提交 → reveal-contact 可见且值与库中一致                                                                                                                                                                   |
| 动效无障碍（reducedMotion=user）                      | 场景 9 用 `test.use({ reducedMotion: "reduce" })` 跑完整发布主流程，并先断言 `matchMedia("(prefers-reduced-motion: reduce)").matches === true`（证明选项真的生效）                                                                            |

### 8.2 命令与结果

| 命令                                                       | 结果                 | 计数                                                                                                                                                   |
| ---------------------------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pnpm verify（typecheck + lint + unit + rls + e2e）         | **EXIT=0**           | typecheck/lint 0 错误；unit 5 files / **35 tests**；rls 11 files / **66 tests**；e2e **12 passed / 0 failed（1.1m）**                                  |
| pnpm build                                                 | **EXIT=0**           | Compiled successfully；`/`、`/api/upload`、`/items/[id]`、`/login`、`/me`、`/me/items/[id]/pickups`、`/publish`、`/signup`、`/_not-found` 全部构建成功 |
| pnpm exec eslint tests --max-warnings=0 / prettier --check | 0 warning / 格式一致 | tests/** 对 tsc 0 错误                                                                                                                                 |

### 8.3 对抗式反证（实际跑过，非纸面）

临时探针文件 `tests/e2e/__adversarial-probe.spec.ts`（跑完已删除）：

| 反证             | 做法                                                                       | 结果                                                | 结论                                                                                                   |
| ---------------- | -------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 弱断言不足       | 只断言 `me-entry` 可见                                                     | **通过**                                            | 「存在」不能证明「在右上角」，所以必须保留 boundingBox 位置断言                                        |
| 位置断言有效性   | 故意断言 `me-entry.x < 视口宽度/2`（`test.fail()`）                        | **如预期失败**                                      | 入口确实在右半边；位置断言能抓住布局被改坏                                                             |
| 导航选择器灵敏度 | 故意断言 `/publish` 上 `getByRole("navigation")` 计数为 0（`test.fail()`） | **如预期失败**（该页有 aria-label=发布步骤 的 nav） | 证明该选择器确实能匹配到 nav；因此 `/`、`/items/[id]`、`/me` 上的 0 不是「选择器永远匹配不到」的假通过 |
| 一步一屏排他性   | 故意断言拍照屏 `#title` 计数为 1（`test.fail()`）                          | **如预期失败**                                      | 拍照屏确实没有文本表单；配合「拍照按钮可见」的正向锚点排除空白页假通过                                 |
| 标签页排他性     | 故意断言 `/me` 默认 tab 下「我的领取」内容可见（`test.fail()`）            | **如预期失败**                                      | 未激活标签段确实不可见（隐藏或未挂载），一屏一段成立                                                   |

### 8.4 本轮测试侧修正（非产品问题）

| #   | 现象                                                | 根因                                                             | 处理                                      |
| --- | --------------------------------------------------- | ---------------------------------------------------------------- | ----------------------------------------- |
| T-4 | 场景 8 第 2 条：返回第 1 屏后 `/选择照片/` 断言超时 | 已有照片时拍照按钮文案变为「继续添加」，旧断言只匹配空态文案     | 改为 `/选择照片                           | 继续添加/` 并补断「已上传 1/5」可见 |
| T-5 | 场景 8 `beforeAll(fn, 180_000)` 类型错误            | Playwright 的 hook 不接受 timeout 第二参数（那是 vitest 的签名） | 改为在 hook 内 `test.setTimeout(180_000)` |

### 8.5 已知限制 / 未覆盖

1. 「无底栏」通过 DOM 中不存在 aria-label=主导航 的 navigation 元素判定；若将来新增其它 aria-label 的底栏，本断言不会发现。
2. 「我的入口在右上角」用 x > 半宽判定，未校验与其它元素的重叠（Playwright 的 toBeVisible 不做遮挡检测）。
3. 动效本身的视觉质量（时长/曲线/位移是否符合 UI-DESIGN 词汇表）未被自动断言，仅验证了 reducedMotion 下可用性与交互不中断。
4. E2E 期间 dev server 偶发 `The destination stream closed early.`（上下文关闭中断流式响应）为 dev 噪声，不影响结论。

---

## 9. 第 3+4 轮验证（task-19）

### 9.1 本轮要求 → 验证方式

| 要求                                       | 验证方式（可执行断言）                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 拍照建议三态与两个分支（第 3 轮）          | E2E 场景 13：1 张 → `photo-advice-retake` 可见 + 「继续拍照」与「下一步」并存；补到 2 张 → `photo-advice-ok` 可见 + 「继续拍照」计数 0；单测锁定 mock 契约（<2 → 建议补拍；>=2 → 可以直接用）                 |
| 全屏加载期间不得渲染输入框                 | E2E 场景 13 第 2 条与场景 1：点「下一步」后 `analyze-loading` 可见，且**此刻同步数** `#title`/`#description` 计数为 0；加载结束后表单出现且有值                                                               |
| 认领即归属（第 4 轮）                      | RLS 01/05/06/12 + E2E 场景 2/10：认领成功 → DB `status=claimed` 且 `claimed_at` 非空；**墙上仍列出且带「已认领」角标**；第二个账号详情页看到 `pickup-claimed`、无认领入口；直接访问认领页被服务端重定向回详情 |
| 第二个认领人被拒 / 拾主不能认领自己的      | RLS 05：第二人 → P0001「该物品已被认领」；拾主自己 → 42501「不能认领自己发布的物品」                                                                                                                          |
| 撤单状态机                                 | RLS 12 + E2E 场景 4：published 可撤 → withdrawn、墙上消失、他人 404；claimed 撤单 → P0001「该物品已被认领，无法撤单」；非 owner → 42501「无权操作该物品」；`/me` 在已认领后不再显示「撤单」按钮               |
| 认领是独立一屏                             | E2E 场景 11：`pickup-open` 的 href = `/items/{id}/claim`；URL 跳转、h1「认领物品」、`pickup-form`、提交后整屏对勾、回详情揭晓                                                                                 |
| 相册左右滑动 + 无横向溢出                  | E2E 场景 12：mouse 拖拽相册，`gallery-counter` 1/2 → 2/2 → 1/2；`scrollWidth - innerWidth <= 1`                                                                                                               |
| claimed/withdrawn 列级可读、机密列仍不可读 | RLS 01/02：`claimed_at`/`withdrawn_at` 在选择列表里可读；`contact`/`location_*` 与星号 select 仍 42501                                                                                                        |
| 业务错误中文原样透出                       | 单测 db-errors（`raise exception` 的中文不被兜底吞掉）+ RLS 05/12 的 message 断言                                                                                                                             |
| RPC 契约（withdraw 只给必填参数）          | RLS 10：`withdraw_found_item` 只给 `p_item_id` → P0002 而非 PGRST202                                                                                                                                          |

### 9.2 命令与结果

| 命令                                                 | 结果       | 计数                                                                                            |
| ---------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `pnpm typecheck`                                     | EXIT=0     | 0 错误（此前 tests/** 有 12 个改名错误，已全部修掉）                                            |
| `pnpm verify`                                        | **EXIT=0** | unit **5 files / 40 tests**；rls **12 files / 72 tests**；e2e **18 passed / 0 failed（1.6m）**  |
| `pnpm build`                                         | **EXIT=0** | Compiled successfully（最终树复跑一次仍是 EXIT=0）                                              |
| `pnpm test:live`                                     | **EXIT=0** | **3 passed / 0 failed（44s）**：vision 单张、review、vision 多张（真实 StepFun step-5-preview） |
| `eslint tests --max-warnings=0` / `prettier --check` | 通过       | 0 warning / 格式一致                                                                            |

### 9.3 对抗式反证（临时探针实跑，跑完已删除）

| 反证           | 做法                                                             | 结果                                                                             | 结论                                                                                                      |
| -------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 认领即归属     | 认领后断言「墙上应看不到该物品」（`test.fail`）                  | **如预期失败**                                                                   | 认领后物品确实仍在墙上（带已认领角标）                                                                    |
| 第二人不可认领 | 已被认领后再认领，断言 error 为 null（`test.fail`）              | **如预期失败**                                                                   | 确实被 P0001 拒绝                                                                                         |
| 已认领不可撤单 | 对 claimed 物品撤单，断言 error 为 null（`test.fail`）           | **如预期失败**                                                                   | 确实被 P0001「该物品已被认领，无法撤单」拒绝                                                              |
| 加载期无输入框 | 加载态可见的**此刻同步**数 `#title`，断言计数为 1（`test.fail`） | **如预期失败**（实测 count=0）                                                   | 全屏加载确实替换了表单（首版探针用带轮询的 toHaveCount，1s 内表单已出现，属探针写法问题，已改为同步计数） |
| 1 张照片即通过 | 上传 1 张后断言 `photo-advice-ok` 可见（`test.fail`）            | **如预期失败**                                                                   | 1 张确实走「建议补拍」分支                                                                                |
| 抓拍竞态量化   | 在 claim 页直接 `toBeVisible(claim-success)` 3 轮                | 3/3 未漏（直连认领页）；但全量套件里 6 次中漏了 4 次（经由详情页客户端跳转进入） | 说明该元素的可观测窗口很短，测试改用 MutationObserver 记录「是否出现过」                                  |

### 9.4 发现的产品侧竞态（D-2，**已修复**）

- **现象**：认领成功后，「认领成功」整屏对勾（`claim-success`，UI-DESIGN 要求约 0.9s）经常来不及看就被跳到详情页；测试里表现为 `toBeVisible` 抓不到，但认领本身已成功。
- **证据**：
  - 探针（MutationObserver + exposeFunction）三次实测：overlay sightings 均为 1，但**点击→详情页只用 707ms / 711ms / 1164ms**，两次短于 900ms 的展示时长；
  - 全量 E2E 首轮：6 条认领用例里 4 条的 `claim-success` 断言 30s 超时，而同一时刻的失败快照显示详情页已出现「已认领 + 拾主联系方式」，说明业务已成功、只是对勾被提前卸载。
- **根因（代码位置）**：`app/items/[id]/claim/page.tsx:30` 在 `item.status !== "published"` 时 `redirect("/items/" + id)`；`app/items/actions.ts:102` 在认领成功后 `revalidatePath("/items/[id]", "page")` → 认领页的服务端组件带着「物品已 claimed」重新渲染 → 立即重定向，抢在 `claim-form.tsx:41-43` 的 900ms 定时器之前。
- **期望**：按 UI-DESIGN §4 / REQUIREMENTS §3.3，提交成功后应先看到整屏对勾（约 0.9s）再回详情。
- **建议修法（Lead 决定，需改产品代码）**：把认领页的重定向条件放宽为「status !== published **且** 当前用户对该物品没有认领记录」，或在 action 里不再触发认领页所在路由的重渲染（由客户端在 overlay 结束后 `router.replace`）。
- **测试侧原始应对**：E2E 先在点击提交前装 MutationObserver 记录 `claim-success` 是否**出现过**（`expect.poll(sightings).toBeGreaterThan(0)`），随后断言回详情 + 揭晓值。

#### 9.4.1 Lead 的修复与复验（第 4 轮收口）

- **修法**（采纳上面的第一条建议）：`app/items/[id]/claim/page.tsx` 的重定向条件放宽为
  「owner 或 withdrawn → 退回详情；claimed **且当前用户没有该物品的认领记录** → 退回详情」。
  即：**刚认领成功的本人可以留在认领页**，由客户端自己决定何时 `router.replace`，
  服务端 revalidate 不再抢跑。`claim-form.tsx` 增了 `claimedByMe` 入参，
  只在「已经认领过、再次进来」时显示「你已经认领过这件物品」+「返回物品」，
  **保证组件实例不因 status 变化被替换**（否则 done/timer 状态会丢，对勾照样看不到）。
- **测试侧收口**：把 6 条认领用例全部**从 MutationObserver「出现过」改回直接的
  `await expect(getByTestId("claim-success")).toBeVisible()`**（提交后立刻断言，再等 URL 跳转），
  并删除已无用的 `trackTestIdAppearances` 辅助函数 —— 断言强度回到「必须持续可见」。
- **复验**：Lead 在冻结树上跑 `pnpm verify` = EXIT 0（unit 5/40、rls 12/72、**e2e 18 passed**）、
  `pnpm build` = EXIT 0；6 条认领用例连续通过，`claim-success` 每次都能在跳转前被抓到。

### 9.5 本轮测试侧修正（非产品问题）

| #   | 现象                                          | 根因                                                                                                          | 处理                                                                       |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| T-6 | 场景 3「拾主看认领人名单」拿不到 王五         | 我在 finally 里先删掉了认领人的账号，而 `pickups.picker_id` 是 `on delete cascade` → 认领记录被级联删掉       | 认领人账号改到用例最后再删                                                 |
| T-7 | 6 条认领用例中 4 条抓不到 `claim-success`     | 该元素只闪现约 0.9s 且被服务端重定向提前卸载（见 D-2）                                                        | 先用 MutationObserver 兜底；D-2 修复后改回 `toBeVisible`，并删除该辅助函数 |
| T-8 | 场景 8 第 2 条 strict mode violation          | 返回第 1 屏后同时存在「继续添加」与「继续拍照」两个匹配按钮                                                   | 加 `.first()`                                                              |
| T-9 | `pnpm test:live` 我新增的 review 用例超时失败 | 文件里**已存在**一条 review 实测用例，我又加了一条（多打两次真实模型调用），其中一次触发 provider 的 60s 超时 | 删除重复用例，保留原有 3 条；重跑 3/3 通过                                 |

### 9.6 已知限制 / 未覆盖

1. 真实模型延迟：`generateObject` 服务端超时 60s、客户端看门狗 25s；实测 review 单次约 5–9s、vision 单次 12–26s。若模型抖动超过 60s，会走「识别失败，自己填一下」降级路径（功能正确，但用户需重试）。
2. ~~D-2 的竞态……~~ **已在 9.4.1 修复**：认领页不再被服务端重定向抢跑，6 条认领用例都改回 `toBeVisible` 并通过。
3. 相册滑动用 mouse 事件覆盖；未覆盖真实触摸手势（touch）与多指场景。
4. 未验证 `withdrawn` 物品对「我的认领」列表的影响（认领记录仍在，但物品对非 owner 不可读时会显示「不可见」占位，属设计内行为，见 `app/me/page.tsx:172`）。
