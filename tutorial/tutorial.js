// Tutorial do dashboard: janela passo a passo com prints reais das telas e destaque
// no ponto explicado (mesmo modelo do tutorial do HHmetria, nas cores do dashboard).
// Uso:  Tutorial.auto(passos)  abre sozinho na 1ª visita de cada usuário
//       Tutorial.open(passos)  abre sob demanda (botão "Tutorial" do topo)
// Passo: {img:'t01.jpg', spot:{x,y,w,h} em % da imagem, tag, titulo, texto, view}
// As imagens têm dados reais, então NÃO ficam na pasta pública: vêm de
// /api/tutorial-img/<arquivo>, que exige login, e são exibidas como blob.
// Textos e destaques: tutorial/tutorial-data.js (gerado na captura das telas).
(function(){
  var css=''+
  '.tut-ov{position:fixed;inset:0;z-index:10000;background:rgba(0,21,41,.72);display:flex;align-items:center;justify-content:center;padding:18px;opacity:0;transition:opacity .25s}'+
  '.tut-ov.on{opacity:1}'+
  '.tut{background:#fff;border-radius:12px;width:min(1080px,100%,calc((100vh - 300px) * 1.756));min-width:min(560px,100%);max-height:100%;overflow:auto;box-shadow:0 30px 80px rgba(0,0,0,.45);display:flex;flex-direction:column;transform:translateY(14px) scale(.98);transition:transform .3s;font-family:Inter,system-ui,sans-serif}'+
  '.tut-ov.on .tut{transform:none}'+
  '.tut-h{background:#001529;color:#e8eef5;padding:14px 20px 12px;position:relative;display:flex;align-items:center;gap:14px}'+
  '.tut-h::after{content:"";position:absolute;left:0;right:0;bottom:0;height:3px;background:linear-gradient(90deg,#0f6fb8 0 62%,#10b981 62% 90%,#d4900a 90% 100%)}'+
  '.tut-h .tt{flex:1;min-width:0}'+
  '.tut-h .ey{font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:#7cc4f5;font-weight:700}'+
  '.tut-h .ti{font-size:19px;font-weight:800;margin-top:3px}'+
  '.tut-h .x{background:none;border:1px solid #2a4a66;color:#a9bccd;border-radius:6px;padding:6px 11px;font-size:11px;font-weight:700;cursor:pointer;font-family:inherit}'+
  '.tut-h .x:hover{color:#fff;border-color:#7cc4f5}'+
  '.tut-st{position:relative;background:#0b1e33;overflow:hidden;aspect-ratio:1440/820;flex-shrink:0}'+
  '.tut-st img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;object-position:top left;opacity:0;transition:opacity .35s}'+
  '.tut-st img.on{opacity:1}'+
  '.tut-ld{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#a9bccd;font-size:13px}'+
  '.tut-sp{position:absolute;border:3px solid #d4900a;border-radius:8px;box-shadow:0 0 0 9999px rgba(0,21,41,.42);transition:all .45s cubic-bezier(.4,.1,.2,1);pointer-events:none}'+
  '.tut-sp::after{content:"";position:absolute;inset:-9px;border:2px solid rgba(212,144,10,.7);border-radius:12px;animation:tutp 1.6s ease-out infinite}'+
  '@keyframes tutp{0%{opacity:1;transform:scale(.97)}100%{opacity:0;transform:scale(1.06)}}'+
  '.tut-sp.none{box-shadow:none;border-color:transparent}.tut-sp.none::after{display:none}'+
  '.tut-num{position:absolute;left:14px;top:12px;background:#0f6fb8;color:#fff;font-size:12px;font-weight:800;padding:4px 9px;border-radius:5px;z-index:2}'+
  '.tut-b{padding:16px 22px 18px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:end}'+
  '.tut-b .tut-tag{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#0f6fb8;font-weight:800}'+
  '.tut-b h3{font-size:21px;font-weight:800;color:#101418;margin:5px 0 0}'+
  '.tut-b p{font-size:13.5px;line-height:1.55;color:#33414b;margin:7px 0 0;max-width:660px}'+
  '.tut-b p b{color:#101418}'+
  '.tut-b>div:first-child{min-height:110px}'+
  '.tut-nav{display:flex;flex-direction:column;align-items:flex-end;gap:12px}'+
  '.tut-dots{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end;max-width:300px}'+
  '.tut-dots button{width:9px;height:9px;border-radius:50%;border:0;background:#cfd8e2;padding:0;cursor:pointer;transition:all .2s}'+
  '.tut-dots button.on{background:#0f6fb8;width:22px;border-radius:5px}'+
  '.tut-arr{display:flex;gap:8px}'+
  '.tut-arr button,.tut-end button{display:inline-flex;align-items:center;gap:6px;border-radius:7px;padding:10px 16px;font-size:12px;font-weight:700;cursor:pointer;border:1px solid #dde3ea;background:#fff;color:#33414b;font-family:inherit}'+
  '.tut-arr button:disabled{opacity:.35;cursor:default}'+
  '.tut-arr .nx,.tut-end .cop{background:#0f6fb8;border-color:#0f6fb8;color:#fff}'+
  '.tut-arr .nx:hover{background:#0a4d80}'+
  '.tut-end{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}'+
  '.tut-f{border-top:1px solid #dde3ea;padding:10px 22px 12px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;font-size:12px;color:#5b6b7c}'+
  '.tut-f label{display:inline-flex;align-items:center;gap:7px;cursor:pointer}'+
  '.tut-f input{accent-color:#0f6fb8;width:15px;height:15px}'+
  '.tut-f kbd{font-family:monospace;font-size:10px;border:1px solid #cfd8e2;border-bottom-width:2px;border-radius:4px;padding:0 5px;background:#fff}'+
  '@media (max-width:760px){.tut-b{grid-template-columns:1fr}.tut-nav{align-items:stretch}.tut-dots{justify-content:center;max-width:none}.tut-arr button{flex:1;justify-content:center}.tut-f .kb{display:none}}'+
  '@media (prefers-reduced-motion:reduce){.tut-ov,.tut,.tut-st img,.tut-sp{transition:none}.tut-sp::after{animation:none}}';
  var st=document.createElement('style'); st.textContent=css; document.head.appendChild(st);
  var esc=function(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); };
  var KEY='dash.tutorial.geral.v1';
  function visto(){ try{ return localStorage.getItem(KEY)==='1'; }catch(e){ return false; } }
  function marcar(v){ try{ if(v) localStorage.setItem(KEY,'1'); else localStorage.removeItem(KEY); }catch(e){} }

  // Imagens protegidas: busca com o token da sessão e guarda o blob (cache da página).
  var cache={};
  async function token(){
    try{ var s=await supa.auth.getSession(); return s.data&&s.data.session?s.data.session.access_token:null; }catch(e){ return null; }
  }
  function carregar(arq){
    if(!cache[arq]) cache[arq]=(async function(){
      var tk=await token(); if(!tk) throw new Error('sem sessão');
      var r=await fetch('/api/tutorial-img/'+encodeURIComponent(arq),{headers:{'Authorization':'Bearer '+tk}});
      if(!r.ok) throw new Error('HTTP '+r.status);
      return URL.createObjectURL(await r.blob());
    })().catch(function(e){ delete cache[arq]; throw e; });
    return cache[arq];
  }

  function open(passos,opts){
    opts=opts||{}; if(!passos||!passos.length) return;
    var i=0, antes=document.activeElement;
    var ov=document.createElement('div'); ov.className='tut-ov';
    ov.innerHTML='<div class="tut" role="dialog" aria-modal="true" aria-labelledby="tutT">'+
      '<div class="tut-h"><div class="tt"><div class="ey">'+esc(opts.eyebrow||'Tutorial')+'</div><div class="ti">'+esc(opts.titulo||'Como usar o dashboard')+'</div></div><button class="x" data-x>Pular tutorial</button></div>'+
      '<div class="tut-st"><div class="tut-ld">Carregando imagem…</div><span class="tut-num"></span>'+passos.map(function(){ return '<img alt="">'; }).join('')+'<div class="tut-sp"></div></div>'+
      '<div class="tut-b"><div><div class="tut-tag"></div><h3 id="tutT"></h3><p></p><div class="tut-end" hidden></div></div>'+
      '<div class="tut-nav"><div class="tut-dots">'+passos.map(function(_,j){ return '<button aria-label="Ir para o passo '+(j+1)+'" data-d="'+j+'"></button>'; }).join('')+'</div>'+
      '<div class="tut-arr"><button data-p>‹ Anterior</button><button class="nx" data-n>Próximo ›</button></div></div></div>'+
      '<div class="tut-f"><label><input type="checkbox" data-nao'+(visto()?' checked':'')+'> Não mostrar de novo ao entrar</label><span class="kb">Use <kbd>←</kbd> <kbd>→</kbd> para navegar, <kbd>Esc</kbd> fecha</span></div></div>';
    document.body.appendChild(ov);
    var $=function(s){ return ov.querySelector(s); }, imgs=ov.querySelectorAll('.tut-st img'), sp=$('.tut-sp'), ld=$('.tut-ld');
    function poe(j){
      if(j<0||j>=passos.length||imgs[j].src) return Promise.resolve();
      return carregar(passos[j].img).then(function(u){ imgs[j].src=u; });
    }
    function vai(n){
      i=Math.max(0,Math.min(passos.length-1,n)); var p=passos[i], alvo=i;
      ld.textContent='Carregando imagem…'; ld.style.display=imgs[i].src?'none':'flex';
      poe(i).then(function(){ if(alvo===i) ld.style.display='none'; }).catch(function(){ if(alvo===i) ld.textContent='Não foi possível carregar a imagem. Confira se você está logado.'; });
      poe(i+1).catch(function(){});
      imgs.forEach(function(im,j){ im.classList.toggle('on',j===i); });
      if(p.spot){ sp.classList.remove('none'); sp.style.left=p.spot.x+'%'; sp.style.top=p.spot.y+'%'; sp.style.width=p.spot.w+'%'; sp.style.height=p.spot.h+'%'; }
      else sp.classList.add('none');
      $('.tut-num').textContent=String(i+1).padStart(2,'0')+' / '+String(passos.length).padStart(2,'0');
      $('.tut-tag').textContent=p.tag||''; $('h3').textContent=p.titulo; $('.tut-b p').innerHTML=p.texto;
      ov.querySelectorAll('.tut-dots button').forEach(function(b,j){ b.classList.toggle('on',j===i); });
      $('[data-p]').disabled=i===0;
      var ult=i===passos.length-1;
      $('[data-n]').textContent=ult?'Concluir':'Próximo ›';
      var end=$('.tut-end'); end.hidden=!(p.view&&typeof setView==='function');
      if(!end.hidden) end.innerHTML='<button data-ir>Abrir esta tela</button>';
    }
    function fecha(completo){
      // concluiu ou marcou "não mostrar": não abre sozinho de novo; fechou no meio: volta na próxima visita
      marcar($('[data-nao]').checked||completo===true||opts.marcarAoFechar!==false);
      ov.classList.remove('on'); document.removeEventListener('keydown',tecla);
      setTimeout(function(){ ov.remove(); if(antes&&antes.focus) antes.focus(); },250);
    }
    function tecla(e){
      if(e.key==='Escape'){ e.preventDefault(); fecha(); }
      else if(e.key==='ArrowRight'){ e.preventDefault(); if(i<passos.length-1) vai(i+1); }
      else if(e.key==='ArrowLeft'){ e.preventDefault(); vai(i-1); }
    }
    ov.addEventListener('click',function(e){
      if(e.target===ov||e.target.closest('[data-x]')){ fecha(); return; }
      if(e.target.closest('[data-p]')){ vai(i-1); return; }
      if(e.target.closest('[data-n]')){ if(i===passos.length-1) fecha(true); else vai(i+1); return; }
      if(e.target.closest('[data-ir]')){ var v=passos[i].view; fecha(); setTimeout(function(){ try{ setView(v); }catch(er){} },280); return; }
      var d=e.target.closest('[data-d]'); if(d) vai(+d.dataset.d);
    });
    var x0=null; $('.tut-st').addEventListener('touchstart',function(e){ x0=e.touches[0].clientX; },{passive:true});
    $('.tut-st').addEventListener('touchend',function(e){ if(x0==null) return; var dx=e.changedTouches[0].clientX-x0; if(Math.abs(dx)>40) vai(i+(dx<0?1:-1)); x0=null; });
    document.addEventListener('keydown',tecla);
    vai(0); requestAnimationFrame(function(){ ov.classList.add('on'); $('[data-n]').focus(); });
  }
  window.Tutorial={
    open:open,
    auto:function(passos,opts){ if(!visto()) setTimeout(function(){ open(passos,Object.assign({marcarAoFechar:false},opts||{})); },900); },
    reset:function(){ marcar(false); }
  };
})();
