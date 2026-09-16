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
  legacyCounts: 'kumbaraC',
  legacyHistory: 'kumbaraH',
};

const MAX_HISTORY = 30;
const denominationById = new Map(DENOMINATIONS.map((item) => [item.id, item]));

let counts = loadCounts();
let transactions = loadTransactions();

function money(value) {
  return `₺${value.toLocaleString('tr-TR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function parseStoredValue(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function loadCounts() {
  const saved = parseStoredValue(STORAGE.counts, null)
    ?? parseStoredValue(STORAGE.legacyCounts, {});
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

function loadTransactions() {
  const saved = parseStoredValue(STORAGE.transactions, null)
    ?? parseStoredValue(STORAGE.legacyHistory, []);
  if (!Array.isArray(saved)) return [];
  return saved.map(normaliseTransaction).filter(Boolean).slice(0, MAX_HISTORY);
}

function save() {
  try {
    localStorage.setItem(STORAGE.counts, JSON.stringify(counts));
    localStorage.setItem(STORAGE.transactions, JSON.stringify(transactions));
  } catch {
    // The current session continues even when browser storage is unavailable.
  }
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
  transactions = transactions.slice(0, MAX_HISTORY);
}

function change(denominationId, quantity) {
  const type = quantity > 0 ? 'add' : 'remove';
  if (!updateCount(denominationId, quantity)) return;

  addTransaction(denominationId, Math.abs(quantity), type);
  save();
  draw();
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

function undo() {
  const lastTransaction = transactions.shift();
  if (!lastTransaction) return;

  const change = lastTransaction.type === 'add'
    ? -lastTransaction.quantity
    : lastTransaction.quantity;
  if (!updateCount(lastTransaction.denominationId, change)) {
    transactions.unshift(lastTransaction);
    return;
  }

  save();
  draw();
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

  history.innerHTML = transactions.map((transaction) => {
    const denomination = denominationById.get(transaction.denominationId);
    const isAddition = transaction.type === 'add';
    const total = transaction.quantity * denomination.value;
    const action = isAddition ? 'Eklendi' : 'Çıkarıldı';
    const sign = isAddition ? '+' : '−';
    const className = isAddition ? 'added' : 'removed';
    return `
      <div class="row">
        <span>${action}: ${transaction.quantity} × ${denomination.label}<br><small>${formatTime(transaction.createdAt)}</small></span>
        <strong class="${className}">${sign}${money(total)}</strong>
      </div>`;
  }).join('');
}

function drawTotal() {
  const total = DENOMINATIONS.reduce(
    (sum, denomination) => sum + (counts[denomination.id] ?? 0) * denomination.value,
    0,
  );
  document.getElementById('total').textContent = money(total);
}

function draw() {
  drawDenominations();
  drawTotal();
  drawHistory();
  document.getElementById('undo-button').disabled = transactions.length === 0;
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  const { action, id } = button.dataset;
  if (!denominationById.has(id)) return;

  if (action === 'add') change(id, 1);
  if (action === 'remove') change(id, -1);
  if (action === 'bulk') bulkAdd(id);
});

document.getElementById('undo-button').addEventListener('click', undo);
document.getElementById('clear-button').addEventListener('click', clearAll);

draw();
