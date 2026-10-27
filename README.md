# xxtplay 学习通课程助手

xxtplay 是一个运行在 Chrome / Edge + Tampermonkey 上的学习通（超星）课程辅助脚本：按课程队列播放视频和音频、阅读文档、处理课程题目与讨论、按课程生成复习资料，并把 AI 严格限制在「答题」和「用户开启的复习整理」两件事上。考试可以自动填答，但**最终交卷必须由用户在当前试卷上明确确认**。

> 本项目用于个人学习进度管理。请遵守学校规定与平台服务条款，不要用于替考、代刷或绕过验证码、人脸验证等安全措施。脚本按平台真实回执判断完成，不把「模拟测试通过」当作真实课程验收。

当前版本：`0.2.0`（首个公开发布版本）。真实验收状态见 [docs/ACCEPTANCE.md](docs/ACCEPTANCE.md)。

## 功能

- 课程队列：勾选多门课程，按顺序切换章节与课程，断点保存在油猴存储中。
- 真实播放：使用页面自带的视频/音频元素播放，不用倍速或跳转伪造进度；支持嵌套 iframe 和跨域页面协作。
- 自动播放修复：识别浏览器自动播放策略，优先静音开始；区分播放器加载造成的 `AbortError` 并重试；极端情况下在视频内显示一次性点击提示，而不是直接报错停摆。
- 效率模式（每门课单独开启，默认关闭）：只依据页面明确给出的最低观看时长或比例，满足全部条件并等到平台明确确认通过才继续；条件未知、冲突或无法解析时完整播放，不猜统一比例。
- 题目与讨论：单选、多选、判断、填空、简答、图片题；有未解决题目的作业不提交；讨论发布前检查是否已发布，避免重复。
- 复习资料：按课程开启，只整理实际采集到的材料；视频没有可读字幕时会标注缺失，不编造内容。
- 考试安全：用户手动开始考试；脚本可自动填答，但交卷前必须在面板中勾选确认并点击按钮；刷新、超时或重试不会继承交卷授权。
- AI 服务商：DeepSeek、通义千问（阿里云百炼）、Kimi（月之暗面），以及任意 OpenAI Chat Completions 兼容接口；文本模型和视觉模型分别选择。

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/)（Chrome / Edge）。
2. 在扩展管理页开启「开发者模式」，并在 Tampermonkey 中允许运行用户脚本。
3. 安装脚本：
   - 本地构建：`npm install && npm run build`，在 Tampermonkey 中新建脚本并粘贴 `dist/xxtplay.user.js`；或直接把该文件拖入浏览器。
   - 公开发布后：从 GitHub Releases 下载 `xxtplay.user.js`（更新地址使用 `xxtplay.meta.js`）。
4. 打开学习通并登录，进入课程学习页；右下角会出现「xxtplay · 学习助手」面板。

脚本只匹配 `*.chaoxing.com`。AI 请求通过油猴的跨域请求能力发出，首次使用自定义域名时 Tampermonkey 会要求授权。

## 快速开始

1. 打开一门已选课程，点击面板中的「识别课程」。
2. 在「课程」中勾选要学习的课程；需要时开启「效率模式」或「复习资料」。
3. 点击「开始队列」。面板会显示任务状态、播放进度和平台回执。
4. 遇到验证码、人脸验证、登录失效等，脚本会暂停并提示，由你本人处理。

## AI 设置（DeepSeek / Qwen / Kimi / 自定义）

打开面板「AI 设置」：

1. 选择**服务商**，API 地址会自动填充，也可以手动修改。
2. 粘贴该服务商的 API Key。
3. 选择**文本模型**；有图片题时再选择**视觉模型**。下拉底部有「自定义…」，可直接填写服务商控制台里的模型 ID。
4. 点击「保存设置」。保存不会调用 AI，也不会消耗额度。

| 服务商 | API 地址 | 文本模型示例 | 视觉模型示例 | 获取 Key |
| --- | --- | --- | --- | --- |
| DeepSeek | `https://api.deepseek.com` | `deepseek-flash`、`deepseek-v4-pro` | `deepseek-flash` | <https://platform.deepseek.com/api_keys> |
| 通义千问（阿里云百炼） | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen3.8-max`、`qwen3.7-plus`、`qwen3.8-flash` | `qwen3.8-max`、`qwen3.7-plus` | <https://bailian.console.aliyun.com/> |
| Kimi（月之暗面） | `https://api.moonshot.cn/v1` | `kimi-k3.1-pro`、`kimi-k3`、`kimi-k2.6`、`kimi-k2.7-code` | `kimi-k3.1-pro`、`kimi-k3`、`kimi-k2.6` | <https://platform.kimi.com/console/api-keys> |
| 自定义 | 任意 HTTPS 地址（localhost 例外） | 手填 | 手填，可留空 | 由服务商提供 |

