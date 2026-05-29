/* AI Task Manager — Frontend */

const API = '';

// === Theme ===
const themeToggle = document.getElementById('themeToggle');
const themeIcon   = document.getElementById('themeIcon');

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeIcon.className = theme === 'dark' ? 'ti ti-moon' : 'ti ti-sun';
  localStorage.setItem('theme', theme);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  applyTheme(current === 'dark' ? 'light' : 'dark');
});

const savedTheme = localStorage.getItem('theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
applyTheme(savedTheme);

// === Tabs ===
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'list') renderTasks();
  });
});

// === Toast ===
function showToast(message, type = 'info', duration = 3500) {
  const icons = { success: 'ti-circle-check', error: 'ti-alert-circle', info: 'ti-info-circle' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<i class="ti ${icons[type]}"></i><span>${message}</span>`;
  document.getElementById('toastContainer').appendChild(el);
  setTimeout(() => el.remove(), duration);
}

// === Task Data (in-memory + server) ===
let tasks = [];
let currentFilter = 'all';

async function fetchTasks() {
  try {
    const res = await fetch(`${API}/api/tasks`);
    tasks = await res.json();
  } catch {
    // fallback to localStorage
    tasks = JSON.parse(localStorage.getItem('tasks') || '[]');
  }
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
    syncLocal();
    return task;
  } catch {
    // fallback: local only
    const task = { id: Date.now().toString(), created: new Date().toISOString(), ...data };
    tasks.push(task);
    syncLocal();
    return task;
  }
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
  if (t) { t.status = status; syncLocal(); }
}

async function deleteTask(id) {
  try {
    await fetch(`${API}/api/tasks/${id}`, { method: 'DELETE' });
  } catch {}
  tasks = tasks.filter(t => t.id !== id);
  syncLocal();
}

function syncLocal() {
  localStorage.setItem('tasks', JSON.stringify(tasks));
}

// === Task Form ===
const form = document.getElementById('taskForm');
const assigneeToggle = document.getElementById('assigneeToggle');
const assigneeFields = document.getElementById('assigneeFields');

assigneeToggle.addEventListener('change', () => {
  assigneeFields.hidden = !assigneeToggle.checked;
  document.getElementById('assigneeEmail').required = assigneeToggle.checked;
  document.getElementById('assignee').required = assigneeToggle.checked;
});

function validate() {
  let ok = true;
  const errors = { title: 'Введите наименование задачи', date: 'Укажите дату исполнения', myEmail: 'Введите корректный email' };
  ['title', 'date', 'myEmail'].forEach(f => {
    const el = form.elements[f] || document.getElementById(f);
    const err = document.getElementById(f + 'Error');
    if (err) err.textContent = '';
    if (!el || !el.value.trim()) {
      if (err) err.textContent = errors[f];
      ok = false;
    } else if (f === 'myEmail' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(el.value)) {
      if (err) err.textContent = 'Некорректный формат email';
      ok = false;
    }
  });

  if (assigneeToggle.checked) {
    const assignee = document.getElementById('assignee');
    const assigneeEmail = document.getElementById('assigneeEmail');
    const aErr = document.getElementById('assigneeError');
    const aeErr = document.getElementById('assigneeEmailError');
    if (aErr) aErr.textContent = '';
    if (aeErr) aeErr.textContent = '';
    if (!assignee.value.trim()) { if (aErr) aErr.textContent = 'Введите ФИО исполнителя'; ok = false; }
    if (!assigneeEmail.value.trim()) { if (aeErr) aeErr.textContent = 'Введите email исполнителя'; ok = false; }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(assigneeEmail.value)) { if (aeErr) aeErr.textContent = 'Некорректный формат email'; ok = false; }
  }
  return ok;
}

form.addEventListener('submit', async e => {
  e.preventDefault();
  if (!validate()) return;

  const btn = document.getElementById('saveBtn');
  btn.disabled = true;
  btn.innerHTML = '<i class="ti ti-loader-2" style="animation:spin 1s linear infinite"></i> Сохранение...';

  const data = {
    title: form.elements.title.value.trim(),
    date: form.elements.date.value,
    priority: form.elements.priority.value,
    status: form.elements.status.value,
    myEmail: form.elements.myEmail.value.trim(),
    assignee: assigneeToggle.checked ? form.elements.assignee.value.trim() : '',
    assigneeEmail: assigneeToggle.checked ? form.elements.assigneeEmail.value.trim() : '',
    assigneePhone: assigneeToggle.checked ? form.elements.assigneePhone.value.trim() : '',
  };

  try {
    await saveTask(data);
    showToast('Задача сохранена! Email-уведомления отправлены.', 'success');
    form.reset();
    assigneeFields.hidden = true;
    assigneeToggle.checked = false;
    // Switch to list tab
    setTimeout(() => {
      document.querySelector('[data-tab="list"]').click();
    }, 600);
  } catch {
    showToast('Ошибка при сохранении задачи', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="ti ti-device-floppy"></i> Сохранить задачу';
  }
});

// Add spin keyframe
const style = document.createElement('style');
style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
document.head.appendChild(style);

// === Task List Rendering ===
const statusLabels = { new: 'Новая', prog: 'В работе', done: 'Выполнена', hold: 'Отложена' };
const priorityLabels = { normal: 'Обычный', high: 'Высокий', critical: 'Критичный' };
const tpl = document.getElementById('taskCardTpl');

function renderTasks() {
  const list = document.getElementById('taskList');
  const filtered = currentFilter === 'all' ? tasks : tasks.filter(t => t.status === currentFilter);

  if (!filtered.length) {
    list.innerHTML = `<div class="empty-state"><i class="ti ti-clipboard-x"></i><p>${currentFilter === 'all' ? 'Задач пока нет.<br>Создайте первую задачу!' : 'Задач с этим статусом нет.'}</p></div>`;
    return;
  }

  list.innerHTML = '';
  // Sort by date asc
  [...filtered].sort((a, b) => a.date.localeCompare(b.date)).forEach(task => {
    const card = tpl.content.cloneNode(true).firstElementChild;
    card.setAttribute('data-id', task.id);
    card.setAttribute('data-status', task.status);

    const badge = card.querySelector('.task-status-badge');
    badge.textContent = statusLabels[task.status];
    badge.className = `task-status-badge status-${task.status}`;

    const pbadge = card.querySelector('.task-priority-badge');
    pbadge.textContent = priorityLabels[task.priority] || 'Обычный';
    pbadge.className = `task-priority-badge priority-${task.priority || 'normal'}`;

    card.querySelector('.task-card-title').textContent = task.title;
    card.querySelector('.task-date-val').textContent = formatDate(task.date);

    if (task.assignee) {
      const aSpan = card.querySelector('.task-assignee');
      aSpan.hidden = false;
      aSpan.querySelector('.task-assignee-val').textContent = task.assignee;
    }

    const sel = card.querySelector('.status-select');
    sel.value = task.status;
    sel.addEventListener('change', async () => {
      await updateTaskStatus(task.id, sel.value);
      renderTasks();
      showToast('Статус обновлён', 'success');
    });

    card.querySelector('.cal-btn').addEventListener('click', () => downloadICS(task));
    card.querySelector('.del-btn').addEventListener('click', async () => {
      if (!confirm('Удалить задачу?')) return;
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
  return `${d}.${m}.${y}`;
}

function downloadICS(task) {
  // Try server-side first
  const url = `${API}/api/calendar/${task.id}`;
  const link = document.createElement('a');
  link.href = url;
  link.download = `task-${task.id}.ics`;
  link.click();
}

// Filter pills
document.querySelectorAll('.filter-pill').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.dataset.filter;
    renderTasks();
  });
});

// === AI Chat ===
const chatMessages = document.getElementById('chatMessages');
const chatInput    = document.getElementById('chatInput');
const chatSend     = document.getElementById('chatSend');

let chatHistory = [];

function appendMessage(role, html, isTyping = false) {
  const wrap = document.createElement('div');
  wrap.className = `chat-message ${role}${isTyping ? ' typing-indicator' : ''}`;

  const avatar = document.createElement('div');
  avatar.className = 'chat-avatar';
  avatar.innerHTML = role === 'user' ? '<i class="ti ti-user"></i>' : '<i class="ti ti-robot"></i>';

  const bubble = document.createElement('div');
  bubble.className = 'chat-bubble';
  bubble.innerHTML = html;

  wrap.appendChild(avatar);
  wrap.appendChild(bubble);
  chatMessages.appendChild(wrap);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return wrap;
}

function formatAIText(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');
}

// Detect if AI suggests filling a task form
function detectTaskSuggestion(text) {
  const keywords = ['назван', 'дедлайн', 'исполнитель', 'задач', 'заполн', 'форм', 'создать'];
  return keywords.some(k => text.toLowerCase().includes(k));
}

async function sendChat() {
  const text = chatInput.value.trim();
  if (!text) return;

  chatInput.value = '';
  chatInput.style.height = 'auto';
  chatSend.disabled = true;

  appendMessage('user', text.replace(/</g, '&lt;'));
  chatHistory.push({ role: 'user', content: text });

  const typing = appendMessage('assistant', '<div class="dot"></div><div class="dot"></div><div class="dot"></div>', true);

  try {
    const res = await fetch(`${API}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatHistory }),
    });

    if (!res.ok) throw new Error('Server error');

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    typing.remove();
    const msgWrap = appendMessage('assistant', '');
    const bubble = msgWrap.querySelector('.chat-bubble');

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter(l => l.startsWith('data: '));

      for (const line of lines) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'text') {
            fullText += data.text;
            bubble.innerHTML = formatAIText(fullText);
            chatMessages.scrollTop = chatMessages.scrollHeight;
          }
          if (data.type === 'done') {
            chatHistory.push({ role: 'assistant', content: fullText });
            // Add "fill form" button if task detected
            if (detectTaskSuggestion(fullText)) {
              const btn = document.createElement('button');
              btn.className = 'fill-task-btn';
              btn.innerHTML = '<i class="ti ti-pencil-plus"></i> Заполнить форму задачи';
              btn.addEventListener('click', () => {
                document.querySelector('[data-tab="task"]').click();
                // Try to parse task data from conversation
                prefillFormFromChat(fullText, text);
              });
              bubble.appendChild(btn);
            }
          }
        } catch {}
      }
    }
  } catch (err) {
    typing.remove();
    appendMessage('assistant', '<span style="color:var(--danger)">Ошибка соединения с AI-ассистентом. Проверьте настройки сервера.</span>');
  } finally {
    chatSend.disabled = false;
    chatInput.focus();
  }
}

function prefillFormFromChat(aiText, userText) {
  // Simple heuristic extraction from user text
  const combined = userText + ' ' + aiText;

  // Try to extract date (formats: "15 июня", "15.06", "2025-06-15")
  const months = { 'января':1,'февраля':2,'марта':3,'апреля':4,'мая':5,'июня':6,'июля':7,'августа':8,'сентября':9,'октября':10,'ноября':11,'декабря':12 };
  const dateMatch = combined.match(/(\d{1,2})\s+(января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря)/i);
  if (dateMatch) {
    const day = dateMatch[1].padStart(2, '0');
    const month = String(months[dateMatch[2].toLowerCase()]).padStart(2, '0');
    const year = new Date().getFullYear();
    document.getElementById('date').value = `${year}-${month}-${day}`;
  }

  // Prefill title with user text
  const titleEl = document.getElementById('title');
  if (!titleEl.value) titleEl.value = userText;
}

chatSend.addEventListener('click', sendChat);
chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
chatInput.addEventListener('input', () => {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
});

// === Init ===
(async () => {
  await fetchTasks();
  // Pre-set today's date + 7 days in form
  const d = new Date();
  d.setDate(d.getDate() + 7);
  document.getElementById('date').value = d.toISOString().split('T')[0];
})();
