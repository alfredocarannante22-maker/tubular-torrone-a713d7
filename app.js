import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut as fbSignOut, onAuthStateChanged }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getDatabase, ref, push, update, remove, onValue, off }
  from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js';

// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
// Sostituisci con i tuoi valori dalla Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyDXuYSNSyr6-536WS8mFsaFGXqDLTje2ew",
  authDomain: "casa-app2.firebaseapp.com",
  databaseURL: "https://casa-app2-default-rtdb.europe-west1.firebasedatabase.app",
  projectId: "casa-app2",
  storageBucket: "casa-app2.firebasestorage.app",
  messagingSenderId: "533849405749",
  appId: "1:533849405749:web:204ed9c191921a20aab47c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// ─── STATO GLOBALE ────────────────────────────────────────────────────────────
let currentUser = null;
let currentSection = 'calendar';
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedDate = toDateStr(new Date());
let events = [];
let notes = [];
let expenses = [];
let editingEventId = null;
let editingNoteId = null;
let editingExpenseId = null;
let expenseFilter = 'all';
let activeRefs = [];
let notificationTimers = [];

const ALLOWED_EMAILS = new Set(['alfredocarannante22@gmail.com', 'lorenzavitale22@gmail.com']);

const EVENT_COLORS = ['#6366f1','#ef4444','#22c55e','#f59e0b','#3b82f6','#ec4899','#14b8a6','#f97316'];
const CATEGORY_ICONS = { casa:'🏠', cibo:'🍕', trasporti:'🚗', salute:'💊', svago:'🎬', abbonamenti:'📱', vestiti:'👕', altro:'📦' };

// ─── AUTH ─────────────────────────────────────────────────────────────────────
window.signInWithGoogle = async () => {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); }
  catch(e) { showToast('Errore di accesso: ' + e.message); }
};

window.signOut = async () => {
  activeRefs.forEach(({ r, fn }) => off(r, 'value', fn));
  activeRefs = [];
  listenersActive = false;
  await fbSignOut(auth);
};

onAuthStateChanged(auth, async user => {
  if (user && !ALLOWED_EMAILS.has(user.email)) {
    await fbSignOut(auth);
    showToast('Accesso non autorizzato');
    return;
  }
  currentUser = user;
  if (user) {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'block';
    document.getElementById('user-avatar').src = user.photoURL || '';
    setupListeners();
    updateExpenseSummary();
  } else {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  }
});

// ─── REALTIME LISTENERS ───────────────────────────────────────────────────────
let listenersActive = false;

