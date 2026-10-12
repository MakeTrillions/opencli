import { describe, expect, it } from 'vitest';
import {
  classifyPage,
  pickMailClickText,
  redactSecrets,
  resolveCredentials,
} from './login-helpers.js';

describe('resolveCredentials', () => {
  it('reads email and password from kwargs', () => {
    expect(
      resolveCredentials(
        { email: 'a@proton.me', password: 'secret-pass' },
        {},
      ),
    ).toEqual({ email: 'a@proton.me', password: 'secret-pass' });
  });

  it('falls back to PROTON_EMAIL and PROTON_PASSWORD', () => {
    expect(
      resolveCredentials(
        {},
        { PROTON_EMAIL: 'env@proton.me', PROTON_PASSWORD: 'env-pass' },
      ),
    ).toEqual({ email: 'env@proton.me', password: 'env-pass' });
  });

  it('lets kwargs override env', () => {
    expect(
      resolveCredentials(
        { email: 'flag@proton.me', password: 'flag-pass' },
        { PROTON_EMAIL: 'env@proton.me', PROTON_PASSWORD: 'env-pass' },
      ),
    ).toEqual({ email: 'flag@proton.me', password: 'flag-pass' });
  });

  it('throws without leaking the password when email is missing', () => {
    expect(() =>
      resolveCredentials({ password: 'super-secret-xyz' }, {}),
    ).toThrow(/PROTON_EMAIL|--email/);
    try {
      resolveCredentials({ password: 'super-secret-xyz' }, {});
    } catch (err) {
      expect(String(err)).not.toContain('super-secret-xyz');
    }
  });

  it('throws without leaking the password when password is missing', () => {
    expect(() =>
      resolveCredentials({ email: 'a@proton.me' }, {}),
    ).toThrow(/PROTON_PASSWORD|--password/);
  });
});

describe('classifyPage', () => {
  it('detects the loading splash', () => {
    expect(
      classifyPage({
        url: 'https://account.proton.me/login?language=en',
        title: 'Proton Account: Sign-in',
        bodyHead: 'Loading Proton Account...',
        hasUsername: false,
        hasPassword: false,
      }),
    ).toBe('splash');
  });

  it('detects the sign-in form', () => {
    expect(
      classifyPage({
        url: 'https://account.proton.me/login?language=en',
        title: 'Proton Account: Sign-in',
        bodyHead: 'Sign in Enter your Proton Account details.',
        hasUsername: true,
        hasPassword: true,
      }),
    ).toBe('login');
  });

  it('detects the apps picker after auth', () => {
    expect(
      classifyPage({
        url: 'https://account.proton.me/apps',
        title: 'Proton Account: Sign-in',
        bodyHead: 'Welcome Privacy and security starts here Mail Encrypted email',
        buttons: ['Mail\nEncrypted email', 'Settings'],
      }),
    ).toBe('apps');
  });

  it('detects the mailbox', () => {
    expect(
      classifyPage({
        url: 'https://mail.proton.me/u/1/inbox#category=primary',
        title: 'Inbox | Alexandra961566@proton.me | Proton Mail',
        bodyHead: 'Proton Mail New message Inbox',
      }),
    ).toBe('mailbox');
  });

  it('detects human verification', () => {
    expect(
      classifyPage({
        url: 'https://account.proton.me/login',
        title: 'Human verification',
        bodyHead: 'Verify you are human captcha',
      }),
    ).toBe('blocked');
  });
});

describe('pickMailClickText', () => {
  it('matches the Mail tile whose label includes Encrypted email', () => {
    expect(
      pickMailClickText([
        'Alexandra961566\nAlexandra961566@proton.me\nA',
        'Mail\nEncrypted email',
        'Calendar\nPrivate scheduling',
        'Settings',
      ]),
    ).toBe('Mail\nEncrypted email');
  });
});

describe('redactSecrets', () => {
  it('strips known secrets from error text', () => {
    expect(redactSecrets('failed with password super-secret-xyz', ['super-secret-xyz'])).toBe(
      'failed with password ***',
    );
  });
});
