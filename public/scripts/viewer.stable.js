// Minimal, stable viewer: MP4/WebM only, background + screens, SSE updates
(function(){
  const $ = s => document.querySelector(s);
  const bust = (u,v)=>{ try{ const x=new URL(u,location.origin); x.searchParams.set('v',String(v||Date.now())); return x.pathname+x.search; }catch{ return u+(u.includes('?')?'&':'?')+'v='+(v||Date.now()); } };

  let STATE = null;
  let playIdx = 0;
  let keepPlay = null;
  let clockTimer = null;
  let newsTimer = null;
  let tipsTimer = null;
  let timeTimer = null;

  function setScreen(n){
    const s1 = $('.screen-1');
    const s2 = $('.screen-2');
    const app = $('#app');
    if (!s1 || !s2 || !app) return;
    if (n===1){ s1.hidden=false; s2.hidden=true; }
    else { s1.hidden=true; s2.hidden=false; }
    app.dataset.screen = String(n);
  }
  window.setScreen = setScreen;

  function setTicker(text){
    const t1 = $('#ticker1'); if (t1) t1.textContent = text || '';
    const t2 = $('#ticker'); if (t2) t2.textContent = (`  ${text}   •   ` + text + '   •   ' + text + '   •   ');
  }

  function setBackground(bg){
    const el = $('#bg'); if (!el) return; el.innerHTML='';
    if (!bg || bg.enabled===false || !bg.url) return;
    if (bg.type==='image'){ const img=new Image(); img.src=bust(bg.url,STATE?.updatedAt); el.appendChild(img); }
    else if (bg.type==='video'){ const v=document.createElement('video'); v.src=bust(bg.url,STATE?.updatedAt); v.autoplay=true; v.loop=true; v.muted=true; v.playsInline=true; el.appendChild(v); }
  }

  function sizeFrame(frame){
    const player = $('#player'); if (!player) return;
    const rect = player.getBoundingClientRect();
    const pad = 0; // player already inset via CSS
    const maxW = rect.width - pad*2;
    const maxH = rect.height - pad*2;
    const targetAR = 16/9;
    let w = maxW, h = w/targetAR;
    if (h > maxH){ h = maxH; w = h*targetAR; }
    frame.style.width = Math.floor(w) + 'px';
    frame.style.height = Math.floor(h) + 'px';
    frame.style.margin = '0 auto';
  }

  function playNext(){
    const root = $('#player'); if (!root) return; root.innerHTML='';
    const frame = document.createElement('div'); frame.className='frame'; frame.style.background='#000'; frame.style.borderRadius='12px'; frame.style.boxShadow='0 10px 40px rgba(0,0,0,.6)'; frame.style.display='flex'; frame.style.alignItems='center'; frame.style.justifyContent='center'; root.appendChild(frame);
    sizeFrame(frame);
    const list = (STATE?.playlist||[]).filter(it=> it && (it.type==='mp4' || /\.(mp4|webm)(\?.*)?$/i.test(it.url||'')) );
    if (!list.length) return;
    playIdx = (playIdx % list.length);
    const it = list[playIdx];
    const v = document.createElement('video'); v.autoplay=true; v.muted=true; v.playsInline=true; v.controls=false; v.style.width='100%'; v.style.height='100%'; v.style.objectFit='contain';
    v.src = bust(it.url||'', STATE?.updatedAt);
    frame.appendChild(v);
    v.addEventListener('ended', ()=>{ playIdx=(playIdx+1)%list.length; playNext(); });
    clearInterval(keepPlay); keepPlay = setInterval(()=>{ try{ v.play().catch(()=>{});}catch{} },2000);
    window.addEventListener('resize', ()=> sizeFrame(frame), { once:true });
  }

  function renderClocks(){
    const root = $('#clocks'); if (!root) return; root.innerHTML='';
    const tzs = (STATE?.settings?.clocks)||[];
    const now = new Date();
    tzs.forEach(({tz})=>{
      const d=document.createElement('div'); d.className='clock';
      const tStr = new Intl.DateTimeFormat('en-GB',{ hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false, timeZone:tz }).format(now);
      const [hh,mm,ss] = tStr.split(':');
      const zone = (new Intl.DateTimeFormat('en-US',{ timeZone: tz, timeZoneName: 'short' }).formatToParts(now).find(p=>p.type==='timeZoneName')?.value)||tz;
      d.innerHTML = `
        <div class="value">
          <span class="hours">${hh}</span><span class="sep">:</span><span class="mins">${mm}</span><span class="sec">:${ss}</span>
        </div>
        <div class="meta"><span class="zone">${zone}</span></div>
      `;
      root.appendChild(d);
    });
  }

  function renderTopbar(){
    const lang = STATE?.settings?.lang || undefined;
    const dateEl = $('#date'); const timeEl = $('#time');
    const now = new Date();
    if (dateEl) dateEl.textContent = now.toLocaleDateString(lang, { weekday:'long', year:'numeric', month:'long', day:'numeric' });
    if (timeEl) timeEl.textContent = now.toLocaleTimeString(lang, { hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }

  function renderNewsHero(){
    const root = $('#newsHero'); if (!root) return; root.innerHTML='';
    const items = STATE?.news || [];
    if (!items.length) return;
    let idx = 0;
    function show(i){
      const it = items[i];
      root.innerHTML = `<div class="title">${it.title||''}</div><div class="desc">${it.description||''}</div>`;
    }
    show(idx);
    clearInterval(newsTimer);
    newsTimer = setInterval(()=>{ idx = (idx+1)%items.length; show(idx); }, 6000);
  }

  function renderPills(){
    const root = $('#pills'); if (!root) return; root.innerHTML='';
    const list = STATE?.announcements || [];
    if (!list.length) return;
    const track = document.createElement('div'); track.className='track';
    function group(){
      const g = document.createElement('div'); g.style.display='inline-flex'; g.style.gap='12px';
      list.forEach(a=>{
        const el = document.createElement('div'); el.className='pill';
        el.innerHTML = `<span class="dot"></span><span class="label">${a.label||''}:</span><span class="text">${a.text||''}</span>`;
        g.appendChild(el);
      });
      return g;
    }
    track.appendChild(group());
    track.appendChild(group());
    root.appendChild(track);
  }

  function renderTips(){
    const root = $('#tips'); if (!root) return; root.innerHTML='';
    const items = STATE?.tips || [];
    if (!items.length) return;
    const box = document.createElement('div'); box.className='tip'; root.appendChild(box);
    let idx = 0; box.textContent = items[idx];
    clearInterval(tipsTimer);
    tipsTimer = setInterval(()=>{ idx = (idx+1)%items.length; box.textContent = items[idx]; }, 6000);
  }

  const weatherCache = new Map();
  async function fetchCityWeather(name, lang){
    try{
      const geo = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=${encodeURIComponent(lang||'en')}&format=json`).then(r=>r.json());
      const p = geo?.results?.[0]; if(!p) return null;
      const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${p.latitude}&longitude=${p.longitude}&current_weather=true&timezone=auto`).then(r=>r.json());
      const cw = w?.current_weather; if(!cw) return null;
      return { name, temp: Math.round(cw.temperature), cond: cw.weathercode }; 
    }catch{ return null; }
  }
  function codeToCond(code){
    const map = { 0:'Clear',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Fog',51:'Drizzle',53:'Drizzle',55:'Drizzle',61:'Rain',63:'Rain',65:'Rain',71:'Snow',73:'Snow',75:'Snow',95:'Thunderstorm' };
    return map[code]||'';
  }
  async function renderWeather(){
    const root = $('#weather'); if (!root) return; root.innerHTML='';
    const lang = STATE?.settings?.lang || 'en';
    const cities = STATE?.weather?.cities || [];
    if (!cities.length) return;
    for (const c of cities){
      const row = document.createElement('div'); row.className='city'; row.innerHTML = `<div class="name">${c}</div><div class="temp">--°</div><div class="cond"></div>`; root.appendChild(row);
      const key = `${c}|${lang}`;
      let data = weatherCache.get(key);
      if (!data){ data = await fetchCityWeather(c, lang); if (data) weatherCache.set(key, data); }
      if (data){ row.querySelector('.temp').textContent = `${data.temp}°`; row.querySelector('.cond').textContent = codeToCond(data.cond); }
    }
  }

  function mountClouds(){
    const s1 = document.querySelector('.screen-1');
    if (!s1) return;
    if (!s1.querySelector('.clouds')){
      const c = document.createElement('div'); c.className='clouds';
      const l1=document.createElement('div'); l1.className='clouds-1';
      const l2=document.createElement('div'); l2.className='clouds-2';
      const l3=document.createElement('div'); l3.className='clouds-3';
      c.appendChild(l1); c.appendChild(l2); c.appendChild(l3);
      s1.prepend(c);
    }
  }

  function applyBasics(){
    // logo
    const logo = $('#logo'); if (logo) logo.src = STATE?.settings?.logoUrl || '';
    // sponsor line + bluebar
    setTicker(STATE?.settings?.sponsorTicker||'');
    const bb=$('#bluebar'); if (bb) bb.textContent = STATE?.settings?.bluebarText || 'News repost >> (panorama)';
    // background
    setBackground(STATE?.background||null);
    // clouds
    mountClouds();
    // clocks + topbar
    renderClocks(); clearInterval(clockTimer); clockTimer = setInterval(renderClocks, 1000);
    renderTopbar(); clearInterval(timeTimer); timeTimer = setInterval(renderTopbar, 1000);
    // content blocks
    renderNewsHero();
    renderPills();
    renderTips();
    renderWeather();
  }

  async function loadState(){
    const res = await fetch('/api/state'); STATE = await res.json();
  }

  async function init(){
    try{ await loadState(); }catch{ return; }
    applyBasics();
    if ((STATE?.playlist||[]).length) setScreen(2); else setScreen(1);
    playNext();
  }

  // SSE updates
  function connectSSE(){
    try{
      const ev = new EventSource('/api/stream');
      ev.onmessage = async ()=>{ try{ await loadState(); applyBasics(); playNext(); }catch{} };
    }catch{}
  }

  // key bindings
  window.addEventListener('keydown',e=>{ if(e.key==='1') setScreen(1); if(e.key==='2') setScreen(2); if(e.code==='Space') setScreen(($('#app')?.dataset.screen==='1')?2:1); });

  window.addEventListener('resize', ()=>{ const f = document.querySelector('#player .frame'); if (f) sizeFrame(f); });
  init(); connectSSE();
})();
