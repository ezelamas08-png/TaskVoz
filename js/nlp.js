function parseTaskFromText(text) {
  const result = {
    title: text.trim(),
    dueDate: null,
    category: 'otro',
    priority: 'medium',
    tags: []
  };

  const lower = text.toLowerCase().trim();

  result.dueDate = extractDate(lower);
  result.category = extractCategory(lower);
  result.priority = extractPriority(lower);
  result.tags = extractTags(lower);
  result.title = cleanTitle(text, result);

  return result;
}

function extractDate(text) {
  const today = new Date();

  if (/\bhoy\b/.test(text)) return formatDate(today);

  if (/\bma[ñn]ana\b/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return formatDate(d);
  }

  if (/\bpasado\s*ma[ñn]ana\b/.test(text)) {
    const d = new Date(today);
    d.setDate(d.getDate() + 2);
    return formatDate(d);
  }

  const days = { lunes: 1, martes: 2, miercoles: 3, miércoles: 3, jueves: 4, viernes: 5, sabado: 6, sábado: 6, domingo: 0 };
  for (const [name, dayNum] of Object.entries(days)) {
    const regex = new RegExp(`\\b(?:el\\s+)?${name}\\b`);
    if (regex.test(text)) {
      const d = new Date(today);
      let diff = dayNum - d.getDay();
      if (diff <= 0) diff += 7;
      d.setDate(d.getDate() + diff);
      return formatDate(d);
    }
  }

  if (/\best[ae]\s+semana\b/.test(text)) {
    const d = new Date(today);
    const dayOfWeek = d.getDay();
    const daysUntilFriday = dayOfWeek <= 5 ? 5 - dayOfWeek : 0;
    d.setDate(d.getDate() + daysUntilFriday);
    return formatDate(d);
  }

  if (/\bpr[oó]xim[ao]\s+semana\b/.test(text) || /\bsemana\s+que\s+viene\b/.test(text)) {
    const d = new Date(today);
    const dayOfWeek = d.getDay();
    const daysUntilNextMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    d.setDate(d.getDate() + daysUntilNextMonday);
    return formatDate(d);
  }

  const dateRegex = /(\d{1,2})\s*[\/\-]\s*(\d{1,2})(?:\s*[\/\-]\s*(\d{2,4}))?/;
  const match = text.match(dateRegex);
  if (match) {
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : today.getFullYear();
    const d = new Date(year, month, day);
    if (!isNaN(d.getTime())) return formatDate(d);
  }

  return null;
}

function extractCategory(text) {
  const categories = [
    { key: 'produccion', patterns: [/\bproducci[oó]n\b/, /\bbatch\s*record\b/, /\bformulaci[oó]n\b/, /\blote\b/, /\bifa\b/, /\bcbd\b/, /\bcristal\b/, /\bdestilaci[oó]n\b/, /\bcristalizaci[oó]n\b/] },
    { key: 'qa', patterns: [/\bqa\b/, /\bcalidad\b.*\baseguramiento\b/, /\baseguramiento\b.*\bcalidad\b/] },
    { key: 'control_calidad', patterns: [/\bcontrol\s+de\s+calidad\b/, /\ban[aá]lisis\b/, /\blaboratorio\b/, /\bcc\b/] },
    { key: 'mantenimiento', patterns: [/\bmantenimiento\b/, /\bhvac\b/, /\bpresiones\s+diferenciales\b/, /\bcalibr/] },
    { key: 'compras', patterns: [/\bcompras\b/, /\bproveedor\b/, /\binsumo\b/, /\bstock\b/, /\benvases\b/] },
    { key: 'direccion_tecnica', patterns: [/\bdirecci[oó]n\s+t[eé]cnica\b/, /\bdt\b/, /\bdirector\s+t[eé]cnico\b/] },
    { key: 'gerencia', patterns: [/\bgerencia\b/, /\bgerente\b/, /\bdirecci[oó]n\b(?!\s+t)/] },
    { key: 'personal', patterns: [/\bpersonal\b/, /\bturno\b/, /\bm[eé]dico\b/, /\bfamilia\b/] }
  ];

  for (const cat of categories) {
    for (const p of cat.patterns) {
      if (p.test(text)) return cat.key;
    }
  }
  return 'otro';
}

function extractPriority(text) {
  if (/\burgente\b|\balta\s+prioridad\b|\bcr[ií]tico\b|\bya\b|\bimportante\b/.test(text)) return 'high';
  if (/\bbaja\s+prioridad\b|\bcuando\s+pueda\b|\bsin\s+apuro\b|\bno\s+urgente\b/.test(text)) return 'low';
  return 'medium';
}

function extractTags(text) {
  const tagMap = [
    { tag: 'urgente', pattern: /\burgente\b/ },
    { tag: 'reunion', pattern: /\breuni[oó]n\b/ },
    { tag: 'correo', pattern: /\bcorreo\b|\bemail\b|\bmail\b/ },
    { tag: 'seguimiento', pattern: /\bseguimiento\b/ },
    { tag: 'POE', pattern: /\bpoe\b/ },
    { tag: 'batch-record', pattern: /\bbatch\s*record\b/ },
    { tag: 'stock', pattern: /\bstock\b/ },
    { tag: 'HVAC', pattern: /\bhvac\b/ },
    { tag: 'planificacion', pattern: /\bplanificaci[oó]n\b/ }
  ];
  return tagMap.filter(t => t.pattern.test(text)).map(t => t.tag);
}

function cleanTitle(originalText, parsed) {
  let title = originalText.trim();
  const removePatterns = [
    /^(recordame|recordarme|acordarme|dejar\s+pendiente|tengo\s+que|hay\s+que|debo|necesito)\s+/i,
    /\b(hoy|ma[ñn]ana|pasado\s*ma[ñn]ana)\b/gi,
    /\b(el\s+)?(lunes|martes|mi[eé]rcoles|jueves|viernes|s[aá]bado|domingo)\b/gi,
    /\b(est[ae]\s+semana|pr[oó]xim[ao]\s+semana|semana\s+que\s+viene)\b/gi,
    /\bpara\s+(hoy|ma[ñn]ana|est[ae]\s+semana)\b/gi
  ];
  removePatterns.forEach(p => { title = title.replace(p, ''); });
  title = title.replace(/\s+/g, ' ').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '').trim();
  if (title.length > 0) title = title.charAt(0).toUpperCase() + title.slice(1);
  return title || originalText.trim();
}

function formatDate(d) {
  return d.toISOString().split('T')[0];
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return 'Sin fecha';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function isToday(dateStr) {
  return dateStr === formatDate(new Date());
}

function isOverdue(dateStr) {
  if (!dateStr) return false;
  return dateStr < formatDate(new Date());
}
