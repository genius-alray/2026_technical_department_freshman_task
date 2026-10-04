# 验证记录

## 1. 怎么验

| 命令             | 覆盖                                                             |
| ---------------- | ---------------------------------------------------------------- |
| `pnpm verify`    | typecheck + lint + unit + rls + e2e（一条命令全量）              |
| `pnpm test:unit` | zod schema、db 错误映射、AI mock 契约、高德链接与唤起方案、PWA 清单/图标/SW/状态栏纪律、图片三态、安装按钮 |
| `pnpm test:rls`  | 安全矩阵：行级/列级权限、RPC 边界、客户端写入拒绝                |
| `pnpm test:e2e`  | 真实浏览器（Pixel 7）跑用户可见流程；**强制 `AI_PROVIDER=mock`** |
| `pnpm test:live` | 真实模型（DeepSeek）视觉 + 结构化输出；需要网络与 key            |
| `pnpm build`     | 生产构建（会类型检查 `tests/**`）                                |

前置：`pnpm db:start && pnpm db:env && pnpm db:reset`。

## 2. 安全矩阵（tests/rls，13 个文件）

| #   | 断言                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------- |
| 1   | 未撤单物品（published / claimed）公开可读；withdrawn 仅拾主可读                                          |
| 2   | `contact` / `location_*` **列级 REVOKE**：客户端任何查询（含 `select(*)`）都 42501                       |
| 3   | 三张业务表对 anon/authenticated **只有 SELECT**，写入一律被拒                                            |
| 4   | 私有图片桶无客户端策略；只有服务端签名 URL 可读                                                          |
| 5   | `reveal_found_item_contact`：仅拾主本人或已认领者                                                        |
| 6   | `create_pickup`：认领即置 claimed；**允许多人认领**；拾主不能认领自己的；已撤单拒绝；本人重复提交 = 更新 |
| 7   | `withdraw_found_item`：仅 owner 且 status=published；已认领 → P0001                                      |
| 8   | `release_found_item_claim`：认领人可撤回，物品回到 published，记录保留                                   |
| 9   | `publish_found_item`：照片数量 1..max_photos；路径前缀必须是自己的 uid；in_place 必须有位置详情                                   |
| 10  | RPC 契约守卫：只给必填参数也能被解析（不能是 PGRST202）                                                  |
| 11  | `listMyItems` / `listMyPickups` 显式按 owner/picker 收窄（RLS 公开读之后必须自己做）                     |
| 12  | 源码纪律：禁止对 `found_items` 做星号 select                                                             |
| 13  | `profiles`：只能读写自己那一行；姓名/手机号 CHECK + 手机号唯一                                           |

## 3. 端到端场景（tests/e2e）

第 9 轮把「按轮次累积的 16 个 spec」收敛为**按功能划分的 spec**：删掉重复的发布 / 认领主链路，
每类行为只留一条主链路 + 各自特有的断言；第 11 轮为 PWA 外壳补了 `11-pwa.spec.ts`，第 13 轮补了 `12-skeletons.spec.ts`，现共 **12 个**。
浏览器是 Pixel 7，`workers: 1`（本地 Supabase 是共享状态），强制 `AI_PROVIDER=mock`。

| 文件                        | 覆盖                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `01-publish-wizard.spec.ts` | 四屏向导；拍照屏无文本表单/无步骤条；3 张上限且不提示数量；点「下一步」才检查照片（可跳过）；识别期间不渲染输入框；位置详情必填且界面不出现经纬度 |
| `02-claim-flow.spec.ts`     | 诚信认领二次确认（取消不写库）；确认后**立刻**跳认领信息；揭晓电话 / 位置；统一组件的二次确认                   |
| `03-multi-claim.spec.ts`    | 第二个人看到「已有人认领」仍可认领；认领信息屏列出其他认领人；拾主名单看到全部人选                             |
| `04-withdraw.spec.ts`       | 撤单二次确认 → 墙上消失 → 本人见已撤单 → 他人 404；已认领后无撤单按钮且 RPC P0001；「领错了？」撤回认领、记录保留 |
| `05-me.spec.ts`             | 注册即带个人信息、可修改、认领时只读展示；标签页一屏一段列表；退出登录二次确认                                 |
| `06-rest-privacy.spec.ts`   | anon 与登录会话直连 PostgREST：公开列可读，`contact`/`location_*`/`select=*` 全 42501，私有桶直读被拒          |
| `07-wall.spec.ts`           | 未登录刷信息流；点卡片去登录并回跳详情；登录/注册页「随便看看」；分页「加载更多」                              |
| `08-item-detail.spec.ts`    | 相册 scroll-snap：计数器与圆点 aria-current 同步、圆点跳转、无横向溢出                                        |
| `09-reduced-motion.spec.ts` | 系统「减少动态效果」下四屏发布流程仍可完整走完                                                                |
| `10-title-bar.spec.ts`      | 标题栏唯一性（且位于 `main` 内）；路由标题与详情页覆盖；返回控件 testid；首页「我的」在视口右半边              |
| `11-pwa.spec.ts`           | PWA 外壳：manifest 链接与清单字段、图标可访问且是 PNG、apple-touch-icon / 双 theme-color；**未登录也能打开 `/offline`**（不能被 proxy 重定向）；`/sw.js` 不被缓存；**拦截安装提示** + 首页「安装应用」按钮调起原生安装弹窗 |
| `12-skeletons.spec.ts`     | 骨架屏：失物墙首屏**流式**——同一份 HTML 里骨架在前、真实卡片在后；详情页图片加载中显示骨架、加载完淡入（人为拖慢图片请求）；**图片失败时显示图标占位，不出现破图与 alt 文本**（直接掐断请求） |

