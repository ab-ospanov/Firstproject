require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');
const Anthropic = require('@anthropic-ai/sdk');
const cron = require('node-cron');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory task store
let tasks = [];

// Email transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// --- Email helpers ---

function priorityLabel(p) {
  return p === 'critical' ? 'Критичный' : p === 'high' ? 'Высокий' : 'Обычный';
}

function statusLabel(s) {
  return s === 'new' ? 'Новая' : s === 'prog' ? 'В работе' : s === 'done' ? 'Выполнена' : 'Отложена';
}

async function sendMail(to, subject, html) {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log(`[EMAIL MOCK] To: ${to} | Subject: ${subject}`);
    return;
  }
  try {
    await transporter.sendMail({ from: `"AI Task Manager" <${process.env.SMTP_USER}>`, to, subject, html });
    console.log(`[EMAIL SENT] To: ${to} | Subject: ${subject}`);
  } catch (err) {
    console.error('[EMAIL ERROR]', err.message);
  }
}

function taskEmailBase(task) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9f9f9;border-radius:8px">
      <h2 style="color:#1a1a1a;margin-bottom:16px">${task.title}</h2>
      <table style="width:100%;border-collapse:collapse">
        <tr><td style="padding:8px 0;color:#555;width:160px">Дедлайн:</td><td style="padding:8px 0;font-weight:bold">${task.date}</td></tr>
        <tr><td style="padding:8px 0;color:#555">Приоритет:</td><td style="padding:8px 0;font-weight:bold">${priorityLabel(task.priority)}</td></tr>
        <tr><td style="padding:8px 0;color:#555">Статус:</td><td style="padding:8px 0;font-weight:bold">${statusLabel(task.status)}</td></tr>
        ${task.assignee ? `<tr><td style="padding:8px 0;color:#555">Исполнитель:</td><td style="padding:8px 0;font-weight:bold">${task.assignee}</td></tr>` : ''}
        ${task.assigneePhone ? `<tr><td style="padding:8px 0;color:#555">Телефон:</td><td style="padding:8px 0">${task.assigneePhone}</td></tr>` : ''}
      </table>
    </div>`;
}

async function notifyOnCreate(task) {
  // Owner notification
  await sendMail(
    task.myEmail,
    `Задача создана: ${task.title}`,
    `<p>Задача успешно создана в AI Task Manager.</p>${taskEmailBase(task)}`
  );
  // Assignee notification
  if (task.assigneeEmail) {
    await sendMail(
      task.assigneeEmail,
      `Вам назначена задача: ${task.title}`,
      `<p>Вам назначена новая задача. Отправьте статус выполнения на <strong>${task.myEmail}</strong> до <strong>${getPrevDay(task.date)}</strong>.</p>${taskEmailBase(task)}`
    );
  }
}

function getPrevDay(dateStr) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// --- Cron: daily deadline reminders at 09:00 ---
cron.schedule('0 9 * * *', async () => {
  const today = new Date().toISOString().split('T')[0];
  const tomorrow = (() => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().split('T')[0]; })();

  for (const task of tasks) {
    if (task.status === 'done') continue;
    if (task.date === tomorrow) {
      await sendMail(task.myEmail, `Напоминание: завтра срок по задаче ${task.title}`,
        `<p>Напоминаем: завтра наступает дедлайн по задаче.</p>${taskEmailBase(task)}`);
      if (task.assigneeEmail) {
        await sendMail(task.assigneeEmail, `Завтра дедлайн по задаче: ${task.title}`,
          `<p>Напоминаем: завтра дедлайн. Пожалуйста, отправьте статус выполнения на <strong>${task.myEmail}</strong> до конца сегодняшнего дня.</p>${taskEmailBase(task)}`);
      }
    }
    if (task.date === today) {
      await sendMail(task.myEmail, `Сегодня дедлайн: ${task.title}`,
        `<p>Сегодня наступил дедлайн по задаче!</p>${taskEmailBase(task)}`);
    }
  }
});

// --- Calendar (.ics) generation ---
function generateICS(task) {
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const date = task.date.replace(/-/g, '');
  const nextDate = (() => {
    const d = new Date(task.date);
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0].replace(/-/g, '');
  })();
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AI Task Manager//RU',
    'BEGIN:VEVENT',
    `UID:${task.id}@aitaskmanager`,
    `DTSTAMP:${now}`,
    `DTSTART;VALUE=DATE:${date}`,
    `DTEND;VALUE=DATE:${nextDate}`,
    `SUMMARY:${task.title}`,
    `DESCRIPTION:Приоритет: ${priorityLabel(task.priority)}\\nИсполнитель: ${task.assignee || 'Не назначен'}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

// --- Routes ---

app.get('/api/tasks', (req, res) => res.json(tasks));

app.post('/api/tasks', async (req, res) => {
  const task = { id: uuidv4(), created: new Date().toISOString(), ...req.body };
  tasks.push(task);
  res.json(task);
  notifyOnCreate(task).catch(console.error);
});

app.put('/api/tasks/:id', (req, res) => {
  const idx = tasks.findIndex(t => t.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  tasks[idx] = { ...tasks[idx], ...req.body };
  res.json(tasks[idx]);
});

app.delete('/api/tasks/:id', (req, res) => {
  tasks = tasks.filter(t => t.id !== req.params.id);
  res.json({ ok: true });
});

app.get('/api/calendar/:id', (req, res) => {
  const task = tasks.find(t => t.id === req.params.id);
  if (!task) return res.status(404).json({ error: 'Not found' });
  res.setHeader('Content-Type', 'text/calendar');
  res.setHeader('Content-Disposition', `attachment; filename="task-${task.id}.ics"`);
  res.send(generateICS(task));
});

app.post('/api/chat', async (req, res) => {
  const { messages, taskContext } = req.body;

  const systemPrompt = `Ты — AI-ассистент в системе управления задачами AI Task Manager.
Интерфейс на русском языке. Помогай пользователям:
1. Распознавать задачи из свободного текста и предлагать заполнить форму
2. Отвечать на вопросы о текущих задачах
3. Давать советы по управлению задачами

Текущие задачи пользователя (${tasks.length} шт.):
${tasks.map(t => `- ${t.title} (${statusLabel(t.status)}, дедлайн: ${t.date})`).join('\n') || 'Задач пока нет'}

Если пользователь описывает задачу, извлеки из текста: название, дату дедлайна, исполнителя.
Ответь на русском языке. Будь кратким и полезным.`;

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: systemPrompt,
      messages,
    });

    let extractedTask = null;

    stream.on('text', (text) => {
      res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
    });

    stream.on('finalMessage', async (msg) => {
      // Try to detect task extraction intent from AI response
      const fullText = msg.content[0]?.text || '';
      res.write(`data: ${JSON.stringify({ type: 'done', fullText })}\n\n`);
      res.end();
    });

    stream.on('error', (err) => {
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      res.end();
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`AI Task Manager running on http://localhost:${PORT}`));
