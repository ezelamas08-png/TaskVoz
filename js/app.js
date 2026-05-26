let currentView = 'pending';
let currentFilter = { category: null, priority: null };
let searchQuery = '';
let editingTaskId = null;

const CATEGORIES = {
  produccion: 'Produccion', qa: 'QA', control_calidad: 'Control de Calidad',
  mantenimiento: 'Mantenimiento', compras: 'Compras', direccion_tecnica: 'Dir. Tecnica',
  gerencia: 'Gerencia', personal: 'Personal', otro: 'Otro'
};
const PRIORITIES = { high: 'Alta', medium: 'Media', low: 'Baja' };
const STATUSES = { pending: 'Pendiente', completed: 'Completada', overdue: 'Vencida', postponed: 'Postergada' };

const MAKE_WEBHOOK_URL = 'https://hook.us2.make.com/7xcjgwdxt702lvre1oe6qqhultirr44y';

document.addEventListener('DOMContentLoaded', async () => {
  await openDB();
  renderApp();
  updateOverdueTasks();
  syncToMake();
});

async function updateOverdueTasks() {
  const all = await getAllTasks();
  const today = getToday();
  for (const t of all) {
    if ((t.status === 'pending' || t.status === 'postponed') && t.dueDate && t.dueDate < today) {
      await updateTask(t.id, { status: 'pending' });
    }
  }
}

async function renderApp() {
  await renderDashboard();
  await renderTaskList();
}

async function renderDashboard() {
  const counts = await getDashboardCounts();
  document.getElementById('count-today').textContent = counts.today;
  document.getElementById('count-overdue').textContent = counts.overdue;
  document.getElementById('count-week').textContent = counts.week;
  document.getElementById('count-done').textContent = counts.completed;
}

async function renderTaskList() {
  const container = document.getElementById('task-list');
  const groups = await getPendingTasksGrouped();

  let tasks = [];
  if (currentView === 'pending') {
    if (groups.overdue.length) tasks.push({ section: `Vencidas (${groups.overdue.length})`, items: groups.overdue, type: 'overdue' });
    if (groups.today.length) tasks.push({ section: `Hoy (${groups.today.length})`, items: groups.today, type: 'today' });
    if (groups.week.length) tasks.push({ section: `Esta semana (${groups.week.length})`, items: groups.week, type: 'week' });
    if (groups.noDate.length) tasks.push({ section: `Sin fecha (${groups.noDate.length})`, items: groups.noDate, type: 'nodate' });
  } else {
    if (groups.completed.length) tasks.push({ section: `Completadas (${groups.completed.length})`, items: groups.completed, type: 'completed' });
  }

  if (currentFilter.category) {
    tasks = tasks.map(g => ({ ...g, items: g.items.filter(t => t.category === currentFilter.category) })).filter(g => g.items.length > 0);
  }
  if (currentFilter.priority) {
    tasks = tasks.map(g => ({ ...g, items: g.items.filter(t => t.priority === currentFilter.priority) })).filter(g => g.items.length > 0);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    tasks = tasks.map(g => ({
      ...g,
      items: g.items.filter(t =>
        t.title.toLowerCase().includes(q) ||
        (t.description || '').toLowerCase().includes(q) ||
        (t.notes || '').toLowerCase().includes(q) ||
        (t.assignee || '').toLowerCase().includes(q)
      )
    })).filter(g => g.items.length > 0);
  }

  let html = '';
  if (tasks.length === 0) {
    html = `<div class="empty-state">
      <div class="empty-icon">${currentView === 'pending' ? '&#10003;' : '&#128203;'}</div>
      <p>${currentView === 'pending' ? 'No hay tareas pendientes' : 'No hay tareas completadas'}</p>
    </div>`;
  } else {
    for (const group of tasks) {
      html += `<div class="section-title">${group.section}</div>`;
      for (const t of group.items) {
        html += renderTaskItem(t, group.type);
      }
    }
  }
  container.innerHTML = html;
}