function setupListeners() {
  if (listenersActive) return;
  listenersActive = true;

  const evRef = ref(db, 'events');
  const evFn = snap => {
    events = [];
    snap.forEach(child => events.push({ id: child.key, ...child.val() }));
    events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    renderCalendar();
    renderEvents();
    scheduleNotifications(events);
  };
  onValue(evRef, evFn, err => showToast('Errore lettura: ' + err.message));
  activeRefs.push({ r: evRef, fn: evFn });

  // Note (private per utente)
  const notRef = ref(db, `notes/${currentUser.uid}`);
  const notFn = snap => {
    notes = [];
    snap.forEach(child => notes.push({ id: child.key, ...child.val() }));
    notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    renderNotes();
  };
  onValue(notRef, notFn);
  activeRefs.push({ r: notRef, fn: notFn });

  // Spese (condivise)
  const expRef = ref(db, 'expenses');
  const expFn = snap => {
    expenses = [];
    snap.forEach(child => expenses.push({ id: child.key, ...child.val() }));
    expenses.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    renderExpenses();
    updateExpenseSummary();
  };
  onValue(expRef, expFn);
  activeRefs.push({ r: expRef, fn: expFn });
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
const SECTION_TITLES = { calendar: 'Calendario', notes: 'Le mie Note', expenses: 'Spese' };

window.switchSection = (name) => {
  currentSection = name;
  document.querySelectorAll('section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('nav button').forEach(b => b.classList.remove('active'));
  document.getElementById('section-' + name).classList.add('active');
  document.getElementById('nav-' + name).classList.add('active');
  document.getElementById('header-title').textContent = SECTION_TITLES[name];
};

window.openAddModal = () => {
  if (currentSection === 'calendar') openEventModal();
  else if (currentSection === 'notes') openNoteModal();
  else openExpenseModal();
};

// ─── CALENDARIO ───────────────────────────────────────────────────────────────
const MONTHS = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
const DAYS = ['Lu','Ma','Me','Gi','Ve','Sa','Do'];

window.changeMonth = (dir) => {
  calMonth += dir;
  if (calMonth > 11) { calMonth = 0; calYear++; }
  if (calMonth < 0) { calMonth = 11; calYear--; }
  renderCalendar();
};

window.selectDay = (dateStr) => {
  selectedDate = dateStr;
  renderCalendar();
  renderEvents();
};

function renderCalendar() {
  document.getElementById('cal-month-label').textContent = `${MONTHS[calMonth]} ${calYear}`;
  const grid = document.getElementById('cal-grid');
  const today = toDateStr(new Date());

  let html = DAYS.map(d => `<div class="cal-day-name">${d}</div>`).join('');

  const firstDay = new Date(calYear, calMonth, 1);
  const startOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const prevDays = new Date(calYear, calMonth, 0).getDate();

  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevDays - i;
    const ds = `${calYear}-${pad(calMonth)}-${pad(d)}`;
    html += `<div class="cal-day other-month" onclick="selectDay('${ds}')">${d}</div>`;
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${calYear}-${pad(calMonth + 1)}-${pad(d)}`;
    const dayEvents = events.filter(e => ds >= e.date && ds <= (e.dateEnd || e.date));
    const isToday = ds === today;
    const isSelected = ds === selectedDate;
    const inRange = !isToday && !isSelected && events.some(e => e.dateEnd && ds > e.date && ds < e.dateEnd);
    let cls = 'cal-day';
    if (isToday) cls += ' today';
    else if (isSelected) cls += ' selected';
    else if (inRange) cls += ' in-range';
    const dots = dayEvents.slice(0, 3).map(e =>
      `<span class="dot" style="background:${e.color || '#6366f1'}"></span>`).join('');
    html += `<div class="${cls}" onclick="selectDay('${ds}')">${d}<div class="dots">${dots}</div></div>`;
  }

  const totalCells = startOffset + daysInMonth;
  const remainder = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let d = 1; d <= remainder; d++) {
    const ds = `${calYear}-${pad(calMonth + 2)}-${pad(d)}`;
    html += `<div class="cal-day other-month" onclick="selectDay('${ds}')">${d}</div>`;
  }

  grid.innerHTML = html;
  const label = selectedDate === today ? 'Oggi' : formatDateLabel(selectedDate);
  document.getElementById('events-date-label').textContent = label;
  renderEvents();
}

function renderEvents() {
  const container = document.getElementById('events-container');
  const dayEvents = events
    .filter(e => selectedDate >= e.date && selectedDate <= (e.dateEnd || e.date))
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  if (!dayEvents.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📅</div><p>Nessun evento per questo giorno</p></div>`;
    return;
  }
  container.innerHTML = dayEvents.map(e => `
    <div class="event-item" style="border-left-color:${e.color || '#6366f1'}" onclick="openEventModal('${e.id}')">
      <div style="flex:1">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <div class="event-title">${e.title}</div>
          ${e.time ? `<div class="event-time">${e.time}</div>` : ''}
        </div>
        ${e.dateEnd ? `<div class="event-date-range">📅 ${formatDateLabel(e.date)} → ${formatDateLabel(e.dateEnd)}</div>` : ''}
        ${e.description ? `<div class="event-desc">${e.description}</div>` : ''}
        <div class="event-who">${e.createdByName || ''}</div>
      </div>
    </div>`).join('');
}

window.openEventModal = (id = null) => {
  editingEventId = id;
  document.getElementById('modal-event-title').textContent = id ? 'Modifica Evento' : 'Nuovo Evento';
  document.getElementById('delete-event-btn').style.display = id ? 'block' : 'none';

  const picker = document.getElementById('event-color-picker');
  picker.innerHTML = EVENT_COLORS.map(c =>
    `<div class="color-option" style="background:${c}" data-color="${c}" onclick="selectColor(this)"></div>`).join('');

  if (id) {
    const ev = events.find(e => e.id === id);
    if (ev) {
      document.getElementById('event-title-input').value = ev.title;
      document.getElementById('event-date-input').value = ev.date;
      document.getElementById('event-date-end-input').value = ev.dateEnd || '';
      document.getElementById('event-time-input').value = ev.time || '';
      document.getElementById('event-desc-input').value = ev.description || '';
      document.getElementById('event-notify24h').checked = !!ev.notify24h;
      document.getElementById('event-notify12h').checked = !!ev.notify12h;
      picker.querySelector(`[data-color="${ev.color || EVENT_COLORS[0]}"]`)?.classList.add('selected');
    }
  } else {
    document.getElementById('event-title-input').value = '';
    document.getElementById('event-date-input').value = selectedDate;
    document.getElementById('event-date-end-input').value = '';
    document.getElementById('event-time-input').value = '';
    document.getElementById('event-desc-input').value = '';
    document.getElementById('event-notify24h').checked = false;
    document.getElementById('event-notify12h').checked = false;
    picker.querySelector(`[data-color="${EVENT_COLORS[0]}"]`)?.classList.add('selected');
  }
  document.getElementById('modal-event').classList.add('open');
};

window.selectColor = (el) => {
  document.querySelectorAll('.color-option').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
};

window.saveEvent = async () => {
  const title = document.getElementById('event-title-input').value.trim();
  const date = document.getElementById('event-date-input').value;
  const dateEnd = document.getElementById('event-date-end-input').value || null;
  const notify24h = document.getElementById('event-notify24h').checked;
  const notify12h = document.getElementById('event-notify12h').checked;
  if (!title || !date) { showToast('Titolo e data obbligatori'); return; }
  if (dateEnd && dateEnd < date) { showToast('La data fine deve essere dopo la data inizio'); return; }
  if ((notify24h || notify12h) && !document.getElementById('event-time-input').value) {
    showToast('Aggiungi un orario per abilitare le notifiche'); return;
  }
  if (notify24h || notify12h) {
    const granted = await requestNotificationPermission();
    if (!granted) { showToast('Permesso notifiche negato dal browser'); return; }
  }
  const color = document.querySelector('.color-option.selected')?.dataset.color || EVENT_COLORS[0];
  const data = {
    title, date,
    dateEnd,
    time: document.getElementById('event-time-input').value || null,
    description: document.getElementById('event-desc-input').value.trim() || null,
    color,
    notify24h,
    notify12h,
    createdBy: currentUser.uid,
    createdByName: currentUser.displayName,
    updatedAt: Date.now()
  };
  try {
    if (editingEventId) {
      await update(ref(db, `events/${editingEventId}`), data);
    } else {
      await push(ref(db, 'events'), { ...data, createdAt: Date.now() });
    }
    closeModal('modal-event');
    showToast(editingEventId ? 'Evento aggiornato' : 'Evento aggiunto');
  } catch(e) { showToast('Errore: ' + e.message); }
};

window.deleteEvent = async () => {
  if (!editingEventId || !confirm('Eliminare questo evento?')) return;
  await remove(ref(db, `events/${editingEventId}`));
  closeModal('modal-event');
  showToast('Evento eliminato');
};

// ─── NOTIFICHE ────────────────────────────────────────────────────────────────
async function requestNotificationPermission() {
  if (!('Notification' in window)) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}

function scheduleNotifications(evList) {
  notificationTimers.forEach(t => clearTimeout(t));
  notificationTimers = [];
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const now = Date.now();
  evList.forEach(ev => {
    if (!ev.time || (!ev.notify24h && !ev.notify12h)) return;
    const [y, m, d] = ev.date.split('-').map(Number);
    const [h, min] = ev.time.split(':').map(Number);
    const eventTime = new Date(y, m - 1, d, h, min).getTime();
    const schedule = (offset, body) => {
      const delay = eventTime - offset - now;
      if (delay > 0 && delay < 8 * 24 * 3600000) {
        notificationTimers.push(setTimeout(() => {
          new Notification(`📅 ${ev.title}`, { body, icon: '/icons/icon-192.png', tag: `ev-${ev.id}-${offset}` });
        }, delay));
      }
    };
    if (ev.notify24h) schedule(24 * 3600000, `Domani alle ${ev.time}`);
    if (ev.notify12h) schedule(12 * 3600000, `Oggi alle ${ev.time} (tra 12 ore)`);
  });
}

// ─── IMPORT ICS ───────────────────────────────────────────────────────────────
window.importICS = () => document.getElementById('ics-file-input').click();

document.getElementById('ics-file-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  const imported = parseICS(text);
  if (!imported.length) { showToast('Nessun evento trovato nel file'); return; }
  let count = 0;
  for (const ev of imported) {
    try {
      await push(ref(db, 'events'), { ...ev, createdBy: currentUser.uid, createdByName: currentUser.displayName, createdAt: Date.now(), updatedAt: Date.now() });
      count++;
    } catch (_) {}
  }
  showToast(`${count} eventi importati`);
  e.target.value = '';
});

