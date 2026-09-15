const API_BASE = '/api';

let token = localStorage.getItem('quicktrack_token') || localStorage.getItem('ledger_token') || null;
let profile = null;
let calCursor = new Date();
let calSelected = todayStr();
let weekChart = null;
let dietChart = null;
const smartChoiceHistory = [];
let smartChoiceUserId = null;
const smartChoiceWelcome = 'Hi, I’m SmartChoice. Ask me about your meals, workouts, calorie balance, or how to make your next choice fit your goal.';

function resetSmartChoice() {
  smartChoiceHistory.length = 0;
  smartChoiceUserId = null;
  const messages = document.getElementById('chat-messages');
  if (messages) {
    messages.innerHTML = '';
    addChatMessage('assistant', smartChoiceWelcome);
  }
}

function todayStr(d) {
  const dt = d || new Date();
  return dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
}

function showToast(message, isError) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.className = 'toast show' + (isError ? ' error' : '');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => { el.className = 'toast'; }, 2600);
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

/* ---------------- API helper ---------------- */
async function api(path, options = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, options.headers || {});
  if (token) headers['Authorization'] = 'Bearer ' + token;

  const res = await fetch(API_BASE + path, Object.assign({}, options, { headers }));
  let data = null;
  try { data = await res.json(); } catch (e) { /* no body */ }

  if (!res.ok) {
    if (res.status === 401) logout(false);
    const message = (data && data.error) || 'Something went wrong.';
    throw new Error(message);
  }
  return data;
}

/* ---------------- auth screen toggling ---------------- */
document.getElementById('show-register').onclick = () => {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
};
document.getElementById('show-login').onclick = () => {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
};
document.querySelectorAll('[data-google-auth]').forEach(btn => {
  btn.addEventListener('click', () => { window.location.href = API_BASE + '/auth/google'; });
});
document.querySelectorAll('.goal-opt').forEach(opt => {
  opt.addEventListener('click', () => {
    document.querySelectorAll('.goal-opt').forEach(o => o.classList.remove('checked'));
    opt.classList.add('checked');
    opt.querySelector('input').checked = true;
  });
});

/* ---------------- register ---------------- */
document.getElementById('register-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('register-error');
  const successBox = document.getElementById('register-success');
  errBox.style.display = 'none';
  successBox.style.display = 'none';
  const btn = document.getElementById('register-submit');

  const payload = {
    name: document.getElementById('reg-name').value.trim(),
    email: document.getElementById('reg-email').value.trim(),
    username: document.getElementById('reg-username').value.trim(),
    password: document.getElementById('reg-password').value,
  };

  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const data = await api('/auth/register', { method: 'POST', body: JSON.stringify(payload) });
    e.target.reset();
    successBox.textContent = data.message;
    successBox.style.display = 'block';
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Create account';
  }
});

document.getElementById('google-profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('google-profile-error');
  const goalInput = document.querySelector('input[name="google-goal"]:checked');
  errorBox.style.display = 'none';
  if (!goalInput) {
    errorBox.textContent = 'Pick a fitness goal to continue.';
    errorBox.style.display = 'block';
    return;
  }
  const btn = document.getElementById('google-profile-submit');
  btn.disabled = true;
  btn.textContent = 'Creating account…';
  try {
    const data = await api('/auth/google/register', {
      method: 'POST',
      body: JSON.stringify({
        pendingToken: window.googlePendingToken,
        name: document.getElementById('google-profile-name').value.trim(),
        username: document.getElementById('google-profile-username').value.trim(),
        age: Number(document.getElementById('google-profile-age').value),
        height: Number(document.getElementById('google-profile-height').value),
        weight: Number(document.getElementById('google-profile-weight').value),
        meds: document.getElementById('google-profile-meds').value.trim(),
        goal: goalInput.value,
      }),
    });
    token = data.token;
    profile = data.user;
    localStorage.setItem('quicktrack_token', token);
    localStorage.removeItem('ledger_token');
    document.getElementById('google-profile-modal').hidden = true;
    window.googlePendingToken = null;
    await enterApp();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Finish registration';
  }
});

/* ---------------- login ---------------- */
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errBox = document.getElementById('login-error');
  errBox.style.display = 'none';
  const btn = document.getElementById('login-submit');

  const payload = {
    username: document.getElementById('login-username').value.trim(),
    password: document.getElementById('login-password').value,
  };

  btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(payload) });
    token = data.token;
    profile = data.user;
    localStorage.setItem('quicktrack_token', token);
    localStorage.removeItem('ledger_token');
    enterApp();
  } catch (err) {
    errBox.textContent = err.message;
    errBox.style.display = 'block';
  } finally {
    btn.disabled = false; btn.textContent = 'Log in';
  }
});

