import { describe, expect, it } from 'vitest';
import { validateAnswer, answerFingerprint } from '../../src/core/answer';
import { ExamSubmissionGate } from '../../src/core/exam-gate';
import type { Question } from '../../src/types';
const q: Question = { id: 'q1', kind: 'single', title: 'Which one?', options: [{ id: 'o0', label: 'A', text: 'TCP', images: [] }, { id: 'o1', label: 'B', text: 'UDP', images: [] }], images: [], blanks: 0, source: 'https://mooc1.chaoxing.com/work' };
describe('结构化答案与OCS匹配', () => {
  it('使用明确的选项id', () => { expect(validateAnswer(q, { optionIds: ['o1'] }).optionIds).toEqual(['o1']); });
  it('拒绝不存在的选项', () => { expect(() => validateAnswer(q, { optionIds: ['o9'] })).toThrow('不存在'); });
  it('单选不能有两个答案', () => { expect(() => validateAnswer(q, { optionIds: ['o0', 'o1'] })).toThrow('数量'); });
  it('多选支持多个选项', () => { expect(validateAnswer({ ...q, kind: 'multiple' }, { optionIds: ['o0', 'o1'] }).optionIds).toHaveLength(2); });
  it('OCS可将选项文本匹配到控件', () => { expect(validateAnswer(q, { answer: 'UDP' }).optionIds).toEqual(['o1']); });
  it('OCS判断题映射正确/错误', () => { expect(validateAnswer({ ...q, kind: 'judgement', options: [{ ...q.options[0], text: '正确' }, { ...q.options[1], text: '错误' }] }, { answer: 'False' }).optionIds).toEqual(['o1']); });
  it('不确定答案保留待办', () => { expect(() => validateAnswer(q, { optionIds: ['o0'], uncertain: true })).toThrow('无法确定'); });
  it('填空数量严格对应输入框', () => { expect(() => validateAnswer({ ...q, kind: 'completion', blanks: 2 }, { values: ['one'] })).toThrow('数量'); });
  it('简答保留原文而不执行HTML', () => { expect(validateAnswer({ ...q, kind: 'short', blanks: 1 }, { values: ['<script>alert(1)</script>'] }).values[0]).toContain('<script>'); });
  it('选项重排会失效旧缓存', () => { expect(answerFingerprint(q)).not.toBe(answerFingerprint({ ...q, options: [...q.options].reverse() })); });
});
describe('考试交卷必须一次性人工确认', () => {
  it('合成事件不能交卷', async () => { let submits = 0; expect(await new ExamSubmissionGate('e1').submit({ isTrusted: false }, 'e1', async () => { submits++; })).toBe(false); expect(submits).toBe(0); });
  it('其他试卷的确认无效', async () => { expect(await new ExamSubmissionGate('e1').submit({ isTrusted: true }, 'e2', async () => {})).toBe(false); });
  it('双击只提交一次', async () => { const g = new ExamSubmissionGate('e1'); let count = 0; await Promise.all([g.submit({ isTrusted: true }, 'e1', async () => { count++; }), g.submit({ isTrusted: true }, 'e1', async () => { count++; })]); expect(count).toBe(1); });
  it('结果不明时也不重试提交请求', async () => { const g = new ExamSubmissionGate('e1'); await expect(g.submit({ isTrusted: true }, 'e1', async () => { throw new Error('网络断开'); })).rejects.toThrow(); expect(await g.submit({ isTrusted: true }, 'e1', async () => {})).toBe(false); });
  it('重建实例不会自行调用交卷', () => { const g = new ExamSubmissionGate('e1'); expect(g.used).toBe(false); });
});
