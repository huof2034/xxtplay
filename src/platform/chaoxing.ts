/*! Chaoxing selectors / attachment mapping adapted from OCS cx.ts, MIT, (c) 2022 enncy and contributors; upstream da5c0775a9d055724149ff505eae75bd85d334f9. */
import html2canvas from 'html2canvas';
import type { Answer, Course, CourseProgress, Question, QuestionKind, TaskKind, WatchRequirement } from '../types';
import type { QuestionHandle } from '../core/question-worker';
import { parseWatchRequirement } from '../core/efficiency';
import { parseCourseCards, parseCourseListHtml, parseCourseProgressHtml, progressFromDocument, type CatalogEntry } from './courses';
import { isChaoxingHost, normalizeText, safeUrl, shortHash, sleep, sourceLink } from '../utils';

type SiteWindow = Window & Record<string, any>;
interface Attachment { isPassed?: boolean; job?: boolean; jobid?: string; property?: Record<string, any>; [key: string]: any }
export interface Chapter { id: string; title: string; completed: boolean; locked: boolean; current: boolean }
export interface PlatformJob { id: string; title: string; kind: TaskKind; passed: boolean; required: boolean; element?: HTMLElement; jobId?: string; metadata?: Attachment }
export interface PlatformSnapshot { jobs: Omit<PlatformJob, 'element' | 'metadata'>[]; chapters: Chapter[]; exam: boolean; blocked?: string }

export function visible(el: Element | null): el is HTMLElement {
  if (!el) return false;
  const win = el.ownerDocument.defaultView;
  return !!win && win.getComputedStyle(el).display !== 'none' && win.getComputedStyle(el).visibility !== 'hidden' && el.getClientRects().length > 0;
}
const text = (el: Element | null): string => normalizeText(el?.textContent || '');
export function localExam(doc: Document): boolean {
  return /\/(?:exam|exam-ans)\//.test(doc.URL) || /\/exam\/(?:test|preview)/.test(doc.URL) ||
    [...doc.querySelectorAll<HTMLInputElement>('input#examId,input[name="examId"],input[name="examid"]')].some(input => !!input.value.trim()) ||
    !!doc.querySelector('[data-exam-id],.exam-paper,.exam-paper-container');
}
export function publicWindow(): SiteWindow { return (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as SiteWindow; }
function relatedWindows(win: SiteWindow): SiteWindow[] {
  const result: SiteWindow[] = [win];
  for (let depth = 0; depth < 5; depth++) {
    try { const parent = result[result.length - 1].parent as SiteWindow; if (parent === result[result.length - 1]) break; void parent.document; result.push(parent); } catch { break; }
  }
  return result;
}
function cookieUid(doc: Document): string | undefined {
  const m = doc.cookie.match(/(?:^|;\s*)_uid=(\d+)/); return m?.[1];
}
export function readAccountId(win = publicWindow()): string | undefined {
  for (const related of relatedWindows(win)) {
    const id = cookieUid(related.document) || related.document.querySelector<HTMLInputElement>('input[name="userid"],input[name="userId"],input#userId')?.value || related.mArg?.defaults?.userid;
    if (/^\d+$/.test(String(id || ''))) return String(id);
  }
  return undefined;
}
export function discoverCourse(win = publicWindow(), fallback?: Course): Course | undefined {
  for (const related of relatedWindows(win)) {
    const u = new URL(related.location.href); const p = u.searchParams;
    const defaults = related.mArg?.defaults || {};
    const input = (selector: string) => related.document.querySelector<HTMLInputElement>(selector)?.value;
    const id = p.get('courseid') || p.get('courseId') || defaults.courseid || defaults.courseId || input('#courseId,input[name="courseId"],input[name="courseid"]');
    const classId = p.get('clazzid') || p.get('clazzId') || p.get('classId') || defaults.clazzId || defaults.clazzid || input('#clazzId,input[name="clazzid"],input[name="clazzId"]');
    if (!/^\d+$/.test(String(id || '')) || !/^\d+$/.test(String(classId || ''))) continue;
    const cpi = p.get('cpi') || defaults.cpi || input('input[name="cpi"]') || fallback?.cpi || '';
    const title = related.mArg?.coursename || text(related.document.querySelector('.course-name,.courseName,.course-info h1,.courseNameDetail,.course_name,.course-title')) || fallback?.title || related.document.title.replace(/ - .*$/, '').trim() || '未命名课程';
    const home = new URL('https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/stu');
    home.searchParams.set('courseid', String(id)); home.searchParams.set('clazzid', String(classId)); if (cpi) home.searchParams.set('cpi', String(cpi));
    // Preserve an existing authenticated course-home URL only inside private GM storage.
    const url = /\/mycourse\/(?:stu|studentcourse)/.test(u.pathname) ? u.href : home.href;
    return { id: String(id), classId: String(classId), cpi: String(cpi), key: `${id}:${classId}`, title, url, enabled: false, efficiencyMode: false, summaryEnabled: false, order: 0 };
  }
  return fallback;
}
export function courseLinks(doc: Document): Course[] {
  const result: Course[] = [];
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href*="courseid="],a[href*="courseId="]')) {
    const u = safeUrl(anchor.href); if (!u || !/(?:studentcourse|mycourse\/stu|studentstudy)/.test(u.pathname)) continue;
    const id = u.searchParams.get('courseid') || u.searchParams.get('courseId'); const classId = u.searchParams.get('clazzid') || u.searchParams.get('clazzId');
    if (!id || !classId || !/^\d+$/.test(id + classId)) continue;
    const key = `${id}:${classId}`; if (result.some(c => c.key === key)) continue;
    result.push({ id, classId, key, cpi: u.searchParams.get('cpi') || '', title: anchor.title || text(anchor) || '未命名课程', url: u.href, enabled: false, efficiencyMode: false, summaryEnabled: false, order: result.length });
  }
  return result;
}
function attachmentId(a: Attachment): string { return String(a.jobid || a.property?._jobid || a.property?.jobid || ''); }

