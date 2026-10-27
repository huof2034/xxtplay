import { DEFAULT_CONFIG, emptyAccount, type AccountState, type AiConfig, type GlobalConfig, type LogEntry } from './types';
import { inferProvider, isProviderId } from './ai/providers';
import { redact } from './utils';

export interface StorageEngine {
  get<T>(key: string, fallback: T): T;
  set(key: string, value: unknown): void;
  delete(key: string): void;
  listen?(key: string, listener: () => void): () => void;
}
export class GmStorage implements StorageEngine {
  get<T>(key: string, fallback: T): T { return GM_getValue(key, fallback); }
  set(key: string, value: unknown): void { GM_setValue(key, value); }
  delete(key: string): void { GM_deleteValue(key); }
  listen(key: string, listener: () => void): () => void {
    const id = GM_addValueChangeListener(key, (_k, _o, _n, remote) => { if (remote) listener(); });
    return () => GM_removeValueChangeListener(id);
  }
}
export class Repository {
  readonly key: string;
  onChange?: () => void;
  constructor(readonly storage: StorageEngine, readonly accountId: string) { this.key = `xxtplay:v1:account:${accountId}`; }
  config(): GlobalConfig {
    const saved = this.storage.get<Partial<GlobalConfig>>('xxtplay:v1:config', {}) || {};
    const savedAi = (saved.ai || {}) as Partial<AiConfig>;
    const ai: AiConfig = { ...DEFAULT_CONFIG.ai, ...savedAi };
    ai.provider = isProviderId(savedAi.provider) ? savedAi.provider : inferProvider(ai.baseUrl);
    const playback = { ...DEFAULT_CONFIG.playback, ...(saved.playback || {}) };
    return { ...DEFAULT_CONFIG, ...saved, ai, playback };
  }
  saveConfig(config: GlobalConfig): void { this.storage.set('xxtplay:v1:config', config); this.onChange?.(); }
  state(): AccountState { return this.storage.get(this.key, emptyAccount(this.accountId)); }
  update(change: (state: AccountState) => void): AccountState {
    const state = this.state(); change(state); this.storage.set(this.key, state); this.onChange?.(); return state;
  }
  log(level: LogEntry['level'], message: string): void {
    this.update(s => { s.logs.push({ at: Date.now(), level, message: redact(message, [this.config().ai.apiKey]) }); s.logs = s.logs.slice(-250); });
  }
  exportSettings(): string {
    const { apiKey: _secret, ...ai } = this.config().ai;
    const s = this.state();
    return JSON.stringify({ version: 1, config: { ...this.config(), ai }, courses: s.courses.map(({ id, classId, title, enabled, efficiencyMode, summaryEnabled, order }) => ({ id, classId, title, enabled, efficiencyMode, summaryEnabled, order })) }, null, 2);
  }
}
