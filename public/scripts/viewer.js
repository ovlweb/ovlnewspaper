import { i18n } from './i18n.js';
const $ = (s) => document.querySelector(s);
const fmt2 = (n) => n.toString().padStart(2,'0');
const bust = (url, v) => {
  try {
    const u = new URL(url, location.origin);
    u.searchParams.set('v', String(v||Date.now()));
    return u.pathname + u.search;
  } catch { return url + (url.includes('?')?'&':'?') + 'v=' + (v||Date.now()); }
};

let STATE = null;
let ytReady = false;
let ytPlayer = null;
let ytKeep = null;
let playerKeep = null;
let playerWatch = null;
let bgKeep = null;
let currentIndex = 0;
let newsIdx = 0;
let tipIdx = 0;

function setDateTime() {
  const now = new Date();
  const d = now.toLocaleDateString(undefined, { day:'2-digit', month:'short', year:'numeric'});
  const t = `${fmt2(now.getHours())}:${fmt2(now.getMinutes())}`;
  $('#date').textContent = d;
  $('#time').textContent = t;
}
setInterval(setDateTime, 1000);
setDateTime();

// Clocks (analog SVG per timezone)
function clockSVG(date, label){
  const hh = date.getHours()%12; const mm = date.getMinutes(); const ss = date.getSeconds();
  const hAng = (hh + mm/60) * 30; const mAng = (mm + ss/60) * 6; const sAng = ss * 6;
  return `
  <svg viewBox="0 0 100 110" width="100%" preserveAspectRatio="xMidYMid meet">
    <defs>
      <filter id="shadow"><feDropShadow dx="0" dy="1" stdDeviation="0.6" flood-color="#000" flood-opacity="0.6"/></filter>
    </defs>
    <g transform="translate(10,0)">
      <rect x="0" y="0" width="80" height="80" rx="12" fill="#161a22" stroke="#232938" vector-effect="non-scaling-stroke" />
      <g transform="translate(40,40)">
        ${Array.from({length:60}).map((_,i)=>{
          const len = i%5===0?6:3; const w=i%5===0?2:1; const a=i*6; const r1=34; const r2=r1-len; const x1=r1*Math.sin(a*Math.PI/180); const y1=-r1*Math.cos(a*Math.PI/180); const x2=r2*Math.sin(a*Math.PI/180); const y2=-r2*Math.cos(a*Math.PI/180); return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#9aa0ab" stroke-width="${w}" vector-effect="non-scaling-stroke" />`;}).join('')}
        <line x1="0" y1="0" x2="${24*Math.sin(hAng*Math.PI/180)}" y2="${-24*Math.cos(hAng*Math.PI/180)}" stroke="#e8e8ea" stroke-width="3" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="0" x2="${32*Math.sin(mAng*Math.PI/180)}" y2="${-32*Math.cos(mAng*Math.PI/180)}" stroke="#e8e8ea" stroke-width="2" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        <line x1="0" y1="0" x2="${34*Math.sin(sAng*Math.PI/180)}" y2="${-34*Math.cos(sAng*Math.PI/180)}" stroke="#4cc2ff" stroke-width="1" vector-effect="non-scaling-stroke" />
        <circle cx="0" cy="0" r="2" fill="#e8e8ea" />
      </g>
      <text x="40" y="102" text-anchor="middle" font-size="9" fill="#bfc4cf">${label}</text>
    </g>
  </svg>`;
}

function renderClocks() {
  const root = $('#clocks');
  root.innerHTML = '';
  (STATE?.settings?.clocks || []).forEach(({label, tz})=>{
    const div = document.createElement('div');
    div.className='clock';
    const now = new Date(new Date().toLocaleString('en-US', { timeZone: tz }));
    div.innerHTML = clockSVG(now, label);
    root.appendChild(div);
  });
}
setInterval(renderClocks, 1000);

function setTicker(text){
  // screen 2 ticker (marquee)
  $('#ticker').textContent = `  ${text}   •   ` + text + '   •   ' + text + '   •   ';
  // screen 1 sponsors line
  $('#ticker1').textContent = text;
}

function attachVideoKeepAlive(video){
  try { video.muted = true; video.play().catch(()=>{}); } catch {}
  const resume = ()=>{ try { video.play().catch(()=>{}); } catch {} };
  ['waiting','stalled','suspend','pause','emptied','error','abort'].forEach(ev=>video.addEventListener(ev,resume));
  document.addEventListener('visibilitychange', resume);
  let last = 0; clearInterval(bgKeep); bgKeep = setInterval(()=>{
    const t = video.currentTime || 0;
    if (Math.abs(t - last) < 0.01 && !video.ended) resume();
    last = t;
  }, 2000);
}

function setBackground(bg){
  const el = $('#bg'); el.innerHTML = '';
  if (!bg || bg.enabled === false || bg.type==='none' || !bg.url) return;
  // Always use a single media element with cover to guarantee no side bars
  const makeImage = () => {
    const img = new Image(); img.className = 'main'; img.decoding = 'async'; img.src = bust(bg.url, STATE?.updatedAt); return img;
  };
  const makeVideo = () => {
    const v = document.createElement('video'); v.className = 'main'; v.autoplay=true; v.loop=true; v.muted=true; v.playsInline=true; v.setAttribute('playsinline','');
    if (/\.m3u8($|\?)/.test(bg.url) && window.Hls && Hls.isSupported()){
      const hls = new Hls(); hls.loadSource(bust(bg.url, STATE?.updatedAt)); hls.attachMedia(v);
      hls.on(Hls.Events.ERROR, function (evt, data) {
        if (data.fatal) {
          try { hls.recoverMediaError(); } catch { try{ hls.startLoad(); }catch{} }
        }
      });
    } else { v.src = bust(bg.url, STATE?.updatedAt); }
    attachVideoKeepAlive(v);
    return v;
  };
  const node = bg.type==='image' ? makeImage() : makeVideo();
  el.appendChild(node);
}

function setAd(ad){
  const el = $('#ad'); el.innerHTML='';
  if (!ad?.enabled || !ad.url) return;
  // apply opacity from state
  if (ad.opacity != null) {
    el.style.setProperty('--ad-opacity', String(ad.opacity));
  }
  const isImage = /\.(png|jpe?g|gif|webp|avif)($|\?)/i.test(ad.url);
  if (isImage) {
    const img = new Image(); img.src = ad.url; el.appendChild(img);
  } else {
    const v = document.createElement('video'); v.autoplay = true; v.loop = true; v.muted = true; v.playsInline = true;
    if (/\.m3u8($|\?)/.test(ad.url) && window.Hls && Hls.isSupported()) {
      const hls = new Hls(); hls.loadSource(ad.url); hls.attachMedia(v);
    } else {
      v.src = ad.url;
    }
    el.appendChild(v);
  }
}

function nextIndex() {
  if (!STATE?.playlist?.length) return 0;
  currentIndex = (currentIndex + 1) % STATE.playlist.length;
  return currentIndex;
}

function fitFrame16x9(frame, retries=6){
  const host = $('#player'); if(!host) return;
  const r = host.getBoundingClientRect();
  const availW = r.width, availH = r.height;
  if ((availW < 10 || availH < 10) && retries > 0){
    // likely hidden (other screen) or not laid out yet — retry shortly
    return setTimeout(()=>fitFrame16x9(frame, retries-1), 120);
  }
  const targetW = Math.min(availW || window.innerWidth*0.9, (availH || window.innerHeight*0.5) * (16/9));
  const targetH = targetW * (9/16);
  frame.style.width = Math.max(1, Math.floor(targetW)) + 'px';
  frame.style.height = Math.max(1, Math.floor(targetH)) + 'px';
}

function loadCurrentItem(){
  const root = $('#player'); root.innerHTML='';
  const container = document.createElement('div'); container.className = 'frame';
  let curItem = STATE.playlist[currentIndex];
  if (!curItem) return;

  if (curItem.type==='mp4'){
    const v = document.createElement('video');
    v.autoplay = true; v.controls = false; v.muted = true; v.playsInline = true;
    let url = curItem.url;
    const isM3u8 = /\.m3u8($|\?)/i.test(url);
    const canNativeHls = v.canPlayType('application/vnd.apple.mpegURL');
    let usingHlsJs = false;
    let hls = null;
    const attachHls = () => { usingHlsJs = true; hls = new Hls(); hls.loadSource(url); hls.attachMedia(v);
      hls.on(Hls.Events.ERROR, function (evt, data) {
        if (data.fatal) {
          try { hls.recoverMediaError(); } catch { try{ hls.startLoad(); }catch{} }
        }
      });
    };

    if (isM3u8) {
      if (canNativeHls) {
        // Safari/native HLS — simplest and smoothest locally
        v.src = url;
      } else if (window.Hls && Hls.isSupported()) {
        attachHls();
      } else {
        // Fallback to progressive MP4 if available (same path with .mp4)
        const mp4Url = url.replace(/\.m3u8(\?.*)?$/i, '.mp4$1');
        url = mp4Url; v.src = url;
      }
    } else {
      v.src = url; // MP4/WEBM
    }

    let retries = 0;
    const maxRetries = 2;
    function reloadSource(){
      retries++;
      if (retries>maxRetries){ nextIndex(); return loadCurrentItem(); }
      try {
        if (usingHlsJs && hls){ try{ hls.destroy(); }catch{}; url = bust(curItem.url, Date.now()); attachHls(); }
        else { url = bust(url, Date.now()); v.src = url; v.load(); }
      } catch {}
      try { v.play().catch(()=>{}); } catch {}
    }

    // Only aggressive reloads for progressive or hls.js; native HLS is stable
    if (!canNativeHls) {
      v.addEventListener('error', reloadSource);
      v.addEventListener('stalled', ()=> setTimeout(reloadSource, 2000));
      v.addEventListener('suspend', ()=> setTimeout(reloadSource, 2500));
    }
    v.addEventListener('ended', ()=>{ nextIndex(); loadCurrentItem(); });

    container.appendChild(v);
    root.appendChild(container);
    fitFrame16x9(container);
    v.muted = true; v.play().catch(()=>{});

    clearInterval(playerKeep); playerKeep = setInterval(()=>{ try { v.play().catch(()=>{}); } catch {} }, 2000);
    clearInterval(playerWatch); let lastT = 0; let still = 0; playerWatch = setInterval(()=>{
      try{
        const cur = v.currentTime || 0;
        if (Math.abs(cur - lastT) < 0.01 && !v.paused && !v.ended){
          still++;
          if (!canNativeHls && still>=3){ reloadSource(); still = 0; }
        } else { still = 0; }
        lastT = cur;
      }catch{}
    }, 3500);
attachVideoKeepAlive(v);
  }

function startPlaylist(){
  currentIndex = 0;
  loadCurrentItem();
}
  // screen 1 hero
  const hero = $('#newsHero'); hero.innerHTML='';
  const item = (STATE.news||[])[newsIdx % (STATE.news?.length||1)];
  if (item){
    const t = document.createElement('div'); t.className='title'; t.textContent=item.title; hero.appendChild(t);
    if (item.description){ const d=document.createElement('div'); d.className='desc'; d.textContent=item.description; hero.appendChild(d); }
  }
  // screen 2 small bar
  const bar = document.createElement('div');
  newsIdx = (newsIdx+1) % (STATE.news?.length||1);
}

function cycleTips(){
  const root = $('#tips'); root.innerHTML='';
  const t = (STATE.tips||[])[tipIdx % (STATE.tips?.length||1)];
  if (t){ const el=document.createElement('div'); el.className='tip'; el.textContent=t; root.appendChild(el); }
  tipIdx = (tipIdx+1) % (STATE.tips?.length||1);
}

async function fetchWeather(){
  const box = $('#weather'); box.innerHTML='';
  const cities = STATE?.weather?.cities || [];
  for (const name of cities){
    try {
      // Geocoding by Open-Meteo
      const g = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(name)}&count=1&language=en&format=json`).then(r=>r.json());
      if (!g?.results?.length) continue;
      const { latitude, longitude, timezone } = g.results[0];
      const w = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=${encodeURIComponent(timezone)}`).then(r=>r.json());
      const temp = Math.round(w?.current?.temperature_2m);
      const code = w?.current?.weather_code;
      const cond = codeToText(code);
      const row = document.createElement('div'); row.className='city';
      row.innerHTML = `<div class="name">${name}</div><div><span class="temp">${temp}°C</span> <span class="cond">${cond}</span></div>`;
      box.appendChild(row);
    } catch {}
  }
}

function codeToText(code){
  const map = {
    0:'Clear', 1:'Mainly clear', 2:'Partly cloudy', 3:'Overcast', 45:'Fog', 48:'Depositing rime fog', 51:'Light drizzle', 53:'Drizzle', 55:'Dense drizzle', 61:'Light rain', 63:'Rain', 65:'Heavy rain', 71:'Snow', 80:'Rain showers', 95:'Thunderstorm'
  };
  return map[code] || '—';
}

let LAST_UPDATED = 0;
async function loadState(){
  STATE = await fetch('/api/state').then(r=>r.json());
  LAST_UPDATED = STATE.updatedAt || Date.now();
  $('#logo').src = STATE.settings.logoUrl ? bust(STATE.settings.logoUrl, STATE.updatedAt) : '';
  setTicker(STATE.settings.sponsorTicker||'');
  $('#bluebar').textContent = STATE.settings.bluebarText || '';
  setBackground(STATE.background);
  renderClocks();
  startPlaylist();
  cycleNews();
  cycleTips();
  fetchWeather();
}

await loadState();
applyLang();

// Polling fallback in case SSE disconnects
setInterval(async () => {
  try {
    const s = await fetch('/api/state').then(r=>r.json());
    if ((s.updatedAt||0) > LAST_UPDATED) {
      STATE = s; LAST_UPDATED = s.updatedAt;
      $('#logo').src = STATE.settings.logoUrl || '';
      setTicker(STATE.settings.sponsorTicker||'');
      $('#bluebar').textContent = STATE.settings.bluebarText || '';
      setBackground(STATE.background);
      renderPills();
      applyLang();
    }
  } catch {}
}, 15000);

setInterval(cycleNews, 8000);
setInterval(cycleTips, 7000);

// Ensure background and player keep correct sizing after viewport changes
let resizeTO;
window.addEventListener('resize', () => {
  clearTimeout(resizeTO);
  resizeTO = setTimeout(() => {
    setBackground(STATE.background);
    const f = document.querySelector('.player .frame'); if (f) fitFrame16x9(f);
    renderPills();
  }, 120);
});

// Pills under media (simple examples from tips)
function renderPills(){
  const box = $('#pills'); if(!box) return; box.innerHTML='';
  const items = (STATE.announcements||[]);
  if (!items.length) return;
  const track = document.createElement('div'); track.className = 'track';
  const makeItem = (a)=>{
    const div = document.createElement('div'); div.className='pill';
    div.innerHTML = `<span class=\"dot\"></span><span>${a.label||'Другое'}</span><span>${a.text||''}</span>`;
    return div;
  };
  // append two copies for seamless loop
  const copies = [...items, ...items];
  copies.forEach(a => track.appendChild(makeItem(a)));
  box.appendChild(track);
  // compute duration based on content width
  requestAnimationFrame(()=>{
    try {
      const half = track.scrollWidth / 2; // width of one copy
      const speed = 1; // px per second (very very slow)
      const dur = Math.max(60, (half + box.clientWidth) / speed);
      track.style.setProperty('--dur', dur + 's');
      // restart animation to ensure it runs after updates
      track.style.animation = 'none';
      // force reflow
      void track.offsetWidth;
      track.style.animation = '';
    } catch {}
  });
}
renderPills();

