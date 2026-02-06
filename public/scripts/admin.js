const $ = (s) => document.querySelector(s);
function show(msg, isErr=false){
  const b = document.getElementById('toast'); if (!b) return;
  b.textContent = msg; b.style.display='block'; b.style.background = isErr?'#2a0d0d':'#0a0f18';
  clearTimeout(show._t); show._t = setTimeout(()=>{ b.style.display='none'; }, 2000);
}
const api = async (path, opts={}) => {
  try {
    const r = await fetch(path, {headers:{'Content-Type':'application/json'}, ...opts});
    if(!r.ok) throw new Error('HTTP '+r.status);
    return await r.json();
  } catch (e) {
    show('Error: '+e.message, true); throw e;
  }
};

async function uploadFile(input) {
  if (!input.files?.[0]) return null;
  const fd = new FormData();
  fd.append('file', input.files[0]);
  const res = await fetch('/api/upload', { method: 'POST', body: fd });
  const data = await res.json();
  return data.url;
}


let state = null;

function renderPlaylist(list) {
  const root = $('#playlist');
  root.className = 'list';
  root.innerHTML = '';
  list.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'item';
    row.innerHTML = `
      <span class="badge">${item.type}</span>
      <input value="${item.type==='youtube' ? item.id : (item.url||'')}" />
      <input value="${item.title||''}" placeholder="Title" />
      <button data-act="up">↑</button>
      <button data-act="down">↓</button>
      <button data-act="del">Delete</button>
    `;
    row.querySelector('[data-act="up"]').onclick = ()=> { if (idx>0){ [list[idx-1],list[idx]]=[list[idx],list[idx-1]]; renderPlaylist(list);} };
    row.querySelector('[data-act="down"]').onclick = ()=> { if (idx<list.length-1){ [list[idx+1],list[idx]]=[list[idx],list[idx+1]]; renderPlaylist(list);} };
    row.querySelector('[data-act="del"]').onclick = ()=> { list.splice(idx,1); renderPlaylist(list);} ;
    const inputVal = row.querySelectorAll('input')[0];
    const inputTitle = row.querySelectorAll('input')[1];
    inputVal.oninput = ()=>{ if(item.type==='youtube'){ item.id = ytIdFrom(inputVal.value);} else { item.url = inputVal.value; } };
    inputTitle.oninput = ()=>{ item.title = inputTitle.value; };
    root.appendChild(row);
  });
}

function renderPairs(list, rootSel) {
  const root = $(rootSel); root.className = 'list'; root.innerHTML='';
  list.forEach((n, idx)=>{
    const row = document.createElement('div');
    row.className='item';
    row.innerHTML = `
      <input value="${n.title||n}" placeholder="${Array.isArray(n)?'':''}" />
      ${n.description!==undefined?`<input value="${n.description}" placeholder="Description" />`:''}
      <button data-act="del">Delete</button>`;
    const inputs = row.querySelectorAll('input');
    if (n.title!==undefined) {
      inputs[0].oninput=()=>{ n.title = inputs[0].value; };
      inputs[1].oninput=()=>{ n.description = inputs[1].value; };
    } else {
      inputs[0].oninput=()=>{ list[idx] = inputs[0].value; };
    }
    row.querySelector('[data-act="del"]').onclick=()=>{ list.splice(idx,1); renderPairs(list, rootSel); };
    root.appendChild(row);
  });
}

async function load() {
  state = await api('/api/state');
  // Logo + ticker
  $('#logoUrl').value = state.settings.logoUrl || '';
  $('#logoPreview').src = state.settings.logoUrl || '';
  $('#ticker').value = state.settings.sponsorTicker || '';
  $('#bluebarText').value = state.settings.bluebarText || '';

  // Background
  $('#bgEnabled').checked = state.background.enabled !== false;
  $('#bgType').value = state.background.type || 'image';
  $('#bgMode').value = state.background.mode || 'auto';
  $('#bgUrl').value = state.background.url || '';


  renderPlaylist(state.playlist);
  renderPairs(state.news, '#news');
  renderPairs(state.tips, '#tips');
  renderPairs(state.weather.cities, '#cities');
  renderAnnouncements();
}

