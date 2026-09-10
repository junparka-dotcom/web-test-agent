// agent.js
// 단일 페이지 점검용 진입점. 실제 점검 로직은 pageAuditor.js에 있고, 이 파일은 그걸 호출만 한다.
require('dotenv').config();
const fs = require('fs');
const { chromium } = require('@playwright/test');
const { auditPage } = require('./pageAuditor');
const { formatReportMarkdown } = require('./report');

const MAX_STEPS = 25;
const entryUrl = 'https://the-internet.herokuapp.com/secure';
const siteHost = new URL(entryUrl).hostname;
const REPORT_JSON_PATH = 'agent-report.json';
const REPORT_MD_PATH = 'agent-report.md';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const result = await auditPage({ page, url: entryUrl, siteHost, maxSteps: MAX_STEPS });
  console.log('\n최종 요약:\n', result.summary ?? '(기록된 점검 결과 없음)');

  const report = [{ url: entryUrl, findings: result.findings, summary: result.summary }];
  fs.writeFileSync(REPORT_JSON_PATH, JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(REPORT_MD_PATH, formatReportMarkdown(report, { entryUrl, startedAt: new Date().toISOString() }), 'utf-8');
  console.log(`\n📄 상세 결과 저장: ${REPORT_JSON_PATH} (데이터), ${REPORT_MD_PATH} (읽기용)`);

  await page.waitForTimeout(1500);
  await browser.close();
})();
