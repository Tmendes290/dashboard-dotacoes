const fs = require('fs');
const raw = JSON.parse(fs.readFileSync('vel_data.json','utf8'));
const DATA_JSON = JSON.stringify(raw);

const css = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--sb:#002F6C;--sb2:#004A9E;--acc:#009CDE;--acc2:#0073B6;--acc3:#10b981;--bg:#EEF4FB;--card:#fff;--text:#1a2a40;--muted:#5a7a99;--bord:#d0dff0;--warn:#f59e0b;--danger:#ef4444;--purple:#8b5cf6}
body{font-family:'Inter',sans-serif;background:var(--bg);color:var(--text);display:flex;height:100vh;overflow:hidden;width:100vw}
.sb{width:240px;min-width:240px;background:var(--sb);display:flex;flex-direction:column;height:100vh;overflow-y:auto;position:relative;z-index:100;flex-shrink:0}
.sb-logo{padding:14px 14px 12px;border-bottom:1px solid rgba(255,255,255,.07)}
.sb-logo-row{display:flex;align-items:center;gap:10px}
.sb-icon{width:38px;height:38px;background:var(--acc);border-radius:5px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:15px;color:#fff;flex-shrink:0}
.sb-name{font-size:12px;font-weight:800;color:#fff;line-height:1.3}
.sb-tagline{font-size:9px;color:rgba(255,255,255,.35);text-transform:uppercase;letter-spacing:2px;margin-top:2px}
.sb-proj{padding:10px 14px;border-bottom:1px solid rgba(255,255,255,.07)}
.sb-proj-lbl{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.3);margin-bottom:2px}
.sb-proj-name{font-size:11px;color:rgba(255,255,255,.65);font-weight:500}
.sb-proj-tag{font-size:10px;color:var(--acc);font-weight:700;text-transform:uppercase;margin-top:3px}
.sb-nav{padding:8px 0;flex:1}
.sb-nav-sec{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:rgba(255,255,255,.22);padding:8px 14px 4px}
.sb-item{display:flex;align-items:center;gap:8px;padding:8px 14px;cursor:pointer;font-size:12px;font-weight:500;color:rgba(255,255,255,.5);transition:all .15s;position:relative}
.sb-item:hover{background:rgba(255,255,255,.05);color:rgba(255,255,255,.85)}
.sb-item.active{background:var(--sb2);color:#fff}
.sb-item.active::before{content:'';position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--acc);border-radius:0 2px 2px 0}
.sb-badge{margin-left:auto;font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;background:var(--danger);color:#fff}
.sb-footer{padding:10px 14px;border-top:1px solid rgba(255,255,255,.07);font-size:10px;color:rgba(255,255,255,.4)}
.sb-footer strong{color:rgba(255,255,255,.65);display:block;margin-bottom:1px}
.main{flex:1;display:flex;flex-direction:column;overflow:hidden}
.topbar{background:var(--card);border-bottom:1px solid var(--bord);border-top:3px solid var(--acc);padding:0 22px;height:54px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0}
.topbar-title{font-size:16px;font-weight:800;letter-spacing:-.3px}
.topbar-sub{font-size:11px;color:var(--muted);margin-top:1px}
.statusbar{background:var(--card);border-bottom:3px solid var(--acc);padding:0 22px;height:36px;display:flex;align-items:center;gap:16px;flex-shrink:0;font-size:11px;overflow:hidden}
.s-live{display:flex;align-items:center;gap:5px;font-weight:700;color:var(--acc3);flex-shrink:0}
.dot-live{width:7px;height:7px;background:var(--acc3);border-radius:50%;animation:blink 1.5s infinite;flex-shrink:0}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.3}}
.s-sep{width:1px;height:16px;background:var(--bord);flex-shrink:0}
.s-item{display:flex;align-items:center;gap:4px;color:var(--muted);white-space:nowrap}
.s-item strong{color:var(--text);font-weight:600}
.content{flex:1;overflow-y:auto;overflow-x:hidden;padding:16px 22px;display:flex;flex-direction:column;gap:12px;width:100%}
.sec{display:flex;align-items:center;gap:10px;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:2px;color:var(--muted)}
.sec::after{content:'';flex:1;height:1px;background:var(--bord)}
.kpi-row{display:grid;grid-template-columns:repeat(5,1fr);gap:12px}
.kpi{background:var(--card);border-radius:6px;border:1px solid var(--bord);padding:13px 16px;position:relative;overflow:hidden}
.kpi::before{content:'';position:absolute;top:0;left:0;right:0;height:3px}
.kpi.blue::before{background:var(--acc2)}.kpi.green::before{background:var(--acc3)}.kpi.orange::before{background:var(--acc)}.kpi.red::before{background:var(--danger)}.kpi.purple::before{background:var(--purple)}
.kpi-lbl{font-size:9px;text-transform:uppercase;letter-spacing:2px;color:var(--muted);margin-bottom:6px;font-weight:700}
.kpi-val{font-size:24px;font-weight:900;color:var(--text);letter-spacing:-1px;line-height:1}
.kpi.green .kpi-val{color:var(--acc3)}.kpi.orange .kpi-val{color:var(--acc)}.kpi.red .kpi-val{color:var(--danger)}.kpi.purple .kpi-val{color:var(--purple)}.kpi.blue .kpi-val{color:var(--acc2)}
.kpi-sub{font-size:10px;color:var(--muted);margin-top:4px}
.cc{background:var(--card);border-radius:6px;border:1px solid var(--bord);padding:14px 16px}
.cc-hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:6px}
.cc-title{font-size:12px;font-weight:800;color:var(--text)}
.cc-badge{font-size:10px;color:var(--muted);background:var(--bg);padding:2px 8px;border-radius:4px;font-weight:600;white-space:nowrap}
.chart-h220{height:220px;position:relative}
.g2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.g-60-40{display:grid;grid-template-columns:1.5fr 1fr;gap:12px}
.tbl-wrap{overflow-x:auto;max-height:340px;overflow-y:auto}
table{width:100%;border-collapse:collapse;font-size:11px}
thead th{position:sticky;top:0;background:var(--bg);border-bottom:2px solid var(--bord);padding:6px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:700;white-space:nowrap;z-index:1}
tbody tr{border-bottom:1px solid var(--bord);transition:background .1s}
tbody tr:hover{background:var(--bg)}
td{padding:6px 10px;vertical-align:middle}
.pill{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;white-space:nowrap}
.pill-red{background:#fee2e2;color:#b91c1c}.pill-orange{background:#ffedd5;color:#c2410c}.pill-yellow{background:#fef9c3;color:#a16207}.pill-green{background:#dcfce7;color:#15803d}.pill-blue{background:#e0f2fe;color:#0369a1}
.filters{background:var(--card);border-radius:6px;border:1px solid var(--bord);padding:10px 16px;display:flex;align-items:flex-end;gap:10px;flex-wrap:wrap}
.fg{display:flex;flex-direction:column;gap:3px}
.fg label{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:var(--muted);font-weight:700}
select,input[type=text]{background:var(--bg);border:1px solid var(--bord);color:var(--text);padding:5px 8px;font-family:'Inter',sans-serif;font-size:11px;font-weight:500;outline:none;cursor:pointer;border-radius:4px}
select:focus,input:focus{border-color:var(--acc)}
.ms-wrap{position:relative;user-select:none}
.ms-input{display:flex;align-items:center;justify-content:space-between;padding:5px 8px;border:1px solid var(--bord);border-radius:4px;background:var(--bg);cursor:pointer;font-size:11px;min-width:140px;gap:6px;white-space:nowrap}
.ms-input:hover{border-color:var(--acc)}
.ms-lbl{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;color:var(--text)}
.ms-drop{position:absolute;top:calc(100% + 3px);left:0;min-width:100%;max-width:320px;background:var(--card);border:1px solid var(--bord);border-radius:6px;box-shadow:0 6px 20px rgba(0,0,0,.12);z-index:9999;max-height:280px;overflow-y:auto}
.ms-search{padding:6px 8px;border-bottom:1px solid var(--bord);position:sticky;top:0;background:var(--card)}
.ms-search input{width:100%;padding:4px 7px;border:1px solid var(--bord);border-radius:4px;font-size:11px;font-family:inherit;box-sizing:border-box;outline:none}
.ms-opt{display:flex;align-items:center;gap:7px;padding:6px 10px;cursor:pointer;font-size:11px;color:var(--text)}
.ms-opt:hover{background:var(--bg)}
.ms-opt input[type=checkbox]{accent-color:var(--acc);width:13px;height:13px;cursor:pointer;flex-shrink:0}
.ms-opt.selected{background:rgba(0,156,222,.1);font-weight:600}
.ms-footer{padding:5px 8px;border-top:1px solid var(--bord);display:flex;gap:6px;position:sticky;bottom:0;background:var(--card)}
.ms-footer button{flex:1;padding:4px;font-size:10px;font-weight:700;border-radius:4px;border:none;cursor:pointer;font-family:inherit}
.ms-btn-all{background:var(--bg);color:var(--text)}.ms-btn-none{background:#fee2e2;color:#dc2626}
.alert-crit{background:#fff5f5;border:1px solid #fecaca;border-radius:6px;padding:13px 16px;display:flex;align-items:center;gap:16px}
.driver-card{background:var(--bg);border-radius:5px;padding:10px 12px;margin-bottom:7px;display:flex;align-items:center;gap:9px;border:1px solid var(--bord)}
.driver-card:last-child{margin-bottom:0}
.arr{width:26px;height:26px;border-radius:5px;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;font-weight:700}
.arr-down{background:#dcfce7;color:#15803d}.arr-up{background:#fee2e2;color:#b91c1c}
.fb{height:5px;flex:1;background:var(--bord);border-radius:2px;overflow:hidden;min-width:50px}
.fb-fill{height:100%;border-radius:2px;background:var(--danger)}
.trend-row{display:flex;align-items:center;gap:8px;margin-bottom:6px}
.trend-lbl{font-size:10px;font-weight:700;color:var(--muted);width:56px;flex-shrink:0;cursor:pointer}
.trend-lbl:hover{color:var(--acc)}
.trend-wrap{flex:1;background:var(--bord);border-radius:3px;height:20px;overflow:hidden;cursor:pointer;transition:opacity .15s}
.trend-wrap:hover{opacity:.85}
.trend-wrap.active-filter{outline:2px solid var(--acc);border-radius:3px}
.trend-fill{height:100%;border-radius:3px;display:flex;align-items:center;padding-left:7px}
.trend-txt{font-size:9px;font-weight:700;color:#fff;white-space:nowrap}
.trend-right{font-size:10px;color:var(--muted);width:46px;text-align:right;flex-shrink:0}
.cons-comite{background:#450a0a!important;color:#fca5a5!important}
.cons-rest5{background:#fee2e2;color:#b91c1c}
.cons-rest3{background:#ffedd5;color:#c2410c}
.cons-recicla{background:#fef9c3;color:#a16207}
.cons-advert{background:#fef3c7;color:#b45309}
.cons-conversa{background:#dcfce7;color:#15803d}
/* Embed mode (dentro do iframe do dashboard) */
body.embed .sb{display:none!important}
body.embed .main{width:100%!important}
/* Alert expandable */
.alert-crit{cursor:pointer;transition:box-shadow .2s}
.alert-crit:hover{box-shadow:0 0 0 2px var(--danger)}
.alert-expand{display:none;margin-top:12px;border-top:1px solid #fecaca;padding-top:12px}
.alert-expand.open{display:block}
.alert-expand table{font-size:11px}
.alert-expand thead th{background:#fff5f5;border-bottom:2px solid #fecaca;color:#b91c1c}
.alert-expand tbody tr:hover{background:#fff0f0}
/* Comitê drill-down */
.comite-row-expand{background:#fff5f5;border-top:none}
.comite-row-expand td{padding:10px 14px}
.mo-cell{text-align:center;font-size:11px;font-weight:600;border-radius:4px;padding:3px 6px;min-width:52px}
.mo-empty{color:var(--muted);font-size:10px;text-align:center}
.day-chip{display:inline-block;margin:2px;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:600;background:#fee2e2;color:#b91c1c;cursor:default}
.sev-tag{display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:2px;vertical-align:middle}
/* Active filter chips */
.filter-chips{display:flex;gap:6px;flex-wrap:wrap;padding:0 0 2px}
.fchip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:20px;font-size:10px;font-weight:700;background:rgba(0,156,222,.12);color:var(--acc2);border:1px solid var(--acc);cursor:pointer}
.fchip:hover{background:rgba(0,156,222,.22)}
.fchip span{font-size:11px;font-weight:900;color:var(--acc2)}
`;

const js = `
var _RAW = ${DATA_JSON};
var ALL_ROWS = _RAW.rows;
var ALL_DRIVERS = _RAW.drivers;
var FILTERED = ALL_ROWS.slice();

// active severity filter: null = all, else Set of 'B','M','G','GV'
var SEV_FILTER = null;

var MATRIX = {
  B:{1:'Conversa formal — Líder',2:'Conversa formal + Advert. Verbal',3:'Restrição 03 dias (condução) + Advert. formal + Reciclagem',x:'Comitê pela Vida'},
  M:{1:'Advertência Verbal',2:'Reciclagem + Advert. formal',3:'Restrição 05 dias (condução) + Advert. formal + Reciclagem',x:'Comitê pela Vida'},
  G:{1:'Reciclagem + Advert. formal',2:'Restrição 03 dias (condução) + Advert. formal + Reciclagem',3:'Comitê pela Vida',x:'Comitê pela Vida'},
  GV:{1:'Restrição 03 dias (condução) + Advert. formal + Reciclagem',2:'Restrição 05 dias (condução) + Advert. formal + Reciclagem',3:'Comitê pela Vida',x:'Comitê pela Vida'}
};

function getConsequencia(sev,count){var m=MATRIX[sev];var k=count>=4?'x':count<=0?1:count;return m[k]||m[3];}
function getConsClass(c){if(c.indexOf('Comitê')>=0)return 'pill cons-comite';if(c.indexOf('05 dias')>=0)return 'pill cons-rest5';if(c.indexOf('03 dias')>=0)return 'pill cons-rest3';if(c.indexOf('Reciclagem')>=0)return 'pill cons-recicla';if(c.indexOf('Verbal')>=0)return 'pill cons-advert';return 'pill cons-conversa';}
function getSevLabel(s){if(s==='GV')return '<span class="pill pill-red">Gravíssima</span>';if(s==='G')return '<span class="pill pill-orange">Grave</span>';if(s==='M')return '<span class="pill pill-yellow">Média</span>';if(s==='C')return '<span class="pill pill-blue">Conversa</span>';return '<span class="pill pill-green">Baixa</span>';}

// ── MULTI-SELECT ──────────────────────────────────────────────────
var _msStore={};
function buildMs(id,items,ph,cb){_msStore[id]={items:items,sel:new Set(),open:false,cb:cb,ph:ph};renderMs(id);}
function renderMs(id){
  var s=_msStore[id],wrap=document.getElementById(id);if(!wrap)return;
  var lbl=s.sel.size===0?s.ph:s.sel.size===s.items.length?'Todos':s.sel.size+' sel.';
  var active=s.sel.size>0;
  wrap.innerHTML='<div class="ms-input" style="'+(active?'border-color:var(--acc);background:#e0f2fe':'')+'" onclick="event.stopPropagation();msOpen(\\''+id+'\\')"><span class="ms-lbl" style="'+(active?'color:var(--acc2);font-weight:700':'')+'">'+lbl+'</span><span style="font-size:9px;color:var(--muted)">▼</span></div>'
    +(s.open?'<div class="ms-drop" onclick="event.stopPropagation()">'
      +'<div class="ms-search"><input id="srch-'+id+'" placeholder="Buscar..." oninput="msFilter(\\''+id+'\\')"></div>'
      +'<div id="opts-'+id+'">'+renderOpts(id,s.items)+'</div>'
      +'<div class="ms-footer"><button class="ms-btn-all" onclick="msAll(\\''+id+'\\')">Todos</button><button class="ms-btn-none" onclick="msNone(\\''+id+'\\')">Limpar</button></div>'
    +'</div>':'');
}
function renderOpts(id,items){
  var s=_msStore[id];
  return items.map(function(it){
    var es=it.replace(/\\\\/g,'\\\\\\\\').replace(/'/g,"\\\\'");
    return '<div class="ms-opt'+(s.sel.has(it)?' selected':'')+'" onclick="msTog(\\''+id+'\\',\\''+es+'\\')"><input type="checkbox"'+(s.sel.has(it)?' checked':'')+' onclick="event.stopPropagation();msTog(\\''+id+'\\',\\''+es+'\\')"> '+it+'</div>';
  }).join('');
}
function msOpen(id){Object.keys(_msStore).forEach(function(k){if(k!==id&&_msStore[k].open){_msStore[k].open=false;renderMs(k);}});_msStore[id].open=!_msStore[id].open;renderMs(id);if(_msStore[id].open){setTimeout(function(){var el=document.getElementById('srch-'+id);if(el)el.focus();},50);}}
function msTog(id,val){var s=_msStore[id];if(s.sel.has(val))s.sel.delete(val);else s.sel.add(val);renderMs(id);s.cb();}
function msAll(id){var s=_msStore[id];s.items.forEach(function(i){s.sel.add(i);});renderMs(id);s.cb();}
function msNone(id){_msStore[id].sel.clear();renderMs(id);_msStore[id].cb();}
function msFilter(id){var q=document.getElementById('srch-'+id).value.toLowerCase();var s=_msStore[id];document.getElementById('opts-'+id).innerHTML=renderOpts(id,s.items.filter(function(i){return i.toLowerCase().includes(q);}));}
document.addEventListener('click',function(){Object.keys(_msStore).forEach(function(k){if(_msStore[k].open){_msStore[k].open=false;renderMs(k);}});});

var MESES_ALL=['Janeiro','Fevereiro','Março','Abril','Maio','Junho'];
var MESES_IDX={Janeiro:'01',Fevereiro:'02','Março':'03',Abril:'04',Maio:'05',Junho:'06'};
var MESES_LABEL=['Jan','Fev','Mar','Abr','Mai','Jun'];
var DIAS_ALL=Array.from({length:31},function(_,i){return String(i+1).padStart(2,'0');});
var MO_LABELS=['2026-01','2026-02','2026-03','2026-04','2026-05','2026-06'];

buildMs('ms-mes',MESES_ALL,'Todos os meses',applyFilters);
buildMs('ms-dia',DIAS_ALL,'Todos os dias',applyFilters);
buildMs('ms-area',['Salobo Projetos'],'Todas as áreas',applyFilters);
buildMs('ms-motorista',ALL_DRIVERS,'Todos os motoristas',applyFilters);

// ── CHART FILTER: CLICK MONTH BAR ────────────────────────────────
function clickMonthBar(moLabel) {
  var msm = _msStore['ms-mes'];
  if(msm.sel.has(moLabel)) msm.sel.delete(moLabel);
  else msm.sel.add(moLabel);
  renderMs('ms-mes');
  applyFilters();
}

// ── CHART FILTER: CLICK DRIVER IN EVOLUTION ──────────────────────
function clickEvolDriver(name) {
  var msd = _msStore['ms-motorista'];
  // Find full driver name
  var full = ALL_DRIVERS.find(function(d){return d.startsWith(name.split(' ')[0])&&d.includes(name.split(' ')[1]||'');});
  if(!full) return;
  if(msd.sel.has(full)) msd.sel.delete(full);
  else { msd.sel.clear(); msd.sel.add(full); }
  renderMs('ms-motorista');
  applyFilters();
}

// ── APPLY FILTERS ─────────────────────────────────────────────────
function applyFilters(){
  var ano=document.getElementById('f-ano').value;
  var selMes=_msStore['ms-mes'].sel;
  var selDia=_msStore['ms-dia'].sel;
  var selDrv=_msStore['ms-motorista'].sel;
  FILTERED=ALL_ROWS.filter(function(r){
    var dt=r[0],yr=dt.slice(0,4),mo=dt.slice(5,7),dy=dt.slice(8,10);
    if(ano&&yr!==ano)return false;
    if(selMes.size>0){var moL=Object.keys(MESES_IDX).find(function(k){return MESES_IDX[k]===mo;});if(!moL||!selMes.has(moL))return false;}
    if(selDia.size>0&&!selDia.has(dy))return false;
    if(selDrv.size>0&&!selDrv.has(r[1]))return false;
    return true;
  });
  SEV_FILTER=null; // reset severity filter on main filter change
  updateFilterChips();
  renderAll();
}

function resetFilters(){
  document.getElementById('f-ano').value='2026';
  Object.keys(_msStore).forEach(function(k){_msStore[k].sel.clear();_msStore[k].open=false;renderMs(k);});
  FILTERED=ALL_ROWS.slice();SEV_FILTER=null;updateFilterChips();renderAll();
}

// ── SEVERITY FILTER (from donut click) ───────────────────────────
function toggleSevFilter(sev) {
  if(!SEV_FILTER) { SEV_FILTER=new Set([sev]); }
  else if(SEV_FILTER.has(sev)) { SEV_FILTER.delete(sev); if(SEV_FILTER.size===0)SEV_FILTER=null; }
  else { SEV_FILTER.add(sev); }
  updateFilterChips();
  renderAll();
}

// ── FILTER CHIPS (active filter display) ─────────────────────────
function updateFilterChips() {
  var chips=[];
  var selMes=_msStore['ms-mes'].sel;
  var selDrv=_msStore['ms-motorista'].sel;
  var selDia=_msStore['ms-dia'].sel;
  if(selMes.size>0) selMes.forEach(function(m){chips.push({label:m,type:'mes',val:m});});
  if(selDia.size>0) selDia.forEach(function(d){chips.push({label:'Dia '+d,type:'dia',val:d});});
  if(selDrv.size>0) selDrv.forEach(function(d){chips.push({label:d.split(' ').slice(0,2).join(' '),type:'drv',val:d});});
  if(SEV_FILTER) SEV_FILTER.forEach(function(s){
    var lbl={B:'Baixa',M:'Média',G:'Grave',GV:'Gravíssima'}[s];
    chips.push({label:lbl,type:'sev',val:s});
  });
  var el=document.getElementById('filter-chips');
  if(!el)return;
  el.innerHTML=chips.length===0?'':chips.map(function(c){
    return '<span class="fchip" onclick="removeChip(\\''+c.type+'\\',\\''+c.val.replace(/'/g,'\\\\\\'')+'\\')" title="Remover filtro">'+c.label+' <span>×</span></span>';
  }).join('');
}

function removeChip(type,val) {
  if(type==='mes'){_msStore['ms-mes'].sel.delete(val);renderMs('ms-mes');applyFilters();}
  else if(type==='dia'){_msStore['ms-dia'].sel.delete(val);renderMs('ms-dia');applyFilters();}
  else if(type==='drv'){_msStore['ms-motorista'].sel.delete(val);renderMs('ms-motorista');applyFilters();}
  else if(type==='sev'){toggleSevFilter(val);}
}

// ── PERIOD LABEL ─────────────────────────────────────────────────
function getPeriodLabel(){
  var selMes=_msStore['ms-mes'].sel;
  var selDia=_msStore['ms-dia'].sel;
  var selDrv=_msStore['ms-motorista'].sel;
  var parts=[];
  if(selMes.size===0) parts.push('Jan – Jun 2026');
  else parts.push([...selMes].join(', ')+' 2026');
  if(selDia.size>0) parts.push('Dias: '+[...selDia].sort().join(', '));
  if(selDrv.size>0) parts.push(selDrv.size+' motorista'+(selDrv.size>1?'s':''));
  if(SEV_FILTER&&SEV_FILTER.size>0){
    var nm=[...SEV_FILTER].map(function(s){return{B:'Baixa',M:'Média',G:'Grave',GV:'Gravíssima'}[s];}).join(', ');
    parts.push('Severidade: '+nm);
  }
  return parts.join(' · ');
}

// ── AGGREGATE ─────────────────────────────────────────────────────
function getRows() {
  if(!SEV_FILTER) return FILTERED;
  return FILTERED.filter(function(r){
    var ev=0;
    if(SEV_FILTER.has('B'))ev+=r[2];
    if(SEV_FILTER.has('M'))ev+=r[3];
    if(SEV_FILTER.has('G'))ev+=r[4];
    if(SEV_FILTER.has('GV'))ev+=r[5];
    return ev>0;
  });
}

function rowEv(r){
  if(!SEV_FILTER) return r[2]+r[3]+r[4]+r[5];
  var ev=0;
  if(SEV_FILTER.has('B'))ev+=r[2];
  if(SEV_FILTER.has('M'))ev+=r[3];
  if(SEV_FILTER.has('G'))ev+=r[4];
  if(SEV_FILTER.has('GV'))ev+=r[5];
  return ev;
}

function byDriver(rows){
  var m={};
  rows.forEach(function(r){
    var d=r[1],ev=rowEv(r);if(!ev)return;
    if(!m[d])m[d]={drv:d,ev:0,b:0,mb:0,g:0,gv:0,dur:0,maxV:0};
    if(!SEV_FILTER||SEV_FILTER.has('B'))m[d].b+=r[2];
    if(!SEV_FILTER||SEV_FILTER.has('M'))m[d].mb+=r[3];
    if(!SEV_FILTER||SEV_FILTER.has('G'))m[d].g+=r[4];
    if(!SEV_FILTER||SEV_FILTER.has('GV'))m[d].gv+=r[5];
    m[d].ev+=ev;m[d].dur+=r[6];m[d].maxV=Math.max(m[d].maxV,r[7]);
  });
  return Object.values(m);
}

function byMonth(rows){
  var m={};
  rows.forEach(function(r){var mo=r[0].slice(0,7),ev=rowEv(r);if(!m[mo])m[mo]={ev:0,dur:0};m[mo].ev+=ev;m[mo].dur+=r[6];});
  return m;
}

function getWorstSev(d){if(d.gv>0)return 'GV';if(d.g>0)return 'G';if(d.mb>0)return 'M';return 'B';}
function getDriverCons(d){var s=getWorstSev(d);var cnt=d.b+d.mb+d.g+d.gv;return getConsequencia(s,cnt);}

// ── CHARTS ────────────────────────────────────────────────────────
var chartSev=null, chartEv=null;
var TREND_CLRS=['background:var(--danger)','background:#f97316','background:var(--warn)','background:#84cc16','background:var(--acc3)','background:#14b8a6'];

// ── COMITÊ EXPAND ─────────────────────────────────────────────────
var expandedRows = new Set();
function toggleExpand(idx) {
  if(expandedRows.has(idx)) expandedRows.delete(idx); else expandedRows.add(idx);
  renderComiteTable(_lastComiteDrivers);
}
var _lastComiteDrivers = [];

function renderComiteTable(comiteDrvs) {
  _lastComiteDrivers = comiteDrvs;
  var rows = getRows();
  var tbody = document.getElementById('comite-tbody');
  if(!tbody) return;
  tbody.innerHTML = comiteDrvs.map(function(d,idx) {
    // Group rows for this driver by month
    var dRows = rows.filter(function(r){return r[1]===d.drv;});
    var byMo={};
    MO_LABELS.forEach(function(m){byMo[m]={b:0,mb:0,g:0,gv:0,total:0};});
    var allDays={};
    dRows.forEach(function(r){
      var mo=r[0].slice(0,7);
      if(!byMo[mo])byMo[mo]={b:0,mb:0,g:0,gv:0,total:0};
      byMo[mo].b+=r[2];byMo[mo].mb+=r[3];byMo[mo].g+=r[4];byMo[mo].gv+=r[5];
      var ev=r[2]+r[3]+r[4]+r[5];byMo[mo].total+=ev;
      if(!allDays[r[0]])allDays[r[0]]={total:0,gv:0,g:0};
      allDays[r[0]].total+=ev;allDays[r[0]].gv+=r[5];allDays[r[0]].g+=r[4];
    });
    // Worst days sorted
    var daysSorted=Object.entries(allDays).sort(function(a,b){return b[1].total-a[1].total;});

    // Month cells
    var moCells = MO_LABELS.map(function(m){
      var mo=byMo[m];if(!mo||!mo.total)return '<td class="mo-empty">—</td>';
      var bg=mo.gv>0?'#fee2e2':mo.g>0?'#ffedd5':mo.mb>0?'#fef9c3':'#dcfce7';
      var col=mo.gv>0?'#b91c1c':mo.g>0?'#c2410c':mo.mb>0?'#a16207':'#15803d';
      return '<td><div class="mo-cell" style="background:'+bg+';color:'+col+'">'+mo.total+'</div></td>';
    }).join('');

    var worstDay=daysSorted[0]?daysSorted[0][0].slice(8,10)+'/'+daysSorted[0][0].slice(5,7):'—';
    var isOpen=expandedRows.has(idx);

    var mainRow='<tr style="cursor:pointer" onclick="toggleExpand('+idx+')">'
      +'<td style="font-weight:800;color:var(--muted);width:28px">'+(idx+1)+'</td>'
      +'<td style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:200px" title="'+d.drv+'">'+d.drv.split(' ').slice(0,3).join(' ')+'</td>'
      +'<td style="font-weight:700;color:var(--danger)">'+d.ev.toLocaleString('pt-BR')+'</td>'
      +moCells
      +'<td style="font-weight:700;color:var(--danger)">'+worstDay+'</td>'
      +'<td style="color:var(--muted)">'+(isOpen?'▲ fechar':'▼ detalhes')+'</td>'
      +'</tr>';

    var detailRow='';
    if(isOpen){
      var allDayRows=dRows.slice().sort(function(a,b){
        var ea=a[2]+a[3]+a[4]+a[5],eb=b[2]+b[3]+b[4]+b[5];return eb-ea;
      });
      var tblRows=allDayRows.map(function(r){
        var dt=r[0].slice(8,10)+'/'+r[0].slice(5,7)+'/'+r[0].slice(0,4);
        var ev=r[2]+r[3]+r[4]+r[5];
        var lim=r[8]||0;
        var pct=lim>0?Math.round((r[7]/lim-1)*100):0;
        var sev=pct>30?'Gravíssima':pct>20?'Grave':pct>10?'Média':'Baixa';
        var sevClr=pct>30?'#b91c1c':pct>20?'#c2410c':pct>10?'#a16207':'#15803d';
        var sevBg=pct>30?'#fee2e2':pct>20?'#ffedd5':pct>10?'#fef9c3':'#dcfce7';
        var dur=r[6]<60?r[6]+'s':Math.round(r[6]/60)+'min';
        return '<tr style="border-bottom:1px solid #fde8e8">'
          +'<td style="padding:4px 10px;font-weight:600">'+dt+'</td>'
          +'<td style="padding:4px 10px;text-align:center;font-weight:700;color:var(--danger)">'+ev+'</td>'
          +'<td style="padding:4px 10px;text-align:center;color:#15803d">'+r[2]+'</td>'
          +'<td style="padding:4px 10px;text-align:center;color:#a16207">'+r[3]+'</td>'
          +'<td style="padding:4px 10px;text-align:center;color:#c2410c">'+r[4]+'</td>'
          +'<td style="padding:4px 10px;text-align:center;color:#b91c1c;font-weight:'+(r[5]>0?'700':'400')+'">'+r[5]+'</td>'
          +'<td style="padding:4px 10px;font-weight:700;color:'+(r[7]>=100?'#b91c1c':r[7]>=70?'#c2410c':'var(--text)')+'">'+r[7]+' km/h</td>'
          +'<td style="padding:4px 10px;color:var(--muted)">'+(lim>0?lim+' km/h':'—')+'</td>'
          +'<td style="padding:4px 10px;font-weight:700;color:'+sevClr+'">+'+(lim>0?pct+'%':'—')+'</td>'
          +'<td style="padding:4px 10px"><span style="background:'+sevBg+';color:'+sevClr+';padding:2px 7px;border-radius:20px;font-size:10px;font-weight:700">'+sev+'</span></td>'
          +'<td style="padding:4px 10px;color:var(--muted)">'+dur+'</td>'
          +'</tr>';
      }).join('');
      detailRow='<tr class="comite-row-expand"><td colspan="11">'
        +'<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Histórico completo — '+d.drv+'</div>'
        +'<div style="overflow-x:auto;max-height:280px;overflow-y:auto">'
        +'<table style="width:100%;border-collapse:collapse;font-size:11px">'
        +'<thead><tr style="background:#fff5f5">'
        +'<th style="padding:5px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#b91c1c;white-space:nowrap;border-bottom:2px solid #fecaca">Data</th>'
        +'<th style="padding:5px 10px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#b91c1c;white-space:nowrap;border-bottom:2px solid #fecaca">Eventos</th>'
        +'<th style="padding:5px 10px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#15803d;white-space:nowrap;border-bottom:2px solid #fecaca">Baixa</th>'
        +'<th style="padding:5px 10px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#a16207;white-space:nowrap;border-bottom:2px solid #fecaca">Média</th>'
        +'<th style="padding:5px 10px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#c2410c;white-space:nowrap;border-bottom:2px solid #fecaca">Grave</th>'
        +'<th style="padding:5px 10px;text-align:center;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#b91c1c;white-space:nowrap;border-bottom:2px solid #fecaca">Gravíssima</th>'
        +'<th style="padding:5px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#b91c1c;white-space:nowrap;border-bottom:2px solid #fecaca">Vel. Máx.</th>'
        +'<th style="padding:5px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);white-space:nowrap;border-bottom:2px solid #fecaca">Limite</th>'
        +'<th style="padding:5px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#b91c1c;white-space:nowrap;border-bottom:2px solid #fecaca">Excesso</th>'
        +'<th style="padding:5px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);white-space:nowrap;border-bottom:2px solid #fecaca">Severidade</th>'
        +'<th style="padding:5px 10px;text-align:left;font-size:9px;text-transform:uppercase;letter-spacing:1px;color:var(--muted);white-space:nowrap;border-bottom:2px solid #fecaca">Tempo</th>'
        +'</tr></thead>'
        +'<tbody>'+tblRows+'</tbody>'
        +'</table></div>'
        +'</td></tr>';
    }
    return mainRow+detailRow;
  }).join('');
}

// ── RENDER ALL ────────────────────────────────────────────────────
function renderAll(){
  var rows = getRows();
  var drvData=byDriver(rows).sort(function(a,b){return b.ev-a.ev;});
  var moData=byMonth(rows);
  var totalEv=drvData.reduce(function(s,d){return s+d.ev;},0);
  var totalDur=FILTERED.reduce(function(s,r){return s+r[6];},0); // duration from unfiltered sev
  var totalB=drvData.reduce(function(s,d){return s+d.b;},0);
  var totalM=drvData.reduce(function(s,d){return s+d.mb;},0);
  var totalG=drvData.reduce(function(s,d){return s+d.g;},0);
  var totalGV=drvData.reduce(function(s,d){return s+d.gv;},0);
  var maxVel=FILTERED.reduce(function(s,r){return Math.max(s,r[7]);},0);
  var comiteDrivers=drvData.filter(function(d){return getDriverCons(d).indexOf('Comitê')>=0;});
  var comiteCount=comiteDrivers.length;
  var custo=(totalB*0.04+totalM*0.10+totalG*0.18+totalGV*0.30)*7.11;

  document.getElementById('k-ev').textContent=totalEv.toLocaleString('pt-BR');
  document.getElementById('k-drv').textContent=drvData.length;
  document.getElementById('k-dur').textContent=Math.round(totalDur/3600).toLocaleString('pt-BR')+'h';
  document.getElementById('k-custo').textContent='R$ '+Math.round(custo).toLocaleString('pt-BR');
  document.getElementById('k-comite').textContent=comiteCount;
  document.getElementById('sb-ev').textContent=totalEv.toLocaleString('pt-BR');
  document.getElementById('sb-drv').textContent=drvData.length;
  document.getElementById('sb-dur').textContent=Math.round(totalDur/3600)+'h';
  document.getElementById('sb-vel').textContent=maxVel+' km/h';

  // Period label
  var periodLbl=getPeriodLabel();
  var el=document.getElementById('mat-period');
  if(el)el.textContent=periodLbl;
  var el2=document.getElementById('comite-period');
  if(el2)el2.textContent=periodLbl;

  // TREND BARS (clickable)
  var moVals=MO_LABELS.map(function(m){return moData[m]?moData[m].ev:0;});
  var maxMo=Math.max.apply(null,moVals)||1;
  var selMes=_msStore['ms-mes'].sel;
  var tb=document.getElementById('trend-bars');
  tb.innerHTML=moVals.map(function(v,i){
    var pct=Math.round(v/maxMo*100);
    var dur=moData[MO_LABELS[i]]?Math.round(moData[MO_LABELS[i]].dur/3600):0;
    var moName=MESES_ALL[i];
    var isActive=selMes.has(moName);
    return '<div class="trend-row">'
      +'<div class="trend-lbl" onclick="clickMonthBar(\\''+moName+'\\')" title="Clique para filtrar '+(isActive?'(remover)':'(adicionar)')+'">'+MESES_LABEL[i]+' 26</div>'
      +'<div class="trend-wrap'+(isActive?' active-filter':'')+'" onclick="clickMonthBar(\\''+moName+'\\')" title="Clique para filtrar">'
        +'<div class="trend-fill" style="width:'+pct+'%;'+TREND_CLRS[i]+'">'
        +'<span class="trend-txt">'+v.toLocaleString('pt-BR')+'</span></div></div>'
      +'<div class="trend-right">'+dur+'h</div></div>';
  }).join('');

  // SEVERIDADE DONUT (clickable as filter)
  if(chartSev)chartSev.destroy();
  var sevActive=SEV_FILTER?['B','M','G','GV'].map(function(s){return SEV_FILTER.has(s)?1:.35;}):[1,1,1,1];
  chartSev=new Chart(document.getElementById('chartSev'),{
    type:'doughnut',
    data:{labels:['Baixa (1–10%)','Média (11–20%)','Grave (21–30%)','Gravíssima (>30%)'],
      datasets:[{data:[totalB,totalM,totalG,totalGV],
        backgroundColor:['rgba(34,197,94,VAL)'.replace('VAL',sevActive[0]),'rgba(234,179,8,VAL)'.replace('VAL',sevActive[1]),'rgba(249,115,22,VAL)'.replace('VAL',sevActive[2]),'rgba(239,68,68,VAL)'.replace('VAL',sevActive[3])],
        borderWidth:SEV_FILTER?3:2,borderColor:'#fff'}]},
    options:{
      onClick:function(evt,els){if(els.length>0){var sevs=['B','M','G','GV'];toggleSevFilter(sevs[els[0].index]);}},
      plugins:{legend:{position:'bottom',labels:{color:'#5a7a99',font:{size:10},padding:8}},
        tooltip:{callbacks:{label:function(c){var t=totalB+totalM+totalG+totalGV||1;return ' '+c.raw.toLocaleString('pt-BR')+' ('+Math.round(c.raw/t*100)+'%) — clique para filtrar';}}}},
      cutout:'62%',cursor:'pointer'}
  });

  // MATRIZ
  document.getElementById('mat-count').textContent=drvData.length+' motoristas';
  document.getElementById('mat-tbody').innerHTML=drvData.slice(0,60).map(function(d,i){
    var sev=getWorstSev(d),cons=getDriverCons(d),cc=getConsClass(cons);
    var racBadge=d.gv>3?'<span class="pill" style="background:#1e1b4b;color:#a5b4fc;font-size:9px;margin-left:4px">⚠ Imp. RAC 02</span>':'';
    return '<tr><td style="font-weight:800;color:var(--muted);width:28px">'+(i+1)+'</td>'
      +'<td style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:190px" title="'+d.drv+'">'+d.drv.split(' ').slice(0,3).join(' ')+'</td>'
      +'<td style="font-weight:700">'+d.ev.toLocaleString('pt-BR')+'</td>'
      +'<td style="color:#15803d">'+(d.b||'—')+'</td>'
      +'<td style="color:#a16207">'+(d.mb||'—')+'</td>'
      +'<td style="color:#c2410c">'+(d.g||'—')+'</td>'
      +'<td style="color:#b91c1c;font-weight:'+(d.gv>0?'700':'400')+'">'+(d.gv||'—')+'</td>'
      +'<td style="color:var(--muted);white-space:nowrap">'+(d.dur<60?d.dur+'s':d.dur<3600?Math.round(d.dur/60)+'min':Math.round(d.dur/3600)+'h')+'</td>'
      +'<td>'+getSevLabel(sev)+'</td>'
      +'<td><span class="'+cc+'">'+cons+'</span>'+racBadge+'</td>'
      +'</tr>';
  }).join('');

  // TOP 10
  var maxEv=drvData[0]?drvData[0].ev:1;
  document.getElementById('top10-badge').textContent='Top '+Math.min(10,drvData.length)+' — '+periodLbl;
  document.getElementById('top10-tbody').innerHTML=drvData.slice(0,10).map(function(d,i){
    var pct=Math.round(d.ev/maxEv*100);
    var pillC=i<3?'pill-red':i<6?'pill-orange':'pill-yellow';
    return '<tr><td style="font-weight:800;color:var(--muted)">'+(i+1)+'</td>'
      +'<td style="font-weight:600;max-width:170px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="'+d.drv+'">'+d.drv.split(' ').slice(0,2).join(' ')+'…</td>'
      +'<td><span class="pill '+pillC+'">'+d.ev.toLocaleString('pt-BR')+'</span></td>'
      +'<td><div class="fb"><div class="fb-fill" style="width:'+pct+'%"></div></div></td>'
      +'<td style="color:var(--muted)">'+(d.dur<60?d.dur+'s':d.dur<3600?Math.round(d.dur/60)+'min':Math.round(d.dur/3600)+'h')+'</td>'
      +'<td style="font-weight:700;color:'+(d.maxV>=100?'var(--danger)':d.maxV>=90?'#ea580c':'var(--warn)')+'">'+d.maxV+' km/h</td></tr>';
  }).join('');

  // EVOLUÇÃO TOP5 (clickable legend)
  var top5=drvData.slice(0,5).map(function(d){return d.drv;});
  var byDM={};
  rows.forEach(function(r){var k=r[1]+'|'+r[0].slice(0,7);if(!byDM[k])byDM[k]=0;byDM[k]+=rowEv(r);});
  var lc=['#ef4444','#f97316','#eab308','#10b981','#009CDE'];
  if(chartEv)chartEv.destroy();
  chartEv=new Chart(document.getElementById('chartEv'),{
    type:'line',
    data:{labels:MESES_LABEL,datasets:top5.map(function(n,i){
      var short=n.split(' ').slice(0,2).join(' ');
      return{label:short,data:MO_LABELS.map(function(m){return byDM[n+'|'+m]||0;}),
        borderColor:lc[i],backgroundColor:lc[i]+'22',tension:.35,pointRadius:5,pointHoverRadius:7,borderWidth:2.5,fill:false};
    })},
    options:{
      onClick:function(evt,els,chart){
        if(els.length>0){var n=top5[els[0].datasetIndex];clickEvolDriver(n.split(' ').slice(0,2).join(' '));}
      },
      plugins:{
        legend:{labels:{color:'#5a7a99',font:{size:9}},position:'bottom',
          onClick:function(evt,item,legend){
            var n=top5[item.datasetIndex];clickEvolDriver(n.split(' ').slice(0,2).join(' '));
          }
        },
        tooltip:{mode:'index',intersect:false,callbacks:{label:function(c){return ' '+c.dataset.label+': '+c.raw+' eventos — clique para filtrar';}}}
      },
      scales:{x:{grid:{color:'#EEF4FB'},ticks:{color:'#5a7a99',font:{size:10}},border:{color:'#d0dff0'}},
              y:{grid:{color:'#EEF4FB'},ticks:{color:'#5a7a99',font:{size:10}},border:{color:'#d0dff0'}}}
    }
  });

  // REINCIDENTES
  var janD=new Set(FILTERED.filter(function(r){return r[0].startsWith('2026-01');}).map(function(r){return r[1];}));
  var recD=new Set(FILTERED.filter(function(r){return r[0].startsWith('2026-05')||r[0].startsWith('2026-06');}).map(function(r){return r[1];}));
  var reincl=[...janD].filter(function(d){return recD.has(d);});
  var evMap={};drvData.forEach(function(d){evMap[d.drv]=d.ev;});
  reincl.sort(function(a,b){return (evMap[b]||0)-(evMap[a]||0);});
  var el3=document.getElementById('reincidentes');
  el3.innerHTML=reincl.length===0
    ?'<div style="font-size:12px;color:var(--muted);padding:12px 0">Nenhum reincidente no período.</div>'
    :reincl.slice(0,6).map(function(d){
      return '<div class="driver-card" style="cursor:pointer" onclick="filterByDriver(\\''+d.replace(/'/g,'\\\\\\'')+'\\')">'
        +'<div class="arr arr-up">▲</div><div style="flex:1;min-width:0">'
        +'<div style="font-size:11px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="'+d+'">'+d.split(' ').slice(0,3).join(' ')+'</div>'
        +'<div style="font-size:10px;color:var(--danger);margin-top:2px">'+evMap[d]+' eventos · ativo desde Jan/2026 · clique para filtrar</div>'
        +'</div></div>';
    }).join('');

  // MELHORA/PIORA
  var mArr=[
    {n:'ELSON GRANJEIRO DOS SANTOS',jan:1307,rec:10,delta:-1297},
    {n:'LUIZ EDUARDO MAIA SOUZA',jan:1172,rec:25,delta:-1147},
    {n:'LUCAS QUENEDES DA SILVA SANTOS',jan:1067,rec:116,delta:-951},
    {n:'ROGERIO DOS SANTOS BATISTA',jan:894,rec:21,delta:-873},
    {n:'MARCELO DIAS OLIVEIRA',jan:725,rec:69,delta:-656},
    {n:'ERASMO CARLOS NUNES SILVA',jan:552,rec:1,delta:-551},
  ];
  var pArr=[
    {n:'ADÃO DE SOUSA RAMOS',jan:719,rec:1073,delta:354},
    {n:'THIAGO LIMA OLIVEIRA BASTOS',jan:192,rec:346,delta:154},
    {n:'JEFERSON LEANDRO DE ARAUJO',jan:57,rec:152,delta:95},
    {n:'GISLEY SOARES LISBOA',jan:190,rec:258,delta:68},
  ];
  document.getElementById('melhoraram').innerHTML=mArr.map(function(d){
    var pct=Math.abs(Math.round(d.delta/d.jan*100));
    return '<div class="driver-card"><div class="arr arr-down">▼</div><div style="flex:1;min-width:0">'
      +'<div style="font-size:11px;font-weight:600">'+d.n.split(' ').slice(0,3).join(' ')+'</div>'
      +'<div style="font-size:10px;margin-top:2px">Jan: <b>'+d.jan+'</b> → Mai/Jun: <b>'+d.rec+'</b> <span style="color:var(--acc3);font-weight:700">−'+pct+'%</span></div>'
      +'</div></div>';
  }).join('');
  document.getElementById('pioraram').innerHTML=pArr.map(function(d){
    var pct=Math.round(d.delta/d.jan*100);
    return '<div class="driver-card"><div class="arr arr-up">▲</div><div style="flex:1;min-width:0">'
      +'<div style="font-size:11px;font-weight:600">'+d.n.split(' ').slice(0,3).join(' ')+'</div>'
      +'<div style="font-size:10px;margin-top:2px">Jan: <b>'+d.jan+'</b> → Mai/Jun: <b>'+d.rec+'</b> <span style="color:var(--danger);font-weight:700">+'+pct+'%</span></div>'
      +'</div></div>';
  }).join('');

  // COMITÊ DRILL-DOWN
  document.getElementById('comite-count').textContent=comiteCount+' motoristas';
  expandedRows.clear();
  renderComiteTable(comiteDrivers.slice(0,30));
}

function filterByDriver(name){
  var msd=_msStore['ms-motorista'];
  msd.sel.clear();msd.sel.add(name);renderMs('ms-motorista');applyFilters();
}

// ── ALERT DETAIL: RANULFO ────────────────────────────────────────
var _alertOpen = false;
function toggleAlertDetail() {
  _alertOpen = !_alertOpen;
  var detail = document.getElementById('alert-detail');
  var hint = document.getElementById('alert-toggle-hint');
  if(_alertOpen) {
    detail.classList.add('open');
    hint.textContent = '▲ fechar';
    var tbody = document.getElementById('ranulfo-tbody');
    if(tbody && !tbody._filled) {
      tbody._filled = true;
      var ranulfo = _RAW.ranulfo || [];
      tbody.innerHTML = ranulfo.map(function(r) {
        var dt = r.dt.slice(8,10)+'/'+r.dt.slice(5,7)+'/'+r.dt.slice(0,4);
        var pct = r.pct;
        var sev = pct>=30?'Gravíssima':pct>=21?'Grave':pct>=11?'Média':'Baixa';
        var sevClr = pct>=30?'#b91c1c':pct>=21?'#c2410c':pct>=11?'#a16207':'#15803d';
        var sevBg  = pct>=30?'#fee2e2':pct>=21?'#ffedd5':pct>=11?'#fef9c3':'#dcfce7';
        var isCrit = (r.maxV===122);
        return '<tr style="'+(isCrit?'background:#fff0f0':'')+'">'
          +'<td style="padding:5px 10px;border-bottom:1px solid #fde8e8;font-weight:'+(isCrit?'700':'400')+';color:'+(isCrit?'#b91c1c':'')+'">'+dt+(isCrit?' 🔴':'')+'</td>'
          +'<td style="padding:5px 10px;border-bottom:1px solid #fde8e8;text-align:center">'+r.ev+'</td>'
          +'<td style="padding:5px 10px;border-bottom:1px solid #fde8e8;font-weight:700;color:'+(r.maxV>=100?'#b91c1c':r.maxV>=70?'#c2410c':'var(--text)')+'">'+r.maxV+' km/h</td>'
          +'<td style="padding:5px 10px;border-bottom:1px solid #fde8e8;color:var(--muted)">'+r.lim+' km/h</td>'
          +'<td style="padding:5px 10px;border-bottom:1px solid #fde8e8;font-weight:700;color:'+sevClr+'">+'+pct+'%</td>'
          +'<td style="padding:5px 10px;border-bottom:1px solid #fde8e8"><span style="background:'+sevBg+';color:'+sevClr+';padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700">'+sev+'</span></td>'
          +'<td style="padding:5px 10px;border-bottom:1px solid #fde8e8;color:var(--muted)">'+(r.dur<60?r.dur+'s':Math.round(r.dur/60)+'min')+'</td>'
          +'</tr>';
      }).join('');
    }
  } else {
    detail.classList.remove('open');
    hint.textContent = '▼ ver detalhes';
  }
}

if(location.search.includes('embed'))document.body.classList.add('embed');

applyFilters();

// ── CARREGAR DADOS DO SERVIDOR (substitui embedded se houver novos) ──
fetch('/api/velocidade')
  .then(function(r){return r.ok?r.json():null;})
  .then(function(d){
    if(!d||!d.payload||!d.payload.rows||d.payload.rows.length===0)return;
    var p=d.payload;
    _RAW=p;ALL_ROWS=p.rows;ALL_DRIVERS=p.drivers;
    FILTERED=ALL_ROWS.slice();SEV_FILTER=null;expandedRows.clear();
    buildMs('ms-motorista',ALL_DRIVERS,'Todos os motoristas',applyFilters);
    applyFilters();
    var upd=d.atualizado_em?new Date(d.atualizado_em).toLocaleDateString('pt-BR'):'';
    if(upd){var sb=document.getElementById('import-status');if(sb){sb.style.display='flex';sb.textContent='Dados de '+upd;}}
  })
  .catch(function(){});

// ── IMPORT: CARREGAR SHEETJS E PROCESSAR EXCEL ───────────────
function handleImport(file){
  if(!file)return;
  var st=document.getElementById('import-status');
  st.style.display='flex';st.textContent='Enviando planilha...';
  var reader=new FileReader();
  reader.onload=function(e){
    try{
      // Converte para base64 e envia para o servidor processar
      var bytes=new Uint8Array(e.target.result);
      var bin='';for(var i=0;i<bytes.byteLength;i++)bin+=String.fromCharCode(bytes[i]);
      var b64=btoa(bin);
      st.textContent='Processando no servidor...';
      fetch('/api/import-velocidade',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({fileBase64:b64})
      })
        .then(function(r){return r.json();})
        .then(function(d){
          if(d.ok){
            st.textContent='✓ '+d.rows.toLocaleString('pt-BR')+' registros · '+d.drivers+' motoristas salvos';
            // Recarrega dados do servidor
            fetch('/api/velocidade')
              .then(function(r2){return r2.ok?r2.json():null;})
              .then(function(d2){
                if(d2&&d2.payload&&d2.payload.rows&&d2.payload.rows.length>0){
                  var p=d2.payload;
                  _RAW=p;ALL_ROWS=p.rows;ALL_DRIVERS=p.drivers;
                  FILTERED=ALL_ROWS.slice();SEV_FILTER=null;expandedRows.clear();
                  buildMs('ms-motorista',ALL_DRIVERS,'Todos os motoristas',applyFilters);
                  applyFilters();
                }
              }).catch(function(){});
          } else { st.textContent='Erro: '+(d.error||'desconhecido'); }
        })
        .catch(function(err){st.textContent='Erro: '+err.message;});
    }catch(err){st.textContent='Erro ao ler arquivo: '+err.message;}
  };
  reader.readAsArrayBuffer(file);
}
`;

const html = `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="UTF-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>Relatório de Velocidade 2026 — Salobo Projetos</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"><\/script>
<style>${css}</style>
</head>
<body>
<div class="sb">
  <div class="sb-logo">
    <div class="sb-logo-row">
      <div class="sb-icon">VP</div>
      <div>
        <div class="sb-name">Equipe de Projetos</div>
        <div class="sb-name" style="font-size:11px;font-weight:600;color:var(--acc)">Salobo &amp; Igarapé Bahia</div>
        <div class="sb-tagline">Controle de Custos</div>
      </div>
    </div>
  </div>
  <div class="sb-proj">
    <div class="sb-proj-lbl">Projeto</div>
    <div class="sb-proj-name">Controle Financeiro de Obras CAPEX</div>
    <div class="sb-proj-tag">Vale Base Metals — Salobo</div>
  </div>
  <div class="sb-nav">
    <div class="sb-nav-sec">Dotações</div>
    <div class="sb-item" onclick="window.location='/'" style="cursor:pointer"><span>📊</span> Visão Geral</div>
    <div class="sb-item" onclick="window.location='/'" style="cursor:pointer"><span>📋</span> Resumo Sub PEP</div>
    <div class="sb-item" onclick="window.location='/'" style="cursor:pointer"><span>📄</span> Dotações</div>
    <div class="sb-nav-sec">Saúde Capex</div>
    <div class="sb-item" onclick="window.location='/'" style="cursor:pointer"><span>📈</span> Dashboard</div>
    <div class="sb-item" onclick="window.location='/'" style="cursor:pointer"><span>🏗</span> Saúde do PEP</div>
    <div class="sb-nav-sec">Materiais</div>
    <div class="sb-item" onclick="window.location='/'" style="cursor:pointer"><span>📦</span> Materiais</div>
    <div class="sb-nav-sec">Fiscalização</div>
    <div class="sb-item" onclick="window.location='/'" style="cursor:pointer"><span>⏱</span> Improdutividade</div>
    <div class="sb-nav-sec">Frota</div>
    <div class="sb-item active"><span>🚗</span> Velocidade <span class="sb-badge">!</span></div>
  </div>
  <div class="sb-footer"><strong>Salobo Projetos</strong>Vale Base Metals · 2026</div>
</div>
<div class="main">
  <div class="topbar">
    <div>
      <div class="topbar-title">Relatório de Velocidade 2026</div>
      <div class="topbar-sub">Salobo Projetos · Plano de Trânsito BMSA Rev.11 · Matriz de Consequências integrada</div>
    </div>
    <div style="display:flex;gap:8px;align-items:center">
      <div id="import-status" style="display:none;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--acc2);background:rgba(0,156,222,.08);border:1px solid var(--acc);border-radius:5px;padding:5px 12px"></div>
      <button onclick="document.getElementById('vel-file-input').click()" style="display:inline-flex;align-items:center;gap:5px;padding:6px 13px;border:1px solid var(--bord);cursor:pointer;font-family:Inter,sans-serif;font-size:11px;font-weight:600;border-radius:5px;background:#fff;color:var(--text)">📥 Importar Planilha</button>
      <button onclick="window.print()" style="display:inline-flex;align-items:center;gap:5px;padding:6px 13px;border:none;cursor:pointer;font-family:Inter,sans-serif;font-size:11px;font-weight:600;border-radius:5px;background:var(--sb);color:#fff">🖨 Imprimir</button>
      <input type="file" id="vel-file-input" accept=".xlsx" style="display:none" onchange="handleImport(this.files[0]);this.value=''">
    </div>
  </div>
  <div class="statusbar">
    <div class="s-live"><span class="dot-live"></span>Período ativo</div>
    <div class="s-sep"></div>
    <div class="s-item">Eventos: <strong id="sb-ev">—</strong></div>
    <div class="s-sep"></div>
    <div class="s-item">Motoristas: <strong id="sb-drv">—</strong></div>
    <div class="s-sep"></div>
    <div class="s-item">Tempo excesso: <strong id="sb-dur">—</strong></div>
    <div class="s-sep"></div>
    <div class="s-item">Vel. máx.: <strong id="sb-vel" style="color:var(--danger)">—</strong></div>
    <div style="margin-left:auto;font-size:10px;font-weight:700;color:var(--acc3)">▼ −92% Jan→Jun 2026</div>
  </div>
  <div class="content">

    <!-- FILTROS -->
    <div class="filters">
      <div class="fg"><label>Ano</label><select id="f-ano" onchange="applyFilters()"><option value="">Todos</option><option value="2026" selected>2026</option></select></div>
      <div class="fg"><label>Mês</label><div class="ms-wrap" id="ms-mes"></div></div>
      <div class="fg"><label>Dia</label><div class="ms-wrap" id="ms-dia"></div></div>
      <div class="fg"><label>Área</label><div class="ms-wrap" id="ms-area"></div></div>
      <div class="fg"><label>Motorista</label><div class="ms-wrap" id="ms-motorista"></div></div>
      <button onclick="resetFilters()" style="margin-left:auto;padding:5px 12px;border:1px solid var(--bord);border-radius:4px;background:var(--bg);color:var(--muted);font-family:Inter,sans-serif;font-size:11px;font-weight:600;cursor:pointer;align-self:flex-end">✕ Limpar tudo</button>
    </div>
    <div class="filter-chips" id="filter-chips"></div>

    <!-- ALERTA -->
    <div class="alert-crit" onclick="toggleAlertDetail()" title="Clique para ver detalhes por dia">
      <div style="font-size:32px;flex-shrink:0">🚨</div>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:800;color:var(--danger)">122 km/h — Velocidade máxima registrada no período (Jan–Jun 2026)</div>
        <div style="font-size:11px;color:var(--muted);margin-top:3px">
          RANULFO SOARES DE CARVALHO · Placa TXB0I77
        </div>
        <div style="display:flex;gap:16px;margin-top:6px;flex-wrap:wrap">
          <span style="font-size:11px;background:#fee2e2;color:#b91c1c;padding:2px 10px;border-radius:20px;font-weight:700">
            +205% acima do limite — zona de 40 km/h
          </span>
          <span style="font-size:11px;color:var(--muted)">Ocorrido em 16/02/2026 · 9 seg em excesso · 23 dias com ocorrências no total</span>
        </div>
        <div id="alert-detail" class="alert-expand">
          <div style="font-size:10px;font-weight:700;color:var(--danger);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px">Histórico completo — RANULFO SOARES DE CARVALHO</div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead><tr>
              <th style="padding:5px 10px;text-align:left;background:#fff5f5;border-bottom:2px solid #fecaca;color:#b91c1c;font-size:9px;text-transform:uppercase;letter-spacing:1px">Data</th>
              <th style="padding:5px 10px;text-align:left;background:#fff5f5;border-bottom:2px solid #fecaca;color:#b91c1c;font-size:9px;text-transform:uppercase;letter-spacing:1px">Eventos no dia</th>
              <th style="padding:5px 10px;text-align:left;background:#fff5f5;border-bottom:2px solid #fecaca;color:#b91c1c;font-size:9px;text-transform:uppercase;letter-spacing:1px">Vel. Máxima</th>
              <th style="padding:5px 10px;text-align:left;background:#fff5f5;border-bottom:2px solid #fecaca;color:#b91c1c;font-size:9px;text-transform:uppercase;letter-spacing:1px">Limite da via</th>
              <th style="padding:5px 10px;text-align:left;background:#fff5f5;border-bottom:2px solid #fecaca;color:#b91c1c;font-size:9px;text-transform:uppercase;letter-spacing:1px">Excesso</th>
              <th style="padding:5px 10px;text-align:left;background:#fff5f5;border-bottom:2px solid #fecaca;color:#b91c1c;font-size:9px;text-transform:uppercase;letter-spacing:1px">Severidade</th>
              <th style="padding:5px 10px;text-align:left;background:#fff5f5;border-bottom:2px solid #fecaca;color:#b91c1c;font-size:9px;text-transform:uppercase;letter-spacing:1px">Tempo</th>
            </tr></thead>
            <tbody id="ranulfo-tbody"></tbody>
          </table>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:6px">
        <div class="pill pill-red" style="font-size:12px">Gravíssima</div>
        <div style="font-size:10px;color:var(--danger);font-weight:700">→ Comitê pela Vida</div>
        <div style="font-size:10px;color:var(--muted);margin-top:4px" id="alert-toggle-hint">▼ ver detalhes</div>
      </div>
    </div>

    <!-- KPIs -->
    <div class="kpi-row">
      <div class="kpi red"><div class="kpi-lbl">Total Eventos</div><div class="kpi-val" id="k-ev">—</div><div class="kpi-sub" id="k-ev-sub">no período selecionado</div></div>
      <div class="kpi orange"><div class="kpi-lbl">Motoristas</div><div class="kpi-val" id="k-drv">—</div><div class="kpi-sub">com ao menos 1 desvio</div></div>
      <div class="kpi purple"><div class="kpi-lbl">Tempo em Excesso</div><div class="kpi-val" id="k-dur">—</div><div class="kpi-sub">horas acumuladas em violação</div></div>
      <div class="kpi blue"><div class="kpi-lbl">Custo Extra Est.</div><div class="kpi-val" id="k-custo">—</div><div class="kpi-sub">combustível desperdiçado (R$ 7,11/L)</div></div>
      <div class="kpi" style="border-top:3px solid var(--danger)"><div class="kpi-lbl" style="color:var(--danger)">Comitê pela Vida</div><div class="kpi-val" id="k-comite" style="color:var(--danger)">—</div><div class="kpi-sub">motoristas com ação máxima</div></div>
    </div>

    <!-- TENDÊNCIA + SEVERIDADE -->
    <div class="g-60-40">
      <div class="cc">
        <div class="cc-hdr">
          <div class="cc-title">Volume de eventos por mês</div>
          <div style="display:flex;align-items:center;gap:8px">
            <span style="font-size:10px;color:var(--muted)">clique nas barras para filtrar</span>
            <div class="cc-badge" style="color:var(--acc3);background:#dcfce7">▼ −92% Jan→Jun</div>
          </div>
        </div>
        <div id="trend-bars"></div>
      </div>
      <div class="cc">
        <div class="cc-hdr">
          <div class="cc-title">Distribuição por severidade</div>
          <div style="font-size:10px;color:var(--muted)">clique no gráfico para filtrar</div>
        </div>
        <div class="chart-h220"><canvas id="chartSev" style="cursor:pointer"></canvas></div>
      </div>
    </div>

    <!-- MATRIZ -->
    <div class="sec">Matriz de Consequências — Plano de Trânsito BMSA Rev.11</div>
    <div class="cc">
      <div class="cc-hdr">
        <div>
          <div class="cc-title">Ação recomendada por motorista</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">Período: <span id="mat-period" style="font-weight:600;color:var(--text)">—</span></div>
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span class="pill cons-conversa" style="font-size:9px">Conversa</span>
          <span class="pill cons-advert" style="font-size:9px">Advertência</span>
          <span class="pill cons-recicla" style="font-size:9px">Reciclagem</span>
          <span class="pill cons-rest3" style="font-size:9px">Rest. 3d</span>
          <span class="pill cons-rest5" style="font-size:9px">Rest. 5d</span>
          <span class="pill cons-comite" style="font-size:9px">Comitê</span>
          <span class="cc-badge" id="mat-count">—</span>
        </div>
      </div>
      <div class="tbl-wrap">
        <table>
          <thead><tr>
            <th>#</th><th>Motorista</th><th>Total Eventos</th>
            <th style="color:#15803d">Baixa<br><span style="font-size:8px;font-weight:400;color:var(--muted)">1–10%</span></th>
            <th style="color:#a16207">Média<br><span style="font-size:8px;font-weight:400;color:var(--muted)">11–20%</span></th>
            <th style="color:#c2410c">Grave<br><span style="font-size:8px;font-weight:400;color:var(--muted)">21–30%</span></th>
            <th style="color:#b91c1c">Gravíssima<br><span style="font-size:8px;font-weight:400;color:var(--muted)">&gt;30%</span></th>
            <th>Tempo Total</th>
            <th>Pior Severidade</th>
            <th>Consequência Indicada (BMSA Rev.11)</th>
          </tr></thead>
          <tbody id="mat-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- TOP 10 + EVOLUÇÃO -->
    <div class="sec">Ranking e Evolução Mensal</div>
    <div class="g-60-40">
      <div class="cc">
        <div class="cc-hdr"><div class="cc-title">Top 10 — maior número de desvios</div><div class="cc-badge" id="top10-badge">período selecionado</div></div>
        <div class="tbl-wrap">
          <table>
            <thead><tr><th>#</th><th>Motorista</th><th>Eventos</th><th>Proporção</th><th>Tempo</th><th>Vel. Máx.</th></tr></thead>
            <tbody id="top10-tbody"></tbody>
          </table>
        </div>
      </div>
      <div class="cc">
        <div class="cc-hdr">
          <div class="cc-title">Evolução mensal — Top 5 motoristas</div>
          <div style="font-size:10px;color:var(--muted)">clique legenda/ponto para filtrar</div>
        </div>
        <div class="chart-h220"><canvas id="chartEv" style="cursor:pointer"></canvas></div>
      </div>
    </div>

    <!-- COMITÊ DRILL-DOWN -->
    <div class="sec">🔴 Comitê pela Vida — Detalhamento por Mês e Dia</div>
    <div class="cc">
      <div class="cc-hdr">
        <div>
          <div class="cc-title">Motoristas que atingiram o nível máximo de consequência</div>
          <div style="font-size:10px;color:var(--muted);margin-top:2px">Período: <span id="comite-period" style="font-weight:600;color:var(--text)">—</span> · <span id="comite-count" style="color:var(--danger);font-weight:700">—</span></div>
        </div>
        <div style="font-size:10px;color:var(--muted)">clique em uma linha para ver os dias detalhados</div>
      </div>
      <div class="tbl-wrap" style="max-height:420px">
        <table>
          <thead><tr>
            <th>#</th><th>Motorista</th><th>Total Eventos</th>
            <th>Jan</th><th>Fev</th><th>Mar</th><th>Abr</th><th>Mai</th><th>Jun</th>
            <th>Pior Dia</th><th></th>
          </tr></thead>
          <tbody id="comite-tbody"></tbody>
        </table>
      </div>
    </div>

    <!-- REINCIDENTES + MELHORA/PIORA -->
    <div class="g2">
      <div class="cc">
        <div class="cc-hdr"><div class="cc-title">⚠️ Reincidentes Persistentes</div><div class="cc-badge" style="color:var(--danger);background:#fee2e2">ativos desde Jan · clique para filtrar</div></div>
        <div id="reincidentes"></div>
      </div>
      <div class="cc">
        <div class="cc-hdr"><div class="cc-title">Comparativo Jan vs. Mai+Jun</div></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--acc3);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">✅ Melhoraram</div>
            <div id="melhoraram"></div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--danger);text-transform:uppercase;letter-spacing:1px;margin-bottom:6px">⚠️ Pioraram</div>
            <div id="pioraram"></div>
          </div>
        </div>
      </div>
    </div>

    <div style="text-align:center;padding:14px 0 6px;font-size:10px;color:var(--muted);border-top:1px solid var(--bord)">
      Gerência de Projetos — Salobo Projetos · Plano de Trânsito BMSA Rev.11 – 25/07/2025 · Gerado em 18/06/2026
    </div>
  </div>
</div>
<script>${js}<\/script>
</body></html>`;

fs.writeFileSync('velocidade.html', html, 'utf8');
const sz = fs.statSync('velocidade.html').size;
console.log('OK: ' + Math.round(sz/1024) + 'KB');
