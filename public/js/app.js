/* AI Task Manager — Frontend */

const API = '';

// ── Voice Input (Web Speech API) ────────────────────────
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

/**
 * Creates a voice recorder bound to a target textarea.
 * @param {HTMLButtonElement} btn   - mic button element
 * @param {HTMLTextAreaElement} target - textarea to fill
 * @param {Object} opts
 *   opts.hint  - element to show interim/status text (optional)
 *   opts.onResult(text) - called when final text is ready (optional)
 */
function createVoiceInput(btn, target, opts = {}) {
  if (!SpeechRecognition) {
    btn.title = 'Голосовой ввод не поддерживается в этом браузере';
    btn.style.opacity = '.35';
    btn.disabled = true;
    return null;
  }

  const rec = new SpeechRecognition();
  rec.lang = 'ru-RU';
  rec.interimResults = true;
  rec.continuous = false;

  let listening = false;
  let savedText = '';

  function setHint(text) {
    if (opts.hint) {
      opts.hint.innerHTML = text
        ? `<i class="ti ti-ear"></i> ${text}`
        : '';
    }
  }

  rec.onstart = () => {
    listening = true;
    btn.classList.add('listening');
    savedText = target.value;
    setHint('Слушаю…');
  };

  rec.onresult = (e) => {
    let interim = '';
    let final   = '';
    for (const r of e.results) {
      if (r.isFinal) final   += r[0].transcript;
      else           interim += r[0].transcript;
    }
    // Show live transcript
    target.value = savedText + (savedText && final ? ' ' : '') + final + interim;
    if (interim) setHint('«' + interim + '»');
  };

  rec.onend = () => {
    listening = false;
    btn.classList.remove('listening');
    setHint('');
    if (opts.onResult) opts.onResult(target.value);
    // Auto-resize textarea if needed
    target.style.height = 'auto';
    target.style.height = Math.min(target.scrollHeight, 200) + 'px';
  };

  rec.onerror = (e) => {
    listening = false;
    btn.classList.remove('listening');
    const msgs = {
      'not-allowed': 'Нет доступа к микрофону — разрешите в браузере',
      'no-speech':   'Речь не распознана, попробуйте снова',
      'network':     'Ошибка сети при распознавании',
    };
    setHint('');
    showToast(msgs[e.error] || 'Ошибка микрофона: ' + e.error, 'error');
  };

  btn.addEventListener('click', () => {
    if (listening) {
      rec.stop();
    } else {
      try { rec.start(); } catch {}
    }
  });

  return rec;
}


// ── Theme ──────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.className = theme === 'dark' ? 'ti ti-moon' : 'ti ti-sun';
  localStorage.setItem('theme', theme);
}

themeToggle.addEventListener('click', () => {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
});

const savedTheme = localStorage.getItem('theme') ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(savedTheme);

// ── Bottom Navigation ───────────────────────────────────
document.querySelectorAll('.nav-tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'list') renderTasks();
  });
});

