// @ts-check
// API를 호출하지 않는 순수 로직 테스트. 크레딧 걱정 없이 언제든 돌려도 된다.
import { test, expect } from '@playwright/test';
import { extractInternalLinks } from '../../linkUtils.js';

const siteHost = 'example.com';
const baseUrl = 'https://example.com/start';

test('같은 도메인의 상대/절대 링크를 절대 URL로 뽑아낸다', () => {
  const hrefs = ['/about', 'https://example.com/contact'];
  const links = extractInternalLinks(hrefs, baseUrl, siteHost);
  expect([...links].sort()).toEqual([
    'https://example.com/about',
    'https://example.com/contact',
  ]);
});

test('다른 도메인 링크는 제외한다', () => {
  const hrefs = ['/about', 'https://other.com/page'];
  const links = extractInternalLinks(hrefs, baseUrl, siteHost);
  expect([...links]).toEqual(['https://example.com/about']);
});

test('빈 값, #만 있는 값, mailto/tel/javascript는 제외한다', () => {
  const hrefs = ['', '   ', '#', '#section', 'mailto:a@b.com', 'tel:123', 'javascript:void(0)'];
  const links = extractInternalLinks(hrefs, baseUrl, siteHost);
  expect(links.size).toBe(0);
});

test('해시는 제거해서 같은 페이지의 앵커 링크를 중복으로 취급하지 않는다', () => {
  const hrefs = ['/faq#top', '/faq#bottom'];
  const links = extractInternalLinks(hrefs, baseUrl, siteHost);
  expect([...links]).toEqual(['https://example.com/faq']);
});

test('URL 파싱에 실패하는 href는 무시하고 나머지는 계속 처리한다', () => {
  // 닫히지 않은 IPv6 리터럴 형태는 WHATWG URL 파서가 예외를 던지는 대표적인 케이스
  const hrefs = ['http://[not-closed', '/valid'];
  const links = extractInternalLinks(hrefs, baseUrl, siteHost);
  expect([...links]).toEqual(['https://example.com/valid']);
});
