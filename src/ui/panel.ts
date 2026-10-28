import type { AiProviderId, Course, TaskRecord } from '../types';
import type { Repository } from '../storage';
import { AI_PROVIDERS, getProvider, type ModelOption } from '../ai/providers';
import { completionUrl } from '../ai/client';
import { downloadText, errorMessage } from '../utils';
import { requirementLabel } from '../core/efficiency';
import { courseEntryUrl } from '../platform/courses';
import { THEME_ART, THEME_CSS, themeName } from './themes';

export interface PanelActions { start(): void; stop(): void; retry(): void; scan(): void; refresh(): Promise<void>; summarize(courseKey: string): Promise<void>; exportNote(courseKey: string): void }
const CSS = `
:host{all:initial;font:13px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;color:#25324a;position:fixed;right:20px;bottom:20px;z-index:2147483645;color-scheme:light}
*{box-sizing:border-box}button,input,select{font:inherit}button{cursor:pointer;border:1px solid #dbe2ef;border-radius:8px;background:white;color:#344366;padding:7px 11px}button:hover{background:#edf1ff}button:disabled{cursor:default;opacity:.5}button.primary{background:#5065d9;border-color:#5065d9;color:white}button.danger{color:#bb3d4a}.panel{width:390px;max-width:calc(100vw - 32px);border-radius:16px;box-shadow:0 12px 60px #23305240;border:1px solid #e1e6f1;background:#f7f9fd;overflow:hidden}.head{background:#fff;padding:15px 17px;display:flex;align-items:center;justify-content:space-between;cursor:move;user-select:none}.brand{font-size:16px;font-weight:700;letter-spacing:.3px}.version{font-size:11px;color:#96a0b4;margin-left:7px}.tabs{display:flex;border-bottom:1px solid #e2e8f2;padding:0 12px;background:#fff}.tabs button{border:0;border-radius:0;padding:10px 13px;color:#8490a9;background:transparent}.tabs button.active{color:#5065d9;border-bottom:2px solid #5065d9;font-weight:600}.body{padding:14px;max-height:65vh;overflow:auto}.card{padding:12px;border:1px solid #e0e6f0;border-radius:10px;background:white;margin:0 0 10px}.muted{color:#8490a9;font-size:12px}.hint{background:#edf1ff;border-radius:8px;padding:9px 10px;color:#586891;font-size:12px;margin-bottom:12px}.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.spread{justify-content:space-between}.course-title{font-weight:600;overflow-wrap:anywhere;max-width:280px}.options{margin-top:10px;display:flex;gap:16px}.options label{display:flex;gap:5px;align-items:center;font-size:12px}label{cursor:pointer}input[type=checkbox]{accent-color:#586bdd}input[type=text],input[type=password],input[type=url],select{width:100%;background:#f8faff;border:1px solid #dce3ef;border-radius:7px;padding:8px 10px;color:#263859;outline:none}input:focus,select:focus{border-color:#667ce3}select{padding-right:26px}.field [hidden]{display:none}.provider-note{margin:-2px 0 8px;color:#8490a9;font-size:12px;line-height:1.5}.link{color:#5065d9;text-decoration:none;font-size:12px}.link:hover{text-decoration:underline}.field{display:block;margin:0 0 11px}.field span{display:block;margin:0 0 4px;color:#62708b;font-size:12px}.toolbar{display:flex;gap:8px;margin-bottom:12px}.toolbar button{flex:1}.pill{display:inline-block;font-size:11px;padding:2px 7px;border-radius:5px;background:#edf1fb;color:#6b7b9b}.status{font-size:13px;font-weight:600}.warning{color:#b16d20}.success{color:#267e63}.error{color:#bd4351}.log{padding:6px 0;border-bottom:1px solid #eef1f8;font-size:12px;overflow-wrap:anywhere}.log time{color:#9aa5ba;margin-right:7px}.small-button{padding:1px 6px;font-size:12px}.footer{padding:10px 14px;border-top:1px solid #e3e8f0;font-size:11px;color:#97a2b6;background:#fff}.bubble{background:#5065d9;color:white;box-shadow:0 5px 24px #465ccd55;border:0;padding:11px 17px;border-radius:22px;font-weight:600}pre{white-space:pre-wrap;word-break:break-word;font:12px/1.65 inherit;margin:7px 0}.meter{height:5px;background:#e9edf7;border-radius:4px;margin:8px 0;overflow:hidden}.meter>div{background:#6479e1;height:100%}.empty{text-align:center;color:#96a0b4;padding:22px 10px}.ack{display:flex;gap:8px;margin:12px 0}.exam{border-top:4px solid #e7ac56}.exam h3{margin:0 0 8px;font-size:15px}.exam .body{max-height:60vh}.notice{white-space:pre-wrap;overflow-wrap:anywhere}
`;
function element<K extends keyof HTMLElementTagNameMap>(tag: K, content = '', className = ''): HTMLElementTagNameMap[K] { const el = document.createElement(tag); if (content) el.textContent = content; if (className) el.className = className; return el; }
function button(title: string, action: () => unknown, cls = ''): HTMLButtonElement { const b = element('button', title, cls); b.type = 'button'; b.addEventListener('click', () => { void action(); }); return b; }
const STATUS: Record<string, string> = { queued: '等待运行', running: '正在运行', pending: '待办', 'waiting-human': '等待人工', 'awaiting-confirmation': '等待人工交卷', 'submitted-unverified': '提交结果待核验', completed: '平台已确认完成' };
const KIND: Record<string, string> = { video: '视频', audio: '音频', document: '文档', quiz: '题目', discussion: '讨论', exam: '考试', unsupported: '未适配' };

