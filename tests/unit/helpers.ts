import type { StorageEngine } from '../../src/storage';
import type { Request, Response, Transport } from '../../src/ai/transport';
export class MemoryStorage implements StorageEngine {
  values = new Map<string, unknown>();
  get<T>(key: string, fallback: T): T { return structuredClone(this.values.has(key) ? this.values.get(key) as T : fallback); }
  set(key: string, value: unknown): void { this.values.set(key, structuredClone(value)); }
  delete(key: string): void { this.values.delete(key); }
}
export class FakeTransport implements Transport {
  requests: Request[] = [];
  responses: Response[] = [];
  async request(input: Request): Promise<Response> { this.requests.push(input); return this.responses.shift() || { status: 200, headers: '', text: JSON.stringify({ choices: [{ message: { content: '{"optionIds":["o0"],"values":[],"explanation":"示例解释","uncertain":false}' }, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5 } }) }; }
}
