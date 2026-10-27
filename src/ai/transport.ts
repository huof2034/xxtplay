import { throwIfAborted } from '../utils';
export interface Request { method: 'GET' | 'POST'; url: string; headers?: Record<string, string>; body?: string; binary?: boolean; anonymous?: boolean }
export interface Response { status: number; text: string; data?: ArrayBuffer; headers: string }
export interface Transport { request(input: Request, signal?: AbortSignal): Promise<Response> }
export class GmTransport implements Transport {
  request(input: Request, signal?: AbortSignal): Promise<Response> {
    throwIfAborted(signal);
    return new Promise((resolve, reject) => {
      let settled = false;
      const done = (action: () => void) => { if (!settled) { settled = true; signal?.removeEventListener('abort', cancel); action(); } };
      const cancel = () => { handle.abort(); done(() => reject(new DOMException('操作已暂停', 'AbortError'))); };
      const handle = GM_xmlhttpRequest({
        method: input.method, url: input.url, headers: input.headers, data: input.body,
        responseType: input.binary ? 'arraybuffer' : 'text', timeout: 120_000,
        anonymous: input.anonymous ?? true,
        onload: r => done(() => resolve({ status: r.status, text: input.binary ? '' : r.responseText, data: input.binary ? r.response as ArrayBuffer : undefined, headers: r.responseHeaders })),
        onerror: () => done(() => reject(new Error('网络请求失败，请检查网络或油猴域名授权'))),
        ontimeout: () => done(() => reject(new Error('请求超时'))),
        onabort: () => done(() => reject(new DOMException('操作已暂停', 'AbortError'))),
      });
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
    });
  }
}
