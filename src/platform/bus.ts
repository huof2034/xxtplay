import type { Course } from '../types';
import { localExam, type PlatformSnapshot, type FrameTaskContext } from './chaoxing';
import { isChaoxingHost } from '../utils';

export interface FrameReport { id: string; tabId: string; courseKey: string; snapshot: PlatformSnapshot; at: number; busy: boolean }
type Context = { tabId: string; accountId: string; course?: Course };
const CHANNEL = 'xxtplay/v1';
/** Messages contain route/status data only. API credentials and exam authority never use this bus. */
export class FrameBus {
  readonly id = crypto.randomUUID();
  context?: Context;
  reports = new Map<string, FrameReport & { source: Window; origin: string }>();
  onContext?: (context: Context) => void;
  onNavigate?: (chapterId: string) => boolean;
  onReport?: () => void;
  onExamContext?: () => void;
  onOpenTask?: () => boolean;
  onTaskContextRequest?: (source: Window) => FrameTaskContext | undefined;
  onTaskContext?: (context: FrameTaskContext | undefined) => void;
  private taskContextReceived = false;
  private parentTask?: FrameTaskContext;
  private pendingActions = new Map<string, { source: Window; resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }>();
  private parentExam: boolean | undefined;
  private pendingChildren = new Map<string, { source: Window; origin: string }>();
  private ancestryTimer?: ReturnType<typeof setInterval>;
  private handler = (event: MessageEvent) => this.receive(event);
  private contextProvider?: () => Context | undefined;
  constructor(readonly topLevel: boolean, contextProvider?: () => Context | undefined) {
    this.contextProvider = contextProvider;
    window.addEventListener('message', this.handler);
    this.parentExam = topLevel ? false : undefined;
    if (topLevel) this.context = contextProvider?.(); else {
      this.requestContext();
      this.requestExamContext();
      this.requestTaskContext();
      this.ancestryTimer = setInterval(() => { this.requestExamContext(); this.requestTaskContext(); }, 3000);
    }
  }
  requestContext(): void { if (window.top !== window) window.top?.postMessage({ channel: CHANNEL, type: 'hello', id: this.id }, '*'); }
  examContextKnown(): boolean { return this.parentExam !== undefined; }
  inheritedExam(): boolean { return this.parentExam === true; }
  taskContextKnown(): boolean { return this.topLevel || this.taskContextReceived; }
  inheritedTask(): FrameTaskContext | undefined { return this.parentTask; }
  private requestTaskContext(): void { if (!this.topLevel) window.parent.postMessage({ channel: CHANNEL, type: 'task-parent-hello', id: this.id }, '*'); }
  private requestExamContext(): void { if (!this.topLevel) window.parent.postMessage({ channel: CHANNEL, type: 'exam-parent-hello', id: this.id }, '*'); }
  private respondExamChild(id: string, source: Window, origin: string): void {
    if (!this.examContextKnown()) { this.pendingChildren.set(id, { source, origin }); return; }
    source.postMessage({ channel: CHANNEL, type: 'exam-parent-state', id, exam: this.inheritedExam() || localExam(document) }, origin);
  }
  private receive(event: MessageEvent): void {
    let host: string; try { host = new URL(event.origin).hostname; } catch { return; }
    if (!isChaoxingHost(host) || event.data?.channel !== CHANNEL) return;
    const message = event.data;
    if (message.type === 'task-parent-hello' && typeof message.id === 'string' && isDirectChildWindow(event.source) && this.onTaskContextRequest) {
      const context = this.onTaskContextRequest(event.source as Window);
      (event.source as Window).postMessage({ channel: CHANNEL, type: 'task-parent-state', id: message.id, context }, event.origin);
      return;
    }
    if (!this.topLevel && message.type === 'task-parent-state' && event.source === window.parent && message.id === this.id) {
      const context = message.context;
      if (context !== undefined && (!context || typeof context !== 'object' || (context.jobId !== undefined && typeof context.jobId !== 'string') || (context.required !== undefined && typeof context.required !== 'boolean') || (context.passed !== undefined && typeof context.passed !== 'boolean') || (context.title !== undefined && typeof context.title !== 'string'))) return;
      this.taskContextReceived = true; this.parentTask = context; this.onTaskContext?.(context); return;
    }
    if (message.type === 'exam-parent-hello' && typeof message.id === 'string' && isDirectChildWindow(event.source)) {
      this.respondExamChild(message.id, event.source as Window, event.origin);
      return;
    }
    if (!this.topLevel && message.type === 'exam-parent-state' && event.source === window.parent && message.id === this.id && typeof message.exam === 'boolean') {
      const changed = this.parentExam !== message.exam;
      this.parentExam = message.exam;
      if (changed) this.onExamContext?.();
      for (const [id, child] of this.pendingChildren) this.respondExamChild(id, child.source, child.origin);
      this.pendingChildren.clear();
      return;
    }
    if (this.topLevel) {
      if (!isChildWindow(event.source)) return;
      if (message.type === 'hello') {
        const context = this.contextProvider?.(); if (context) (event.source as Window).postMessage({ channel: CHANNEL, type: 'context', ...context }, event.origin);
      } else if (message.type === 'action-result' && typeof message.requestId === 'string' && typeof message.ok === 'boolean') {
        const pending = this.pendingActions.get(message.requestId);
        if (pending && pending.source === event.source) { clearTimeout(pending.timer); this.pendingActions.delete(message.requestId); pending.resolve(message.ok); }
      } else if (message.type === 'report' && message.report?.tabId === this.contextProvider?.()?.tabId) {
        const report = message.report as FrameReport;
        if (typeof report.id !== 'string' || !Array.isArray(report.snapshot?.jobs) || !Array.isArray(report.snapshot?.chapters)) return;
        for (const [id, old] of this.reports) if (old.source === event.source && id !== report.id) this.reports.delete(id);
        this.reports.set(report.id, { ...report, at: Date.now(), source: event.source as Window, origin: event.origin }); this.onReport?.();
      }
    } else if (event.source === window.top) {
      if (message.type === 'context' && typeof message.tabId === 'string' && /^\d+$/.test(message.accountId)) {
        this.context = { tabId: message.tabId, accountId: message.accountId, course: message.course }; this.onContext?.(this.context);
      } else if (message.type === 'navigate' && message.tabId === this.context?.tabId && typeof message.chapterId === 'string' && typeof message.requestId === 'string') {
        const ok = this.onNavigate?.(message.chapterId) === true;
        window.top?.postMessage({ channel: CHANNEL, type: 'action-result', requestId: message.requestId, ok }, event.origin);
      }
      else if (message.type === 'open-task' && message.tabId === this.context?.tabId && typeof message.requestId === 'string') {
        const ok = this.onOpenTask?.() === true;
        window.top?.postMessage({ channel: CHANNEL, type: 'action-result', requestId: message.requestId, ok }, event.origin);
      }
    }
  }
  report(report: Omit<FrameReport, 'id' | 'at'>): void {
    const full = { ...report, id: this.id, at: Date.now() };
    if (this.topLevel) this.reports.set(this.id, { ...full, source: window, origin: location.origin });
    else window.top?.postMessage({ channel: CHANNEL, type: 'report', report: full }, '*');
  }
  async navigate(frameId: string, chapterId: string): Promise<boolean> {
    if (frameId === this.id) return this.onNavigate?.(chapterId) === true;
    const target = this.reports.get(frameId);
    if (!target) return false;
    return this.requestAction(target, { type: 'navigate', chapterId });
  }
  private requestAction(target: FrameReport & { source: Window; origin: string }, action: Record<string, string>): Promise<boolean> {
    return new Promise(resolve => {
      const requestId = crypto.randomUUID();
      const timer = setTimeout(() => { this.pendingActions.delete(requestId); resolve(false); }, 2000);
      this.pendingActions.set(requestId, { source: target.source, resolve, timer });
      try { target.source.postMessage({ channel: CHANNEL, ...action, tabId: target.tabId, requestId }, target.origin); }
      catch { clearTimeout(timer); this.pendingActions.delete(requestId); resolve(false); }
    });
  }
  /** Ask child frames to open their own next task point when the top page cannot read a cross-origin cards iframe. */
  async requestOpenTask(courseKey: string): Promise<boolean> {
    const reports = this.activeReports().filter(report => report.courseKey === courseKey && report.snapshot.unfinishedTaskPoints > 0);
    for (const report of reports) {
      if (report.id === this.id) { if (this.onOpenTask?.()) return true; continue; }
      const target = this.reports.get(report.id); if (!target) continue;
      const ok = await this.requestAction(target, { type: 'open-task' });
      if (ok) return true;
    }
    return false;
  }
  activeReports(): FrameReport[] {
    for (const [id, report] of this.reports) {
      // Chrome can throttle background timers to roughly one minute; retain enough slack
      // without allowing an abandoned frame to block the queue for three minutes.
      if (Date.now() - report.at > 75_000 || (report.source !== window && !isChildWindow(report.source))) this.reports.delete(id);
    }
    return [...this.reports.values()];
  }
  close(): void { clearInterval(this.ancestryTimer); for (const pending of this.pendingActions.values()) { clearTimeout(pending.timer); pending.resolve(false); } this.pendingActions.clear(); window.removeEventListener('message', this.handler); }
}
function isDirectChildWindow(source: MessageEventSource | null): boolean {
  if (!source) return false;
  for (let i = 0; i < window.frames.length; i++) if (window.frames[i] === source) return true;
  return false;
}
function isChildWindow(source: MessageEventSource | null): boolean {
  if (!source || source === window) return false;
  const queue: Window[] = [window];
  for (let seen = 0; queue.length && seen < 100; seen++) {
    const parent = queue.shift()!;
    try { for (let i = 0; i < parent.frames.length; i++) { const child = parent.frames[i]; if (child === source) return true; queue.push(child); } } catch { /* Ignore a frame that disappeared. */ }
  }
  return false;
}
