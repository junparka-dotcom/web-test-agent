// report.js
// 크롤링/점검 결과(findings 배열의 배열)를 사람이 읽기 좋은 형태로 요약하는 순수 함수 모음.
// 부수효과(파일 쓰기 등)가 없어서 테스트에서 안전하게 require할 수 있다.

// report: [{ url, findings: [{target, status, detail}], summary, error? }, ...]
function summarizeReport(report) {
  const failedPages = report.filter(r => r.error).length;
  const issues = [];
  let totalFindings = 0;
  for (const r of report) {
    for (const f of r.findings) {
      totalFindings++;
      if (f.status === 'issue') issues.push({ url: r.url, target: f.target, detail: f.detail });
    }
  }
  return {
    totalPages: report.length,
    failedPages,
    totalFindings,
    totalIssues: issues.length,
    issues,
  };
}

// meta: { entryUrl, startedAt } (둘 다 선택)
function formatReportMarkdown(report, meta = {}) {
  const summary = summarizeReport(report);
  const lines = ['# 점검 리포트', ''];

  if (meta.entryUrl) lines.push(`- 시작 URL: ${meta.entryUrl}`);
  if (meta.startedAt) lines.push(`- 실행 시각: ${meta.startedAt}`);
  lines.push(`- 점검한 페이지: ${summary.totalPages}개 (실패 ${summary.failedPages}개)`);
  lines.push(`- 발견된 findings: ${summary.totalFindings}건 (이슈 ${summary.totalIssues}건)`);
  lines.push('');

  if (summary.issues.length > 0) {
    lines.push(`## ⚠ 발견된 이슈 (${summary.issues.length}건)`, '');
    for (const issue of summary.issues) {
      lines.push(`- [${issue.url}] **${issue.target}**: ${issue.detail}`);
    }
    lines.push('');
  }

  lines.push('## 페이지별 상세', '');
  for (const r of report) {
    const issueCount = r.findings.filter(f => f.status === 'issue').length;
    const statusLabel = r.error ? '점검 실패' : `issue ${issueCount}건`;
    lines.push(`### ${r.url} (${statusLabel})`, '');

    if (r.findings.length > 0) {
      for (const f of r.findings) {
        lines.push(`- ${f.status === 'ok' ? '✓' : '✗'} **${f.target}**: ${f.detail}`);
      }
      lines.push('');
    }

    if (r.summary) {
      lines.push('```', r.summary, '```', '');
    }
  }

  return lines.join('\n');
}

module.exports = { summarizeReport, formatReportMarkdown };
