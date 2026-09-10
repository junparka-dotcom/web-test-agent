// linkUtils.js
// crawler.js가 사용하는 순수 함수만 모아둔 모듈. 부수효과(브라우저 실행 등)가 없어서
// 테스트에서 안전하게 require할 수 있다.

function stripHash(urlString) {
  const u = new URL(urlString);
  u.hash = '';
  return u.toString();
}

// trailing slash("/path"와 "/path/")나 쿼리스트링 순서("?a=1&b=2"와 "?b=2&a=1") 차이만으로
// 같은 페이지가 크롤러 큐에 중복으로 들어가는 걸 막기 위한 "비교용 키" 함수.
// 주의: 이 함수의 반환값으로 실제 navigate하면 안 된다 — the-internet의 /add_remove_elements/처럼
// trailing slash가 있어야만 정상 응답하고 없으면 404가 나는 페이지가 실제로 있었음(라이브 테스트로 발견).
// 그래서 navigate에는 항상 원본 URL(extractInternalLinks/discoveredLinks가 돌려주는 값)을 쓰고,
// 이 함수는 오직 Set/큐에서 "같은 페이지로 볼지" 비교하는 키를 만들 때만 사용한다.
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

// hrefs 목록에서 siteHost와 같은 도메인의 내부 링크만 원본 형태(해시만 제거) 그대로 뽑아낸다.
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
    links.add(stripHash(abs.toString()));
  }
  return links;
}

module.exports = { extractInternalLinks, normalizeUrl, stripHash };
