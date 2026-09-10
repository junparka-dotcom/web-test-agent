// @ts-check
// API를 호출하지 않는 순수 로직 테스트. 크레딧 걱정 없이 언제든 돌려도 된다.
// auditPage 자체(Anthropic API를 직접 호출)는 여기서 다루지 않고, 그 주변의 결정적인 로직만 검증한다.
import { test, expect } from '@playwright/test';
import { isLogoutRef, formatFindings, gotoWithRetry, ensureReachable } from '../../pageAuditor.js';

test.describe('isLogoutRef', () => {
  test('영문 Logout 텍스트를 감지한다', () => {
    const snapshot = 'link "Logout" [ref=e12]\nlink "Home" [ref=e5]';
    expect(isLogoutRef(snapshot, 'e12')).toBe(true);
  });

  test('"Sign Out"처럼 공백이 있는 표현도 감지한다', () => {
    const snapshot = 'button "Sign Out" [ref=e3]';
    expect(isLogoutRef(snapshot, 'e3')).toBe(true);
  });

  test('한글 "로그아웃"도 감지한다', () => {
    const snapshot = 'link "로그아웃" [ref=e7]';
    expect(isLogoutRef(snapshot, 'e7')).toBe(true);
  });

  test('ref가 스냅샷에 없으면 false', () => {
    const snapshot = 'link "Logout" [ref=e12]';
    expect(isLogoutRef(snapshot, 'e99')).toBe(false);
  });

  test('ref는 있지만 로그아웃 관련 텍스트가 아니면 false', () => {
    const snapshot = 'link "Home" [ref=e5]';
    expect(isLogoutRef(snapshot, 'e5')).toBe(false);
  });
});

test.describe('formatFindings', () => {
  test('ok는 체크, issue는 X 표시로 목록을 만든다', () => {
    const findings = [
      { target: 'Login', status: 'ok', detail: '정상' },
      { target: 'Logout', status: 'issue', detail: '실패' },
    ];
    expect(formatFindings(findings)).toBe('✓ Login: 정상\n✗ Logout: 실패');
  });

  test('빈 배열이면 빈 문자열', () => {
    expect(formatFindings([])).toBe('');
  });
});

test.describe('gotoWithRetry', () => {
  function fakePage(gotoImpl) {
    let calls = 0;
    return {
      goto: async (url) => { calls++; return gotoImpl(calls, url); },
      waitForTimeout: async () => {},
      calls: () => calls,
    };
  }

  test('처음부터 성공하면 한 번만 시도한다', async () => {
    const page = fakePage(() => {});
    await gotoWithRetry(page, 'https://example.com');
    expect(page.calls()).toBe(1);
  });

  test('"다른 내비게이션에 의해 중단됨" 에러는 재시도해서 넘긴다', async () => {
    const page = fakePage((n) => {
      if (n < 3) throw new Error('Navigation to "x" is interrupted by another navigation to "chrome-error://chromewebdata/"');
    });
    await gotoWithRetry(page, 'https://example.com');
    expect(page.calls()).toBe(3);
  });

  test('재시도를 다 써도 실패하면 마지막 에러를 던진다', async () => {
    const page = fakePage(() => { throw new Error('interrupted by another navigation'); });
    await expect(gotoWithRetry(page, 'https://example.com', 3)).rejects.toThrow('interrupted by another navigation');
    expect(page.calls()).toBe(3);
  });

  test('연쇄 내비게이션 에러가 아니면 재시도 없이 바로 던진다', async () => {
    const page = fakePage(() => { throw new Error('net::ERR_INVALID_AUTH_CREDENTIALS'); });
    await expect(gotoWithRetry(page, 'https://example.com')).rejects.toThrow('ERR_INVALID_AUTH_CREDENTIALS');
    expect(page.calls()).toBe(1);
  });
});

test.describe('ensureReachable', () => {
  test('정상 접속되면 자격증명을 묻지 않고 false를 반환한다', async () => {
    let calls = 0;
    const page = {
      goto: async () => { calls++; },
      waitForTimeout: async () => {},
    };
    const usedBasicAuth = await ensureReachable(page, 'https://example.com');
    expect(usedBasicAuth).toBe(false);
    expect(calls).toBe(1);
  });

  test('Basic Auth 이외의 에러는 자격증명 요청 없이 그대로 던진다', async () => {
    const page = {
      goto: async () => { throw new Error('net::ERR_NAME_NOT_RESOLVED'); },
      waitForTimeout: async () => {},
    };
    await expect(ensureReachable(page, 'https://example.com')).rejects.toThrow('ERR_NAME_NOT_RESOLVED');
  });
});
