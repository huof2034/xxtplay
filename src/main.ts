import { GmStorage, Repository } from './storage';
import { discoverCourse, readAccountId } from './platform/chaoxing';
import { FrameBus } from './platform/bus';
import { Runtime } from './runtime';
import { isChaoxingHost } from './utils';

if (isChaoxingHost(location.hostname) && typeof GM_getValue === 'function') {
  const topLevel = window.top === window;
  const tabId = crypto.randomUUID(); let runtime: Runtime | undefined;
  const storage = new GmStorage();
  const launch = (accountId: string, token: string, fallback = discoverCourse()) => {
    if (runtime) return;
    const actualId = readAccountId(); if (actualId && actualId !== accountId) return;
    runtime = new Runtime(new Repository(storage, accountId), bus, token, topLevel, fallback);
  };
  const bus = new FrameBus(topLevel, () => { const accountId = readAccountId(); return accountId ? { accountId, tabId, course: discoverCourse() } : undefined; });
  bus.onContext = context => launch(context.accountId, context.tabId, context.course);
  const accountId = readAccountId();
  if (accountId && topLevel) launch(accountId, tabId);
  else if (topLevel) {
    GM_registerMenuCommand('xxtplay：识别登录状态', () => { const id = readAccountId(); if (id) launch(id, tabId); else alert('请先登录学习通并进入课程页面，xxtplay 不保存学习通密码。'); });
    const timer = setInterval(() => { const id = readAccountId(); if (id) { clearInterval(timer); launch(id, tabId); } }, 3000);
  } else {
    bus.requestContext(); const timer = setInterval(() => { if (runtime) clearInterval(timer); else bus.requestContext(); }, 3000);
  }
}
