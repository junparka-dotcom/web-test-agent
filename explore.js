// explore.js
const { chromium } = require('@playwright/test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  await page.goto('https://the-internet.herokuapp.com/login');

  const snapshot = await page.ariaSnapshot({ mode: 'ai' });
  console.log(snapshot);

  // 방금 찍은 snapshot에서 확인한 ref를 이용해 직접 입력/클릭
  // (지금은 우리가 눈으로 보고 손으로 지정한 것 — 다음 단계에서 이 부분을 AI가 대신하게 됨)
  await page.locator('aria-ref=e16').fill('tomsmith');
  await page.locator('aria-ref=e20').fill('SuperSecretPassword!');
  await page.locator('aria-ref=e21').click();

  await page.waitForTimeout(2000); // 결과를 눈으로 볼 시간
  console.log('현재 URL:', page.url());

  await browser.close();
})();