// Toggle screens by keyboard: 1 / 2 / Space
function setScreen(n){
  const a = document.querySelector('.screen-1');
  const b = document.querySelector('.screen-2');
  const app = document.querySelector('#app');
  app.dataset.screen = String(n);
  if (n===1){ a.hidden=false; b.hidden=true; }
  else { a.hidden=true; b.hidden=false; }
  const f = document.querySelector('.player .frame'); if (f) fitFrame16x9(f);
}
{
  const qs = new URLSearchParams(location.search);
  const p = qs.get('screen');
  const def = (STATE?.playlist?.length ? 2 : 1);
  setScreen(p ? Number(p) : def);
}

document.addEventListener('keydown',(e)=>{
  if (e.key==='1') setScreen(1);
  else if (e.key==='2') setScreen(2);
  else if (e.code==='Space'){ const n = document.querySelector('#app').dataset.screen==='1'?2:1; setScreen(n); }
});

// Live updates via SSE
const ev = new EventSource('/api/stream');
ev.onmessage = async () => {
  const prevPl = JSON.stringify(STATE?.playlist||[]);
  const prevBg = JSON.stringify(STATE?.background||{});
  const prevLogo = STATE?.settings?.logoUrl;
  const prevTicker = STATE?.settings?.sponsorTicker;
  const prevBlue = STATE?.settings?.bluebarText;
  await loadState();
  renderPills();
  applyLang();
  if (JSON.stringify(STATE.playlist||[]) !== prevPl) startPlaylist();
  if (JSON.stringify([STATE.background]) !== prevBg) { setBackground(STATE.background); }
  if (STATE.settings.logoUrl !== prevLogo) $('#logo').src = STATE.settings.logoUrl || '';
  if (STATE.settings.sponsorTicker !== prevTicker) setTicker(STATE.settings.sponsorTicker||'');
  if (STATE.settings.bluebarText !== prevBlue) $('#bluebar').textContent = STATE.settings.bluebarText || '';
};
