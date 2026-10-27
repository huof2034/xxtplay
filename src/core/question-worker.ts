/*! Orchestration adapted from OCSWorker, (c) 2022 enncy and contributors, MIT; upstream da5c0775a9d055724149ff505eae75bd85d334f9. */
import type { Answer, Question } from '../types';
import { Repository } from '../storage';
import { AiClient, parseJsonObject } from '../ai/client';
import { ANSWER_SYSTEM, answerFingerprint, validateAnswer } from './answer';
import { errorMessage, shortHash, sourceLink, throwIfAborted } from '../utils';

export interface QuestionHandle { question: Question; apply(answer: Answer): Promise<boolean>; prepare?(): Promise<Question>; alive(): boolean }
export interface QuestionResult { question: Question; answer?: Answer; filled: boolean; error?: string }
/** Separate discovery / answer lookup / resolution phases; single worker per account. */
export class QuestionWorker {
  isRunning = false;
  constructor(private repo: Repository, private ai: AiClient) {}
  async run(handles: QuestionHandle[], courseKey: string, chapter: string, signal: AbortSignal, onUpdate?: (results: QuestionResult[]) => void): Promise<QuestionResult[]> {
    if (this.isRunning) throw new Error('答题器已运行');
    this.isRunning = true;
    const results: QuestionResult[] = handles.map(h => ({ question: h.question, filled: false }));
    try {
      for (let index = 0; index < handles.length; index++) {
        throwIfAborted(signal);
        const handle = handles[index]; const result = results[index];
        try {
          if (!handle.alive()) throw new Error('题目页面已经切换，停止操作旧元素');
          const q = handle.prepare ? await handle.prepare() : handle.question;
          result.question = q;
          if (q.kind === 'unsupported') throw new Error('该题型尚未适配');
          const fingerprint = answerFingerprint(q);
          const provider = shortHash(JSON.stringify({ base: this.repo.config().ai.baseUrl, text: this.repo.config().ai.textModel, vision: this.repo.config().ai.visionModel }));
          let answer = this.repo.state().cache.find(x => x.fingerprint === fingerprint && x.provider === provider)?.answer;
          if (!answer) {
            const images = [...new Set([...q.images, ...q.options.flatMap(o => o.images)])];
            if (images.length > 16) throw new Error('题目图片过多，请人工处理');
            if (images.length && !this.repo.config().ai.visionModel.trim()) throw new Error('未配置视觉模型，图片题保留待办');
            const data = await Promise.all(images.map(url => this.ai.imageData(url, signal)));
            this.repo.log('info', `AI 答题：${q.title.slice(0, 70) || '图片题'}`);
            const raw = await this.ai.complete('answer', courseKey, ANSWER_SYSTEM, JSON.stringify({ id: q.id, type: q.kind, title: q.title, options: q.options.map(({ id, label, text }) => ({ id, label, text })), inputCount: q.blanks, imageOrder: images.map((_, i) => i + 1) }), data, signal);
            answer = validateAnswer(q, parseJsonObject(raw));
            this.repo.update(s => { s.cache.push({ fingerprint, provider, answer: answer!, createdAt: Date.now() }); s.cache = s.cache.slice(-1000); });
          }
          answer = { ...answer, questionId: q.id };
          throwIfAborted(signal);
          if (!handle.alive()) throw new Error('题目已离开页面，答案未回填');
          result.answer = answer; result.filled = await handle.apply(answer);
          if (!result.filled) throw new Error('答案回填后未能核验控件状态');
          if (this.repo.state().courses.find(c => c.key === courseKey)?.summaryEnabled) {
            this.repo.update(s => { const id = `question:${fingerprint}`; if (!s.materials.some(m => m.id === id)) s.materials.push({ id, courseKey, chapter, kind: 'question', text: `${q.title}\n答案：${answer!.optionIds.map(id => q.options.find(o => o.id === id)?.text).join('；') || answer!.values.join('；')}\n解析：${answer!.explanation}`, source: sourceLink(q.source) }); });
          }
        } catch (e) {
          if (signal.aborted) throw e;
          result.error = errorMessage(e); this.repo.log('warn', `题目待办：${result.error}`);
        }
        onUpdate?.(results);
      }
    } finally { this.isRunning = false; }
    return results;
  }
}