// Event bindings
$('#uploadLogoBtn').onclick = async ()=>{
  const url = await uploadFile($('#logoFile')); if (url){ $('#logoUrl').value = url; $('#logoPreview').src = url; }
};
$('#saveLogoBtn').onclick = async ()=>{
  const logoUrl = $('#logoUrl').value.trim();
  await api('/api/settings', { method:'PUT', body: JSON.stringify({ logoUrl })});
  show('Logo updated');
  await load();
};
$('#saveTickerBtn').onclick = async ()=>{
  const sponsorTicker = $('#ticker').value;
  await api('/api/settings', { method:'PUT', body: JSON.stringify({ sponsorTicker })});
  show('Ticker saved');
  await load();
};
$('#saveBluebarBtn').onclick = async ()=>{
  const bluebarText = $('#bluebarText').value;
  await api('/api/settings', { method:'PUT', body: JSON.stringify({ bluebarText })});
  show('Blue bar saved');
  await load();
};

$('#uploadBgBtn').onclick = async ()=>{
  const url = await uploadFile($('#bgFile')); if (url){ $('#bgUrl').value = url; }
};
$('#saveBgBtn').onclick = async ()=>{
  await api('/api/background', { method:'PUT', body: JSON.stringify({ enabled: $('#bgEnabled').checked, type: $('#bgType').value, url: $('#bgUrl').value, mode: $('#bgMode').value }) });
  show('Background saved');
  await load();
};


$('#addPlBtn').onclick = ()=>{
  const value = $('#plValue').value.trim();
  if (!value) return;
  state.playlist.push({type:'mp4', url: value});
  $('#plValue').value = '';
  renderPlaylist(state.playlist);
};
$('#savePlBtn').onclick = async ()=>{
  await api('/api/playlist', { method:'PUT', body: JSON.stringify(state.playlist) });
  show('Playlist saved');
  await load();
};
$('#uploadPlBtn').onclick = async ()=>{
  const input = document.getElementById('plFile');
  const url = await uploadFile(input);
  if (url){ state.playlist.push({type:'mp4', url}); renderPlaylist(state.playlist); }
};

$('#addNewsBtn').onclick = ()=>{
  const title = $('#newsTitle').value.trim();
  const description = $('#newsDesc').value.trim();
  if (!title) return; state.news.push({title, description});
  $('#newsTitle').value=''; $('#newsDesc').value='';
  renderPairs(state.news, '#news');
};
$('#saveNewsBtn').onclick = async ()=>{
  await api('/api/news', { method:'PUT', body: JSON.stringify(state.news) });
  show('News saved');
  await load();
};

$('#addTipBtn').onclick = ()=>{
  const v = $('#tipValue').value.trim(); if(!v) return; state.tips.push(v); $('#tipValue').value=''; renderPairs(state.tips,'#tips');
};
$('#saveTipsBtn').onclick = async ()=>{
  await api('/api/tips', { method:'PUT', body: JSON.stringify(state.tips) });
  show('Tips saved');
  await load();
};

function renderAnnouncements(){
  const root = document.getElementById('annos'); if(!root) return; root.innerHTML=''; root.className='list';
  (state.announcements||[]).forEach((a, idx)=>{
    const row = document.createElement('div'); row.className='item';
    row.innerHTML = `<input value="${a.label}" placeholder="Label"/><input value="${a.text}" placeholder="Text" /><button data-act="del">Delete</button>`;
    const [il, it] = row.querySelectorAll('input');
    il.oninput = ()=>{ a.label = il.value; };
    it.oninput = ()=>{ a.text = it.value; };
    row.querySelector('[data-act="del"]').onclick=()=>{ state.announcements.splice(idx,1); renderAnnouncements(); };
    root.appendChild(row);
  });
}
$('#addAnnoBtn')?.addEventListener('click', ()=>{
  const label = document.getElementById('annoLabel').value.trim();
  const text = document.getElementById('annoText').value.trim();
  if (!text) return; state.announcements = state.announcements||[]; state.announcements.push({label: label||'Другое', text});
  document.getElementById('annoLabel').value=''; document.getElementById('annoText').value='';
  renderAnnouncements();
});
$('#saveAnnoBtn')?.addEventListener('click', async ()=>{
  await api('/api/announcements', { method:'PUT', body: JSON.stringify(state.announcements||[]) });
  show('Announcements saved');
  await load();
});

$('#addCityBtn').onclick = ()=>{
  const v = $('#cityValue').value.trim(); if(!v) return; state.weather.cities.push(v); $('#cityValue').value=''; renderPairs(state.weather.cities,'#cities');
};
$('#saveCitiesBtn').onclick = async ()=>{
  await api('/api/weather/cities', { method:'PUT', body: JSON.stringify({ cities: state.weather.cities }) });
  show('Cities saved');
  await load();
};

load();

// Listen for live updates to refresh state (in case of multiple admins)
const ev = new EventSource('/api/stream');
ev.onmessage = () => load();
