export function activeUserId() { try { return sessionStorage.getItem('comelibro:active-user') || ''; } catch { return ''; } }
const identityRoute = path => ['/auth/register','/auth/login','/auth/verify','/auth/forgot-password','/auth/reset-password'].includes(path);
export function accountChanged() { try { sessionStorage.removeItem('comelibro:active-user'); } catch {} window.dispatchEvent(new Event('session-account-changed')); }
function clearActiveUser() { try { sessionStorage.removeItem('comelibro:active-user'); } catch {} }
function applyUser(user) { const previous = activeUserId(), next = user?.id || ''; try { if(next) sessionStorage.setItem('comelibro:active-user',next); else sessionStorage.removeItem('comelibro:active-user'); } catch {} if(previous && previous !== next) window.dispatchEvent(new Event('session-account-changed')); }
export async function api(path, options = {}) {
  let response;
  const expected = activeUserId();
  try { response = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { ...(options.body && !(options.body instanceof Blob) ? {'Content-Type':'application/json'} : {}), ...options.headers, ...(expected && !['GET','HEAD','OPTIONS'].includes(options.method||'GET') && !identityRoute(path) ? {'X-Expected-Account-Id':expected} : {}) }, body: options.body && !(options.body instanceof Blob) ? JSON.stringify(options.body) : options.body }); }
  catch { throw new Error('Could not reach Comelibro. Check your connection, then try again. Your entries are still here.'); }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Request failed (${response.status}). Please try again.`);
    error.status = response.status; error.code = data.code;
    if (error.code === 'ACCOUNT_CONTEXT_CHANGED') accountChanged();
    else if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('session-expired'));
    throw error;
  }
  if (path === '/bootstrap' || data.user && path.startsWith('/auth/')) applyUser(data.user);
  if (path === '/auth/logout' || path === '/auth/reset-password' || path === '/account') clearActiveUser();
  return data;
}
export const post = (path, body = {}, headers = {}) => api(path, {method:'POST', body, headers});
export const uid = () => crypto.randomUUID();
export function stored(key, fallback = null) { try { return JSON.parse(localStorage.getItem(`comelibro:${key}`)) ?? fallback; } catch { return fallback; } }
export function save(key, value) { try { if (value === null) localStorage.removeItem(`comelibro:${key}`); else localStorage.setItem(`comelibro:${key}`, JSON.stringify(value)); } catch {} }
export function attempt(key, body) {
  // Keep the entire submitted payload stable after a lost response, including timing.
  const storageKey = `comelibro:attempt:${key}`;
  try { const previous = JSON.parse(sessionStorage.getItem(storageKey)); if (previous) return previous; } catch {}
  const value = {...body,attemptId:uid()};
  try { sessionStorage.setItem(storageKey,JSON.stringify(value)); } catch {}
  return value;
}
export function pendingAttempt(key) {
  try { return JSON.parse(sessionStorage.getItem(`comelibro:attempt:${key}`)); } catch { return null; }
}
export function clearAttempt(key) { try { sessionStorage.removeItem(`comelibro:attempt:${key}`); } catch {} }
export function chapterSentences(book, chapterId) { return book?.chapters?.find(c=>c.id===chapterId)?.sentences || []; }
export function textOf(value) { return typeof value === 'string' ? value : value == null ? '' : JSON.stringify(value,null,2); }
export function date(value) { return value ? new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}) : 'Unavailable'; }
