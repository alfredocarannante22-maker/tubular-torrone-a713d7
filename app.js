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
  await fbSignOut(auth);
};

onAuthStateChanged(auth, user => {
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
function setupListeners() {
  // Eventi (condivisi tra tutti gli utenti autenticati)
  const evRef = ref(db, 'events');
  const evFn = snap => {
    events = [];
    snap.forEach(child => events.push({ id: child.key, ...child.val() }));
    events.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    renderCalendar();
    renderEvents();
  };
  onValue(evRef, evFn);
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
    const dayEvents = events.filter(e => e.date === ds);
    const isToday = ds === today;
    const isSelected = ds === selectedDate;
    let cls = 'cal-day';
    if (isToday) cls += ' today';
    else if (isSelected) cls += ' selected';
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
  const dayEvents = events.filter(e => e.date === selectedDate)
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
      document.getElementById('event-time-input').value = ev.time || '';
      document.getElementById('event-desc-input').value = ev.description || '';
      picker.querySelector(`[data-color="${ev.color || EVENT_COLORS[0]}"]`)?.classList.add('selected');
    }
  } else {
    document.getElementById('event-title-input').value = '';
    document.getElementById('event-date-input').value = selectedDate;
    document.getElementById('event-time-input').value = '';
    document.getElementById('event-desc-input').value = '';
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
  if (!title || !date) { showToast('Titolo e data obbligatori'); return; }
  const color = document.querySelector('.color-option.selected')?.dataset.color || EVENT_COLORS[0];
  const data = {
    title, date,
    time: document.getElementById('event-time-input').value || null,
    description: document.getElementById('event-desc-input').value.trim() || null,
    color,
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
