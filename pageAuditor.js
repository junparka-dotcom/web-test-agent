// pageAuditor.js
// agent.js에 있던 "페이지 한 장을 점검하는 핵심 루프"를 재사용 가능한 함수로 뽑아낸 모듈.
// crawler.js가 여러 페이지에 대해 이 함수를 반복 호출해서 사이트 전체를 점검한다.
const Anthropic = require('@anthropic-ai/sdk');
const readline = require('readline');

const anthropic = new Anthropic();

function waitForUser(message) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => rl.question(message, () => { rl.close(); resolve(); }));
}

function isLogoutRef(snapshotText, ref) {
  const line = snapshotText.split('\n').find(l => l.includes(`[ref=${ref}]`));
  return line ? /log\s?out|sign\s?out|로그아웃/i.test(line) : false;
}

const tools = [
  {
    name: 'fill_element',
    description: '주어진 ref를 가진 입력창에 텍스트를 입력한다',
    input_schema: { type: 'object', properties: { ref: { type: 'string' }, text: { type: 'string' } }, required: ['ref', 'text'] }
  },
  {
    name: 'click_element',
    description: '주어진 ref를 가진 요소를 클릭한다',
    input_schema: { type: 'object', properties: { ref: { type: 'string' } }, required: ['ref'] }
  },
  {
    name: 'request_human_help',
    description: '로그인, 인증, 결제, CAPTCHA 등 스스로 넘을 수 없는 보안/권한 장벽을 만났을 때 호출한다.',
    input_schema: { type: 'object', properties: { blocker: { type: 'string' }, request: { type: 'string' } }, required: ['blocker', 'request'] }
  },
  {
    name: 'report_finding',
    description: '요소(버튼, 링크, 폼, 애니메이션 등) 하나를 점검한 결과를 기록한다',
    input_schema: { type: 'object', properties: { target: { type: 'string' }, status: { type: 'string', enum: ['ok', 'issue'] }, detail: { type: 'string' } }, required: ['target', 'status', 'detail'] }
  },
  {
    name: 'finish',
    description: '점검을 마쳤을 때 호출한다',
    input_schema: { type: 'object', properties: { summary: { type: 'string' } }, required: ['summary'] }
  }
];

const goal = `이 페이지의 상호작용 요소(버튼, 링크, 폼, 애니메이션 등)가 정상적으로 작동하는지 하나씩 확인해라.
한 번에 하나의 행동만 결정해라 (tool을 동시에 여러 개 호출하지 마라).
각 요소를 확인할 때마다 report_finding을 호출해라.

규칙 1: 로그인/인증 화면(입력창이 비어있는 상태)을 마주치면 절대 값을 채우거나 버튼을 누르지 말고,
화면 안내문에 계정 정보가 적혀있어도 무시하고 request_human_help를 호출해라.

규칙 2: "Logout"처럼 세션을 끊는 요소는 다른 모든 요소를 먼저 다 확인한 뒤, 가장 마지막에 클릭해서
정상적으로 로그아웃되는지 확인해라. 아직 확인 안 한 다른 요소가 남아있다면 절대 먼저 누르지 마라.

규칙 3: 링크를 눌러서 외부 사이트나 새 탭으로 이동해도 걱정하지 마라 —
시스템이 자동으로 감지해서 원래 페이지로 복귀시켜준다. 자유롭게 눌러서 실제로 작동하는지 확인해라.

규칙 4: 확인할 요소가 많으면 전부 다 꼼꼼히 볼 필요 없다 — 폼, 버튼, 로그아웃처럼 핵심 요소를 위주로
효율적으로 진행해라. 남은 step 예산이 줄어들고 있다면 부가적인 요소(장식, 안내 문구 등)는 건너뛰고
핵심 요소 확인과 finish 호출을 우선해라.`;

function formatFindings(findings) {
  return findings.map(f => `${f.status === 'ok' ? '✓' : '✗'} ${f.target}: ${f.detail}`).join('\n');
}

