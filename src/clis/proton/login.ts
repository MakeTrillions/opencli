import { cli, Strategy } from '../../registry.js';
import type { IPage } from '../../types.js';
import {
  CLICK_MAIL_JS,
  CLICK_SUBMIT_JS,
  INSPECT_JS,
  LOGIN_URL,
  MAIL_URL,
  classifyPage,
  fillCredentialsJs,
  pickMailClickText,
  redactSecrets,
  resolveCredentials,
  type PageInspect,
  type PageKind,
} from './login-helpers.js';

function log(message: string): void {
  if (process.env.OPENCLI_VERBOSE) {
    console.error(`[opencli:proton] ${message}`);
  }
}

async function inspectPage(page: IPage): Promise<PageInspect> {
  return (await page.evaluate(INSPECT_JS)) as PageInspect;
}

async function waitForKind(
  page: IPage,
  wanted: PageKind[],
  timeoutMs: number,
): Promise<{ kind: PageKind; inspect: PageInspect }> {
  const start = Date.now();
  let inspect = await inspectPage(page);
  let kind = classifyPage(inspect);
  while (Date.now() - start < timeoutMs) {
    if (wanted.includes(kind) || kind === 'blocked') {
      return { kind, inspect };
    }
    log(`waiting for ${wanted.join('|')} (have ${kind}) ${inspect.url}`);
    await page.wait(1);
    inspect = await inspectPage(page);
    kind = classifyPage(inspect);
  }
  return { kind, inspect };
}

async function openMailbox(page: IPage, inspect: PageInspect): Promise<PageInspect> {
  const mailLabel = pickMailClickText(inspect.buttons);
  const clicked = await page.evaluate(CLICK_MAIL_JS) as { clicked: boolean; text?: string };
  log(`open mail clicked=${clicked.clicked} label=${mailLabel || ''}`);
  if (!clicked.clicked) {
    await page.goto(MAIL_URL, { settleMs: 4000 });
  } else {
    await page.wait(4);
  }
  const waited = await waitForKind(page, ['mailbox'], 40000);
  return waited.inspect;
}

cli({
  site: 'proton',
  name: 'login',
  description: 'Sign in to Proton Mail via the connected Chrome session (web UI, not SRP API)',
  domain: 'account.proton.me',
  strategy: Strategy.UI,
  browser: true,
  timeoutSeconds: 120,
  navigateBefore: false,
  args: [
    { name: 'email', type: 'string', help: 'Proton address or username (or set PROTON_EMAIL)' },
    { name: 'password', type: 'string', help: 'Password; prefer PROTON_PASSWORD env over this flag' },
  ],
  columns: ['logged_in', 'already_logged_in', 'email', 'url', 'title'],

  func: async (page: IPage | null, kwargs) => {
    if (!page) throw new Error('Browser page required');
    const { email, password } = resolveCredentials(kwargs);
    try {
      await page.goto(LOGIN_URL, { settleMs: 2500 });
      let { kind, inspect } = await waitForKind(page, ['login', 'apps', 'mailbox'], 20000);
      log(`page ${kind} ${inspect.url}`);

      if (kind === 'blocked') {
        throw new Error('Proton login blocked (human verification / captcha). Solve it in Chrome and retry.');
      }

      if (kind === 'mailbox') {
        return [{ logged_in: true, already_logged_in: true, email, url: inspect.url, title: inspect.title }];
      }

      if (kind === 'apps') {
        inspect = await openMailbox(page, inspect);
        if (classifyPage(inspect) !== 'mailbox') {
          throw new Error(`Signed in but mailbox did not open: ${inspect.url}`);
        }
        return [{ logged_in: true, already_logged_in: true, email, url: inspect.url, title: inspect.title }];
      }

      const fill1 = await page.evaluate(fillCredentialsJs(email, password)) as { userFound: boolean; passFound: boolean };
      log(`fill userFound=${fill1.userFound} passFound=${fill1.passFound}`);
      const click1 = await page.evaluate(CLICK_SUBMIT_JS) as { clicked: boolean; text?: string };
      log(`submit ${click1.clicked ? click1.text : 'no button'}`);

      ({ kind, inspect } = await waitForKind(page, ['apps', 'mailbox', 'login'], 20000));
      if (kind === 'login') {
        const fill2 = await page.evaluate(fillCredentialsJs(email, password)) as { passFound: boolean };
        log(`fill2 passFound=${fill2.passFound}`);
        await page.evaluate(CLICK_SUBMIT_JS);
        ({ kind, inspect } = await waitForKind(page, ['apps', 'mailbox'], 40000));
      }

      if (kind === 'blocked') {
        throw new Error('Proton login blocked after submit (human verification / captcha).');
      }
      if (kind === 'apps') {
        inspect = await openMailbox(page, inspect);
        kind = classifyPage(inspect);
      }
      if (kind !== 'mailbox') {
        throw new Error(`Proton login did not reach inbox: ${inspect.url} (${inspect.title})`);
      }
      return [{ logged_in: true, already_logged_in: false, email, url: inspect.url, title: inspect.title }];
    } catch (err) {
      const message = redactSecrets(err instanceof Error ? err.message : String(err), [password]);
      throw new Error(message);
    }
  },
});
