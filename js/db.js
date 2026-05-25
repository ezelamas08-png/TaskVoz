const DB_NAME = 'TaskVozDB';
const DB_VERSION = 1;
let db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    if (db) return resolve(db);
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('tasks')) {
        const store = d.createObjectStore('tasks', { keyPath: 'id' });
        store.createIndex('status', 'status');
        store.createIndex('dueDate', 'dueDate');
        store.createIndex('category', 'category');
        store.createIndex('priority', 'priority');
        store.createIndex('createdAt', 'createdAt');
      }
    };
    req.onsuccess = e => { db = e.target.result; resolve(db); };
    req.onerror = e => reject(e.target.error);
  });
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
}

async function addTask(task) {
  const d = await openDB();
  const t = {
    id: generateId(),
    title: task.title || '',
    description: task.description || '',
    status: 'pending',
    priority: task.priority || 'medium',
    category: task.category || 'otro',
    assignee: task.assignee || '',
    notes: task.notes || '',
    dueDate: task.dueDate || null,
    completedAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    originalTranscript: task.originalTranscript || '',
    tags: task.tags || [],
    reminderEnabled: false,
    reminderTime: null,
    isRecurring: false,
    recurrenceRule: null,
    postponements: []
  };
  return new Promise((resolve, reject) => {
    const tx = d.transaction('tasks', 'readwrite');
    tx.objectStore('tasks').add(t);
    tx.oncomplete = () => resolve(t);
    tx.onerror = e => reject(e.target.error);
  });
}

async function updateTask(id, updates) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    const req = store.get(id);
    req.onsuccess = () => {
      const task = req.result;
      if (!task) return reject(new Error('Task not found'));
      Object.assign(task, updates, { updatedAt: new Date().toISOString() });
      store.put(task);
      tx.oncomplete = () => resolve(task);
    };
    tx.onerror = e => reject(e.target.error);
  });
}

async function deleteTask(id) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('tasks', 'readwrite');
    tx.objectStore('tasks').delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = e => reject(e.target.error);
  });
}

async function getAllTasks() {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('tasks', 'readonly');
    const req = tx.objectStore('tasks').getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

async function getTask(id) {
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('tasks', 'readonly');
    const req = tx.objectStore('tasks').get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = e => reject(e.target.error);
  });
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

function getEndOfWeek() {
  const d = new Date();
  const day = d.getDay();
  const diff = day === 0 ? 0 : 7 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().split('T')[0];
}

async function getTasksByFilter(filters = {}) {
  const all = await getAllTasks();
  return all.filter(t => {
    if (filters.status && t.status !== filters.status) return false;
    if (filters.category && t.category !== filters.category) return false;
    if (filters.priority && t.priority !== filters.priority) return false;
    if (filters.assignee && t.assignee && !t.assignee.toLowerCase().includes(filters.assignee.toLowerCase())) return false;
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      if (!t.title.toLowerCase().includes(kw) && !t.description.toLowerCase().includes(kw) && !(t.notes || '').toLowerCase().includes(kw)) return false;
    }
    if (filters.dateFrom && t.dueDate && t.dueDate < filters.dateFrom) return false;
    if (filters.dateTo && t.dueDate && t.dueDate > filters.dateTo) return false;
    return true;
  });
}

async function getDashboardCounts() {
  const all = await getAllTasks();
  const today = getToday();
  const endOfWeek = getEndOfWeek();
  const pending = all.filter(t => t.status === 'pending' || t.status === 'postponed');
  return {
    today: pending.filter(t => t.dueDate === today).length,
    overdue: pending.filter(t => t.dueDate && t.dueDate < today).length,
    week: pending.filter(t => t.dueDate && t.dueDate >= today && t.dueDate <= endOfWeek).length,
    noDate: pending.filter(t => !t.dueDate).length,
    total: pending.length,
    completed: all.filter(t => t.status === 'completed').length
  };
}

async function getPendingTasksGrouped() {
  const all = await getAllTasks();
  const today = getToday();
  const endOfWeek = getEndOfWeek();
  const pending = all.filter(t => t.status === 'pending' || t.status === 'postponed');

  const priorityOrder = { high: 0, medium: 1, low: 2 };
  const sort = arr => arr.sort((a, b) => (priorityOrder[a.priority] || 1) - (priorityOrder[b.priority] || 1));

  return {
    today: sort(pending.filter(t => t.dueDate === today)),
    overdue: sort(pending.filter(t => t.dueDate && t.dueDate < today)),
    week: sort(pending.filter(t => t.dueDate && t.dueDate > today && t.dueDate <= endOfWeek)),
    noDate: sort(pending.filter(t => !t.dueDate)),
    completed: all.filter(t => t.status === 'completed').sort((a, b) => (b.completedAt || '').localeCompare(a.completedAt || ''))
  };
}

async function generateDailyEmailText() {
  const groups = await getPendingTasksGrouped();
  const priorityLabel = { high: 'ALTA', medium: 'MEDIA', low: 'BAJA' };
  const categoryLabel = {
    produccion: 'Produccion', qa: 'QA', control_calidad: 'Control de Calidad',
    mantenimiento: 'Mantenimiento', compras: 'Compras', direccion_tecnica: 'Dir. Tecnica',
    gerencia: 'Gerencia', personal: 'Personal', otro: 'Otro'
  };

  let text = `Buenos dias, Ezequiel.\n\nEstos son tus pendientes activos:\n\n`;

  if (groups.today.length) {
    text += `PARA HOY (${groups.today.length}):\n`;
    groups.today.forEach(t => { text += `  [${priorityLabel[t.priority]}] ${t.title} — ${categoryLabel[t.category] || t.category}\n`; });
    text += '\n';
  }
  if (groups.overdue.length) {
    text += `VENCIDAS (${groups.overdue.length}):\n`;
    groups.overdue.forEach(t => { text += `  [${priorityLabel[t.priority]}] ${t.title} (vencio: ${t.dueDate})\n`; });
    text += '\n';
  }
  if (groups.week.length) {
    text += `PENDIENTES DE LA SEMANA (${groups.week.length}):\n`;
    groups.week.forEach(t => { text += `  ${t.title} — ${t.dueDate}\n`; });
    text += '\n';
  }
  if (groups.noDate.length) {
    text += `SIN FECHA (${groups.noDate.length}):\n`;
    groups.noDate.forEach(t => { text += `  ${t.title}\n`; });
    text += '\n';
  }

  const total = groups.today.length + groups.overdue.length + groups.week.length + groups.noDate.length;
  text += `---\nResumen: ${groups.today.length} hoy | ${groups.overdue.length} vencidas | ${groups.week.length} semana | ${groups.noDate.length} sin fecha\nTotal pendientes: ${total}\n`;
  return text;
}

async function exportTasksJSON() {
  const all = await getAllTasks();
  return JSON.stringify(all, null, 2);
}

async function importTasksJSON(json) {
  const tasks = JSON.parse(json);
  const d = await openDB();
  return new Promise((resolve, reject) => {
    const tx = d.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    tasks.forEach(t => store.put(t));
    tx.oncomplete = () => resolve(tasks.length);
    tx.onerror = e => reject(e.target.error);
  });
}
