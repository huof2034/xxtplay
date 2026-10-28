import { test, expect } from '@playwright/test';
import { createHarness } from './harness';

test('课程题目：全部常见题型回填并自动提交一次', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz' });
  await expect.poll(() => h.submissions.length, { timeout: 25_000 }).toBe(1);
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed')).toBe(true);
  await expect(h.page.getByLabel('blank one')).toHaveValue('red'); await expect(h.page.getByLabel('blank two')).toHaveValue('blue'); await expect(h.page.getByLabel('short answer')).toHaveValue('Hello');
  expect(h.apiCalls).toHaveLength(6); expect(h.apiCalls.every(c => c.purpose === 'answer')).toBe(true);
});
test('无法识别的题型保留待办，不提交整份作业', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', unknownQuestion: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'pending'), { timeout: 25_000 }).toBe(true);
  expect(h.submissions).toHaveLength(0); expect(h.apiCalls).toHaveLength(5);
});
test('模型返回无效选项时，不乱填、不提交', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', invalidAnswer: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'pending'), { timeout: 25_000 }).toBe(true);
  expect(h.submissions).toHaveLength(0); await expect(h.page.locator('#one input[type=radio]:checked')).toHaveCount(0);
});
test('AI鉴权失败保留待办，日志不包含密钥', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', apiStatus: 401 });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'pending'), { timeout: 25_000 }).toBe(true);
  expect(h.submissions).toHaveLength(0); expect(JSON.stringify(h.state().logs)).not.toContain('fixture-key');
});
test('考试：自动答题后等待人工确认，确认前零交卷请求', async ({ context }) => {
  const h = await createHarness(context, { mode: 'exam' });
  await expect(h.page.getByRole('button', { name: '确认提交本次考试' })).toBeVisible({ timeout: 25_000 });
  expect(h.submissions).toHaveLength(0);
  await h.page.getByLabel('我已检查当前试卷，确认交卷').check();
  await h.page.getByRole('button', { name: '确认提交本次考试' }).click();
  await expect.poll(() => h.submissions.length).toBe(1);
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed')).toBe(true);
});
test('考试刷新不会继承交卷确认，也不会再次请求已缓存题目', async ({ context }) => {
  const h = await createHarness(context, { mode: 'exam' });
  await expect(h.page.getByRole('button', { name: '确认提交本次考试' })).toBeVisible({ timeout: 25_000 });
  await h.page.getByLabel('我已检查当前试卷，确认交卷').check(); const calls = h.apiCalls.length;
  await h.page.reload();
  await expect(h.page.getByRole('button', { name: '确认提交本次考试' })).toBeVisible({ timeout: 25_000 });
  await expect(h.page.getByLabel('我已检查当前试卷，确认交卷')).not.toBeChecked();
  await expect(h.page.getByRole('button', { name: '确认提交本次考试' })).toBeDisabled();
  expect(h.submissions).toHaveLength(0); expect(h.apiCalls.length).toBe(calls);
});
test('跨域考试中的普通作业路径仍按考试处理，必须人工确认交卷', async ({ context }) => {
  const h = await createHarness(context, { mode: 'exam', embeddedExam: true, crossOrigin: true });
  const frame = h.page.frameLocator('iframe');
  await expect(frame.getByRole('button', { name: '确认提交本次考试' })).toBeVisible({ timeout: 25_000 });
  expect(h.submissions).toHaveLength(0);
  await frame.getByLabel('我已检查当前试卷，确认交卷').check();
  await frame.getByRole('button', { name: '确认提交本次考试' }).click();
  await expect.poll(() => h.submissions.length).toBe(1);
});
test('讨论题发布并核验；刷新后不重复发布', async ({ context }) => {
  const h = await createHarness(context, { mode: 'discussion' });
  await expect.poll(() => h.submissions.length, { timeout: 20_000 }).toBe(1);
  await h.page.reload(); await h.page.waitForTimeout(1500); expect(h.submissions).toHaveLength(1);
});
test('文档阅读不用AI，关闭复习功能不采集材料', async ({ context }) => {
  const h = await createHarness(context, { mode: 'document' });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 25_000 }).toBe(true);
  expect(h.apiCalls).toHaveLength(0); expect(h.state().materials).toHaveLength(0);
});
test('复习按课程开启：阅读不调用AI，点击生成后只调用summary', async ({ context }) => {
  const h = await createHarness(context, { mode: 'document', summary: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 25_000 }).toBe(true); expect(h.apiCalls).toHaveLength(0);
  await h.page.getByRole('button', { name: '复习', exact: true }).click();
  await h.page.getByRole('button', { name: '生成／更新复习资料' }).click();
  await expect.poll(() => h.state().notes.length, { timeout: 15_000 }).toBe(1); expect(h.apiCalls.every(c => c.purpose === 'summary')).toBe(true);
});
test('真实媒体完整播放：嵌套iframe、无Key、零AI调用', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video' });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  expect(h.apiCalls).toHaveLength(0); expect(Object.values(h.state().tasks).find(t => t.kind === 'video')?.progress?.current).toBeGreaterThan(7);
});
test('播放器无音源的辅助音频不会占用课程队列', async ({ context }) => {
  const h = await createHarness(context, { mode:'video', extraEmptyAudio:true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.kind === 'video' && t.status === 'completed'), { timeout:30_000 }).toBe(true);
  expect(Object.values(h.state().tasks).some(t => t.kind === 'audio')).toBe(false);
});
test('效率模式：读取90%，等待延迟的平台确认', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', efficient: true, receiptDelay: 2000 });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.progress?.requirement.known), { timeout: 10_000 }).toBe(true);
  expect(Object.values(h.state().tasks).find(t => t.progress)?.progress?.requirement.conditions[0].value).toBe(.9);
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true); expect(h.apiCalls).toHaveLength(0);
});
test('完整播放后没有平台回执时保留待办', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', noReceipt: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'pending'), { timeout: 35_000 }).toBe(true);
  expect(Object.values(h.state().tasks).some(t => t.status === 'completed')).toBe(false);
  expect(h.apiCalls).toHaveLength(0);
});
test('效率要求未知时回退完整播放，不猜比例', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', efficient: true, requirement: '请完成本视频' });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  const task = Object.values(h.state().tasks).find(t => t.kind === 'video')!; expect(task.progress?.requirement.known).toBe(false); expect(task.progress?.current).toBeGreaterThan(7);
});
test('跨域父页面与视频iframe协同，单账号租约保护', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', crossOrigin: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true); expect(h.apiCalls).toHaveLength(0);
});
test('勾选的课程按队列切换并保留完成记录', async ({ context }) => {
  const h = await createHarness(context, { mode: 'catalogue', secondCourse: true });
  await expect(h.page).toHaveURL(/courseId=101/, { timeout: 35_000 });
  await expect.poll(() => Object.values(h.state().tasks).filter(t => t.status === 'completed').length, { timeout: 30_000 }).toBe(2);
});
test('有声自动播放被策略拒绝时自动静音并完成', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', blockAutoplay: true, muted: false });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  expect(Object.values(h.state().tasks).find(t => t.kind === 'video')?.progress?.current).toBeGreaterThan(7);
  expect(h.apiCalls).toHaveLength(0);
});
test('play() 首次被中断后重试完成', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', abortPlayOnce: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  expect(h.apiCalls).toHaveLength(0);
});
test('播放器返回成功但仍暂停时自动重试，不误报浏览器拦截', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', resolvePausedOnce: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  expect(h.state().logs.some(log => /播放被中断/.test(log.message))).toBe(true);
  expect(h.state().logs.some(log => /被浏览器拦截/.test(log.message))).toBe(false);
  expect(h.apiCalls).toHaveLength(0);
});
test('视频间歇暂停并恢复后不会累计成持续故障', async ({ context }) => {
  test.setTimeout(55_000);
  const h = await createHarness(context, { mode: 'video', intermittentPauses: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 50_000 }).toBe(true);
  expect(h.state().logs.some(log => /媒体多次暂停或卡顿/.test(log.message))).toBe(false);
  expect(h.apiCalls).toHaveLength(0);
});
test('未打开的任务点会自动打开并继续播放', async ({ context }) => {
  const h = await createHarness(context, { mode: 'catalogue', lazyTask: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 35_000 }).toBe(true);
  expect(h.state().logs.some(log => /自动打开任务点/.test(log.message))).toBe(true);
  expect(h.apiCalls).toHaveLength(0);
});
test('一个视频播放完成后自动打开并播放下一个视频', async ({ context }) => {
  const h = await createHarness(context, { mode: 'catalogue', sequence: true });
  await expect.poll(() => Object.values(h.state().tasks).filter(t => t.kind === 'video' && t.status === 'completed').length, { timeout: 75_000 }).toBe(2);
  expect(h.state().logs.some(log => /自动打开任务点/.test(log.message))).toBe(true);
  expect(h.apiCalls).toHaveLength(0);
});
test('跨域卡片页完成一个视频后也会自动打开下一个', async ({ context }) => {
  const h = await createHarness(context, { mode: 'catalogue', sequence: true, crossOrigin: true });
  await expect.poll(() => Object.values(h.state().tasks).filter(t => t.kind === 'video' && t.status === 'completed').length, { timeout: 80_000 }).toBe(2);
  expect(h.apiCalls).toHaveLength(0);
});
test('跨域章节连续播放两个视频并进入下一章节，始终不调用AI', async ({ context }) => {
  test.setTimeout(150_000);
  const h = await createHarness(context, { mode: 'catalogue', twoChapters: true, crossOrigin: true });
  await expect.poll(() => Object.values(h.state().tasks).filter(t => t.kind === 'video' && t.status === 'completed').length, { timeout: 135_000 }).toBe(4);
  await expect(h.page.locator('#cur11')).toHaveClass(/posCatalog_active/);
  expect(h.state().logs.some(log => /已切换章节：第二章/.test(log.message))).toBe(true);
  expect(h.apiCalls).toHaveLength(0);
});
test('跨域非任务视频不会被当作必做任务播放', async ({ context }) => {
  const h = await createHarness(context, { mode: 'catalogue', crossOrigin: true, nonTaskVideo: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.kind === 'video' && t.status === 'completed'), { timeout: 35_000 }).toBe(true);
  expect(Object.values(h.state().tasks).some(t => t.id.includes('not-required'))).toBe(false);
  const frame = h.page.frames().find(f => f.url().includes('jobid=not-required'));
  expect(frame).toBeTruthy();
  expect(await frame!.locator('video').evaluate((video: HTMLVideoElement) => video.paused)).toBe(true);
  expect(h.apiCalls).toHaveLength(0);
});
test('任务点点击没有加载播放器时不会错误进入下一章节', async ({ context }) => {
  test.setTimeout(65_000);
  const h = await createHarness(context, { mode: 'catalogue', twoChapters: true, crossOrigin: true, failTaskOpen: true });
  await expect.poll(() => h.state().logs.some(log => /自动打开任务点/.test(log.message)), { timeout: 40_000 }).toBe(true);
  await expect.poll(() => h.state().pausedReason, { timeout: 45_000 }).toMatch(/多次打开后仍未加载/);
  await expect(h.page.locator('#cur10')).toHaveClass(/posCatalog_active/);
  expect(Object.values(h.state().tasks).filter(t => t.kind === 'video' && t.status === 'completed')).toHaveLength(1);
  expect(h.apiCalls).toHaveLength(0);
});
test('播放器延迟设置媒体源后自动静音播放', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', crossOrigin: true, delayedSource: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.kind === 'video' && t.status === 'completed'), { timeout: 35_000 }).toBe(true);
  const frame = h.page.frames().find(f => f.url().includes('/ananas/modules/video'));
  expect(await frame!.locator('video').evaluate((video: HTMLVideoElement) => video.muted)).toBe(true);
  expect(h.apiCalls).toHaveLength(0);
});
test('跨域播放器从父任务页接收身份与平台完成状态', async ({ context }) => {
  const h = await createHarness(context, { mode: 'catalogue', crossOrigin: true, crossOriginPlayer: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.kind === 'video' && t.status === 'completed'), { timeout: 35_000 }).toBe(true);
  expect(h.apiCalls).toHaveLength(0);
});
test('平台允许时自动倍速并记录日志', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', speedAllowed: true, playback: { autoSpeed: true, speed: 2, autoSeek: false } });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  expect(h.state().logs.some(log => /已设置为 2×/.test(log.message))).toBe(true);
});
test('旧版自动拖动设置不会跳过观看时长', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', seekAllowed: true, requirement: '完成条件 观看时长需 ≥ 总时长的 90%', playback: { autoSpeed: false, autoSeek: true } });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  const video = Object.values(h.state().tasks).find(t => t.kind === 'video');
  expect(video?.progress?.watched).toBeGreaterThanOrEqual((video?.progress?.duration || 0) * .9);
  expect(h.state().logs.some(log => /不会自动拖动视频/.test(log.message))).toBe(true);
});
test('平台提前确认时仍需达到最低观看时长', async ({ context }) => {
  const h = await createHarness(context, { mode: 'video', efficient: true, earlyReceipt: true });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  const video = Object.values(h.state().tasks).find(t => t.kind === 'video');
  expect(video?.progress?.watched).toBeGreaterThanOrEqual((video?.progress?.duration || 0) * .9);
});
test('设置面板可拖动并记住位置', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', autoRun: false });
  const head = h.page.locator('#xxtplay-root .head'); const box = await head.boundingBox();
  expect(box).not.toBeNull();
  await h.page.mouse.move(box!.x + 40, box!.y + 15); await h.page.mouse.down();
  await h.page.mouse.move(box!.x + 170, box!.y + 110, { steps: 8 }); await h.page.mouse.up();
  await expect.poll(() => h.values.get('xxtplay:v1:ui:position')).toBeTruthy();
  const position = h.values.get('xxtplay:v1:ui:position');
  expect(position.left).toBeGreaterThan(0); expect(position.top).toBeGreaterThan(0);
});
test('首页读取全部课程、进度并允许勾选', async ({ context }) => {
  const h = await createHarness(context, { mode: 'home', autoRun: false });
  const panel = h.page.locator('#xxtplay-root');
  await expect(panel.getByLabel('选择课程 测试课程甲')).toBeVisible();
  await expect(panel.getByText('已完成任务点 1/2 · 50%')).toBeVisible();
  await expect(panel.getByText('已完成任务点 0/3 · 0%')).toBeVisible();
  await panel.getByLabel('选择课程 测试课程甲').check();
  await expect.poll(() => h.state().courses.find(c => c.title === '测试课程甲')?.enabled).toBe(true);
  await panel.getByRole('button', { name: '开始队列' }).click();
  await expect(h.page).toHaveURL(/mycourse\/(?:studentstudy|stu)\?course(?:i|I)d=100/, { timeout: 15_000 });
});
test('主页旧课程入口通过平台中转并自动打开章节', async ({ context }) => {
  const h = await createHarness(context, { mode:'home', autoRun:false, legacyHomeEntry:true, homeWithChapter:true });
  await h.page.getByRole('button', { name:'开始队列' }).click();
  await expect(h.page).toHaveURL(/enc=fixture/, { timeout:20_000 });
  await expect(h.page.getByText('无效的参数')).toHaveCount(0);
  await expect.poll(() => h.state().logs.some(log => /已打开课程章节/.test(log.message)), { timeout:25_000 }).toBe(true);
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.kind === 'video' && t.status === 'completed'), { timeout:35_000 }).toBe(true);
  expect(h.apiCalls).toHaveLength(0);
});
test('运行队列显示课程名称、章节和打开链接', async ({ context }) => {
  const h = await createHarness(context, { mode: 'catalogue' });
  await expect.poll(() => Object.values(h.state().tasks).some(t => t.status === 'completed'), { timeout: 30_000 }).toBe(true);
  await h.page.getByRole('button', { name: '运行', exact: true }).click();
  const card = h.page.locator('#xxtplay-root .card').filter({ hasText: '测试视频' }).first();
  await expect(card).toContainText('测试课程甲');
  await expect(card).toContainText('第一章');
  await expect(card.getByRole('link', { name: '打开页面' })).toHaveAttribute('href', /studentstudy.*enc=fixture/);
});
test('播放设置可修改并立即保存', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', autoRun: false });
  await h.page.getByRole('button', { name: '播放', exact: true }).click();
  await h.page.getByLabel('倍速', { exact: true }).selectOption('2.5');
  await expect(h.page.getByText('原有自动拖动设置已停用。')).toBeVisible();
  await expect.poll(() => h.values.get('xxtplay:v1:config').playback).toMatchObject({ speed: 2.5, autoSeek: false });
});
test('AI设置可选择服务商与模型，保存不调用模型', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', autoRun: false });
  await h.page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  await h.page.getByLabel('服务商', { exact: true }).selectOption('kimi');
  await expect(h.page.getByLabel('API 地址', { exact: true })).toHaveValue('https://api.moonshot.cn/v1');
  await expect(h.page.getByLabel('文本模型', { exact: true })).toHaveValue('kimi-k3.1-pro');
  await h.page.getByLabel('API Key', { exact: true }).fill('kimi-test-key');
  await h.page.getByRole('button', { name: '保存设置' }).click();
  expect(h.values.get('xxtplay:v1:config').ai).toMatchObject({ provider: 'kimi', baseUrl: 'https://api.moonshot.cn/v1', textModel: 'kimi-k3.1-pro', apiKey: 'kimi-test-key' });
  expect(h.apiCalls).toHaveLength(0);
  await h.page.getByLabel('视觉模型（图片题）', { exact: true }).selectOption('');
  await h.page.getByRole('button', { name: '保存设置' }).click();
  expect(h.values.get('xxtplay:v1:config').ai.visionModel).toBe('');
});
test('保存AI设置不调用模型，密钥不进入导出文件', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', autoRun: false });
  await h.page.getByRole('button', { name: 'AI 设置', exact: true }).click(); await h.page.getByLabel('API Key', { exact: true }).fill('new-test-key'); await h.page.getByRole('button', { name: '保存设置' }).click();
  expect(h.apiCalls).toHaveLength(0); expect(h.values.get('xxtplay:v1:config').ai.apiKey).toBe('new-test-key');
  await h.page.getByRole('button', { name: '课程', exact: true }).click(); const download = h.page.waitForEvent('download'); await h.page.getByRole('button', { name: '导出配置（不含密钥）' }).click(); const file = await download; const filePath = await file.path(); const fs = await import('node:fs/promises'); const content = await fs.readFile(filePath!, 'utf8'); expect(content).not.toContain('new-test-key'); expect(content).not.toContain('apiKey');
});
test('AI 主题随保存的服务商切换并在刷新后恢复', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', autoRun: false });
  const panel = h.page.locator('#xxtplay-root');
  await h.page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  const colors = new Set<string>();
  for (const [id, name] of [['deepseek', 'DeepSeek'], ['qwen', '通义千问'], ['kimi', 'Kimi']] as const) {
    await h.page.getByLabel('服务商', { exact: true }).selectOption(id);
    await h.page.getByLabel('API Key', { exact: true }).fill(`${id}-fixture-key`);
    await h.page.getByRole('button', { name: '保存设置' }).click();
    await expect(panel).toHaveAttribute('data-theme', id);
    await expect(panel.locator('.theme-badge')).toHaveText(name);
    await expect(panel.locator('.scene')).toHaveClass(/scene-in/);
    expect(await panel.locator('.scene').evaluate(el => getComputedStyle(el).backgroundImage)).toContain('data:image/webp;base64,');
    colors.add(await panel.locator('.theme-mark').evaluate(el => getComputedStyle(el, '::before').backgroundColor));
  }
  expect(colors.size).toBe(3); expect(h.apiCalls).toHaveLength(0);
  await h.page.reload(); await expect(panel).toHaveAttribute('data-theme', 'kimi');
  await h.page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  await h.page.getByLabel('服务商', { exact: true }).selectOption('custom');
  await h.page.getByLabel('API 地址', { exact: true }).fill('https://custom.example.invalid/v1');
  await h.page.getByLabel('API Key', { exact: true }).fill('custom-fixture-key');
  await h.page.getByLabel('自定义文本模型', { exact: true }).fill('custom-model');
  await h.page.getByRole('button', { name: '保存设置' }).click();
  await expect(panel).toHaveAttribute('data-theme', 'custom');
  await expect(panel.locator('.theme-badge')).toHaveText('自定义 AI');
  expect(await panel.locator('.scene').evaluate(el => getComputedStyle(el).backgroundImage)).toBe('none');
});
test('切换模型播放入场动画，减少动态效果设置关闭动画', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', autoRun: false });
  await h.page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  await h.page.getByLabel('服务商', { exact: true }).selectOption('deepseek');
  await h.page.getByLabel('API Key', { exact: true }).fill('deepseek-fixture-key');
  await h.page.getByRole('button', { name: '保存设置' }).click();
  const scene = h.page.locator('#xxtplay-root .scene');
  await expect(scene).toHaveClass(/scene-in/);
  await h.page.emulateMedia({ reducedMotion: 'reduce' });
  await h.page.getByLabel('文本模型', { exact: true }).selectOption('deepseek-v4-pro');
  await h.page.getByRole('button', { name: '保存设置' }).click();
  await expect(scene).toHaveCSS('animation-name', 'none');
  expect(h.apiCalls).toHaveLength(0);
});
test('修改服务地址不能复用旧密钥', async ({ context }) => {
  const h = await createHarness(context, { mode: 'quiz', autoRun: false });
  await h.page.getByRole('button', { name: 'AI 设置', exact: true }).click();
  await h.page.getByLabel('API 地址', { exact: true }).fill('https://another.example.invalid/v1');
  await h.page.getByRole('button', { name: '保存设置' }).click();
  await expect(h.page.getByText('切换服务商或 API 地址后请填写对应的 API Key')).toBeVisible();
  expect(h.values.get('xxtplay:v1:config').ai.baseUrl).toBe('https://ai.example.invalid');
  expect(h.apiCalls).toHaveLength(0);
});
test('窄窗口中面板与主要操作保持可见，收起后可恢复', async ({ context }) => {
  const h = await createHarness(context, { mode: 'home', autoRun: false });
  await h.page.setViewportSize({ width: 320, height: 570 });
  const panel = h.page.locator('#xxtplay-root .panel');
  const box = await panel.boundingBox(); expect(box).not.toBeNull();
  expect(box!.x).toBeGreaterThanOrEqual(0); expect(box!.x + box!.width).toBeLessThanOrEqual(320);
  await expect(h.page.getByRole('button', { name: '开始队列' })).toBeVisible();
  await h.page.getByRole('button', { name: '收起' }).click();
  await h.page.getByRole('button', { name: '📚 xxtplay' }).click();
  await expect(panel).toBeVisible();
});
