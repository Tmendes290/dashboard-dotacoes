// ═══════════════════════════════════════════════════════════════════
// SYNC IMPRODUTIVIDADE → SUPABASE
// Cole este código em: Extensões > Apps Script (dentro do Google Sheets)
// ═══════════════════════════════════════════════════════════════════

// ── CONFIGURAÇÃO — só mexa aqui ──────────────────────────────────
var SUPABASE_URL = 'https://ehbiyqqpzqrluvuqrljp.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoYml5cXFwenFybHV2dXFybGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjM3MTcsImV4cCI6MjA5NDg5OTcxN30.lW_Jdc7SC7FKh9OJPBCYdfN-QMXFTYGjterU3eWOFTc';
var SHEET_NAME   = 'REGISTROS';
// URL pública do dashboard (Render, domínio próprio) — o /api/relatorio-diario faz o cálculo pesado
// (aderência, evolução, composição do improdutivo) e devolve o HTML pronto do e-mail.
var RELATORIO_URL   = 'https://dashboardsalobo.com.br';
var RELATORIO_TOKEN = 'b11537b02bae4e1efcf64c05cac6eb0fe0ffa34af3e29c85'; // igual à env var RELATORIO_TOKEN no Render
var EMAILS_DESTINO  = 'tm0133929@gmail.com,davison.oliveira@vale.com,C0711210@vale.com,Danilo.Mundim.Silva@vale.com';
// ─────────────────────────────────────────────────────────────────

// Fuso da planilha — preenchido em syncToSupabase antes de processar linhas
var SHEET_TZ = 'America/Manaus';

// ── Converter valor de tempo em minutos ──────────────────────────
function timeToMin(val) {
  if (val === null || val === undefined || val === '') return null;
  // Google Sheets retorna Date; usa Utilities.formatDate para respeitar o fuso da planilha
  if (val instanceof Date) {
    var s = Utilities.formatDate(val, SHEET_TZ, 'HH:mm');
    var p = s.split(':');
    var h = parseInt(p[0], 10), m = parseInt(p[1], 10);
    if (h === 0 && m === 0) return null;
    return h * 60 + m;
  }
  // String HH:MM
  if (typeof val === 'string') {
    var match = val.match(/^(\d{1,2}):(\d{2})/);
    if (match) return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
  }
  // Número fracionário do Excel (0..1 = 00:00..23:59)
  if (typeof val === 'number' && val > 0 && val < 1) {
    return Math.round(val * 24 * 60);
  }
  return null;
}

