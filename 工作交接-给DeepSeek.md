# xxtplay 项目交接（1.0.0 开发记录，给 Codex）

更新时间：2026-10-29。目录 `D:\xxtplay`。仓库 <https://github.com/huof2034/xxtplay>。

## 先看这里

- 用户要求**直接开发并发布 1.0.0**，实机验证由用户明天进行，之后再由 Codex 继续修改。因此 **1.0.0 已发布，但不代表真实学习通、真实后台或真实 AI 验收通过**。
- 1.0.0 的代码改动只有**全标签页主题 UI**、版本和文档；播放调度逻辑沿用 0.5.8，没有新的真实修复。
- 当前本地 `main` 应包含 1.0.0 提交与标签；先运行 `git status --short --branch`，不要覆盖未提交变更。
- 1.0.0 的 `npm run check` 通过：TypeScript、**61 项单元测试、45 项 Playwright 模拟测试**。模拟页面不能证明真实平台。
- 发布资产 SHA-256：
  - `xxtplay.user.js`：`1D4D52844BB80878159FA76B20A5A8CA93DC0CE3A75E501E23673EBFD83AF7AF`
  - `xxtplay.meta.js`：`8E174AE2421BD9D5D67B4663CD4E78318D1BFF8DE3244E2159D0051112EB29A2`
- 安装/更新：GitHub Release `v1.0.0`，更新地址使用 `releases/latest/download/xxtplay.user.js` / `xxtplay.meta.js`。用户会自行在 Tampermonkey 中安装。

## 1.0.0 实际改动

- `src/ui/themes.ts`：
  - 移除 `.body:not([data-tab="courses"]){background:#ffffffed}` 这层只让课程页露背景的白色遮罩。
  - 五个标签页统一使用半透明白色渐变内容层，角色图在所有标签页可见；卡片改为高不透明度，保证文字可读。
  - 课程页保留右侧角色展示空间；窄屏（≤420px）工具栏换行、内容区缩小。
  - 增加 `prefers-reduced-motion` 下关闭入场动画和控件过渡。
- `src/ui/panel.ts`：
  - 首次打开按当前服务商播放一次角色入场动画；保存服务商/模型变更时重播；`animatedProvider` 避免每次切换标签都重复动画。
  - 没有改变 AI 设置表单、保存校验和密钥隔离逻辑。
- `tests/e2e/workflows.spec.ts`：
  - 新增“所有标签页都保留服务商背景和主题配色”回归（5 个标签页都检查背景图、`data-tab`、半透明渐变和主题属性）。
  - 原主题切换、入场动画、减少动态效果、窄屏测试保持通过。
- 文档/版本：`package.json` 1.0.0、README、CHANGELOG、ACCEPTANCE、本交接。
- 已用本机 Playwright 截图人工检查 Kimi 主题的课程/播放/运行/AI 设置/复习五页和 360×640 窄屏；临时截图/临时 spec 已删除。

## 仍未解决/未验证（明天重点）

1. **真实课程自动播放、同章节连续视频、跨章节切换、后台五分钟**：这些都是用户实机验证项。0.5.8 修过父上下文等待和章节完成图标门槛，但用户此前只反馈“依旧不行”且没有日志；不能声称已修复。
2. **后台标签页**：0.5.6 实测 278→310 秒后报“媒体多次暂停或卡顿”是明确失败。0.5.8 改为后台耐心重试并新增 `播放暂停诊断`、`媒体缓冲或停滞`、`页面切换到后台/前台` 日志；是否真能连续后台播放未知。
3. **真实 AI**：用户已接 DeepSeek API，但仓库测试不读取 Key，也未发真实请求；文本题/图片题/讨论/复习、限流、余额不足、断线均未验证。
4. **AI 传输方式**：当前仍是油猴 `GM_xmlhttpRequest` 的 HTTPS `POST /chat/completions` **非流式**请求，3 次重试；没有 WebSocket，也没有 SSE。若用户反馈“断联”，先收集实际错误（HTTP 状态、网络错误名、是否 401/429/超时），不要盲目改成 WebSocket。WebSocket 在油猴跨域、代理、重连和密钥暴露方面都更复杂；OpenAI 兼容接口通常用 HTTP/SSE，不是 WebSocket。
5. **租约**：`src/core/lease.ts` 是 GM 存储的 180 秒 TTL + 读后等待再检查，不是原子锁；注释已改为如实描述。多 iframe/多标签页竞争是否导致“任务授权或账号已变化”尚未证实。
6. **UI**：1.0.0 已完成五标签背景和窄屏；真实学习通页面未验证，用户实测后可能要求调整配色/对比度/布局。不要在没有日志的情况下再改播放逻辑。

## 明天建议的接手顺序

1. 先读用户发来的最新日志；优先看 `播放暂停诊断`、`媒体缓冲或停滞`、`页面切换到后台/前台`、`未收到父页面任务身份`、`自动打开任务点`、`等待平台确认`。
2. 区分是“没开始播放”“播到 0:00 停住”“播完不切换”“后台暂停”“平台不确认回执”；不要用同一个修复覆盖所有情况。
3. 需要真实验证时只做用户授权的课程；不要泄露课程 URL 的 enc/token、账号或 API Key；真实考试只能用户主动开始、交卷人工确认。
4. 修复后先加能复现的模拟回归，再跑 `npm run check`；需要发布时 bump patch，不要覆盖 1.0.0。
5. UI 反馈与功能反馈分开处理；如果只是视觉问题，不要动 `runtime.ts`。

## 关键文件

- `src/runtime.ts`：队列、任务点打开、章节/课程切换、`tick` 的上下文超时。
- `src/core/media.ts`：播放、观看量、暂停恢复、后台诊断日志。
- `src/core/playback.ts`：自动播放错误分类、静音兜底、一次性手势提示。
- `src/platform/chaoxing.ts`：任务点/章节/`mArg`/进度解析。
- `src/platform/bus.ts`：跨 iframe 任务身份/考试上下文/打开任务点消息，含 5 秒超时兜底。
- `src/platform/courses.ts`：课程列表/进度。
- `src/ui/themes.ts`、`src/ui/panel.ts`：1.0.0 主题与面板。
- `tests/e2e/workflows.spec.ts`、`tests/e2e/harness.ts`：44/45 项模拟场景（跨域、两章节、顺序视频、任务身份、暂停、主题）。
- `docs/ACCEPTANCE.md`：验收记录；`CHANGELOG.md`：版本记录。

## 环境与隐私

- 本机 Playwright Chromium 下载不完整，e2e 用系统 Chrome：`$env:PW_CHANNEL='chrome'; npm run check`。
- GitHub 发布使用本机已保存凭据；不要把 token 写入文件或输出。`gh` 状态可能显示未登录，但 `GH_TOKEN` 从凭据管理器读取即可；不要打印。
- `.local/` 可能含账号/课程/认证参数，禁止提交、上传、打印或作为公开夹具。
- 保留 `预览图/`、`dsh-usage/` 等用户/工具文件；只清理本次创建的临时截图和探测文件。
- 不要刷新用户正在学习的页面、不要开始真实考试、不要重复提交任务。
