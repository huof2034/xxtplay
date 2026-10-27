import type { StorageEngine } from '../storage';
import { sleep } from '../utils';
interface Lease { owner: string; expiresAt: number }
/** Cross-tab lease is paired with the browser Web Lock in the coordinator. */
export class AccountLease {
  readonly owner = crypto.randomUUID();
  readonly key: string;
  private timer?: ReturnType<typeof setInterval>;
  constructor(private storage: StorageEngine, accountId: string, private ttl = 180_000) { this.key = `xxtplay:v1:lease:${accountId}`; }
  async acquire(): Promise<boolean> {
    if (this.timer) return false;
    const current = this.storage.get<Lease | null>(this.key, null);
    if (current && current.owner !== this.owner && current.expiresAt > Date.now()) return false;
    this.storage.set(this.key, { owner: this.owner, expiresAt: Date.now() + this.ttl });
    await sleep(100);
    if (!this.owned()) return false;
    this.timer = setInterval(() => { if (this.owned()) this.storage.set(this.key, { owner: this.owner, expiresAt: Date.now() + this.ttl }); }, 10_000);
    return true;
  }
  owned(): boolean { const lease = this.storage.get<Lease | null>(this.key, null); return !!lease && lease.owner === this.owner && lease.expiresAt > Date.now(); }
  release(): void { clearInterval(this.timer); this.timer = undefined; if (this.storage.get<Lease | null>(this.key, null)?.owner === this.owner) this.storage.delete(this.key); }
}