// ── Toast ───────────────────────────────────────────────
function showToast(message, type = 'info', duration = 3200) {
  const icons = { success: 'ti-circle-check', error: 'ti-alert-circle', info: 'ti-info-circle' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="ti ${icons[type]}"></i><span>${message}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// ── Task Data ───────────────────────────────────────────
let tasks = [];
let currentFilter = 'all';

async function fetchTasks() {
  try {
    const res = await fetch(`${API}/api/tasks`);
    tasks = await res.json();
  } catch {
    tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
  }
  updateSubtitle();
  updateOverdueBadge();
}

async function saveTask(data) {
  try {
    const res = await fetch(`${API}/api/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error();
    const task = await res.json();
    tasks.push(task);
  } catch {
    tasks.push({ id: Date.now().toString(), created: new Date().toISOString(), ...data });
  }
  syncLocal();
}

async function updateTaskStatus(id, status) {
  try {
    await fetch(`${API}/api/tasks/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
  } catch {}
  const t = tasks.find(t => t.id === id);
  if (t) { t.status = status; syncLocal(); updateOverdueBadge(); }
}

async function deleteTask(id) {
  try { await fetch(`${API}/api/tasks/${id}`, { method: 'DELETE' }); } catch {}
  tasks = tasks.filter(t => t.id !== id);
  syncLocal();
  updateSubtitle();
  updateOverdueBadge();
}

function syncLocal() { localStorage.setItem('tasks', JSON.stringify(tasks)); }

function updateSubtitle() {
  const el = document.getElementById('tasksSubtitle');
  if (!el) return;
  const active = tasks.filter(t => t.status !== 'done').length;
  el.textContent = tasks.length === 0
    ? 'Задач пока нет — создайте первую!'
    : `${tasks.length} задач · ${active} активных`;
}

function updateOverdueBadge() {
  const badge = document.getElementById('overdueBadge');
  if (!badge) return;
  const today = new Date().toISOString().split('T')[0];
  const overdue = tasks.filter(t => t.status !== 'done' && t.date < today).length;
  badge.textContent = overdue;
  badge.style.display = overdue > 0 ? 'flex' : 'none';
}

// ── Task Form ───────────────────────────────────────────
const form           = document.getElementById('taskForm');
const assigneeToggle = document.getElementById('assigneeToggle');
const assigneeFields = document.getElementById('assigneeFields');

assigneeToggle.addEventListener('change', () => {
  assigneeFields.hidden = !assigneeToggle.checked;
  document.getElementById('assigneeEmail').required = assigneeToggle.checked;
  document.getElementById('assignee').required      = assigneeToggle.checked;
});

function validate() {
  let ok = true;
  const clear = id => { const e = document.getElementById(id); if (e) e.textContent = ''; };
  const setErr = (id, msg) => { const e = document.getElementById(id); if (e) e.textContent = msg; ok = false; };

  clear('titleError'); clear('dateError'); clear('myEmailError');
  clear('assigneeError'); clear('assigneeEmailError');

  const title   = document.getElementById('title');
  const date    = document.getElementById('date');
  const myEmail = document.getElementById('myEmail');

  if (!title?.value.trim())   setErr('titleError', 'Введите наименование задачи');
  if (!date?.value)           setErr('dateError',  'Укажите дату исполнения');
  if (!myEmail?.value.trim()) setErr('myEmailError', 'Введите ваш email');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(myEmail.value))
    setErr('myEmailError', 'Некорректный формат email');

  if (assigneeToggle.checked) {
    const a  = document.getElementById('assignee');
    const ae = document.getElementById('assigneeEmail');
    if (!a?.value.trim())  setErr('assigneeError',      'Введите ФИО исполнителя');
    if (!ae?.value.trim()) setErr('assigneeEmailError', 'Введите email исполнителя');
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ae.value))
      setErr('assigneeEmailError', 'Некорректный формат email');
  }
  return ok;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validate()) return;

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Сохранение…';

  const data = {
    title:         document.getElementById('title').value.trim(),
    date:          document.getElementById('date').value,
    priority:      document.getElementById('priority').value,
    status:        form.elements.status.value,
    myEmail:       document.getElementById('myEmail').value.trim(),
    assignee:      assigneeToggle.checked ? document.getElementById('assignee').value.trim() : '',
    assigneeEmail: assigneeToggle.checked ? document.getElementById('assigneeEmail').value.trim() : '',
    assigneePhone: assigneeToggle.checked ? document.getElementById('assigneePhone').value.trim() : '',
  };

  try {
    await saveTask(data);
    showToast('Задача сохранена! Уведомления отправлены.', 'success');
    form.reset();
    assigneeFields.hidden = true;
    assigneeToggle.checked = false;
    // Reset date to +7 days
    const d = new Date(); d.setDate(d.getDate() + 7);
    document.getElementById('date').value = d.toISOString().split('T')[0];
    updateSubtitle();
    updateOverdueBadge();
    setTimeout(() => document.querySelector('[data-tab="list"]').click(), 700);
  } catch {
    showToast('Ошибка при сохранении', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Сохранить задачу';
  }
});

// ── Task List Rendering ─────────────────────────────────
const STATUS_LABELS   = { new: 'Новая', prog: 'В работе', done: 'Выполнена', hold: 'Отложена' };
const PRIORITY_LABELS = { normal: 'Обычный', high: 'Высокий', critical: 'Критичный' };
const STATUS_OPTIONS  = Object.entries(STATUS_LABELS)
  .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
const tpl = document.getElementById('taskCardTpl');

function renderTasks() {
  const list     = document.getElementById('taskList');
  const filtered = currentFilter === 'all' ? tasks : tasks.filter(t => t.status === currentFilter);
  const sorted   = [...filtered].sort((a, b) => a.date.localeCompare(b.date));

  if (!sorted.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i class="ti ti-clipboard-off"></i></div>
        <h3>${currentFilter === 'all' ? 'Задач пока нет' : 'Нет задач с этим статусом'}</h3>
        <p>${currentFilter === 'all' ? 'Перейдите на вкладку «Задача» и создайте первую.' : 'Попробуйте другой фильтр.'}</p>
      </div>`;
    return;
  }

  list.innerHTML = '';
  const today = new Date().toISOString().split('T')[0];

  sorted.forEach(task => {
    const card = tpl.content.cloneNode(true).firstElementChild;
    card.dataset.id     = task.id;
    card.dataset.status = task.status;

    // Status badge
    const sb = card.querySelector('.task-status-badge');
    sb.textContent = STATUS_LABELS[task.status];
    sb.className   = `badge badge-${task.status}`;

    // Priority badge
    const pb = card.querySelector('.task-priority-badge');
    pb.textContent = PRIORITY_LABELS[task.priority] || 'Обычный';
    pb.className   = `badge badge-priority-${task.priority || 'normal'}`;

    // Title
    card.querySelector('.task-title').textContent = task.title;

    // Date — highlight overdue
    const dateEl = card.querySelector('.task-date-val');
    dateEl.textContent = formatDate(task.date);
    if (task.status !== 'done' && task.date < today) {
      dateEl.style.color  = 'var(--s-hold)';
      dateEl.style.fontWeight = '600';
      dateEl.textContent  = '⚠ ' + formatDate(task.date);
    }

    // Assignee
    if (task.assignee) {
      const aw = card.querySelector('.task-assignee-wrap');
      aw.hidden = false;
      aw.querySelector('.task-assignee-val').textContent = task.assignee;
    }

    // Status select
    const sel = card.querySelector('.status-select');
    sel.innerHTML = STATUS_OPTIONS;
    sel.value = task.status;
    sel.addEventListener('change', async () => {
      await updateTaskStatus(task.id, sel.value);
      renderTasks();
      showToast('Статус обновлён', 'success');
    });

    // Calendar btn
    card.querySelector('.cal-btn').addEventListener('click', () => {
      const link = document.createElement('a');
      link.href     = `${API}/api/calendar/${task.id}`;
      link.download = `task.ics`;
      link.click();
    });

    // Delete btn
    card.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm('Удалить задачу «' + task.title.slice(0, 40) + '»?')) return;
      await deleteTask(task.id);
      renderTasks();
      showToast('Задача удалена', 'info');
    });

    list.appendChild(card);
  });
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`;
}

// Filter chips
document.querySelectorAll('.filter-chip').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});

