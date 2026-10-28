import type { Course, CourseProgress } from '../types';
import { isChaoxingHost, normalizeText, safeUrl } from '../utils';

export interface CatalogEntry {
  id: string; classId: string; cpi: string; title: string;
  teacher?: string; progress?: CourseProgress;
}

export function courseHome(id: string, classId: string, cpi = ''): string {
  const url = new URL('https://mooc1.chaoxing.com/visit/stucoursemiddle');
  url.searchParams.set('courseid', id);
  url.searchParams.set('clazzid', classId);
  if (cpi) url.searchParams.set('cpi', cpi);
  url.searchParams.set('ismooc2', '1'); url.searchParams.set('v', '2');
  return url.href;
}

/** Old versions stored an incomplete /stu URL. Route it through the platform's course entry. */
export function courseEntryUrl(course: Course): string {
  const url = safeUrl(course.url);
  if (!url || !isChaoxingHost(url.hostname)) return '';
  if (/\/visit\/stucoursemiddle\/?$/.test(url.pathname) && !/^\d+$/.test(url.searchParams.get('cpi') || '')) return '';
  if (/\/mycourse\/stu\/?$/.test(url.pathname) && !url.searchParams.get('enc')) {
    if (!/^\d+$/.test(course.id) || !/^\d+$/.test(course.classId) || !/^\d+$/.test(course.cpi)) return '';
    return courseHome(course.id, course.classId, course.cpi);
  }
  return url.href;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/** Parse "已完成任务点: 1/19" or "进度 5%" without guessing a platform percentage. */
export function progressFromText(raw: string, updatedAt = Date.now()): CourseProgress | undefined {
  const text = normalizeText(raw);
  const pair = /已完成任务点\s*[:：]?\s*(\d+)\s*\/\s*(\d+)/.exec(text) || /任务点\s*[:：]?\s*(\d+)\s*\/\s*(\d+)/.exec(text);
  const percentMatch = /(\d+(?:\.\d+)?)\s*%/.exec(text);
  if (!pair && !percentMatch) return undefined;
  let done: number | undefined; let total: number | undefined; let percent = 0;
  if (pair) {
    done = Number(pair[1]); total = Number(pair[2]);
    percent = total > 0 ? Math.round(done / total * 1000) / 10 : 0;
  } else if (percentMatch) percent = Number(percentMatch[1]);
  const label = pair ? `已完成任务点 ${done}/${total}` : `进度 ${percent}%`;
  return { done, total, percent, text: label, updatedAt };
}

/**
 * The homepage course list is server-rendered HTML. Course names follow the
 * stucoursemiddle links in a span.course-name title (verified against the real
 * 2026-10 page structure); no page script is evaluated here.
 */
export function parseCourseListHtml(html: string, updatedAt = Date.now()): CatalogEntry[] {
  const entries: CatalogEntry[] = []; const seen = new Set<string>();
  const pattern = /stucoursemiddle\?courseid=(\d+)&(?:amp;)?clazzid=(\d+)&(?:amp;)?cpi=(\d+)/g;
  for (const match of html.matchAll(pattern)) {
    const id = match[1]; const classId = match[2]; const cpi = match[3]; const key = `${id}:${classId}`;
    if (seen.has(key)) continue;
    const segment = html.slice(match.index || 0, (match.index || 0) + 3200);
    const title = /course-name[^>]*title="([^"]+)"/.exec(segment)?.[1] || /course-name[^>]*>\s*([^<]+)/.exec(segment)?.[1];
    if (!title) continue;
    seen.add(key);
    const teacher = /class="line2 color3"[^>]*title="([^"]+)"/.exec(segment)?.[1] || /class="overHidden2"[^>]*>([^<]{1,30})</.exec(segment)?.[1];
    entries.push({ id, classId, cpi, title: decodeHtml(title).trim(), teacher: teacher ? decodeHtml(teacher).trim() : undefined, progress: progressFromText(segment, updatedAt) });
  }
  return entries;
}

