import type { WatchCondition, WatchRequirement } from '../types';
import { normalizeText } from '../utils';

/** Only explicit task-pass statements are accepted; score weights are not pass thresholds. */
export function parseWatchRequirement(evidence: { text: string; source: string; scope: string }[], scoringText = ''): WatchRequirement {
  const conditions: WatchCondition[] = [];
  for (const item of evidence) {
    const text = normalizeText(item.text);
    if (!/(?:任务点|本视频|该视频|本音频|完成条件|通过条件|最低观看|至少观看|观看至少|观看满)/.test(text)) continue;
    if (!/(?:通过|完成|最低|至少|满)/.test(text)) continue;
    for (const match of text.matchAll(/(?:观看|播放|学习)(?:总)?(?:时长|进度|比例|量)?\s*(?:(?:需要|需|须|达到|至少|满|不少于|≥|>=|最低为|最低|为|:|：)\s*)*(?:总时长的?\s*)?(\d+(?:\.\d+)?)\s*%/g)) {
      const ratio = Number(match[1]) / 100;
      if (ratio > 0 && ratio <= 1) conditions.push({ kind: 'ratio', value: ratio, source: item.source, scope: item.scope });
    }
    for (const match of text.matchAll(/(?:观看|播放|学习)(?:总)?(?:时长)?\s*(?:(?:需要|需|须|达到|至少|满|不少于|≥|>=|最低为|最低|为|:|：)\s*)*(\d+(?:\.\d+)?)\s*(小时|分钟|分|秒)/g)) {
      const value = Number(match[1]) * (match[2] === '小时' ? 3600 : /分钟|分/.test(match[2]) ? 60 : 1);
      if (value > 0) conditions.push({ kind: 'seconds', value, source: item.source, scope: item.scope });
    }
  }
  const unique = conditions.filter((x, i, all) => all.findIndex(y => y.kind === x.kind && y.value === x.value && y.scope === x.scope) === i);
  const contradictory = unique.some(a => unique.some(b => a.kind === b.kind && a.scope === b.scope && a.value !== b.value));
  if (!unique.length || contradictory) return { known: false, conditions: [], reason: contradictory ? '最低观看要求来源冲突，回退完整播放' : '最低要求未知，回退完整播放', scoringText };
  return { known: true, conditions: unique, scoringText };
}
export function requiredSeconds(requirement: WatchRequirement, duration: number): number | undefined {
  if (!requirement.known || !Number.isFinite(duration) || duration <= 0) return undefined;
  return Math.max(...requirement.conditions.map(c => c.kind === 'ratio' ? c.value * duration : c.value));
}
export function watchTargetMet(requirement: WatchRequirement, progress: { duration: number; watched: number; ended: boolean }, efficient: boolean): boolean {
  if (!efficient || !requirement.known) {
    // Full playback is judged from the browser's played ranges. A small tolerance
    // covers the final timeupdate boundary without treating a seek as viewing.
    return progress.ended && Number.isFinite(progress.duration) && progress.duration > 0 && progress.watched >= Math.max(0, progress.duration - 2);
  }
  const target = requiredSeconds(requirement, progress.duration);
  return target !== undefined && progress.watched >= target;
}
export function requirementLabel(requirement: WatchRequirement): string {
  if (!requirement.known) return requirement.reason || '最低要求未知，回退完整播放';
  return requirement.conditions.map(c => c.kind === 'ratio' ? `观看至少 ${Math.round(c.value * 10000) / 100}%` : `观看至少 ${Math.ceil(c.value)} 秒`).join('，且');
}
