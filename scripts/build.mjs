import { build } from 'esbuild';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const header = `// ==UserScript==
// @name         xxtplay 学习通助手
// @namespace    https://github.com/huof2034/xxtplay
// @version      ${pkg.version}
// @description  课程队列、真实播放、按课程开启的效率模式、AI答题和复习资料；考试须人工确认交卷
// @author       huof2034; OCS contributors
// @license      MIT
// @match        *://*.chaoxing.com/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_deleteValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_notification
// @grant        GM_registerMenuCommand
// @grant        unsafeWindow
// @connect      api.deepseek.com
// @connect      dashscope.aliyuncs.com
// @connect      *.maas.aliyuncs.com
// @connect      api.moonshot.cn
// @connect      *.chaoxing.com
// @connect      *
// @homepageURL  https://github.com/huof2034/xxtplay
// @supportURL   https://github.com/huof2034/xxtplay/issues
// @downloadURL  https://github.com/huof2034/xxtplay/releases/latest/download/xxtplay.user.js
// @updateURL    https://github.com/huof2034/xxtplay/releases/latest/download/xxtplay.meta.js
// ==/UserScript==`;
await mkdir(new URL('../dist/', import.meta.url), { recursive: true });
await build({
  entryPoints: ['src/main.ts'], outfile: 'dist/xxtplay.user.js', bundle: true, format: 'iife',
  platform: 'browser', target: ['chrome120', 'edge120'], charset: 'utf8', legalComments: 'inline',
  banner: { js: header }, define: { __VERSION__: JSON.stringify(pkg.version) }, sourcemap: false,
});
await writeFile(new URL('../dist/xxtplay.meta.js', import.meta.url), header + '\n', 'utf8');
console.log(`Built xxtplay ${pkg.version}`);
