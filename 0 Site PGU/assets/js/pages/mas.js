// assets/js/pages/mas.js — pagina MAS: Suprimentos
(function () {
  "use strict";
  var A = window.App;
  var table;

  function pacotesTable(list, withDesvio, id) {
    var cols = "<th>Cód. Pacote</th><th>Frente</th><th>Descrição</th><th>Necessidade</th><th>Tend. chegada</th>" +
      (withDesvio ? "<th>Desvio</th>" : "") + "<th>Comprador</th><th>Atual.</th>";
    var rows = list.map(function (p) {
      return '<tr data-pacote="' + A.esc(p.codigoPacote) + '"><td>' + A.esc(p.codigoPacote) + "</td><td>" + A.esc(p.frente) + "</td><td>" + A.esc(p.descricao) + "</td><td>" +
        A.fmtDate(p.dataNecessidade) + "</td><td>" + A.fmtDate(p.tendenciaChegada) + "</td>" +
        (withDesvio ? "<td>" + (p.desvioDias !== null && p.desvioDias !== undefined ? "+" + p.desvioDias + "d" : "—") + "</td>" : "") +
        "<td>" + A.esc(p.comprador) + "</td><td>" + (p.atualizado ? A.badge("✓", "farol-concluido") : A.badge("—", "dim")) + "</td></tr>";
    }).join("");
    return '<div class="table-wrap" id="' + id + '"><table class="data-table"><thead><tr>' + cols + "</tr></thead><tbody>" +
      (rows || '<tr><td colspan="8" style="text-align:center;color:#747678;">Nenhum pacote.</td></tr>') + "</tbody></table></div>";
  }

  function kpiCard(opts) {
    return '<div class="kpi-card ' + (opts.cls || "") + '"><div class="kpi-card__icon">' + opts.icon + '</div>' +
      '<div class="kpi-card__label">' + A.esc(opts.label) + '</div><div class="kpi-card__value">' + opts.value + "</div>" +
      (opts.hint ? '<div class="kpi-card__hint">' + A.esc(opts.hint) + "</div>" : "") +
      '<div class="kpi-card__bar"></div></div>';
  }

  function render() {
    var MAS = (window.PANEL_DATA && window.PANEL_DATA.mas) || {};
    var allPacotes = MAS.pacotes || [];
    var content = A.$("content");

    var initialFarol = A.qs("farol");
    var initialFrente = A.qs("frente");
    var initialComprador = A.qs("comprador");
    var initialCategoria = A.qs("categoria");
    var initialText = A.qs("search") || "";

    function computeExcept(exceptKey, exact) {
      return allPacotes.filter(function (p) {
        return Object.keys(exact).every(function (k) {
          if (k === exceptKey) return true;
          var v = exact[k];
          if (!v) return true;
          return String(p[k]) === String(v);
        });
      });
    }

    var kpiHtml = [
      kpiCard({ icon: "📦", label: "Total de pacotes", value: A.fmtNum(MAS.totalPacotes), cls: "" }),
      kpiCard({ icon: "⏱️", label: "Atrasados", value: A.fmtNum(MAS.atrasados ? MAS.atrasados.length : 0), cls: "bad" }),
      kpiCard({ icon: "⚠️", label: "Em atenção", value: A.fmtNum(MAS.emAtencao ? MAS.emAtencao.length : 0), cls: "warn" }),
      kpiCard({ icon: "🔄", label: "Atualizados nesta semana", value: A.fmtNum(MAS.atualizados), cls: "blue" })
    ].join("");

    var alertHtml = A.alertBand([
      { count: MAS.atrasados ? MAS.atrasados.length : 0, label: "Pacotes atrasados", hint: "Farol vermelho — ação imediata", tone: "bad" },
      { count: MAS.emAtencao ? MAS.emAtencao.length : 0, label: "Pacotes em atenção", hint: "Farol amarelo — acompanhar", tone: "warn" },
      { count: MAS.naoAtualizados || 0, label: "Sem atualização recente", hint: "Cobrar status do comprador", tone: "info" }
    ]);

    var startOnTabela = !!(initialFarol || initialFrente || initialComprador || initialCategoria || initialText);

    var toolbarHtml = A.filterToolbar([
      { key: "farol", label: "Farol", value: initialFarol, options: A.distinctValues(allPacotes, "farol") },
      { key: "frente", label: "Frente", value: initialFrente, options: A.distinctValues(allPacotes, "frente") },
      { key: "categoria", label: "Categoria", value: initialCategoria, options: A.distinctValues(allPacotes, "categoria") },
      { key: "comprador", label: "Comprador", value: initialComprador, options: A.distinctValues(allPacotes, "comprador") }
    ]);

    content.innerHTML =
      '<div id="masFilterToolbar">' + toolbarHtml + "</div>" +
      '<div id="masTabs">' +
        '<div class="tabs">' +
          '<button type="button" class="tab' + (startOnTabela ? "" : " active") + '" data-tab="dashboard">Dashboard</button>' +
          '<button type="button" class="tab' + (startOnTabela ? " active" : "") + '" data-tab="tabela">Tabela completa</button>' +
        '</div>' +
        '<div class="tab-panel' + (startOnTabela ? "" : " active") + '" data-tab-panel="dashboard">' +
          alertHtml +
          A.sectionLabel("Resumo") +
          '<div class="kpi-grid">' + kpiHtml + "</div>" +
          A.sectionLabel("Análise visual — clique para cruzar os filtros") +
          '<div class="grid-2">' +
            '<div class="panel"><h3 class="panel__title">Status por farol</h3><p class="panel__subtitle">Clique em uma fatia ou na legenda — filtra a barra ao lado e a tabela completa</p>' +
              '<div id="masFarolChart" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;"></div></div>' +
            '<div class="panel"><h3 class="panel__title">Pacotes por frente</h3><p class="panel__subtitle">Clique em uma barra — filtra o gráfico de farol e a tabela completa</p><div id="masFrenteChart"></div></div>' +
          "</div>" +
          '<div class="panel"><h3 class="panel__title">Pacotes atrasados</h3><p class="panel__subtitle">Farol vermelho — clique em um pacote para localizá-lo na tabela completa</p>' + pacotesTable(MAS.atrasados || [], true, "masAtrasadosTable") + "</div>" +
          '<div class="panel"><h3 class="panel__title">Pacotes em atenção</h3><p class="panel__subtitle">Farol amarelo — acompanhar de perto</p>' + pacotesTable(MAS.emAtencao || [], false, "masAtencaoTable") + "</div>" +
        "</div>" +
        '<div class="tab-panel' + (startOnTabela ? " active" : "") + '" data-tab-panel="tabela">' +
          '<div class="panel"><h3 class="panel__title">Todos os pacotes</h3><p class="panel__subtitle">Busque por código, descrição, comprador ou frente — os filtros do Dashboard continuam ativos aqui</p>' +
            '<div id="masTable"></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="footnote">Fonte: ' + A.esc(MAS.statusData ? "MAS CPF Salobo III — status em " + A.fmtDate(MAS.statusData) : "") + "</div>";

    function renderCharts(state) {
      var farolRows = computeExcept("farol", state.exact);
      var frenteRows = computeExcept("frente", state.exact);
      var farolItems = A.countBy(farolRows, "farol").map(function (f) {
        return { label: f.label, value: f.value, color: A.FAROL_COLORS[f.label] || A.COLORS.valeGray };
      });
      var frenteItems = A.countBy(frenteRows, "frente").map(function (f) {
        return { label: f.label, value: f.value, color: A.COLORS.valeGreen };
      });

      var legend = farolItems.map(function (it) {
        var isActive = state.exact.farol && String(state.exact.farol) === String(it.label);
        return '<div class="chart-legend__item bar-row--clickable' + (isActive ? " bar-row--active" : "") +
          '" data-key="' + A.esc(it.label) + '" role="button" tabindex="0" style="cursor:pointer;">' +
          '<span class="chart-legend__swatch" style="background:' + it.color + '"></span>' + A.esc(it.label) +
          " (" + it.value + ")</div>";
      }).join("");

      A.$("masFarolChart").innerHTML = A.donutChart(farolItems, 170, { clickable: true, activeKey: state.exact.farol, centerLabel: "pacotes" }) +
        '<div class="chart-legend" style="flex-direction:column;">' + legend + "</div>";
      A.$("masFrenteChart").innerHTML = A.barRows(frenteItems, { clickable: true, activeKey: state.exact.frente });
    }

    var initialState = { text: initialText, exact: { farol: initialFarol, frente: initialFrente, categoria: initialCategoria, comprador: initialComprador } };
    renderCharts(initialState);

    table = A.makeFilterableTable("masTable", allPacotes, [
      { key: "codigoPacote", label: "Cód. Pacote" },
      { key: "frente", label: "Frente" },
      { key: "descricao", label: "Descrição" },
      { key: "categoria", label: "Categoria" },
      { key: "comprador", label: "Comprador" },
      { key: "farol", label: "Farol", render: function (r) { return A.badge(r.farol || "—", A.farolBadgeClass(r.farol)); } },
      { key: "dataNecessidade", label: "Necessidade", render: function (r) { return A.fmtDate(r.dataNecessidade); } }
    ], {
      limit: 250,
      searchPlaceholder: "Buscar pacote...",
      initialText: initialText,
      initialExact: { farol: initialFarol, frente: initialFrente, categoria: initialCategoria, comprador: initialComprador },
      filterLabels: { farol: "Farol", frente: "Frente", categoria: "Categoria", comprador: "Comprador" },
      onFilterChange: function (state) {
        renderCharts(state);
        A.syncFilterToolbar("masFilterToolbar", state);
        A.setQuery({
          farol: state.exact.farol, frente: state.exact.frente,
          categoria: state.exact.categoria, comprador: state.exact.comprador,
          search: state.text || null
        });
      }
    });

    A.onDelegated(A.$("masFarolChart"), "[data-key]", function (el) {
      table.setExact("farol", el.getAttribute("data-key"));
    });
    A.onDelegated(A.$("masFrenteChart"), "[data-key]", function (el) {
      table.setExact("frente", el.getAttribute("data-key"));
    });
    A.wireFilterToolbar("masFilterToolbar", table);
    // Nota: farol/frente cruzam os dois graficos e a tabela sem trocar de aba —
    // o usuario ve o efeito no grafico irmao na hora; a aba "Tabela completa" reflete
    // o mesmo filtro quando ele quiser ver a lista.
    A.onDelegated(A.$("masAtrasadosTable"), "tr[data-pacote]", function (el) {
      document.querySelector('#masTabs .tab[data-tab="tabela"]').click();
      table.setText(el.getAttribute("data-pacote"));
      A.$("masTable").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    A.onDelegated(A.$("masAtencaoTable"), "tr[data-pacote]", function (el) {
      document.querySelector('#masTabs .tab[data-tab="tabela"]').click();
      table.setText(el.getAttribute("data-pacote"));
      A.$("masTable").scrollIntoView({ behavior: "smooth", block: "start" });
    });

    A.wireTabs("masTabs");

    A.setStatusPills([
      MAS.statusData ? "Status MAS: " + A.fmtDate(MAS.statusData) : "Status MAS: —",
      "Gerado em " + (MAS.geradoEm || "—")
    ]);
    A.setNavBadge("mas", MAS.totalPacotes || 0);
  }

  render();
  A.wireAtualizarButton(["mas"], render);
})();
