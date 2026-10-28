import { sleep, throwIfAborted } from '../utils';

export type PlayFailure = 'policy' | 'interrupted' | 'unsupported' | 'unknown';

/** Browsers report several distinct failures from HTMLMediaElement.play(); they need different recovery. */
export function classifyPlayError(error: unknown): PlayFailure {
  const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name?: unknown }).name || '') : '';
  if (name === 'NotAllowedError') return 'policy';
  if (name === 'AbortError') return 'interrupted';
  if (name === 'NotSupportedError') return 'unsupported';
  return 'unknown';
}

export const errorName = (error: unknown): string => error instanceof Error && error.name ? error.name : '未知错误';

export class AutoplayBlockedError extends Error {
  constructor(message = '浏览器要求一次点击后才能播放') { super(message); this.name = 'AutoplayBlockedError'; }
}

interface VideoJsPlayer {
  play(): Promise<void> | void;
  paused(): boolean;
  muted(value?: boolean): void;
}

export interface PlaybackOptions {
  /** User preference. Policy-denied audible playback is retried muted regardless of this value. */
  preferMuted: boolean;
  signal?: AbortSignal;
  log?: (message: string) => void;
  /** How long to wait for an autoplay gesture before giving up. Defaults to 20 seconds. */
  waitMs?: number;
}

export interface PlaybackResult { muted: boolean }

const HINT_ID = 'xxtplay-play-hint';

function pageWindow(): Window & { videojs?: (target: unknown) => VideoJsPlayer } {
  return (typeof unsafeWindow !== 'undefined' ? unsafeWindow : window) as Window & { videojs?: (target: unknown) => VideoJsPlayer };
}

function playerFor(media: HTMLMediaElement): VideoJsPlayer | undefined {
  try {
    const factory = pageWindow().videojs;
    if (typeof factory !== 'function') return undefined;
    // Prefer the player container id: videojs(element) may try to create a second player for a tech element.
    const container = media.closest('.video-js') as HTMLElement | null;
    const player = container?.id ? factory(container.id) : factory(media);
    return player && typeof player.play === 'function' && typeof player.paused === 'function' ? player : undefined;
  } catch { return undefined; }
}

function setMuted(media: HTMLMediaElement, player: VideoJsPlayer | undefined, muted: boolean): void {
  try { media.muted = muted; } catch { /* The player may replace the element while a source loads. */ }
  try { player?.muted(muted); } catch { /* Optional API; the native property above is authoritative. */ }
}

async function invokePlay(media: HTMLMediaElement, player: VideoJsPlayer | undefined): Promise<void> {
  if (player) {
    try {
      const result = player.play();
      if (result && typeof (result as Promise<void>).then === 'function') await result;
      else { await sleep(250); if (player.paused()) throw new DOMException('播放器尚未开始播放', 'AbortError'); }
      return;
    } catch (error) {
      if (classifyPlayError(error) === 'unsupported') throw error;
      // Fall through to the element. video.js may already have handled the request.
    }
  }
  await media.play();
}

function waitForReady(media: HTMLMediaElement, signal: AbortSignal | undefined, timeout: number): Promise<void> {
  if (media.readyState >= 1) return Promise.resolve();
  return new Promise(resolve => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      if (timer) clearTimeout(timer);
      for (const name of ['loadedmetadata', 'canplay', 'error'] as const) media.removeEventListener(name, done);
      signal?.removeEventListener('abort', done);
    };
    const done = () => { cleanup(); resolve(); };
    timer = setTimeout(done, timeout);
    for (const name of ['loadedmetadata', 'canplay', 'error'] as const) media.addEventListener(name, done, { once: true });
    signal?.addEventListener('abort', done, { once: true });
  });
}

function showHint(): void {
  if (document.getElementById(HINT_ID)) return;
  const hint = document.createElement('div');
  hint.id = HINT_ID;
  hint.textContent = 'xxtplay：浏览器要求一次点击，点击视频任意处自动继续播放';
  hint.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:2147483646;pointer-events:none;background:#1f2a44e6;color:#fff;font:13px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif;padding:8px 14px;border-radius:999px;box-shadow:0 4px 16px #0003;max-width:90vw;text-align:center';
  document.documentElement.append(hint);
}

function removeHint(): void { document.getElementById(HINT_ID)?.remove(); }

