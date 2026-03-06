export function formatDateTime(isoDateString) {
  return new Date(isoDateString).toLocaleString('zh-CN', { hour12: false });
}
