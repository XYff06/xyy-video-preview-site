export async function apiFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.message || '请求失败');
  }

  return payload;
}
