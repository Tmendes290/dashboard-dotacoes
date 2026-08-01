// assets/js/pages/visao-geral.js — pagina consolidada (Visao Geral / index.html)
(function () {
  "use strict";
  var A = window.App;

  function render() {
    var DATA = window.PANEL_DATA || {};
    var MAS = DATA.mas || {};
    var CRONO = DATA.cronograma || {};
    var ESCOPO = DATA.escopo || {};
    var ENG = DATA.engenharia || {};
    var PGU = DATA.pgu || {};
    var content = A.$("content");

    var atualizadoPct = MAS.totalPacotes ? Math.round((MAS.atualizados / MAS.totalPacotes) * 100) : 0;
    var duracaoProjeto = A.daysBetween(CRONO.projeto && CRONO.projeto.inicio, CRONO.projeto && CRONO.projeto.termino);

    var pguAtividades = PGU.atividades || [];
    var pguDatas = [];
    pguAtividades.forEach(function (a) { if (a.inicio) pguDatas.push(a.inicio); if (a.termino) pguDatas.push(a.termino); });
    var pguInicio = pguDatas.length ? pguDatas.reduce(function (a, b) { return a < b ? a : b; }) : null;
    var pguFim = pguDatas.length ? pguDatas.reduce(function (a, b) { return a > b ? a : b; }) : null;
    var hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    var diasParaPgu = pguInicio ? Math.round((new Date(pguInicio) - hoje) / 86400000) : null;
    var pguAtrasadas = pguAtividades.filter(function (a) { return a.status === "Atrasada"; }).length;
    var pguValor = (diasParaPgu !== null && diasParaPgu > 0) ? "em " + diasParaPgu + "d" : (pguFim && new Date(pguFim) < hoje ? "concluída" : "em andamento");

    var kpis = [
      { icon: "🛑", label: "PGU — Repotenciamento TCLD", value: pguValor, hint: pguAtrasadas ? pguAtrasadas + " atividades atrasadas" : A.fmtNum(pguAtividades.length) + " atividades mapeadas", cls: pguAtrasadas ? "bad" : "", href: "pgu.html" },
      { icon: "📦", label: "Pacotes MAS (total)", value: A.fmtNum(MAS.totalPacotes), hint: "Status em " + A.fmtDate(MAS.statusData), cls: "", href: "mas.html" },
      { icon: "⏱️", label: "Pacotes atrasados", value: A.fmtNum(MAS.atrasados ? MAS.atrasados.length : 0), hint: "Farol vermelho no MAS", cls: "bad", href: "mas.html?farol=" + encodeURIComponent("Atrasado") },
      { icon: "⚠️", label: "Pacotes em atenção", value: A.fmtNum(MAS.emAtencao ? MAS.emAtencao.length : 0), hint: "Farol amarelo no MAS", cls: "warn", href: "mas.html?farol=" + encodeURIComponent("Atenção") },
      { icon: "🔄", label: "MAS atualizado", value: atualizadoPct + "%", hint: A.fmtNum(MAS.atualizados) + " de " + A.fmtNum(MAS.totalPacotes) + " pacotes", cls: "blue", href: "mas.html" },
      { icon: "🗓️", label: "Prazo do projeto", value: A.fmtNum(duracaoProjeto) + " dias", hint: A.fmtDate(CRONO.projeto && CRONO.projeto.inicio) + " – " + A.fmtDate(CRONO.projeto && CRONO.projeto.termino), cls: "", href: "cronograma.html" },
      { icon: "🏗️", label: "Frentes do cronograma", value: A.fmtNum(CRONO.areas ? CRONO.areas.length : 0), hint: A.fmtNum(CRONO.totalAtividades) + " atividades mapeadas", cls: "", href: "cronograma.html" },
      { icon: "📐", label: "Itens de escopo", value: A.fmtNum(ESCOPO.itens ? ESCOPO.itens.length : 0), hint: "Obras civis, montagens e comissionamento", cls: "", href: "escopo.html" },
      { icon: "🛠️", label: "Tarefas de engenharia", value: A.fmtNum(ENG.totalTarefas), hint: A.fmtDate(ENG.projeto && ENG.projeto.inicio) + " – " + A.fmtDate(ENG.projeto && ENG.projeto.termino), cls: "", href: "engenharia.html" }
    ];

    var kpiHtml = kpis.map(function (k) {
      var body = '<div class="kpi-card-link"><div class="kpi-card ' + k.cls + '"><div class="kpi-card__icon">' + k.icon + '</div><div class="kpi-card__label">' + A.esc(k.label) + '</div>' +
        '<div class="kpi-card__value">' + k.value + '</div><div class="kpi-card__hint">' + A.esc(k.hint) + '</div><div class="kpi-card__bar"></div></div></div>';
      return k.href ? '<a href="' + k.href + '" style="text-decoration:none;color:inherit;">' + body + "</a>" : body;
    }).join("");

    var alertHtml = A.alertBand([
      { count: MAS.atrasados ? MAS.atrasados.length : 0, label: "Dotações/pacotes atrasados", hint: "MAS — farol vermelho", tone: "bad", href: "mas.html?farol=" + encodeURIComponent("Atrasado") },
      { count: MAS.emAtencao ? MAS.emAtencao.length : 0, label: "Pacotes em atenção", hint: "MAS — farol amarelo", tone: "warn", href: "mas.html?farol=" + encodeURIComponent("Atenção") },
      { count: (ENG.tarefasComAtraso || []).length, label: "Tarefas de engenharia com desvio", hint: "vs. baseline de 25/06", tone: "info", href: "engenharia.html" }
    ]);

    var farolItems = (MAS.porFarol || []).map(function (f) {
      return { label: f.farol, value: f.quantidade, color: A.FAROL_COLORS[f.farol] || A.COLORS.valeGray };
    });

    var frenteItems = (MAS.porFrente || []).map(function (f) {
      return { label: f.frente, value: f.quantidade, color: A.COLORS.valeGreen };
    });

    var legend = farolItems.map(function (it) {
      return '<a class="chart-legend__item" href="mas.html?farol=' + encodeURIComponent(it.label) + '" style="text-decoration:none;color:inherit;cursor:pointer;">' +
        '<span class="chart-legend__swatch" style="background:' + it.color + '"></span>' + A.esc(it.label) + " (" + it.value + ")</a>";
    }).join("");

    var atrasadosTop = (MAS.atrasados || []).slice(0, 6);
    var atrasadosHtml = atrasadosTop.map(function (p) {
      return '<div class="timeline__item"><a href="mas.html?search=' + encodeURIComponent(p.codigoPacote) + '">' +
        '<div class="timeline__dot" style="background:#D93025;box-shadow:0 0 0 2px #D93025;"></div>' +
        '<div class="timeline__date">' + A.esc(p.codigoPacote) + " · " + A.esc(p.frente) + "</div>" +
        '<div class="timeline__label">' + A.esc(p.descricao) + " — necessidade " + A.fmtDate(p.dataNecessidade) +
        (p.desvioDias ? ", desvio de " + p.desvioDias + " dias" : "") + "</div></a></div>";
    }).join("") || '<div class="table-caption">Nenhum pacote atrasado no momento.</div>';

    content.innerHTML =
      alertHtml +
      A.sectionLabel("Resumo do projeto") +
      '<div class="kpi-grid">' + kpiHtml + "</div>" +
      A.sectionLabel("Análise visual — MAS / Suprimentos") +
      '<div class="grid-2">' +
        '<div class="panel"><h3 class="panel__title">Status das dotações no MAS (farol)</h3><p class="panel__subtitle">Clique em uma fatia para abrir o MAS já filtrado</p>' +
          '<div id="visaoFarolChart" style="display:flex;align-items:center;gap:24px;flex-wrap:wrap;">' + A.donutChart(farolItems, 170, { clickable: true, centerLabel: "pacotes" }) + '<div class="chart-legend" style="flex-direction:column;">' + legend + "</div></div></div>" +
        '<div class="panel"><h3 class="panel__title">Pacotes por frente</h3><p class="panel__subtitle">Clique em uma barra para abrir o MAS filtrado por frente</p><div id="visaoFrenteChart">' + A.barRows(frenteItems, { clickable: true }) + "</div></div>" +
      "</div>" +
      '<div class="panel"><h3 class="panel__title">Pacotes atrasados que precisam de atenção</h3><p class="panel__subtitle">Top pacotes com farol vermelho no MAS — clique para localizar na lista completa em "MAS — Suprimentos"</p>' +
        '<div class="timeline">' + atrasadosHtml + "</div></div>" +
      '<div class="panel"><h3 class="panel__title">Cash and Cost Control &amp; Dotação</h3><p class="panel__subtitle">Estas frentes ainda não têm planilha de origem disponível — as seções já estão preparadas no menu e serão preenchidas assim que os dados chegarem.</p></div>';

    A.onDelegated(A.$("visaoFarolChart"), "[data-key]", function (el) {
      window.location.href = "mas.html?farol=" + encodeURIComponent(el.getAttribute("data-key"));
    });
    A.onDelegated(A.$("visaoFrenteChart"), "[data-key]", function (el) {
      window.location.href = "mas.html?frente=" + encodeURIComponent(el.getAttribute("data-key"));
    });

    var geradoEmMax = [MAS.geradoEm, CRONO.geradoEm, ESCOPO.geradoEm, ENG.geradoEm]
      .filter(Boolean)
      .sort()
      .pop();

    A.setStatusPills([
      "MAS: " + (MAS.statusData ? A.fmtDate(MAS.statusData) : "sem dados"),
      "Gerado em " + (geradoEmMax || "—")
    ]);

    var atrasadosCount = (MAS.atrasados || []).length;
    A.setNavBadge("mas", atrasadosCount || MAS.totalPacotes || 0, atrasadosCount ? "count-bad" : "");
    A.setNavBadge("cronograma", CRONO.areas ? CRONO.areas.length : 0);
    A.setNavBadge("escopo", (ESCOPO.itens || []).length);
    A.setNavBadge("engenharia", ENG.totalTarefas || 0, "count-purple");
  }

  render();
  A.wireAtualizarButton(["mas", "cronograma", "escopo", "engenharia", "pgu"], render);
})();