export class Panel {
  private host = element('div'); private root: ShadowRoot; private container = element('div', '', 'panel'); private body = element('div', '', 'body'); private tab = 'courses'; private collapsed = false; private scheduled = false;
  private fields?: { base: HTMLInputElement; key: HTMLInputElement; text: HTMLSelectElement; vision: HTMLSelectElement; muted: HTMLInputElement };
  private notice = ''; private settingsHold = false;
  constructor(private repo: Repository, private actions: PanelActions) {
    this.host.id = 'xxtplay-root'; this.root = this.host.attachShadow({ mode: 'closed' });
    const style = element('style'); style.textContent = CSS + THEME_CSS; this.root.append(style); document.documentElement.append(this.host);
    this.collapsed = repo.storage.get('xxtplay:v1:ui:collapsed', false); this.applyPosition(); this.shell();
    window.addEventListener('resize', () => this.clampPosition());
  }
  show(): void { this.collapsed = false; this.repo.storage.set('xxtplay:v1:ui:collapsed', false); this.shell(); }
  schedule(): void { if (this.scheduled) return; this.scheduled = true; setTimeout(() => { this.scheduled = false; this.render(); }, 150); }
  private shell(): void {
    this.host.dataset.theme = this.repo.config().ai.provider;
    for (const child of [...this.root.children]) if (child.tagName !== 'STYLE') child.remove();
    if (this.collapsed) { this.root.append(button('📚 xxtplay', () => this.show(), 'bubble')); return; }
    this.container = element('div', '', 'panel');
    const scene = element('div', '', 'scene'); scene.setAttribute('aria-hidden', 'true');
    const art = THEME_ART[this.repo.config().ai.provider]; if (art) scene.style.backgroundImage = `url("${art}")`;
    this.container.append(scene);
    const head = element('div', '', 'head'); const identity = element('div', '', 'identity');
    const mark = element('span', '', 'theme-mark'); mark.setAttribute('aria-hidden', 'true');
    const logo = element('div', '', 'brand'); logo.append(element('div', 'xxtplay', 'brand-name'), element('div', '学习助手', 'brand-subtitle'));
    identity.append(mark, logo);
    const headerEnd = element('div', '', 'header-end'); headerEnd.append(element('span', themeName(this.repo.config().ai.provider), 'theme-badge'), button('收起', () => { this.collapsed = true; this.repo.storage.set('xxtplay:v1:ui:collapsed', true); this.shell(); }, 'small-button'));
    head.append(identity, headerEnd);
    this.makeDraggable(head);
    const tabs = element('div', '', 'tabs');
    for (const [id, name] of [['courses', '课程'], ['play', '播放'], ['run', '运行'], ['ai', 'AI 设置'], ['notes', '复习']]) { const b = button(name, () => { this.tab = id; this.fields = undefined; this.settingsHold = false; this.shell(); }, this.tab === id ? 'active' : ''); tabs.append(b); }
    this.body = element('div', '', 'body'); this.body.dataset.tab = this.tab; this.container.append(head, tabs, this.body, element('div', '浏览器需保持打开 · AI 仅用于答题与复习整理', 'footer')); this.root.append(this.container); this.render(); this.clampPosition();
  }
  private render(): void {
    if (this.collapsed) return;
    if ((this.tab === 'ai' || this.tab === 'play') && this.settingsHold) return; // A progress heartbeat must not erase a key being typed.
    this.body.replaceChildren(); const state = this.repo.state();
    if (this.notice) this.body.append(element('div', this.notice, 'hint notice'));
    if (this.tab === 'courses') {
      const bar = element('div', '', 'toolbar'); bar.append(button(state.autoRun ? '队列已开启' : '开始队列', () => this.actions.start(), 'primary'), button('暂停', () => this.actions.stop()), button('识别课程', () => this.actions.scan()), button('读取课程', () => this.actions.refresh())); this.body.append(bar);
      this.body.append(element('div', '先勾选课程。效率模式按平台最低观看要求执行，未知时完整播放；复习资料按课程单独开启。「读取课程」会从学习通首页读取全部课程和任务点进度。', 'hint'));
      const courses = [...state.courses].sort((a, b) => a.order - b.order);
      for (const course of courses) {
        const card = element('div', '', 'card'); const row = element('div', '', 'row spread'); const label = element('label', '', 'row course-title'); const enabled = element('input'); enabled.type = 'checkbox'; enabled.checked = course.enabled; enabled.setAttribute('aria-label', `选择课程 ${course.title}`); enabled.addEventListener('change', () => this.changeCourse(course.key, 'enabled', enabled.checked)); label.append(enabled, document.createTextNode(course.title));
        const controls = element('div', '', 'row'); controls.append(button('↑', () => this.move(course.key, -1), 'small-button'), button('↓', () => this.move(course.key, 1), 'small-button')); row.append(label, controls);
        const options = element('div', '', 'options');
        for (const [key, name] of [['efficiencyMode', '效率模式'], ['summaryEnabled', '复习资料']] as const) {
          const l = element('label'); const input = element('input'); input.type = 'checkbox'; input.checked = course[key]; input.setAttribute('aria-label', `${course.title} ${name}`); input.addEventListener('change', () => this.changeCourse(course.key, key, input.checked)); l.append(input, document.createTextNode(name)); options.append(l);
        }
        card.append(row);
        if (course.progress) {
          const meter = element('div', '', 'meter'); const fill = element('div'); fill.style.width = `${Math.max(0, Math.min(100, course.progress.percent))}%`; meter.append(fill); card.append(meter);
          card.append(element('div', `${course.progress.text}${course.progress.total ? ` · ${Math.round(course.progress.percent)}%` : ''}${course.teacher ? ` · ${course.teacher}` : ''}`, 'muted'));
        } else card.append(element('div', `进度未读取${course.teacher ? ` · ${course.teacher}` : ''}`, 'muted'));
        const entry = courseEntryUrl(course);
        if (entry) {
          const open = element('a', '打开课程', 'link'); open.href = entry; open.target = '_blank'; open.rel = 'noopener noreferrer'; card.append(open);
        }
        card.append(options); this.body.append(card);
      }
      if (!courses.length) this.body.append(element('div', '进入一门已登录课程后，点击“识别课程”。', 'empty'));
      this.body.append(button('导出配置（不含密钥）', () => downloadText('xxtplay-settings.json', this.repo.exportSettings())));
    } else if (this.tab === 'run') {
      const toolbar = element('div', '', 'toolbar'); toolbar.append(button('暂停队列', () => this.actions.stop()), button('重试待办', () => this.actions.retry())); this.body.append(toolbar);
      this.body.append(element('div', state.pausedReason || (state.autoRun ? '队列已开启，等待或正在执行可用任务。' : '队列已暂停。'), 'hint'));
      for (const task of Object.values(state.tasks).sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)) this.body.append(this.taskCard(task, state.courses));
      const count = state.audit.length; const tokens = state.audit.reduce((n, r) => n + r.inputTokens + r.outputTokens, 0);
      this.body.append(element('div', `AI 调用 ${count} 次 · 累计 ${tokens.toLocaleString()} tokens（服务商返回值）`, 'muted'));
      for (const log of state.logs.slice(-35).reverse()) { const line = element('div', '', `log ${log.level}`); line.append(element('time', new Date(log.at).toLocaleTimeString('zh-CN', { hour12: false })), document.createTextNode(log.message)); this.body.append(line); }
    } else if (this.tab === 'ai') this.aiSettings();
    else if (this.tab === 'play') this.playbackSettings();
    else {
      this.body.append(element('div', '仅处理已开启复习资料的课程。视频无可读字幕时会标注缺失，不推测未提供的内容。', 'hint'));
      for (const course of state.courses.filter(c => c.summaryEnabled)) {
        const card = element('div', '', 'card'); card.append(element('div', course.title, 'course-title'), element('div', `材料 ${state.materials.filter(m => m.courseKey === course.key).length} 项 · 笔记 ${state.notes.filter(n => n.courseKey === course.key).length} 章`, 'muted'));
        const row = element('div', '', 'row'); row.style.marginTop = '10px'; row.append(button('生成／更新复习资料', async () => { try { await this.actions.summarize(course.key); } catch (e) { this.notice = errorMessage(e); this.render(); } }, 'primary'), button('导出 Markdown', () => this.actions.exportNote(course.key))); card.append(row); this.body.append(card);
      }
      if (!state.courses.some(c => c.summaryEnabled)) this.body.append(element('div', '先在“课程”中开启复习资料。', 'empty'));
      for (const audit of state.audit.slice(-10).reverse()) this.body.append(element('div', `${new Date(audit.at).toLocaleTimeString('zh-CN')} · ${audit.purpose === 'answer' ? '答题' : '总结'} · ${audit.model} · ${audit.ok ? '成功' : '失败'}`, 'log'));
    }
  }
  private taskCard(task: TaskRecord, courses: Course[]): HTMLElement {
    const card = element('div', '', 'card'); card.append(element('div', task.title, 'course-title'), element('div', STATUS[task.status] || task.status, `status ${task.status === 'completed' ? 'success' : task.status === 'running' ? '' : 'warning'}`));
    const course = courses.find(c => c.key === task.courseKey);
    card.append(element('div', `${course?.title || task.courseKey} · ${task.chapter || '位置未记录'} · ${KIND[task.kind] || task.kind}`, 'muted'));
    if (task.progress) {
      const { current, duration, requirement } = task.progress; const meter = element('div', '', 'meter'); const fill = element('div'); fill.style.width = `${duration ? Math.min(100, current / duration * 100) : 0}%`; meter.append(fill); card.append(meter, element('div', `${Math.floor(current)} / ${Math.floor(duration)} 秒 · ${requirementLabel(requirement)}`, 'muted'));
    }
    const target = task.url && !/\/ananas\/modules\//.test(task.url) ? task.url : course?.url;
    const link = course && target ? courseEntryUrl({ ...course, url: target }) : '';
    if (link) { const open = element('a', '打开页面', 'link'); open.href = link; open.target = '_blank'; open.rel = 'noopener noreferrer'; card.append(open); }
    if (task.reason) card.append(element('div', task.reason, 'muted notice')); return card;
  }
  private playbackSettings(): void {
    this.settingsHold = true;
    const playback = this.repo.config().playback;
    this.body.append(element('div', '自动打开任务点和倍速受平台限制；完成仍以平台回执为准。为保证观看时长，不会自动拖动视频。', 'hint'));
    const option = (name: string, checked: boolean, label = name) => { const line = element('label', '', 'row'); line.style.margin = '0 0 9px'; const input = element('input'); input.type = 'checkbox'; input.checked = checked; input.setAttribute('aria-label', name); line.append(input, document.createTextNode(label)); this.body.append(line); return input; };
    const autoOpen = option('自动打开下一个任务点', playback.autoOpen, '自动打开下一个任务点（无需手动点视频）');
    const autoSpeed = option('平台允许时自动倍速', playback.autoSpeed);
    const speedField = element('label', '', 'field'); const speed = element('select'); speed.setAttribute('aria-label', '倍速');
    for (const value of [1.25, 1.5, 1.75, 2, 2.5, 3]) { const choice = element('option', `${value}×`); choice.value = String(value); speed.append(choice); }
    speed.value = String(playback.speed); speed.disabled = !playback.autoSpeed; speedField.append(element('span', '倍速'), speed); this.body.append(speedField);
    this.body.append(element('div', '倍速仅在平台明确允许时使用；原有自动拖动设置已停用。', 'muted'));
    const notice = element('div', '', 'muted'); notice.style.marginTop = '10px';
    const save = () => { const config = this.repo.config(); config.playback = { autoOpen: autoOpen.checked, autoSpeed: autoSpeed.checked, speed: Number(speed.value) || 2, autoSeek: false }; this.repo.saveConfig(config); notice.textContent = '播放设置已保存。'; speed.disabled = !autoSpeed.checked; };
    for (const input of [autoOpen, autoSpeed]) input.addEventListener('change', save);
    speed.addEventListener('change', save); this.body.append(notice);
  }
  private applyPosition(): void {
    const position = this.repo.storage.get<{ left: number; top: number } | null>('xxtplay:v1:ui:position', null);
    if (!position || !Number.isFinite(position.left) || !Number.isFinite(position.top)) return;
    this.host.style.left = `${Math.max(0, Math.round(position.left))}px`; this.host.style.top = `${Math.max(0, Math.round(position.top))}px`;
    this.host.style.right = 'auto'; this.host.style.bottom = 'auto';
  }
  private clampPosition(): void {
    if (!this.host.style.left && !this.host.style.top) return;
    const rect = this.host.getBoundingClientRect(); if (!rect.width) return;
    const left = Math.max(0, Math.min(rect.left, window.innerWidth - Math.min(rect.width, window.innerWidth - 8)));
    const top = Math.max(0, Math.min(rect.top, window.innerHeight - Math.min(rect.height, window.innerHeight - 8)));
    this.host.style.left = `${Math.round(left)}px`; this.host.style.top = `${Math.round(top)}px`;
  }
  private makeDraggable(handle: HTMLElement): void {
    let start: { x: number; y: number; left: number; top: number } | undefined;
    handle.addEventListener('pointerdown', event => {
      if ((event.target as Element).closest('button,a,input,select')) return;
      const rect = this.host.getBoundingClientRect(); start = { x: event.clientX, y: event.clientY, left: rect.left, top: rect.top };
      try { handle.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (!start) return;
      const rect = this.host.getBoundingClientRect();
      const left = Math.max(0, Math.min(start.left + event.clientX - start.x, window.innerWidth - Math.min(rect.width, window.innerWidth - 8)));
      const top = Math.max(0, Math.min(start.top + event.clientY - start.y, window.innerHeight - Math.min(rect.height, window.innerHeight - 8)));
      this.host.style.left = `${Math.round(left)}px`; this.host.style.top = `${Math.round(top)}px`; this.host.style.right = 'auto'; this.host.style.bottom = 'auto';
    });
    const finish = (event: PointerEvent) => {
      if (!start) return; start = undefined;
      try { handle.releasePointerCapture(event.pointerId); } catch { /* Already released. */ }
      const rect = this.host.getBoundingClientRect(); this.repo.storage.set('xxtplay:v1:ui:position', { left: Math.round(rect.left), top: Math.round(rect.top) });
    };
    handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
    handle.addEventListener('dblclick', event => {
      if ((event.target as Element).closest('button,a,input,select')) return;
      this.repo.storage.delete('xxtplay:v1:ui:position'); this.host.style.left = ''; this.host.style.top = ''; this.host.style.right = '20px'; this.host.style.bottom = '20px';
    });
  }
  private aiSettings(): void {
    this.settingsHold = true;
    const cfg = this.repo.config(); const preset = getProvider(cfg.ai.provider);
    this.body.append(element('div', '密钥只存于油猴存储。API 请求仅发生在题目作答和已开启的复习整理中；保存设置不会调用 AI。自定义接口首次连接时需在油猴中授权该域名。', 'hint'));
    const field = (name: string, value: string, type = 'text') => { const label = element('label', '', 'field'); const input = element('input'); input.type = type; input.value = value; input.autocomplete = 'off'; input.setAttribute('aria-label', name); label.append(element('span', name), input); this.body.append(label); return input; };
    const providerLabel = element('label', '', 'field'); const providerSelect = element('select'); providerSelect.setAttribute('aria-label', '服务商');
    for (const item of AI_PROVIDERS) { const option = element('option', item.name); option.value = item.id; providerSelect.append(option); }
    providerSelect.value = cfg.ai.provider; providerLabel.append(element('span', '服务商'), providerSelect); this.body.append(providerLabel);
    const base = field('API 地址', cfg.ai.baseUrl, 'url'); const key = field('API Key', '', 'password'); key.placeholder = cfg.ai.apiKey ? '已配置；留空保留现有密钥' : '粘贴你自己的 API Key';
    const modelField = (name: string, items: ModelOption[], value: string, emptyLabel?: string) => {
      const wrap = element('label', '', 'field'); const select = element('select'); select.setAttribute('aria-label', name);
      const custom = element('input'); custom.type = 'text'; custom.autocomplete = 'off'; custom.placeholder = '填写服务商控制台中的模型 ID'; custom.setAttribute('aria-label', `自定义${name}`); custom.hidden = true;
      const sync = (focus = false) => { custom.hidden = select.value !== '__custom__'; if (focus && !custom.hidden) custom.focus(); };
      select.addEventListener('change', () => sync(true));
      const fill = (next: ModelOption[], current: string) => {
        select.replaceChildren();
        if (emptyLabel) { const option = element('option', emptyLabel); option.value = ''; select.append(option); }
        for (const item of next) { const option = element('option', item.label); option.value = item.id; select.append(option); }
        const option = element('option', '自定义…'); option.value = '__custom__'; select.append(option);
        if (next.some(item => item.id === current) || (!!emptyLabel && current === '')) select.value = current;
        else { select.value = '__custom__'; custom.value = current; }
        sync();
      };
      wrap.append(element('span', name), select, custom); this.body.append(wrap); fill(items, value);
      return { select, fill, value: () => select.value === '__custom__' ? custom.value.trim() : select.value };
    };
    const text = modelField('文本模型', preset.textModels, cfg.ai.textModel);
    const vision = modelField('视觉模型（图片题）', preset.visionModels, cfg.ai.visionModel, '不使用（图片题保留待办）');
    const note = element('div', preset.note, 'provider-note'); this.body.append(note);
    const links = element('div', '', 'row'); links.style.marginBottom = '10px';
    const keyLink = element('a', '获取 API Key', 'link'); keyLink.target = '_blank'; keyLink.rel = 'noopener noreferrer'; keyLink.href = preset.keyUrl || '#'; keyLink.hidden = !preset.keyUrl;
    const docsLink = element('a', '服务商模型文档', 'link'); docsLink.target = '_blank'; docsLink.rel = 'noopener noreferrer'; docsLink.href = preset.docsUrl || '#'; docsLink.hidden = !preset.docsUrl;
    links.append(keyLink, document.createTextNode(' · '), docsLink); this.body.append(links);
    const mutedLabel = element('label', '', 'row'); const muted = element('input'); muted.type = 'checkbox'; muted.checked = cfg.muted; mutedLabel.append(muted, document.createTextNode('音视频静音播放（推荐）')); this.body.append(mutedLabel, element('div', '浏览器通常只允许静音自动播放；关闭后若被拦截，脚本会先静音开始并尝试恢复声音。', 'muted'));
    this.fields = { base, key, text: text.select, vision: vision.select, muted };
    providerSelect.addEventListener('change', () => {
      const next = getProvider(providerSelect.value as AiProviderId);
      base.value = next.baseUrl; text.fill(next.textModels, next.textModels[0]?.id || ''); vision.fill(next.visionModels, next.visionModels[0]?.id || '');
      note.textContent = next.note; key.value = '';
      key.placeholder = next.id === cfg.ai.provider && cfg.ai.apiKey ? '已配置；留空保留现有密钥' : '切换服务商后请填写该服务商的 API Key';
      keyLink.hidden = !next.keyUrl; keyLink.href = next.keyUrl || '#'; keyLink.textContent = `获取 ${next.name} API Key`;
      docsLink.hidden = !next.docsUrl; docsLink.href = next.docsUrl || '#';
    });
    const save = button('保存设置', () => {
      try {
        completionUrl(base.value.trim()); const textModel = text.value(); const visionModel = vision.value(); if (!textModel) throw new Error('请填写文本模型名称');
        const provider = providerSelect.value as AiProviderId; const config = this.repo.config();
        let endpointChanged = true;
        try { endpointChanged = new URL(base.value.trim()).origin !== new URL(config.ai.baseUrl).origin; } catch { /* New endpoints require their own key. */ }
        if ((provider !== config.ai.provider || endpointChanged) && !key.value.trim()) throw new Error('切换服务商或 API 地址后请填写对应的 API Key');
        const changed = provider !== config.ai.provider || textModel !== config.ai.textModel || visionModel !== config.ai.visionModel;
        config.ai = { provider, baseUrl: base.value.trim(), apiKey: key.value.trim() || config.ai.apiKey, textModel, visionModel }; config.muted = muted.checked; this.repo.saveConfig(config);
        this.host.dataset.theme = provider; const badge = this.container.querySelector('.theme-badge'); if (badge) badge.textContent = themeName(provider);
        const scene = this.container.querySelector<HTMLElement>('.scene');
        if (scene && changed) { scene.style.backgroundImage = THEME_ART[provider] ? `url("${THEME_ART[provider]}")` : ''; scene.classList.remove('scene-in'); void scene.offsetWidth; scene.classList.add('scene-in'); }
        key.value = ''; key.placeholder = config.ai.apiKey ? '已配置；留空保留现有密钥' : '未配置密钥'; this.notice = '设置已保存。保存设置不会调用 AI。'; const hint = element('div', this.notice, 'hint'); this.body.append(hint);
      } catch (e) { this.body.append(element('div', errorMessage(e), 'error')); }
    }, 'primary'); save.style.marginTop = '12px'; this.body.append(save);
  }
  private changeCourse(key: string, setting: 'enabled' | 'efficiencyMode' | 'summaryEnabled', value: boolean): void { this.repo.update(s => { const c = s.courses.find(c => c.key === key); if (c) c[setting] = value; }); }
  private move(key: string, direction: number): void { this.repo.update(s => { const ordered = [...s.courses].sort((a, b) => a.order - b.order); const index = ordered.findIndex(c => c.key === key); const target = index + direction; if (target < 0 || target >= ordered.length) return; [ordered[index], ordered[target]] = [ordered[target], ordered[index]]; ordered.forEach((c, i) => c.order = i); }); }
}

