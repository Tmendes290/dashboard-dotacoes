// assets/js/pages/curva-s.js — pagina Curva S (fisica + economica) e resumo MAS
(function () {
  "use strict";
  var A = window.App;
  var ecoTable;
  var masTable;

  function kpiCard(icon, label, value, cls, hint) {
    return '<div class="kpi-card ' + (cls || "") + '"><div class="kpi-card__icon">' + icon + "</div>" +
      '<div class="kpi-card__label">' + A.esc(label) + '</div><div class="kpi-card__value">' + value + "</div>" +
      (hint ? '<div class="kpi-card__hint">' + A.esc(hint) + "</div>" : "") +
      '<div class="kpi-card__bar"></div></div>';
  }

  function fmtWeekLabel(iso) {
    var p = String(iso).split("-");
    return p[2] + "/" + p[1];
  }

  function fmtMonthLabel(iso) {
    return A.fmtMonthLabel(String(iso).slice(0, 7));
  }

  function fmtMoney(n) {
    if (n === null || n === undefined || isNaN(n)) return "—";
    return "R$ " + Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
  }

  function closestIndex(items) {
    var today = new Date();
    var best = 0, bestDiff = Infinity;
    items.forEach(function (it, i) {
      var diff = Math.abs(new Date(it.data) - today);
      if (diff < bestDiff) { bestDiff = diff; best = i; }
    });
    return best;
  }

  var MESES_INICIAIS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
  function monthInitial(iso) {
    var idx = parseInt(iso.slice(5, 7), 10) - 1;
    return MESES_INICIAIS[idx] || "?";
  }

  // Reduz uma serie semanal a 1 ponto por mes (a ultima semana de cada mes, ja que os valores
  // sao acumulados) -- deixa o eixo X legivel em vez de 100+ pontos semanais espremidos.
  function aggregateMonthly(semanas) {
    var byMonth = {};
    var order = [];
    semanas.forEach(function (s) {
      var ym = s.data.slice(0, 7);
      if (!byMonth[ym]) order.push(ym);
      byMonth[ym] = s;
    });
    return order.map(function (ym) { return byMonth[ym]; });
  }

  // Mesma agregacao, mas somando os valores INCREMENTAIS (nao acumulados) de cada semana do mes
  // -- usado para as barras mensais do grafico combinado.
  function aggregateMonthlyIncremento(semanas) {
    var byMonth = {};
    var order = [];
    semanas.forEach(function (s) {
      var ym = s.data.slice(0, 7);
      if (!byMonth[ym]) { byMonth[ym] = { data: ym + "-01", planejadoHoras: 0, realHoras: 0, tendenciaHoras: 0 }; order.push(ym); }
      byMonth[ym].planejadoHoras += s.planejadoHoras;
      byMonth[ym].realHoras += s.realHoras;
      byMonth[ym].tendenciaHoras += s.tendenciaHoras;
    });
    return order.map(function (ym) { return byMonth[ym]; });
  }

  function buildYearBands(mensal) {
    var bands = [];
    mensal.forEach(function (s, i) {
      var year = s.data.slice(0, 4);
      if (bands.length && bands[bands.length - 1].label === year) {
        bands[bands.length - 1].end = i;
      } else {
        bands.push({ label: year, start: i, end: i });
      }
    });
    return bands;
  }

  // ------------------------------------------------------------ Cronograma detalhado (arvore)

  function wbsNodeHtml(node) {
    var hasChildren = node.filhos && node.filhos.length > 0;
    var cls = "wbs-node" + (hasChildren ? "" : " wbs-node--leaf");
    var datesStr = (node.inicio || node.termino) ? (A.fmtDate(node.inicio) + " – " + A.fmtDate(node.termino)) : "";
    var childrenHtml = hasChildren
      ? '<div class="wbs-node__body">' + node.filhos.map(wbsNodeHtml).join("") + "</div>"
      : "";
    return '<details class="' + cls + '"><summary>' +
      '<span class="wbs-node__nome" title="' + A.esc(node.nome) + '">' + A.esc(node.nome) + "</span>" +
      (datesStr ? '<span class="wbs-node__dates">' + A.esc(datesStr) + "</span>" : "") +
      (node.trabalhoHoras ? '<span class="wbs-node__hours">' + A.fmtNum(Math.round(node.trabalhoHoras)) + " h</span>" : "") +
      "</summary>" + childrenHtml + "</details>";
  }

  function buildWbsTree(arvore, areaCodigo) {
    var nodes = arvore || [];
    if (areaCodigo) {
      nodes = nodes.filter(function (a) {
        var m = /(\d+)/.exec(a.nome);
        return m && m[1] === areaCodigo;
      });
    }
    return nodes.map(wbsNodeHtml).join("") || '<div class="eap-empty">Nenhuma área encontrada.</div>';
  }

  // ------------------------------------------------------------ Curva S Fisica

  function renderMarcos(CRONO) {
    var marcos = (CRONO && CRONO.marcosContratuais) || [];
    if (!marcos.length) return '<div class="table-caption">Nenhum marco contratual cadastrado.</div>';
    return '<div class="timeline">' + marcos.map(function (m) {
      return '<div class="timeline__item"><div class="timeline__dot"></div>' +
        '<div class="timeline__date">' + A.fmtDate(m.dataPrevista) + "</div>" +
        '<div class="timeline__label">' + A.esc(m.descricao) + "</div></div>";
    }).join("") + "</div>";
  }

  function renderFisicaChart(CRV, areaCodigo) {
    var area = areaCodigo ? (CRV.areas || []).filter(function (a) { return a.codigo === areaCodigo; })[0] : null;
    var semanas = area ? area.semanas : (CRV.semanas || []);
    var totalHoras = area ? area.totalHoras : CRV.totalHoras;
    var idx = closestIndex(semanas);
    var atual = semanas[idx] || {};

    var mensal = aggregateMonthly(semanas);
    var mensalInc = aggregateMonthlyIncremento(semanas);
    var todayIdx = closestIndex(mensal);
    var labels = mensal.map(function (s) { return monthInitial(s.data); });
    var yearBands = buildYearBands(mensal);

    var bars = mensalInc.map(function (m, i) {
      var passado = i <= todayIdx;
      return { value: passado ? m.realHoras : m.tendenciaHoras, color: passado ? A.COLORS.valeBlue : "#D9A400" };
    });

    var acumuladoReal = mensal.map(function (s, i) { return i <= todayIdx ? s.realAcumPct : s.tendenciaAcumPct; });

    var chart = A.comboSCurveChart(bars, [
      { name: "Planejado (acumulado)", values: mensal.map(function (s) { return s.planejadoAcumPct; }), color: A.COLORS.valeGreen },
      { name: "Real / Tendência (acumulado)", values: acumuladoReal, color: A.COLORS.darkBlue, dashedFromIndex: todayIdx }
    ], labels, {
      height: 340, todayIndex: todayIdx, yearBands: yearBands,
      barLegend: { "Executado (mensal)": A.COLORS.valeBlue, "Previsto (mensal)": "#D9A400" }
    });

    A.$("fisicaKpis").innerHTML =
      kpiCard("📐", "Trabalho total" + (area ? " — " + area.nome : ""), A.fmtNum(Math.round(totalHoras)) + " h") +
      kpiCard("📗", "Planejado acumulado", (atual.planejadoAcumPct || 0) + "%", "", "semana de " + A.fmtDate(atual.data)) +
      kpiCard("📘", "Real acumulado", (atual.realAcumPct || 0) + "%", "blue", "semana de " + A.fmtDate(atual.data)) +
      kpiCard("📙", "Tendência acumulada", (atual.tendenciaAcumPct || 0) + "%", "", "semana de " + A.fmtDate(atual.data));

    A.$("fisicaChart").innerHTML = chart;
  }

  function renderFisica(CRV, CRONO) {
    var container = A.$("fisicaContent");
    var areaOptions = (CRV.areas || []).map(function (a) { return { value: a.codigo, label: a.nome }; });

    container.innerHTML =
      '<div class="panel" style="margin-bottom:16px;">' +
        '<div class="eap-toolbar-row" style="margin-bottom:0;">' +
          '<div class="filter-toolbar" style="margin-bottom:0;flex:1;">' +
            '<div class="filter-toolbar__field"><label class="filter-toolbar__label">Área</label>' +
              '<select class="filter-toolbar__select" id="fisicaAreaSelect"><option value="">Projeto inteiro</option>' +
              areaOptions.map(function (o) { return '<option value="' + A.esc(o.value) + '">' + A.esc(o.label) + "</option>"; }).join("") +
              "</select></div>" +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="kpi-grid" id="fisicaKpis"></div>' +
      '<div style="display:grid;grid-template-columns:2.1fr 1fr;gap:16px;align-items:start;">' +
        '<div class="panel"><h3 class="panel__title">Curva S física</h3>' +
          '<p class="panel__subtitle">Barras: trabalho mensal (executado em azul, previsto em amarelo). Linhas: % acumulado — filtrar por área acima</p>' +
          '<div id="fisicaChart"></div></div>' +
        '<div class="panel"><h3 class="panel__title">Principais marcos do projeto</h3><p class="panel__subtitle">Marcos contratuais</p>' + renderMarcos(CRONO) + "</div>" +
      "</div>" +
      '<div class="panel">' +
        '<div class="eap-toolbar-row">' +
          '<h3 class="panel__title" style="margin:0;flex:1;">Cronograma detalhado</h3>' +
          '<button type="button" class="btn-neutral" id="wbsExpandAll">⊞ Expandir tudo</button>' +
          '<button type="button" class="btn-neutral" id="wbsCollapseAll">⊟ Recolher tudo</button>' +
        "</div>" +
        '<p class="panel__subtitle">Área → Sub-área → Fase → Tarefa — clique para abrir/fechar cada nível. Datas inferidas a partir das semanas com trabalho alocado.</p>' +
        '<div class="wbs-tree" id="wbsTree">' + buildWbsTree(CRV.arvore, "") + "</div>" +
      "</div>" +
      '<div class="footnote">Planejado, Real e Tendência refletem hoje a mesma distribuição de horas — a base do MS Project ainda não tem avanço real apontado nas tarefas. Assim que o avanço for lançado, reexporte as 3 abas (LB / Real / Tend) e clique em "Atualizar": as curvas passam a divergir automaticamente.</div>';

    renderFisicaChart(CRV, "");
    A.$("fisicaAreaSelect").addEventListener("change", function (e) {
      var val = e.target.value;
      renderFisicaChart(CRV, val);
      A.$("wbsTree").innerHTML = buildWbsTree(CRV.arvore, val);
    });
    A.$("wbsExpandAll").addEventListener("click", function () {
      A.$("wbsTree").querySelectorAll("details").forEach(function (d) { d.open = true; });
    });
    A.$("wbsCollapseAll").addEventListener("click", function () {
      A.$("wbsTree").querySelectorAll("details").forEach(function (d) { d.open = false; });
    });
  }

  // ------------------------------------------------------------ Curva S Economica

  function filterPacotes(pacotes, state) {
    var text = (state.text || "").toLowerCase();
    return pacotes.filter(function (p) {
      if (state.exact.categoria && String(p.categoria) !== String(state.exact.categoria)) return false;
      if (!text) return true;
      return ((p.pacote || "") + " " + (p.descricao || "")).toLowerCase().indexOf(text) !== -1;
    });
  }

  function renderEcoChart(ECO, filtered) {
    var meses = ECO.meses || [];
    var n = meses.length;
    var sums = new Array(n).fill(0);
    var totalContrato = 0;
    filtered.forEach(function (p) {
      totalContrato += p.valorContrato || 0;
      (p.mensal || []).forEach(function (v, i) { sums[i] += v; });
    });

    // Corta a curva no ultimo mes com desembolso planejado (nao mostra anos de linha reta
    // em 100% depois que o valor maximo ja foi atingido).
    var lastNonZero = -1;
    for (var i = 0; i < n; i++) { if (sums[i] > 0.005) lastNonZero = i; }
    var cutoff = lastNonZero >= 0 ? lastNonZero + 1 : n;

    var mesesCortados = meses.slice(0, cutoff);
    var sumsCortados = sums.slice(0, cutoff);

    var acum = 0;
    var pctSeries = [];
    var acumSeries = [];
    sumsCortados.forEach(function (v) {
      acum += v;
      acumSeries.push(acum);
      pctSeries.push(totalContrato > 0 ? (acum / totalContrato) * 100 : 0);
    });

    var idx = closestIndex(mesesCortados);
    var idxTotal = closestIndex(meses);

    A.$("ecoKpis").innerHTML =
      kpiCard("💰", "Valor selecionado", fmtMoney(totalContrato), "", filtered.length + " pacote(s)") +
      kpiCard("📈", "Planejado acumulado até hoje", fmtMoney(acumSeries[idxTotal] !== undefined ? acumSeries[idxTotal] : acum), "blue") +
      kpiCard("📊", "% do valor selecionado até hoje", Math.round((idxTotal < acumSeries.length ? pctSeries[idxTotal] : 100) || 0) + "%") +
      kpiCard("🗓️", "Curva planejada até", mesesCortados.length ? fmtMonthLabel(mesesCortados[mesesCortados.length - 1].data) : "—", "", mesesCortados.length ? "de " + fmtMonthLabel(meses[0].data) : "");

    var barsEco = sumsCortados.map(function (v) { return { value: v, color: A.COLORS.valeBlue }; });
    var labelsEco = mesesCortados.map(function (m) { return monthInitial(m.data); });
    var yearBandsEco = buildYearBands(mesesCortados);

    A.$("ecoChart").innerHTML = pctSeries.length
      ? A.comboSCurveChart(barsEco, [
          { name: "Planejado (acumulado)", values: pctSeries, color: A.COLORS.valeGreen }
        ], labelsEco, {
          height: 320, todayIndex: idx, yearBands: yearBandsEco,
          barLegend: { "Desembolso mensal planejado": A.COLORS.valeBlue }
        })
      : '<p class="table-caption">Nenhum pacote selecionado.</p>';
  }

  function renderEco(ECO) {
    var content = A.$("ecoContent");
    var pacotes = ECO.pacotes || [];
    var categoriaOptions = A.distinctValues(pacotes, "categoria");

    var toolbarHtml = A.filterToolbar([
      { key: "categoria", label: "Categoria", value: null, options: categoriaOptions }
    ]);

    var porCategoriaItems = (ECO.porCategoria || []).map(function (c) {
      return { label: c.categoria || "—", value: c.valorTotal, color: A.COLORS.valeBlue };
    });

    content.innerHTML =
      '<div id="ecoFilterToolbar">' + toolbarHtml + "</div>" +
      '<div class="kpi-grid" id="ecoKpis"></div>' +
      '<div class="grid-2">' +
        '<div class="panel"><h3 class="panel__title">Curva econômica — % planejado acumulado</h3><p class="panel__subtitle">Reflete os pacotes filtrados abaixo (categoria + busca)</p><div id="ecoChart"></div></div>' +
        '<div class="panel"><h3 class="panel__title">Valor do contrato por categoria</h3><p class="panel__subtitle">Clique em uma barra para filtrar</p><div id="ecoCategoriaChart">' + A.barRows(porCategoriaItems, { clickable: true }) + "</div></div>" +
      "</div>" +
      '<div class="panel"><h3 class="panel__title">Pacotes</h3><p class="panel__subtitle">Busque por código ou descrição — os totais e a curva acima acompanham o filtro</p>' +
        '<div id="ecoTable"></div>' +
      "</div>" +
      '<div class="footnote">Fonte: 8 Curva S / CURVA_ECO.xlsx — apenas curva planejada disponível (sem comparação com executado).</div>';

    ecoTable = A.makeFilterableTable("ecoTable", pacotes, [
      { key: "pacote", label: "Pacote" },
      { key: "descricao", label: "Descrição" },
      { key: "categoria", label: "Categoria" },
      { key: "valorContrato", label: "Valor do contrato", render: function (r) { return fmtMoney(r.valorContrato); } },
      { key: "moeda", label: "Moeda" },
      { key: "dataInicio", label: "Início econ.", render: function (r) { return A.fmtDate(r.dataInicio); } },
      { key: "dataFim", label: "Fim econ.", render: function (r) { return A.fmtDate(r.dataFim); } }
    ], {
      limit: 200,
      searchPlaceholder: "Buscar pacote...",
      filterLabels: { categoria: "Categoria" },
      onFilterChange: function (state) {
        A.syncFilterToolbar("ecoFilterToolbar", state);
        renderEcoChart(ECO, filterPacotes(pacotes, state));
      }
    });

    A.wireFilterToolbar("ecoFilterToolbar", ecoTable);
    A.onDelegated(A.$("ecoCategoriaChart"), "[data-key]", function (el) {
      ecoTable.setExact("categoria", el.getAttribute("data-key"));
    });
  }

  // ------------------------------------------------------------ Resumo MAS

  function renderMas(MAS) {
    var content = A.$("masResumoContent");
    var pacotes = MAS.pacotes || [];

    var kpiHtml = [
      kpiCard("📦", "Total de pacotes", A.fmtNum(MAS.totalPacotes)),
      kpiCard("⏱️", "Atrasados", A.fmtNum(MAS.atrasados ? MAS.atrasados.length : 0), "bad"),
      kpiCard("⚠️", "Em atenção", A.fmtNum(MAS.emAtencao ? MAS.emAtencao.length : 0), "warn"),
      kpiCard("🔄", "Atualizados", MAS.totalPacotes ? Math.round((MAS.atualizados / MAS.totalPacotes) * 100) + "%" : "—", "blue", A.fmtNum(MAS.atualizados) + " de " + A.fmtNum(MAS.totalPacotes))
    ].join("");

    var toolbarHtml = A.filterToolbar([
      { key: "farol", label: "Farol", value: null, options: A.distinctValues(pacotes, "farol") },
      { key: "frente", label: "Frente", value: null, options: A.distinctValues(pacotes, "frente") },
      { key: "comprador", label: "Comprador", value: null, options: A.distinctValues(pacotes, "comprador") }
    ]);

    content.innerHTML =
      '<div id="masResumoToolbar">' + toolbarHtml + "</div>" +
      '<div class="kpi-grid">' + kpiHtml + "</div>" +
      '<div class="grid-2">' +
        '<div class="panel"><h3 class="panel__title">Status por farol</h3><div id="masResumoFarolChart" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;"></div></div>' +
        '<div class="panel"><h3 class="panel__title">Pacotes por frente</h3><p class="panel__subtitle">Cor por status: <span style="color:#D93025;font-weight:700;">■</span> atrasado &nbsp; <span style="color:#F2A900;font-weight:700;">■</span> em atenção &nbsp; <span style="color:#2E9E4B;font-weight:700;">■</span> no prazo/concluído</p><div id="masResumoFrenteChart"></div></div>' +
      "</div>" +
      '<div class="panel"><h3 class="panel__title">Pacotes</h3><p class="panel__subtitle">Status em ' + A.esc(A.fmtDate(MAS.statusData)) + ' — veja o <a href="mas.html">painel completo de MAS</a> para o detalhe por comentário e certificação</p>' +
        '<div id="masResumoTable"></div>' +
      "</div>";

    function farolBucket(farol) {
      if (farol === "Atrasado") return "atrasado";
      if (String(farol || "").indexOf("Aten") === 0) return "atencao";
      return "noPrazo";
    }

    function renderCharts(state) {
      var farolRows = pacotes.filter(function (p) { return !state.exact.frente || String(p.frente) === String(state.exact.frente); });
      var frenteRows = pacotes.filter(function (p) { return !state.exact.farol || String(p.farol) === String(state.exact.farol); });
      var farolItems = A.countBy(farolRows, "farol").map(function (f) { return { label: f.label, value: f.value, color: A.FAROL_COLORS[f.label] || A.COLORS.valeGray }; });

      var frenteStack = A.countBy(frenteRows, "frente").map(function (g) {
        var rows = frenteRows.filter(function (p) { return p.frente === g.label; });
        var counts = { atrasado: 0, atencao: 0, noPrazo: 0 };
        rows.forEach(function (p) { counts[farolBucket(p.farol)]++; });
        return {
          label: g.label,
          total: rows.length,
          segments: [
            { label: "Atrasado", value: counts.atrasado, color: "#D93025" },
            { label: "Em atenção", value: counts.atencao, color: "#F2A900" },
            { label: "No prazo / concluído", value: counts.noPrazo, color: "#2E9E4B" }
          ]
        };
      });

      A.$("masResumoFarolChart").innerHTML = A.donutChart(farolItems, 150, { clickable: true, activeKey: state.exact.farol, centerLabel: "pacotes" }) +
        '<div class="chart-legend" style="flex-direction:column;">' + farolItems.map(function (it) {
          return '<div class="chart-legend__item bar-row--clickable" data-key="' + A.esc(it.label) + '" style="cursor:pointer;"><span class="chart-legend__swatch" style="background:' + it.color + '"></span>' + A.esc(it.label) + " (" + it.value + ")</div>";
        }).join("") + "</div>";
      A.$("masResumoFrenteChart").innerHTML = A.stackedBarRows(frenteStack, { clickable: true, activeKey: state.exact.frente });
    }

    masTable = A.makeFilterableTable("masResumoTable", pacotes, [
      { key: "codigoPacote", label: "Cód. Pacote" },
      { key: "frente", label: "Frente" },
      { key: "descricao", label: "Descrição" },
      { key: "comprador", label: "Comprador" },
      { key: "farol", label: "Farol", render: function (r) { return A.badge(r.farol || "—", A.farolBadgeClass(r.farol)); } },
      { key: "dataNecessidade", label: "Necessidade", render: function (r) { return A.fmtDate(r.dataNecessidade); } }
    ], {
      limit: 150,
      searchPlaceholder: "Buscar pacote...",
      filterLabels: { farol: "Farol", frente: "Frente", comprador: "Comprador" },
      onFilterChange: function (state) {
        renderCharts(state);
        A.syncFilterToolbar("masResumoToolbar", state);
      }
    });

    A.wireFilterToolbar("masResumoToolbar", masTable);
    A.onDelegated(A.$("masResumoFarolChart"), "[data-key]", function (el) { masTable.setExact("farol", el.getAttribute("data-key")); });
    A.onDelegated(A.$("masResumoFrenteChart"), "[data-key]", function (el) { masTable.setExact("frente", el.getAttribute("data-key")); });
  }

  // ------------------------------------------------------------ shell

  function render() {
    var DATA = window.PANEL_DATA || {};
    var CRV = DATA.curvaSFisica || { semanas: [], areas: [], arvore: [] };
    var ECO = DATA.curvaEco || { meses: [], pacotes: [], porCategoria: [] };
    var MAS = DATA.mas || {};
    var CRONO = DATA.cronograma || {};
    var content = A.$("content");

    content.innerHTML =
      '<div id="curvaTabs">' +
        '<div class="tabs">' +
          '<button type="button" class="tab active" data-tab="fisica">Curva S Física</button>' +
          '<button type="button" class="tab" data-tab="economica">Curva S Econômica</button>' +
          '<button type="button" class="tab" data-tab="mas">Pacotes MAS</button>' +
        "</div>" +
        '<div class="tab-panel active" data-tab-panel="fisica" id="fisicaContent"></div>' +
        '<div class="tab-panel" data-tab-panel="economica" id="ecoContent"></div>' +
        '<div class="tab-panel" data-tab-panel="mas" id="masResumoContent"></div>' +
      "</div>";

    renderFisica(CRV, CRONO);
    renderEco(ECO);
    renderMas(MAS);

    A.wireTabs("curvaTabs");

    A.setStatusPills([
      "Curva S gerada em " + (CRV.geradoEm || "—"),
      "Curva Eco gerada em " + (ECO.geradoEm || "—")
    ]);
  }

  render();
  A.wireAtualizarButton(["curvaSFisica", "curvaEco", "mas", "cronograma"], render);
})();
