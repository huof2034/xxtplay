declare const __VERSION__: string;
declare module '*.webp' { const dataUrl: string; export default dataUrl; }
declare function GM_getValue<T>(key: string, fallback: T): T;
declare function GM_setValue(key: string, value: unknown): void;
declare function GM_deleteValue(key: string): void;
declare function GM_addValueChangeListener(key: string, cb: (name: string, oldValue: unknown, newValue: unknown, remote: boolean) => void): number;
declare function GM_removeValueChangeListener(id: number): void;
declare function GM_registerMenuCommand(name: string, cb: () => void): void;
declare function GM_notification(details: { title: string; text: string; timeout?: number }): void;
declare function GM_xmlhttpRequest(details: {
  method: string; url: string; headers?: Record<string, string>; data?: string;
  responseType?: 'json' | 'arraybuffer' | 'text'; timeout?: number; anonymous?: boolean;
  onload: (response: { status: number; responseText: string; response: unknown; responseHeaders: string; finalUrl?: string }) => void;
  onerror: () => void; ontimeout: () => void; onabort?: () => void;
}): { abort(): void };
declare const unsafeWindow: Window & Record<string, any>;
declare module 'string-similarity' {
  export interface Rating { target: string; rating: number }
  export function compareTwoStrings(a: string, b: string): number;
  export function findBestMatch(a: string, b: string[]): { ratings: { target: string; rating: number }[]; bestMatch: { target: string; rating: number }; bestMatchIndex: number };
}