/* ---------------- logout ---------------- */
function logout(showScreen = true) {
  token = null; profile = null;
  resetSmartChoice();
  localStorage.removeItem('quicktrack_token');
  localStorage.removeItem('ledger_token');
  if (showScreen) {
    document.getElementById('app-screen').style.display = 'none';
    document.getElementById('auth-screen').style.display = 'grid';
    document.getElementById('login-form').reset();
  }
}
document.getElementById('logout-btn').addEventListener('click', () => logout(true));

/* ---------------- nav ---------------- */
document.querySelectorAll('.nav-item[data-view]').forEach(item => {
  item.addEventListener('click', () => {
    document.querySelectorAll('.nav-item[data-view]').forEach(i => i.classList.remove('active'));
    item.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + item.dataset.view).classList.add('active');
    if (item.dataset.view === 'calendar') renderCalendar();
    if (item.dataset.view === 'diet') renderDietView();
    if (item.dataset.view === 'devices') renderDevices();
    if (item.dataset.view === 'profile') renderProfile();
    if (item.dataset.view === 'smartchoice') document.getElementById('chat-input').focus();
  });
});

/* ---------------- entering the app ---------------- */
async function enterApp() {
  if (smartChoiceUserId && smartChoiceUserId !== profile.id) resetSmartChoice();
  smartChoiceUserId = profile.id;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app-screen').style.display = 'grid';
  document.getElementById('greeting').textContent = 'Hello, ' + profile.name.split(' ')[0];
  document.getElementById('today-pill').textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  await renderDashboard();
}

/* ---------------- dashboard ---------------- */
async function renderDashboard() {
  try {
    const t = todayStr();
    const [day, targetRes] = await Promise.all([
      api('/logs/day/' + t),
      api('/logs/target'),
    ]);

    const target = targetRes.target;
    const net = day.consumed - day.burned;

    document.getElementById('stat-consumed').textContent = day.consumed;
    document.getElementById('stat-burned').textContent = day.burned;
    document.getElementById('stat-net').textContent = net;
    document.getElementById('stat-target').textContent = target;

    const diff = target - net;
    document.getElementById('stat-net-sub').textContent = diff >= 0 ? diff + ' kcal under target' : Math.abs(diff) + ' kcal over target';

    const goalLabel = { lose: 'to lose weight', gain: 'to gain weight', muscle: 'to build muscle' }[profile.goal];
    document.getElementById('stat-target-sub').textContent = 'estimated ' + goalLabel;

    document.getElementById('food-count').textContent = day.food.length + ' entries';
    document.getElementById('workout-count').textContent = day.workout.length + ' entries';

    renderEntryList('food-list', day.food);
    renderEntryList('workout-list', day.workout);

    await renderWeekChart();
  } catch (err) {
    showToast(err.message, true);
  }
}

