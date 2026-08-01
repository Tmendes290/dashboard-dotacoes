// assets/js/pages/engenharia.js — pagina Engenharia Detalhada
(function () {
  "use strict";
  var A = window.App;
  var table;

  function kpiCard(icon, label, value, cls) {
    return '<div class="kpi-card ' + (cls || "") + '"><div class="kpi-card__icon">' + icon + '</div>' +
      '<div class="kpi-card__label">' + A.esc(label) + '</div><div class="kpi-card__value">' + value + "</div>" +
      '<div class="kpi-card__bar"></div></div>';
  }

  function render() {
    var ENG = (window.PANEL_DATA && window.PANEL_DATA.engenharia) || {};
    var content = A.$("content");
    var proj = ENG.projeto || {};
    var marcos = ENG.marcosPrincipais || [];
    var porDisciplina = (ENG.porDisciplina || []).map(function (d) {
      return { label: d.disciplina, value: d.quantidade, color: A.COLORS.valeBlue };
    });

    var initialDisciplina = table ? table.getState().exact.disciplina : A.qs("disciplina");
    var initialArea = table ? table.getState().exact.area : A.qs("area");
    var initialText = table ? table.getState().text : (A.qs("search") || "");
    var startOnTabela = !!(initialDisciplina || initialArea || initialText);

    var toolbarHtml = A.filterToolbar([
      { key: "disciplina", label: "Disciplina", value: initialDisciplina, options: A.distinctValues(ENG.tarefas, "disciplina") },
      { key: "area", label: "Área", value: initialArea, options: A.distinctValues(ENG.tarefas, "area") }
    ]);

    var kpiHtml = [
      kpiCard("🚀", "Início", A.fmtDate(proj.inicio)),
      kpiCard("🏁", "Término previsto", A.fmtDate(proj.termino)),
      kpiCard("🛠️", "Total de tarefas", A.fmtNum(ENG.totalTarefas), "blue"),
      kpiCard("📍", "Marcos principais", A.fmtNum(marcos.length))
    ].join("");

    var alertHtml = A.alertBand([
      { count: (ENG.tarefasComAtraso || []).length, label: "Tarefas com data alterada", hint: "vs. baseline de 25/06", tone: "warn" }
    ]);

    var marcosHtml = marcos.map(function (m) {
      return '<div class="timeline__item"><a href="#" data-marco="' + A.esc(m.nome) + '"><div class="timeline__dot"></div><div class="timeline__date">' + A.fmtDate(m.termino) + '</div>' +
        '<div class="timeline__label">' + A.esc(m.nome) + "</div></a></div>";
    }).join("") || '<div class="table-caption">Nenhum marco identificado.</div>';

    content.innerHTML =
      '<div id="engFilterToolbar">' + toolbarHtml + "</div>" +
      alertHtml +
      A.sectionLabel("Resumo") +
      '<div class="kpi-grid">' + kpiHtml + "</div>" +
      A.sectionLabel("Análise visual") +
      '<div class="grid-2">' +
        '<div class="panel"><h3 class="panel__title">Marcos principais</h3><p class="panel__subtitle">Datas-chave do cronograma de engenharia — clique para localizar na tabela</p><div class="timeline" id="engMarcos">' + marcosHtml + "</div></div>" +
        '<div class="panel"><h3 class="panel__title">Tarefas por disciplina</h3><p class="panel__subtitle">Clique em uma barra para filtrar a tabela de tarefas</p><div id="engDisciplinaChart">' +
          (porDisciplina.length ? A.barRows(porDisciplina, { clickable: true, activeKey: initialDisciplina }) : '<p class="table-caption">Sem classificação por disciplina nesta planilha.</p>') + "</div></div>" +
      "</div>" +
      '<div id="engTabs">' +
        '<div class="tabs">' +
          '<button type="button" class="tab' + (startOnTabela ? "" : " active") + '" data-tab="dashboard">Alterações vs. baseline</button>' +
          '<button type="button" class="tab' + (startOnTabela ? " active" : "") + '" data-tab="tabela">Todas as tarefas</button>' +
        '</div>' +
        '<div class="tab-panel' + (startOnTabela ? "" : " active") + '" data-tab-panel="dashboard">' +
          '<div class="panel"><h3 class="panel__title">Alterações de data vs. baseline (versão 25/06)</h3>' +
            '<p class="panel__subtitle">Tarefas cujo término atual ficou depois do planejado na baseline de 25/06 — usar como indicativo de replanejamento, não necessariamente atraso real.</p>' +
            '<div class="table-wrap"><table class="data-table"><thead><tr><th>Tarefa</th><th>Área</th><th>Término atual</th><th>Término baseline</th><th>Desvio</th></tr></thead><tbody>' +
            (ENG.tarefasComAtraso || []).slice(0, 25).map(function (t) {
              return "<tr><td>" + A.esc(t.nome) + "</td><td>" + A.esc(t.area) + "</td><td>" + A.fmtDate(t.termino) + "</td><td>" + A.fmtDate(t.terminoBaseline) + "</td><td>" + A.badge("+" + t.desvioDias + "d", "farol-atencao") + "</td></tr>";
            }).join("") + "</tbody></table></div>" +
            '<div class="table-caption">Mostrando os 25 maiores desvios de ' + A.fmtNum((ENG.tarefasComAtraso || []).length) + " tarefas com data alterada.</div></div>" +
        "</div>" +
        '<div class="tab-panel' + (startOnTabela ? " active" : "") + '" data-tab-panel="tabela">' +
          '<div class="panel"><h3 class="panel__title">Todas as tarefas</h3><p class="panel__subtitle">Busque por nome, disciplina ou área — ou use o gráfico acima para filtrar por disciplina</p>' +
            '<div id="engTable"></div>' +
          "</div>" +
        "</div>" +
      "</div>" +
      '<div class="footnote">Veja também o <a href="cronograma.html">Cronograma</a> e o <a href="escopo.html">Escopo</a>.</div>';

    table = A.makeFilterableTable("engTable", ENG.tarefas || [], [
      { key: "nome", label: "Tarefa", render: function (r) { return (r.resumo ? "<strong>" : "") + A.esc(r.nome) + (r.resumo ? "</strong>" : ""); } },
      { key: "duracao", label: "Duração" },
      { key: "inicio", label: "Início", render: function (r) { return A.fmtDate(r.inicio); } },
      { key: "termino", label: "Término", render: function (r) { return A.fmtDate(r.termino); } },
      { key: "disciplina", label: "Disciplina" },
      { key: "area", label: "Área" }
    ], {
      limit: 250,
      searchPlaceholder: "Buscar tarefa...",
      initialText: initialText,
      initialExact: { disciplina: initialDisciplina, area: initialArea },
      filterLabels: { disciplina: "Disciplina", area: "Área" },
      onFilterChange: function (state) {
        var chart = A.$("engDisciplinaChart");
        if (porDisciplina.length && chart) {
          chart.innerHTML = A.barRows(porDisciplina, { clickable: true, activeKey: state.exact.disciplina });
        }
        A.syncFilterToolbar("engFilterToolbar", state);
        A.setQuery({ disciplina: state.exact.disciplina, area: state.exact.area, search: state.text || null });
      }
    });

    A.onDelegated(A.$("engDisciplinaChart"), "[data-key]", function (el) {
      document.querySelector('#engTabs .tab[data-tab="tabela"]').click();
      table.setExact("disciplina", el.getAttribute("data-key"));
    });
    A.onDelegated(A.$("engMarcos"), "[data-marco]", function (el, e) {
      e.preventDefault();
      document.querySelector('#engTabs .tab[data-tab="tabela"]').click();
      table.setText(el.getAttribute("data-marco"));
      A.$("engTable").scrollIntoView({ behavior: "smooth", block: "start" });
    });
    A.wireFilterToolbar("engFilterToolbar", table, function () {
      document.querySelector('#engTabs .tab[data-tab="tabela"]').click();
    });

    A.wireTabs("engTabs");

    A.setStatusPills(["Gerado em " + (ENG.geradoEm || "—")]);
    A.setNavBadge("engenharia", ENG.totalTarefas || 0, "count-purple");
  }

  render();
  A.wireAtualizarButton(["engenharia"], render);
})();