function parseICS(text) {
  const result = [];
  const unfolded = text.replace(/\r?\n[ \t]/g, '');
  const lines = unfolded.split(/\r?\n/);
  let cur = null;
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') { cur = {}; continue; }
    if (line === 'END:VEVENT') {
      if (cur?.title && cur?.date) result.push(cur);
      cur = null; continue;
    }
    if (!cur) continue;
    const ci = line.indexOf(':');
    if (ci === -1) continue;
    const key = line.slice(0, ci).split(';')[0].toUpperCase();
    const val = line.slice(ci + 1);
    if (key === 'SUMMARY') {
      cur.title = val.replace(/\\n/g, ' ').replace(/\\,/g, ',').trim();
    } else if (key === 'DTSTART') {
      cur.date = icsDate(val); cur.time = icsTime(val);
    } else if (key === 'DTEND') {
      let end = icsDate(val);
      if (!val.includes('T')) {
        const d = new Date(end + 'T00:00:00');
        d.setDate(d.getDate() - 1);
        end = toDateStr(d);
      }
      if (end !== cur.date) cur.dateEnd = end;
    } else if (key === 'DESCRIPTION') {
      cur.description = val.replace(/\\n/g, ' ').replace(/\\,/g, ',').trim() || null;
    }
  }
  return result;
}