function renderEntryList(elId, entries) {
  const el = document.getElementById(elId);
  el.innerHTML = '';
  if (entries.length === 0) {
    el.innerHTML = '<div class="empty-note">Nothing logged yet today.</div>';
    return;
  }
  entries.forEach(entry => {
    const li = document.createElement('li');
    const macroText = entry.type === 'food' && entry.protein != null
      ? ` · ${entry.protein}g P · ${entry.carbs}g C · ${entry.fat}g F · ${entry.fiber}g fiber`
      : '';
    li.innerHTML = `<span class="e-name">${escapeHtml(entry.name)}<small>${macroText}</small></span>
      <span class="e-cal mono">${entry.cal} kcal <span class="remove" data-id="${entry.id}">remove</span></span>`;
    el.appendChild(li);
  });
  el.querySelectorAll('.remove').forEach(btn => {
    btn.addEventListener('click', async () => {
      try {
        await api('/logs/entry/' + btn.dataset.id, { method: 'DELETE' });
        await renderDashboard();
        if (document.getElementById('view-calendar').classList.contains('active')) renderCalendar();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  });
}

document.getElementById('food-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('food-name').value.trim();
  const cal = document.getElementById('food-cal').value;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = cal ? 'Adding…' : 'Estimating…';
  try {
    await api('/logs/entry', { method: 'POST', body: JSON.stringify({ date: todayStr(), type: 'food', name, cal }) });
    e.target.reset();
    await renderDashboard();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add meal';
  }
});

document.getElementById('workout-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('workout-name').value.trim();
  const cal = document.getElementById('workout-cal').value;
  const btn = e.target.querySelector('button');
  btn.disabled = true;
  btn.textContent = cal ? 'Adding…' : 'Estimating…';
  try {
    await api('/logs/entry', { method: 'POST', body: JSON.stringify({ date: todayStr(), type: 'workout', name, cal }) });
    e.target.reset();
    await renderDashboard();
  } catch (err) {
    showToast(err.message, true);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add workout';
  }
});

async function renderDietView() {
  try {
    const [{ food }, { supplements }] = await Promise.all([api('/logs/day/' + todayStr()), api('/supplements')]);
    const totals = food.reduce((sum, entry) => ({
      protein: sum.protein + Number(entry.protein || 0), carbs: sum.carbs + Number(entry.carbs || 0),
      fat: sum.fat + Number(entry.fat || 0), fiber: sum.fiber + Number(entry.fiber || 0),
    }), { protein: 0, carbs: 0, fat: 0, fiber: 0 });
    Object.entries(totals).forEach(([key, value]) => { document.getElementById('macro-' + key).textContent = Math.round(value * 10) / 10 + ' g'; });
    renderDietChart(food);
    renderSupplementList(supplements);
  } catch (err) { showToast(err.message, true); }
}

function renderDietChart(food) {
  document.getElementById('diet-empty').hidden = food.length > 0;
  const ctx = document.getElementById('diet-chart').getContext('2d');
  if (dietChart) dietChart.destroy();
  dietChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: food.map((entry, index) => entry.name.length > 18 ? entry.name.slice(0, 18) + '…' : entry.name || 'Meal ' + (index + 1)),
      datasets: [
        { label: 'Protein', data: food.map(entry => entry.protein || 0), borderColor: '#2F5233', backgroundColor: '#2F5233', tension: 0.3 },
        { label: 'Carbs', data: food.map(entry => entry.carbs || 0), borderColor: '#B9832B', backgroundColor: '#B9832B', tension: 0.3 },
        { label: 'Fat', data: food.map(entry => entry.fat || 0), borderColor: '#B45F58', backgroundColor: '#B45F58', tension: 0.3 },
        { label: 'Fiber', data: food.map(entry => entry.fiber || 0), borderColor: '#567A91', backgroundColor: '#567A91', tension: 0.3 },
      ],
    },
    options: { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom' } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, title: { display: true, text: 'grams' } } } },
  });
}

