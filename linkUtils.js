// linkUtils.js
// crawler.js가 사용하는 순수 함수만 모아둔 모듈. 부수효과(브라우저 실행 등)가 없어서
// 테스트에서 안전하게 require할 수 있다.

// hrefs 목록에서 siteHost와 같은 도메인의 내부 링크만 절대 URL로 뽑아낸다.
// (mailto/tel/javascript/빈 값/#만 있는 값은 제외, 해시는 제거해서 중복을 줄임)
function extractInternalLinks(hrefs, baseUrl, siteHost) {
  const links = new Set();
  for (const href of hrefs) {
    if (!href) continue;
    const trimmed = href.trim();
    if (trimmed === '' || trimmed.startsWith('#') || /^(mailto|tel|javascript):/i.test(trimmed)) continue;
    let abs;
    try {
      abs = new URL(trimmed, baseUrl);
    } catch {
      continue;
    }
    if (abs.hostname !== siteHost) continue; // 외부 도메인은 크롤링 대상에서 제외 (agent가 클릭해서 검증만 함)
    abs.hash = '';
    links.add(abs.toString());
  }
  return links;
}

module.exports = { extractInternalLinks };