// ── AI Chat ─────────────────────────────────────────────
const chatMessages = document.getElementById('chatMessages');
const chatInput    = document.getElementById('chatInput');
const chatSend     = document.getElementById('chatSend');
let   chatHistory  = [];

function appendMsg(role, html, typing = false) {
  const wrap = document.createElement('div');
  wrap.className = `chat-msg ${role === 'user' ? 'user' : 'bot'}${typing ? ' typing' : ''}`;

  const av = document.createElement('div');
  av.className = 'chat-av';
  av.innerHTML = role === 'user' ? '<i class="ti ti-user"></i>' : '<i class="ti ti-robot"></i>';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = html;

  wrap.appendChild(av);
  wrap.appendChild(bubble);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrap;
}

function mdToHtml(text) {
  return text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

function hasTaskHints(text) {
  return /назван|дедлайн|исполнитель|задач|заполн|форм|создат|до \d/i.test(text);
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text || chatSend.disabled) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';
  chatSend.disabled = true;

  appendMsg('user', mdToHtml(text));
  chatHistory.push({ role: 'user', content: text });

  const typing = appendMsg('bot', '<div class="dot"></div><div class="dot"></div><div class="dot"></div>', true);

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });
    if (!res.ok) throw new Error('Server error');

    const reader  = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText  = '';

    typing.remove();
    const msgWrap = appendMsg('bot', '');
    const bubble  = msgWrap.querySelector('.chat-bubble');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const lines = decoder.decode(value, { stream: true }).split('\n').filter(l => l.startsWith('data: '));
      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'text') {
            fullText += data.text;
            bubble.innerHTML = mdToHtml(fullText);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
          if (data.type === 'done') {
            chatHistory.push({ role: 'assistant', content: fullText });
            if (hasTaskHints(fullText)) {
              const btn = document.createElement('button');
              btn.className = 'fill-task-btn';
              btn.innerHTML = '<i class="ti ti-pencil-plus"></i> Заполнить форму задачи';
              btn.addEventListener('click', () => {
                document.querySelector('[data-tab="task"]').click();
                prefillFromChat(fullText, text);
              });
              bubble.appendChild(document.createElement('br'));
              bubble.appendChild(btn);
            }
          }
        } catch {}
      }
    }
  } catch {
    typing.remove();
    appendMsg('bot', '<span style="color:var(--s-hold)">Ошибка соединения с ассистентом. Проверьте настройки сервера.</span>');
  } finally {
    chatSend.disabled = false;
  }
}

function prefillFromChat(aiText, userText) {
  const months = { 'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12 };
  const m = (aiText + ' ' + userText).match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i);
  if (m) {
    const year  = new Date().getFullYear();
    const month = String(months[m[2].toLowerCase()]).padStart(2, '0');
    const day   = m[1].padStart(2, '0');
    document.getElementById('date').value = `${year}-${month}-${day}`;
  }
  const titleEl = document.getElementById('title');
  if (!titleEl.value) titleEl.value = userText;
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
});

// ── Init ────────────────────────────────────────────────
(async () => {
  // Set default date = today + 7
  const d = new Date(); d.setDate(d.getDate() + 7);
  document.getElementById('date').value = d.toISOString().split('T')[0];

  await fetchTasks();
  renderTasks();

  // Voice: task form
  createVoiceInput(
    document.getElementById('voiceTask'),
    document.getElementById('title'),
    { hint: document.getElementById('voiceTaskHint') }
  );

  // Voice: chat input — auto-send when done speaking
  createVoiceInput(
    document.getElementById('voiceChat'),
    document.getElementById('chatInput'),
    {
      onResult: (text) => {
        if (text.trim()) {
          // Small delay so user can see the transcribed text
          setTimeout(sendChat, 600);
        }
      }
    }
  );
})();