模型 ID 依据 2026-10-27 的官方文档整理：[DeepSeek 模型与价格](https://api-docs.deepseek.com/quick_start/pricing)、[阿里云百炼模型列表](https://www.alibabacloud.com/help/en/model-studio/models)、[Kimi 模型列表](https://platform.kimi.com/docs/models)。服务商会下线旧模型，若调用返回 404，请选择「自定义…」并填写控制台当前可用的模型 ID。

注意事项：

- **一个 Key 槽位**：切换服务商后必须重新填写该服务商的 Key；留空且服务商未变时会保留旧 Key。
- **视觉模型可以留空**：选择「不使用（图片题保留待办）」后，纯文本题仍可作答；含图片的题目会保留待办，不会猜测，也不会因此提交整份作业。复习资料会注明有多少张图片材料未分析。
- **Qwen 地域**：API Key 与地域绑定。控制台给出专属 Workspace 域名时，把 API 地址改为 `https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` 等形式。
- **Kimi K2 系列**计划于 2026 年 12 月底下线，优先选择 K3.1 Pro / K3。
- **DeepSeek `deepseek-v4-pro` 不支持图片**；图片题请把视觉模型设为 `deepseek-flash`。
- Key 只保存在油猴存储中，不写入导出配置、日志或审计记录；日志中的 `Bearer`、`sk-` 和常见认证参数会被遮蔽。

AI 请求只发生在两处：题目作答（含讨论题）和用户点击「生成／更新复习资料」。播放、导航、效率条件解析、文档阅读都不会调用 AI。题目和图片会发送给你选择的服务商；复习整理会发送该课程采集到的材料。

## 自动播放与浏览器限制

Chrome / Edge 的自动播放规则是：**静音自动播放始终允许**；有声自动播放需要用户与站点交互过、媒体互动指数足够高，或站点被加入允许列表。脚本的处理顺序：

1. 先按你的「音视频静音播放」设置尝试；如果浏览器拒绝有声播放，自动改为静音并重试。
2. 如果 `play()` 因播放器加载或自身暂停被打断（`AbortError`），等待媒体就绪后重试，不误报成「浏览器阻止自动播放」。
3. 如果静音仍被拦截，在视频内显示提示条：「浏览器要求一次点击，点击视频任意处自动继续播放」。脚本会挂一次性监听，点到视频区域后自动继续；只有等待超时才暂停队列并提示重试。
4. 静音开始后，如果关闭了静音选项，脚本会尝试恢复声音；若恢复导致暂停，会退回静音并在日志中说明。

仍需知道的限制：

- 跨域 iframe 若没有 `allow="autoplay"`，父页面脚本无法修改权限策略；这种情况需要站点或浏览器放行，脚本会在日志中说明。
- 企业策略（如 `AutoplayAllowed`、`AutoplayAllowlist`）或浏览器「阻止自动播放」设置可能要求一次真实点击，脚本无法绕过。
- 后台标签页没有用户手势，只能依赖静音自动播放；浏览器冻结页面、系统休眠或关闭浏览器时脚本不会继续运行。请保持浏览器打开并允许标签页在后台运行。
- 可在 `chrome://media-engagement` 查看站点媒体互动状态；不同 Chrome 版本的自动播放设置入口可能不同。

## 效率模式

每门课单独开关，默认关闭。脚本只解析页面或平台明确写出的「观看时长需 ≥ 总时长的 90%」「至少观看 N 分钟」等完成条件；满足全部条件后，还会等待平台明确返回任务点通过才标记完成。条件未知、来源冲突或无法解析时回退为完整播放，不使用统一比例，也不把分数权重当作通过阈值。

## 考试安全

- 考试必须由用户本人在平台上开始，脚本不会自动开始真实考试。
- 脚本可以读取并填答题目，但交卷前会打开「考试答案已整理 · 等待人工交卷」面板。
- 只有勾选「我已检查当前试卷，确认交卷」并点击「确认提交本次考试」，才会发出提交请求；确认只对当前考试、本次提交有效。
- 刷新、超时、重试或换标签页都不会继承交卷授权；有未解决题目时不会自动提交。

## 复习资料

在「课程」中为课程开启「复习资料」，运行过程中会采集文档、字幕和题目材料。之后在「复习」中点击「生成／更新复习资料」，按章节生成中文 Markdown，并可导出。未配置视觉模型时，图片材料会在「材料缺失情况」中标注为未分析；题目原始 AI 答案尚未经教师核验，不会被称作标准答案。

## 隐私与数据

- API Key 保存在 Tampermonkey 存储中；导出配置、日志和 AI 审计记录都不包含 Key。
- 课程材料、题目和图片只保存在本机油猴存储中；只有答题和复习整理会把你选择的材料发送给对应 AI 服务商。
- 脚本不上传遥测，不读取学习通密码，不保存身份认证参数。
- 仓库中的 `.local/` 是从真实课程保存的页面与资源，可能含账号标识和课程数据，已被 `.gitignore` 排除，不能提交或作为公开测试夹具。
- 发布包只包含源码、构建产物和文档；发布前会检查密钥、私有路径和测试夹具标记。

## 开发

要求 Node.js 24+、npm 11+。

```powershell
npm install
npm run typecheck
npm test            # 单元测试
npm run build       # 生成 dist/xxtplay.user.js 和 dist/xxtplay.meta.js
npm run test:e2e    # Playwright 模拟页面
npm run check       # 上述检查串联执行
npm run package     # 生成 release/、SHA256SUMS.txt
```

如果 `npx playwright install chromium` 下载失败，可使用本机 Chrome 跑模拟页面：

```powershell
$env:PW_CHANNEL='chrome'
npm run test:e2e
```

`npm run check` 也会读取 `PW_CHANNEL`，因此 `$env:PW_CHANNEL='chrome'; npm run check` 可在没有 Playwright 浏览器的机器上完成检查。

目录结构：

- `src/platform/`：学习通页面适配、跨 iframe 消息与考试上下文。
- `src/core/`：媒体播放与自动播放策略、效率条件、文档、答题、讨论、复习、考试门禁、跨标签页租约。
- `src/ai/`：AI 客户端、传输层、服务商与模型目录。
- `src/ui/panel.ts`：中文面板和考试确认界面。
- `src/vendor/ocs/`：OCS MIT 许可的答题匹配算法改编；来源见 `licenses/`。
- `tests/unit/`、`tests/e2e/`：单元测试与 Playwright 模拟页面。

## 许可

本项目以 MIT 许可发布，见 [LICENSE](LICENSE)。第三方代码与许可证见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 `licenses/`。
