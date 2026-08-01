// Reading time entries from Clockify's own API, as the already-logged-in user.
//
// The web app keeps its session JWT, workspace and user in the localStorage of
// app.clockify.me. A content script shares that origin's storage, so we can
// borrow the existing session instead of asking for an API key. Verified: the
// public v1 API accepts this JWT via the X-Auth-Token header, and CORS allows
// the app origin (global.api.clockify.me returns 404 for these paths — use
// api.clockify.me).
//
// Why an API at all: the dashboard's daily chart is a <canvas>, so per-day
// hours are unreachable from the DOM there. This is the only exact source.

const API_BASE = 'https://api.clockify.me/api/v1';
const PAGE_SIZE = 1000;
const MAX_PAGES = 20;      // 20k entries; a backstop, not an expected limit

// { token, workspaceId, userId, timeZone } or null when not logged in.
export function getSession() {
  try {
    const token = localStorage.getItem('token');
    const ws    = JSON.parse(localStorage.getItem('defaultWorkspace') || 'null');
    const user  = JSON.parse(localStorage.getItem('user') || 'null');
    if (!token || !ws?.id || !user?.id) return null;

    return {
      token,
      workspaceId: ws.id,
      userId:      user.id,
      // Clockify has its own timezone setting, which is what its UI groups by.
      // Undefined falls back to the browser's zone inside Intl.
      timeZone: user.settings?.timeZone || user.timeZone || undefined,
    };
  } catch {
    return null;
  }
}

// All of the user's time entries overlapping [startISO, endISO].
// Throws on a non-OK response so callers can distinguish "no weekend hours"
// from "we could not find out".
export async function fetchTimeEntries(session, startISO, endISO) {
  const entries = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${API_BASE}/workspaces/${session.workspaceId}/user/${session.userId}/time-entries`
      + `?start=${encodeURIComponent(startISO)}&end=${encodeURIComponent(endISO)}`
      + `&page=${page}&page-size=${PAGE_SIZE}`;

    const res = await fetch(url, { headers: { 'X-Auth-Token': session.token } });
    if (!res.ok) throw new Error(`Clockify API ${res.status}`);

    const batch = await res.json();
    if (!Array.isArray(batch) || batch.length === 0) break;

    entries.push(...batch);
    if (batch.length < PAGE_SIZE) break;
  }

  return entries;
}
