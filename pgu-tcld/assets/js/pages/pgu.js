// assets/js/pages/pgu.js — pagina PGU (Parada Geral de Usina): dashboard, timeline e
// atualizacao rapida de campo. As atualizacoes (status/%, observacoes, encarregado, turno,
// impedimentos) ficam salvas no Supabase (tabelas pgu_overrides/pgu_historico), entao
// sincronizam entre qualquer pessoa/dispositivo (recarrega sozinho a cada ~45s).
(function () {
  "use strict";
  var A = window.App;
  var SUPA_URL = "https://ehbiyqqpzqrluvuqrljp.supabase.co";
  var SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoYml5cXFwenFybHV2dXFybGpwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkzMjM3MTcsImV4cCI6MjA5NDg5OTcxN30.lW_Jdc7SC7FKh9OJPBCYdfN-QMXFTYGjterU3eWOFTc";
  var supa = window.supabase.createClient(SUPA_URL, SUPA_KEY);
  var mainTable;
  var activitiesByUid = {};
  var allAtividades = [];
  var OVERRIDES_CACHE = null; // uid -> objeto de override; populado do Supabase no boot

  // ------------------------------------------------------------ storage (Supabase, compartilhado)

  // loadOverrides() continua sincrona de proposito: todo o resto do arquivo (effective(),
  // recomputeCascade(), os render*()) ja foi escrito assumindo leitura instantanea (era
  // localStorage). Em vez de reescrever essa logica toda pra async, mantemos a LEITURA sobre um
  // cache em memoria (populado uma vez no boot e recarregado periodicamente) e so a GRAVACAO --
  // que nao precisa travar a tela -- vira uma chamada assincrona pro Supabase em segundo plano.
  function loadOverrides() {
    return OVERRIDES_CACHE || {};
  }
  function saveOverrides(obj) {
    var changedUids = Object.keys(obj).filter(function (uid) {
      var prev = OVERRIDES_CACHE ? OVERRIDES_CACHE[uid] : undefined;
      return JSON.stringify(prev) !== JSON.stringify(obj[uid]);
    });
    OVERRIDES_CACHE = obj;
    if (!changedUids.length) return;
    var rows = changedUids.map(function (uid) { return { uid: uid, dados: obj[uid] }; });
    supa.from("pgu_overrides").upsert(rows, { onConflict: "uid" }).then(function (res) {
      if (res.error) {
        console.warn("[PGU] erro ao salvar overrides:", res.error);
        A.toast("Erro ao sincronizar (ficou só neste navegador por enquanto): " + res.error.message, "error");
      }
    });
  }
  async function loadOverridesFromSupabase() {
    try {
      var res = await supa.from("pgu_overrides").select("uid,dados");
      if (res.error) throw res.error;
      var map = {};
      (res.data || []).forEach(function (r) { map[r.uid] = r.dados; });
      OVERRIDES_CACHE = map;
    } catch (e) {
      console.warn("[PGU] erro ao carregar overrides:", e);
      OVERRIDES_CACHE = OVERRIDES_CACHE || {};
      A.toast("Não consegui carregar as atualizações compartilhadas.", "error");
    }
  }
  function pushHistory(entry) {
    supa.from("pgu_historico").insert({ uid: entry.uid, dados: entry }).then(function (res) {
      if (res.error) console.warn("[PGU] erro ao gravar histórico:", res.error);
    });
  }

  function toISODate(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  // Mescla a tarefa do MS Project com a atualizacao local (se houver) do encarregado.
  function effective(a, ov) {
    ov = ov || {};
    return {
      uid: a.uid, nome: a.nome, area: a.area, executante: a.executante,
      // area = TR/ativo (ex.: TCLD 0101SA-01); componente = sistema/parte do TR (ex.: ACIONAMENTO
      // M1); disciplina = Mecânica/Elétrica/Civil -- os 3 vem do nivel do cronograma (WBS).
      componente: a.componente || "", disciplina: a.disciplina || "",
      inicio: a.inicio, termino: a.termino, inicioBaseline: a.inicioBaseline, terminoBaseline: a.terminoBaseline,
      inicioDataHora: a.inicioDataHora, terminoDataHora: a.terminoDataHora,
      milestone: a.milestone, critico: a.critico,
      status: ov.status || a.status,
      percent: (ov.percent !== undefined && ov.percent !== null) ? ov.percent : a.percentComplete,
      observacoes: ov.observacoes || "",
      justificativa: ov.justificativa || "",
      tendencia: ov.tendencia || "",
      // Datas de tendencia: previsao de quando a atividade realmente vai comecar/terminar
      // (diferente do inicio/termino previsto pelo cronograma). Prioridade: 1) o que o
      // encarregado preencheu na mao, 2) reprogramacao automatica calculada a partir do atraso
      // das predecessoras (ver recomputeCascade), 3) enquanto nada foi preenchido, mostra a
      // propria linha de base (nunca fica em branco) -- so passa a valer pra cascata depois que
      // alguem efetivamente preenche/confirma a data.
      inicioTendencia: ov.inicioTendencia || ov.inicioTendenciaAuto || a.inicioBaselineDataHora || "",
      terminoTendencia: ov.terminoTendencia || ov.terminoTendenciaAuto || a.terminoBaselineDataHora || "",
      isTendenciaAuto: !ov.inicioTendencia && !!ov.inicioTendenciaAuto,
      isTendenciaBaseline: !ov.inicioTendencia && !ov.inicioTendenciaAuto && !!a.inicioBaselineDataHora,
      impedimento: ov.impedimento || "",
      // Encarregado, fiscal de obra e fiscal de seguranca agora vem do cronograma (planilha
      // revisao 3); o encarregado responsavel pode corrigir na atualizacao rapida se precisar.
      encarregado: ov.encarregado || a.encarregado || "",
      fiscalObra: ov.fiscalObra || a.fiscalObra || "",
      fiscalSeguranca: ov.fiscalSeguranca || a.fiscalSeguranca || "",
      // Turno vem do cronograma (hora de inicio da tarefa); o encarregado pode sobrescrever na atualizacao.
      turno: ov.turno || a.turno || "",
      atualizadoEm: ov.atualizadoEm || null
    };
  }

  // Deriva o status automaticamente a partir do % de avanco: 0% = nao iniciada, 100% = concluida,
  // qualquer coisa no meio = em andamento. "Atrasada" continua so podendo ser escolhida na mao.
  function statusFromPercent(pct) {
    var p = Number(pct);
    if (p >= 100) return "Concluída";
    if (p <= 0) return "Não iniciada";
    return "Em andamento";
  }

  // Salva um unico campo de override (usado pelos inputs de data inline nas colunas da tabela).
  function saveOverrideField(uid, field, value) {
    var overrides = loadOverrides();
    var anterior = overrides[uid] || {};
    var novo = {};
    for (var k in anterior) { novo[k] = anterior[k]; }
    novo[field] = value;
    if (field === "percent") { novo.status = statusFromPercent(value); }
    novo.atualizadoEm = new Date().toLocaleString("pt-BR");
    overrides[uid] = novo;
    saveOverrides(overrides);
    var atividade = activitiesByUid[uid];
    pushHistory({
      uid: uid, nome: atividade ? atividade.nome : uid, quando: novo.atualizadoEm,
      campo: field, valorAntigo: anterior[field] || "", valorNovo: value || ""
    });
    recomputeCascade();
  }

  function toDatetimeLocal(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0") +
      "T" + String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  }

  function parseDataHora(str) {
    if (!str) return null;
    var d = new Date(String(str).replace(" ", "T"));
    return isNaN(d.getTime()) ? null : d;
  }

  // Reprogramacao em cascata: quando uma atividade fica com tendencia de termino depois do que
  // estava previsto, empurra o inicio das atividades sucessoras (ligacao Termino-Inicio) que
  // ainda nao tem tendencia PROPRIA (manual) preenchida -- e assim por diante, propagando o
  // atraso adiante na cadeia de dependencias do cronograma. So avanca prazos (nunca antecipa) e
  // nunca sobrescreve uma data que o proprio encarregado da atividade sucessora ja digitou.
  // Roda depois de qualquer atualizacao salva (status/%/tendencia) porque qualquer uma delas
  // pode ter mudado o termino efetivo de uma atividade que e predecessora de outras.
  function recomputeCascade() {
    if (!allAtividades.length) return;
    var byUid = {};
    allAtividades.forEach(function (a) { byUid[a.uid] = a; });
    var overrides = loadOverrides();

    // Limpa os valores "auto" anteriores antes de recalcular -- assim, se a causa do atraso for
    // corrigida (ou removida), a reprogramacao em cascata tambem desfaz o que nao se aplica mais.
    allAtividades.forEach(function (a) {
      var ov = overrides[a.uid];
      if (ov && (ov.inicioTendenciaAuto || ov.terminoTendenciaAuto)) {
        var limpo = {};
        for (var k in ov) { if (k !== "inicioTendenciaAuto" && k !== "terminoTendenciaAuto") limpo[k] = ov[k]; }
        overrides[a.uid] = limpo;
      }
    });

    function efetivoTermino(uid) {
      var ov = overrides[uid] || {};
      var d = parseDataHora(ov.terminoTendencia) || parseDataHora(ov.terminoTendenciaAuto);
      if (d) return d;
      var a = byUid[uid];
      return a ? parseDataHora(a.terminoDataHora) : null;
    }

    var mudou = true, passo = 0;
    while (mudou && passo < 15) {
      mudou = false; passo++;
      allAtividades.forEach(function (a) {
        var ov = overrides[a.uid] || {};
        if (ov.inicioTendencia) return; // encarregado ja definiu a propria tendencia -- respeita
        var inicioPlan = parseDataHora(a.inicioDataHora);
        var terminoPlan = parseDataHora(a.terminoDataHora);
        if (!inicioPlan || !terminoPlan) return;
        var duracaoMs = terminoPlan.getTime() - inicioPlan.getTime();

        var maiorFimPred = null;
        (a.predecessores || []).forEach(function (p) {
          if (p.tipo !== 1) return; // so considera ligacoes Termino-Inicio
          var fim = efetivoTermino(p.uid);
          if (!fim) return;
          var comLag = new Date(fim.getTime() + (p.lagMin || 0) * 60000);
          if (!maiorFimPred || comLag > maiorFimPred) maiorFimPred = comLag;
        });
        if (!maiorFimPred || maiorFimPred <= inicioPlan) return;

        var novoInicioStr = toDatetimeLocal(maiorFimPred);
        if (ov.inicioTendenciaAuto === novoInicioStr) return;

        var atualizado = {};
        for (var k in ov) { atualizado[k] = ov[k]; }
        atualizado.inicioTendenciaAuto = novoInicioStr;
        atualizado.terminoTendenciaAuto = toDatetimeLocal(new Date(maiorFimPred.getTime() + duracaoMs));
        overrides[a.uid] = atualizado;
        mudou = true;
      });
    }
    saveOverrides(overrides);
  }

  function statusBadgeClass(status) {
    if (status === "Concluída") return "farol-concluido";
    if (status === "Atrasada") return "farol-atrasado";
    if (status === "Em andamento") return "farol-noprazo";
    return "dim";
  }

  function fmtDataHora(dh) {
    if (!dh) return "—";
    var p = String(dh).replace("T", " ").split(" ");
    var d = p[0].split("-");
    return d[2] + "/" + d[1] + (p[1] ? " " + p[1] : "");
  }

  function farolDe(eff) {
    if (eff.status === "Concluída") return "verde";
    if (eff.status === "Atrasada") return "vermelho";
    if (eff.tendencia === "Atrasada" || eff.tendencia === "Risco de atraso") return "amarelo";
    if (eff.status === "Em andamento") return "verde";
    if (eff.status === "Não iniciada" && eff.inicio) {
      var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
      var dias = Math.round((new Date(eff.inicio) - hoje) / 86400000);
      if (dias <= 2) return "amarelo";
    }
    return "verde";
  }
  function farolEmoji(f) { return f === "vermelho" ? "🔴" : f === "amarelo" ? "🟡" : "🟢"; }

  function kpiCard(icon, label, value, cls, hint) {
    return '<div class="kpi-card ' + (cls || "") + '"><div class="kpi-card__icon">' + icon + "</div>" +
      '<div class="kpi-card__label">' + A.esc(label) + '</div><div class="kpi-card__value">' + value + "</div>" +
      (hint ? '<div class="kpi-card__hint">' + A.esc(hint) + "</div>" : "") +
      '<div class="kpi-card__bar"></div></div>';
  }

  function miniProgress(pct) {
    pct = pct || 0;
    return '<div style="display:flex;align-items:center;gap:6px;min-width:110px;">' +
      '<div class="bar-row__track" style="height:8px;flex:1;"><div class="bar-row__fill" style="width:' + pct + '%;"></div></div>' +
      '<span style="font-size:11px;color:var(--vale-gray);width:32px;text-align:right;">' + Math.round(pct) + "%</span></div>";
  }

  function buildFarolStack(effs, keyFn) {
    var groups = {};
    effs.forEach(function (e) {
      var k = keyFn(e) || "—";
      if (!groups[k]) groups[k] = { verde: 0, amarelo: 0, vermelho: 0, total: 0 };
      groups[k][farolDe(e)]++;
      groups[k].total++;
    });
    return Object.keys(groups).map(function (k) {
      var g = groups[k];
      return {
        label: k, total: g.total,
        segments: [
          { label: "Atrasado", value: g.vermelho, color: "#D93025" },
          { label: "Em risco", value: g.amarelo, color: "#F2A900" },
          { label: "No prazo / concluído", value: g.verde, color: "#2E9E4B" }
        ]
      };
    }).sort(function (a, b) { return b.total - a.total; });
  }

  // ------------------------------------------------------------ drawer (atualizacao rapida)

  var STATUS_OPTIONS = ["Não iniciada", "Em andamento", "Concluída", "Atrasada"];
  var PERCENT_OPTIONS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
  var TENDENCIA_OPTIONS = ["Conclui hoje", "Conclui amanhã", "Mais dois dias", "Atrasada", "Risco de atraso"];
  var IMPEDIMENTO_OPTIONS = ["Material", "Equipamento", "Equipe", "Clima", "Segurança", "Outro"];
  var TURNO_OPTIONS = ["07h–17h", "17h–00h", "00h–07h"];

  function closeDrawer() {
    var el = A.$("pguDrawerOverlay");
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  function chipsHtml(containerId, dataAttr, options, current, extraCls) {
    return '<div class="chip-grid" id="' + containerId + '">' + options.map(function (opt) {
      return '<button type="button" class="chip-option' + (extraCls || "") + (current === opt ? " active" : "") +
        '" ' + dataAttr + '="' + A.esc(opt) + '">' + A.esc(opt) + (dataAttr === "data-percent" ? "%" : "") + "</button>";
    }).join("") + "</div>";
  }

  function wireChips(containerId, dataAttr, state, stateKey, isNumber) {
    A.$(containerId).querySelectorAll(".chip-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var val = btn.getAttribute(dataAttr);
        var already = btn.classList.contains("active");
        A.$(containerId).querySelectorAll(".chip-option").forEach(function (b) { b.classList.remove("active"); });
        if (!already) {
          btn.classList.add("active");
          state[stateKey] = isNumber ? parseInt(val, 10) : val;
        } else {
          state[stateKey] = isNumber ? null : "";
        }
      });
    });
  }

  function openDrawer(activity, onSaved) {
    closeDrawer();
    var overrides = loadOverrides();
    var ov = overrides[activity.uid] || {};
    var eff = effective(activity, ov);

    var overlay = document.createElement("div");
    overlay.className = "drawer-overlay";
    overlay.id = "pguDrawerOverlay";
    overlay.innerHTML =
      '<div class="drawer">' +
        '<div class="drawer__header"><div><div class="drawer__title">' + A.esc(activity.nome) + "</div>" +
          '<div class="drawer__meta">' + A.esc(activity.area || "—") + (activity.executante ? " · " + A.esc(activity.executante) : "") +
          (activity.termino ? " · prazo " + A.fmtDate(activity.termino) : "") + "</div>" +
          (eff.fiscalObra || eff.fiscalSeguranca ? '<div class="drawer__meta">' +
            (eff.fiscalObra ? "👷 Fiscal de campo: " + A.esc(eff.fiscalObra) : "") +
            (eff.fiscalObra && eff.fiscalSeguranca ? " · " : "") +
            (eff.fiscalSeguranca ? "🦺 Fiscal de segurança: " + A.esc(eff.fiscalSeguranca) : "") +
            "</div>" : "") +
          "</div>" +
          '<button type="button" class="drawer__close" id="pguDrawerClose">✕</button></div>' +

        '<div class="drawer__field"><label class="drawer__label">Status</label>' + chipsHtml("pguStatusChips", "data-status", STATUS_OPTIONS, eff.status) + "</div>" +
        '<div class="drawer__field"><label class="drawer__label">Percentual de avanço</label>' + chipsHtml("pguPercentChips", "data-percent", PERCENT_OPTIONS, eff.percent, " percent-chip") + "</div>" +
        '<div class="drawer__field"><label class="drawer__label">Tendência de conclusão</label>' + chipsHtml("pguTendenciaChips", "data-tendencia", TENDENCIA_OPTIONS, eff.tendencia) + "</div>" +
        '<div class="drawer__field"><label class="drawer__label">Início tendência (previsão real)</label><input type="datetime-local" id="pguInicioTendencia" value="' +
          A.esc(ov.inicioTendencia || (eff.isTendenciaAuto ? "" : eff.inicioTendencia)) + '"></div>' +
        '<div class="drawer__field"><label class="drawer__label">Término tendência (previsão real)</label><input type="datetime-local" id="pguTerminoTendencia" value="' +
          A.esc(ov.terminoTendencia || (eff.isTendenciaAuto ? "" : eff.terminoTendencia)) + '"></div>' +
        (eff.isTendenciaBaseline ? '<div class="drawer__updated" style="text-align:left;background:var(--light-gray);border-radius:6px;padding:8px 10px;margin-top:-8px;">📐 Ainda igual à linha de base. Muda pra "tendência" de verdade quando você salvar (mesmo sem editar a data).</div>' : "") +
        (eff.isTendenciaAuto ? '<div class="drawer__updated" style="text-align:left;background:rgba(60,181,229,0.1);border-radius:6px;padding:8px 10px;margin-top:-8px;">🔄 Reprogramado automaticamente (atraso em predecessora): ' +
          A.esc(fmtDataHora(eff.inicioTendencia)) + " → " + A.esc(fmtDataHora(eff.terminoTendencia)) + ". Preencha acima pra confirmar ou ajustar.</div>" : "") +
        '<div class="drawer__field"><label class="drawer__label">Justificativa (se houver desvio)</label><textarea id="pguJustificativa" placeholder="Explique o motivo se a atividade estiver atrasada/adiantada em relação ao previsto...">' + A.esc(eff.justificativa) + "</textarea></div>" +
        '<div class="drawer__field"><label class="drawer__label">Impedimento (se houver)</label>' + chipsHtml("pguImpedimentoChips", "data-impedimento", IMPEDIMENTO_OPTIONS, eff.impedimento, " impediment") + "</div>" +
        '<div class="drawer__field"><label class="drawer__label">Turno</label>' + chipsHtml("pguTurnoChips", "data-turno", TURNO_OPTIONS, eff.turno) + "</div>" +
        '<div class="drawer__field"><label class="drawer__label">Encarregado</label><input type="text" id="pguEncarregado" value="' + A.esc(eff.encarregado) + '" placeholder="Nome do encarregado"></div>' +
        '<div class="drawer__field"><label class="drawer__label">Observações</label><textarea id="pguObservacoes" placeholder="Observações de campo...">' + A.esc(eff.observacoes) + "</textarea></div>" +
        '<button type="button" class="drawer__save" id="pguDrawerSave">💾 Salvar atualização</button>' +
        (eff.atualizadoEm ? '<div class="drawer__updated">Última atualização: ' + A.esc(eff.atualizadoEm) + "</div>" : "") +
        '<div class="drawer__updated">Ao salvar, fica visível pra todo mundo em campo (sincroniza sozinho).</div>' +
      "</div>";
    document.body.appendChild(overlay);

    var state = { status: eff.status, percent: eff.percent, tendencia: eff.tendencia, impedimento: eff.impedimento, turno: eff.turno };
    wireChips("pguStatusChips", "data-status", state, "status", false);
    wireChips("pguPercentChips", "data-percent", state, "percent", true);
    wireChips("pguTendenciaChips", "data-tendencia", state, "tendencia", false);
    wireChips("pguImpedimentoChips", "data-impedimento", state, "impedimento", false);
    wireChips("pguTurnoChips", "data-turno", state, "turno", false);

    // Ao mudar o % de avanco, atualiza o status junto (0% = nao iniciada, 100% = concluida, meio = em
    // andamento) -- roda depois do wireChips acima, entao o state.percent ja esta atualizado aqui.
    A.$("pguPercentChips").querySelectorAll(".chip-option").forEach(function (btn) {
      btn.addEventListener("click", function () {
        if (state.percent === null || state.percent === undefined) return;
        var novoStatus = statusFromPercent(state.percent);
        state.status = novoStatus;
        A.$("pguStatusChips").querySelectorAll(".chip-option").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-status") === novoStatus);
        });
      });
    });

    overlay.addEventListener("click", function (e) { if (e.target === overlay) closeDrawer(); });
    A.$("pguDrawerClose").addEventListener("click", closeDrawer);

    A.$("pguDrawerSave").addEventListener("click", function () {
      var novo = {
        status: state.status || activity.status,
        percent: (state.percent !== null && state.percent !== undefined) ? state.percent : eff.percent,
        tendencia: state.tendencia || "",
        inicioTendencia: A.$("pguInicioTendencia").value || "",
        terminoTendencia: A.$("pguTerminoTendencia").value || "",
        impedimento: state.impedimento || "",
        encarregado: A.$("pguEncarregado").value.trim(),
        turno: state.turno || "",
        observacoes: A.$("pguObservacoes").value.trim(),
        justificativa: A.$("pguJustificativa").value.trim(),
        atualizadoEm: new Date().toLocaleString("pt-BR")
      };
      var overridesNow = loadOverrides();
      var anterior = overridesNow[activity.uid] || {};
      overridesNow[activity.uid] = novo;
      saveOverrides(overridesNow);
      pushHistory({
        uid: activity.uid, nome: activity.nome, quando: novo.atualizadoEm,
        statusAntigo: anterior.status || activity.status, statusNovo: novo.status,
        percentAntigo: (anterior.percent !== undefined && anterior.percent !== null) ? anterior.percent : activity.percentComplete,
        percentNovo: novo.percent
      });
      recomputeCascade();
      closeDrawer();
      A.toast("Atividade atualizada.");
      if (onSaved) onSaved();
    });
  }

  // ------------------------------------------------------------ Tab: Hoje

  var hojeSelectedDate = null; // yyyy-MM-dd escolhido na linha do tempo da PGU (persiste entre re-renders)
  var lastEffs = [];
  // "fiscalObra|disciplina" -> turno predominante desse fiscal NAQUELA disciplina (maioria das
  // atividades dele ali), recalculado a cada renderAll(). Separado por disciplina porque um mesmo
  // fiscal pode atender mais de uma disciplina em turnos diferentes -- calcular só por fiscal
  // misturaria isso e geraria falso positivo. Usado só pra sinalizar quando uma atividade tem
  // turno (calculado pela hora) diferente do habitual do fiscal nessa disciplina.
  var FISCAL_TURNO_PREDOMINANTE = {};
  function fiscalDisciplinaKey(fiscal, disciplina) { return fiscal + "|" + (disciplina || ""); }
  function computeFiscalTurnoPredominante(effs) {
    var tally = {};
    effs.forEach(function (e) {
      if (!e.fiscalObra || !e.turno) return;
      var k = fiscalDisciplinaKey(e.fiscalObra, e.disciplina);
      if (!tally[k]) tally[k] = {};
      tally[k][e.turno] = (tally[k][e.turno] || 0) + 1;
    });
    var result = {};
    Object.keys(tally).forEach(function (k) {
      var counts = tally[k], best = null, bestCount = 0, total = 0;
      Object.keys(counts).forEach(function (turno) {
        total += counts[turno];
        if (counts[turno] > bestCount) { bestCount = counts[turno]; best = turno; }
      });
      // só marca "turno habitual" com uma amostra minima, senão uma combinação com 1 atividade
      // sempre "bate" trivialmente com ela mesma e o aviso perde o sentido.
      if (total >= 3 && best) result[k] = best;
    });
    return result;
  }
  function turnoHabitualDe(e) {
    return FISCAL_TURNO_PREDOMINANTE[fiscalDisciplinaKey(e.fiscalObra, e.disciplina)];
  }
  function turnoDivergente(e) {
    var esperado = turnoHabitualDe(e);
    return !!(esperado && e.turno && e.turno !== esperado);
  }
  // Quais grupos (TR/componente/disciplina) estao abertos na arvore -- guardado por chave estavel
  // pra sobreviver a um re-render (ex.: quando o encarregado preenche o avanco de uma atividade),
  // em vez de recolher tudo de volta toda vez que a tela atualiza.
  var groupOpenState = {};
  // Cada filtro agora é uma lista (caixa de seleção com checkbox) em vez de um valor único.
  var hojeFilters = { turno: [], executante: [], encarregado: [], fiscalObra: [], fiscalSeguranca: [] };

  function applyHojeFilters(effs) {
    return effs.filter(function (e) {
      if (hojeFilters.turno.length && hojeFilters.turno.indexOf(e.turno) < 0) return false;
      if (hojeFilters.executante.length && hojeFilters.executante.indexOf(e.executante) < 0) return false;
      if (hojeFilters.encarregado.length && hojeFilters.encarregado.indexOf(e.encarregado) < 0) return false;
      if (hojeFilters.fiscalObra.length && hojeFilters.fiscalObra.indexOf(e.fiscalObra) < 0) return false;
      if (hojeFilters.fiscalSeguranca.length && hojeFilters.fiscalSeguranca.indexOf(e.fiscalSeguranca) < 0) return false;
      return true;
    });
  }

  function activityRowHeadHtml() {
    return '<div class="activity-row-head">' +
      '<div class="activity-row-head__farol"></div>' +
      '<div class="activity-row-head__encarregado">Encarregado</div>' +
      '<div class="activity-row-head__main">Atividade</div>' +
      '<div class="activity-row-head__empresa">Empresa</div>' +
      '<div class="activity-row-head__inicio">Início previsto</div>' +
      '<div class="activity-row-head__termino">Término previsto</div>' +
      '<div class="activity-row-head__tend">Início tendência</div>' +
      '<div class="activity-row-head__tend">Término tendência</div>' +
      '<div class="activity-row-head__status">Status</div>' +
      '<div class="activity-row-head__pct">Avanço</div>' +
      "</div>";
  }

  // Campos editaveis direto na linha (status, %, inicio/termino tendencia) -- sem precisar abrir
  // o painel lateral. Clicar no NOME da atividade continua abrindo o painel completo (observacoes,
  // impedimento, encarregado etc.).
  function activityRowHtml(e) {
    var statusSelect = '<select class="pgu-inline-select pgu-inline-field" data-uid="' + A.esc(e.uid) + '" data-field="status">' +
      STATUS_OPTIONS.map(function (s) { return '<option value="' + A.esc(s) + '"' + (e.status === s ? " selected" : "") + '>' + A.esc(s) + "</option>"; }).join("") +
      "</select>";
    var percentSelect = '<select class="pgu-inline-select pgu-inline-field" data-uid="' + A.esc(e.uid) + '" data-field="percent">' +
      PERCENT_OPTIONS.map(function (p) { return '<option value="' + p + '"' + (Number(e.percent) === p ? " selected" : "") + '>' + p + "%</option>"; }).join("") +
      "</select>";
    var tendAutoCls = (e.isTendenciaAuto || e.isTendenciaBaseline) ? " pgu-tend-input--auto" : "";
    var tendAutoTitle = e.isTendenciaAuto ? ' title="Reprogramado automaticamente por atraso em predecessora — ajuste se necessário"' :
      (e.isTendenciaBaseline ? ' title="Ainda igual à linha de base — preencha pra confirmar a tendência real"' : "");
    var inicioTendInput = '<input type="datetime-local" class="pgu-tend-input pgu-inline-field' + tendAutoCls + '"' + tendAutoTitle + ' data-uid="' + A.esc(e.uid) + '" data-field="inicioTendencia" value="' + A.esc(e.inicioTendencia) + '">';
    var terminoTendInput = '<input type="datetime-local" class="pgu-tend-input pgu-inline-field' + tendAutoCls + '"' + tendAutoTitle + ' data-uid="' + A.esc(e.uid) + '" data-field="terminoTendencia" value="' + A.esc(e.terminoTendencia) + '">';
    var turnoAvisoHtml = turnoDivergente(e)
      ? ' <span class="badge farol-atrasado" title="Turno diferente do habitual do fiscal ' + A.esc(e.fiscalObra) + ' em ' + A.esc(e.disciplina || "—") + ' (normalmente ' + A.esc(turnoHabitualDe(e)) + ')">⚠ turno atípico</span>'
      : "";

    return '<div class="activity-row" data-uid="' + A.esc(e.uid) + '">' +
      '<div class="activity-row__farol">' + farolEmoji(farolDe(e)) + "</div>" +
      '<div class="activity-row__encarregado" title="' + A.esc(e.encarregado || "") + '">' + (e.encarregado ? A.esc(e.encarregado) : "—") + "</div>" +
      '<div class="activity-row__main">' +
        '<span class="activity-row__nome pgu-open" data-uid="' + A.esc(e.uid) + '">' + A.esc(e.nome) + "</span>" +
        '<div class="activity-row__meta">' + A.esc(e.area || "—") +
          (e.turno ? " · " + A.esc(e.turno) : "") + turnoAvisoHtml + "</div>" +
      "</div>" +
      '<div class="activity-row__empresa" title="' + A.esc(e.executante || "") + '">' + (e.executante ? A.esc(e.executante) : "—") + "</div>" +
      '<div class="activity-row__inicio">' + fmtDataHora(e.inicioDataHora) + "</div>" +
      '<div class="activity-row__termino">' + fmtDataHora(e.terminoDataHora) + "</div>" +
      '<div class="activity-row__tend">' + inicioTendInput + "</div>" +
      '<div class="activity-row__tend">' + terminoTendInput + "</div>" +
      '<div class="activity-row__status">' + statusSelect + "</div>" +
      '<div class="activity-row__pct">' + percentSelect + "</div></div>";
  }

  var TODA_PGU = "ALL";

  function pguDayChipsHtml(pguInicio, pguFim, hojeStr, selecionado) {
    if (!pguInicio || !pguFim) return "";
    var chips = '<button type="button" class="chip-option' + (selecionado === TODA_PGU ? " active" : "") + '" data-dia="' + TODA_PGU + '">📅 Toda a PGU</button>';
    var cur = new Date(pguInicio + "T00:00:00");
    var end = new Date(pguFim + "T00:00:00");
    while (cur <= end) {
      var d = toISODate(cur);
      var isHoje = d === hojeStr;
      var isSel = d === selecionado;
      chips += '<button type="button" class="chip-option' + (isSel ? " active" : "") + '" data-dia="' + d + '" style="position:relative;">' +
        d.slice(8, 10) + "/" + d.slice(5, 7) + (isHoje ? '<span style="position:absolute;top:-6px;right:-4px;font-size:9px;">📍</span>' : "") +
        "</button>";
      cur.setDate(cur.getDate() + 1);
    }
    return '<div class="chip-grid">' + chips + "</div>";
  }

  var SEM_CLASSIFICACAO = "Sem classificação";

  function groupBy(effs, keyFn) {
    var groups = {}, order = [];
    effs.forEach(function (e) {
      var k = keyFn(e) || SEM_CLASSIFICACAO;
      if (!groups[k]) { groups[k] = []; order.push(k); }
      groups[k].push(e);
    });
    return order.map(function (k) { return { label: k, itens: groups[k] }; });
  }

  // Cor de destaque por disciplina -- pra bater o olho rapido de que tipo de servico e (e "Limpeza"
  // pras atividades que nao caem em nenhuma pasta de disciplina do cronograma).
  function disciplinaColor(nome) {
    var n = (nome || "").toUpperCase();
    if (n.indexOf("MEC") === 0) return "#3CB5E5";
    if (n.indexOf("EL") === 0) return "#F2A900";
    if (n.indexOf("CIV") === 0) return "#7B61FF";
    if (n.indexOf("LIMP") === 0) return "#2E9E4B";
    return "#747678";
  }

  // Agrupa as atividades por TR/ativo -> Componente -> Disciplina (o mesmo WBS do cronograma da
  // PGU) em vez de lista lisa. Cada nivel tem um estilo bem diferente (cartao / faixa azul /
  // pilula colorida) pra ficar facil de distinguir onde voce esta na hierarquia.
  // Se o grupo nao tiver classificacao, nao mostra a pilula/faixa "Sem classificação" -- so joga a
  // atividade direto na lista, sem cabecalho nem details (nada pra abrir/fechar ali).
  function groupedActivityListHtml(effs) {
    if (!effs.length) return '<div class="table-caption">Nenhuma atividade encontrada com os filtros atuais.</div>';
    var porTR = groupBy(effs, function (e) { return e.area; });
    var html = porTR.map(function (trGroup) {
      var porComp = groupBy(trGroup.itens, function (e) { return e.componente; });
      var compHtml = porComp.map(function (compGroup) {
        var porDisc = groupBy(compGroup.itens, function (e) { return e.disciplina; });
        var discHtml = porDisc.map(function (discGroup) {
          var body = '<div class="pgu-group__body"><div class="activity-list-wrap">' + activityRowHeadHtml() + discGroup.itens.map(activityRowHtml).join("") + "</div></div>";
          if (discGroup.label === SEM_CLASSIFICACAO) return body;
          var key = "disc:" + trGroup.label + "|" + compGroup.label + "|" + discGroup.label;
          return '<details class="pgu-group-disciplina" data-gkey="' + A.esc(key) + '"' + (groupOpenState[key] ? " open" : "") + '><summary style="background:' + disciplinaColor(discGroup.label) + ';">' +
            A.esc(discGroup.label) +
            '<span class="pgu-group__count">' + discGroup.itens.length + "</span>" +
            "</summary>" + body + "</details>";
        }).join("");
        if (compGroup.label === SEM_CLASSIFICACAO) return '<div class="pgu-group__body">' + discHtml + "</div>";
        var keyC = "comp:" + trGroup.label + "|" + compGroup.label;
        return '<details class="pgu-group-componente" data-gkey="' + A.esc(keyC) + '"' + (groupOpenState[keyC] ? " open" : "") + '><summary>' +
          "⚙️ " + A.esc(compGroup.label) +
          '<span class="pgu-group__count">' + compGroup.itens.length + "</span>" +
          "</summary>" +
          '<div class="pgu-group__body">' + discHtml + "</div>" +
          "</details>";
      }).join("");
      if (trGroup.label === SEM_CLASSIFICACAO) return '<div class="pgu-group__body">' + compHtml + "</div>";
      var keyT = "tr:" + trGroup.label;
      return '<details class="pgu-group-tr" data-gkey="' + A.esc(keyT) + '"' + (groupOpenState[keyT] ? " open" : "") + '><summary>' +
        "🛠️ " + A.esc(trGroup.label) +
        '<span class="pgu-group__count">' + trGroup.itens.length + " atividades</span>" +
        "</summary>" +
        '<div class="pgu-group__body">' + compHtml + "</div>" +
        "</details>";
    }).join("");
    return '<div id="pguGroupedTree">' + html + "</div>";
  }

  // Grupo de botoes (igual a linha do tempo) para um filtro de valor unico, com um botao "Todos"
  // pra limpar. options: array de strings.
  function chipFilterHtml(dataAttr, options, current, allLabel) {
    var html = '<button type="button" class="chip-option' + (!current ? " active" : "") + '" ' + dataAttr + '="">' + (allLabel || "Todos") + "</button>";
    html += options.map(function (opt) {
      return '<button type="button" class="chip-option' + (current === opt ? " active" : "") + '" ' + dataAttr + '="' + A.esc(opt) + '">' + A.esc(opt) + "</button>";
    }).join("");
    return '<div class="chip-grid">' + html + "</div>";
  }

  function renderHoje(effsAll) {
    lastEffs = effsAll;
    var container = A.$("pguHojeContent");
    var hojeReal = new Date(); hojeReal.setHours(0, 0, 0, 0);
    var hojeStr = toISODate(hojeReal);

    // Datas/contagem regressiva sempre baseadas no conjunto completo (o cronograma da PGU nao muda com o filtro)
    var datas = [];
    effsAll.forEach(function (e) { if (e.inicio) datas.push(e.inicio); if (e.termino) datas.push(e.termino); });
    var pguInicio = datas.length ? datas.reduce(function (a, b) { return a < b ? a : b; }) : null;
    var pguFim = datas.length ? datas.reduce(function (a, b) { return a > b ? a : b; }) : null;
    var diasParaInicio = pguInicio ? Math.round((new Date(pguInicio) - hojeReal) / 86400000) : null;
    var diasParaFim = pguFim ? Math.round((new Date(pguFim) - hojeReal) / 86400000) : null;

    if (!hojeSelectedDate) {
      hojeSelectedDate = (pguInicio && hojeStr < pguInicio) ? pguInicio : ((pguFim && hojeStr > pguFim) ? pguFim : hojeStr);
    }
    var diaStr = hojeSelectedDate;
    var vendoTodaPgu = diaStr === TODA_PGU;
    var vendoHojeReal = diaStr === hojeStr;

    var bannerTexto, bannerValor;
    if (diasParaInicio !== null && diasParaInicio > 0) {
      bannerTexto = "A PGU começa em"; bannerValor = diasParaInicio + " dia" + (diasParaInicio === 1 ? "" : "s");
    } else if (diasParaFim !== null && diasParaFim >= 0) {
      bannerTexto = "PGU em andamento"; bannerValor = "Término previsto " + A.fmtDate(pguFim);
    } else {
      bannerTexto = "PGU"; bannerValor = pguFim ? "Concluída em " + A.fmtDate(pguFim) : "Sem datas";
    }

    var execOptions = A.distinctValues(effsAll.filter(function (e) { return e.executante; }), "executante").map(function (o) { return o.value; });
    var encarregadoOptions = A.distinctValues(effsAll.filter(function (e) { return e.encarregado; }), "encarregado").map(function (o) { return o.value; });
    var fiscalObraOptions = A.distinctValues(effsAll.filter(function (e) { return e.fiscalObra; }), "fiscalObra").map(function (o) { return o.value; });
    var fiscalSegurancaOptions = A.distinctValues(effsAll.filter(function (e) { return e.fiscalSeguranca; }), "fiscalSeguranca").map(function (o) { return o.value; });

    var algumFiltroAtivo = hojeFilters.turno.length || hojeFilters.executante.length || hojeFilters.encarregado.length || hojeFilters.fiscalObra.length || hojeFilters.fiscalSeguranca.length;
    var filtrosHtml =
      '<div style="display:flex;flex-wrap:wrap;gap:20px;margin-bottom:18px;">' +
        '<div><label class="filter-toolbar__label">Encarregado</label>' + A.multiSelect("msHojeEncarregado", encarregadoOptions, hojeFilters.encarregado, "Todos") + "</div>" +
        '<div><label class="filter-toolbar__label">Fiscal de Campo</label>' + A.multiSelect("msHojeFiscalObra", fiscalObraOptions, hojeFilters.fiscalObra, "Todos") + "</div>" +
        '<div><label class="filter-toolbar__label">Fiscal de Segurança</label>' + A.multiSelect("msHojeFiscalSeguranca", fiscalSegurancaOptions, hojeFilters.fiscalSeguranca, "Todos") + "</div>" +
      "</div>" +
      '<div style="display:flex;flex-wrap:wrap;gap:20px;">' +
        '<div><label class="filter-toolbar__label">Empresa</label>' + A.multiSelect("msHojeEmpresa", execOptions, hojeFilters.executante, "Todas") + "</div>" +
        '<div><label class="filter-toolbar__label">Turno</label>' + A.multiSelect("msHojeTurno", TURNO_OPTIONS, hojeFilters.turno, "Todos") + "</div>" +
      "</div>" +
      (algumFiltroAtivo ? '<button type="button" class="filter-toolbar__clear" id="pguHojeClearFiltros" style="margin-top:14px;">✕ Limpar filtros</button>' : "");

    var effs = applyHojeFilters(effsAll);
    var doDia = vendoTodaPgu ? effs : effs.filter(function (e) { return e.inicio && e.termino && e.inicio <= diaStr && e.termino >= diaStr; });
    var atrasadas = effs.filter(function (e) { return e.status === "Atrasada"; });
    var faroisCount = { verde: 0, amarelo: 0, vermelho: 0 };
    effs.forEach(function (e) { faroisCount[farolDe(e)]++; });
    var faroGeral = faroisCount.vermelho > 0 ? "vermelho" : (faroisCount.amarelo > 0 ? "amarelo" : "verde");
    var pctGeral = effs.length ? Math.round(effs.reduce(function (s, e) { return s + (e.percent || 0); }, 0) / effs.length) : 0;
    var tituloDia = vendoTodaPgu ? "Todas as atividades da PGU" : (vendoHojeReal ? "O que fazer hoje" : "Atividades de " + A.fmtDate(diaStr));

    container.innerHTML =
      '<div class="countdown-banner">' +
        '<div><div class="countdown-banner__title">' + A.esc(bannerTexto) + '</div><div class="countdown-banner__value">' + A.esc(bannerValor) + "</div></div>" +
        '<div class="countdown-banner__timeline" title="Linha do tempo da PGU — 📍 = hoje">' + pguDayChipsHtml(pguInicio, pguFim, hojeStr, diaStr) + "</div>" +
        (vendoHojeReal ? "" : '<button type="button" class="countdown-banner__voltar" id="pguVoltarHoje">↩ Hoje (' + A.fmtDate(hojeStr) + ")</button>") +
        '<div style="font-size:38px;" title="Farol geral da PGU">' + farolEmoji(faroGeral) + "</div>" +
      "</div>" +
      '<div class="panel" style="margin-bottom:16px;" id="pguHojeFilterPanel">' +
        '<h3 class="panel__title" style="margin-bottom:2px;">Filtros</h3>' +
        '<p class="panel__subtitle" style="margin-bottom:8px;">Turno/encarregado vêm do preenchimento em campo</p>' +
        filtrosHtml +
      "</div>" +
      '<div class="kpi-grid">' +
        kpiCard("📋", vendoTodaPgu ? "Atividades exibidas" : "Atividades no dia", A.fmtNum(doDia.length)) +
        kpiCard("⏱️", "Atrasadas (geral)", A.fmtNum(atrasadas.length), atrasadas.length ? "bad" : "") +
        kpiCard("📊", "% médio geral", pctGeral + "%", "blue") +
        kpiCard("🏁", "Total de atividades", A.fmtNum(effs.length)) +
      "</div>" +
      '<div class="panel">' +
        '<div class="eap-toolbar-row">' +
          '<h3 class="panel__title" style="margin:0;flex:1;">' + A.esc(tituloDia) + "</h3>" +
          '<button type="button" class="btn-neutral" id="pguGroupExpandAll">⊞ Expandir tudo</button>' +
          '<button type="button" class="btn-neutral" id="pguGroupCollapseAll">⊟ Recolher tudo</button>' +
        "</div>" +
        '<p class="panel__subtitle">Agrupado por TR/ativo → componente → disciplina. Ajuste status, % e datas de tendência direto nas colunas — clique no nome da atividade para observações, impedimento etc.</p>' +
        groupedActivityListHtml(doDia) +
      "</div>" +
      '<div class="panel"><h3 class="panel__title">Atrasadas — ação necessária</h3>' +
        (atrasadas.length ? ('<div class="activity-list-wrap">' + activityRowHeadHtml() + atrasadas.slice(0, 30).map(activityRowHtml).join("") + "</div>") : '<div class="table-caption">Nenhuma atividade atrasada. 🎉</div>') +
      "</div>";

    // Guarda o estado aberto/fechado de cada grupo pra sobreviver ao proximo re-render (ver groupOpenState).
    var groupedTreeEl = A.$("pguGroupedTree");
    if (groupedTreeEl) {
      groupedTreeEl.querySelectorAll("details[data-gkey]").forEach(function (d) {
        d.addEventListener("toggle", function () { groupOpenState[d.getAttribute("data-gkey")] = d.open; });
      });
    }

    A.wireMultiSelect("msHojeEncarregado", function (values) { hojeFilters.encarregado = values; renderHoje(lastEffs); });
    A.wireMultiSelect("msHojeFiscalObra", function (values) { hojeFilters.fiscalObra = values; renderHoje(lastEffs); });
    A.wireMultiSelect("msHojeFiscalSeguranca", function (values) { hojeFilters.fiscalSeguranca = values; renderHoje(lastEffs); });
    A.wireMultiSelect("msHojeEmpresa", function (values) { hojeFilters.executante = values; renderHoje(lastEffs); });
    A.wireMultiSelect("msHojeTurno", function (values) { hojeFilters.turno = values; renderHoje(lastEffs); });
    var clearBtn = A.$("pguHojeClearFiltros");
    if (clearBtn) {
      clearBtn.addEventListener("click", function () {
        hojeFilters = { turno: [], executante: [], encarregado: [], fiscalObra: [], fiscalSeguranca: [] };
        renderHoje(lastEffs);
      });
    }
  }

  // Ligado uma unica vez (em renderShell) sobre o container fixo da aba "Hoje" -- usa delegacao
  // de evento para nao acumular listeners a cada re-render (renderAll roda toda vez que o
  // encarregado salva uma atualizacao).
  // A.onDelegated (common.js) so escuta "click". Para inputs/selects editaveis nas colunas
  // precisamos de "change", entao usamos a mesma ideia de delegacao aqui.
  function onDelegatedChange(container, selector, handler) {
    container.addEventListener("change", function (e) {
      var el = e.target.closest(selector);
      if (el && container.contains(el)) handler(el, e);
    });
  }

  var TENDENCIA_FIELD_LABELS = { status: "Status", percent: "Avanço", inicioTendencia: "Início tendência", terminoTendencia: "Término tendência" };

  function wireHojeTab() {
    var container = A.$("pguHojeContent");
    A.onDelegated(container, ".pgu-open", function (el) {
      var a = activitiesByUid[el.getAttribute("data-uid")];
      if (a) openDrawer(a, renderAll);
    });
    A.onDelegated(container, "[data-dia]", function (el) {
      hojeSelectedDate = el.getAttribute("data-dia");
      renderHoje(lastEffs);
    });
    A.onDelegated(container, "#pguVoltarHoje", function () {
      hojeSelectedDate = toISODate(new Date());
      renderHoje(lastEffs);
    });
    A.onDelegated(container, "#pguGroupExpandAll", function () {
      container.querySelectorAll("#pguGroupedTree details").forEach(function (d) {
        d.open = true;
        var k = d.getAttribute("data-gkey"); if (k) groupOpenState[k] = true;
      });
    });
    A.onDelegated(container, "#pguGroupCollapseAll", function () {
      container.querySelectorAll("#pguGroupedTree details").forEach(function (d) {
        d.open = false;
        var k = d.getAttribute("data-gkey"); if (k) groupOpenState[k] = false;
      });
    });
    // Edicao inline de status / % / datas de tendencia direto na linha, sem abrir o painel lateral.
    onDelegatedChange(container, ".pgu-inline-field", function (el) {
      var field = el.getAttribute("data-field");
      var value = field === "percent" ? parseInt(el.value, 10) : el.value;
      saveOverrideField(el.getAttribute("data-uid"), field, value);
      A.toast((TENDENCIA_FIELD_LABELS[field] || "Campo") + " atualizado.");
      renderAll();
    });
  }

  // ------------------------------------------------------------ Tab: Dashboard

  function renderDashboard(effs) {
    var container = A.$("pguDashContent");
    var total = effs.length;
    var concluidas = effs.filter(function (e) { return e.status === "Concluída"; }).length;
    var andamento = effs.filter(function (e) { return e.status === "Em andamento"; }).length;
    var naoIniciadas = effs.filter(function (e) { return e.status === "Não iniciada"; }).length;
    var atrasadas = effs.filter(function (e) { return e.status === "Atrasada"; }).length;
    var pctGeral = total ? Math.round(effs.reduce(function (s, e) { return s + (e.percent || 0); }, 0) / total) : 0;

    var statusItems = [
      { label: "Concluída", value: concluidas, color: A.COLORS.valeGreen },
      { label: "Em andamento", value: andamento, color: A.COLORS.valeBlue },
      { label: "Não iniciada", value: naoIniciadas, color: A.COLORS.mediumGray },
      { label: "Atrasada", value: atrasadas, color: "#D93025" }
    ].filter(function (i) { return i.value > 0; });

    var farolArea = buildFarolStack(effs, function (e) { return e.area; });
    var farolExecutante = buildFarolStack(effs, function (e) { return e.executante; });
    var farolDisciplina = buildFarolStack(effs, function (e) { return e.disciplina; });
    var farolComponente = buildFarolStack(effs, function (e) { return e.componente; });

    var datas = [];
    effs.forEach(function (e) {
      if (e.terminoBaseline) datas.push(e.terminoBaseline);
      if (e.termino) datas.push(e.termino);
    });
    var minD = datas.length ? datas.reduce(function (a, b) { return a < b ? a : b; }) : null;
    var maxD = datas.length ? datas.reduce(function (a, b) { return a > b ? a : b; }) : null;
    var dias = [];
    if (minD && maxD) {
      var cur = new Date(minD + "T00:00:00");
      var end = new Date(maxD + "T00:00:00");
      while (cur <= end) { dias.push(toISODate(cur)); cur.setDate(cur.getDate() + 1); }
    }
    var baselineSerie = dias.map(function (d) {
      var n = effs.filter(function (e) { return e.terminoBaseline && e.terminoBaseline <= d; }).length;
      return total ? (n / total) * 100 : 0;
    });
    var previstoSerie = dias.map(function (d) {
      var n = effs.filter(function (e) { return e.termino && e.termino <= d; }).length;
      return total ? (n / total) * 100 : 0;
    });
    var hojeStr = toISODate(new Date());
    var todayIdx = null;
    dias.forEach(function (d, i) { if (d <= hojeStr) todayIdx = i; });
    var turnoAtipico = effs.filter(turnoDivergente).length;

    container.innerHTML =
      '<div class="kpi-grid">' +
        kpiCard("🏁", "Total de atividades", A.fmtNum(total)) +
        kpiCard("✅", "Concluídas", A.fmtNum(concluidas)) +
        kpiCard("🔄", "Em andamento", A.fmtNum(andamento), "blue") +
        kpiCard("⏱️", "Atrasadas", A.fmtNum(atrasadas), atrasadas ? "bad" : "") +
        kpiCard("⬜", "Não iniciadas", A.fmtNum(naoIniciadas)) +
        kpiCard("📊", "% geral da PGU", pctGeral + "%", "blue") +
        kpiCard("⚠️", "Turno atípico p/ fiscal", A.fmtNum(turnoAtipico), turnoAtipico ? "warn" : "", "Turno da tarefa diferente do habitual do fiscal responsável") +
      "</div>" +
      '<div class="grid-2">' +
        '<div class="panel"><h3 class="panel__title">Status das atividades</h3><div style="display:flex;align-items:center;gap:20px;flex-wrap:wrap;">' +
          (statusItems.length ? A.donutChart(statusItems, 160, { centerLabel: "atividades" }) : "") +
          '<div class="chart-legend" style="flex-direction:column;">' + statusItems.map(function (it) {
            return '<div class="chart-legend__item"><span class="chart-legend__swatch" style="background:' + it.color + '"></span>' + A.esc(it.label) + " (" + it.value + ")</div>";
          }).join("") + "</div></div></div>" +
        '<div class="panel"><h3 class="panel__title">Curva planejada — % concluído acumulado por dia</h3>' +
          '<p class="panel__subtitle">Linha de base x previsto atual (o % realizado de hoje está no card acima)</p>' +
          (dias.length ? A.sCurveChart([
            { name: "Linha de base", values: baselineSerie, color: A.COLORS.valeGray, dashed: true },
            { name: "Previsto atual", values: previstoSerie, color: A.COLORS.valeGreen }
          ], dias.map(function (d) { return d.slice(8, 10) + "/" + d.slice(5, 7); }), { height: 260, todayIndex: todayIdx, maxXLabels: Math.min(dias.length, 10) }) : '<p class="table-caption">Sem datas suficientes.</p>') +
        "</div>" +
      "</div>" +
      '<div class="panel"><h3 class="panel__title">Farol por área (TR / ativo)</h3><p class="panel__subtitle">🔴 atrasado · 🟡 em risco · 🟢 no prazo / concluído</p>' + A.stackedBarRows(farolArea, {}) + "</div>" +
      '<div class="panel"><h3 class="panel__title">Farol por disciplina</h3>' + A.stackedBarRows(farolDisciplina, {}) + "</div>" +
      '<div class="panel"><h3 class="panel__title">Farol por componente/sistema</h3>' + A.stackedBarRows(farolComponente, {}) + "</div>" +
      '<div class="panel"><h3 class="panel__title">Farol por executante</h3>' + A.stackedBarRows(farolExecutante, {}) + "</div>";
  }

  // ------------------------------------------------------------ Tab: Atividades

  var lastAtvFilterState = null;

  function renderAtividades(effs) {
    var container = A.$("pguAtividadesContent");
    var areaOptions = A.distinctValues(effs, "area");
    var componenteOptions = A.distinctValues(effs, "componente");
    var disciplinaOptions = A.distinctValues(effs, "disciplina");
    var execOptions = A.distinctValues(effs, "executante");
    var statusOptions = A.distinctValues(effs, "status");
    var turnoOptions = TURNO_OPTIONS.map(function (t) { return { value: t, label: t }; });
    var encarregadoOptions = A.distinctValues(effs.filter(function (e) { return e.encarregado; }), "encarregado");
    var fiscalObraOptions = A.distinctValues(effs.filter(function (e) { return e.fiscalObra; }), "fiscalObra");
    var fiscalSegurancaOptions = A.distinctValues(effs.filter(function (e) { return e.fiscalSeguranca; }), "fiscalSeguranca");

    var toolbarHtml = A.filterToolbar([
      { key: "encarregado", label: "Encarregado", value: null, options: encarregadoOptions },
      { key: "fiscalObra", label: "Fiscal de Campo", value: null, options: fiscalObraOptions },
      { key: "fiscalSeguranca", label: "Fiscal de Segurança", value: null, options: fiscalSegurancaOptions },
      { key: "area", label: "TR / Área", value: null, options: areaOptions },
      { key: "componente", label: "Componente", value: null, options: componenteOptions },
      { key: "disciplina", label: "Disciplina", value: null, options: disciplinaOptions },
      { key: "executante", label: "Executante", value: null, options: execOptions },
      { key: "status", label: "Status", value: null, options: statusOptions },
      { key: "turno", label: "Turno (informado em campo)", value: null, options: turnoOptions }
    ]);

    container.innerHTML =
      '<div id="pguAtvToolbar">' + toolbarHtml + "</div>" +
      '<div class="panel"><h3 class="panel__title">Atividades da PGU</h3><p class="panel__subtitle">Clique no nome da atividade para abrir a atualização rápida</p><div id="pguAtvTable"></div></div>';

    mainTable = A.makeFilterableTable("pguAtvTable", effs, [
      { key: "nome", label: "Atividade", render: function (r) { return '<a href="javascript:void(0)" class="pgu-open" data-uid="' + A.esc(r.uid) + '" style="color:var(--dark-green);font-weight:600;text-decoration:none;">' + A.esc(r.nome) + "</a>"; } },
      { key: "encarregado", label: "Encarregado", render: function (r) { return r.encarregado ? A.esc(r.encarregado) : "—"; } },
      { key: "fiscalObra", label: "Fiscal de Campo", render: function (r) { return r.fiscalObra ? A.esc(r.fiscalObra) : "—"; } },
      { key: "fiscalSeguranca", label: "Fiscal de Segurança", render: function (r) { return r.fiscalSeguranca ? A.esc(r.fiscalSeguranca) : "—"; } },
      { key: "area", label: "TR / Área" },
      { key: "componente", label: "Componente", render: function (r) { return r.componente ? A.esc(r.componente) : "—"; } },
      { key: "disciplina", label: "Disciplina", render: function (r) { return r.disciplina ? A.esc(r.disciplina) : "—"; } },
      { key: "executante", label: "Executante" },
      { key: "status", label: "Status", render: function (r) { return farolEmoji(farolDe(r)) + " " + A.esc(r.status); } },
      { key: "percent", label: "% Avanço", render: function (r) { return miniProgress(r.percent); } },
      { key: "inicio", label: "Início previsto", render: function (r) { return fmtDataHora(r.inicioDataHora); } },
      { key: "termino", label: "Término previsto", render: function (r) { return fmtDataHora(r.terminoDataHora); } },
      { key: "inicioTendencia", label: "Início tendência", render: function (r) {
          var cls = (r.isTendenciaAuto || r.isTendenciaBaseline) ? " pgu-tend-input--auto" : "";
          var ttl = r.isTendenciaAuto ? "Reprogramado automaticamente por atraso em predecessora" : (r.isTendenciaBaseline ? "Ainda igual à linha de base" : "");
          return '<input type="datetime-local" class="pgu-tend-input' + cls + '" data-uid="' + A.esc(r.uid) + '" data-field="inicioTendencia" value="' + A.esc(r.inicioTendencia) + '"' + (ttl ? ' title="' + ttl + '"' : "") + '>';
        } },
      { key: "terminoTendencia", label: "Término tendência", render: function (r) {
          var cls = (r.isTendenciaAuto || r.isTendenciaBaseline) ? " pgu-tend-input--auto" : "";
          var ttl = r.isTendenciaAuto ? "Reprogramado automaticamente por atraso em predecessora" : (r.isTendenciaBaseline ? "Ainda igual à linha de base" : "");
          return '<input type="datetime-local" class="pgu-tend-input' + cls + '" data-uid="' + A.esc(r.uid) + '" data-field="terminoTendencia" value="' + A.esc(r.terminoTendencia) + '"' + (ttl ? ' title="' + ttl + '"' : "") + '>';
        } },
      { key: "turno", label: "Turno", render: function (r) {
          if (!r.turno) return "—";
          return A.esc(r.turno) + (turnoDivergente(r) ? ' <span class="badge farol-atrasado" title="Diferente do turno habitual do fiscal ' + A.esc(r.fiscalObra) + ' em ' + A.esc(r.disciplina || "—") + '">⚠</span>' : "");
        } }
    ], {
      limit: 300,
      searchPlaceholder: "Buscar atividade...",
      initialText: lastAtvFilterState ? lastAtvFilterState.text : "",
      initialExact: lastAtvFilterState ? lastAtvFilterState.exact : {},
      filterLabels: { encarregado: "Encarregado", fiscalObra: "Fiscal de Campo", fiscalSeguranca: "Fiscal de Segurança", area: "TR / Área", componente: "Componente", disciplina: "Disciplina", executante: "Executante", status: "Status", turno: "Turno" },
      onFilterChange: function (state) { lastAtvFilterState = state; A.syncFilterToolbar("pguAtvToolbar", state); }
    });

    A.wireFilterToolbar("pguAtvToolbar", mainTable);
    A.onDelegated(A.$("pguAtvTable"), ".pgu-open", function (el) {
      var a = activitiesByUid[el.getAttribute("data-uid")];
      if (a) openDrawer(a, renderAll);
    });
    A.$("pguAtvTable").addEventListener("change", function (e) {
      var el = e.target.closest(".pgu-tend-input");
      if (!el) return;
      var field = el.getAttribute("data-field");
      saveOverrideField(el.getAttribute("data-uid"), field, el.value);
      A.toast((field === "inicioTendencia" ? "Início" : "Término") + " tendência salvo.");
      renderAll();
    });
  }

  // ------------------------------------------------------------ Tab: Linha de Base

  function renderBaseline(effs) {
    var container = A.$("pguBaselineContent");
    var desviosAtraso = effs.filter(function (e) { return e.termino && e.terminoBaseline && e.termino > e.terminoBaseline; });
    var desviosAdiantado = effs.filter(function (e) { return e.termino && e.terminoBaseline && e.termino < e.terminoBaseline; });
    var semDesvio = effs.length - desviosAtraso.length - desviosAdiantado.length;
    var linhas = desviosAtraso.concat(desviosAdiantado);

    container.innerHTML =
      '<div class="kpi-grid">' +
        kpiCard("📐", "Sem desvio vs. linha de base", A.fmtNum(semDesvio)) +
        kpiCard("⏱️", "Replanejadas para depois", A.fmtNum(desviosAtraso.length), desviosAtraso.length ? "warn" : "") +
        kpiCard("⏩", "Adiantadas vs. linha de base", A.fmtNum(desviosAdiantado.length), "blue") +
      "</div>" +
      '<div class="panel"><h3 class="panel__title">Atividades com término diferente da linha de base</h3>' +
        '<p class="panel__subtitle">A linha de base nunca é alterada — qualquer mudança de data aqui é uma nova previsão</p>' +
        '<div class="table-wrap"><table class="data-table"><thead><tr><th>Atividade</th><th>Área</th><th>Término linha de base</th><th>Término atual</th><th>Desvio</th></tr></thead><tbody>' +
        (linhas.length ? linhas.map(function (e) {
          var dias = Math.round((new Date(e.termino) - new Date(e.terminoBaseline)) / 86400000);
          return "<tr><td>" + A.esc(e.nome) + "</td><td>" + A.esc(e.area || "—") + "</td><td>" + A.fmtDate(e.terminoBaseline) + "</td><td>" + A.fmtDate(e.termino) + "</td><td>" +
            A.badge((dias > 0 ? "+" : "") + dias + "d", dias > 0 ? "farol-atrasado" : "farol-concluido") + "</td></tr>";
        }).join("") : '<tr><td colspan="5" style="text-align:center;color:#747678;">Nenhum desvio em relação à linha de base.</td></tr>') +
        "</tbody></table></div></div>";
  }

  // ------------------------------------------------------------ shell

  function renderShell() {
    var content = A.$("content");
    content.innerHTML =
      '<div id="pguTabs">' +
        '<div class="tabs">' +
          '<button type="button" class="tab active" data-tab="hoje">Hoje</button>' +
          '<button type="button" class="tab" data-tab="dashboard">Dashboard</button>' +
          '<button type="button" class="tab" data-tab="atividades">Atividades</button>' +
          '<button type="button" class="tab" data-tab="baseline">Linha de Base</button>' +
        "</div>" +
        '<div class="tab-panel active" data-tab-panel="hoje" id="pguHojeContent"></div>' +
        '<div class="tab-panel" data-tab-panel="dashboard" id="pguDashContent"></div>' +
        '<div class="tab-panel" data-tab-panel="atividades" id="pguAtividadesContent"></div>' +
        '<div class="tab-panel" data-tab-panel="baseline" id="pguBaselineContent"></div>' +
      "</div>" +
      '<div class="footnote">Atualizações de campo (status, %, observações, encarregado, turno) ficam salvas no servidor e são compartilhadas entre todo mundo — atualiza sozinho a cada ~45s, ou aperte "Atualizar" a qualquer momento.</div>';
    A.wireTabs("pguTabs");
    wireHojeTab();
  }

  function renderAll() {
    var PGU = window.PANEL_DATA.pgu || { atividades: [], porArea: [], porExecutante: [], porStatus: [], projeto: {} };
    var atividades = PGU.atividades || [];
    activitiesByUid = {};
    atividades.forEach(function (a) { activitiesByUid[a.uid] = a; });
    allAtividades = atividades;
    recomputeCascade();
    var overrides = loadOverrides();
    var effs = atividades.map(function (a) { return effective(a, overrides[a.uid]); });
    FISCAL_TURNO_PREDOMINANTE = computeFiscalTurnoPredominante(effs);

    renderHoje(effs);
    renderDashboard(effs);
    renderAtividades(effs);
    renderBaseline(effs);

    A.setStatusPills([
      "PGU: " + ((PGU.projeto && PGU.projeto.nome) || "—"),
      "Gerado em " + (PGU.geradoEm || "—")
    ]);
    A.setNavBadge("pgu", atividades.filter(function (a) { return a.status === "Atrasada"; }).length, "count-bad");
  }

  renderShell();
  (async function boot() {
    await loadOverridesFromSupabase();
    renderAll();
  })();
  A.wireAtualizarButton(["pgu"], async function () {
    renderShell();
    await loadOverridesFromSupabase();
    renderAll();
  });
  // Atualizacao em segundo plano pra refletir o que outras pessoas foram preenchendo em campo,
  // sem precisar apertar "Atualizar" na mao. So pula quando tem um painel de edicao aberto, pra
  // nao atrapalhar quem esta no meio de um preenchimento.
  setInterval(function () {
    if (A.$("pguDrawerOverlay")) return;
    loadOverridesFromSupabase().then(renderAll);
  }, 45000);
})();
