import type { AiProviderId } from '../types';

export interface ModelOption { id: string; label: string }
export interface ProviderPreset {
  id: AiProviderId;
  name: string;
  baseUrl: string;
  keyUrl: string;
  docsUrl: string;
  note: string;
  textModels: ModelOption[];
  visionModels: ModelOption[];
}

/**
 * Model IDs verified against vendor documentation on 2026-10-27:
 * - https://api-docs.deepseek.com/quick_start/pricing
 * - https://www.alibabacloud.com/help/en/model-studio/models
 * - https://platform.kimi.com/docs/models
 * Vendors retire models frequently, so every selector also accepts a custom ID.
 */
export const AI_PROVIDERS: ProviderPreset[] = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    keyUrl: 'https://platform.deepseek.com/api_keys',
    docsUrl: 'https://api-docs.deepseek.com/quick_start/pricing',
    note: 'deepseek-flash 支持图片；deepseek-v4-pro 仅支持文本。',
    textModels: [
      { id: 'deepseek-flash', label: 'deepseek-flash（默认 · 支持图片）' },
      { id: 'deepseek-v4-pro', label: 'deepseek-v4-pro（仅文本）' },
    ],
    visionModels: [{ id: 'deepseek-flash', label: 'deepseek-flash（支持图片）' }],
  },
  {
    id: 'qwen',
    name: '通义千问（阿里云百炼）',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    keyUrl: 'https://bailian.console.aliyun.com/',
    docsUrl: 'https://www.alibabacloud.com/help/en/model-studio/models',
    note: 'API Key 与地域绑定；控制台给出专属 Workspace 域名时，请把 API 地址改为 https://{WorkspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1。',
    textModels: [
      { id: 'qwen3.8-max', label: 'qwen3.8-max（旗舰 · 支持图片）' },
      { id: 'qwen3.7-plus', label: 'qwen3.7-plus（均衡 · 支持图片）' },
      { id: 'qwen3.8-flash', label: 'qwen3.8-flash（快速）' },
    ],
    visionModels: [
      { id: 'qwen3.8-max', label: 'qwen3.8-max（支持图片）' },
      { id: 'qwen3.7-plus', label: 'qwen3.7-plus（支持图片）' },
    ],
  },
  {
    id: 'kimi',
    name: 'Kimi（月之暗面）',
    baseUrl: 'https://api.moonshot.cn/v1',
    keyUrl: 'https://platform.kimi.com/console/api-keys',
    docsUrl: 'https://platform.kimi.com/docs/models',
    note: 'K2 系列计划 2026 年 12 月底下线，优先选择 kimi-k3.1-pro 或 kimi-k3。',
    textModels: [
      { id: 'kimi-k3.1-pro', label: 'kimi-k3.1-pro（旗舰 · 支持图片）' },
      { id: 'kimi-k3', label: 'kimi-k3（上代旗舰 · 支持图片）' },
      { id: 'kimi-k2.6', label: 'kimi-k2.6（均衡 · 支持图片）' },
      { id: 'kimi-k2.7-code', label: 'kimi-k2.7-code（编程向）' },
    ],
    visionModels: [
      { id: 'kimi-k3.1-pro', label: 'kimi-k3.1-pro（支持图片）' },
      { id: 'kimi-k3', label: 'kimi-k3（支持图片）' },
      { id: 'kimi-k2.6', label: 'kimi-k2.6（支持图片）' },
    ],
  },
  {
    id: 'custom',
    name: '自定义（OpenAI 兼容）',
    baseUrl: '',
    keyUrl: '',
    docsUrl: '',
    note: '填写兼容 /chat/completions 的服务地址和模型 ID；也可接入其他聚合服务。',
    textModels: [],
    visionModels: [],
  },
];

export function isProviderId(value: unknown): value is AiProviderId {
  return AI_PROVIDERS.some(provider => provider.id === value);
}

export function getProvider(id: AiProviderId | undefined): ProviderPreset {
  return AI_PROVIDERS.find(provider => provider.id === id) || AI_PROVIDERS[AI_PROVIDERS.length - 1];
}

/** Legacy configurations predate the provider field; infer it from the saved endpoint. */
export function inferProvider(baseUrl: string): AiProviderId {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === 'api.deepseek.com' || host.endsWith('.deepseek.com')) return 'deepseek';
    if (host === 'api.moonshot.cn' || host.endsWith('.moonshot.cn')) return 'kimi';
    if (host === 'dashscope.aliyuncs.com' || host === 'dashscope-intl.aliyuncs.com' || host.endsWith('.dashscope.aliyuncs.com') || host.endsWith('.maas.aliyuncs.com')) return 'qwen';
  } catch { /* An unparsable endpoint is a custom provider. */ }
  return 'custom';
}

export function defaultModels(id: AiProviderId): { textModel: string; visionModel: string } {
  const provider = getProvider(id);
  return { textModel: provider.textModels[0]?.id || '', visionModel: provider.visionModels[0]?.id || '' };
}
