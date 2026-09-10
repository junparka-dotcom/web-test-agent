// @ts-check
// API를 호출하지 않는 순수 로직 테스트. 크레딧 걱정 없이 언제든 돌려도 된다.
import { test, expect } from '@playwright/test';
import { summarizeReport, formatReportMarkdown } from '../../report.js';

const sampleReport = [
  {
    url: 'https://example.com/a',
    findings: [
      { target: 'Login', status: 'ok', detail: '정상 작동' },
      { target: 'Logout', status: 'issue', detail: '로그아웃 실패' },
    ],
    summary: 'A 페이지 요약',
  },
  {
    url: 'https://example.com/b',
    findings: [],
    summary: '(점검 실패: 타임아웃)',
    error: true,
  },
];

test.describe('summarizeReport', () => {
  test('페이지 수, 실패 수, findings/이슈 수를 센다', () => {
    const summary = summarizeReport(sampleReport);
    expect(summary.totalPages).toBe(2);
    expect(summary.failedPages).toBe(1);
    expect(summary.totalFindings).toBe(2);
    expect(summary.totalIssues).toBe(1);
  });

  test('이슈 목록에 url/target/detail을 담는다', () => {
    const summary = summarizeReport(sampleReport);
    expect(summary.issues).toEqual([
      { url: 'https://example.com/a', target: 'Logout', detail: '로그아웃 실패' },
    ]);
  });

  test('빈 리포트는 전부 0', () => {
    const summary = summarizeReport([]);
    expect(summary).toEqual({ totalPages: 0, failedPages: 0, totalFindings: 0, totalIssues: 0, issues: [] });
  });
});

test.describe('formatReportMarkdown', () => {
  test('이슈가 있으면 이슈 섹션을 포함한다', () => {
    const md = formatReportMarkdown(sampleReport, { entryUrl: 'https://example.com/', startedAt: '2024-01-01T00:00:00.000Z' });
    expect(md).toContain('시작 URL: https://example.com/');
    expect(md).toContain('점검한 페이지: 2개 (실패 1개)');
    expect(md).toContain('⚠ 발견된 이슈 (1건)');
    expect(md).toContain('[https://example.com/a] **Logout**: 로그아웃 실패');
  });

  test('이슈가 없으면 이슈 섹션을 생략한다', () => {
    const md = formatReportMarkdown([{ url: 'https://example.com/a', findings: [{ target: 'Login', status: 'ok', detail: '정상' }], summary: 'ok' }]);
    expect(md).not.toContain('⚠ 발견된 이슈');
  });

  test('실패한 페이지는 "점검 실패"로 표시한다', () => {
    const md = formatReportMarkdown(sampleReport);
    expect(md).toContain('https://example.com/b (점검 실패)');
  });
});