// ── Converter valor de data em { dataSortKey, dataStr } ──────────
function parseDate(val) {
  var d = null;
  if (val instanceof Date) {
    d = val;
  } else if (typeof val === 'number') {
    // serial Excel
    d = new Date(Math.round((val - 25569) * 86400 * 1000));
    d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  if (!d || isNaN(d.getTime())) return { dataSortKey: '', dataStr: '—' };
  var y = d.getFullYear(), mo = d.getMonth() + 1, day = d.getDate();
  if (y < 2000 || y > 2100) return { dataSortKey: '', dataStr: '—' }; // data inválida
  var pad = function(n) { return String(n).padStart(2, '0'); };
  var dataSortKey = y + '-' + pad(mo) + '-' + pad(day);
  var hojeKey = Utilities.formatDate(new Date(), SHEET_TZ, 'yyyy-MM-dd');
  if (dataSortKey > hojeKey) return { dataSortKey: '', dataStr: '—' }; // data futura — provável erro de digitação na planilha
  return {
    dataSortKey: dataSortKey,
    dataStr:     pad(day) + '/' + pad(mo) + '/' + y
  };
}

// ── Chave de deduplicação (igual ao impRowKey no site) ────────────
function rowKey(d) {
  return (d.data_sort_key || '') + '|' + (d.empresa || '') + '|' + (d.sap || '') + '|' + (d.chegada_min != null ? d.chegada_min : '');
}

// ── Chamada REST ao Supabase ──────────────────────────────────────
function supaFetch(method, path, body) {
  var options = {
    method: method,
    headers: {
      'apikey':        SUPABASE_KEY,
      'Authorization': 'Bearer ' + SUPABASE_KEY,
      'Content-Type':  'application/json',
      'Prefer':        'return=minimal'
    },
    muteHttpExceptions: true
  };
  if (body) options.payload = JSON.stringify(body);
  var resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/' + path, options);
  var code = resp.getResponseCode();
  if (code >= 400) throw new Error('Supabase ' + method + ' ' + path + ' → ' + code + ': ' + resp.getContentText().slice(0, 300));
  var txt = resp.getContentText();
  return txt ? JSON.parse(txt) : null;
}

// ── Aquece o Render ANTES de mexer na planilha — a instância free "dorme" com
// inatividade e demora ~50s pra acordar; disparando aqui, esse tempo se sobrepõe ao
// trabalho real do sync (ler a planilha inteira, apagar e reinserir no Supabase),
// em vez de ser um atraso extra bem na hora de buscar o relatório pronto.
function aquecerRelatorio_() {
  try { UrlFetchApp.fetch(RELATORIO_URL, { muteHttpExceptions: true }); }
  catch (e) { Logger.log('Aviso: aquecimento do Render falhou (não é crítico): ' + e.message); }
}

// ── Função principal — chamada pelo trigger diário ────────────────
function syncToSupabase() {
  aquecerRelatorio_();
  var ss   = SpreadsheetApp.getActiveSpreadsheet();
  SHEET_TZ = ss.getSpreadsheetTimeZone(); // captura fuso real da planilha
  var ws   = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
  if (!ws) throw new Error('Aba "' + SHEET_NAME + '" não encontrada.');

  var allValues = ws.getDataRange().getValues();
  Logger.log('Aba ativa: "' + ws.getName() + '" | Linhas: ' + allValues.length + ' | Colunas: ' + (allValues[0]||[]).length);
  Logger.log('Linha 1 (raw): ' + JSON.stringify((allValues[0]||[]).slice(0,20).map(function(v){return String(v).slice(0,30);})));
  if (allValues.length < 2) { Logger.log('Planilha vazia.'); return; }

  // Detecta cabeçalho (busca nas 5 primeiras linhas)
  var hdrIdx = 0, hdr = [];
  for (var ri = 0; ri < Math.min(allValues.length, 5); ri++) {
    var cand = allValues[ri].map(function(h) { return String(h).trim(); });
    Logger.log('Testando linha ' + ri + ': ' + JSON.stringify(cand.slice(0,20)));
    if (cand.some(function(h) { return /Chegada|Empresa|Data|SAP/i.test(h); })) {
      hdr = cand; hdrIdx = ri; break;
    }
  }
  if (!hdr.length) { hdr = allValues[0].map(function(h) { return String(h).trim(); }); }
  Logger.log('Cabeçalho detectado (linha ' + hdrIdx + '): ' + JSON.stringify(hdr.slice(0,20)));

  // Mapeamento de índices de coluna
  function col(patterns) {
    for (var i = 0; i < hdr.length; i++) {
      var h = hdr[i].toUpperCase();
      for (var p = 0; p < patterns.length; p++) {
        if (h.indexOf(patterns[p].toUpperCase()) >= 0) return i;
      }
    }
    return -1;
  }
  var iData    = col(['Data']);
  var iEmp     = col(['Empresa']);
  var iSap     = col(['Nº Sap', 'N° Sap', 'SAP', 'Sap']);
  var iProd    = col(['Produto']);
  var iDesc    = col(['Descrição', 'Descricao', 'DESCRI']);
  var iCheg    = col(['Chegada']);
  var iPts     = col(['PTS']);
  var iIni     = col(['Inicio', 'Início']);
  var iAlmIni  = col(['Alm_ini', 'Alm_Ini', 'ALM_INI', 'Almoço Ini']);
  var iAlmFim  = col(['Alm_fim', 'Alm_Fim', 'ALM_FIM', 'Almoço Fim']);
  var iTerm    = col(['Termino', 'Término', 'TERMINO']);
  var iFisc    = col(['Fiscal']);
  var iProblId = col(['Problema Identificado', 'PROBLEMA IDENTIFICADO', 'Problema_ID', 'ProblemaId']);
  var iDescProb= col(['Descrição do Problema', 'Descricao do Problema', 'DESC_PROBLEMA', 'DescProblema']);

  Logger.log('Colunas: data=' + iData + ' emp=' + iEmp + ' sap=' + iSap + ' cheg=' + iCheg + ' pts=' + iPts + ' ini=' + iIni + ' term=' + iTerm + ' problId=' + iProblId + ' descProb=' + iDescProb);

  // ── 1. Lê justificativas/ações existentes no Supabase ────────────
  var existing = supaFetch('GET', 'improdutividade?select=data_sort_key,empresa,sap,chegada_min,justificativa,acao&justificativa=neq.&limit=10000', null) || [];
  var acaoExist = supaFetch('GET', 'improdutividade?select=data_sort_key,empresa,sap,chegada_min,acao&acao=neq.&limit=10000', null) || [];
  var justMap = {}, acaoMap = {};
  existing.forEach(function(r) {
    var k = rowKey(r);
    if (r.justificativa) justMap[k] = r.justificativa;
  });
  acaoExist.forEach(function(r) {
    var k = rowKey(r);
    if (r.acao) acaoMap[k] = r.acao;
  });

  // ── 2. Processa linhas da planilha ────────────────────────────────
  var rows = [];
  for (var ri2 = hdrIdx + 1; ri2 < allValues.length; ri2++) {
    var row = allValues[ri2];
    var chegada = iCheg >= 0 ? timeToMin(row[iCheg]) : null;
    var pts     = iPts  >= 0 ? timeToMin(row[iPts])  : null;
    var inicio  = iIni  >= 0 ? timeToMin(row[iIni])  : null;
    if (chegada === null && pts === null) continue; // linha sem dado de chegada — ignora

    var dateInfo = iData >= 0 ? parseDate(row[iData]) : { dataSortKey: '', dataStr: '—' };
    if (!dateInfo.dataSortKey) continue; // sem data válida — ignora

    var sap       = iSap  >= 0 ? String(row[iSap]  || '—').trim() : '—';
    var empresa   = iEmp  >= 0 ? String(row[iEmp]  || '—').trim() : '—';
    var produto   = iProd >= 0 ? String(row[iProd] || '').trim()  : '';
    var descricao = iDesc >= 0 ? String(row[iDesc] || '').trim()  : '';
    var almIni    = iAlmIni >= 0 ? timeToMin(row[iAlmIni]) : null;
    var almFim    = iAlmFim >= 0 ? timeToMin(row[iAlmFim]) : null;
    var termino   = iTerm >= 0  ? timeToMin(row[iTerm])   : null;

    var rec = {
      data_sort_key: dateInfo.dataSortKey,
      data_str:      dateInfo.dataStr,
      empresa:       empresa,
      sap:           sap,
      produto:       produto,
      descricao:     descricao,
      chegada_min:   chegada,
      pts_min:       pts,
      inicio_min:    inicio,
      alm_ini_min:   almIni,
      alm_fim_min:   almFim,
      termino_min:   termino,
      fiscal:        iFisc    >= 0 ? String(row[iFisc]    || '').trim() : '',
      problema_id:   iProblId >= 0 ? String(row[iProblId] || '').trim() : '',
      desc_problema: iDescProb>= 0 ? String(row[iDescProb]|| '').trim() : '',
      justificativa: null,
      acao:          null
    };
    var k = rowKey(rec);
    if (justMap[k]) rec.justificativa = justMap[k];
    if (acaoMap[k]) rec.acao          = acaoMap[k];
    rows.push(rec);
  }

  Logger.log(rows.length + ' registros processados da planilha.');
  if (!rows.length) { Logger.log('Nenhum registro válido. Sync cancelado.'); return; }

  // ── 3. Apaga tudo e reinseriz em lotes de 500 ─────────────────────
  supaFetch('DELETE', 'improdutividade?id=neq.0', null);
  var BATCH = 500;
  for (var i = 0; i < rows.length; i += BATCH) {
    supaFetch('POST', 'improdutividade', rows.slice(i, i + BATCH));
  }

  Logger.log('✅ Sync concluído: ' + rows.length + ' registros enviados ao Supabase em ' + new Date().toLocaleString('pt-BR'));
  enviarRelatorio();
}

// ── Gera PDF convertendo o próprio HTML do email ─────────────────
function gerarPdfRelatorio(htmlContent, dataFmt) {
  var blob = Utilities.newBlob(htmlContent, 'text/html', 'temp_relatorio.html');
  var file = DriveApp.createFile(blob);
  try {
    var pdf = file.getAs('application/pdf')
      .setName('Produtividade_' + dataFmt.replace(/\//g, '-') + '.pdf');
    return pdf;
  } finally {
    try { file.setTrashed(true); } catch(e2) {}
  }
}

// ── Relatório diário por email ────────────────────────────────────
// Todo o cálculo (KPIs, cards por squad, aderência dos fiscais, evolução de
// chegada/horas/produtivo-improdutivo e a composição do improdutivo) agora mora no
// servidor Node (relatorio.js) — este endpoint já lê direto do Supabase (pega o que o
// sync acabou de gravar) e devolve o HTML pronto do e-mail. Aqui só busca, gera o PDF
// e dispara via GmailApp.
function enviarRelatorio() {
  var resp;
  try {
    resp = UrlFetchApp.fetch(
      RELATORIO_URL + '/api/relatorio-diario?token=' + encodeURIComponent(RELATORIO_TOKEN),
      { muteHttpExceptions: true, followRedirects: true }
    );
  } catch (e) {
    Logger.log('❌ Falha ao buscar relatório no servidor (rede/timeout): ' + e.message);
    return;
  }
  var code = resp.getResponseCode();
  if (code !== 200) {
    Logger.log('❌ Servidor devolveu ' + code + ' ao buscar relatório: ' + resp.getContentText().slice(0, 500));
    return;
  }
  var data;
  try { data = JSON.parse(resp.getContentText()); }
  catch (e) { Logger.log('❌ Resposta do servidor não é JSON válido: ' + e.message); return; }
  if (!data.html) { Logger.log('❌ Servidor não devolveu html. Resposta: ' + resp.getContentText().slice(0, 500)); return; }

  var dataFmt = data.dataFmt || new Date().toLocaleDateString('pt-BR');

  var pdfBlob = null;
  try { pdfBlob = gerarPdfRelatorio(data.html, dataFmt); }
  catch (ePdf) { Logger.log('Aviso: PDF não gerado — ' + ePdf.message); }

  var emailOpts = { htmlBody: data.html };
  if (pdfBlob) emailOpts.attachments = [pdfBlob];

  GmailApp.sendEmail(EMAILS_DESTINO,
    '📊 Produtividade ' + dataFmt,
    'Abra este email em um cliente que suporte HTML.',
    emailOpts
  );
  Logger.log('✅ Email enviado para ' + EMAILS_DESTINO + ' | Data: ' + dataFmt + ' | PDF: ' + (pdfBlob ? 'sim' : 'não gerado'));
}

// ── Teste manual — rode esta função direto no editor do Apps Script (▶ Executar) pra
// disparar o e-mail agora, sem esperar o trigger das 05h nem rodar o sync inteiro. Útil
// pra validar o layout novo antes de confiar na automação diária.
function enviarRelatorioManual() {
  aquecerRelatorio_();
  Utilities.sleep(15000); // dá tempo do Render acordar (~50s no pior caso) antes da chamada de verdade
  enviarRelatorio();
}

// ── Configurar o trigger diário (rode UMA vez manualmente) ────────
function configurarTriggerDiario() {
  // Remove triggers antigos desta função para não duplicar
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'syncToSupabase') ScriptApp.deleteTrigger(t);
  });

  // Cria trigger: todo dia às 05:00 no fuso horário do projeto
  ScriptApp.newTrigger('syncToSupabase')
    .timeBased()
    .atHour(5)        // 05:00 — após lançamentos dos fiscais (23h/00h/madrugada)
    .everyDays(1)
    .create();

  Logger.log('✅ Trigger criado: syncToSupabase roda diariamente às 05h.');
}
