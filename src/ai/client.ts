import type { AiConfig, AiPurpose, AiAudit } from '../types';
import type { Transport } from './transport';
import { isChaoxingHost, retry, safeUrl } from '../utils';

export class AiError extends Error { constructor(message: string, readonly retryable = true) { super(message); } }
export function completionUrl(base: string): string {
  const url = safeUrl(base);
  if (!url || url.username || url.password || url.search || url.hash) throw new AiError('API 地址应为不含查询参数和凭据的完整服务地址', false);
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) throw new AiError('远程 AI 接口必须使用 HTTPS', false);
  url.pathname = url.pathname.replace(/\/+$/, '');
  if (!url.pathname.endsWith('/chat/completions')) url.pathname += '/chat/completions';
  return url.href;
}
export function parseJsonObject(text: string): Record<string, unknown> {
  const value = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const parsed = JSON.parse(value);
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new AiError('AI 返回的不是 JSON 对象');
  return parsed;
}
export class AiClient {
  constructor(private transport: Transport, private config: () => AiConfig, private audit: (record: AiAudit) => void) {}
  async complete(purpose: AiPurpose, courseKey: string, system: string, text: string, images: string[] = [], signal?: AbortSignal): Promise<string> {
    // Central allowlist: playback, navigation, requirement parsing and reading have no AI path.
    if (purpose !== 'answer' && purpose !== 'summary') throw new AiError('该用途禁止调用 AI', false);
    const config = this.config();
    if (!config.apiKey.trim()) throw new AiError('未配置 AI API Key，题目保留待办；音视频和文档仍可继续', false);
    if (images.length && !config.visionModel.trim()) throw new AiError('未配置视觉模型，图片题保留待办', false);
    const model = images.length ? config.visionModel : config.textModel;
    if (!model.trim()) throw new AiError(images.length ? '未配置视觉模型，图片题保留待办' : '请配置文本模型', false);
    const endpoint = completionUrl(config.baseUrl);
    return retry(async () => {
      let ok = false; let inputTokens = 0; let outputTokens = 0;
      try {
        const content = images.length ? [{ type: 'text', text }, ...images.map(url => ({ type: 'image_url', image_url: { url } }))] : text;
        const response = await this.transport.request({ method: 'POST', url: endpoint, anonymous: true,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey.trim()}` },
          body: JSON.stringify({ model, stream: false, max_tokens: purpose === 'answer' ? 4096 : 8192,
            messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
        }, signal);
        if (response.status < 200 || response.status >= 300) {
          const terminal = [400, 401, 402, 403, 404, 422].includes(response.status);
          throw new AiError(`AI 接口 HTTP ${response.status}${response.status === 401 ? '：密钥无效' : response.status === 402 ? '：余额不足' : response.status === 429 ? '：请求限流' : ''}`, !terminal);
        }
        const payload = JSON.parse(response.text);
        inputTokens = Number(payload.usage?.prompt_tokens) || 0; outputTokens = Number(payload.usage?.completion_tokens) || 0;
        const choice = payload.choices?.[0];
        const answer = choice?.message?.content;
        if (typeof answer !== 'string' || !answer.trim()) throw new AiError('AI 返回空答案，未将推理过程当成答案');
        if (choice.finish_reason === 'length') throw new AiError('AI 答案被截断，未回填或提交');
        if (purpose === 'answer') parseJsonObject(answer);
        ok = true; return answer;
      } finally { this.audit({ at: Date.now(), purpose, courseKey, model, inputTokens, outputTokens, ok }); }
    }, { signal, retryable: e => !(e instanceof AiError) || e.retryable });
  }
  async imageData(url: string, signal?: AbortSignal): Promise<string> {
    if (/^data:image\/(png|jpeg|gif|webp);base64,/i.test(url)) {
      if (url.length > 8_000_000) throw new AiError('题目图片过大', false);
      return url;
    }
    const target = safeUrl(url);
    if (!target || !isChaoxingHost(target.hostname)) throw new AiError('题目图片来源无法确认，保留待办', false);
    const response = await this.transport.request({ method: 'GET', url: target.href, binary: true, anonymous: false }, signal);
    if (response.status !== 200 || !response.data || response.data.byteLength > 6_000_000) throw new AiError('题目图片无法读取或超过 6 MB', false);
    const bytes = new Uint8Array(response.data);
    const mime = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : bytes[0] === 0x47 ? 'image/gif' : 'image/webp';
    let binary = ''; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return `data:${mime};base64,${btoa(binary)}`;
  }
}