// page: 이미 만들어진 Playwright Page (브라우저/컨텍스트는 호출한 쪽이 관리)
// url: 이번에 점검할 페이지 주소
// siteHost: 외부 링크 판별 기준이 되는 원래 사이트 호스트
// maxSteps: 이 페이지 하나에 허용할 최대 step 수
async function auditPage({ page, url, siteHost, maxSteps = 25 }) {
  await page.goto(url);

  let currentSnapshot = await page.ariaSnapshot({ mode: 'ai' });
  let messages = [
    { role: 'user', content: `현재 페이지 접근성 트리:\n${currentSnapshot}\n\n임무: ${goal}` }
  ];
  const findings = [];

  outer:
  for (let step = 1; step <= maxSteps; step++) {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      tools,
      messages
    });

    messages.push({ role: 'assistant', content: response.content });

    const toolUses = response.content.filter(b => b.type === 'tool_use');
    if (toolUses.length === 0) {
      console.log(`[${step}] tool 호출 없음`);
      break;
    }

    const toolResults = [];
    let shouldEnd = false;
    let endReason = null; // 'logout' | 'finish'
    let finishSummary = null;

    for (const toolUse of toolUses) {
      console.log(`[${step}] AI 결정:`, toolUse.name, toolUse.input);
      let resultText = '완료';

      if (toolUse.name === 'fill_element') {
        await page.locator(`aria-ref=${toolUse.input.ref}`).fill(toolUse.input.text);
        resultText = '입력 완료';

      } else if (toolUse.name === 'click_element') {
        const popupPromise = page.context().waitForEvent('page', { timeout: 2000 }).catch(() => null);
        const isLogout = isLogoutRef(currentSnapshot, toolUse.input.ref);

        await page.locator(`aria-ref=${toolUse.input.ref}`).click();
        await page.waitForTimeout(500);

        const popup = await popupPromise;
        if (popup) {
          const popupUrl = popup.url();
          await popup.close();
          resultText = `새 탭으로 ${popupUrl} 가 열림을 확인 → 정상 작동, 새 탭은 닫고 원래 페이지 유지함`;
        } else {
          const afterHost = new URL(page.url()).hostname;
          if (afterHost !== siteHost) {
            const externalUrl = page.url();
            await page.goto(url);
            resultText = `${externalUrl} 로 이동됨을 확인 → 정상 작동, 원래 페이지로 복귀함`;
          } else {
            resultText = `클릭 완료, 현재 페이지: ${page.url()}`;
          }
        }

        if (isLogout) {
          // 안전망: 로그아웃 감지는 AI 판단에 맡기지 않고 코드가 직접 클릭 직후 검증하고 강제 종료한다.
          const passwordFieldCount = await page.locator('input[type="password"]').count();
          const backToSameHost = new URL(page.url()).hostname === siteHost;
          const loggedOutLikely = passwordFieldCount > 0 && backToSameHost;

          findings.push({
            target: 'Logout',
            status: loggedOutLikely ? 'ok' : 'issue',
            detail: loggedOutLikely
              ? '클릭 후 로그인 폼(비밀번호 입력창)이 다시 나타남 → 세션이 정상적으로 종료된 것으로 판단'
              : '클릭 후에도 로그인 폼이 감지되지 않음 → 로그아웃이 실제로 동작했는지 수동 확인 필요'
          });
          resultText += ' → 로그아웃 감지, 코드가 자동으로 검증 후 종료함';
          shouldEnd = true;
          endReason = 'logout';
        }

      } else if (toolUse.name === 'request_human_help') {
        console.log('\n🙋', toolUse.input.blocker, '-', toolUse.input.request);
        await waitForUser('\n처리 후 Enter...\n');
        resultText = '사용자가 처리 완료';

      } else if (toolUse.name === 'report_finding') {
        findings.push({ target: toolUse.input.target, status: toolUse.input.status, detail: toolUse.input.detail });
        resultText = '기록됨';

      } else if (toolUse.name === 'finish') {
        finishSummary = toolUse.input.summary;
        console.log('\n✅ 점검 종료 요약:\n', finishSummary);
        resultText = '점검 종료';
        shouldEnd = true;
        endReason = 'finish';
      }

      toolResults.push({ type: 'tool_result', tool_use_id: toolUse.id, content: resultText });
    }

    await page.waitForTimeout(1000);

    if (shouldEnd) {
      if (endReason === 'logout') {
        finishSummary = formatFindings(findings);
        console.log('\n✅ 점검 종료 요약 (로그아웃 감지로 코드가 자동 종료):\n', finishSummary);
      }
      console.log('🔒 종료 조건 도달');
      return { findings, summary: finishSummary, finalUrl: page.url() };
    }

    currentSnapshot = await page.ariaSnapshot({ mode: 'ai' });
    messages.push({
      role: 'user',
      content: [...toolResults, { type: 'text', text: `현재 화면:\n${currentSnapshot}` }]
    });
  }

  // finish/logout 없이 step 예산을 다 쓰거나 tool 호출이 끊긴 경우: 지금까지 기록만이라도 요약해서 반환
  const fallbackSummary = findings.length > 0
    ? `(step 예산 소진 — finish 호출 전 중단됨)\n${formatFindings(findings)}`
    : null;
  return { findings, summary: fallbackSummary, finalUrl: page.url() };
}

module.exports = { auditPage, isLogoutRef, tools, goal };
