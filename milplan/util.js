function padSsNumero(n) {
  return String(n).padStart(3, '0');
}

function ssFileBaseName(ssNumero, revisaoAtual) {
  const base = `SS-Milplan-${padSsNumero(ssNumero)}`;
  return revisaoAtual ? `${base}_rev${revisaoAtual}` : base;
}

// Formata uma Date (ou 'YYYY-MM-DD') pra DD/MM/AAAA.
function formatDateBR(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// Soma N dias úteis (seg-sex, sem calendário de feriados) a uma data.
function addBusinessDays(date, days) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : new Date(date);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay(); // 0=domingo, 6=sábado
    if (dow !== 0 && dow !== 6) added++;
  }
  return d;
}

function toDateOnlyString(date) {
  const d = typeof date === 'string' ? new Date(date + 'T00:00:00') : date;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = { padSsNumero, ssFileBaseName, formatDateBR, addBusinessDays, toDateOnlyString };
