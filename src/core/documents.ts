import type { Course } from '../types';
import type { Repository } from '../storage';
import { ChaoxingAdapter, type PlatformJob, visible } from '../platform/chaoxing';
import { shortHash, sleep, sourceLink, throwIfAborted } from '../utils';

export async function readDocument(adapter: ChaoxingAdapter, job: PlatformJob, course: Course, repo: Repository, signal: AbortSignal, authorized: () => boolean): Promise<string> {
  const doc = adapter.doc; const container = job.element || doc.body;
  let pages = 0; let lastText = ''; const seen = new Set<string>(); const pieces: string[] = []; const images = new Set<string>();
  while (pages++ < 250) {
    throwIfAborted(signal); if (!authorized()) throw new DOMException('任务已暂停', 'AbortError');
    const blocked = adapter.blocked(); if (blocked) throw new Error(blocked);
    const current = (container.innerText || container.textContent || '').trim();
    const fingerprint = shortHash(current);
    if (current && !seen.has(fingerprint)) { seen.add(fingerprint); pieces.push(current.slice(0, 30_000)); }
    if (course.summaryEnabled) for (const img of container.querySelectorAll<HTMLImageElement>('#img,.swiper-slide img,.page img,.doc-page img')) if (img.src) images.add(img.src);
    const scroll = container.scrollHeight > container.clientHeight + 10 ? container : doc.scrollingElement as HTMLElement || container;
    const atEnd = scroll.scrollTop + scroll.clientHeight >= scroll.scrollHeight - 5;
    if (!atEnd) { scroll.scrollBy({ top: Math.max(300, scroll.clientHeight * .8), behavior: 'instant' }); await sleep(1800, signal); continue; }
    const next = [...doc.querySelectorAll<HTMLElement>('.swiper-button-next,.readerPager .next,.page-next,.nextPage,[title="下一页"]')].find(el => visible(el) && !el.classList.contains('swiper-button-disabled') && !el.hasAttribute('disabled'));
    if (next && current !== lastText) { lastText = current; next.click(); await sleep(1800, signal); continue; }
    break;
  }
  if (course.summaryEnabled) repo.update(s => {
    const id = `document:${course.key}:${job.id}`;
    const material = { id, courseKey: course.key, chapter: adapter.chapterTitle(), kind: 'document' as const, text: pieces.join('\n\n').slice(0, 200_000), images: [...images].slice(0, 100), source: sourceLink(doc.URL), missing: pieces.length ? undefined : '该文档未提供可读取的正文文本' };
    const at = s.materials.findIndex(m => m.id === id); if (at >= 0) s.materials[at] = material; else s.materials.push(material);
  });
  for (let i = 0; i < 3; i++) { if (await adapter.verifyPassed(job)) return '阅读后平台已确认任务点通过'; await sleep(5000, signal); }
  throw new Error('已完成可见页面阅读，平台尚未确认任务点通过；保留待办');
}
export async function collectSubtitles(adapter: ChaoxingAdapter, job: PlatformJob, course: Course, repo: Repository): Promise<void> {
  if (!repo.state().courses.find(c => c.key === course.key)?.summaryEnabled) return;
  const media = job.element as HTMLMediaElement; const parts: string[] = [];
  if (media?.textTracks) for (const track of media.textTracks) { track.mode = 'hidden'; for (const cue of Array.from(track.cues || [])) if ('text' in cue) parts.push(String(cue.text)); }
  for (const track of media?.querySelectorAll<HTMLTrackElement>('track[src]') || []) {
    try { const url = new URL(track.src, adapter.doc.URL); if (url.origin !== new URL(adapter.doc.URL).origin) continue; const res = await fetch(url.href, { credentials: 'include' }); if (res.ok) parts.push((await res.text()).replace(/^WEBVTT[^\n]*|^\d+\s*$|^.*-->.*$/gm, '').trim()); } catch { /* Missing subtitles are recorded, not invented. */ }
  }
  repo.update(s => { const id = `subtitle:${course.key}:${job.id}`; const material = { id, courseKey: course.key, chapter: adapter.chapterTitle(), kind: 'subtitle' as const, text: [...new Set(parts)].join('\n').slice(0, 300_000), source: sourceLink(adapter.doc.URL), missing: parts.length ? undefined : '该视频未提供可读取字幕；未进行语音转写' }; const i = s.materials.findIndex(m => m.id === id); if (i >= 0) s.materials[i] = material; else s.materials.push(material); });
}
