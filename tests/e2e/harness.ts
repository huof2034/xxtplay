import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { DEFAULT_CONFIG, emptyAccount, type AccountState, type Course, type PlaybackConfig } from '../../src/types';

export interface HarnessOptions { mode?: 'quiz' | 'exam' | 'video' | 'document' | 'catalogue' | 'discussion' | 'home'; apiStatus?: number; invalidAnswer?: boolean; unknownQuestion?: boolean; efficient?: boolean; requirement?: string; noReceipt?: boolean; receiptDelay?: number; earlyReceipt?: boolean; summary?: boolean; autoRun?: boolean; secondCourse?: boolean; crossOrigin?: boolean; embeddedExam?: boolean; blockAutoplay?: boolean; abortPlayOnce?: boolean; muted?: boolean; lazyTask?: boolean; speedAllowed?: boolean; seekAllowed?: boolean; legacyHomeEntry?: boolean; homeWithChapter?: boolean; extraEmptyAudio?: boolean; playback?: Partial<PlaybackConfig> }
export interface Harness {
  page: Page; context: BrowserContext; values: Map<string, any>; apiCalls: { body: any; purpose: string }[]; submissions: { jobId: string; kind: string }[];
  state(): AccountState; close(): Promise<void>;
}
const ACCOUNT_KEY = 'xxtplay:v1:account:111';
export const course = (id = '100'): Course => ({ id, classId: '200', cpi: '300', key: `${id}:200`, title: id === '100' ? '测试课程甲' : '测试课程乙', url: `https://mooc1.chaoxing.com/mycourse/studentstudy?courseId=${id}&clazzid=200&chapterId=10&cpi=300&enc=fixture`, enabled: true, efficiencyMode: false, summaryEnabled: false, order: id === '100' ? 0 : 1 });

async function mediaBytes(): Promise<Buffer> {
  const file = path.resolve('.cache/fixture.webm');
  if (existsSync(file)) return readFile(file);
  await mkdir('.cache', { recursive: true });
  const browser = await chromium.launch({ headless: true }); const p = await browser.newPage();
  const data = await p.evaluate(async () => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180; const ctx = canvas.getContext('2d')!;
    const stream = canvas.captureStream(10); const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=vp8' }); const chunks: Blob[] = [];
    recorder.ondataavailable = e => chunks.push(e.data); const done = new Promise<string>(resolve => { recorder.onstop = () => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(new Blob(chunks, { type: 'video/webm' })); }; });
    recorder.start(); let frame = 0; const draw = setInterval(() => { ctx.fillStyle = frame % 2 ? '#586bd2' : '#26365c'; ctx.fillRect(0, 0, 320, 180); ctx.fillStyle = '#fff'; ctx.font = '24px sans-serif'; ctx.fillText(`Playback ${++frame}`, 50, 95); }, 100);
    await new Promise(resolve => setTimeout(resolve, 8000)); clearInterval(draw); recorder.stop(); const result = await done; stream.getTracks().forEach(t => t.stop()); return result;
  });
  await browser.close(); const bytes = Buffer.from(data, 'base64'); await writeFile(file, bytes); return bytes;
}
const tinyPng = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6D1sAAAAASUVORK5CYII=';
function questionHtml(unknown = false): string {
  const choice = (id: string, title: string, type: number, options: string[], picture = false) => `<div class="TiMu" id="${id}"><input id="answertype${id}" type="hidden" value="${type}"><div class="Zy_TItle"><div class="clearfix">${title}${picture ? `<img alt="测试图片" src="${tinyPng}">` : ''}</div></div><ul>${options.map((o, i) => `<li><label><input type="${type === 1 ? 'checkbox' : 'radio'}" name="${id}" value="o${i}"></label><span class="after">${o}</span></li>`).join('')}</ul></div>`;
  return choice('one', '2+2=?', unknown ? 99 : 0, ['4', '5']) + choice('many', 'Select even numbers', 1, ['2', '4', '3']) + choice('judge', 'Earth is round', 3, ['正确', '错误']) + `<div class="TiMu" id="blanks"><input id="answertypeblanks" type="hidden" value="2"><div class="Zy_TItle"><div class="clearfix">Fill colors</div></div><ul><li><textarea aria-label="blank one"></textarea></li><li><textarea aria-label="blank two"></textarea></li></ul></div>` + `<div class="TiMu" id="short"><input id="answertypeshort" type="hidden" value="4"><div class="Zy_TItle"><div class="clearfix">Describe greeting</div></div><textarea aria-label="short answer"></textarea></div>` + choice('picture', 'Picture question', 0, ['A picture', 'Another picture'], true);
}
const shell = (body: string, script = '') => `<!doctype html><html><head><meta charset="utf-8"><title>测试课程甲</title><style>body{font:16px sans-serif;margin:25px}.TiMu{padding:12px;margin:8px;border:1px solid #ddd}li{padding:5px}.after{cursor:pointer}.posCatalog_select{padding:12px}iframe{width:900px;height:700px;border:0}.reader-container{height:220px;overflow:auto}.task-condition{padding:10px}</style></head><body>${body}<script>${script}</script></body></html>`;

