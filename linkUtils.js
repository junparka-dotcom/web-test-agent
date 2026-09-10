// linkUtils.js
// crawler.js가 사용하는 순수 함수만 모아둔 모듈. 부수효과(브라우저 실행 등)가 없어서
// 테스트에서 안전하게 require할 수 있다.

// trailing slash("/path"와 "/path/")나 쿼리스트링 순서("?a=1&b=2"와 "?b=2&a=1") 차이만으로
// 같은 페이지가 크롤러 큐에 중복으로 들어가는 걸 막기 위한 정규화. the-internet 같은 사이트는
// 이 두 형태를 같은 페이지로 리다이렉트하므로, 정규화한 형태로 navigate해도 실제 로드되는 페이지는
// 동일하다 (리다이렉트 후 최종 URL은 pageAuditor.js가 다시 page.url()로 확인함).
function normalizeUrl(urlString) {
  const u = new URL(urlString);
  u.hash = '';
  if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
    u.pathname = u.pathname.slice(0, -1);
  }
  const params = [...u.searchParams].sort(([a], [b]) => a.localeCompare(b));
  u.search = new URLSearchParams(params).toString();
  return u.toString();
}

// hrefs 목록에서 siteHost와 같은 도메인의 내부 링크만 정규화된 절대 URL로 뽑아낸다.
// (mailto/tel/javascript/빈 값/#만 있는 값은 제외)
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
    links.add(normalizeUrl(abs.toString()));
  }
  return links;
}

module.exports = { extractInternalLinks, normalizeUrl };
