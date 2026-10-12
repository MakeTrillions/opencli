export const LOGIN_URL = 'https://account.proton.me/login?language=en';
export const MAIL_URL = 'https://mail.proton.me/';

export type PageKind = 'splash' | 'login' | 'apps' | 'mailbox' | 'blocked' | 'unknown';

export interface PageInspect {
  url: string;
  title: string;
  bodyHead?: string;
  hasPassword?: boolean;
  hasUsername?: boolean;
  buttons?: string[];
}

export function resolveCredentials(
  kwargs: Record<string, unknown>,
  env: NodeJS.ProcessEnv | Record<string, string | undefined> = process.env,
): { email: string; password: string } {
  const email = String(kwargs.email ?? env.PROTON_EMAIL ?? '').trim();
  const password = String(kwargs.password ?? env.PROTON_PASSWORD ?? '');
  if (!email) {
    throw new Error('Proton email is required. Pass --email or set PROTON_EMAIL.');
  }
  if (!password) {
    throw new Error('Proton password is required. Pass --password or set PROTON_PASSWORD.');
  }
  return { email, password };
}

export function redactSecrets(text: string, secrets: string[]): string {
  let out = text;
  for (const secret of secrets) {
    if (!secret) continue;
    out = out.split(secret).join('***');
  }
  return out;
}

export function classifyPage(page: PageInspect): PageKind {
  const url = page.url || '';
  const title = page.title || '';
  const body = page.bodyHead || '';
  const hay = `${url} ${title} ${body}`.toLowerCase();

  if (/human verification|verify you are human|unusual activity|too many recent/.test(hay)
    || (/captcha/.test(hay) && !/inbox|proton mail/.test(hay))) {
    return 'blocked';
  }
  if (/mail\.proton\.me/i.test(url) && !/\/login/i.test(url)) {
    return 'mailbox';
  }
  if (/account\.proton\.me\/apps/i.test(url) || /\bwelcome\b/i.test(body) && /\bmail\b/i.test(body) && /encrypted email/i.test(body)) {
    return 'apps';
  }
  if (page.hasUsername || page.hasPassword) {
    return 'login';
  }
  if (/loading proton account/i.test(body) || (/\/login/i.test(url) && !page.hasUsername && !page.hasPassword)) {
    return 'splash';
  }
  return 'unknown';
}

export function pickMailClickText(buttons: string[] | undefined): string | null {
  if (!buttons?.length) return null;
  const hit = buttons.find((text) => /^mail\b/i.test((text || '').trim().split('\n')[0] || ''));
  return hit ?? null;
}

export const INSPECT_JS = `(() => {
  const vis = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const inputs = Array.from(document.querySelectorAll('input')).filter(vis);
  const buttons = Array.from(document.querySelectorAll('button, [role="button"], a, [role="link"]'))
    .filter(vis)
    .map((b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').trim())
    .filter(Boolean)
    .slice(0, 20);
  const body = (document.body?.innerText || '').replace(/\\s+/g, ' ').trim();
  return {
    url: location.href,
    title: document.title,
    hasPassword: inputs.some((i) => i.type === 'password'),
    hasUsername: inputs.some((i) => i.type !== 'password' && i.type !== 'hidden' && i.type !== 'checkbox' && i.type !== 'submit'),
    buttons,
    bodyHead: body.slice(0, 900),
  };
})()`;

export function fillCredentialsJs(email: string, password: string): string {
  const e = JSON.stringify(email);
  const p = JSON.stringify(password);
  return `(() => {
    const setNative = (el, value) => {
      const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      const desc = Object.getOwnPropertyDescriptor(proto, 'value');
      el.focus();
      desc.set.call(el, value);
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: value, inputType: 'insertText' }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    };
    const vis = (el) => {
      if (!el) return false;
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
    };
    const inputs = Array.from(document.querySelectorAll('input')).filter(vis);
    const user = inputs.find((i) => /email|user|login/i.test((i.id || '') + (i.name || '') + (i.autocomplete || '') + (i.placeholder || '') + (i.getAttribute('aria-label') || '')) || i.type === 'email' || i.type === 'text')
      || inputs.find((i) => i.type !== 'password' && i.type !== 'hidden' && i.type !== 'checkbox' && i.type !== 'submit');
    const pass = inputs.find((i) => i.type === 'password');
    if (user) setNative(user, ${e});
    if (pass) setNative(pass, ${p});
    return { userFound: !!user, passFound: !!pass, userLen: user ? (user.value || '').length : 0, passLen: pass ? (pass.value || '').length : 0 };
  })()`;
}

export const CLICK_SUBMIT_JS = `(() => {
  const vis = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const buttons = Array.from(document.querySelectorAll('button, [role="button"], input[type="submit"]')).filter(vis);
  const label = (b) => (b.innerText || b.value || b.getAttribute('aria-label') || '').trim();
  const want = /^(continue|sign in|log in|next|submit)$/i;
  const btn = buttons.find((b) => want.test(label(b)))
    || buttons.find((b) => /continue|sign in|log in/i.test(label(b)));
  if (!btn) return { clicked: false, texts: buttons.map(label).slice(0, 12) };
  btn.click();
  return { clicked: true, text: label(btn) };
})()`;

export const CLICK_MAIL_JS = `(() => {
  const vis = (el) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  };
  const els = Array.from(document.querySelectorAll('a, button, [role="link"], [role="button"]')).filter(vis);
  const label = (el) => (el.innerText || el.getAttribute('aria-label') || '').trim();
  const mail = els.find((el) => /^mail\\b/i.test(label(el).split('\\n')[0] || ''));
  if (!mail) return { clicked: false, texts: els.map(label).filter(Boolean).slice(0, 12) };
  mail.click();
  return { clicked: true, text: label(mail) };
})()`;
