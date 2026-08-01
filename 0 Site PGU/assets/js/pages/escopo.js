// assets/js/pages/escopo.js — pagina Escopo (EAP — arvore do PEP por area)
(function () {
  "use strict";
  var A = window.App;
  var eapState = { text: "", exact: {} };

  function countVisible(container, selector) {
    var all = container.querySelectorAll(selector);
    var n = 0;
    all.forEach(function (el) { if (el.style.display !== "none") n++; });
    return n;
  }

  function aggregateByArea(rows) {
    var map = {};
    rows.forEach(function (it) {
      if (!map[it.areaCodigo]) map[it.areaCodigo] = { nome: it.areaNome, count: 0 };
      map[it.areaCodigo].count++;
    });
    return Object.keys(map).map(function (cod) {
      return { codigo: cod, label: cod + " - " + map[cod].nome, value: map[cod].count };
    }).sort(function (a, b) { return b.value - a.value; });
  }

  function buildEapTree(areas) {
    return (areas || []).map(function (area) {
      var subareasHtml = (area.subareas || []).map(function (sub) {
        var itemsHtml = (sub.itens || []).map(function (item) {
          return '<details class="eap-item" data-area="' + A.esc(area.codigo) + '" data-frente="' + A.esc(item.frente) + '">' +
            "<summary><span class=\"eap-item__codigo\">" + A.esc(item.codigo) + "</span>" +
            (item.nome && item.nome !== item.codigo ? '<span class="eap-item__nome">' + A.esc(item.nome) + "</span>" : "") +
            (item.frente ? A.badge(item.frente, "dim") : "") +
            "</summary>" +
            '<p class="eap-item__escopo">' + A.esc(item.escopo || "Sem descrição detalhada.") + "</p>" +
            "</details>";
        }).join("");
        return '<details class="eap-subarea" data-area="' + A.esc(area.codigo) + '">' +
          "<summary>" + A.esc(sub.codigo) + " — " + A.esc(sub.nome) + '<span class="eap-count">' + A.fmtNum(sub.totalItens) + " itens</span></summary>" +
          '<div class="eap-subarea__body">' + itemsHtml + "</div>" +
          "</details>";
      }).join("");
      return '<details class="eap-area" open data-area="' + A.esc(area.codigo) + '">' +
        "<summary>" + A.esc(area.codigo) + " — " + A.esc(area.nome) + '<span class="eap-count">' + A.fmtNum(area.totalItens) + " itens</span></summary>" +
        '<div class="eap-area__body">' + subareasHtml + "</div>" +
        "</details>";
    }).join("") || '<div class="eap-empty">Nenhuma área encontrada.</div>';
  }

  function render() {
    var ARV = (window.PANEL_DATA && window.PANEL_DATA.escopoArvore) || {};
    var content = A.$("content");
    var flatItens = ARV.itens || [];

    var initialEapArea = A.qs("eapArea");
    var initialEapFrente = A.qs("eapFrente");
    var initialEapQ = A.qs("eapQ") || "";
    eapState = { text: initialEapQ, exact: { areaCodigo: initialEapArea, frente: initialEapFrente } };

    var kpiHtml = [
      { icon: "🗂️", label: "Áreas mapeadas", value: A.fmtNum(ARV.totalAreas) },
      { icon: "📍", label: "Sub-áreas", value: A.fmtNum(ARV.totalSubareas) },
      { icon: "📋", label: "Itens de escopo detalhado", value: A.fmtNum(ARV.totalItens), cls: "blue" }
    ].map(function (k) {
      return '<div class="kpi-card ' + (k.cls || "") + '"><div class="kpi-card__icon">' + k.icon + '</div><div class="kpi-card__label">' + A.esc(k.label) + '</div><div class="kpi-card__value">' + k.value + '</div><div class="kpi-card__bar"></div></div>';
    }).join("");

    var areaOptions = (ARV.arvore || []).map(function (a) { return { value: a.codigo, label: a.codigo + " - " + a.nome }; });
    var frenteOptions = A.distinctValues(flatItens, "frente");

    var toolbarHtml = A.filterToolbar([
      { key: "areaCodigo", label: "Área", value: initialEapArea, options: areaOptions },
      { key: "frente", label: "Frente", value: initialEapFrente, options: frenteOptions }
    ]);

    content.innerHTML =
      A.sectionLabel("Resumo") +
      '<div class="kpi-grid">' + kpiHtml + "</div>" +
      A.sectionLabel("Quantidade de escopo por área") +
      '<div class="panel"><h3 class="panel__title">Quantidade de escopo por área</h3><p class="panel__subtitle">Clique em uma barra para explodir/filtrar a árvore por área</p><div id="eapAreaChart"></div></div>' +
      '<div class="panel"><h3 class="panel__title">Quantidade de escopo por frente</h3><p class="panel__subtitle">Clique em uma barra para filtrar a árvore por frente</p><div id="eapFrenteChart"></div></div>' +
      A.sectionLabel("Estrutura Analítica do Projeto (EAP)") +
      '<div class="panel">' +
        '<p class="panel__subtitle">Área → Sub-área → Item, com o escopo detalhado de cada atividade. Clique num item para expandir a descrição completa.</p>' +
        '<div class="eap-toolbar-row" id="eapFilterToolbar">' + toolbarHtml +
          '<button type="button" class="btn-neutral" id="eapExpandAll">⊞ Expandir tudo</button>' +
          '<button type="button" class="btn-neutral" id="eapCollapseAll">⊟ Recolher tudo</button>' +
        "</div>" +
        '<div class="search-box"><span>🔎</span><input type="text" id="eapSearch" placeholder="Buscar por código, nome ou texto do escopo..." value="' + A.esc(initialEapQ) + '"></div>' +
        '<div class="table-caption" id="eapCount"></div>' +
        '<div class="eap-tree" id="eapTree">' + buildEapTree(ARV.arvore) + "</div>" +
      "</div>" +
      '<div class="footnote">Fonte: Arvore_Escopo_Rev07.xlsx, aba "Overview". Documento complementar: DE-0000SA-G-50907-Rev7.pdf, disponível na pasta "2 Escopo". ' +
        'Veja também o <a href="cronograma.html">Cronograma</a> e a <a href="engenharia.html">Engenharia Detalhada</a>.</div>';

    // ------------------------------------------------------------ graficos + arvore + filtros

    function renderCharts() {
      var areaRows = flatItens.filter(function (it) { return !eapState.exact.frente || String(it.frente) === String(eapState.exact.frente); });
      var frenteRows = flatItens.filter(function (it) { return !eapState.exact.areaCodigo || String(it.areaCodigo) === String(eapState.exact.areaCodigo); });

      var areaItems = aggregateByArea(areaRows).map(function (a) { return { label: a.label, value: a.value, color: A.COLORS.valeGreen, codigo: a.codigo }; });
      var frenteItems = A.countBy(frenteRows, "frente").map(function (f) { return { label: f.label, value: f.value, color: A.COLORS.valeBlue }; });

      A.$("eapAreaChart").innerHTML = A.barRows(areaItems, { clickable: true, activeKey: eapState.exact.areaCodigo, getKey: function (it) { return it.codigo; } });
      A.$("eapFrenteChart").innerHTML = A.barRows(frenteItems, { clickable: true, activeKey: eapState.exact.frente });
    }

    function applyFilters() {
      var areaFilter = eapState.exact.areaCodigo;
      var frenteFilter = eapState.exact.frente;
      var text = (eapState.text || "").toLowerCase();
      var anyFilter = !!(areaFilter || frenteFilter || text);
      var tree = A.$("eapTree");

      var totalVisible = 0;
      tree.querySelectorAll(".eap-item").forEach(function (el) {
        var matchArea = !areaFilter || el.getAttribute("data-area") === areaFilter;
        var matchFrente = !frenteFilter || el.getAttribute("data-frente") === frenteFilter;
        var matchText = !text || el.textContent.toLowerCase().indexOf(text) !== -1;
        var visible = matchArea && matchFrente && matchText;
        el.style.display = visible ? "" : "none";
        if (visible) totalVisible++;
      });

      tree.querySelectorAll(".eap-subarea").forEach(function (sub) {
        var n = countVisible(sub, ".eap-item");
        sub.style.display = n > 0 ? "" : "none";
        if (anyFilter && n > 0) sub.open = true;
      });

      tree.querySelectorAll(".eap-area").forEach(function (area) {
        var n = countVisible(area, ".eap-item");
        area.style.display = n > 0 ? "" : "none";
        if (anyFilter && n > 0) area.open = true;
      });

      A.$("eapCount").textContent = A.fmtNum(totalVisible) + " de " + A.fmtNum(flatItens.length) + " itens exibidos";
    }

    function applyAll() {
      renderCharts();
      applyFilters();
      A.syncFilterToolbar("eapFilterToolbar", eapState);
      A.setQuery({ eapArea: eapState.exact.areaCodigo, eapFrente: eapState.exact.frente, eapQ: eapState.text || null });
    }

    function toggleExact(key, value) {
      eapState.exact[key] = (eapState.exact[key] && String(eapState.exact[key]) === String(value)) ? null : value;
      applyAll();
    }

    var pseudoTable = {
      setExactValue: function (key, value) { eapState.exact[key] = value || null; applyAll(); },
      clearAll: function () {
        eapState = { text: "", exact: {} };
        var searchInput = A.$("eapSearch");
        if (searchInput) searchInput.value = "";
        applyAll();
      },
      getState: function () { return eapState; }
    };

    A.wireFilterToolbar("eapFilterToolbar", pseudoTable);
    A.onDelegated(A.$("eapAreaChart"), "[data-key]", function (el) { toggleExact("areaCodigo", el.getAttribute("data-key")); });
    A.onDelegated(A.$("eapFrenteChart"), "[data-key]", function (el) { toggleExact("frente", el.getAttribute("data-key")); });

    A.$("eapSearch").addEventListener("input", function (e) {
      eapState.text = e.target.value;
      applyAll();
    });

    A.$("eapExpandAll").addEventListener("click", function () {
      A.$("eapTree").querySelectorAll(".eap-area, .eap-subarea").forEach(function (d) { d.open = true; });
    });
    A.$("eapCollapseAll").addEventListener("click", function () {
      A.$("eapTree").querySelectorAll(".eap-area, .eap-subarea").forEach(function (d) { d.open = false; });
    });

    applyAll();

    A.setStatusPills(["Gerado em " + (ARV.geradoEm || "—")]);
    A.setNavBadge("escopo", ARV.totalItens || 0);
  }

  render();
  A.wireAtualizarButton(["escopoArvore"], render);
})();
