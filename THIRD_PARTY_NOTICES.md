# 第三方软件声明

xxtplay 的 `dist/xxtplay.user.js` 包含以下第三方代码或许可证要求保留的声明。完整许可证文本随仓库和发布资产一起提供。

## OCS（ocsjs/ocsjs）

- 项目：<https://github.com/ocsjs/ocsjs>
- 固定提交：`da5c0775a9d055724149ff505eae75bd85d334f9`
- 许可证：MIT，Copyright (c) 2022 enncy
- 使用方式：答题选项匹配算法的改编与移植，位于 `src/vendor/ocs/`；调度与学习通选择器为独立实现并单独标注。
- 来源映射与修改说明：`licenses/ocs-provenance.json`
- 许可证全文：`licenses/OCS-MIT.txt`

本项目的答题流程（发现题目、请求 AI、校验答案、回填与提交）为独立实现，不复制 OCS 的 Worker/调度代码。

## string-similarity

- 版本：4.0.4
- 许可证：MIT，Copyright (c) 2018 Akash Kurdekar
- 用途：选项文本相似度匹配（`src/vendor/ocs/match-string.ts`、`multiple.ts`）
- 说明：npm 元数据将该包标为 ISC，但包内 `LICENSE` 文件为 MIT；以许可文本为准。

## html2canvas

- 版本：1.4.1
- 许可证：MIT，Copyright (c) 2012 Niklas von Hertzen
- 用途：在无法直接读取题目图片时，对题目区域进行本地截图并以 data URL 发送给用户配置的 AI 服务。

## 仅用于构建/测试的工具（不随用户脚本分发）

- esbuild（MIT）
- TypeScript（Apache-2.0）
- Playwright（Apache-2.0）
- Vitest（MIT）
- fflate（MIT，开发依赖，当前未进入运行时包）

## MIT 许可证文本

以下文本适用于 OCS、string-similarity 和 html2canvas，版权声明分别见上文章节。

```text
MIT License

Copyright (c) the respective copyright holders listed above.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
