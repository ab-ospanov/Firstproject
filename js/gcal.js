/* Google Calendar Integration — OAuth2 via Google Identity Services */

const GCAL_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const GCAL_API   = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

let tokenClient = null;
let accessToken = null;

// ── Persist token in sessionStorage (expires with tab) ──
function loadToken() {
  try {
    const raw = sessionStorage.getItem('gcal_token');
    if (!raw) return null;
    const t = JSON.parse(raw);
    if (Date.now() > t.expires_at) { sessionStorage.removeItem('gcal_token'); return null; }
    return t;
  } catch { return null; }
}

function saveToken(tokenResponse) {
  const t = {
    access_token: tokenResponse.access_token,
    expires_at:   Date.now() + tokenResponse.expires_in * 1000,
  };
  sessionStorage.setItem('gcal_token', JSON.stringify(t));
  accessToken = t.access_token;
}

function clearToken() {
  sessionStorage.removeItem('gcal_token');
  accessToken = null;
}

// ── Client ID stored in localStorage ────────────────────
function getClientId()  { return localStorage.getItem('gcal_client_id') || ''; }
function setClientId(id){ localStorage.setItem('gcal_client_id', id.trim()); }

// ── Init GIS token client ────────────────────────────────
function initTokenClient(clientId) {
  if (!window.google?.accounts?.oauth2) return;
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope:     GCAL_SCOPE,
    callback:  (resp) => {
      if (resp.error) { console.error('GCal OAuth error:', resp.error); return; }
      saveToken(resp);
      updateGcalUI(true);
      if (typeof window._gcalPendingTask === 'object') {
        createCalendarEvent(window._gcalPendingTask);
        window._gcalPendingTask = null;
      }
    },
  });
}

// ── Public: request token (or use cached) ───────────────
function gcalAuthorize(callback) {
  const cached = loadToken();
  if (cached) { accessToken = cached.access_token; if (callback) callback(); return; }
  if (!tokenClient) { initTokenClient(getClientId()); }
  if (!tokenClient) return;
  if (callback) window._gcalPendingTask = callback;
  tokenClient.requestAccessToken({ prompt: 'consent' });
}

// ── Create event in Google Calendar ─────────────────────
async function createCalendarEvent(task) {
  if (!accessToken) return false;

  const startDate = task.date; // YYYY-MM-DD
  const endDate   = nextDay(startDate);

  const priorityMap = { normal: 'Обычный', high: 'Высокий', critical: 'Критичный' };
  const statusMap   = { new: 'Новая', prog: 'В работе', done: 'Выполнена', hold: 'Отложена' };

  const event = {
    summary:     task.title,
    description: [
      `📋 Статус: ${statusMap[task.status] || task.status}`,
      `🚩 Приоритет: ${priorityMap[task.priority] || task.priority}`,
      task.assignee     ? `👤 Исполнитель: ${task.assignee}`     : '',
      task.assigneePhone? `📞 Телефон: ${task.assigneePhone}`    : '',
      task.assigneeEmail? `✉️ Email исп.: ${task.assigneeEmail}` : '',
      `✉️ Владелец: ${task.myEmail}`,
    ].filter(Boolean).join('\n'),
    start: { date: startDate },
    end:   { date: endDate   },
    colorId: task.priority === 'critical' ? '11' : task.priority === 'high' ? '5' : '9',
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 24 * 60 }, // за 1 день
        { method: 'email', minutes: 24 * 60 },
      ],
    },
  };

  try {
    const res = await fetch(GCAL_API, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify(event),
    });

    if (res.status === 401) {
      // Token expired — refresh
      clearToken();
      window._gcalPendingTask = task;
      gcalAuthorize();
      return false;
    }

    if (!res.ok) {
      const err = await res.json();
      console.error('GCal API error:', err);
      return false;
    }

    const created = await res.json();
    console.log('GCal event created:', created.htmlLink);
    return created.htmlLink;
  } catch (e) {
    console.error('GCal fetch error:', e);
    return false;
  }
}

function nextDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ── Public entrypoint: save task → add to calendar ──────
async function gcalAddTask(task) {
  if (!getClientId()) return; // not configured
  const cached = loadToken();
  if (cached) {
    accessToken = cached.access_token;
    return createCalendarEvent(task);
  }
  // Need auth first — store task, then authorize
  window._gcalPendingTask = task;
  gcalAuthorize();
}

// ── UI ───────────────────────────────────────────────────
function updateGcalUI(connected) {
  const btn   = document.getElementById('gcalBtn');
  const label = document.getElementById('gcalBtnLabel');
  if (!btn) return;
  if (connected) {
    btn.classList.add('gcal-connected-btn');
    label.textContent = 'Календарь ✓';
    // Show connected view in modal
    document.getElementById('gcalSetupView')?.setAttribute('hidden', '');
    document.getElementById('gcalConnectedView')?.removeAttribute('hidden');
  } else {
    btn.classList.remove('gcal-connected-btn');
    label.textContent = 'Подключить';
    document.getElementById('gcalSetupView')?.removeAttribute('hidden');
    document.getElementById('gcalConnectedView')?.setAttribute('hidden', '');
  }
}

// ── Modal logic ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const modal     = document.getElementById('gcalModal');
  const btn       = document.getElementById('gcalBtn');
  const closeBtn  = document.getElementById('gcalModalClose');
  const connectBtn= document.getElementById('gcalConnect');
  const disconnBtn= document.getElementById('gcalDisconnect');
  const clientInput = document.getElementById('gcalClientId');

  // Restore saved client ID
  if (getClientId()) clientInput.value = getClientId();

  // Check if already have token
  const cached = loadToken();
  if (cached && getClientId()) {
    accessToken = cached.access_token;
    updateGcalUI(true);
    initTokenClient(getClientId());
  }

  btn.addEventListener('click', () => modal.removeAttribute('hidden'));
  closeBtn.addEventListener('click', () => modal.setAttribute('hidden', ''));
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.setAttribute('hidden', ''); });

  connectBtn.addEventListener('click', () => {
    const id = clientInput.value.trim();
    if (!id) { clientInput.focus(); return; }
    setClientId(id);
    initTokenClient(id);
    gcalAuthorize();
    modal.setAttribute('hidden', '');
  });

  disconnBtn.addEventListener('click', () => {
    clearToken();
    localStorage.removeItem('gcal_client_id');
    tokenClient = null;
    clientInput.value = '';
    updateGcalUI(false);
    modal.setAttribute('hidden', '');
  });

  // Init if client ID already saved
  if (getClientId()) {
    // Wait for GIS script to load
    window.addEventListener('load', () => initTokenClient(getClientId()));
  }
});
