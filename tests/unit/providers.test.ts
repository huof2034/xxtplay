import { describe, expect, it } from 'vitest';
import { AI_PROVIDERS, defaultModels, getProvider, inferProvider, isProviderId } from '../../src/ai/providers';
import { DEFAULT_CONFIG } from '../../src/types';
import { Repository } from '../../src/storage';
import { MemoryStorage } from './helpers';

describe('AI 服务商与模型目录', () => {
  it('默认配置指向有效的 DeepSeek 模型', () => { expect(DEFAULT_CONFIG.ai.provider).toBe('deepseek'); expect(defaultModels('deepseek')).toEqual({ textModel: 'deepseek-flash', visionModel: 'deepseek-flash' }); });
  it('三家预设都有文本与视觉模型，自定义没有', () => {
    for (const id of ['deepseek', 'qwen', 'kimi'] as const) { const provider = getProvider(id); expect(provider.textModels.length).toBeGreaterThan(0); expect(provider.visionModels.length).toBeGreaterThan(0); }
    expect(getProvider('custom').textModels).toHaveLength(0);
    expect(AI_PROVIDERS.map(provider => provider.id)).toEqual(['deepseek', 'qwen', 'kimi', 'custom']);
  });
  it('按 API 主机名推断服务商', () => {
    expect(inferProvider('https://api.deepseek.com')).toBe('deepseek');
    expect(inferProvider('https://api.moonshot.cn/v1')).toBe('kimi');
    expect(inferProvider('https://dashscope.aliyuncs.com/compatible-mode/v1')).toBe('qwen');
    expect(inferProvider('https://abc123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1')).toBe('qwen');
    expect(inferProvider('https://example.com/v1')).toBe('custom');
    expect(inferProvider('not a url')).toBe('custom');
  });
  it('未知服务商回退自定义', () => { expect(isProviderId('openai')).toBe(false); expect(getProvider('openai' as never).id).toBe('custom'); });
  it('旧配置没有 provider 时从地址迁移', () => {
    const storage = new MemoryStorage();
    storage.set('xxtplay:v1:config', { ai: { baseUrl: 'https://api.moonshot.cn/v1', apiKey: 'k', textModel: 'kimi-k3', visionModel: '' } });
    const repo = new Repository(storage, '1');
    expect(repo.config().ai.provider).toBe('kimi');
    expect(repo.config().ai.textModel).toBe('kimi-k3');
  });
  it('导出配置保留 provider 但不含密钥', () => {
    const repo = new Repository(new MemoryStorage(), '1');
    repo.saveConfig({ ...DEFAULT_CONFIG, ai: { ...DEFAULT_CONFIG.ai, provider: 'qwen', apiKey: 'private-key' } });
    const exported = repo.exportSettings();
    expect(exported).toContain('"provider": "qwen"');
    expect(exported).not.toContain('private-key');
    expect(exported).not.toContain('apiKey');
  });
});
