import { describe, expect, it } from 'vitest';
import { AutoplayBlockedError, classifyPlayError, errorName } from '../../src/core/playback';

describe('自动播放错误分类', () => {
  it('浏览器策略拒绝可识别', () => { expect(classifyPlayError(new DOMException('blocked', 'NotAllowedError'))).toBe('policy'); });
  it('播放被加载或暂停打断可识别', () => { expect(classifyPlayError(new DOMException('interrupted', 'AbortError'))).toBe('interrupted'); });
  it('媒体格式错误可识别', () => { expect(classifyPlayError(new DOMException('unsupported', 'NotSupportedError'))).toBe('unsupported'); });
  it('普通异常不误判', () => { expect(classifyPlayError(new Error('boom'))).toBe('unknown'); expect(classifyPlayError(undefined)).toBe('unknown'); });
  it('错误名称可读且不抛异常', () => { expect(errorName(new DOMException('x', 'NotAllowedError'))).toBe('NotAllowedError'); expect(errorName('text')).toBe('未知错误'); });
  it('自动播放终止错误有独立类型', () => { expect(new AutoplayBlockedError().name).toBe('AutoplayBlockedError'); });
});
