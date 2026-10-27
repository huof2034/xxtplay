import { describe, expect, it } from 'vitest';
import { AiClient, completionUrl, parseJsonObject } from '../../src/ai/client';
import { DEFAULT_CONFIG, type AiAudit } from '../../src/types';
import { Repository } from '../../src/storage';
import { AccountLease } from '../../src/core/lease';
import { SummaryService } from '../../src/core/summary';
import { sourceLink, redact } from '../../src/utils';
import { FakeTransport, MemoryStorage } from './helpers';
describe('AI调用边界', () => {
  it('只允许answer和summary，不允许播放调度', async () => { const t = new FakeTransport(); const ai = new AiClient(t, () => ({ ...DEFAULT_CONFIG.ai, apiKey: 'secret' }), () => {}); await expect(ai.complete('playback' as never, 'c', '', '')).rejects.toThrow('禁止'); expect(t.requests).toHaveLength(0); });
  it('没有Key时不发送网络请求', async () => { const t = new FakeTransport(); const ai = new AiClient(t, () => DEFAULT_CONFIG.ai, () => {}); await expect(ai.complete('answer', 'c', '', '')).rejects.toThrow('未配置'); expect(t.requests).toHaveLength(0); });
  it('未配置视觉模型时图片题不发请求', async () => { const t = new FakeTransport(); const ai = new AiClient(t, () => ({ ...DEFAULT_CONFIG.ai, apiKey: 'secret', visionModel: '' }), () => {}); await expect(ai.complete('answer', 'c', '', 'q', ['data:image/png;base64,AA=='])).rejects.toThrow('视觉模型'); expect(t.requests).toHaveLength(0); });
  it('兼容带v1及完整路径的baseUrl', () => { expect(completionUrl('https://example.com/v1/')).toBe('https://example.com/v1/chat/completions'); expect(completionUrl('https://example.com/chat/completions')).toBe('https://example.com/chat/completions'); });
  it('拒绝URL中的凭据和远程HTTP', () => { expect(() => completionUrl('https://a:b@example.com')).toThrow(); expect(() => completionUrl('http://example.com')).toThrow(); });
  it('记录用途和tokens，不保存密钥到调用记录', async () => { const t = new FakeTransport(); const records: AiAudit[] = []; const ai = new AiClient(t, () => ({ ...DEFAULT_CONFIG.ai, apiKey: 'private-secret-key' }), r => records.push(r)); await ai.complete('answer', 'course', '', 'question'); expect(records[0]).toMatchObject({ purpose: 'answer', inputTokens: 10, outputTokens: 5, ok: true }); expect(JSON.stringify(records)).not.toContain('private-secret-key'); });
  it('401不盲目重试', async () => { const t = new FakeTransport(); t.responses.push({ status: 401, headers: '', text: 'unauthorized' }); const ai = new AiClient(t, () => ({ ...DEFAULT_CONFIG.ai, apiKey: 'secret' }), () => {}); await expect(ai.complete('answer', 'c', '', '')).rejects.toThrow('401'); expect(t.requests).toHaveLength(1); });
  it('只返回推理过程的响应不作为答案', async () => { const t = new FakeTransport(); for (let i = 0; i < 3; i++) t.responses.push({ status: 200, headers: '', text: '{"choices":[{"message":{"reasoning_content":"not a final answer"}}]}' }); const ai = new AiClient(t, () => ({ ...DEFAULT_CONFIG.ai, apiKey: 'secret' }), () => {}); await expect(ai.complete('answer', 'c', '', '')).rejects.toThrow('空答案'); expect(t.requests).toHaveLength(3); });
  it('解析JSON不执行其中的代码', () => { expect(parseJsonObject('```json\n{"answer":"<script>evil</script>"}\n```').answer).toContain('<script>'); expect(() => parseJsonObject('(()=>alert(1))()')).toThrow(); });
  it('未开启复习的课程不调用AI', async () => { const repo = new Repository(new MemoryStorage(), '1'); const t = new FakeTransport(); const service = new SummaryService(repo, new AiClient(t, () => DEFAULT_CONFIG.ai, () => {})); await expect(service.generate('c')).rejects.toThrow('未开启'); expect(t.requests).toHaveLength(0); });
});
describe('账号隔离与发布数据保护', () => {
  it('两个账号的记录隔离', () => { const storage = new MemoryStorage(); const a = new Repository(storage, '1'); const b = new Repository(storage, '2'); a.update(s => { s.autoRun = true; }); expect(b.state().autoRun).toBe(false); });
  it('导出配置不包含密钥或身份路由参数', () => { const repo = new Repository(new MemoryStorage(), '1'); repo.saveConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, apiKey: 'my-secret-key' } }); const exported = repo.exportSettings(); expect(exported).not.toContain('my-secret-key'); expect(exported).not.toContain('apiKey'); });
  it('来源链接只保留课程定位字段', () => { const u = sourceLink('https://mooc1.chaoxing.com/course?courseid=1&clazzid=2&enc=private&stuenc=secret&cpi=123&ak_=hidden'); expect(u).toBe('https://mooc1.chaoxing.com/course?courseid=1&clazzid=2'); });
  it('日志自动遮蔽密钥', () => { expect(redact('API sk-abcdefghijklm Bearer PRIVATE_VALUE', ['PRIVATE_VALUE'])).not.toContain('PRIVATE_VALUE'); });
  it('同账号互斥租约不会被另一个实例抢占', async () => { const storage = new MemoryStorage(); const a = new AccountLease(storage, '1'); const b = new AccountLease(storage, '1'); expect(await a.acquire()).toBe(true); expect(await b.acquire()).toBe(false); a.release(); expect(await b.acquire()).toBe(true); b.release(); });
  it('同实例不可重入获取，释放后可重新获取', async () => { const lease = new AccountLease(new MemoryStorage(), '1'); expect(await lease.acquire()).toBe(true); expect(await lease.acquire()).toBe(false); lease.release(); expect(await lease.acquire()).toBe(true); lease.release(); });
});
