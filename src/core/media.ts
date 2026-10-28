import type { Course, TaskRecord } from '../types';
import type { Repository } from '../storage';
import { ChaoxingAdapter, type PlatformJob } from '../platform/chaoxing';
import { watchTargetMet, requirementLabel } from './efficiency';
import { AutoplayBlockedError, startPlayback } from './playback';
import { sleep, throwIfAborted } from '../utils';

export class HumanRequired extends Error {}
function playedSeconds(media: HTMLMediaElement): number {
  let total = 0;
  try { for (let i = 0; i < media.played.length; i++) total += Math.max(0, media.played.end(i) - media.played.start(i)); } catch { /* TimeRanges may be unavailable while loading. */ }
  return Number.isFinite(total) ? total : 0;
}
export async function playMedia(adapter: ChaoxingAdapter, job: PlatformJob, course: Course, repo: Repository, taskId: string, signal: AbortSignal, authorized: () => boolean, inlineQuestions: () => Promise<boolean>): Promise<string> {
  const media = job.element as HTMLMediaElement;
  if (!media || !/^(VIDEO|AUDIO)$/.test(media.tagName)) throw new Error('未找到媒体元素');
  const requirement = adapter.requirement(job);
  repo.log('info', `${course.efficiencyMode ? '效率模式' : '完整播放'}：${job.title}；${requirementLabel(requirement)}`);
  // Do not perform an async cards-page fetch here: it can stall playback on slow or
  // cross-origin pages. runJob already checks the synchronous passed state; a task that
  // is already passed is handled by the platform receipt path after playback.
  const config = repo.config();
  const playback = config.playback;
  const rate = Math.min(3, Math.max(1.25, Number(playback.speed) || 2));
  let speedEnabled = playback.autoSpeed && adapter.speedAllowed(job);
  let rateLogged = false;
  const enforceRate = () => {
    if (!speedEnabled) return;
    if (Math.abs(media.playbackRate - rate) < 0.01) return;
    try { media.playbackRate = rate; if (!rateLogged) { repo.log('info', `平台允许倍速，已设置为 ${rate}×`); rateLogged = true; } }
    catch { speedEnabled = false; }
  };
  if (playback.autoSpeed && !speedEnabled) repo.log('info', '平台未声明允许倍速，按原速播放');
  // Seeking skips actual viewing and cannot establish a minimum watched duration.
  // Keep the legacy setting readable but never use it to bypass a viewing requirement.
  if (playback.autoSeek) repo.log('info', '为保证实际观看时长，本版本不会自动拖动视频');
  media.muted = config.muted;
  let watched = repo.state().tasks[taskId]?.progress?.watched || 0;
  const duration = Number.isFinite(media.duration) ? media.duration : 0;
  if (duration > 1 && media.currentTime >= duration - 1) {
    // The platform player often restores the last position at the very end.
    // Replaying from zero is the only honest way to satisfy an unknown/full-view requirement.
    try { media.currentTime = 0; repo.log('info', '视频已停在结尾但平台未确认通过，重新从头播放以补足观看时长'); }
    catch { repo.log('warn', '播放器拒绝回到开头，按当前进度继续'); }
  } else if (duration > 1 && media.currentTime > 0) {
    // A resumed player already contains prior viewing; count its position as progress
    // so a 90% resume is not treated as a brand-new video.
    watched = Math.max(watched, media.currentTime);
    repo.log('info', `播放器从 ${Math.floor(media.currentTime)} 秒继续，已计入此前进度`);
  }
  const resumeFrom = media.currentTime;
  // `played` is the browser's own record of media ranges actually played. It survives
  // missed timeupdate events and background throttling, unlike a delta accumulator alone.
  const coverage = (): number => {
    const total = resumeFrom + playedSeconds(media);
    return Number.isFinite(duration) && duration > 0 ? Math.min(duration, total) : total;
  };
  let previous = media.currentTime; let previousWall = performance.now();
  let lastMovement = Date.now(); let lastCheckpoint = 0; let ended = media.ended; let wake = () => {};
  let playFailures = 0; let lastVerify = 0; let verified = false;
  const wakeUp = () => { wake(); };
  const timeupdate = () => {
    const now = performance.now(); const delta = media.currentTime - previous; const wall = (now - previousWall) / 1000;
    if (!media.seeking && delta > 0 && delta <= Math.max(3, wall * Math.max(media.playbackRate, 1) + 1)) {
      watched += delta; lastMovement = Date.now(); playFailures = 0;
    }
    previous = media.currentTime; previousWall = now;
    if (Date.now() - lastCheckpoint > 8000) checkpoint();
    wakeUp();
  };
  const checkpoint = () => {
    lastCheckpoint = Date.now();
    watched = Math.max(watched, coverage());
    repo.update(s => { const task = s.tasks[taskId]; if (task) { task.updatedAt = Date.now(); task.progress = { current: media.currentTime, duration: Number.isFinite(media.duration) ? media.duration : 0, requirement, watched }; } });
  };
  const onEnded = () => { ended = true; checkpoint(); wakeUp(); };
  const onAbort = () => { media.pause(); checkpoint(); wakeUp(); };
  const preferMuted = repo.config().muted;
  // Muted playback is the only autoplay path browsers always permit; audible playback falls back to a single gesture.
  const beginPlayback = async (): Promise<void> => {
    try { await startPlayback(media, { preferMuted, signal, log: message => repo.log('info', message) }); }
    catch (error) {
      if (error instanceof AutoplayBlockedError) throw new HumanRequired('浏览器要求一次点击：请点击视频一次，再点“重试待办”');
      throw error;
    }
  };
  media.addEventListener('timeupdate', timeupdate); media.addEventListener('ended', onEnded); media.addEventListener('pause', wakeUp); media.addEventListener('error', wakeUp); media.addEventListener('ratechange', enforceRate);
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    checkpoint();
    enforceRate();
    await beginPlayback();
    const started = Date.now();
    while (true) {
      throwIfAborted(signal);
      if (!authorized()) throw new DOMException('任务授权或账号已变化', 'AbortError');
      const blocked = adapter.blocked(); if (blocked) throw new HumanRequired(blocked);
      if (!media.isConnected) throw new Error('媒体页面已切换，已保存断点');
      if (media.error) throw new Error(`媒体加载失败（${media.error.code}），保留待办`);
      // Background pages may receive delayed timeupdate events even while the media clock advances.
      if (!media.paused && !media.seeking && media.currentTime > previous) timeupdate();
      watched = Math.max(watched, coverage());
      const target = watchTargetMet(requirement, { duration: media.duration, watched, ended: ended || media.ended }, course.efficiencyMode);
      if (target && Date.now() - lastVerify >= 5000) {
        lastVerify = Date.now(); verified = await adapter.verifyPassed(job);
      }
      if (verified && target) { media.pause(); checkpoint(); return '平台任务点已确认通过'; }
      if (ended || media.ended) {
        if (!target) throw new Error(`视频已到结尾，但已记录的观看时长不足（${Math.floor(watched)}/${Math.floor(media.duration)} 秒）；保留待办，请检查播放进度`);
        for (let i = 0; i < 3; i++) { if (await adapter.verifyPassed(job)) return '完整播放后平台任务点已确认通过'; await sleep(5000, signal); }
        throw new Error('视频已完整播放，平台尚未确认通过；保留待办，不标记完成');
      }
      if (media.paused && adapter.questionHandles().length) {
        if (!await inlineQuestions()) throw new HumanRequired('视频弹题未能完成，等待人工处理');
        lastMovement = Date.now(); await beginPlayback();
      } else if (media.paused || Date.now() - lastMovement > 45_000) {
        if (++playFailures > 3) throw new HumanRequired('媒体多次暂停或卡顿，请检查页面后重试');
        await beginPlayback();
        lastMovement = Date.now();
      }
      if (Number.isFinite(media.duration) && Date.now() - started > (media.duration * 2 + 600) * 1000) throw new Error('播放超过预期时长，保留待办');
      await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 1000);
        wake = () => { clearTimeout(timer); resolve(); };
      });
    }
  } finally {
    media.removeEventListener('timeupdate', timeupdate); media.removeEventListener('ended', onEnded); media.removeEventListener('pause', wakeUp); media.removeEventListener('error', wakeUp); media.removeEventListener('ratechange', enforceRate);
    signal.removeEventListener('abort', onAbort);
    media.pause(); checkpoint();
  }
}