## 4. 值得留档的缺陷（都已在代码里修掉）

1. **PGRST202：可选参数没有 DEFAULT** —— supabase-js 会丢掉值为 `undefined` 的键，PostgREST 按「键集合」精确匹配函数，
   于是「只给必填参数」就找不到函数。所有可选参数必须写 `default null`。
2. **42702：RETURNS TABLE 的 OUT 参数与列名撞名** —— 一律给 OUT 参数加 `out_` 前缀（踩过两次）。
3. **两套输入框**：AI 生成描述时用骨架屏但**没有替换表单**，屏幕上同时出现骨架和输入框。改成全屏 `LoadingOverlay`，
   加载期间不渲染表单，并用 `MOCK_AI_DELAY_MS` 让这个瞬时状态可被断言。
4. **认领成功对勾被抢跑**（D-2）：认领成功后详情页立刻变成已认领，组件切分支被卸载、定时器被 cleanup 清掉，
   于是「不跳转」。改成**确认后立刻 `router.push`**。
5. **AI 只能用一次**：`abortSignal` 被放进模块级常量，等于进程启动时创建了一个 60 秒后触发的信号，
   服务跑过 60 秒后所有请求都被同一个已 abort 的信号打断。改为每次请求现建。
6. **DeepSeek 不支持 `response_format: json_schema`**（实测报错），必须关掉结构化输出、走 prompt + JSON 模式。
7. **Tailwind v4 的 `scale-*` 编译成 `scale:` 而不是 `transform:`** —— 想给点击反馈做过渡要把 `scale` 写进 `transition-property`。
8. **Next 16 开发态单实例锁**：同一项目同时跑两个 `next dev` 会互相拒绝；E2E 用 `reuseExistingServer: false`，
   端口被占会直接报错（宁可报错也不要复用一个来源不明的 server）。
9. **装到桌面后跳转时顶部状态栏闪白**：Next 每次客户端路由切换都会把 `<head>` 里由 metadata / viewport
   生成的元信息**整体移除再重建**（MutationObserver 实测：一次跳转会 remove + add `theme-color`、
   `apple-mobile-web-app-*`、`link[rel=manifest]`）。独立窗口里这一瞬间会掉回 manifest 的 `theme_color`，
   深色主题下就是一道白闪。修法：`components/pwa/status-bar-keeper.tsx` 把状态栏相关的 meta 镜像一份
   交给 DOM 直接持有（不归 React 管），兜底色也从白色改成品牌青柠。生产构建实测：跳转全程
   `theme-color` 最少仍有 2 个，被移除的只有 React 自己那一份。
11. **根目录 `app/loading.tsx` 会包住所有子路由（含 not-found）** —— 页面里抛 `notFound()` 时，
    流式响应已经把 200 发出去了，状态码改不回来：E2E 里「他人访问已撤单物品应 404」直接变 200，
    同一 describe 的下一个用例也跟着挂。首屏骨架必须放进路由组（`app/(wall)/loading.tsx`），只作用于 `/`。
12. **「查看定位」在高德网页版上还要再点一次**：`uri.amap.com` 的 `callnative=1` 只是高德自己的落地页，
    用户还得在那一页再点「打开高德地图」。要一步进 App 必须直接跳 `iosamap://` / `androidamap://`；
    安卓更稳的是 `intent://` + `S.browser_fallback_url` —— 没装 App 时 Chrome 会自己回落网页版，
    而不是停在 `ERR_UNKNOWN_URL_SCHEME` 错误页（那样连兜底的 JS 都没机会跑）。

## 5. 已知限制

- **Service Worker 只在生产构建注册**（`pnpm dev` 与 E2E 都不注册），所以缓存行为没有浏览器自动化覆盖，
  只有 `tests/unit/pwa.test.ts` 的静态纪律断言 + 生产构建下的人工/命令行核对；
- 失物墙骨架的宽高比是**猜的**（数据库里没有图片尺寸列）：占位高度不可能和真实图片完全一致，
  图片加载完仍会有一次高度收敛；换来的是「卡片不会塌成 0 高、也不露破图」；
- 首屏骨架靠**服务端流式**（HTML 第 ~4KB 就是骨架，真实卡片在 ~33KB 处），覆盖的是首次进入 /
  刷新 / 从桌面图标启动；**客户端跳转**时 Next 16 会等 RSC 到齐再整屏切换，这时看不到 loading 骨架
  （实测：把 RSC 拖慢 3s，骨架只在响应落地前后闪 ~40ms）。所以 E2E 断言的是流式 HTML 的先后顺序，
  而不是「跳转时看得见骨架」那种掷骰子的瞬时状态；
- 「一步进高德 App」与「状态栏不闪白」都依赖真机（手机浏览器 + 已安装高德 / 已装到桌面），
  自动化只覆盖**方案判定**（`planAmapLaunch` 纯函数：iOS scheme、安卓 intent、桌面与内嵌浏览器回落）
  与**镜像 meta 是否会被 Next 的重建带走**（`status-bar-keeper.test.tsx`）；
- 相册滑动只用 `scrollLeft` 驱动断言，未覆盖真实多点触控；
- 真实模型抖动时可能触发 60s 服务端超时 / 25s 客户端看门狗，走「识别失败，自己填一下」降级（功能正确）；
- 删除未发布照片会留下桶内孤儿对象（私有桶 + 路径不可枚举，不是泄露面）。