function renderSupplementList(supplements) {
  const list = document.getElementById('supplement-list');
  list.innerHTML = '';
  if (!supplements.length) { list.innerHTML = '<div class="empty-note">No ongoing supplements added yet.</div>'; return; }
  supplements.forEach(supplement => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="e-name"><strong>${escapeHtml(supplement.name)}</strong><br><small>${escapeHtml(supplement.dose)}</small></span><span class="e-cal">${supplement.protein}g protein <span class="remove" data-id="${supplement.id}">remove</span></span>`;
    list.appendChild(li);
  });
  list.querySelectorAll('.remove').forEach(button => button.addEventListener('click', async () => {
    try { await api('/supplements/' + button.dataset.id, { method: 'DELETE' }); await renderDietView(); } catch (err) { showToast(err.message, true); }
  }));
}

document.getElementById('supplement-form').addEventListener('submit', async e => {
  e.preventDefault();
  const button = e.target.querySelector('button'); button.disabled = true; button.textContent = 'Estimating…';
  try {
    await api('/supplements', { method: 'POST', body: JSON.stringify({ name: document.getElementById('supplement-name').value.trim(), dose: document.getElementById('supplement-dose').value.trim() }) });
    e.target.reset(); await renderDietView();
  } catch (err) { showToast(err.message, true); } finally { button.disabled = false; button.textContent = 'Add supplement'; }
});

/* ---------------- weekly chart ---------------- */
async function renderWeekChart() {
  const { days } = await api('/logs/week');
  const labels = days.map(d => new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short' }));
  const consumedArr = days.map(d => d.consumed);
  const burnedArr = days.map(d => d.burned);

  const ctx = document.getElementById('week-chart').getContext('2d');
  if (weekChart) weekChart.destroy();
  weekChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Consumed', data: consumedArr, backgroundColor: '#B9832B', borderRadius: 3 },
        { label: 'Burned', data: burnedArr, backgroundColor: '#2F5233', borderRadius: 3 },
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { font: { family: 'Inter', size: 12 }, usePointStyle: true } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { family: 'IBM Plex Mono', size: 11 } } },
        y: { grid: { color: '#DCE0D6' }, ticks: { font: { family: 'IBM Plex Mono', size: 11 } } },
      },
    },
  });
}

/* ---------------- calendar ---------------- */
async function renderCalendar() {
  const year = calCursor.getFullYear();
  const month = calCursor.getMonth();
  document.getElementById('cal-title').textContent = calCursor.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  const dowRow = document.getElementById('cal-dow-row');
  dowRow.innerHTML = '';
  ['S', 'M', 'T', 'W', 'T', 'F', 'S'].forEach(d => {
    const el = document.createElement('div');
    el.className = 'cal-dow'; el.textContent = d;
    dowRow.appendChild(el);
  });

  let monthData = { days: [] };
  let target = 0;
  try {
    const [monthRes, targetRes] = await Promise.all([
      api(`/logs/month/${year}/${month + 1}`),
      api('/logs/target'),
    ]);
    monthData = monthRes;
    target = targetRes.target;
  } catch (err) {
    showToast(err.message, true);
  }
  const byDate = {};
  monthData.days.forEach(d => { byDate[d.date] = d; });

  const grid = document.getElementById('cal-grid');
  grid.innerHTML = '';
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstDay; i++) {
    const el = document.createElement('div');
    el.className = 'cal-day empty';
    grid.appendChild(el);
  }
  for (let d = 1; d <= daysInMonth; d++) {
    const dateObj = new Date(year, month, d);
    const ds = todayStr(dateObj);
    const day = byDate[ds];
    const el = document.createElement('div');
    el.className = 'cal-day';
    if (ds === todayStr()) el.classList.add('today');
    if (ds === calSelected) el.classList.add('selected');

    if (day) {
      const net = day.consumed - day.burned;
      el.classList.add(net <= target ? 'under' : 'over');
    } else {
      el.classList.add('nodata');
    }
    el.innerHTML = `<span class="d-num">${d}</span><span class="d-dot"></span>`;
    el.addEventListener('click', () => {
      calSelected = ds;
      renderCalendar();
    });
    grid.appendChild(el);
  }
  await renderCalDetail(calSelected);
}

async function renderCalDetail(ds) {
  let day = { food: [], workout: [], consumed: 0, burned: 0 };
  try {
    day = await api('/logs/day/' + ds);
  } catch (err) {
    showToast(err.message, true);
  }
  const detail = document.getElementById('cal-detail');
  const dateLabel = new Date(ds + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  detail.innerHTML = `
    <div class="dd-title">${dateLabel}</div>
    <div class="dd-row"><span>Meals logged</span><span class="mono">${day.food.length}</span></div>
    <div class="dd-row"><span>Consumed</span><span class="mono">${day.consumed} kcal</span></div>
    <div class="dd-row"><span>Workouts logged</span><span class="mono">${day.workout.length}</span></div>
    <div class="dd-row"><span>Burned</span><span class="mono">${day.burned} kcal</span></div>
    <div class="dd-row"><span>Net</span><span class="mono">${day.consumed - day.burned} kcal</span></div>
  `;
}

document.getElementById('cal-prev').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() - 1);
  renderCalendar();
});
document.getElementById('cal-next').addEventListener('click', () => {
  calCursor.setMonth(calCursor.getMonth() + 1);
  renderCalendar();
});

/* ---------------- devices ---------------- */
async function renderDevices() {
  try {
    const { devices } = await api('/devices');
    updateDeviceUI('google', devices.google);
    updateDeviceUI('strava', devices.strava);
  } catch (err) {
    showToast(err.message, true);
  }
}
function updateDeviceUI(key, connected) {
  const chip = document.getElementById(key + '-status');
  const btn = document.getElementById(key + '-connect-btn');
  chip.textContent = connected ? 'Connected' : 'Not connected';
  chip.className = 'status-chip ' + (connected ? 'on' : 'off');
  btn.textContent = connected ? 'Disconnect' : ('Connect ' + (key === 'google' ? 'Google Health' : 'Strava'));
  btn.className = connected ? 'btn-disconnect' : 'btn-connect';
}
async function toggleDevice(key) {
  try {
    const { devices } = await api('/devices/' + key + '/toggle', { method: 'POST' });
    updateDeviceUI(key, devices[key]);
  } catch (err) {
    showToast(err.message, true);
  }
}
document.getElementById('google-connect-btn').addEventListener('click', () => toggleDevice('google'));
document.getElementById('strava-connect-btn').addEventListener('click', () => toggleDevice('strava'));

/* ---------------- profile ---------------- */
async function renderProfile() {
  try {
    const { user } = await api('/auth/me');
    profile = user;
    document.getElementById('profile-name').value = profile.name || '';
    document.getElementById('profile-email').value = profile.email || 'Not provided';
    document.getElementById('profile-username').value = profile.username || '';
    document.getElementById('profile-age').value = profile.age || '';
    document.getElementById('profile-height').value = profile.height || '';
    document.getElementById('profile-weight').value = profile.weight || '';
    document.getElementById('profile-meds').value = profile.meds || '';
    document.getElementById('profile-goal').value = profile.goal || 'muscle';
  } catch (err) {
    showToast(err.message, true);
  }
}

document.getElementById('profile-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const errorBox = document.getElementById('profile-error');
  const successBox = document.getElementById('profile-success');
  const button = document.getElementById('profile-save');
  errorBox.style.display = 'none';
  successBox.style.display = 'none';
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const data = await api('/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({
        name: document.getElementById('profile-name').value.trim(),
        age: Number(document.getElementById('profile-age').value),
        height: Number(document.getElementById('profile-height').value),
        weight: Number(document.getElementById('profile-weight').value),
        meds: document.getElementById('profile-meds').value.trim(),
        goal: document.getElementById('profile-goal').value,
      }),
    });
    profile = data.user;
    document.getElementById('greeting').textContent = 'Hello, ' + profile.name.split(' ')[0];
    successBox.textContent = 'Profile updated.';
    successBox.style.display = 'block';
    await renderDashboard();
  } catch (err) {
    errorBox.textContent = err.message;
    errorBox.style.display = 'block';
  } finally {
    button.disabled = false;
    button.textContent = 'Save changes';
  }
});

function addChatMessage(role, text) {
  const message = document.createElement('div');
  message.className = 'chat-message ' + role;
  message.textContent = text;
  document.getElementById('chat-messages').appendChild(message);
  message.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

document.getElementById('chat-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const input = document.getElementById('chat-input');
  const button = document.getElementById('chat-send');
  const message = input.value.trim();
  if (!message) return;
  addChatMessage('user', message);
  smartChoiceHistory.push({ role: 'user', text: message });
  input.value = '';
  input.disabled = true;
  button.disabled = true;
  button.textContent = 'Thinking…';
  try {
    const data = await api('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history: smartChoiceHistory.slice(-10) }),
    });
    addChatMessage('assistant', data.reply);
    smartChoiceHistory.push({ role: 'assistant', text: data.reply });
  } catch (err) {
    addChatMessage('assistant', 'I could not answer that right now: ' + err.message);
  } finally {
    input.disabled = false;
    button.disabled = false;
    button.textContent = 'Send';
    input.focus();
  }
});

/* ---------------- resume session on load ---------------- */
(async function init() {
  const params = new URLSearchParams(window.location.search);
  const googleToken = params.get('google_token');
  const googlePending = params.get('google_pending');
  const googleError = params.get('google_error');
  const verified = params.get('verified');
  if (googleToken) {
    token = googleToken;
    localStorage.setItem('quicktrack_token', token);
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  if (googlePending) {
    try {
      const payload = JSON.parse(atob(googlePending.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      window.googlePendingToken = googlePending;
      document.getElementById('google-profile-name').value = payload.name || '';
      document.getElementById('google-profile-email').value = payload.email || '';
      document.getElementById('google-profile-username').value = (payload.email || '').split('@')[0].replace(/[^a-zA-Z0-9_]/g, '').slice(0, 24);
      document.getElementById('google-profile-modal').hidden = false;
    } catch (err) {
      document.getElementById('login-error').textContent = 'Google registration session is invalid.';
      document.getElementById('login-error').style.display = 'block';
    }
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  if (googleError) {
    document.getElementById('login-error').textContent = googleError;
    document.getElementById('login-error').style.display = 'block';
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  if (verified) {
    document.getElementById('login-success').textContent = 'Email verified. You can now log in.';
    document.getElementById('login-success').style.display = 'block';
    window.history.replaceState({}, document.title, window.location.pathname);
  }
  if (!token) return;
  try {
    const { user } = await api('/auth/me');
    profile = user;
    await enterApp();
  } catch (err) {
    logout(false);
  }
})();