export class ChaoxingAdapter {
  readonly win: SiteWindow;
  inheritedExam = false;
  private chapterElements = new Map<string, HTMLElement>();
  private lastTaskOpenKey = ''; private lastTaskOpenAt = 0;
  constructor(readonly doc: Document = document, win = publicWindow()) { this.win = win; }
  siteFid(): string | undefined {
    for (const win of relatedWindows(this.win)) {
      try {
        const direct = (win as any).fid ?? (win as any)._fid ?? win.document.querySelector<HTMLInputElement>('#fid,input[name="fid"]')?.value;
        if (/^\d+$/.test(String(direct || ''))) return String(direct);
        const html = win.document.documentElement.innerHTML;
        const match = /"fid"\s*:\s*"?(\d+)"?/.exec(html) || /var fid\s*=\s*'(\d+)'/.exec(html);
        if (match) return match[1];
      } catch { /* Cross-origin frames are skipped. */ }
    }
    return undefined;
  }
  courseCards(): CatalogEntry[] { return parseCourseCards(this.doc); }
  async loadCatalog(): Promise<CatalogEntry[]> {
    const fid = this.siteFid(); if (!fid) return [];
    const html = await gmGet(`https://mooc2-ans.chaoxing.com/mooc2-ans/visit/courselistdata?courseType=1&courseFid=${encodeURIComponent(fid)}&courseTeacherid=0&courseOrderBy=0`);
    return parseCourseListHtml(html);
  }
  async loadProgress(course: Course): Promise<CourseProgress | undefined> {
    const middleUrl = new URL('https://mooc1.chaoxing.com/visit/stucoursemiddle');
    middleUrl.searchParams.set('courseid', course.id); middleUrl.searchParams.set('clazzid', course.classId);
    if (course.cpi) middleUrl.searchParams.set('cpi', course.cpi);
    middleUrl.searchParams.set('ismooc2', '1'); middleUrl.searchParams.set('v', '2');
    const middle = await gmGet(middleUrl.href);
    const enc = hiddenInput(middle, 'enc'); const openc = hiddenInput(middle, 'openc');
    if (!enc) return undefined;
    const chapterUrl = new URL('https://mooc2-ans.chaoxing.com/mooc2-ans/mycourse/studentcourse');
    chapterUrl.searchParams.set('courseid', course.id); chapterUrl.searchParams.set('clazzid', course.classId);
    if (course.cpi) chapterUrl.searchParams.set('cpi', course.cpi);
    chapterUrl.searchParams.set('enc', enc); chapterUrl.searchParams.set('openc', openc);
    chapterUrl.searchParams.set('fromMiddle', '1'); chapterUrl.searchParams.set('ut', 's'); chapterUrl.searchParams.set('t', String(Date.now()));
    return parseCourseProgressHtml(await gmGet(chapterUrl.href));
  }
  localProgress(): CourseProgress | undefined {
    const direct = progressFromDocument(this.doc); if (direct) return direct;
    for (const win of relatedWindows(this.win)) {
      try {
        const found = progressFromDocument(win.document); if (found) return found;
        for (const frame of win.document.querySelectorAll<HTMLIFrameElement>('iframe')) {
          try { const nested = frame.contentDocument && progressFromDocument(frame.contentDocument); if (nested) return nested; } catch { /* Cross-origin iframe. */ }
        }
      } catch { /* Cross-origin window. */ }
    }
    return undefined;
  }
  studyUrl(): string {
    for (const win of relatedWindows(this.win)) {
      try {
        const url = new URL(win.location.href);
        // A chapter link requires the platform's own enc parameter; keep it only in private GM task state.
        if (/\/mycourse\/studentstudy/.test(url.pathname) && isChaoxingHost(url.hostname) && url.searchParams.has('enc')) return url.href;
      } catch { /* Cross-origin. */ }
    }
    return sourceLink(this.doc.URL);
  }
  isExam(): boolean {
    return this.inheritedExam || localExam(this.doc) || relatedWindows(this.win).some(win => localExam(win.document));
  }
  blocked(): string | undefined {
    if (/passport2?\.chaoxing\.com|\/login(?:\/|\?|$)/.test(this.doc.URL) || visible(this.doc.querySelector('#loginForm'))) return '登录已失效，请先在学习通登录';
    if ([...this.doc.querySelectorAll('#captcha,.captcha,.yidun_modal,.verify-wrap,.yidun_popup,.faceRecognition,.face-recognition,#faceRecognition')].some(visible)) return '检测到验证码或人脸验证，等待人工处理';
    if ([...this.doc.querySelectorAll('iframe')].some(el => /face|captcha/i.test(el.src) && visible(el))) return '检测到验证码或人脸验证，等待人工处理';
    if (/(?:enc\s*校验失败|无效的参数)/i.test(this.doc.body?.textContent || '')) return '课程入口校验失败，请通过课程列表重新打开';
    return undefined;
  }
  attachmentContext(): { owner?: SiteWindow; attachments: Attachment[] } {
    for (const win of relatedWindows(this.win)) {
      const attachments = win.mArg?.attachments || win.attachments;
      if (Array.isArray(attachments) && attachments.length) return { owner: win, attachments };
    }
    return { attachments: [] };
  }
  private frameJobId(): string {
    for (const win of relatedWindows(this.win)) {
      try {
        const data = win.frameElement?.getAttribute('data');
        if (data) { const parsed = JSON.parse(data); if (parsed.jobid || parsed._jobid) return String(parsed.jobid || parsed._jobid); }
      } catch { /* Cross-origin metadata is deliberately not guessed. */ }
    }
    const p = new URL(this.doc.URL).searchParams;
    return p.get('jobid') || p.get('jobId') || '';
  }
  private metadata(kind: TaskKind): Attachment | undefined {
    const { attachments } = this.attachmentContext(); const id = this.frameJobId();
    if (id) return attachments.find(a => attachmentId(a) === id);
    const modules: Record<string, string[]> = { video: ['insertvideo'], audio: ['insertaudio'], quiz: ['work'], document: ['insertdoc', 'insertbook', 'insertppt'], discussion: ['bbs', 'topic', 'discuss'] };
    const candidates = attachments.filter(a => (modules[kind] || []).includes(a.property?.module || a.type));
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  jobs(): PlatformJob[] {
    const result: PlatformJob[] = [];
    const add = (kind: TaskKind, element?: HTMLElement, suffix = '') => {
      const metadata = this.metadata(kind); const jobId = metadata ? attachmentId(metadata) : this.frameJobId();
      const p = new URL(this.doc.URL).searchParams;
      const identity = jobId || p.get('workId') || p.get('workid') || p.get('examId') || p.get('examid') || p.get('taskrefId') || `${sourceLink(this.doc.URL)}:${kind}:${suffix}`;
      const title = metadata?.property?.name || metadata?.property?.title || text(this.doc.querySelector('.testTit,.mark_title,.discussion-title,h1')) || this.doc.title || kind;
      result.push({ id: `${kind}:${identity}`, title, kind, element, jobId, metadata, required: metadata ? metadata.job !== false || metadata.isPassed === true : true, passed: this.passedSync(jobId, kind) });
    };
    for (const [index, media] of [...this.doc.querySelectorAll<HTMLMediaElement>('video,audio')].entries()) {
      // A player belongs to its own frame; an outer wrapper with iframes is not a second task.
      if (media.closest('#xxtplay-root')) continue;
      // Player internals may contain inert helper media without any source.
      // Wait until a source is actually attached before treating it as a task.
      if (!media.currentSrc && !media.getAttribute('src') && !media.querySelector('source[src]')) continue;
      add(media.tagName === 'AUDIO' ? 'audio' : 'video', media, String(index));
    }
    if (this.doc.querySelector('.TiMu,.questionLi,.question-item')) add(this.isExam() ? 'exam' : 'quiz');
    if (!result.some(j => j.kind === 'video' || j.kind === 'audio') && this.doc.querySelector('#img.imglook,.swiper-container .swiper-slide,#reader,.doc-reader,.ppt-reader,#pdfContainer,.reader-container')) add('document', this.doc.querySelector<HTMLElement>('#reader,.doc-reader,.ppt-reader,#pdfContainer,.reader-container') || this.doc.body);
    if (this.doc.querySelector('.discussion-title,.topic-title,#topicContent') && this.doc.querySelector('textarea,[contenteditable="true"]') && /discuss|bbs|topic|groupweb/.test(this.doc.URL)) add('discussion');
    return result;
  }
  passedSync(jobId?: string, kind?: TaskKind): boolean {
    if (jobId) {
      const a = this.attachmentContext().attachments.find(a => attachmentId(a) === jobId);
      if (a?.isPassed === true) return true;
    }
    if (kind === 'quiz' || kind === 'exam') {
      return [...this.doc.querySelectorAll('.testTit_status_complete,.work-finish,.submit-success,.exam-success')].some(visible) ||
        /(?:已提交|已完成|提交成功|已交卷)/.test(text(this.doc.querySelector('.testTit_status,.mark_info,.work-status,.exam-status')));
    }
    try {
      const frame = this.win.frameElement;
      const wrapper = frame?.closest('.ans-attach-ct');
      if (wrapper?.classList.contains('ans-job-finished')) return true;
    } catch { /* Not all parent frames share an origin. */ }
    return false;
  }
  async verifyPassed(job: PlatformJob): Promise<boolean> {
    if (this.passedSync(job.jobId, job.kind)) return true;
    if (!job.jobId) return false;
    const owner = this.attachmentContext().owner;
    if (!owner || !/\/knowledge\/cards/.test(owner.location.pathname)) return false;
    try {
      const response = await owner.fetch(owner.location.href, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) return false;
      const html = await response.text();
      const config = extractMArg(html);
      return config?.attachments?.some((a: Attachment) => attachmentId(a) === job.jobId && a.isPassed === true) === true;
    } catch { return false; }
  }
  requirement(job: PlatformJob): WatchRequirement {
    const scope = job.jobId || job.id;
    const elements = [...this.doc.querySelectorAll('.task-requirement,.watch-requirement,.video-requirement,.job-requirement,[data-watch-requirement]')];
    const evidence = elements.filter(el => !el.getAttribute('data-jobid') || el.getAttribute('data-jobid') === job.jobId).map(el => ({ text: text(el), source: `页面：${el.className || el.tagName}`, scope }));
    try {
      const frame = this.win.frameElement;
      const wrapper = frame?.closest('.ans-attach-ct');
      for (const condition of wrapper?.querySelectorAll('.task-condition') || []) evidence.push({ text: text(condition), source: '当前任务点：.task-condition', scope });
    } catch { /* A missing parent rule triggers full playback. */ }
    // Only explicitly named human-readable pass requirements are interpreted; opaque numeric fields are not inferred.
    for (const key of ['completionRequirement', 'watchRequirement', 'passRequirement']) {
      const value = job.metadata?.[key] ?? job.metadata?.property?.[key];
      if (typeof value === 'string') evidence.push({ text: value, source: `任务配置.${key}`, scope });
    }
    return parseWatchRequirement(evidence, text(this.doc.querySelector('.score-rule,.assessment-rule,.video-score-rule')));
  }
  chapters(): Chapter[] {
    this.chapterElements.clear();
    let nodes = [...this.doc.querySelectorAll<HTMLElement>('.posCatalog_name,.catalog_points .catalog_name,.chapter_item[id^="cur"] .catalog_name,.chapter_item[data-knowledgeid],.catalog-item[data-knowledgeid]')];
    if (!nodes.length) nodes = [...this.doc.querySelectorAll<HTMLElement>('a[href*="studentstudy"][href*="knowledgeid"],a[href*="studentstudy"][href*="knowledgeId"]')];
    const chapters: Chapter[] = [];
    for (const node of nodes) {
      const container = node.closest<HTMLElement>('.posCatalog_select,.posCatalog_level,.chapter_item,.catalog-item,li') || node;
      const p = safeUrl(node.getAttribute('href') || '')?.searchParams;
      const id = node.dataset.knowledgeid || container.dataset.knowledgeid || p?.get('knowledgeid') || p?.get('knowledgeId') || container.id.replace(/^(?:cur|knowledge)/, '') || shortHash(text(node));
      if (!id || chapters.some(c => c.id === id)) continue;
      const title = node.getAttribute('title') || text(node);
      if (!title) continue;
      this.chapterElements.set(id, node);
      chapters.push({ id, title, current: !!node.closest('.posCatalog_active,.active'), completed: !!container.querySelector('.icon_Completed,.icon_completed,.catalog-complete,.icon_yiwanc'), locked: !!container.querySelector('.icon_lock,.icon_Lock,.catalog-lock') || node.getAttribute('aria-disabled') === 'true' });
    }
    return chapters;
  }
  navigateChapter(id: string): boolean {
    this.chapters(); const el = this.chapterElements.get(id);
    if (!el || !visible(el) || this.isExam()) return false;
    el.click(); return true;
  }
  /** Open only the platform's chapter tab from the course landing page. */
  openChapterTab(): boolean {
    if (!/\/mycourse\/stu\/?$/.test(new URL(this.doc.URL).pathname) || this.isExam() || this.blocked()) return false;
    const tab = this.doc.querySelector<HTMLElement>('a[title="章节"][data-url*="/mycourse/studentcourse"]');
    if (!visible(tab)) return false;
    tab.click(); return true;
  }
  chapterTitle(): string {
    for (const win of relatedWindows(this.win)) {
      try { const title = text(win.document.querySelector('.posCatalog_active,.chapter-title,.chapter_name')); if (title) return title; } catch { /* Cross-origin parent. */ }
    }
    return this.doc.title;
  }
  private cardsDocument(): Document | undefined {
    for (const frame of this.doc.querySelectorAll<HTMLIFrameElement>('#iframe,iframe[src*="knowledge/cards"],iframe[src*="knowledge/card"]')) {
      try { if (frame.contentDocument?.body) return frame.contentDocument; } catch { /* Cross-origin cards cannot be opened from here. */ }
    }
    return undefined;
  }
  /** Open/scroll the first unfinished task point so its player iframe starts loading. Returns false when nothing safe was found. */
  openNextTask(): boolean {
    const docs: Document[] = [this.doc];
    const cards = this.cardsDocument(); if (cards && cards !== this.doc) docs.push(cards);
    for (const doc of docs) {
      const points = [...doc.querySelectorAll<HTMLElement>('.ans-attach-ct')].filter(point =>
        !point.classList.contains('ans-job-finished') &&
        !point.querySelector('.icon_Completed,.icon_completed,.icon_yiwanc,.catalog-complete') &&
        visible(point));
      for (const point of points) {
        const icon = point.querySelector<HTMLElement>('.ans-job-icon');
        const frame = point.querySelector<HTMLIFrameElement>('iframe');
        const key = frame?.getAttribute('jobid') || point.id || text(point).slice(0, 80);
        if (key === this.lastTaskOpenKey && Date.now() - this.lastTaskOpenAt < 30_000) continue;
        this.lastTaskOpenKey = key; this.lastTaskOpenAt = Date.now();
        try { point.scrollIntoView({ block: 'center' }); } catch { /* The cards page may have been replaced. */ }
        try { (icon || point).click(); return true; } catch { return false; }
      }
    }
    return false;
  }
  conditionText(job: PlatformJob): string {
    const parts: string[] = [];
    for (const win of relatedWindows(this.win)) {
      try {
        for (const el of win.document.querySelectorAll('.task-condition,.task-requirement,.watch-requirement,.video-requirement,.job-requirement')) {
          if (el.getAttribute('data-jobid') && el.getAttribute('data-jobid') !== job.jobId) continue;
          parts.push(text(el));
        }
      } catch { /* Cross-origin parent frames are not inspected. */ }
    }
    return parts.join(' ');
  }
  speedAllowed(job: PlatformJob): boolean {
    const value = job.metadata?.doublespeed ?? job.metadata?.property?.doublespeed;
    return value === true || value === 1 || String(value).toLowerCase() === 'true' || String(value) === '1';
  }
  seekAllowed(job: PlatformJob): boolean {
    const value = job.metadata?.fastforward ?? job.metadata?.property?.fastforward;
    const enabled = value === true || value === 1 || String(value).toLowerCase() === 'true' || String(value) === '1';
    return enabled && !/不可拖拽|不可拖动|禁止拖动|不允许拖动|不可快进|禁止快进/.test(this.conditionText(job));
  }
  questionHandles(): QuestionHandle[] {
    const roots = [...this.doc.querySelectorAll<HTMLElement>('.TiMu,.questionLi,.question-item')].filter(el => !el.parentElement?.closest('.TiMu,.questionLi,.question-item'));
    return roots.map((root, index) => this.questionHandle(root, index));
  }
  private questionHandle(root: HTMLElement, index: number): QuestionHandle {
    const typeInput = root.querySelector<HTMLInputElement>('input[id^="answertype"],input[name^="type"],input[name="questionType"]');
    const map: Record<string, QuestionKind> = { '0': 'single', '1': 'multiple', '2': 'completion', '3': 'judgement', '4': 'short' };
    let kind = map[typeInput?.value || ''] || 'unsupported';
    const label = text(root.querySelector('.Zy_TItle,.mark_name,h3,.question-title'));
    if (kind === 'unsupported') kind = /多选/.test(label) ? 'multiple' : /单选/.test(label) ? 'single' : /判断/.test(label) ? 'judgement' : /填空/.test(label) ? 'completion' : /简答|论述|名词解释/.test(label) ? 'short' : 'unsupported';
    const titleEl = root.querySelector('.Zy_TItle .clearfix,.mark_name,.question-title,h3,.Zy_TItle') || root;
    const title = text(titleEl).replace(/^\d+[.、．]\s*/, '').replace(/^[（(【].*?题[）)】]\s*/, '');
    let optionElements: HTMLElement[] = [];
    if (['single', 'multiple', 'judgement'].includes(kind)) {
      optionElements = [...root.querySelectorAll<HTMLElement>('.answerBg .answer_p,ul li .after,.option-text')];
      if (!optionElements.length) optionElements = [...root.querySelectorAll<HTMLElement>('ul li label:not(.before),.answerBg li,[role="radio"],[role="checkbox"]')];
    }
    const fields = [...root.querySelectorAll<HTMLElement>('textarea,input[type="text"],[contenteditable="true"]')].filter(el => !el.closest('.answer-analysis,.mark_answer'));
    const editorFrames = [...root.querySelectorAll<HTMLIFrameElement>('iframe[id*="ueditor"],.edui-editor-iframeholder iframe,iframe[id*="ueditor"]')].filter(f => { try { return !!f.contentDocument?.body; } catch { return false; } });
    const images = (el: Element) => [...el.querySelectorAll<HTMLImageElement>('img')].map(img => img.currentSrc || img.src).filter(Boolean);
    const question: Question = { id: `${root.dataset.questionid || root.id || typeInput?.id || 'q'}:${shortHash(title)}:${index}`, kind, title,
      options: optionElements.map((el, i) => ({ id: `o${i}`, label: String.fromCharCode(65 + i), text: text(el) || (kind === 'judgement' ? el.querySelector('.ri') ? '正确' : '错误' : ''), images: images(el) })),
      images: images(titleEl), blanks: fields.length || editorFrames.length || (kind === 'short' || kind === 'completion' ? 1 : 0), source: this.doc.URL };
    const selected = (el: HTMLElement): boolean => {
      const container = el.closest('li,[role="radio"],[role="checkbox"],label') || el.parentElement || el;
      return !!container.querySelector<HTMLInputElement>('input:checked') || container.getAttribute('aria-checked') === 'true' || !!container.querySelector('.check_answer,.check_answer_dx,.check_answer_duo') || container.classList.contains('checked');
    };
    return { question, alive: () => root.isConnected,
      prepare: async () => {
        if (root.matches('.font-cxsecret') || root.querySelector('.font-cxsecret')) {
          await this.doc.fonts.ready;
          const canvas = await html2canvas(root, { backgroundColor: '#ffffff', scale: 1.5, logging: false, useCORS: true, imageTimeout: 10_000 });
          if (canvas.width * canvas.height > 16_000_000) throw new Error('字体编码题目截图过大，请人工处理');
          return { ...question, title: '题目使用字体编码，请从附图读取完整题干和选项，并按 A、B、C 顺序返回 o0、o1、o2 等选项编号。', images: [canvas.toDataURL('image/png')], options: question.options.map(o => ({ ...o, text: o.label, images: [] })) };
        }
        return question;
      },
      apply: async (answer: Answer) => {
        if (!root.isConnected) return false;
        if (optionElements.length) {
          for (const [i, el] of optionElements.entries()) {
            const should = answer.optionIds.includes(`o${i}`);
            if (selected(el) !== should && (should || kind === 'multiple')) {
              const container = el.closest('li,[role="radio"],[role="checkbox"]') || el;
              const input = container.querySelector<HTMLInputElement>('input[type="radio"],input[type="checkbox"]');
              (input || el).click();
              await sleep(150);
            }
          }
          return optionElements.every((el, i) => selected(el) === answer.optionIds.includes(`o${i}`));
        }
        if (answer.values.length !== fields.length + editorFrames.length && answer.values.length !== Math.max(fields.length, editorFrames.length)) return false;
        for (let i = 0; i < answer.values.length; i++) {
          const field = fields[i]; const frame = editorFrames[i]; const value = answer.values[i];
          if (field) setInput(field, value);
          if (frame?.contentDocument?.body) { frame.contentDocument.body.textContent = value; frame.contentDocument.body.dispatchEvent(new Event('input', { bubbles: true })); }
        }
        return answer.values.every((value, i) => fields[i] ? fieldValue(fields[i]) === value : editorFrames[i]?.contentDocument?.body.textContent === value);
      },
    };
  }
  findSubmit(exam: boolean): HTMLElement | undefined {
    const selector = exam ? '#submitExam,.submitExam,.exam-submit,[onclick*="submitExam"],[onclick*="submitPaper"]' : '#btnBlueSubmit,.btnBlue[onclick*="Submit"],.testSubmit,[onclick*="btnBlueSubmit"],.work-submit';
    const exact = [...this.doc.querySelectorAll<HTMLElement>(selector)].filter(visible);
    if (exact.length === 1) return exact[0];
    const candidates = [...this.doc.querySelectorAll<HTMLElement>('button,a,input[type="button"],input[type="submit"]')].filter(el => visible(el) && (exam ? /^(?:交卷|提交试卷|提交考试|结束考试)$/.test(text(el) || (el as HTMLInputElement).value) : /^(?:提交|提交作业|提交答案)$/.test(text(el) || (el as HTMLInputElement).value)));
    return candidates.length === 1 ? candidates[0] : undefined;
  }
  nextQuestion(): boolean {
    const candidates = [...this.doc.querySelectorAll<HTMLElement>('button,a,input[type="button"]')].filter(el => visible(el) && /^(?:下一题|保存并下一题)$/.test(text(el) || (el as HTMLInputElement).value));
    if (candidates.length === 1 && !candidates[0].hasAttribute('disabled')) { candidates[0].click(); return true; }
    return false;
  }
  async submit(job: PlatformJob, allowed: () => boolean): Promise<boolean> {
    if (!allowed()) throw new Error('提交授权失效');
    const button = this.findSubmit(job.kind === 'exam');
    if (!button) throw new Error('未找到唯一可确认的提交按钮，请人工处理');
    button.click();
    // Confirmation is limited to this task's currently visible submit dialog.
    for (let i = 0; i < 3; i++) {
      await sleep(700);
      if (this.passedSync(job.jobId, job.kind)) return true;
      const dialogs = [...this.doc.querySelectorAll<HTMLElement>('[role="dialog"],.layui-layer-dialog,.popDiv,.popBottom,#workpop')].filter(visible);
      for (const dialog of dialogs) {
        if (!/提交|交卷/.test(text(dialog)) || !allowed()) continue;
        const confirm = [...dialog.querySelectorAll<HTMLElement>('button,a,input[type="button"]')].find(el => /^(?:确定|确认|确认提交|确定提交|提交|交卷)$/.test(text(el) || (el as HTMLInputElement).value));
        confirm?.click();
      }
    }
    return this.verifyPassed(job);
  }
  discussionQuestion(): string { return text(this.doc.querySelector('.discussion-title,.topic-title,#topicContent')); }
  discussionPosted(answer: string): boolean {
    const fingerprint = normalizeText(answer);
    return [...this.doc.querySelectorAll('.reply-content,.comment-content,.topicReply .content,.replyContent')].some(el => normalizeText(el.textContent || '') === fingerprint);
  }
  fillDiscussion(answer: string): boolean {
    const editor = [...this.doc.querySelectorAll<HTMLElement>('textarea,[contenteditable="true"]')].find(visible);
    if (!editor) return false; setInput(editor, answer); return fieldValue(editor) === answer;
  }
  discussionSubmit(): HTMLElement | undefined {
    const items = [...this.doc.querySelectorAll<HTMLElement>('button,a,input[type="button"]')].filter(el => visible(el) && /^(?:发布|发表|回复|提交回复)$/.test(text(el) || (el as HTMLInputElement).value));
    return items.length === 1 ? items[0] : undefined;
  }
}
function gmGet(url: string): Promise<string> {
  if (typeof GM_xmlhttpRequest !== 'function') return Promise.reject(new Error('当前环境不支持跨域读取课程页面'));
  return new Promise((resolve, reject) => {
    GM_xmlhttpRequest({
      method: 'GET', url, anonymous: false, timeout: 20_000,
      onload: response => response.status >= 200 && response.status < 300
        ? resolve(response.responseText)
        : reject(new Error(`课程页面 HTTP ${response.status}`)),
      onerror: () => reject(new Error('课程页面读取失败，请检查网络或油猴域名授权')),
      ontimeout: () => reject(new Error('课程页面读取超时')),
    });
  });
}
function hiddenInput(html: string, id: string): string {
  const after = new RegExp(`id="${id}"[^>]*value="([^"]*)"`).exec(html);
  const before = new RegExp(`value="([^"]*)"[^>]*id="${id}"`).exec(html);
  return after?.[1] || before?.[1] || '';
}
function fieldValue(el: HTMLElement): string { return 'value' in el ? String((el as HTMLInputElement).value) : el.textContent || ''; }
export function setInput(el: HTMLElement, value: string): void {
  const win = el.ownerDocument.defaultView!;
  if ('value' in el) {
    const prototype = el.tagName === 'TEXTAREA' ? win.HTMLTextAreaElement.prototype : win.HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')?.set?.call(el, value);
  } else el.textContent = value;
  el.dispatchEvent(new win.Event('input', { bubbles: true })); el.dispatchEvent(new win.Event('change', { bubbles: true }));
}
/** Parse only an actual JSON literal. Never eval page scripts or JSON-like executable code. */
export function extractMArg(html: string): { attachments: Attachment[] } | undefined {
  const assignment = /(?:var\s+)?mArg\s*=\s*(\{)/g.exec(html); if (!assignment) return undefined;
  const start = assignment.index + assignment[0].lastIndexOf('{'); let depth = 0; let inString = false; let escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) { if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false; }
    else if (c === '"') inString = true; else if (c === '{') depth++; else if (c === '}' && --depth === 0) {
      try { const parsed = JSON.parse(html.slice(start, i + 1)); return Array.isArray(parsed.attachments) ? parsed : undefined; } catch { return undefined; }
    }
  }
  return undefined;
}
