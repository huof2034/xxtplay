import { Repository } from './storage';
import type { Course, Question, TaskRecord, TaskStatus } from './types';
import { AiClient, parseJsonObject } from './ai/client';
import { GmTransport } from './ai/transport';
import { AccountLease } from './core/lease';
import { QuestionWorker } from './core/question-worker';
import { ExamSubmissionGate } from './core/exam-gate';
import { HumanRequired, playMedia } from './core/media';
import { readDocument, collectSubtitles } from './core/documents';
import { SummaryService } from './core/summary';
import { ANSWER_SYSTEM, validateAnswer } from './core/answer';
import { ChaoxingAdapter, courseLinks, discoverCourse, readAccountId, type PlatformJob } from './platform/chaoxing';
import { courseEntryUrl, entryToCourse } from './platform/courses';
import { FrameBus } from './platform/bus';
import { Panel, examReview } from './ui/panel';
import { downloadText, errorMessage, shortHash, sleep } from './utils';

export class Runtime {
  readonly adapter = new ChaoxingAdapter();
  readonly ai: AiClient; readonly worker: QuestionWorker; readonly summary: SummaryService; readonly lease: AccountLease;
  private panel?: Panel; private busy = false; private control?: AbortController; private interval?: ReturnType<typeof setInterval>; private observer?: MutationObserver; private scanTimer?: ReturnType<typeof setTimeout>;
  private lastNavigation = Date.now(); private examPanel?: ReturnType<typeof examReview>; private examTask?: PlatformJob; private gate?: ExamSubmissionGate; private removeListener?: () => void;
  private lastVerification = new Map<string, number>(); private lastTaskOpen = 0; private lastCourseStart = 0; private chapterTabAttempts = 0; private lastQueueLog = 0;
  private openAttempts = 0; private openAttemptChapter = '';
  private navigationAttempts = 0; private navigationTarget = '';
  private startedAt = Date.now(); private taskContextWarned = false;
  constructor(readonly repo: Repository, readonly bus: FrameBus, readonly tabId: string, readonly topLevel: boolean, private fallback?: Course) {
    this.lease = new AccountLease(repo.storage, repo.accountId);
    this.ai = new AiClient(new GmTransport(), () => repo.config().ai, record => repo.update(s => { s.audit.push(record); s.audit = s.audit.slice(-2000); }));
    this.worker = new QuestionWorker(repo, this.ai); this.summary = new SummaryService(repo, this.ai);
    this.repo.onChange = () => { this.panel?.schedule(); this.schedule(); };
    this.removeListener = repo.storage.listen?.(repo.key, () => { this.panel?.schedule(); if (this.control && !this.authorized(this.examTask?.kind === 'exam')) this.control.abort(); this.schedule(); });
    bus.onExamContext = () => { this.adapter.inheritedExam = bus.inheritedExam(); this.control?.abort(); this.schedule(); };
    bus.onTaskContextRequest = source => this.adapter.childTaskContext(source);
    bus.onTaskContext = context => { this.adapter.inheritedTask = context; this.schedule(); };
    this.adapter.inheritedTask = bus.inheritedTask();
    bus.onOpenTask = () => { const course = this.course(); return !!(this.repo.state().autoRun && course?.enabled && !this.repo.state().examActive && !this.adapter.isExam() && !this.adapter.blocked() && this.adapter.openNextTask()); };
    bus.onNavigate = id => { const course = this.course(); if (this.repo.state().autoRun && course?.enabled && !this.repo.state().examActive && this.adapter.navigateChapter(id)) { this.lastNavigation = Date.now(); return true; } return false; };
    if (topLevel) {
      this.panel = new Panel(repo, { start: () => this.start(), stop: () => this.stop(), retry: () => this.retry(), scan: () => this.scanCourses(), refresh: () => this.refreshCatalog(true), summarize: key => this.generateSummary(key), exportNote: key => downloadText(`${repo.state().courses.find(c => c.key === key)?.title || '课程'}-复习资料.md`, this.summary.markdown(key), 'text/markdown;charset=utf-8') });
      GM_registerMenuCommand('打开 xxtplay 学习助手', () => this.panel?.show());
    }
    this.scanCourses();
    if (topLevel && (location.hostname === 'i.chaoxing.com' || /^\/base\/?$/.test(location.pathname))) void this.refreshCatalog(true);
    this.observer = new MutationObserver(records => { if (records.some(r => !(r.target as Element).closest?.('#xxtplay-root,#xxtplay-exam-review'))) this.schedule(); });
    this.observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'src', 'aria-checked'] });
    this.interval = setInterval(() => this.schedule(), 4000);
    document.addEventListener('visibilitychange', () => this.schedule());
    window.addEventListener('pagehide', () => this.close(), { once: true }); this.schedule();
  }
  private course(): Course | undefined {
    const found = discoverCourse(undefined, this.fallback); return found ? this.repo.state().courses.find(c => c.key === found.key) : undefined;
  }
  scanCourses(): void {
    const current = discoverCourse(undefined, this.fallback);
    const discovered = [current, ...courseLinks(document), ...this.adapter.courseCards().map((entry, index) => entryToCourse(entry, index))].filter((c): c is Course => !!c);
    this.repo.update(s => {
      for (const course of discovered) {
        const existing = s.courses.find(c => c.key === course.key);
        if (!existing) { s.courses.push({ ...course, order: s.courses.length }); continue; }
        if (course.title && !['未命名课程', '温馨提示'].includes(course.title) && !this.adapter.blocked()) existing.title = course.title;
        if (course.cpi) existing.cpi = course.cpi;
        if (course === current && course.url) existing.url = course.url;
        else if (!existing.url) existing.url = course.url;
        if (course.teacher) existing.teacher = course.teacher;
        if (course.progress && (!existing.progress || course.progress.updatedAt >= existing.progress.updatedAt)) existing.progress = course.progress;
      }
      const local = this.adapter.localProgress(); const target = current && s.courses.find(c => c.key === current.key);
      if (local && target) target.progress = local;
    });
    this.panel?.schedule(); this.schedule();
  }
  /** Read every enrolled course from the homepage and, optionally, each course's task-point progress. */
  async refreshCatalog(withProgress = true): Promise<void> {
    try {
      const entries = await this.adapter.loadCatalog();
      if (!entries.length) { this.repo.log('warn', '未读取到课程列表：请在“我的课程”首页使用“读取全部课程”，或先进入一门课程'); return; }
      this.repo.update(s => {
        for (const entry of entries) {
          const existing = s.courses.find(c => c.key === `${entry.id}:${entry.classId}`);
          if (!existing) { s.courses.push(entryToCourse(entry, s.courses.length)); continue; }
          existing.title = entry.title; if (entry.cpi) existing.cpi = entry.cpi;
          if (entry.teacher) existing.teacher = entry.teacher;
          if (entry.progress) existing.progress = entry.progress;
        }
      });
      this.repo.log('info', `读取到 ${entries.length} 门课程`);
      this.panel?.schedule();
      if (!withProgress) return;
      for (const entry of entries) {
        const course = this.repo.state().courses.find(c => c.key === `${entry.id}:${entry.classId}`); if (!course) continue;
        if (course.progress && Date.now() - course.progress.updatedAt < 5 * 60_000) continue;
        try {
          const progress = await this.adapter.loadProgress(course);
          if (progress) this.repo.update(s => { const target = s.courses.find(c => c.key === course.key); if (target) target.progress = progress; });
        } catch (error) { this.repo.log('warn', `读取「${entry.title}」进度失败：${errorMessage(error)}`); }
        await sleep(600);
      }
      this.repo.log('info', '课程进度读取完成');
    } catch (error) { this.repo.log('warn', `读取课程列表失败：${errorMessage(error)}`); }
  }
  start(): void {
    if (!this.repo.state().courses.some(c => c.enabled)) { this.repo.log('warn', '请先勾选至少一门课程；正在尝试读取全部课程'); void this.refreshCatalog(false); return; }
    this.repo.update(s => { s.autoRun = true; s.pausedReason = undefined; }); this.repo.log('info', '课程队列已开启；非答题和总结流程不调用 AI'); this.schedule();
  }
  stop(): void { this.repo.update(s => { s.autoRun = false; s.pausedReason = '已手动暂停，断点已保存'; }); this.control?.abort(); this.lease.release(); }
  retry(): void {
    this.repo.update(s => { for (const task of Object.values(s.tasks)) if (['pending', 'waiting-human'].includes(task.status)) { task.status = 'queued'; task.reason = undefined; } s.visitedChapters = {}; s.confirmedEmptyChapters = {}; s.pausedReason = undefined; });
    this.openAttempts = 0; this.navigationAttempts = 0;
    this.repo.log('info', '待办已重新排队；提交结果不明的任务仅核验，不自动重复提交'); this.schedule();
  }
  private schedule(): void { if (!this.scanTimer) this.scanTimer = setTimeout(() => { this.scanTimer = undefined; void this.tick().catch(e => this.repo.log('error', errorMessage(e))); }, 400); }
  private authorized(exam = false): boolean {
    const state = this.repo.state(); const knownId = readAccountId();
    if (knownId && knownId !== this.repo.accountId) return false;
    const course = this.course(); if (!state.autoRun || !course?.enabled) return false;
    if (!exam && state.examActive && Date.now() - state.examActive.at < 180_000) return false;
    return this.lease.owned();
  }
  private taskId(job: PlatformJob, course: Course): string { return `${course.key}:${job.id}`; }
  private refreshLocalProgress(courseKey: string): void {
    const progress = this.adapter.localProgress(); if (!progress) return;
    this.repo.update(s => { const course = s.courses.find(c => c.key === courseKey); if (course) course.progress = progress; });
  }
  private updateTask(id: string, patch: Partial<TaskRecord>): void { this.repo.update(s => { if (s.tasks[id]) Object.assign(s.tasks[id], patch, { updatedAt: Date.now() }); }); }
  private async tick(): Promise<void> {
    if (!this.bus.examContextKnown() || !this.bus.taskContextKnown()) return;
    if (!this.topLevel && !this.bus.inheritedTask() && !this.taskContextWarned && Date.now() - this.startedAt > 7_000) {
      this.taskContextWarned = true;
      this.repo.log('warn', '未收到父页面任务身份，按当前播放器页面继续判断');
    }
    this.adapter.inheritedExam = this.bus.inheritedExam();
    const course = this.course();
    if (!course) {
      this.scanCourses();
      if (this.topLevel && this.repo.state().autoRun) {
        const next = [...this.repo.state().courses].filter(item => item.enabled && item.url).sort((a, b) => a.order - b.order)[0];
        if (next && Date.now() - this.lastCourseStart > 8_000) {
          const entry = courseEntryUrl(next);
          if (!entry) { this.repo.update(s => { s.autoRun = false; s.pausedReason = '课程入口不可用，请从学习通课程列表打开一次'; }); return; }
          this.lastCourseStart = Date.now(); this.repo.log('info', `打开课程：${next.title}`); location.assign(entry);
        }
      }
      return;
    }
    const jobs = this.adapter.jobs(); const chapters = this.adapter.chapters();
    const exam = this.adapter.isExam() && jobs.some(j => j.kind === 'exam');
    if (exam && (this.repo.state().examActive?.tabId !== this.tabId || Date.now() - (this.repo.state().examActive?.at || 0) > 10_000)) this.repo.update(s => { s.examActive = { tabId: this.tabId, at: Date.now() }; });
    else if (!exam && this.topLevel && this.repo.state().examActive && Date.now() - this.repo.state().examActive!.at > 180_000) this.repo.update(s => { s.examActive = undefined; });
    this.bus.report({ tabId: this.tabId, courseKey: course.key, busy: this.busy, snapshot: { jobs: jobs.map(({ element: _el, metadata: _meta, ...job }) => job), chapters, exam, blocked: this.adapter.blocked(), unfinishedTaskPoints: this.adapter.unfinishedTaskPoints(), cardsReady: this.adapter.cardsReady(), emptyChapter: this.adapter.emptyChapter() } });
    if (this.busy || !this.repo.state().autoRun || !course.enabled) return;
    const blocked = this.adapter.blocked(); if (blocked) { if (this.repo.state().pausedReason !== blocked) this.repo.update(s => { s.pausedReason = blocked; }); return; }
    const state = this.repo.state();
    if (!exam && state.examActive && Date.now() - state.examActive.at < 180_000) return;
    if (exam && !this.examTask) {
      const review = jobs.find(j => j.kind === 'exam' && state.tasks[this.taskId(j, course)]?.status === 'awaiting-confirmation');
      if (review) { this.updateTask(this.taskId(review, course), { status: 'queued', reason: '刷新后重新核验答案，交卷仍需本次人工确认' }); return; }
    }
    const job = jobs.find(job => {
      if (!job.required) return false;
      const record = state.tasks[this.taskId(job, course)];
      return !record || ['queued', 'running'].includes(record.status) || record.status === 'submitted-unverified' && Date.now() - (this.lastVerification.get(record.id) || 0) > 60_000;
    });
    if (job) {
      this.openAttempts = 0;
      this.busy = true;
      if (!await this.lease.acquire()) { this.busy = false; return; }
      this.control = new AbortController();
      try { await this.runJob(job, course, this.control.signal); } finally { this.busy = false; this.control = undefined; this.lease.release(); this.schedule(); }
      return;
    }
    if (this.topLevel) await this.navigate(course);
  }
  private async runJob(job: PlatformJob, course: Course, signal: AbortSignal): Promise<void> {
    const id = this.taskId(job, course); const old = this.repo.state().tasks[id];
    if (old?.status === 'submitted-unverified') {
      this.lastVerification.set(id, Date.now());
      if (await this.adapter.verifyPassed(job)) this.updateTask(id, { status: 'completed', receipt: '重新读取平台确认提交成功', reason: undefined });
      return;
    }
    const chapter = this.adapter.chapterTitle(); const pageUrl = this.adapter.studyUrl();
    if (!old) this.repo.update(s => { s.tasks[id] = { id, courseKey: course.key, title: job.title, kind: job.kind, status: 'queued', url: pageUrl, chapter, updatedAt: Date.now(), attempts: 0 }; });
    if (job.passed) { this.updateTask(id, { status: 'completed', chapter, receipt: '平台已标记任务通过' }); return; }
    if (this.repo.state().pausedReason) this.repo.update(s => { s.pausedReason = undefined; });
    this.updateTask(id, { status: 'running', chapter, url: pageUrl || old?.url, attempts: (old?.attempts || 0) + 1, reason: undefined });
    const allowed = () => this.authorized(job.kind === 'exam');
    try {
      if (!allowed()) throw new DOMException('任务已暂停', 'AbortError');
      let receipt: string | undefined;
      if (job.kind === 'video' || job.kind === 'audio') {
        receipt = await playMedia(this.adapter, job, course, this.repo, id, signal, allowed, async () => {
          const handles = this.adapter.questionHandles(); const results = await this.worker.run(handles, course.key, this.adapter.chapterTitle(), signal);
          if (!results.length || results.some(r => !r.filled)) return false;
          const quiz = { ...job, kind: 'quiz' as const }; const button = this.adapter.findSubmit(false); if (!button || !allowed()) return false; button.click(); await sleep(1000, signal);
          return !handles.some(h => h.alive()) || !(job.element as HTMLMediaElement).paused;
        });
        await collectSubtitles(this.adapter, job, course, this.repo);
      } else if (job.kind === 'document') receipt = await readDocument(this.adapter, job, course, this.repo, signal, allowed);
      else if (job.kind === 'quiz' || job.kind === 'exam') {
        const results = await this.worker.run(this.adapter.questionHandles(), course.key, this.adapter.chapterTitle(), signal, rows => {
          this.repo.update(s => { const task = s.tasks[id]; const all = new Map((task.answers || []).map(a => [a.id, a])); for (const result of rows) all.set(result.question.id, { id: result.question.id, title: result.question.title, filled: result.filled, answer: result.answer, error: result.error }); task.answers = [...all.values()]; });
        });
        if (!results.length) throw new Error('未能读取题目，任务保留待办');
        const oldIds = this.adapter.questionHandles().map(h => h.question.id).join('|');
        if (this.adapter.nextQuestion()) {
          this.updateTask(id, { status: 'queued', reason: '已保存本页作答，等待下一题页面' });
          for (let i = 0; i < 20; i++) { await sleep(500, signal); if (this.adapter.questionHandles().map(h => h.question.id).join('|') !== oldIds) return; }
          throw new Error('点击下一题后页面未变化，已停止翻题，避免跳过题目');
        }
        if (job.kind === 'exam') { this.updateTask(id, { status: 'awaiting-confirmation', reason: '最终交卷需人工确认' }); this.showExam(job, course, id); return; }
        if (this.repo.state().tasks[id].answers?.some(a => !a.filled)) throw new Error('存在未解决题目，未提交该作业');
        if (!allowed()) throw new DOMException('任务已暂停', 'AbortError');
        this.updateTask(id, { status: 'submitted-unverified', reason: '已开始提交，等待平台回执' });
        const verified = await this.adapter.submit(job, allowed); if (!verified) { this.updateTask(id, { reason: '提交结果不明，等待人工核验，不自动重交' }); return; }
        receipt = '平台已确认作业提交成功';
      } else if (job.kind === 'discussion') {
        const prompt = this.adapter.discussionQuestion(); if (!prompt.trim()) throw new Error('讨论题正文为空，未调用 AI');
        const q: Question = { id: job.id, kind: 'short', title: prompt, options: [], images: [], blanks: 1, source: document.URL };
        const answerKey = `xxtplay:v1:discussion:${this.repo.accountId}:${course.key}:${shortHash(prompt)}`;
        const previous = this.repo.storage.get<{ answer: string; attempted: boolean } | null>(answerKey, null);
        let answer = previous?.answer;
        if (previous?.attempted) {
          if (answer && this.adapter.discussionPosted(answer)) receipt = '页面已确认此前的讨论回复，未重复发布';
          else throw new Error('该讨论已尝试发布，请人工核验后处理，未重复发布');
        } else {
          if (!answer) { const raw = await this.ai.complete('answer', course.key, ANSWER_SYSTEM, JSON.stringify({ title: prompt, type: 'short', inputCount: 1, instruction: '直接回答教师讨论问题，避免无关的泛泛回复。' }), [], signal); answer = validateAnswer(q, parseJsonObject(raw)).values[0]; }
          if (this.adapter.discussionPosted(answer)) receipt = '页面已有相同讨论回复，未重复发布';
          else {
            if (!allowed()) throw new DOMException('任务已暂停', 'AbortError');
            if (!this.adapter.fillDiscussion(answer)) throw new Error('讨论编辑器回填失败'); const button = this.adapter.discussionSubmit(); if (!button) throw new Error('未找到唯一的讨论发布按钮');
            this.repo.storage.set(answerKey, { answer, attempted: true }); this.updateTask(id, { status: 'submitted-unverified', reason: '已开始发布讨论，等待平台确认' }); button.click();
            for (let i = 0; i < 3 && !this.adapter.discussionPosted(answer); i++) await sleep(1500, signal);
            if (!this.adapter.discussionPosted(answer)) { this.updateTask(id, { reason: '讨论发布结果不明，不自动重复发送' }); return; }
            receipt = '页面已确认讨论回复发布';
          }
        }
      } else throw new Error('该任务类型尚未适配');
      if (receipt) { this.updateTask(id, { status: 'completed', receipt, reason: undefined }); this.repo.log('success', `${job.title}：${receipt}`); this.refreshLocalProgress(course.key); }
    } catch (e) {
      const attempted = this.repo.state().tasks[id]?.status === 'submitted-unverified';
      const status: TaskStatus = attempted ? 'submitted-unverified' : signal.aborted || e instanceof DOMException && e.name === 'AbortError' ? 'queued' : e instanceof HumanRequired ? 'waiting-human' : 'pending';
      this.updateTask(id, { status, reason: errorMessage(e) }); this.repo.log('warn', `${job.title}：${errorMessage(e)}`);
    }
  }
  private showExam(job: PlatformJob, course: Course, id: string): void {
    this.examTask = job; this.gate = new ExamSubmissionGate(id); this.examPanel?.close();
    this.examPanel = examReview(this.repo.state().tasks[id], async event => {
      if (!event.isTrusted || this.repo.state().tasks[id]?.status !== 'awaiting-confirmation' || this.adapter.blocked() || readAccountId() !== this.repo.accountId || !this.adapter.isExam() || this.taskId(job, this.course() || course) !== id) throw new Error('试卷、提交状态或账号已变化，请刷新并重新检查');
      if (!await this.lease.acquire()) throw new Error('另一个标签页正在执行任务，请稍后重新检查本次试卷');
      try {
        const accepted = await this.gate!.submit(event, id, async () => {
          this.updateTask(id, { status: 'submitted-unverified', reason: '人工确认后开始交卷，等待平台回执' });
          const ok = await this.adapter.submit(job, () => this.lease.owned() && this.adapter.isExam() && readAccountId() === this.repo.accountId);
          if (ok) { this.updateTask(id, { status: 'completed', receipt: '人工确认交卷后平台确认成功', reason: undefined }); this.repo.update(s => { if (s.examActive?.tabId === this.tabId) s.examActive = undefined; }); }
          else this.updateTask(id, { reason: '交卷结果不明，请直接核验平台结果，脚本不会重交' });
        });
        if (!accepted) throw new Error('本次交卷确认已失效或已使用');
      } finally { this.lease.release(); }
    });
  }
  private async navigate(course: Course): Promise<void> {
    if (Date.now() - this.lastNavigation < 10_000 || this.bus.activeReports().some(r => r.busy || r.snapshot.exam)) return;
    const state = this.repo.state(); const reports = this.bus.activeReports().filter(r => r.courseKey === course.key);
    const blocked = reports.find(r => r.snapshot.blocked)?.snapshot.blocked;
    if (blocked) { if (state.pausedReason !== blocked) this.repo.update(s => { s.pausedReason = blocked; }); return; }
    const jobs = reports.flatMap(r => r.snapshot.jobs);
    // A completed task must not hide the next, not-yet-loaded task point in the same chapter.
    const pending = jobs.filter(job => {
      if (!job.required || job.passed) return false;
      const record = state.tasks[this.taskId(job, course)];
      return !record || ['queued', 'running'].includes(record.status) ||
        record.status === 'submitted-unverified' && Date.now() - (this.lastVerification.get(record.id) || 0) > 60_000;
    });
    if (pending.length) return;
    const catalogue = reports.filter(r => r.snapshot.chapters.length).sort((a, b) => b.snapshot.chapters.length - a.snapshot.chapters.length)[0];
    if (!catalogue) {
      if (this.repo.config().playback.autoOpen && Date.now() - this.lastTaskOpen > 8_000 && this.adapter.openNextTask()) { this.lastTaskOpen = Date.now(); this.repo.log('info', '已尝试打开当前页面的任务点，等待播放器加载'); }
      else if (this.repo.config().playback.autoOpen && Date.now() - this.lastTaskOpen > 8_000 && await this.bus.requestOpenTask(course.key)) { this.lastTaskOpen = Date.now(); this.repo.log('info', '已请求任务页面打开任务点，等待播放器加载'); }
      else if (this.repo.config().playback.autoOpen && this.chapterTabAttempts < 3 && Date.now() - this.lastTaskOpen > 8_000 && this.adapter.openChapterTab()) {
        this.chapterTabAttempts++; this.lastTaskOpen = Date.now(); this.repo.log('info', '已打开课程章节，等待章节列表加载');
      }
      return;
    }
    this.chapterTabAttempts = 0;
    const activeChapter = catalogue.snapshot.chapters.find(c => c.current);
    const unfinished = reports.some(r => r.snapshot.unfinishedTaskPoints > 0);
    if (this.openAttemptChapter !== activeChapter?.id) { this.openAttemptChapter = activeChapter?.id || ''; this.openAttempts = 0; }
    if (activeChapter && !activeChapter.completed) {
      if (Date.now() - this.lastTaskOpen < 8_000) {
        const waiting = '正在打开任务点，等待播放器加载';
        if (state.pausedReason !== waiting) this.repo.update(s => { s.pausedReason = waiting; });
        return;
      }
      if (this.repo.config().playback.autoOpen) {
        if (unfinished && this.openAttempts >= 3) {
          const reason = '任务点多次打开后仍未加载播放器，请检查页面并重试待办';
          if (state.pausedReason !== reason) this.repo.update(s => { s.pausedReason = reason; });
          return;
        }
        const opened = unfinished && await this.bus.requestOpenTask(course.key);
        if (unfinished) { this.openAttempts++; this.lastTaskOpen = Date.now(); }
        if (opened) {
          const opening = `正在打开任务点：${activeChapter.title}`;
          this.repo.update(s => { s.pausedReason = opening; });
          if (Date.now() - this.lastQueueLog > 15_000) {
            this.lastQueueLog = Date.now();
            this.repo.log('info', `自动打开任务点：${activeChapter.title}（当前章节仍有未加载任务）`);
          }
          return;
        }
      }
      if (unfinished) {
        const reason = this.repo.config().playback.autoOpen
          ? '当前章节仍有未完成任务点，已尝试自动打开；若页面需要点击，请手动点开一次'
          : '当前章节仍有未完成任务点，请手动点开或开启自动打开任务点';
        if (state.pausedReason !== reason) this.repo.update(s => { s.pausedReason = reason; });
        return;
      }
      if (!reports.some(r => r.snapshot.cardsReady)) {
        const reason = '等待章节任务页面加载，暂不跳过当前章节';
        if (state.pausedReason !== reason) this.repo.update(s => { s.pausedReason = reason; });
        return;
      }
      // A chapter whose task points all passed is complete even when the platform
      // does not paint the catalog "completed" icon. `emptyChapter` only describes a
      // chapter with no required task points, so it must not gate normal chapters.
      if (!reports.some(r => r.snapshot.emptyChapter)) {
        const required = jobs.filter(job => job.required);
        const allPassed = required.every(job => job.passed || state.tasks[this.taskId(job, course)]?.status === 'completed');
        if (required.length > 0 && !allPassed) {
          const reason = '等待平台确认当前章节完成，暂不跳过';
          if (state.pausedReason !== reason) this.repo.update(s => { s.pausedReason = reason; });
          return;
        }
      }
    }
    this.busy = true;
    if (!await this.lease.acquire()) { this.busy = false; return; }
    try {
      const chapters = catalogue.snapshot.chapters; const current = chapters.find(c => c.current);
      const empty = [...(state.confirmedEmptyChapters?.[course.key] || [])];
      if (current && !current.completed && reports.some(r => r.snapshot.emptyChapter) && !empty.includes(current.id)) {
        empty.push(current.id); this.repo.update(s => { s.confirmedEmptyChapters ??= {}; s.confirmedEmptyChapters[course.key] = empty; });
      }
      const next = chapters.find(c => !c.completed && !c.locked && !empty.includes(c.id) && !c.current);
      this.lastNavigation = Date.now();
      if (next) {
        if (this.navigationTarget !== next.id) { this.navigationTarget = next.id; this.navigationAttempts = 0; }
        if (this.navigationAttempts >= 3) { this.repo.update(s => { s.pausedReason = `章节多次切换失败：${next.title}，请检查后重试待办`; }); return; }
        this.navigationAttempts++;
        if (!await this.bus.navigate(catalogue.id, next.id)) { this.repo.update(s => { s.pausedReason = `无法打开章节：${next.title}`; }); return; }
        this.repo.log('info', `已请求切换章节：${next.title}，等待页面确认`);
        for (let i = 0; i < 20; i++) {
          await sleep(500);
          if (this.bus.activeReports().some(r => r.courseKey === course.key && r.snapshot.chapters.some(c => c.id === next.id && c.current))) {
            this.navigationAttempts = 0; this.repo.update(s => { s.pausedReason = undefined; }); this.repo.log('info', `已切换章节：${next.title}`); return;
          }
        }
        this.repo.update(s => { s.pausedReason = `章节切换尚未确认：${next.title}，等待重试`; });
        return;
      }
      if (course.summaryEnabled) await this.summary.generate(course.key).catch(e => this.repo.log('warn', `复习整理待办：${errorMessage(e)}`));
      const selected = [...this.repo.state().courses].filter(c => c.enabled).sort((a, b) => a.order - b.order); const index = selected.findIndex(c => c.key === course.key); const following = selected[index + 1];
      if (following) {
        const entry = courseEntryUrl(following); if (!entry) throw new Error('课程入口不可用，请从学习通课程列表打开一次');
        this.repo.log('info', `切换课程：${following.title}`); this.repo.update(s => { s.activeCourseKey = following.key; }); location.assign(entry);
      } else { this.repo.update(s => { s.autoRun = false; s.pausedReason = '本轮可执行任务已处理；请在“运行”中查看平台确认结果和待办'; }); this.repo.log('info', '本轮课程队列已结束，未把待办算作完成'); }
    } finally { this.busy = false; this.lease.release(); }
  }
  private async generateSummary(courseKey: string): Promise<void> {
    if (this.busy) throw new Error('当前有任务正在执行，请暂停队列并等待当前任务结束后生成资料');
    this.busy = true;
    if (!await this.lease.acquire()) { this.busy = false; throw new Error('另一个标签页正在执行任务'); }
    this.control = new AbortController(); try { await this.summary.generate(courseKey, this.control.signal); } finally { this.busy = false; this.control = undefined; this.lease.release(); }
  }
  close(): void {
    clearInterval(this.interval); clearTimeout(this.scanTimer); this.control?.abort(); this.lease.release(); this.observer?.disconnect(); this.removeListener?.();
    if (this.examTask) this.repo.update(s => { if (s.examActive?.tabId === this.tabId) s.examActive = undefined; });
    this.bus.close();
  }
}
