import type { Course, TaskRecord } from '../types';
import type { Repository } from '../storage';
import { ChaoxingAdapter, type PlatformJob } from '../platform/chaoxing';
import { watchTargetMet, requirementLabel } from './efficiency';
import { AutoplayBlockedError, startPlayback } from './playback';
import { sleep, throwIfAborted } from '../utils';

export class HumanRequired extends Error {}
export async function playMedia(adapter: ChaoxingAdapter, job: PlatformJob, course: Course, repo: Repository, taskId: string, signal: AbortSignal, authorized: () => boolean, inlineQuestions: () => Promise<boolean>): Promise<string> {
  const media = job.element as HTMLMediaElement;
  if (!media || !/^(VIDEO|AUDIO)$/.test(media.tagName)) throw new Error('未找到媒体元素');
  const requirement = adapter.requirement(job);
  repo.log('info', `${course.efficiencyMode ? '效率模式' : '完整播放'}：${job.title}；${requirementLabel(requirement)}`);
  media.muted = repo.config().muted;
  let watched = repo.state().tasks[taskId]?.progress?.watched || 0;
  let previous = media.currentTime; let previousWall = performance.now();
  let lastMovement = Date.now(); let lastCheckpoint = 0; let ended = media.ended; let wake = () => {};
  let playFailures = 0; let lastVerify = 0; let verified = false;
  const wakeUp = () => { wake(); };
  const timeupdate = () => {
    const now = performance.now(); const delta = media.currentTime - previous; const wall = (now - previousWall) / 1000;
    if (!media.seeking && delta > 0 && delta <= Math.max(3, wall * Math.max(media.playbackRate, 1) + 1)) { watched += delta; lastMovement = Date.now(); }
    previous = media.currentTime; previousWall = now;
    if (Date.now() - lastCheckpoint > 8000) checkpoint();
    wakeUp();
  };
  const checkpoint = () => {
    lastCheckpoint = Date.now();
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
  media.addEventListener('timeupdate', timeupdate); media.addEventListener('ended', onEnded); media.addEventListener('pause', wakeUp); media.addEventListener('error', wakeUp);
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    checkpoint();
    await beginPlayback();
    const started = Date.now();
    while (true) {
      throwIfAborted(signal);
      if (!authorized()) throw new DOMException('任务授权或账号已变化', 'AbortError');
      const blocked = adapter.blocked(); if (blocked) throw new HumanRequired(blocked);
      if (!media.isConnected) throw new Error('媒体页面已切换，已保存断点');
      if (media.error) throw new Error(`媒体加载失败（${media.error.code}），保留待办`);
      const target = watchTargetMet(requirement, { duration: media.duration, watched, ended: ended || media.ended }, course.efficiencyMode);
      if ((target || (course.efficiencyMode && requirement.known)) && Date.now() - lastVerify >= (target ? 5000 : 20_000)) {
        lastVerify = Date.now(); verified = await adapter.verifyPassed(job);
      }
      if (verified && (target || (course.efficiencyMode && requirement.known))) { media.pause(); checkpoint(); return '平台任务点已确认通过'; }
      if (ended || media.ended) {
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
    media.removeEventListener('timeupdate', timeupdate); media.removeEventListener('ended', onEnded); media.removeEventListener('pause', wakeUp); media.removeEventListener('error', wakeUp);
    signal.removeEventListener('abort', onAbort);
    media.pause(); checkpoint();
  }
}
