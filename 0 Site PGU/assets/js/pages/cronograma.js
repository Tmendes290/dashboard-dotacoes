// assets/js/pages/cronograma.js — pagina Cronograma
(function () {
  "use strict";
  var A = window.App;
  var table;

  function marcosTable(marcos, id) {
    return '<div class="table-wrap" id="' + id + '"><table class="data-table"><thead><tr><th>#</th><th>Marco</th><th>Duração</th><th>Dur. acum.</th><th>Data prevista</th></tr></thead><tbody>' +
      marcos.map(function (m) {
        return '<tr data-marco="' + A.esc(m.descricao) + '"><td>' + A.esc(m.seq) + "</td><td>" + A.esc(m.descricao) + "</td><td>" + A.esc(m.duracao) + "</td><td>" + A.esc(m.duracaoAcumulada) + "</td><td>" + A.fmtDate(m.dataPrevista) + "</td></tr>";
      }).join("") + "</tbody></table></div>";
  }

  function kpiCard(icon, label, value, cls) {
    return '<div class="kpi-card ' + (cls || "") + '"><div class="kpi-card__icon">' + icon + '</div>' +
      '<div class="kpi-card__label">' + A.esc(label) + '</div><div class="kpi-card__value">' + value + "</div>" +
      '<div class="kpi-card__bar"></div></div>';
  }

  function render() {
    var CRONO = (window.PANEL_DATA && window.PANEL_DATA.cronograma) || {};
    var content = A.$("content");
    var proj = CRONO.projeto || {};
    var areas = CRONO.areas || [];

    var initialText = A.qs("search") || "";
    var startOnTabela = !!initialText;

    var kpiHtml = [
      kpiCard("🚀", "Início do projeto", A.fmtDate(proj.inicio)),
      kpiCard("🏁", "Término previsto", A.fmtDate(proj.termino)),
      kpiCard("📅", "Duração total", A.fmtNum(A.daysBetween(proj.inicio, proj.termino)) + " dias", "blue"),
      kpiCard("🏗️", "Atividades mapeadas", A.fmtNum(CRONO.totalAtividades))
    ].join("");

    var gantt = A.ganttRows(areas, proj.inicio, proj.termino);

    content.innerHTML =
      A.sectionLabel("Resumo") +
      '<div class="kpi-grid">' + kpiHtml + "</div>" +
      '<div class="panel"><h3 class="panel__title">Frentes / Áreas — janela de execução</h3><p class="panel__subtitle">Início e término planejados por área, com número de atividades</p>' + gantt + "</div>" +
      '<div id="cronoTabs">' +
        '<div class="tabs">' +
          '<button type="button" class="tab' + (startOnTabela ? "" : " active") + '" data-tab="dashboard">Marcos</button>' +
          '<button type="button" class="tab' + (startOnTabela ? " active" : "") + '" data-tab="tabela">Cronograma detalhado</button>' +
        '</div>' +
        '<div class="tab-panel' + (startOnTabela ? "" : " active") + '" data-tab-panel="dashboard">' +
          '<div class="grid-2">' +
            '<div class="panel"><h3 class="panel__title">Marcos contratuais</h3><p class="panel__subtitle">Clique em um marco para localizá-lo no cronograma detalhado</p>' + marcosTable(CRONO.marcosContratuais || [], "cronoMarcosContratuais") + "</div>" +
            '<div class="panel"><h3 class="panel__title">Marcos — Requisição Técnica (Montadora CPF)</h3><p class="panel__subtitle">Clique em um marco para localizá-lo no cronograma detalhado</p>' + marcosTable(CRONO.marcosMilplan || [], "cronoMarcosMilplan") + "</div>" +
          "</div>" +
        "</div>" +
        '<div class="tab-panel' + (startOnTabela ? " active" : "") + '" data-tab-panel="tabela">' +
          '<div class="panel"><h3 class="panel__title">Cronograma detalhado</h3><p class="panel__subtitle">Todas as atividades do cronograma — use a busca para filtrar por nome ou ID</p>' +
            '<div id="cronoTable"></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="footnote">Veja também a <a href="engenharia.html">Engenharia Detalhada</a> e o <a href="escopo.html">Escopo</a>.</div>';

    table = A.makeFilterableTable("cronoTable", CRONO.atividades || [], [
      { key: "id", label: "ID" },
      { key: "nome", label: "Atividade" },
      { key: "duracao", label: "Duração" },
      { key: "inicio", label: "Início", render: function (r) { return A.fmtDate(r.inicio); } },
      { key: "termino", label: "Término", render: function (r) { return A.fmtDate(r.termino); } }
    ], {
      limit: 200,
      searchPlaceholder: "Buscar atividade...",
      initialText: initialText,
      onFilterChange: function (state) { A.setQuery({ search: state.text || null }); }
    });

    function wireMarcoClicks(id) {
      A.onDelegated(A.$(id), "tr[data-marco]", function (el) {
        document.querySelector('#cronoTabs .tab[data-tab="tabela"]').click();
        table.setText(el.getAttribute("data-marco"));
        A.$("cronoTable").scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }
    wireMarcoClicks("cronoMarcosContratuais");
    wireMarcoClicks("cronoMarcosMilplan");

    A.wireTabs("cronoTabs");

    A.setStatusPills(["Gerado em " + (CRONO.geradoEm || "—")]);
    A.setNavBadge("cronograma", areas.length);
  }

  render();
  A.wireAtualizarButton(["cronograma"], render);
})();