function icsDate(val) {
  const s = val.split('T')[0].replace(/\D/g, '');
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
}

function icsTime(val) {
  if (!val.includes('T')) return null;
  const t = val.split('T')[1].replace(/\D/g, '');
  return `${t.slice(0,2)}:${t.slice(2,4)}`;
}

// ─── NOTE ─────────────────────────────────────────────────────────────────────
function renderNotes() {
  const container = document.getElementById('notes-container');
  if (!notes.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">📝</div><p>Nessuna nota ancora</p></div>`;
    return;
  }
  container.innerHTML = notes.map(n => `
    <div class="note-item" onclick="openNoteModal('${n.id}')">
      <h3>${n.title}</h3>
      <p>${n.body || ''}</p>
      <div class="note-date">${formatTs(n.updatedAt)}</div>
    </div>`).join('');
}

window.openNoteModal = (id = null) => {
  editingNoteId = id;
  document.getElementById('modal-note-title').textContent = id ? 'Modifica Nota' : 'Nuova Nota';
  document.getElementById('delete-note-btn').style.display = id ? 'block' : 'none';
  if (id) {
    const n = notes.find(n => n.id === id);
    if (n) {
      document.getElementById('note-title-input').value = n.title;
      document.getElementById('note-body-input').value = n.body || '';
    }
  } else {
    document.getElementById('note-title-input').value = '';
    document.getElementById('note-body-input').value = '';
  }
  document.getElementById('modal-note').classList.add('open');
};

window.saveNote = async () => {
  const title = document.getElementById('note-title-input').value.trim();
  if (!title) { showToast('Titolo obbligatorio'); return; }
  const data = { title, body: document.getElementById('note-body-input').value.trim(), updatedAt: Date.now() };
  try {
    if (editingNoteId) {
      await update(ref(db, `notes/${currentUser.uid}/${editingNoteId}`), data);
    } else {
      await push(ref(db, `notes/${currentUser.uid}`), { ...data, createdAt: Date.now() });
    }
    closeModal('modal-note');
    showToast(editingNoteId ? 'Nota aggiornata' : 'Nota salvata');
  } catch(e) { showToast('Errore: ' + e.message); }
};

window.deleteNote = async () => {
  if (!editingNoteId || !confirm('Eliminare questa nota?')) return;
  await remove(ref(db, `notes/${currentUser.uid}/${editingNoteId}`));
  closeModal('modal-note');
  showToast('Nota eliminata');
};

