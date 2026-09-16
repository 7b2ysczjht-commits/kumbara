const DENOMINATIONS = [
  { id: '25k', label: '25 kuruş', value: 0.25 },
  { id: '50k', label: '50 kuruş', value: 0.5 },
  { id: '1', label: '1 TL', value: 1 },
  { id: '5', label: '5 TL', value: 5 },
  { id: '10', label: '10 TL', value: 10 },
  { id: '20', label: '20 TL', value: 20 },
  { id: '50', label: '50 TL', value: 50 },
  { id: '100', label: '100 TL', value: 100 },
  { id: '200', label: '200 TL', value: 200 },
];

const STORAGE = {
  counts: 'kumbara.v2.counts',
  transactions: 'kumbara.v2.transactions',
  goal: 'kumbara.v2.goal',
  banks: 'kumbara.v2.banks',
  activeBankId: 'kumbara.v2.activeBankId',
  legacyCounts: 'kumbaraC',
  legacyHistory: 'kumbaraH',
};

const MAX_TRANSACTIONS = 500;
const RECENT_HISTORY_COUNT = 10;
const denominationById = new Map(DENOMINATIONS.map((item) => [item.id, item]));

function money(value) {
  return `₺${value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function signedMoney(value) {
  return `${value < 0 ? '−' : ''}${money(Math.abs(value))}`;
}

function parseStoredValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function sanitiseCounts(saved) {
  const validCounts = {};

  for (const { id } of DENOMINATIONS) {
    const count = Number(saved?.[id]);
    if (Number.isInteger(count) && count > 0) validCounts[id] = count;
  }

  return validCounts;
}

function normaliseTransaction(item) {
  if (Array.isArray(item)) {
    const [denominationId, change] = item;
    const quantity = Math.abs(Number(change));
    if (!denominationById.has(denominationId) || !Number.isInteger(quantity) || quantity < 1) return null;
    return {
      id: crypto.randomUUID(),
      denominationId,
      quantity,
      type: change < 0 ? 'remove' : 'add',
      createdAt: null,
    };
  }

  if (!item || !denominationById.has(item.denominationId)) return null;
  if (!Number.isInteger(item.quantity) || item.quantity < 1) return null;
  if (!['add', 'remove'].includes(item.type)) return null;

  return {
    id: typeof item.id === 'string' ? item.id : crypto.randomUUID(),
    denominationId: item.denominationId,
    quantity: item.quantity,
    type: item.type,
    createdAt: typeof item.createdAt === 'string' ? item.createdAt : null,
  };
}

function sanitiseTransactions(saved) {
  if (!Array.isArray(saved)) return [];
  return saved.map(normaliseTransaction).filter(Boolean).slice(0, MAX_TRANSACTIONS);
}

function sanitiseGoal(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function makeBank(name, bankCounts = {}, bankTransactions = [], bankGoal = null) {
  return {
    id: crypto.randomUUID(),
    name: (name && name.trim()) || 'Kumbaram',
    counts: bankCounts,
    transactions: bankTransactions,
    goal: bankGoal,
  };
}

function sanitiseBank(saved) {
  return {
    id: typeof saved?.id === 'string' ? saved.id : crypto.randomUUID(),
    name: (typeof saved?.name === 'string' && saved.name.trim()) || 'Kumbaram',
    counts: sanitiseCounts(saved?.counts),
    transactions: sanitiseTransactions(saved?.transactions),
    goal: sanitiseGoal(saved?.goal),
  };
}

function loadBanksAndActive() {
  const savedBanks = parseStoredValue(STORAGE.banks, null);
  if (Array.isArray(savedBanks) && savedBanks.length) {
    const sanitisedBanks = savedBanks.map(sanitiseBank);
    const savedActiveId = parseStoredValue(STORAGE.activeBankId, null);
    const activeBankId = sanitisedBanks.some((bank) => bank.id === savedActiveId)
      ? savedActiveId
      : sanitisedBanks[0].id;
    return { banks: sanitisedBanks, activeBankId };
  }

  const legacyCounts = sanitiseCounts(
    parseStoredValue(STORAGE.counts, null) ?? parseStoredValue(STORAGE.legacyCounts, {}),
  );
  const legacyTransactions = sanitiseTransactions(
    parseStoredValue(STORAGE.transactions, null) ?? parseStoredValue(STORAGE.legacyHistory, []),
  );
  const legacyGoal = sanitiseGoal(parseStoredValue(STORAGE.goal, null));
  const bank = makeBank('Kumbaram', legacyCounts, legacyTransactions, legacyGoal);
  return { banks: [bank], activeBankId: bank.id };
}

let { banks, activeBankId } = loadBanksAndActive();

function getActiveBank() {
  return banks.find((bank) => bank.id === activeBankId) ?? banks[0];
}

function syncActiveBankState() {
  const bank = getActiveBank();
  bank.counts = counts;
  bank.transactions = transactions;
  bank.goal = goal;
}

let counts = getActiveBank().counts;
let transactions = getActiveBank().transactions;
let goal = getActiveBank().goal;

function save() {
  syncActiveBankState();
  try {
    localStorage.setItem(STORAGE.banks, JSON.stringify(banks));
    localStorage.setItem(STORAGE.activeBankId, JSON.stringify(activeBankId));
  } catch {
    // The current session continues even when browser storage is unavailable.
  }
  pushToCloud();
}

function loadActiveBankState() {
  const bank = getActiveBank();
  counts = bank.counts;
  transactions = bank.transactions;
  goal = bank.goal;
}

function updateActiveBankLabel() {
  const label = document.getElementById('active-bank-name');
  if (label) label.textContent = getActiveBank().name;
}

function switchBank(id) {
  syncActiveBankState();
  activeBankId = id;
  loadActiveBankState();
  save();
  draw();
  updateActiveBankLabel();
}

function createBank(name) {
  syncActiveBankState();
  const bank = makeBank(name || `Kumbara ${banks.length + 1}`);
  banks.push(bank);
  switchBank(bank.id);
}

function deleteBank(id) {
  if (banks.length <= 1) return;
  const wasActive = id === activeBankId;
  banks = banks.filter((bank) => bank.id !== id);
  if (wasActive) {
    activeBankId = banks[0].id;
    loadActiveBankState();
  }
  save();
  draw();
  updateActiveBankLabel();
}

function renameBank(id, name) {
  const bank = banks.find((item) => item.id === id);
  if (!bank || !name.trim()) return;
  bank.name = name.trim();
  save();
  updateActiveBankLabel();
}

function updateCount(denominationId, change) {
  const current = counts[denominationId] ?? 0;
  const next = current + change;
  if (!Number.isInteger(next) || next < 0) return false;

  if (next === 0) delete counts[denominationId];
  else counts[denominationId] = next;
  return true;
}

function addTransaction(denominationId, quantity, type) {
  transactions.unshift({
    id: crypto.randomUUID(),
    denominationId,
    quantity,
    type,
    createdAt: new Date().toISOString(),
  });
  transactions = transactions.slice(0, MAX_TRANSACTIONS);
}

function bumpTotal() {
  const el = document.querySelector('.total');
  el.classList.remove('bump');
  void el.offsetWidth;
  el.classList.add('bump');
}

function change(denominationId, quantity) {
  const type = quantity > 0 ? 'add' : 'remove';
  if (!updateCount(denominationId, quantity)) return;

  addTransaction(denominationId, Math.abs(quantity), type);
  save();
  draw();
  bumpTotal();
}

function bulkAdd(denominationId) {
  const input = document.getElementById(`quantity-${denominationId}`);
  const quantity = Math.floor(Number(input?.value));
  if (!Number.isInteger(quantity) || quantity < 1) {
    input?.focus();
    return;
  }

  change(denominationId, quantity);
  input.value = '1';
}

function reverseTransaction(index) {
  const transaction = transactions[index];
  if (!transaction) return false;

  const delta = transaction.type === 'add' ? -transaction.quantity : transaction.quantity;
  if (!updateCount(transaction.denominationId, delta)) return false;

  transactions.splice(index, 1);
  return true;
}

function undo() {
  if (!reverseTransaction(0)) return;
  save();
  draw();
  bumpTotal();
}

function undoTransaction(id) {
  const index = transactions.findIndex((transaction) => transaction.id === id);
  if (index === -1 || !reverseTransaction(index)) return;
  save();
  draw();
  bumpTotal();
}

function clearAll() {
  const confirmed = window.confirm('Kumbarayı tamamen boşaltmak istediğine emin misin?');
  if (!confirmed) return;

  counts = {};
  transactions = [];
  try {
    localStorage.removeItem(STORAGE.legacyCounts);
    localStorage.removeItem(STORAGE.legacyHistory);
  } catch {
    // Saving the empty v2 state below is sufficient when removal is blocked.
  }
  save();
  draw();
}

function openGoalModal() {
  const modal = document.getElementById('goal-modal');
  const input = document.getElementById('goal-input');
  input.value = goal ?? '';
  modal.hidden = false;
  input.focus();
}

function closeGoalModal() {
  document.getElementById('goal-modal').hidden = true;
}

function saveGoalFromModal() {
  const input = document.getElementById('goal-input');
  const value = Number(input.value);
  if (Number.isFinite(value) && value > 0) {
    goal = value;
    save();
    draw();
  }
  closeGoalModal();
}

function createCard(denomination) {
  const { id, label } = denomination;
  return `
    <article class="item">
      <div class="label">${label}</div>
      <div class="count">${counts[id] ?? 0} adet</div>
      <div class="controls">
        <button type="button" data-action="remove" data-id="${id}" aria-label="Bir ${label} çıkar">−</button>
        <input class="qty" id="quantity-${id}" type="number" min="1" step="1" inputmode="numeric" value="1" aria-label="${label} için adet">
        <button class="plus" type="button" data-action="add" data-id="${id}" aria-label="Bir ${label} ekle">+</button>
      </div>
      <button class="bulk" type="button" data-action="bulk" data-id="${id}">Toplu ekle</button>
    </article>`;
}

function drawDenominations() {
  document.getElementById('coins').innerHTML = DENOMINATIONS.slice(0, 3).map(createCard).join('');
  document.getElementById('notes').innerHTML = DENOMINATIONS.slice(3).map(createCard).join('');
}

function formatTime(isoTime) {
  if (!isoTime) return 'Önceki kayıt';
  const date = new Date(isoTime);
  return Number.isNaN(date.valueOf())
    ? 'Önceki kayıt'
    : date.toLocaleString('tr-TR', { dateStyle: 'short', timeStyle: 'short' });
}

function drawHistory() {
  const history = document.getElementById('history');
  if (!transactions.length) {
    history.innerHTML = '<p class="empty">Henüz işlem yok.</p>';
    return;
  }

  history.innerHTML = transactions.slice(0, RECENT_HISTORY_COUNT).map((transaction) => {
    const denomination = denominationById.get(transaction.denominationId);
    const isAddition = transaction.type === 'add';
    const total = transaction.quantity * denomination.value;
    const action = isAddition ? 'Eklendi' : 'Çıkarıldı';
    const sign = isAddition ? '+' : '−';
    const className = isAddition ? 'added' : 'removed';
    return `
      <div class="row">
        <span>${action}: ${transaction.quantity} × ${denomination.label}<br><small>${formatTime(transaction.createdAt)}</small></span>
        <div class="row-right">
          <strong class="${className}">${sign}${money(total)}</strong>
          <button class="row-undo" type="button" data-action="undo-one" data-tx="${transaction.id}" aria-label="Bu işlemi geri al">↩️</button>
        </div>
      </div>`;
  }).join('');
}

function getTransactionDate(transaction) {
  if (!transaction.createdAt) return null;
  const date = new Date(transaction.createdAt);
  return Number.isNaN(date.valueOf()) ? null : date;
}

function transactionValue(transaction) {
  const denomination = denominationById.get(transaction.denominationId);
  const value = denomination.value * transaction.quantity;
  return transaction.type === 'add' ? value : -value;
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sumTransactionsSince(start) {
  return transactions.reduce((sum, transaction) => {
    const date = getTransactionDate(transaction);
    return date && date >= start ? sum + transactionValue(transaction) : sum;
  }, 0);
}

function sumTransactionsBetween(start, end) {
  return transactions.reduce((sum, transaction) => {
    const date = getTransactionDate(transaction);
    return date && date >= start && date < end ? sum + transactionValue(transaction) : sum;
  }, 0);
}

function getStatistics(now = new Date()) {
  const today = startOfDay(now);
  const week = new Date(today);
  const daysSinceMonday = (today.getDay() + 6) % 7;
  week.setDate(week.getDate() - daysSinceMonday);
  const month = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    today: sumTransactionsSince(today),
    week: sumTransactionsSince(week),
    month: sumTransactionsSince(month),
    count: transactions.length,
  };
}

function getMonthComparison(now = new Date()) {
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return {
    thisMonth: sumTransactionsBetween(thisMonthStart, new Date(now.getFullYear(), now.getMonth() + 1, 1)),
    lastMonth: sumTransactionsBetween(lastMonthStart, thisMonthStart),
  };
}

function hasAddOnDay(day) {
  return transactions.some((transaction) => {
    if (transaction.type !== 'add') return false;
    const date = getTransactionDate(transaction);
    return date && startOfDay(date).valueOf() === day.valueOf();
  });
}

function getStreak(now = new Date()) {
  const today = startOfDay(now);
  let cursor = today;
  if (!hasAddOnDay(today)) {
    cursor = new Date(today);
    cursor.setDate(cursor.getDate() - 1);
  }

  let streak = 0;
  while (hasAddOnDay(cursor)) {
    streak += 1;
    cursor = new Date(cursor);
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function drawStreakAndComparison() {
  const streak = getStreak();
  const streakEl = document.getElementById('streak-line');
  streakEl.textContent = streak > 0
    ? `🔥 ${streak} gün üst üste ekledin!`
    : '🔥 Henüz seri yok, bugün ekleyerek başlat!';

  const { thisMonth, lastMonth } = getMonthComparison();
  const comparisonEl = document.getElementById('month-comparison-line');
  if (thisMonth === 0 && lastMonth === 0) {
    comparisonEl.textContent = '📊 Karşılaştırma için henüz yeterli veri yok.';
    comparisonEl.className = 'stats-line';
    return;
  }

  const diff = thisMonth - lastMonth;
  const isUp = diff >= 0;
  const percent = lastMonth !== 0
    ? Math.round((diff / Math.abs(lastMonth)) * 100)
    : 100;
  comparisonEl.innerHTML = `📊 Bu ay ${money(thisMonth)} · Geçen ay ${money(lastMonth)} ` +
    `<strong class="${isUp ? 'added' : 'removed'}">${isUp ? '▲' : '▼'} %${Math.abs(percent)}</strong>`;
  comparisonEl.className = 'stats-line';
}

function drawStatistics() {
  const statistics = getStatistics();
  document.getElementById('stat-today').textContent = signedMoney(statistics.today);
  document.getElementById('stat-week').textContent = signedMoney(statistics.week);
  document.getElementById('stat-month').textContent = signedMoney(statistics.month);
  document.getElementById('stat-count').textContent = String(statistics.count);
  drawWeeklyChart();
  drawStreakAndComparison();
}

function drawWeeklyChart() {
  const chart = document.getElementById('weekly-chart');
  const today = startOfDay(new Date());
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (6 - index));
    return { date, value: 0 };
  });

  for (const transaction of transactions) {
    const date = getTransactionDate(transaction);
    if (!date) continue;
    const dayIndex = days.findIndex((day) => startOfDay(date).valueOf() === day.date.valueOf());
    if (dayIndex !== -1) days[dayIndex].value += transactionValue(transaction);
  }

  const maximum = Math.max(1, ...days.map((day) => Math.abs(day.value)));
  chart.innerHTML = days.map((day) => {
    const height = Math.max(3, Math.round((Math.abs(day.value) / maximum) * 72));
    const negative = day.value < 0 ? ' negative' : '';
    const label = day.date.toLocaleDateString('tr-TR', { weekday: 'short' });
    return `
      <div class="chart-column" title="${label}: ${signedMoney(day.value)}">
        <div class="chart-bar-area"><div class="chart-bar${negative}" style="height: ${height}px"></div></div>
        <span class="chart-label">${label}</span>
      </div>`;
  }).join('');
}

function getTotal() {
  return DENOMINATIONS.reduce(
    (sum, denomination) => sum + (counts[denomination.id] ?? 0) * denomination.value,
    0,
  );
}

function drawTotal() {
  document.getElementById('total').textContent = money(getTotal());
}

function getForecast() {
  const total = getTotal();
  if (!goal || total >= goal) return null;

  const dates = transactions.map(getTransactionDate).filter(Boolean);
  if (!dates.length) return null;

  const earliest = startOfDay(new Date(Math.min(...dates.map((date) => date.valueOf()))));
  const daysElapsed = Math.max(1, Math.round((startOfDay(new Date()) - earliest) / 86400000) + 1);
  const rate = sumTransactionsSince(earliest) / daysElapsed;
  if (rate <= 0) return null;

  const daysNeeded = Math.ceil((goal - total) / rate);
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysNeeded);
  return { daysNeeded, targetDate };
}

function drawGoal() {
  const body = document.getElementById('goal-body');
  if (!goal) {
    body.innerHTML = '<p class="empty">Henüz hedef belirlenmedi.</p>';
    return;
  }

  const total = getTotal();
  const percent = Math.min(100, Math.round((total / goal) * 1000) / 10);
  const forecast = getForecast();
  const forecastLine = forecast
    ? `<p class="goal-forecast">📈 Bu hızla gidersen hedefe ~${forecast.daysNeeded} gün sonra (${forecast.targetDate.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })}) ulaşırsın.</p>`
    : '';
  body.innerHTML = `
    <div class="goal-amounts">
      <span>${money(total)} / ${money(goal)}</span>
      <strong>%${percent.toLocaleString('tr-TR')}</strong>
    </div>
    <div class="progress">
      <div class="progress-bar" style="width: ${percent}%"></div>
    </div>
    ${forecastLine}`;
}

const WEEKDAY_NAMES = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

function getYearSummary(now = new Date()) {
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const yearTransactions = transactions.filter((transaction) => {
    const date = getTransactionDate(transaction);
    return date && date >= yearStart;
  });

  const dayTotals = new Array(7).fill(0);
  let biggest = null;

  for (const transaction of yearTransactions) {
    const date = getTransactionDate(transaction);
    dayTotals[date.getDay()] += transactionValue(transaction);

    if (transaction.type === 'add') {
      const amount = denominationById.get(transaction.denominationId).value * transaction.quantity;
      if (!biggest || amount > biggest.amount) biggest = { amount, date };
    }
  }

  const total = yearTransactions.reduce((sum, transaction) => sum + transactionValue(transaction), 0);
  const bestDayIndex = yearTransactions.length ? dayTotals.indexOf(Math.max(...dayTotals)) : null;

  return {
    year: now.getFullYear(),
    total,
    count: yearTransactions.length,
    bestDayName: bestDayIndex !== null ? WEEKDAY_NAMES[bestDayIndex] : null,
    biggest,
  };
}

function drawYearSummary() {
  const body = document.getElementById('year-summary-body');
  const summary = getYearSummary();

  if (!summary.count) {
    body.innerHTML = `<p class="empty">${summary.year} yılında henüz işlem yok.</p>`;
    return;
  }

  const biggestLine = summary.biggest
    ? `${money(summary.biggest.amount)} (${summary.biggest.date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })})`
    : '-';

  body.innerHTML = `
    <div class="stats-grid">
      <div class="stat">
        <span class="stat-label">Toplam</span>
        <strong>${signedMoney(summary.total)}</strong>
      </div>
      <div class="stat">
        <span class="stat-label">İşlem</span>
        <strong>${summary.count}</strong>
      </div>
      <div class="stat">
        <span class="stat-label">En aktif gün</span>
        <strong>${summary.bestDayName ?? '-'}</strong>
      </div>
      <div class="stat">
        <span class="stat-label">En büyük ekleme</span>
        <strong>${biggestLine}</strong>
      </div>
    </div>`;
}

function draw() {
  drawDenominations();
  drawTotal();
  drawGoal();
  drawStatistics();
  drawYearSummary();
  drawHistory();
  document.getElementById('undo-button').disabled = transactions.length === 0;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (action === 'set-goal') {
    openGoalModal();
    return;
  }
  if (action === 'undo-one') {
    undoTransaction(button.dataset.tx);
    return;
  }
  if (!denominationById.has(id)) return;

  if (action === 'add') change(id, 1);
  if (action === 'remove') change(id, -1);
  if (action === 'bulk') bulkAdd(id);
});

document.getElementById('undo-button').addEventListener('click', undo);
document.getElementById('clear-button').addEventListener('click', clearAll);

document.getElementById('goal-save').addEventListener('click', saveGoalFromModal);
document.getElementById('goal-cancel').addEventListener('click', closeGoalModal);
document.getElementById('goal-modal').addEventListener('click', (event) => {
  if (event.target.id === 'goal-modal') closeGoalModal();
});
document.getElementById('goal-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter') saveGoalFromModal();
  if (event.key === 'Escape') closeGoalModal();
});

const THEME_KEY = 'kumbara.v2.theme';
let theme = parseStoredValue(THEME_KEY, null);

function systemPrefersDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyTheme() {
  const isDark = theme ? theme === 'dark' : systemPrefersDark();
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;

  const metaThemeColor = document.querySelector('meta[name="theme-color"]');
  if (metaThemeColor) metaThemeColor.content = isDark ? '#15130f' : '#f6f0ea';
}

function toggleTheme() {
  const isDark = theme ? theme === 'dark' : systemPrefersDark();
  theme = isDark ? 'light' : 'dark';
  try {
    localStorage.setItem(THEME_KEY, JSON.stringify(theme));
  } catch {
    // Theme just won't persist across reloads when storage is unavailable.
  }
  applyTheme();
}

applyTheme();
draw();

const PIN_KEY = 'kumbara.v2.pinHash';

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hasPin() {
  try {
    return localStorage.getItem(PIN_KEY) !== null;
  } catch {
    return false;
  }
}

async function setPin(pin) {
  const hash = await sha256Hex(pin);
  try {
    localStorage.setItem(PIN_KEY, hash);
  } catch {
    // PIN just won't persist across reloads when storage is unavailable.
  }
}

function removePin() {
  try {
    localStorage.removeItem(PIN_KEY);
  } catch {
    // Nothing to clean up when storage is unavailable.
  }
}

async function verifyPin(pin) {
  const hash = await sha256Hex(pin);
  try {
    return localStorage.getItem(PIN_KEY) === hash;
  } catch {
    return false;
  }
}

let pinBuffer = '';

function updatePinDots() {
  document.querySelectorAll('.pin-dot').forEach((dot, index) => {
    dot.classList.toggle('filled', index < pinBuffer.length);
  });
}

function showLockScreen() {
  document.getElementById('lock-screen').hidden = false;
}

function hideLockScreen() {
  document.getElementById('lock-screen').hidden = true;
}

async function handlePinKey(key) {
  const errorEl = document.getElementById('lock-error');

  if (key === 'back') {
    pinBuffer = pinBuffer.slice(0, -1);
    errorEl.hidden = true;
    updatePinDots();
    return;
  }

  if (pinBuffer.length >= 4) return;
  pinBuffer += key;
  updatePinDots();

  if (pinBuffer.length !== 4) return;

  const ok = await verifyPin(pinBuffer);
  pinBuffer = '';

  if (ok) {
    updatePinDots();
    hideLockScreen();
    return;
  }

  errorEl.hidden = false;
  const dotsEl = document.getElementById('pin-dots');
  dotsEl.classList.remove('shake');
  void dotsEl.offsetWidth;
  dotsEl.classList.add('shake');
  updatePinDots();
}

document.getElementById('keypad').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-key]');
  if (!button) return;
  handlePinKey(button.dataset.key);
});

function closePinModal() {
  document.getElementById('pin-modal').hidden = true;
}

function renderPinModalBody() {
  const body = document.getElementById('pin-modal-body');

  if (hasPin()) {
    body.innerHTML = `
      <p class="modal-text">PIN kilidi aktif. Kumbara her açılışta PIN isteyecek.</p>
      <div class="modal-actions">
        <button class="modal-cancel" type="button" id="pin-modal-close">Kapat</button>
        <button class="modal-danger" type="button" id="pin-modal-remove">Kilidi Kaldır</button>
      </div>`;
    document.getElementById('pin-modal-close').addEventListener('click', closePinModal);
    document.getElementById('pin-modal-remove').addEventListener('click', () => {
      removePin();
      closePinModal();
    });
    return;
  }

  body.innerHTML = `
    <label for="new-pin-input">Yeni PIN (4 haneli)</label>
    <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="new-pin-input" placeholder="••••">
    <label for="confirm-pin-input">PIN (tekrar)</label>
    <input type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" id="confirm-pin-input" placeholder="••••">
    <p class="modal-error" id="pin-modal-error" hidden>PIN 4 haneli olmalı ve eşleşmeli.</p>
    <div class="modal-actions">
      <button class="modal-cancel" type="button" id="pin-modal-close">Vazgeç</button>
      <button class="modal-save" type="button" id="pin-modal-save">Kaydet</button>
    </div>`;
  document.getElementById('pin-modal-close').addEventListener('click', closePinModal);
  document.getElementById('pin-modal-save').addEventListener('click', async () => {
    const a = document.getElementById('new-pin-input').value;
    const b = document.getElementById('confirm-pin-input').value;
    if (!/^\d{4}$/.test(a) || a !== b) {
      document.getElementById('pin-modal-error').hidden = false;
      return;
    }
    await setPin(a);
    closePinModal();
  });
}

function openPinModal() {
  renderPinModalBody();
  document.getElementById('pin-modal').hidden = false;
}

document.getElementById('pin-modal').addEventListener('click', (event) => {
  if (event.target.id === 'pin-modal') closePinModal();
});

if (hasPin()) showLockScreen();

const firebaseConfig = {
  apiKey: 'AIzaSyDafoqx2XQtP9a2LOJHHXe31thNAXXsSys',
  authDomain: 'kumbara-2100b.firebaseapp.com',
  projectId: 'kumbara-2100b',
  storageBucket: 'kumbara-2100b.firebasestorage.app',
  messagingSenderId: '900589655192',
  appId: '1:900589655192:web:522470fabb6b003a032ced',
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const firestore = firebase.firestore();

let currentUser = null;
let suppressCloudWrite = false;
let unsubscribeCloud = null;

function cloudDocRef() {
  return firestore.collection('users').doc(currentUser.uid);
}

async function pushToCloud() {
  if (!currentUser || suppressCloudWrite) return;
  try {
    await cloudDocRef().set({
      banks,
      activeBankId,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch {
    // Offline or blocked — the local copy stays authoritative until the next successful sync.
  }
}

function closeCloudModal() {
  document.getElementById('cloud-modal').hidden = true;
}

function renderCloudModalBody() {
  const body = document.getElementById('cloud-modal-body');

  if (currentUser) {
    const name = currentUser.displayName || currentUser.email || 'Google hesabı';
    body.innerHTML = `
      <p class="modal-text">${name} olarak bağlısın. Birikimlerin cihazlar arasında otomatik senkronize ediliyor.</p>
      <div class="modal-actions">
        <button class="modal-cancel" type="button" id="cloud-modal-close">Kapat</button>
        <button class="modal-danger" type="button" id="cloud-modal-signout">Çıkış Yap</button>
      </div>`;
    document.getElementById('cloud-modal-close').addEventListener('click', closeCloudModal);
    document.getElementById('cloud-modal-signout').addEventListener('click', () => {
      auth.signOut();
      closeCloudModal();
    });
    return;
  }

  body.innerHTML = `
    <p class="modal-text">Google ile giriş yaparak birikimlerini buluta yedekleyip birden fazla cihazdan eriş.</p>
    <div class="modal-actions">
      <button class="modal-cancel" type="button" id="cloud-modal-close">Vazgeç</button>
      <button class="modal-save" type="button" id="cloud-modal-signin">Google ile Giriş Yap</button>
    </div>`;
  document.getElementById('cloud-modal-close').addEventListener('click', closeCloudModal);
  document.getElementById('cloud-modal-signin').addEventListener('click', async () => {
    try {
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
      closeCloudModal();
    } catch {
      // The user closed the popup or the sign-in failed — they can just try again.
    }
  });
}

function openCloudModal() {
  renderCloudModalBody();
  document.getElementById('cloud-modal').hidden = false;
}

document.getElementById('cloud-modal').addEventListener('click', (event) => {
  if (event.target.id === 'cloud-modal') closeCloudModal();
});

auth.onAuthStateChanged(async (user) => {
  currentUser = user;

  if (unsubscribeCloud) {
    unsubscribeCloud();
    unsubscribeCloud = null;
  }
  if (!user) return;

  try {
    const existing = await cloudDocRef().get();
    if (!existing.exists) await pushToCloud();
  } catch {
    // No connection yet — the snapshot listener below will still sync once it returns.
  }

  unsubscribeCloud = cloudDocRef().onSnapshot((snapshot) => {
    if (!snapshot.exists) return;
    const data = snapshot.data() || {};
    suppressCloudWrite = true;

    banks = Array.isArray(data.banks) && data.banks.length
      ? data.banks.map(sanitiseBank)
      : [makeBank('Kumbaram', sanitiseCounts(data.counts), sanitiseTransactions(data.transactions), sanitiseGoal(data.goal))];
    activeBankId = banks.some((bank) => bank.id === data.activeBankId) ? data.activeBankId : banks[0].id;
    loadActiveBankState();

    save();
    draw();
    updateActiveBankLabel();
    suppressCloudWrite = false;
  });
});

function closeSettingsModal() {
  document.getElementById('settings-modal').hidden = true;
}

function renderSettingsModalBody() {
  const body = document.getElementById('settings-modal-body');
  const isDark = theme ? theme === 'dark' : systemPrefersDark();
  const pinStatus = hasPin() ? 'Açık' : 'Kapalı';
  const cloudStatus = currentUser ? (currentUser.email || currentUser.displayName || 'Bağlı') : 'Bağlı değil';

  body.innerHTML = `
    <div class="settings-row clickable" id="settings-theme-row">
      <span class="settings-row-label">🌙 Tema</span>
      <span class="settings-row-value">${isDark ? 'Koyu' : 'Açık'}</span>
    </div>
    <div class="settings-row clickable" id="settings-pin-row">
      <span class="settings-row-label">🔒 PIN Kilidi</span>
      <span class="settings-row-value">${pinStatus}</span>
    </div>
    <div class="settings-row clickable" id="settings-cloud-row">
      <span class="settings-row-label">☁️ Bulut Senkronizasyonu</span>
      <span class="settings-row-value">${cloudStatus}</span>
    </div>
    <div class="modal-actions">
      <button class="modal-cancel" type="button" id="settings-modal-close">Kapat</button>
    </div>`;

  document.getElementById('settings-modal-close').addEventListener('click', closeSettingsModal);
  document.getElementById('settings-theme-row').addEventListener('click', () => {
    toggleTheme();
    renderSettingsModalBody();
  });
  document.getElementById('settings-pin-row').addEventListener('click', () => {
    closeSettingsModal();
    openPinModal();
  });
  document.getElementById('settings-cloud-row').addEventListener('click', () => {
    closeSettingsModal();
    openCloudModal();
  });
}

function openSettingsModal() {
  renderSettingsModalBody();
  document.getElementById('settings-modal').hidden = false;
}

document.getElementById('settings-button').addEventListener('click', openSettingsModal);
document.getElementById('settings-modal').addEventListener('click', (event) => {
  if (event.target.id === 'settings-modal') closeSettingsModal();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').catch(() => {
      // The app still works without offline caching if registration fails.
    });
  });
}

function bankTotal(bank) {
  return DENOMINATIONS.reduce(
    (sum, denomination) => sum + (bank.counts[denomination.id] ?? 0) * denomination.value,
    0,
  );
}

function closeBanksModal() {
  document.getElementById('banks-modal').hidden = true;
}

function renderBanksModalBody() {
  syncActiveBankState();
  const body = document.getElementById('banks-modal-body');

  const rows = banks.map((bank) => `
    <div class="bank-row" data-bank-id="${bank.id}">
      <div class="bank-row-main" data-action="switch">
        <span class="bank-row-name">${bank.id === activeBankId ? '✓ ' : ''}${bank.name}</span>
        <span class="bank-row-total">${money(bankTotal(bank))}</span>
      </div>
      <div class="bank-row-actions">
        <button type="button" class="bank-row-btn" data-action="rename" aria-label="Adını değiştir">✏️</button>
        ${banks.length > 1 ? '<button type="button" class="bank-row-btn" data-action="delete" aria-label="Sil">🗑️</button>' : ''}
      </div>
    </div>`).join('');

  body.innerHTML = `
    <div class="bank-list">${rows}</div>
    <label for="new-bank-input">Yeni kumbara adı</label>
    <input type="text" id="new-bank-input" maxlength="30" placeholder="Örn. Tatil">
    <div class="modal-actions">
      <button class="modal-cancel" type="button" id="banks-modal-close">Kapat</button>
      <button class="modal-save" type="button" id="banks-modal-add">Ekle</button>
    </div>`;

  document.getElementById('banks-modal-close').addEventListener('click', closeBanksModal);
  document.getElementById('banks-modal-add').addEventListener('click', () => {
    const input = document.getElementById('new-bank-input');
    const name = input.value.trim();
    if (!name) {
      input.focus();
      return;
    }
    createBank(name);
    closeBanksModal();
  });

  document.querySelectorAll('.bank-row').forEach((row) => {
    const id = row.dataset.bankId;
    row.querySelector('[data-action="switch"]').addEventListener('click', () => {
      switchBank(id);
      closeBanksModal();
    });
    row.querySelector('[data-action="rename"]').addEventListener('click', () => {
      const bank = banks.find((item) => item.id === id);
      const name = window.prompt('Yeni ad:', bank.name);
      if (name && name.trim()) {
        renameBank(id, name);
        renderBanksModalBody();
      }
    });
    const deleteButton = row.querySelector('[data-action="delete"]');
    if (deleteButton) {
      deleteButton.addEventListener('click', () => {
        const bank = banks.find((item) => item.id === id);
        const confirmed = window.confirm(`"${bank.name}" kumbarasını silmek istediğine emin misin? Bu işlem geri alınamaz.`);
        if (!confirmed) return;
        deleteBank(id);
        renderBanksModalBody();
      });
    }
  });
}

function openBanksModal() {
  renderBanksModalBody();
  document.getElementById('banks-modal').hidden = false;
}

document.getElementById('bank-switcher-button').addEventListener('click', openBanksModal);
document.getElementById('banks-modal').addEventListener('click', (event) => {
  if (event.target.id === 'banks-modal') closeBanksModal();
});

updateActiveBankLabel();
