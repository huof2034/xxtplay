import type { AiProviderId } from '../types';
import whale from './assets/deepseek.webp';
import capybara from './assets/qwen.webp';
import astronaut from './assets/kimi.webp';

export const THEME_ART: Record<AiProviderId, string> = { deepseek: whale, qwen: capybara, kimi: astronaut, custom: '' };

/** Independent, decorative shapes and palettes; no vendor logo assets are embedded. */
export function themeName(provider: AiProviderId): string {
  return { deepseek: 'DeepSeek', qwen: '通义千问', kimi: 'Kimi', custom: '自定义 AI' }[provider];
}

export const THEME_CSS = `
:host{--accent:#415a80;--accent-dark:#324969;--accent-soft:#e9f0f8;--canvas:#f4f7fb;--ink:#1e2c40;--secondary:#536780;--line:#d6e1ed;--mark:#415a80;color:var(--ink)}
:host([data-theme="deepseek"]){--accent:#245cc4;--accent-dark:#17469c;--accent-soft:#eaf1ff;--canvas:#f4f7fd;--line:#d5e3f8;--mark:#3474df}
:host([data-theme="qwen"]){--accent:#7143bc;--accent-dark:#583291;--accent-soft:#f1eafd;--canvas:#f8f5fd;--line:#e4dbf3;--mark:#8255ce}
:host([data-theme="kimi"]){--accent:#087966;--accent-dark:#075e50;--accent-soft:#e5f5f0;--canvas:#f3faf7;--line:#d1e8e0;--mark:#15957c}
:host([data-theme="custom"]){--accent:#415a80;--accent-dark:#324969;--accent-soft:#e9f0f8;--canvas:#f4f7fb;--line:#d6e1ed;--mark:#415a80}
.panel{width:420px;max-width:calc(100vw - 32px);background:var(--canvas);border-color:var(--line);border-radius:18px;box-shadow:0 18px 55px #1b2b4938;position:relative;isolation:isolate}
.scene{position:absolute;inset:0;z-index:-1;pointer-events:none;background-position:center bottom;background-size:cover;background-repeat:no-repeat;opacity:.95;transform-origin:center bottom}
.scene-in{animation:scene-arrive 900ms cubic-bezier(.2,.75,.2,1) both}
@keyframes scene-arrive{0%{opacity:0;transform:translateX(-18%) scale(1.04);filter:blur(6px)}65%{opacity:.95;filter:blur(0)}100%{opacity:.95;transform:translateX(0) scale(1);filter:blur(0)}}
@media(prefers-reduced-motion:reduce){.scene-in{animation:none}}
.head{padding:16px 16px 14px;background:linear-gradient(115deg,#ffffffed 45%,var(--accent-soft));gap:10px}
.identity,.header-end{display:flex;align-items:center;gap:10px;min-width:0}.header-end{gap:8px}
.brand{letter-spacing:0;line-height:1.15;min-width:0}.brand-name{font-size:17px;font-weight:750;color:var(--ink)}.brand-subtitle{font-size:11px;color:var(--secondary);font-weight:500;margin-top:4px}
.theme-mark{width:38px;height:38px;flex:none;border-radius:13px;background:var(--accent-soft);position:relative;overflow:hidden}
.theme-mark:before,.theme-mark:after{content:"";position:absolute;background:var(--mark)}
.theme-mark:before{width:20px;height:20px;left:9px;top:9px;border-radius:50%}.theme-mark:after{width:8px;height:8px;left:15px;top:15px;background:#fff;border-radius:50%}
:host([data-theme="deepseek"]) .theme-mark:before{width:24px;height:13px;left:7px;top:13px;border-radius:55% 45% 55% 40%;transform:rotate(-18deg)}
:host([data-theme="deepseek"]) .theme-mark:after{width:9px;height:9px;left:20px;top:7px;border-radius:2px 9px 1px 9px;transform:rotate(35deg);background:var(--mark)}
:host([data-theme="qwen"]) .theme-mark:before{border-radius:7px;transform:rotate(45deg)}
:host([data-theme="qwen"]) .theme-mark:after{border-radius:2px;transform:rotate(45deg)}
:host([data-theme="kimi"]) .theme-mark:before{width:22px;height:22px;left:8px;top:8px}
:host([data-theme="kimi"]) .theme-mark:after{width:18px;height:18px;left:15px;top:5px;background:var(--accent-soft)}
.theme-badge{display:inline-block;max-width:110px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--accent-dark);background:var(--accent-soft);border:1px solid var(--line);border-radius:999px;padding:4px 8px;font-size:11px;font-weight:650}
.head .small-button{padding:5px 8px;color:var(--secondary);background:#ffffffbb}
.tabs{padding:0 10px;overflow-x:auto;scrollbar-width:thin;border-color:var(--line);gap:2px;background:#ffffffdc}
.tabs button{flex:0 0 auto;padding:11px 10px;color:var(--secondary);font-size:12px}
.tabs button.active{color:var(--accent-dark);border-color:var(--accent);font-weight:700}
.body{padding:14px;max-height:min(65vh,calc(100vh - 180px));overflow:auto}
.body:not([data-tab="courses"]){background:#ffffffed}
.card{background:#fffffff0;border-color:var(--line);border-radius:12px;padding:13px;box-shadow:0 2px 8px #1d335108}
.body[data-tab="courses"] .card{width:75%;min-width:min(245px,100%)}
.body[data-tab="courses"] .options{flex-wrap:wrap;gap:6px 12px}
.hint{background:#fffffff0;color:var(--accent-dark);border:1px solid var(--line);line-height:1.6}
.muted,.provider-note,.field span{color:var(--secondary)}.empty{color:var(--secondary)}
button{border-color:var(--line);color:var(--ink);transition:background .15s,border-color .15s}
button:hover{background:var(--accent-soft);border-color:var(--accent)}button.primary{background:var(--accent);border-color:var(--accent);color:#fff}button.primary:hover{background:var(--accent-dark);border-color:var(--accent-dark)}
button:focus-visible,input:focus-visible,select:focus-visible,a:focus-visible{outline:3px solid var(--accent);outline-offset:2px}
input[type=checkbox]{accent-color:var(--accent)}input[type=text],input[type=password],input[type=url],select{background:#fff;border-color:var(--line);color:var(--ink)}input:focus,select:focus{border-color:var(--accent)}
.link{color:var(--accent-dark)}.meter{background:var(--accent-soft)}.meter>div{background:var(--accent)}.footer{color:var(--secondary);border-color:var(--line);background:#ffffffeb}
.bubble{background:var(--accent);color:white;box-shadow:0 6px 24px #263b6140}.bubble:hover{background:var(--accent-dark);color:white}
@media(max-width:420px){:host{right:8px;bottom:8px}.panel{max-width:calc(100vw - 16px)}.head{padding:12px}.body{padding:10px;max-height:calc(100vh - 155px)}.theme-badge{max-width:76px}.toolbar{flex-wrap:wrap}.toolbar button{min-width:calc(50% - 8px)}}
`;