/** Wait for either a trusted click inside the player frame or a player-triggered `playing` event. */
function waitForStart(media: HTMLMediaElement, player: VideoJsPlayer | undefined, signal: AbortSignal | undefined, deadline: number, log?: (message: string) => void): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false;
    let attempting = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function cleanup() {
      if (timer) clearTimeout(timer);
      media.removeEventListener('playing', onPlaying);
      document.removeEventListener('pointerdown', onGesture, true);
      document.removeEventListener('click', onGesture, true);
      document.removeEventListener('keydown', onGesture, true);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onFocus);
      signal?.removeEventListener('abort', onAbort);
      removeHint();
    }
    function finish(value: boolean) { if (settled) return; settled = true; cleanup(); resolve(value); }
    function onPlaying() { finish(true); }
    function attempt() {
      if (settled || attempting) return;
      attempting = true;
      void invokePlay(media, player)
        .then(() => { if (!media.paused || media.ended) finish(true); })
        .catch(error => { log?.(`自动播放重试未成功：${errorName(error)}`); })
        .finally(() => { attempting = false; });
    }
    function onGesture() { attempt(); }
    function onVisibility() { if (document.visibilityState === 'visible') attempt(); }
    function onFocus() { attempt(); }
    function onAbort() { finish(false); }
    showHint();
    media.addEventListener('playing', onPlaying);
    document.addEventListener('pointerdown', onGesture, true);
    document.addEventListener('click', onGesture, true);
    document.addEventListener('keydown', onGesture, true);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(false), Math.max(0, deadline - Date.now()));
    if (signal?.aborted) onAbort();
  });
}

/** Start muted playback successfully, then try to restore the user's sound preference. */
async function restoreSound(media: HTMLMediaElement, player: VideoJsPlayer | undefined, muted: boolean, preferMuted: boolean, signal: AbortSignal | undefined, log?: (message: string) => void): Promise<boolean> {
  if (preferMuted || !muted) return muted;
  try {
    setMuted(media, player, false);
    await sleep(800, signal);
    if (media.paused && !media.ended) {
      setMuted(media, player, true);
      await invokePlay(media, player).catch(() => {});
      log?.('已静音播放；浏览器要求先点击一次才能恢复声音');
      return true;
    }
    log?.('已自动恢复声音');
    return false;
  } catch (error) {
    if (signal?.aborted) throw error;
    setMuted(media, player, true);
    return true;
  }
}

/**
 * Policy-aware playback start. Muted autoplay is always permitted by Chrome/Edge; audible autoplay
 * needs a gesture or a high media-engagement score. The only honest fallbacks are muting and waiting
 * for one user gesture — this helper never fakes a gesture or changes browser flags.
 */
export async function startPlayback(media: HTMLMediaElement, options: PlaybackOptions): Promise<PlaybackResult> {
  throwIfAborted(options.signal);
  if (media.tagName === 'VIDEO') (media as HTMLVideoElement).playsInline = true;
  const player = playerFor(media);
  let muted = options.preferMuted;
  setMuted(media, player, muted);
  const deadline = Date.now() + (options.waitMs ?? 20_000);
  let lastError: unknown;
  let interrupted = 0;
  while (Date.now() < deadline) {
    throwIfAborted(options.signal);
    try {
      await invokePlay(media, player);
      await sleep(250, options.signal);
      if (media.paused && !media.ended) throw new DOMException('播放器启动后仍处于暂停状态', 'AbortError');
      return { muted: await restoreSound(media, player, muted, options.preferMuted, options.signal, options.log) };
    } catch (error) {
      lastError = error;
      if (options.signal?.aborted) throw error;
      const kind = classifyPlayError(error);
      if (kind === 'unsupported') throw error;
      if (kind === 'interrupted' && interrupted < 2) {
        interrupted++;
        options.log?.(`播放被中断（${errorName(error)}），等待媒体就绪后重试 ${interrupted}/2`);
        await waitForReady(media, options.signal, 4_000);
        await sleep(400 * interrupted, options.signal);
        continue;
      }
      if (kind === 'interrupted') throw new Error('播放器多次中断或未开始播放，请检查媒体状态后重试');
      if (!muted) {
        muted = true; setMuted(media, player, true);
        options.log?.('浏览器拒绝有声自动播放，正在静音重试');
        continue;
      }
      options.log?.(`自动播放被浏览器拦截（${errorName(error)}），等待一次点击`);
      const started = await waitForStart(media, player, options.signal, deadline, options.log);
      if (started) return { muted: await restoreSound(media, player, true, options.preferMuted, options.signal, options.log) };
      if (options.signal?.aborted) throwIfAborted(options.signal);
      break;
    }
  }
  throw new AutoplayBlockedError(`浏览器要求一次点击后才能播放${lastError ? `（${errorName(lastError)}）` : ''}`);
}
