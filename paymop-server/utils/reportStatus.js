const QUICK_REPORT_DURATION_MS = 48 * 60 * 60 * 1000;

export const isReportCurrentlyActive = (report, now = Date.now()) => {
  if (report?.status !== 'active') return false;
  if (report.report_mode !== 'quick') return true;

  const explicitExpiry = Date.parse(report.expiry || '');
  const reportDate = Date.parse(report.report_date || report.created_at || '');
  const expiresAt = Number.isFinite(explicitExpiry)
    ? explicitExpiry
    : Number.isFinite(reportDate)
      ? reportDate + QUICK_REPORT_DURATION_MS
      : Number.NaN;

  return Number.isFinite(expiresAt) && expiresAt > now;
};