function renderTaskItem(task, groupType) {
  const isCompleted = task.status === 'completed';
  const isOverdue = task.dueDate && task.dueDate < getToday() && !isCompleted;
  const priorityClass = `priority-${task.priority}`;
  const completedClass = isCompleted ? 'completed' : '';

  let dateTag = '';
  if (task.dueDate) {
    const overdueClass = isOverdue ? 'overdue' : '';
    dateTag = `<span class="task-tag tag-date ${overdueClass}">${formatDateDisplay(task.dueDate)}</span>`;
  }

  const priorityTag = `<span class="task-tag tag-priority-${task.priority}">${PRIORITIES[task.priority]}</span>`;
  const catTag = `<span class="task-tag tag-category">${CATEGORIES[task.category] || task.category}</span>`;

  return `<div class="task-item ${priorityClass} ${completedClass}" data-id="${task.id}">
    <button class="task-checkbox ${isCompleted ? 'checked' : ''}" onclick="toggleTask('${task.id}')">${isCompleted ? '&#10003;' : ''}</button>
    <div class="task-content" onclick="openEditModal('${task.id}')">
      <div class="task-title">${escapeHtml(task.title)}</div>
      <div class="task-meta">${priorityTag}${catTag}${dateTag}</div>
    </div>
    <div class="task-actions">
      ${!isCompleted ? `<button class="task-action-btn" onclick="openPostponeModal('${task.id}')" title="Postergar">&#8634;</button>` : ''}
    </div>
  </div>`;
}

async function toggleTask(id) {
  const task = await getTask(id);
  if (!task) return;
  const newStatus = task.status === 'completed' ? 'pending' : 'completed';
  const updates = { status: newStatus };
  if (newStatus === 'completed') updates.completedAt = new Date().toISOString();
  else updates.completedAt = null;
  await updateTask(id, updates);
  showToast(newStatus === 'completed' ? 'Tarea completada' : 'Tarea reactivada');
  renderApp();
}

// ===== VOICE =====
function openVoiceModal() {
  editingTaskId = null;
  document.getElementById('voice-edit-area').style.display = 'none';
  document.getElementById('voice-edit-text').value = '';
  document.getElementById('voice-live-text').innerHTML = '<span class="placeholder">Presiona Grabar y dicta tu tarea...</span>';
  document.getElementById('voice-live-text').style.display = 'block';
  document.getElementById('voice-detected').innerHTML = '';
  document.getElementById('voice-detected').style.display = 'none';
  document.getElementById('voice-save-btn').style.display = 'none';
  document.getElementById('voice-process-btn').style.display = 'none';
  document.getElementById('voice-status').textContent = '';
  openModal('voice-modal');
}

let voiceTranscript = '';

function toggleVoiceRecording() {
  const btn = document.getElementById('voice-rec-btn');
  if (btn.classList.contains('recording')) {
    stopListening();
    btn.classList.remove('recording');
    btn.innerHTML = '<span class="mic-icon">&#127908;</span> Grabar';
    document.getElementById('voice-status').textContent = 'Grabacion detenida. Podes editar el texto.';
    if (voiceTranscript) {
      document.getElementById('voice-live-text').style.display = 'none';
      document.getElementById('voice-edit-area').style.display = 'block';
      document.getElementById('voice-edit-text').value = voiceTranscript;
      document.getElementById('voice-process-btn').style.display = 'block';
    }
  } else {
    voiceTranscript = '';
    document.getElementById('voice-edit-area').style.display = 'none';
    document.getElementById('voice-live-text').style.display = 'block';
    document.getElementById('voice-detected').style.display = 'none';
    document.getElementById('voice-save-btn').style.display = 'none';
    document.getElementById('voice-process-btn').style.display = 'none';
    const started = startListening(
      (text, isFinal) => {
        voiceTranscript = text;
        document.getElementById('voice-live-text').textContent = text;
      },
      (error) => {
        document.getElementById('voice-status').textContent = 'Error: ' + error;
        btn.classList.remove('recording');
        btn.innerHTML = '<span class="mic-icon">&#127908;</span> Grabar';
      },
      (listening) => {
        if (!listening) {
          btn.classList.remove('recording');
          btn.innerHTML = '<span class="mic-icon">&#127908;</span> Grabar';
          if (voiceTranscript) {
            document.getElementById('voice-status').textContent = 'Grabacion detenida. Podes editar el texto.';
            document.getElementById('voice-live-text').style.display = 'none';
            document.getElementById('voice-edit-area').style.display = 'block';
            document.getElementById('voice-edit-text').value = voiceTranscript;
            document.getElementById('voice-process-btn').style.display = 'block';
          } else {
            document.getElementById('voice-status').textContent = 'No se detecto voz. Presiona Grabar para intentar de nuevo.';
          }
        }
      }
    );
    if (started) {
      btn.classList.add('recording');
      btn.innerHTML = '<span class="mic-icon">&#9899;</span> Detener';
      document.getElementById('voice-status').textContent = 'Escuchando... (se detiene solo al terminar de hablar)';
      document.getElementById('voice-live-text').innerHTML = '<span class="placeholder">Escuchando...</span>';
    }
  }
}

function processVoiceText() {
  const text = document.getElementById('voice-edit-text').value.trim();
  if (!text) { showToast('No hay texto para procesar'); return; }
  processVoiceResult(text);
}

function processVoiceResult(text) {
  const parsed = parseTaskFromText(text);
  const detected = document.getElementById('voice-detected');
  detected.style.display = 'block';
  detected.innerHTML = `
    <div class="detected-field"><span class="field-label">Titulo</span><span class="field-value">${escapeHtml(parsed.title)}</span></div>
    <div class="detected-field"><span class="field-label">Fecha</span><span class="field-value">${parsed.dueDate ? formatDateDisplay(parsed.dueDate) : 'Sin fecha'}</span></div>
    <div class="detected-field"><span class="field-label">Area</span><span class="field-value">${CATEGORIES[parsed.category] || parsed.category}</span></div>
    <div class="detected-field"><span class="field-label">Prioridad</span><span class="field-value">${PRIORITIES[parsed.priority]}</span></div>
    ${parsed.tags.length ? `<div class="detected-field"><span class="field-label">Etiquetas</span><span class="field-value">${parsed.tags.join(', ')}</span></div>` : ''}
  `;
  document.getElementById('voice-process-btn').style.display = 'none';
  document.getElementById('voice-save-btn').style.display = 'block';
  document.getElementById('voice-save-btn').onclick = async () => {
    await addTask({
      title: parsed.title,
      dueDate: parsed.dueDate,
      category: parsed.category,
      priority: parsed.priority,
      tags: parsed.tags,
      originalTranscript: text
    });
    closeModal('voice-modal');
    showToast('Tarea agregada');
    renderApp();
  };
}

// ===== MANUAL ADD/EDIT =====
function openManualModal() {
  editingTaskId = null;
  document.getElementById('modal-title').textContent = 'Nueva tarea';
  document.getElementById('task-form').reset();
  document.getElementById('field-date').value = getToday();
  document.getElementById('delete-task-btn').style.display = 'none';
  openModal('task-modal');
}

async function openEditModal(id) {
  const task = await getTask(id);
  if (!task) return;
  editingTaskId = id;
  document.getElementById('modal-title').textContent = 'Editar tarea';
  document.getElementById('field-title').value = task.title;
  document.getElementById('field-description').value = task.description || '';
  document.getElementById('field-date').value = task.dueDate || '';
  document.getElementById('field-priority').value = task.priority;
  document.getElementById('field-category').value = task.category;
  document.getElementById('field-assignee').value = task.assignee || '';
  document.getElementById('field-notes').value = task.notes || '';
  document.getElementById('delete-task-btn').style.display = 'block';
  openModal('task-modal');
}

async function saveTask() {
  const title = document.getElementById('field-title').value.trim();
  if (!title) { showToast('Ingresa un titulo'); return; }

  const data = {
    title,
    description: document.getElementById('field-description').value.trim(),
    dueDate: document.getElementById('field-date').value || null,
    priority: document.getElementById('field-priority').value,
    category: document.getElementById('field-category').value,
    assignee: document.getElementById('field-assignee').value.trim(),
    notes: document.getElementById('field-notes').value.trim()
  };

  if (editingTaskId) {
    await updateTask(editingTaskId, data);
    showToast('Tarea actualizada');
  } else {
    await addTask(data);
    showToast('Tarea agregada');
  }
  closeModal('task-modal');
  renderApp();
}

async function removeTask() {
  if (!editingTaskId) return;
  if (!confirm('Eliminar esta tarea?')) return;
  await deleteTask(editingTaskId);
  closeModal('task-modal');
  showToast('Tarea eliminada');
  renderApp();
}

// ===== POSTPONE =====
let postponeTaskId = null;

function openPostponeModal(id) {
  postponeTaskId = id;
  openModal('postpone-modal');
}

async function postponeTask(option) {
  if (!postponeTaskId) return;
  const task = await getTask(postponeTaskId);
  if (!task) return;

  let newDate = null;
  const today = new Date();

  if (option === 'tomorrow') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    newDate = formatDate(d);
  } else if (option === 'next-week') {
    const d = new Date(today);
    const day = d.getDay();
    const diff = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + diff);
    newDate = formatDate(d);
  } else if (option === 'pick') {
    const input = prompt('Ingresa la fecha (AAAA-MM-DD):', formatDate(new Date(today.getTime() + 86400000)));
    if (!input) return;
    newDate = input;
  } else if (option === 'no-date') {
    newDate = null;
  }

  const postponements = task.postponements || [];
  postponements.push({ previousDate: task.dueDate, newDate, date: new Date().toISOString() });

  await updateTask(postponeTaskId, { dueDate: newDate, status: 'postponed', postponements });
  closeModal('postpone-modal');
  showToast('Tarea postergada');
  renderApp();
}

// ===== FILTERS =====
function setView(view) {
  currentView = view;
  document.querySelectorAll('.view-tab').forEach(t => t.classList.toggle('active', t.dataset.view === view));
  renderTaskList();
}

function toggleCategoryFilter(cat) {
  currentFilter.category = cat;
  document.querySelectorAll('.filter-chip[data-category]').forEach(c => {
    if (cat === null) {
      c.classList.toggle('active', c.dataset.category === 'all');
    } else {
      c.classList.toggle('active', c.dataset.category === cat);
    }
  });
  renderTaskList();
}

function onSearch(value) {
  searchQuery = value;
  renderTaskList();
}

// ===== EMAIL SUMMARY =====
async function copyEmailSummary() {
  const text = await generateDailyEmailText();
  try {
    await navigator.clipboard.writeText(text);
    showToast('Resumen copiado al portapapeles');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast('Resumen copiado');
  }
  closeMenu();
}

async function shareEmailSummary() {
  const text = await generateDailyEmailText();
  const today = new Date().toLocaleDateString('es-AR');
  if (navigator.share) {
    try {
      await navigator.share({ title: `Pendientes del dia - ${today}`, text });
    } catch {}
  } else {
    const subject = encodeURIComponent(`Pendientes del dia - ${today} | TaskVoz`);
    const body = encodeURIComponent(text);
    window.open(`mailto:?subject=${subject}&body=${body}`);
  }
  closeMenu();
}

// ===== EXPORT =====
async function exportJSON() {
  const json = await exportTasksJSON();
  downloadFile(json, 'taskvoz-backup.json', 'application/json');
  closeMenu();
  showToast('Backup exportado');
}

async function importJSON() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const text = await file.text();
    try {
      const count = await importTasksJSON(text);
      showToast(`${count} tareas importadas`);
      renderApp();
    } catch {
      showToast('Error al importar');
    }
  };
  input.click();
  closeMenu();
}

async function exportCSV() {
  const all = await getAllTasks();
  let csv = 'Titulo,Estado,Prioridad,Area,Fecha,Responsable,Descripcion,Notas\n';
  all.forEach(t => {
    csv += `"${(t.title||'').replace(/"/g,'""')}","${STATUSES[t.status]||t.status}","${PRIORITIES[t.priority]||t.priority}","${CATEGORIES[t.category]||t.category}","${t.dueDate||''}","${(t.assignee||'').replace(/"/g,'""')}","${(t.description||'').replace(/"/g,'""')}","${(t.notes||'').replace(/"/g,'""')}"\n`;
  });
  downloadFile(csv, 'taskvoz-tareas.csv', 'text/csv');
  closeMenu();
  showToast('CSV exportado');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ===== MODAL UTILS =====
function openModal(id) {
  document.getElementById(id).classList.add('active');
}
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

function toggleMenu() {
  const menu = document.getElementById('app-menu');
  const overlay = document.getElementById('menu-overlay');
  const isActive = menu.classList.contains('active');
  menu.classList.toggle('active', !isActive);
  overlay.classList.toggle('active', !isActive);
}
function closeMenu() {
  document.getElementById('app-menu').classList.remove('active');
  document.getElementById('menu-overlay').classList.remove('active');
}

// ===== TOAST =====
let toastTimeout;
function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== MAKE.COM SYNC =====
async function generateDailyEmailHTML() {
  const groups = await getPendingTasksGrouped();
  const priorityLabel = { high: 'ALTA', medium: 'MEDIA', low: 'BAJA' };
  const priorityColor = { high: '#ef4444', medium: '#f59e0b', low: '#10b981' };
  const categoryLabel = {
    produccion: 'Produccion', qa: 'QA', control_calidad: 'Control de Calidad',
    mantenimiento: 'Mantenimiento', compras: 'Compras', direccion_tecnica: 'Dir. Tecnica',
    gerencia: 'Gerencia', personal: 'Personal', otro: 'Otro'
  };

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  let html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f8fafc;padding:20px;border-radius:12px">`;
  html += `<h2 style="color:#1e293b;margin-bottom:4px">Buenos dias, Ezequiel</h2>`;
  html += `<p style="color:#64748b;margin-top:0">${today}</p>`;

  const total = groups.today.length + groups.overdue.length + groups.week.length + groups.noDate.length;
  html += `<div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">`;
  html += `<div style="background:#3b82f6;color:#fff;padding:8px 16px;border-radius:8px;text-align:center"><strong>${groups.today.length}</strong><br><small>Hoy</small></div>`;
  html += `<div style="background:#ef4444;color:#fff;padding:8px 16px;border-radius:8px;text-align:center"><strong>${groups.overdue.length}</strong><br><small>Vencidas</small></div>`;
  html += `<div style="background:#8b5cf6;color:#fff;padding:8px 16px;border-radius:8px;text-align:center"><strong>${groups.week.length}</strong><br><small>Semana</small></div>`;
  html += `<div style="background:#64748b;color:#fff;padding:8px 16px;border-radius:8px;text-align:center"><strong>${total}</strong><br><small>Total</small></div>`;
  html += `</div>`;

  function renderSection(title, items, color) {
    if (!items.length) return '';
    let s = `<div style="margin-bottom:16px"><h3 style="color:${color};margin-bottom:8px;font-size:14px">${title} (${items.length})</h3>`;
    items.forEach(t => {
      const pColor = priorityColor[t.priority] || '#64748b';
      s += `<div style="background:#fff;border-left:4px solid ${pColor};padding:8px 12px;margin-bottom:6px;border-radius:4px">`;
      s += `<strong style="color:#1e293b">${t.title}</strong>`;
      s += `<br><small style="color:#64748b">[${priorityLabel[t.priority]}] ${categoryLabel[t.category] || t.category}`;
      if (t.dueDate) s += ` — ${t.dueDate}`;
      if (t.assignee) s += ` — ${t.assignee}`;
      s += `</small></div>`;
    });
    s += `</div>`;
    return s;
  }

  html += renderSection('VENCIDAS', groups.overdue, '#ef4444');
  html += renderSection('PARA HOY', groups.today, '#3b82f6');
  html += renderSection('ESTA SEMANA', groups.week, '#8b5cf6');
  html += renderSection('SIN FECHA', groups.noDate, '#64748b');

  if (total === 0) {
    html += `<p style="text-align:center;color:#10b981;font-size:18px">No hay tareas pendientes</p>`;
  }

  html += `<hr style="border:none;border-top:1px solid #e2e8f0;margin:16px 0">`;
  html += `<p style="color:#94a3b8;font-size:12px;text-align:center">Generado por TaskVoz</p>`;
  html += `</div>`;
  return html;
}

async function syncToMake() {
  try {
    const lastSync = localStorage.getItem('taskvoz-last-sync');
    const today = new Date().toISOString().split('T')[0];
    if (lastSync === today) return;

    const day = new Date().getDay();
    if (day === 0 || day === 6) return;

    const all = await getAllTasks();
    const pending = all.filter(t => t.status === 'pending' || t.status === 'postponed');
    if (pending.length === 0) return;

    const emailBody = await generateDailyEmailHTML();
    const todayDisplay = new Date().toLocaleDateString('es-AR');
    const total = pending.length;

    const payload = {
      emailSubject: `TaskVoz — ${total} tarea${total !== 1 ? 's' : ''} pendiente${total !== 1 ? 's' : ''} (${todayDisplay})`,
      emailBody: emailBody,
      lastSync: new Date().toISOString()
    };

    const resp = await fetch(MAKE_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (resp.ok) {
      localStorage.setItem('taskvoz-last-sync', today);
    }
  } catch (e) {}
}