const CARD_SELECTORS = '.course-card,.courseCard,.course-item,.courseItem,.course-list li,.courseList li,.my-course-list li,.myCourseList li,.course-list .course,.courseList .course';

/** Best-effort DOM fallback for homepages that render cards instead of the older list HTML. */
export function parseCourseCards(doc: Document, updatedAt = Date.now()): CatalogEntry[] {
  const entries: CatalogEntry[] = []; const seen = new Set<string>();
  const cards = new Set<HTMLElement>();
  for (const card of doc.querySelectorAll<HTMLElement>(CARD_SELECTORS)) cards.add(card);
  for (const anchor of doc.querySelectorAll<HTMLAnchorElement>('a[href*="courseid"],a[href*="courseId"]')) {
    const card = anchor.closest<HTMLElement>(CARD_SELECTORS) || anchor.closest<HTMLElement>('li,.course,.card,div');
    if (card) cards.add(card);
  }
  for (const card of cards) {
    const anchor = card.querySelector<HTMLAnchorElement>('a[href*="courseid"],a[href*="courseId"]') || (card instanceof HTMLAnchorElement ? card : undefined);
    const href = anchor?.href || '';
    const url = safeUrl(href);
    const id = url?.searchParams.get('courseid') || url?.searchParams.get('courseId') || card.dataset.courseid || '';
    const classId = url?.searchParams.get('clazzid') || url?.searchParams.get('clazzId') || card.dataset.clazzid || '';
    const cpi = url?.searchParams.get('cpi') || card.dataset.cpi || '';
    if (!/^\d+$/.test(id) || !/^\d+$/.test(classId)) continue;
    const key = `${id}:${classId}`; if (seen.has(key)) continue;
    const titleEl = card.querySelector<HTMLElement>('.course-name,.courseName,.course-title,.courseTitle,h3,h4,a[title]');
    const title = (titleEl?.getAttribute('title') || titleEl?.textContent || anchor?.getAttribute('title') || '').trim();
    if (!title) continue;
    const teacher = card.querySelector<HTMLElement>('.line2.color3,.teacher,.course-teacher')?.textContent?.trim();
    seen.add(key);
    entries.push({ id, classId, cpi, title: normalizeText(title), teacher: teacher ? normalizeText(teacher) : undefined, progress: progressFromText(card.textContent || '', updatedAt) });
  }
  return entries;
}

/** Parse the server-rendered chapter page without executing its scripts. */
export function parseCourseProgressHtml(html: string, updatedAt = Date.now()): CourseProgress | undefined {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
  const progress = progressFromText(text, updatedAt);
  const width = parseFloat(/class="catalog_ressbar_width"[^>]*style="[^"]*width:\s*([\d.]+)%/.exec(html)?.[1] || '');
  if (progress && Number.isFinite(width)) progress.percent = Math.max(0, Math.min(100, width));
  return progress;
}

/** Read the "已完成任务点: N/M" header on a course-home/chapter iframe. */
export function progressFromDocument(doc: Document, updatedAt = Date.now()): CourseProgress | undefined {
  const header = doc.querySelector('.xs_head_name,.chapter_head h2,.chapter_head');
  const progress = progressFromText(header?.textContent || '', updatedAt);
  const width = parseFloat(doc.querySelector<HTMLElement>('.catalog_ressbar_width')?.style.width || '');
  if (!progress && !Number.isFinite(width)) return undefined;
  const result = progress || { percent: 0, text: '', updatedAt };
  if (Number.isFinite(width)) result.percent = Math.max(0, Math.min(100, width));
  result.text = result.text || `进度 ${result.percent}%`;
  return result;
}

export function entryToCourse(entry: CatalogEntry, order: number): Course {
  return {
    id: entry.id, classId: entry.classId, cpi: entry.cpi, key: `${entry.id}:${entry.classId}`,
    title: entry.title, url: courseHome(entry.id, entry.classId, entry.cpi),
    enabled: false, efficiencyMode: false, summaryEnabled: false, order,
    teacher: entry.teacher, progress: entry.progress,
  };
}
