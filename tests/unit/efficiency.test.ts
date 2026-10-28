import { describe, expect, it } from 'vitest';
import { parseWatchRequirement, requiredSeconds, watchTargetMet } from '../../src/core/efficiency';
const requirement = (...texts: string[]) => parseWatchRequirement(texts.map((text, i) => ({ text, source: `source-${i}`, scope: 'video-1' })));
describe('效率模式：明确要求和平台完成必须分开核验', () => {
  it('读取真实页面样式中的 90% 完成条件', () => {
    const r = requirement('完成条件 观看时长需 ≥ 总时长的 90% (未完成任务点前, 当前视频不可拖拽)');
    expect(r.known).toBe(true); expect(r.conditions[0].value).toBe(.9); expect(requiredSeconds(r, 310)).toBe(279);
  });
  it('读取明确的最低观看秒数', () => { expect(requiredSeconds(requirement('本视频观看至少 2 分钟即可完成任务点'), 600)).toBe(120); });
  it('读取小时条件', () => { expect(requiredSeconds(requirement('任务点完成条件：观看至少 0.5 小时'), 3600)).toBe(1800); });
  it('组合时长和比例，取全部条件满足的目标', () => { expect(requiredSeconds(requirement('本视频观看至少 80% 即可通过', '本视频观看至少 9 分钟即可通过'), 600)).toBe(540); });
  it('矛盾来源回退完整播放', () => { const r = requirement('本视频观看至少 80% 即可通过', '本视频观看至少 90% 即可通过'); expect(r.known).toBe(false); expect(r.reason).toContain('冲突'); });
  it('不把考核权重当作完成比例', () => { expect(requirement('视频成绩占总成绩的90%').known).toBe(false); });
  it('未知要求不预设80%或90%', () => { const r = requirement('请完成视频学习'); expect(r.known).toBe(false); expect(watchTargetMet(r, { duration: 100, watched: 99, ended: false }, true)).toBe(false); });
  it('普通模式在视频结束前不结束', () => { expect(watchTargetMet(requirement('本视频观看至少 80% 即可通过'), { duration: 100, watched: 90, ended: false }, false)).toBe(false); });
  it('效率模式达到90%后才进入通过状态核验', () => { const r = requirement('本视频观看至少90%即可完成任务点'); expect(watchTargetMet(r, { duration: 100, watched: 89, ended: false }, true)).toBe(false); expect(watchTargetMet(r, { duration: 100, watched: 90, ended: false }, true)).toBe(true); });
  it('到结尾不代表已满足最低观看量', () => { expect(watchTargetMet(requirement('本视频观看至少90%即可完成任务点'), { duration: 100, watched: 20, ended: true }, true)).toBe(false); });
  it('完整播放要求已记录观看时长，不能只凭到结尾', () => {
    const r = requirement('请完成视频学习');
    expect(watchTargetMet(r, { duration: 100, watched: 20, ended: true }, true)).toBe(false);
    expect(watchTargetMet(r, { duration: 100, watched: 99.8, ended: true }, true)).toBe(true);
  });
  it('未知时长不会产生有效目标', () => { expect(requiredSeconds(requirement('本视频观看至少90%即可完成任务点'), NaN)).toBeUndefined(); });
});
