# xxtplay 项目交接

更新时间：2026-10-27。项目目录：`D:\xxtplay`。当前版本：`0.4.0`。

## 当前状态

- 交接文档、源码、测试与真实页面样本已检查。`npm run check` 通过：TypeScript、59 项单元测试、构建、26 项 Playwright 模拟页面测试。
- 自动播放问题已修复：优先静音开始，区分浏览器策略拒绝（`NotAllowedError`）与播放器加载中断（`AbortError`），失败时在视频内显示一次性点击提示，不再直接停摆。
- 新增播放自动化：未加载的任务点会自动滚动并点击打开；平台 `doublespeed` 允许时自动倍速（默认 2×）；平台 `fastforward` 允许且无「不可拖拽」提示时自动跳到结尾；完成仍以平台回执为准。
- 设置面板支持拖动标题栏移动并记住位置，双击标题栏恢复右下角；新增「播放」设置页。
- 新增学习通首页课程总览：读取全部课程与任务点进度、可在面板勾选；首页开始队列会自动打开第一门勾选课程。运行任务卡显示课程名、章节、类型和「打开页面」链接。
- AI 设置已支持服务商与模型选择：DeepSeek、通义千问（阿里云百炼）、Kimi、自定义 OpenAI 兼容接口；文本/视觉模型可下拉选择或手填，视觉模型可留空。
- 已补齐中文 `README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`CHANGELOG.md`、`docs/ACCEPTANCE.md` 和 `scripts/package.mjs`。
- 已初始化 Git（`main`），发布资产位于被忽略的 `release/`。已发布到公开仓库 <https://github.com/huof2034/xxtplay>，最新 Release 为 `v0.4.0`。
- **真实验收仍待用户完成**：五分钟后台观察、真实课程 AI 答题、讨论、复习、考试确认、公开下载核对。模拟页面通过不等于真实平台回执。

## 用户需求和关键约束

- Windows Chrome/Edge 油猴脚本，支持课程队列、后台标签页、进度恢复、视频、音频、文档、课程题目、讨论和可选复习资料。
- AI **仅用于答题（包括讨论题）和用户开启的课程总结**，播放、导航及效率判断不能调用 AI。支持 DeepSeek、通义千问、Kimi 及兼容 Chat Completions 的接口；API Key 保存在油猴存储，导出配置和日志不得包含密钥。
- 课程题目和讨论可自动提交；有未解决题目的作业不得提交。考试由用户手动开始，可以自动填答，但**最终交卷须用户对当前考试、本次提交明确确认**，刷新、超时或重试不能继承授权。不要擅自开始真实考试。
- 每门课可选效率模式，默认关闭：只依据页面或平台明确给出的每个视频最低时长、比例等条件，满足所有条件并等到平台明确确认通过才继续；未知、冲突或不能可靠解析则完整播放。不能自行假设统一比例。
- 验收要求已由用户从 30 分钟调整为 **5 分钟**。真实进度以平台结果为准；登录失效、验证码、人脸验证交给用户处理。
- 用户已授权实施和公开发布；公开发布前必须重新核实 GitHub 账号与仓库，避免覆盖已有仓库。

## 已完成

- TypeScript + esbuild，产物为 `dist/xxtplay.user.js` 和 `dist/xxtplay.meta.js`；版本 `0.4.0`。
- 课程队列、页面及跨 iframe 适配、媒体和效率规则、题型处理、AI 接口、复习整理、考试确认、跨标签页租约、中文面板。
- 自动播放策略处理位于 `src/core/playback.ts`：优先 video.js 播放器 API，失败回退原生元素；策略拒绝时静音重试；`AbortError` 等待媒体就绪后重试；极端策略下显示提示条并等待一次点击；不会伪造用户手势或修改浏览器启动参数。
- AI 服务商目录位于 `src/ai/providers.ts`，旧配置会自动推断 provider。面板支持模型下拉+自定义；切换服务商必须重填 Key；视觉模型为空时图片题保留待办，不发送请求。
- 使用 OCS 的 MIT 许可部分代码，固定提交 `da5c0775a9d055724149ff505eae75bd85d334f9`；引用内容位于 `src/vendor/ocs/`，许可及来源映射位于 `licenses/`。ChaoXing-AutoAnswer 和 Samueli924/chaoxing 仅用于调查参考，不应声称复制了它们的代码。
- 最近一次 `npm run check`（`PW_CHANNEL=chrome`）：TypeScript 通过、59 项单元测试、构建、26 项 Playwright 模拟页面测试通过。模拟页面不证明真实课程、真实 AI 服务或真实提交已完整验证。
- 发布资产：`npm run package` 生成 `release/xxtplay.user.js`、`release/xxtplay.meta.js`、说明文件与 `SHA256SUMS.txt`。当前脚本 SHA-256：
  - `xxtplay.user.js`：`585FBF18F94A62D1E9361E281446A5AE6BFAD78920A429B40A0C45ABD6210298`
  - `xxtplay.meta.js`：`045C208F26C7435BBEF7A75333F5F7E0ADE37ABDA6341246FE0F218634C0A37A`
- 这是本地构建文件的哈希，未独立核对油猴中已安装副本；重新构建后须重新计算并更新 `docs/ACCEPTANCE.md`。
- 用户此前已安装 Tampermonkey、允许运行用户脚本并在真实课程页面看到 xxtplay 面板；用户反馈视频已播放且完成一个任务点。本次修复后需要用户重新安装/更新脚本才能生效，该现场反馈尚未独立核验。

## 关键文件

- `src/main.ts`、`src/runtime.ts`：入口、运行调度和任务队列。
- `src/core/playback.ts`：自动播放策略、静音重试、一次性点击兜底。
- `src/core/media.ts`：媒体播放、进度累计、效率条件等待。
- `src/platform/chaoxing.ts`、`src/platform/bus.ts`：学习通页面适配、跨 iframe 消息和考试上下文传播。
- `src/core/exam-gate.ts`、`src/ui/panel.ts`：考试确认门禁和面板；确认只在内存中对当前考试和当前操作有效。
- `src/core/efficiency.ts`、`src/core/documents.ts`：效率规则和文档处理。
- `src/core/lease.ts`：跨标签页租约；`src/core/answer.ts`、`src/core/question-worker.ts`：答题处理。
- `src/ai/client.ts`、`src/ai/providers.ts`、`src/core/summary.ts`：AI 请求、服务商/模型目录及复习整理。
- `README.md`、`LICENSE`、`THIRD_PARTY_NOTICES.md`、`CHANGELOG.md`、`docs/ACCEPTANCE.md`、`scripts/package.mjs`：用户文档、许可、验收和打包。
- `package.json`：`npm run check` 串联检查；`npm run package` 生成发布资产。

## 下一步

1. **用户先更新油猴中的脚本**：重新安装 `release/xxtplay.user.js`（或 `dist/xxtplay.user.js`），再进入真实课程观察自动播放是否生效。不要为测试直接刷新或重交正在进行的任务。
2. 按 5 分钟要求观察：将课程标签页置于后台，记录起止时间、播放进度、平台状态、面板日志与 AI 调用次数（播放期间应为 0）；浏览器冻结页面或系统休眠时脚本不能继续运行。不要把单个任务点反馈误写为五分钟后台测试已通过。
3. 真实课程题目、讨论、复习和 AI 接口尚需逐项验证；用户需在脚本设置中自行输入 API Key，**不要索取、读取、打印或导出密钥**。模拟测试不能替代真实平台回执。
4. 持续核查考试安全：用户确认前提交请求为零，确认只对当前考试、本次提交生效，刷新或异常重试不能自动交卷；真实考试只在用户主动开始后处理。
5. **公开发布已完成**：公开仓库 <https://github.com/huof2034/xxtplay>，`main` 与 `v0.2.0`–`v0.4.0` 标签已推送，Release `v0.4.0` 已上传 `release/*`。已匿名下载 `releases/latest/download/xxtplay.user.js`，SHA-256 与 `585FBF18F94A62D1E9361E281446A5AE6BFAD78920A429B40A0C45ABD6210298` 一致。后续版本沿用同样流程，发布前先核对仓库归属。
6. 检查发布包与 Git 追踪内容，排除密钥、私人课程数据、`.local/`、`.cache/`、`node_modules/`、`test-results/`、`dsh-usage/` 和个人日志。最终仅清理已确认由本项目产生且不再需要的临时文件；不要误删用户文件。

## 环境与隐私注意

- 已观察到 Node `v24.19.0`、npm `11.17.0`、Git `2.55.0.windows.3`，依赖已安装。GitHub CLI `gh` 未登录。
- 本机 Playwright Chromium 下载未完成，e2e 使用系统 Chrome：`$env:PW_CHANNEL='chrome'; npm run check`。`playwright.config.ts` 会读取该环境变量；未设置时仍使用 Playwright 自带 Chromium。
- `.local/` 包含从真实课程保存的页面及资源，可能含账号标识、课程数据或认证参数，**不得提交、上传、公开或作为公开测试夹具**。
- 不要把带认证参数的课程链接、账号信息、API Key 或原始私密截图写入公开文件。
- 当前交接阶段无需关闭浏览器或停止课程队列；不要擅自刷新用户正在学习的页面。
