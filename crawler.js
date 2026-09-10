// crawler.js
// pageAuditor.js의 페이지 단위 점검 워커를 사이트 전체로 확장하는 크롤러 레이어.
// 시작 URL에서 출발해 같은 도메인의 내부 링크를 찾아 큐에 넣고, 방문한 적 없는 페이지를 하나씩 점검한다.
require('dotenv').config();
const fs = require('fs');
const { chromium } = require('@playwright/test');
const { auditPage } = require('./pageAuditor');
const { extractInternalLinks, normalizeUrl } = require('./linkUtils');

const entryUrl = 'https://the-internet.herokuapp.com/';
const siteHost = new URL(entryUrl).hostname;
const MAX_PAGES = 10;          // 한 번 크롤링에서 점검할 최대 페이지 수 (비용/시간 제한)
const MAX_STEPS_PER_PAGE = 30; // 페이지 한 장당 허용할 최대 step 수 (15는 부족해서 finish 호출 전에 예산 소진됨)
const REPORT_PATH = 'crawl-report.json';

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  // seenKeys는 normalizeUrl() 기준 "같은 페이지로 볼지" 비교용 키만 저장한다 — 큐에는 항상 원본 URL을
  // 넣어서 navigate한다 (trailing slash가 있어야만 200이 나오는 페이지가 실제로 있었기 때문).
  const seenKeys = new Set();
  const queue = [];
  function enqueue(url) {
    const key = normalizeUrl(url);
    if (seenKeys.has(key)) return;
    seenKeys.add(key);
    queue.push(url);
  }
  enqueue(entryUrl);

  let visitedCount = 0;
  const report = [];

  try {
    while (queue.length > 0 && visitedCount < MAX_PAGES) {
      const url = queue.shift();
      visitedCount++;

      console.log(`\n===== [${visitedCount}/${MAX_PAGES}] 페이지 점검 시작: ${url} =====`);

      // 기본 인증(HTTP Basic Auth) 벽, DNS 오류, 타임아웃 등 page.goto 자체가 실패하는
      // 페이지가 섞여 있어도 크롤러 전체가 죽지 않도록 페이지 단위로 실패를 격리한다.
      // (연쇄적인 "다른 내비게이션에 의해 중단됨" 에러는 pageAuditor.js의 gotoWithRetry가 재시도로 흡수한다.)
      let result;
      try {
        result = await auditPage({ page, url, siteHost, maxSteps: MAX_STEPS_PER_PAGE });
      } catch (err) {
        console.log(`⚠️ 페이지 점검 실패, 건너뜀: ${url}\n  사유: ${err.message}`);
        report.push({ url, findings: [], summary: `(점검 실패: ${err.message})`, error: true });
        continue;
      }
      report.push({ url, findings: result.findings, summary: result.summary });

      // 이번 페이지에서 발견한 내부 링크를 큐에 추가 (이미 방문했거나 큐에 있으면 건너뜀).
      // <a href> 정적 스캔 + auditPage가 실제로 클릭해보다가 발견한 링크(SPA의 onClick 라우팅처럼
      // href가 없는 경우도 포함) 둘 다 합친다.
      const hrefs = await page.$$eval('a[href]', els => els.map(e => e.getAttribute('href'))).catch(() => []);
      for (const link of extractInternalLinks(hrefs, url, siteHost)) enqueue(link);
      for (const link of result.discoveredLinks) enqueue(link);
    }
  } finally {
    // 중간에 처리 못한 예외가 나도 그때까지의 결과는 항상 저장/출력한다.
    console.log('\n\n========== 전체 사이트 점검 결과 ==========');
    for (const r of report) {
      const issueCount = r.findings.filter(f => f.status === 'issue').length;
      console.log(`\n[${r.url}] (issue ${issueCount}건)`);
      console.log(r.summary ?? '(기록된 점검 결과 없음)');
    }

    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`\n📄 상세 결과 저장: ${REPORT_PATH}`);

    await page.waitForTimeout(1500);
    await browser.close();
  }
})();