export async function createHarness(context: BrowserContext, options: HarnessOptions = {}): Promise<Harness> {
  const values = new Map<string, any>(); const state = emptyAccount('111'); state.autoRun = options.autoRun ?? true;
  state.courses = [{ ...course(), ...(options.legacyHomeEntry ? { url: 'https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?courseid=100&clazzid=200&cpi=300' } : {}), efficiencyMode: options.efficient ?? false, summaryEnabled: options.summary ?? false }, ...(options.secondCourse ? [course('101')] : [])];
  values.set(ACCOUNT_KEY, state); values.set('xxtplay:v1:config', { ...DEFAULT_CONFIG, muted: options.muted ?? true, playback: { ...DEFAULT_CONFIG.playback, ...options.playback }, ai: { ...DEFAULT_CONFIG.ai, provider: 'custom', baseUrl: 'https://ai.example.invalid', apiKey: options.mode === 'video' || options.mode === 'document' && !options.summary ? '' : 'fixture-key' } });
  const apiCalls: Harness['apiCalls'] = []; const submissions: Harness['submissions'] = []; const passed = new Set<string>();
  await context.addCookies([{ name: '_uid', value: '111', domain: '.chaoxing.com', path: '/', secure: true, sameSite: 'Lax' }]);
  await context.exposeBinding('__fixtureGmInit', () => Object.fromEntries(values));
  await context.exposeBinding('__fixtureGmSet', async ({ frame }, key: string, value: any) => {
    const old = values.get(key); if (value === null) values.delete(key); else values.set(key, structuredClone(value));
    await Promise.allSettled(context.pages().flatMap(p => p.frames()).filter(f => f !== frame).map(async target => {
      await target.evaluate(({ key, old, value }) => { const w = window as any; if (!w.__gmValues) return; if (value === null) delete w.__gmValues[key]; else w.__gmValues[key] = value; for (const listener of w.__gmListeners.values()) if (listener.key === key) listener.callback(key, old, value, true); }, { key, old, value });
    }));
  });
  await context.exposeBinding('__fixturePass', (_source, jobId: string) => { passed.add(jobId); });
  await context.exposeBinding('__fixtureSubmit', (_source, jobId: string, kind: string) => { submissions.push({ jobId, kind }); });
  const bundle = await readFile('dist/xxtplay.user.js', 'utf8');
  await context.addInitScript({ content: `
    window.__gmValues={};window.__gmListeners=new Map();let listenerSequence=0;
    window.GM_getValue=(key,fallback)=>structuredClone(Object.hasOwn(window.__gmValues,key)?window.__gmValues[key]:fallback);
    window.GM_setValue=(key,value)=>{window.__gmValues[key]=structuredClone(value);void window.__fixtureGmSet(key,value)};
    window.GM_deleteValue=key=>{delete window.__gmValues[key];void window.__fixtureGmSet(key,null)};
    window.GM_addValueChangeListener=(key,callback)=>{const id=++listenerSequence;window.__gmListeners.set(id,{key,callback});return id};
    window.GM_removeValueChangeListener=id=>window.__gmListeners.delete(id);window.GM_registerMenuCommand=()=>{};window.GM_notification=()=>{};
    window.unsafeWindow=window;
    window.GM_xmlhttpRequest=details=>{const control=new AbortController();fetch(details.url,{method:details.method,headers:details.headers,body:details.data,signal:control.signal}).then(async r=>details.onload({status:r.status,responseText:await r.text(),responseHeaders:''})).catch(e=>e.name==='AbortError'?details.onabort?.():details.onerror());return{abort:()=>control.abort()}};
    ${options.blockAutoplay ? `const __xxtOriginalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(!this.muted)return Promise.reject(new DOMException('Autoplay blocked by test','NotAllowedError'));return __xxtOriginalPlay.call(this)};` : ''}
    ${options.abortPlayOnce ? `let __xxtAbort=true;const __xxtOriginalPlay=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(__xxtAbort){__xxtAbort=false;return Promise.reject(new DOMException('interrupted by test','AbortError'))}return __xxtOriginalPlay.call(this)};` : ''}
    const attach=Element.prototype.attachShadow;Element.prototype.attachShadow=function(options){return attach.call(this,{...options,mode:'open'})};
    const install=()=>{${bundle}\n};
    window.__fixtureGmInit().then(data=>{window.__gmValues=data;if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install,{once:true});else install()});
  ` });
  await context.route('https://ai.example.invalid/**', async route => {
    const body = route.request().postDataJSON(); const system = body.messages[0].content; const isSummary = system.includes('复习资料助手'); apiCalls.push({ body, purpose: isSummary ? 'summary' : 'answer' });
    if (options.apiStatus) { await route.fulfill({ status: options.apiStatus, body: '{}' }); return; }
    let answer = '# 复习重点\n\n根据材料：问候和文化交流。\n\n## 自测\n问候如何体现文化？';
    if (!isSummary) {
      const raw = body.messages[1].content; const prompt = JSON.parse(typeof raw === 'string' ? raw : raw[0].text);
      let response: any = { optionIds: options.invalidAnswer ? ['o9'] : prompt.title.includes('even') ? ['o0', 'o1'] : ['o0'], values: [], explanation: '示例解释，尚未经教师核验', uncertain: false };
      if (prompt.type === 'completion') response = { values: ['red', 'blue'], explanation: '填空解析', uncertain: false };
      if (prompt.type === 'short') response = { values: ['Hello'], explanation: '简答解析', uncertain: false };
      answer = JSON.stringify(response);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ choices: [{ message: { content: answer }, finish_reason: 'stop' }], usage: { prompt_tokens: 20, completion_tokens: 10 } }) });
  });
  const media = ['video', 'catalogue'].includes(options.mode || '') || options.homeWithChapter ? await mediaBytes() : Buffer.alloc(0);
  await context.route('https://*.chaoxing.com/**', async route => {
    const u = new URL(route.request().url()); const id = u.searchParams.get('courseId') || u.searchParams.get('courseid') || '100'; const jobId = `job-${id}`;
    if (u.pathname === '/fixture.webm') { await route.fulfill({ contentType: 'video/webm', body: media }); return; }
    if (options.mode === 'home' && u.pathname === '/visit/stucoursemiddle') {
      await route.fulfill({ contentType:'text/html', body:shell('', `location.href='https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu?courseid=100&clazzid=200&cpi=300&enc=fixture'`) }); return;
    }
    if (options.mode === 'home' && u.pathname === '/base') {
      await route.fulfill({ contentType: 'text/html', body: shell(`<input id="userId" value="111" type="hidden">
        <div class="course-card"><a href="https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=100&clazzid=200&cpi=300"><span class="course-name" title="测试课程甲">测试课程甲</span></a><p class="line2 color3" title="张老师">张老师</p><div>已完成任务点 1/2</div></div>
        <div class="course-card"><a href="https://mooc1.chaoxing.com/visit/stucoursemiddle?courseid=101&clazzid=201&cpi=301"><span class="course-name" title="测试课程乙">测试课程乙</span></a><div>已完成任务点 0/3</div></div>`) });
      return;
    }
    if (options.mode === 'home' && u.pathname.includes('/mycourse/stu')) {
      if (!u.searchParams.has('enc') && u.pathname.endsWith('/stu')) { await route.fulfill({ contentType:'text/html', body:shell('无效的参数') }); return; }
      const chapter = options.homeWithChapter ? '<a title="章节" data-url="/mooc2-ans/mycourse/studentcourse" href="#">章节</a><div id="chapter-slot"></div>' : '';
      const script = options.homeWithChapter ? `document.querySelector('a[title="章节"]').onclick=()=>{if(!document.querySelector('#chapter-slot iframe'))document.querySelector('#chapter-slot').innerHTML='<iframe src="https://mooc1.chaoxing.com/fixture/chapter?courseId=100&clazzid=200"></iframe>'};` : '';
      await route.fulfill({ contentType: 'text/html', body: shell('<input id="userId" value="111" type="hidden"><h1>测试课程甲</h1>' + chapter, script) }); return;
    }
    if (options.homeWithChapter && u.pathname === '/fixture/chapter') {
      await route.fulfill({ contentType:'text/html', body:shell('<div class="posCatalog_select posCatalog_active" id="cur10"><span class="posCatalog_name">第一章</span></div><iframe src="https://mooc1.chaoxing.com/mooc-ans/knowledge/cards?courseid=100&clazzid=200&knowledgeid=10"></iframe>') }); return;
    }
    if (options.embeddedExam && u.pathname.includes('/exam/test/')) {
      await route.fulfill({ contentType: 'text/html', body: shell('<input id="userId" value="111" type="hidden"><h1>考试外层页面</h1><iframe src="https://mooc1.chaoxing.com/work/doHomeWorkNew?workId=900&courseId=100&clazzid=200"></iframe>') }); return;
    }
    if (u.pathname.includes('/knowledge/cards')) {
      const attachment = { job: true, isPassed: passed.has(jobId), jobid: jobId, property: { _jobid: jobId, module: 'insertvideo', name: '测试视频', mid: 'm1', fastforward: options.seekAllowed ? 'true' : 'false', doublespeed: options.speedAllowed ? 1 : 0 } };
      const player = `/ananas/modules/video/index.html?jobid=${jobId}&courseId=${id}&clazzid=200`;
      const context = `var mArg=${JSON.stringify({ attachments: [attachment], defaults: { userid: '111', courseid: id, clazzId: '200' }, coursename: '测试课程甲' })};`;
      const condition = `<div class="ans-job-icon"><div class="task-condition">${options.requirement ?? '完成条件 观看时长需 ≥ 总时长的 90% (未完成任务点前, 当前视频不可拖拽)'}</div></div>`;
      if (options.lazyTask) {
        await route.fulfill({ contentType: 'text/html', body: shell(`<div class="ans-attach-ct" id="lazy-point">${condition}<div id="lazy-slot"></div></div>`, `${context}document.querySelector('.ans-job-icon').addEventListener('click',()=>{if(document.getElementById('lazy-slot').children.length)return;var f=document.createElement('iframe');f.className='ans-insertvideo-online';f.setAttribute('data',JSON.stringify({jobid:'${jobId}'}));f.src='${player}';document.getElementById('lazy-slot').append(f)});`) }); return;
      }
      await route.fulfill({ contentType: 'text/html', body: shell(`<div class="ans-attach-ct">${condition}<iframe data='${JSON.stringify({ jobid: jobId })}' src="${player}"></iframe></div>`, context) }); return;
    }
    if (u.pathname.includes('/ananas/modules/video')) {
      const mark = `parent.mArg.attachments[0].isPassed=true;parent.document.querySelector('.ans-attach-ct').classList.add('ans-job-finished');void window.__fixturePass('${jobId}');top.postMessage({platform:'passed',jobId:'${jobId}'},'*')`;
      await route.fulfill({ contentType: 'text/html', body: shell(`${options.extraEmptyAudio ? '<audio></audio>' : ''}<video id="video_html5_api" muted controls src="/fixture.webm"></video>`, `const video=document.querySelector('video');let accepted=false;video.addEventListener('timeupdate',()=>{if(!accepted&&video.duration&&video.currentTime>=video.duration*${options.earlyReceipt ? '.1' : '.9'}){accepted=true;${options.noReceipt ? '' : `setTimeout(()=>{${mark}},${options.receiptDelay || 0})`}}});`) }); return;
    }
    if (options.mode === 'video' || options.mode === 'catalogue') {
      const host = options.crossOrigin ? 'https://mooc2-ans.chaoxing.com' : 'https://mooc1.chaoxing.com';
      const cardsHost = 'https://mooc1.chaoxing.com';
      const chapters = options.mode === 'catalogue' ? `<div class="posCatalog_select posCatalog_active" id="cur10"><span class="posCatalog_name">第一章</span><i class="${passed.has(jobId) ? 'icon_Completed' : ''}"></i></div>` : '';
      await route.fulfill({ contentType: 'text/html', body: shell(`<input id="userId" value="111" type="hidden"><div class="course-name">${id === '100' ? '测试课程甲' : '测试课程乙'}</div>${chapters}<iframe id="iframe" src="${cardsHost}/mooc-ans/knowledge/cards?courseid=${id}&clazzid=200&knowledgeid=10"></iframe>`, `window.addEventListener('message',e=>{if(e.data?.platform==='passed')document.querySelector('.posCatalog_select i')?.classList.add('icon_Completed')});`) }); return;
    }
    if (options.mode === 'document') {
      await route.fulfill({ contentType: 'text/html', body: shell(`<input id="userId" value="111" type="hidden"><div class="reader-container" id="reader"><div style="height:750px">问候与跨文化交际的课程材料。<p>问候方式受文化背景影响。</p><p>学习材料用于整理复习，不应编造来源。</p></div></div>`, `var mArg={attachments:[{job:true,isPassed:false,jobid:'doc1',property:{_jobid:'doc1',module:'insertdoc',name:'测试文档'}}],defaults:{userid:'111',courseid:'100',clazzId:'200'}};document.querySelector('#reader').addEventListener('scroll',e=>{const el=e.target;if(el.scrollTop+el.clientHeight>=el.scrollHeight-5)mArg.attachments[0].isPassed=true});`) }); return;
    }
    if (options.mode === 'discussion') {
      await route.fulfill({ contentType: 'text/html', body: shell('<input id="userId" value="111" type="hidden"><div class="discussion-title">请讨论问候方式与文化的关系</div><textarea></textarea><button id="reply">发布</button><div id="replies"></div>', `document.querySelector('#reply').onclick=()=>{const content=document.createElement('div');content.className='reply-content';content.textContent=document.querySelector('textarea').value;document.querySelector('#replies').append(content);void window.__fixtureSubmit('discussion1','discussion')};`) }); return;
    }
    const exam = options.mode === 'exam'; const submitId = exam ? 'submitExam' : 'btnBlueSubmit';
    const button = `<button id="${submitId}">${exam ? '交卷' : '提交作业'}</button><div class="testTit_status"></div><div role="dialog" style="display:none"><p>${exam ? '确认交卷' : '确认提交作业'}</p><button id="confirm">确定</button></div>`;
    await route.fulfill({ contentType: 'text/html', body: shell(`<input id="userId" value="111" type="hidden"><h1>${exam ? '测试考试' : '测试作业'}</h1>${questionHtml(options.unknownQuestion)}${button}`, `document.querySelector('#${submitId}').onclick=()=>document.querySelector('[role=dialog]').style.display='block';document.querySelector('#confirm').onclick=()=>{void window.__fixtureSubmit('${jobId}','${exam ? 'exam' : 'quiz'}');document.querySelector('[role=dialog]').style.display='none';${options.noReceipt ? '' : "document.querySelector('.testTit_status').textContent='已提交';document.querySelector('.testTit_status').classList.add('testTit_status_complete')"}};`) });
  });
  const page = await context.newPage();
  const routePath = options.mode === 'home' ? '/base' : options.mode === 'exam' ? '/mooc-ans/exam/test/reVersionTestStartNew?examId=55&courseId=100&clazzid=200' : options.mode === 'discussion' ? '/bbs/discuss?courseId=100&clazzid=200' : '/mycourse/studentstudy?courseId=100&clazzid=200&chapterId=10&enc=fixture';
  const host = options.mode === 'home' ? 'https://i.chaoxing.com' : options.crossOrigin ? 'https://mooc2-ans.chaoxing.com' : 'https://mooc1.chaoxing.com';
  await page.goto(host + routePath); await expect(page.locator('#xxtplay-root')).toBeAttached({ timeout: 20_000 });
  return { page, context, values, apiCalls, submissions, state: () => values.get(ACCOUNT_KEY), close: async () => { await context.close(); } };
}
