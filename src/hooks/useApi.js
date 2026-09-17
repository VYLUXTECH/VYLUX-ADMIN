function authHeaders(base = {}) {
  const token = localStorage.getItem('vylux_token');
  if (!token) return base;
  return { ...base, 'Authorization': `Bearer ${token}` };
}

export async function api(url, opts = {}) {
  const headers = authHeaders(opts.headers || {});
  const res = await fetch(url, { ...opts, headers });
  if (res.status === 401) {
    localStorage.removeItem('vylux_token');
    window.location.reload();
    throw new Error('Unauthorized');
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(txt.slice(0, 200) || `HTTP ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  return ct.includes('json') ? res.json() : res.text();
}

export const apiGet = (url) => api(url, { headers: { 'Content-Type': 'application/json' } });
export const apiPost = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiPut = (url, body) => api(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export const apiDel = (url, body) => api(url, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
