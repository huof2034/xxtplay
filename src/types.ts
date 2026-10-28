export type TaskKind = 'video' | 'audio' | 'document' | 'quiz' | 'discussion' | 'exam' | 'unsupported';
export type TaskStatus = 'queued' | 'running' | 'pending' | 'waiting-human' | 'awaiting-confirmation' | 'submitted-unverified' | 'completed';
export type QuestionKind = 'single' | 'multiple' | 'judgement' | 'completion' | 'short' | 'unsupported';
export type AiPurpose = 'answer' | 'summary';
export type AiProviderId = 'deepseek' | 'qwen' | 'kimi' | 'custom';

export interface AiConfig { provider: AiProviderId; baseUrl: string; apiKey: string; textModel: string; visionModel: string }
export interface PlaybackConfig { autoOpen: boolean; autoSpeed: boolean; speed: number; autoSeek: boolean }
export interface GlobalConfig {
  version: 1; ai: AiConfig; playback: PlaybackConfig; notifications: boolean; muted: boolean;
}
export interface CourseProgress {
  done?: number; total?: number; percent: number; text: string; updatedAt: number;
}
export interface Course {
  id: string; classId: string; cpi: string; key: string; title: string; url: string;
  enabled: boolean; efficiencyMode: boolean; summaryEnabled: boolean; order: number;
  teacher?: string; progress?: CourseProgress;
}
export interface WatchCondition { kind: 'seconds' | 'ratio'; value: number; source: string; scope: string }
export interface WatchRequirement {
  known: boolean; conditions: WatchCondition[]; reason?: string; scoringText?: string;
}
export interface TaskRecord {
  id: string; courseKey: string; title: string; kind: TaskKind; status: TaskStatus;
  url: string; chapter?: string; updatedAt: number; attempts: number; reason?: string; receipt?: string;
  progress?: { current: number; duration: number; requirement: WatchRequirement; watched?: number };
  answers?: { id: string; title: string; filled: boolean; error?: string; answer?: Answer }[];
}
export interface LogEntry { at: number; level: 'info' | 'warn' | 'error' | 'success'; message: string }
export interface Material { id: string; courseKey: string; chapter: string; kind: 'subtitle' | 'document' | 'question'; text: string; source: string; missing?: string; images?: string[] }
export interface StudyNote { id: string; courseKey: string; title: string; markdown: string; materialIds: string[]; createdAt: number }
export interface QuestionOption { id: string; label: string; text: string; images: string[] }
export interface Question {
  id: string; kind: QuestionKind; title: string; options: QuestionOption[];
  images: string[]; blanks: number; source: string;
}
export interface Answer {
  questionId: string; optionIds: string[]; values: string[]; explanation: string;
  uncertain: boolean; error?: string;
}
export interface AnswerCache { fingerprint: string; provider: string; answer: Answer; createdAt: number }
export interface AiAudit { at: number; purpose: AiPurpose; courseKey: string; model: string; inputTokens: number; outputTokens: number; ok: boolean }
export interface AccountState {
  version: 1; accountId: string; autoRun: boolean; courses: Course[];
  tasks: Record<string, TaskRecord>; materials: Material[]; notes: StudyNote[];
  cache: AnswerCache[]; audit: AiAudit[]; logs: LogEntry[];
  activeCourseKey?: string; pausedReason?: string;
  visitedChapters?: Record<string, string[]>;
  confirmedEmptyChapters?: Record<string, string[]>;
  examActive?: { tabId: string; at: number };
}

export const DEFAULT_CONFIG: GlobalConfig = {
  version: 1, ai: { provider: 'deepseek', baseUrl: 'https://api.deepseek.com', apiKey: '', textModel: 'deepseek-flash', visionModel: 'deepseek-flash' },
  playback: { autoOpen: true, autoSpeed: true, speed: 2, autoSeek: false },
  notifications: true, muted: true,
};
export const emptyAccount = (accountId: string): AccountState => ({
  version: 1, accountId, autoRun: false, courses: [], tasks: {}, materials: [], notes: [], cache: [], audit: [], logs: [],
});
