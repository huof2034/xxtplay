export const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) return reject(new DOMException('操作已暂停', 'AbortError'));
  const finish = () => { signal?.removeEventListener('abort', abort); resolve(); };
  const timer = setTimeout(finish, ms);
  const abort = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); reject(new DOMException('操作已暂停', 'AbortError')); };
  signal?.addEventListener('abort', abort, { once: true });
});
export function throwIfAborted(signal?: AbortSignal): void { if (signal?.aborted) throw new DOMException('操作已暂停', 'AbortError'); }
export function normalizeText(s: string): string { return s.normalize('NFKC').replace(/[\u200b-\u200d\ufeff]/g, '').replace(/\s+/g, ' ').trim(); }
export function shortHash(text: string): string {
  let a = 2166136261; let b = 0x9e3779b9;
  for (const c of text) { a = Math.imul(a ^ c.charCodeAt(0), 16777619); b = Math.imul(b ^ c.charCodeAt(0), 2246822519); }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}
export function safeUrl(input: string, base = 'https://mooc1.chaoxing.com'): URL | undefined {
  try { const u = new URL(input, base); return /^https?:$/.test(u.protocol) ? u : undefined; } catch { return undefined; }
}
export function isChaoxingHost(host: string): boolean { return host === 'chaoxing.com' || host.endsWith('.chaoxing.com'); }
export function redact(message: string, secrets: string[] = []): string {
  let clean = message.replace(/([?&](?:enc|token|ticket|signature|authorization|cpi|uid|userid)=)[^\s&#]+/gi, '$1[已隐藏]')
    .replace(/Bearer\s+[^\s"']+/gi, 'Bearer [已隐藏]').replace(/\bsk-[a-zA-Z0-9_-]{8,}/g, '[密钥已隐藏]');
  for (const secret of secrets) if (secret.length > 3) clean = clean.split(secret).join('[已隐藏]');
  return clean;
}
export function sourceLink(input: string): string {
  const u = safeUrl(input); if (!u) return '';
  for (const k of [...u.searchParams.keys()]) if (!/^(courseid|clazzid|classid|knowledgeid|chapterid|workid|examid|num|ut|mooc2)$/i.test(k)) u.searchParams.delete(k);
  u.hash = ''; return u.href;
}
export function downloadText(name: string, text: string, type = 'text/plain;charset=utf-8'): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
export const errorMessage = (error: unknown): string => error instanceof Error ? error.message : String(error);
export async function retry<T>(action: (attempt: number) => Promise<T>, opts: { signal?: AbortSignal; attempts?: number; delayMs?: number; retryable?: (e: unknown) => boolean } = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  for (let i = 1; i <= attempts; i++) {
    throwIfAborted(opts.signal);
    try { return await action(i); } catch (e) {
      if (opts.signal?.aborted || i === attempts || opts.retryable?.(e) === false) throw e;
      await sleep((opts.delayMs ?? 1500) * 2 ** (i - 1), opts.signal);
    }
  }
  throw new Error('重试次数无效');
}