export function examReview(task: TaskRecord, submit: (event: MouseEvent) => Promise<void>): { update(task: TaskRecord): void; close(): void } {
  const host = element('div'); host.id = 'xxtplay-exam-review'; const root = host.attachShadow({ mode: 'closed' }); const style = element('style'); style.textContent = CSS; root.append(style);
  const panel = element('div', '', 'panel exam'); const body = element('div', '', 'body'); panel.append(body); root.append(panel); document.documentElement.append(host);
  const render = (current: TaskRecord) => {
    body.replaceChildren(); body.append(element('h3', '考试答案已整理 · 等待人工交卷'), element('div', current.title, 'muted'));
    const unresolved = current.answers?.filter(a => !a.filled).length || 0;
    body.append(element('div', unresolved ? `有 ${unresolved} 道题未能自动完成，请先检查并手动作答。` : '请逐题核对答案，再确认是否交卷。', 'hint'));
    for (const item of current.answers || []) { const card = element('div', '', 'card'); card.append(element('div', item.title, 'course-title'), element('pre', item.error || `${item.answer?.optionIds.join(', ') || item.answer?.values.join('\n') || '已保留页面答案'}\n${item.answer?.explanation || ''}`)); body.append(card); }
    const label = element('label', '', 'ack'); const check = element('input'); check.type = 'checkbox'; check.setAttribute('aria-label', '我已检查当前试卷，确认交卷'); label.append(check, document.createTextNode('我已检查当前试卷，确认交卷'));
    const final = element('button', '确认提交本次考试', 'primary'); final.type = 'button'; final.disabled = true;
    check.addEventListener('change', () => { final.disabled = !check.checked; });
    final.addEventListener('click', async e => { if (!e.isTrusted || !check.checked) return; final.disabled = true; check.disabled = true; try { await submit(e); body.append(element('div', '已执行本次提交，请以平台结果为准。', 'hint')); } catch (error) { body.append(element('div', errorMessage(error), 'error')); } });
    body.append(label, final, element('div', '刷新或重试不会自动确认交卷。', 'muted'));
  };
  render(task); return { update: render, close: () => host.remove() };
}
