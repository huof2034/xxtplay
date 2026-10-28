# xxtplay 项目交接

更新时间：2026-10-28。项目目录：`D:\xxtplay`。当前版本：`0.5.3`。

## 当前状态

- 源码、模拟测试、真实页面样本已检查。`npm run check`（`PW_CHANNEL=chrome`）通过：TypeScript、61 项单元测试、构建、36 项 Playwright 模拟页面测试。
- 自动播放：优先静音开始；区分浏览器 `NotAllowedError` 与播放器 `AbortError`；失败时显示一次性点击提示；不会伪造用户手势。
- **0.5.3 修复“播放完一个视频后不继续”**：旧逻辑只要存在已加载的已完成任务就不再打开任务点，导致同章节下一个未加载视频被忽略。现在先过滤待处理任务，再自动打开下一个未完成的任务点；跨域卡片页通过父页面消息请求子页面自行打开任务点。
- 播放自动化：平台允许时自动倍速；为保证实际观看时长，自动拖动已停用。首页课程总览、进度、勾选、运行任务卡定位和可移动面板均已实现。
- AI：DeepSeek、通义千问、Kimi、自定义兼容接口；文本/视觉模型可选；用户已口头表示接入 DeepSeek API，但本仓库测试从不读取用户密钥，也未向真实 DeepSeek 发起请求。
- 已公开：<https://github.com/huof2034/xxtplay>；`main` 与 `v0.2.0`–`v0.5.3` 标签；最新 Release `v0.5.3`。
- **真实平台验收仍待用户完成**：自动切换下一个视频、五分钟后台、真实 AI 题目/讨论/复习、考试人工确认。模拟页面通过不等于真实平台回执。

## 用户需求和关键约束

- Windows Chrome/Edge 油猴脚本，支持课程队列、后台标签页、进度恢复、视频、音频、文档、题目、讨论和可选复习资料。
- AI **仅用于答题（含讨论）和用户开启的复习整理**；播放、导航、效率判断不能调用 AI。API Key 只存油猴存储，导出配置和日志不得包含密钥。
- 有未解决题目的作业不得提交；考试由用户手动开始，可自动填答，但**最终交卷须用户对当前考试、本次提交明确确认**；刷新/超时/重试不继承授权。不要擅自开始真实考试。
- 效率模式默认关闭，只依据页面明确给出的最低观看时长/比例；未知或冲突时完整播放，不假设统一比例。
- 真实进度以平台结果为准；验证码、人脸验证、登录失效交给用户处理。
- 用户已授权公开发布；发布前核对仓库归属，避免覆盖。

## 已完成

- TypeScript + esbuild；产物 `dist/xxtplay.user.js`、`dist/xxtplay.meta.js`；版本 `0.5.3`。
- 课程队列、跨 iframe、媒体/效率、题型、AI、复习、考试确认、租约、中文面板、主题动画。
- 最近一次全量检查：61 单元 + 36 模拟 e2e + 构建通过；新增“两个视频顺序播放”和“跨域卡片页顺序播放”回归。
- 发布资产由 `npm run package` 生成；当前 SHA-256：
  - `xxtplay.user.js`：`4ED35CA7AAAFAF121C7B955ECF3D218F9FC516EA7BCBEBBEB53E8BC4595D37F2`
  - `xxtplay.meta.js`：`8CA29B316993A6C7E6CF6E6A82B27CD6A7F67B7978976783604E388F71D4BA25`
- 使用 OCS 的 MIT 部分代码，固定提交 `da5c0775a9d055724149ff505eae75bd85d334f9`；来源见 `licenses/`。ChaoXing-AutoAnswer 和 Samueli924/chaoxing 仅作调查参考。
- 真实页面曾复现：0.5.0 主页“无效的参数”；0.5.1 从主页进入章节；0.5.2 修复任务页 `enc校验失败` 与无源音频；0.5.3 修复顺序视频切换。0.5.3 尚未在真实课程确认。

## 关键文件

- `src/runtime.ts`：队列调度、自动打开任务点、章节/课程切换。
- `src/core/playback.ts`、`src/core/media.ts`：自动播放策略、倍速、观看时长与平台回执。
- `src/platform/chaoxing.ts`：任务点、章节、任务页定位、视频页适配。
- `src/platform/bus.ts`：跨 iframe 消息；`requestOpenTask` 用于跨域卡片页。
- `src/platform/courses.ts`：课程列表/进度解析、课程入口。
- `src/ui/panel.ts`、`src/ui/themes.ts`：面板、角色主题与动画。
- `src/ai/`、`src/core/answer.ts`、`src/core/question-worker.ts`、`src/core/summary.ts`：AI 答题与复习。
- `README.md`、`CHANGELOG.md`、`docs/ACCEPTANCE.md`、`scripts/package.mjs`：文档、验收、打包。

## 下一步

1. **用户更新油猴脚本到 0.5.3**，在真实课程中观察：一个视频完成后是否自动打开并播放同章节下一个任务点；若停住，查看面板「运行」最后几行日志（是否有“自动打开任务点”/“当前章节仍有未完成任务点”/平台回执错误）。
2. 做五分钟后台观察，记录起止进度、平台任务点状态、AI 调用次数；浏览器冻结或系统休眠不判通过。
3. 用非关键作业验证真实 DeepSeek 文本题、图片题、讨论、复习总结与失败处理；**不要**读取或导出密钥。真实 AI 调用尚未由自动化验证。
4. 考试仍只在用户主动开始后处理，最终交卷必须人工确认。
5. 新版本发布：`npm run check` → `npm run package` → 提交/打标签 → `git push origin main --tags` → `gh release create vX.Y.Z release/* --notes-file CHANGELOG.md`；发布后匿名下载核对 SHA-256。

## 环境与隐私

- 本机 Playwright Chromium 下载未完成，使用 `$env:PW_CHANNEL='chrome'; npm run check`。
- `gh auth status` 显示未登录；发布使用本机已保存的 GitHub 凭据完成。不要把 token 写入文件或输出。
- `.local/` 可能含账号/课程/认证参数，不得提交、上传或作为公开夹具。
- 不要刷新用户正在学习的页面、不要开始真实考试、不要重复提交任务。清理临时文件时不要误删用户文件（如 `预览图/`、`dsh-usage/`）。