// ─── SPESE ────────────────────────────────────────────────────────────────────
window.filterExpenses = (f, el) => {
  expenseFilter = f;
  document.querySelectorAll('.expense-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  renderExpenses();
};

function renderExpenses() {
  let filtered = expenses;
  if (expenseFilter === 'recurring') filtered = expenses.filter(e => e.type === 'recurring');
  if (expenseFilter === 'one-time') filtered = expenses.filter(e => e.type === 'one-time');

  const container = document.getElementById('expenses-container');
  if (!filtered.length) {
    container.innerHTML = `<div class="empty-state"><div class="icon">💰</div><p>Nessuna spesa</p></div>`;
    return;
  }
  container.innerHTML = filtered.map(e => `
    <div class="expense-item" onclick="openExpenseModal('${e.id}')">
      <div class="expense-left">
        <div class="expense-icon">${CATEGORY_ICONS[e.category] || '📦'}</div>
        <div>
          <div class="expense-name">${e.name}</div>
          <div class="expense-meta">
            ${e.date} &nbsp;
            ${e.type === 'recurring' ? '<span class="badge badge-recurring">Ricorrente</span>' : ''}
            ${e.shared ? '<span class="badge badge-shared">Condivisa</span>' : ''}
          </div>
        </div>
      </div>
      <div class="expense-amount out">-€${parseFloat(e.amount).toFixed(2)}</div>
    </div>`).join('');
}

function updateExpenseSummary() {
  const now = new Date();
  const monthStr = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const total = expenses
    .filter(e => e.date && e.date.startsWith(monthStr))
    .reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);
  document.getElementById('expenses-total').textContent = `€${total.toFixed(2)}`;
  document.getElementById('expenses-month-label').textContent = `${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

window.openExpenseModal = (id = null) => {
  editingExpenseId = id;
  document.getElementById('modal-expense-title').textContent = id ? 'Modifica Spesa' : 'Nuova Spesa';
  document.getElementById('delete-expense-btn').style.display = id ? 'block' : 'none';
  if (id) {
    const e = expenses.find(e => e.id === id);
    if (e) {
      document.getElementById('expense-name-input').value = e.name;
      document.getElementById('expense-amount-input').value = e.amount;
      document.getElementById('expense-category-input').value = e.category;
      document.getElementById('expense-type-input').value = e.type;
      document.getElementById('expense-date-input').value = e.date;
      document.getElementById('expense-shared-input').value = String(e.shared);
    }
  } else {
    document.getElementById('expense-name-input').value = '';
    document.getElementById('expense-amount-input').value = '';
    document.getElementById('expense-category-input').value = 'altro';
    document.getElementById('expense-type-input').value = 'one-time';
    document.getElementById('expense-date-input').value = toDateStr(new Date());
    document.getElementById('expense-shared-input').value = 'true';
  }
  document.getElementById('modal-expense').classList.add('open');
};

window.saveExpense = async () => {
  const name = document.getElementById('expense-name-input').value.trim();
  const amount = document.getElementById('expense-amount-input').value;
  const date = document.getElementById('expense-date-input').value;
  if (!name || !amount || !date) { showToast('Nome, importo e data obbligatori'); return; }
  const data = {
    name, amount: parseFloat(amount),
    category: document.getElementById('expense-category-input').value,
    type: document.getElementById('expense-type-input').value,
    date,
    shared: document.getElementById('expense-shared-input').value === 'true',
    createdBy: currentUser.uid,
    createdByName: currentUser.displayName,
    updatedAt: Date.now()
  };
  try {
    if (editingExpenseId) {
      await update(ref(db, `expenses/${editingExpenseId}`), data);
    } else {
      await push(ref(db, 'expenses'), { ...data, createdAt: Date.now() });
    }
    closeModal('modal-expense');
    showToast(editingExpenseId ? 'Spesa aggiornata' : 'Spesa aggiunta');
  } catch(e) { showToast('Errore: ' + e.message); }
};

window.deleteExpense = async () => {
  if (!editingExpenseId || !confirm('Eliminare questa spesa?')) return;
  await remove(ref(db, `expenses/${editingExpenseId}`));
  closeModal('modal-expense');
  showToast('Spesa eliminata');
};

// ─── PROFILO ──────────────────────────────────────────────────────────────────
window.openProfile = () => {
  if (!currentUser) return;
  document.getElementById('profile-avatar-large').src = currentUser.photoURL || '';
  document.getElementById('profile-name').textContent = currentUser.displayName || '';
  document.getElementById('profile-email').textContent = currentUser.email || '';
  document.getElementById('modal-profile').classList.add('open');
};

// ─── MODAL HELPERS ────────────────────────────────────────────────────────────
window.closeModal = (id) => document.getElementById(id).classList.remove('open');

document.querySelectorAll('.modal-backdrop').forEach(b => {
  b.addEventListener('click', e => { if (e.target === b) b.classList.remove('open'); });
});

// ─── UTILS ────────────────────────────────────────────────────────────────────
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function pad(n) { return String(n).padStart(2, '0'); }
function formatDateLabel(ds) {
  const [y,m,d] = ds.split('-');
  return `${parseInt(d)} ${MONTHS[parseInt(m)-1]} ${y}`;
}
function formatTs(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${pad(d.getDate())}/${pad(d.getMonth()+1)}/${d.getFullYear()}`;
}

window.showToast = (msg) => {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 2500);
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
