/* ── Service Worker ── */
if ('serviceWorker' in navigator) {
  const swCode = `
    const CACHE = 'income-v2';
    self.addEventListener('install', e => {
      e.waitUntil(caches.open(CACHE).then(c => c.addAll(['./', './index.html'])));
      self.skipWaiting();
    });
    self.addEventListener('activate', e => {
      e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
      self.clients.claim();
    });
    self.addEventListener('fetch', e => {
      e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('./index.html'))));
    });
  `;
  const swBlob = new Blob([swCode], {type: 'application/javascript'});
  navigator.serviceWorker.register(URL.createObjectURL(swBlob)).catch(() => {});
}

/* ── Constants ── */
const DAYS   = ['日','月','火','水','木','金','土'];
const MONTHS = ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'];
const DAY_EN = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const MON_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const PAGE_TITLES = { home:'Home', months:'はま寿司', english:'English', gas:'Gasoline', wallet:'Wallet', salary:'Main Job' };

let dark = false, curMonth = 0;

/* ── Storage ── */
function gd(k) {
  try {
    const raw = localStorage.getItem(k);
    if (raw === null) return k === 'wallet' || k === 'actuals' ? {} : [];
    return JSON.parse(raw);
  } catch(e) { return k === 'wallet' || k === 'actuals' ? {} : []; }
}
function sd(k, v) {
  localStorage.setItem(k, JSON.stringify(v));
  if (window.fbSave) window.fbSave(k, v);
}

/* ── Helpers ── */
function yen(n) { return '¥' + Math.round(n).toLocaleString('ja-JP'); }
function fmtH(m) { const h = Math.floor(m/60), mm = Math.round(m%60); return h + ':' + (mm < 10 ? '0' : '') + mm; }
function tH(t) { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h + m/60; }
function sMins(tin, tout) {
  if (!tin || !tout) return 0;
  let i = tH(tin), o = tH(tout);
  if (o <= i) o += 24;
  return Math.round((o - i) * 60);
}
function sPay(day, tin, tout) {
  if (!day || !tin || !tout) return 0;
  const we = day === '土' || day === '日';
  const base = we ? 1270 : 1200;
  let i = tH(tin), o = tH(tout);
  if (o <= i) o += 24;
  const pre = Math.max(0, Math.min(22, o) - i) * base;
  const af = Math.max(0, o - Math.max(i, 22));
  const f2 = Math.min(2, af) * base * 1.25;
  const ov = Math.max(0, af - 2);
  return Math.round(pre + f2 + Math.floor(ov) * (base * 1.25 + 150) + (ov % 1) * base * 1.25);
}
function mEst(shifts) {
  const tot = shifts.filter(s => s.done).reduce((s, x) => s + sPay(x.day, x.tin, x.tout), 0);
  return Math.round(tot - 200 - Math.round(tot * 0.0306));
}
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 1800);
}

/* ── Theme ── */
function applyTheme() {
  document.getElementById('app').classList.toggle('dark', dark);
  document.getElementById('login-screen').classList.toggle('dark', dark);
  document.documentElement.style.background = dark ? '#0d1117' : '#f7f6f2';
  document.body.style.background = dark ? '#0d1117' : '#f7f6f2';
}
function setThemeButtons() {
  const icon = dark ? 'ti-sun' : 'ti-moon';
  const label = dark ? 'Light' : 'Dark';
  const tb = document.getElementById('tbtn'); if (tb) tb.innerHTML = `<i class="ti ${icon}"></i> ${label}`;
  const tbd = document.getElementById('theme-btn-desk'); if (tbd) tbd.innerHTML = `<i class="ti ${icon}"></i>`;
  const tbm = document.getElementById('tbtn-mob'); if (tbm) tbm.innerHTML = `<i class="ti ${icon}"></i> ${label}`;
  document.querySelectorAll('.page .topbar .tbtn').forEach(el => { el.innerHTML = `<i class="ti ${icon}"></i>`; });
}
function toggleTheme() {
  dark = !dark; applyTheme(); setThemeButtons();
  localStorage.setItem('theme', dark ? 'dark' : 'light');
}

/* ── Swipe ── */
function addSwipe(el, onLeft, onRight) {
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => {
    x0 = e.touches[0].clientX;
    y0 = e.touches[0].clientY;
  }, {passive: true});
  el.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    const dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > Math.abs(dy) * 1.5 && Math.abs(dx) > 50) {
      dx < 0 ? onLeft() : onRight();
    }
    x0 = null; y0 = null;
  }, {passive: true});
}

/* ── Navigation ── */
function goPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nb').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.snb').forEach(b => b.classList.remove('active'));
  document.getElementById('page-' + name).classList.add('active');
  ['home','months','english','gas','wallet','salary'].forEach((n,i) => {
    if (n === name) document.querySelectorAll('.nb')[i].classList.add('active');
  });
  const snb = document.querySelector(`.snb[data-page="${name}"]`);
  if (snb) snb.classList.add('active');
  const dtt = document.getElementById('dt-page-title');
  if (dtt) dtt.textContent = PAGE_TITLES[name] || name;
  document.getElementById('scroll').scrollTop = 0;
  if (name === 'home') renderHome();
  else if (name === 'months') renderMonths();
  else if (name === 'english') renderEnglish();
  else if (name === 'gas') renderGas();
  else if (name === 'salary') renderSalary();
  else renderWallet();
}

/* ── HOME ── */
function renderHome() {
  const now = new Date();
  document.getElementById('h-date').textContent = `${MON_EN[now.getMonth()]} ${now.getDate()}, ${now.getFullYear()}`;
  document.getElementById('h-weekday').textContent = DAY_EN[now.getDay()];
  const yr = now.getFullYear().toString();
  const actuals = gd('actuals') || {};
  const english = gd('english') || [];
  let shiftTotal = 0;
  MONTHS.forEach(m => { const k = yr+'-'+m; if (actuals[k]) shiftTotal += actuals[k]; });
  const engTotal = english.filter(e => e.year === yr).reduce((s, x) => s + (x.amount || 0), 0);
  document.getElementById('h-income').innerHTML = `
    <div class="ic"><div class="ic-lbl">はま寿司 ${yr}</div><div class="ic-val g">${yen(shiftTotal)}</div></div>
    <div class="ic"><div class="ic-lbl">English ${yr}</div><div class="ic-val b">${yen(engTotal)}</div></div>
  `;
  const el = document.getElementById('ql-date');
  if (!el.value) {
    const y = now.getFullYear(), mo = String(now.getMonth()+1).padStart(2,'0'), d = String(now.getDate()).padStart(2,'0');
    el.value = `${y}-${mo}-${d}`;
    document.getElementById('ql-day').value = DAYS[now.getDay()];
    qlCalc();
  }
  document.getElementById('ql-month').value = (now.getMonth()+1) + '月';
}
function qlDate() {
  const v = document.getElementById('ql-date').value; if (!v) return;
  const d = new Date(v);
  document.getElementById('ql-day').value = DAYS[d.getDay()];
  document.getElementById('ql-month').value = (d.getMonth()+1) + '月';
  qlCalc();
}
function qlCalc() {
  const day = document.getElementById('ql-day').value;
  const tin = document.getElementById('ql-in').value, tout = document.getElementById('ql-out').value;
  const p = sPay(day, tin, tout), m = sMins(tin, tout);
  const box = document.getElementById('ql-prev');
  if (p && m) {
    document.getElementById('ql-pval').textContent = yen(p);
    document.getElementById('ql-phrs').textContent = fmtH(m);
    box.classList.add('show');
  } else box.classList.remove('show');
}
function qlSubmit() {
  const date = document.getElementById('ql-date').value;
  const tin = document.getElementById('ql-in').value, tout = document.getElementById('ql-out').value;
  const month = document.getElementById('ql-month').value;
  const done = document.getElementById('ql-done').value === '1';
  if (!date || !tin || !tout) { toast('Fill in all fields'); return; }
  const day = DAYS[new Date(date).getDay()];
  const shifts = gd('shifts');
  shifts.push({ id: Date.now(), month, date, day, done, tin, tout });
  sd('shifts', shifts);
  document.getElementById('ql-date').value = '';
  document.getElementById('ql-day').value = '';
  document.getElementById('ql-in').value = '21:00';
  document.getElementById('ql-out').value = '00:00';
  document.getElementById('ql-prev').classList.remove('show');
  toast('Shift added ✓');
  renderHome();
}

/* ── MONTHS ── */
function getMonths() { const seen = new Set(gd('shifts').map(s => s.month)); return MONTHS.filter(m => seen.has(m)); }
function chMonth(d) { const ms = getMonths(); curMonth = Math.max(0, Math.min(ms.length-1, curMonth+d)); renderMonths(); }
function renderMonths() {
  const ms = getMonths();
  if (!ms.length) { document.getElementById('m-title').textContent = 'No data'; return; }
  const month = ms[curMonth];
  document.getElementById('m-title').textContent = month;
  document.getElementById('arr-p').disabled = curMonth === 0;
  document.getElementById('arr-n').disabled = curMonth === ms.length - 1;
  const shifts = gd('shifts').filter(s => s.month === month).sort((a,b) => a.date.localeCompare(b.date));
  const actuals = gd('actuals') || {};
  const yr = shifts[0] ? shifts[0].date.slice(0,4) : new Date().getFullYear().toString();
  const akey = yr + '-' + month;
  const actual = actuals[akey] != null ? actuals[akey] : null;
  const done = shifts.filter(s => s.done);
  const totMins = done.reduce((s, x) => s + sMins(x.tin, x.tout), 0);
  const est = mEst(shifts);
  document.getElementById('m-stats').innerHTML = `
    <div class="sc"><div class="sc-lbl">Shifts</div><div class="sc-val">${done.length}日</div></div>
    <div class="sc"><div class="sc-lbl">Hours</div><div class="sc-val a">${fmtH(totMins)}</div></div>
    <div class="sc"><div class="sc-lbl">予想収入</div><div class="sc-val g">${yen(est)}</div></div>
  `;
  const diff = actual != null ? actual - est : null;
  document.getElementById('m-actual').innerHTML = `
    <div class="actual-lbl">実際の給料 — received salary</div>
    ${actual != null
      ? `<div class="actual-big">${yen(actual)}</div>
         <div class="actual-diff" style="color:${diff >= 0 ? 'var(--green)' : 'var(--amber)'}">
           ${diff >= 0 ? '+' : ''}${yen(diff)} vs estimated
         </div>`
      : `<div class="actual-pending">Not received yet</div>`}
    <div class="inp-row">
      <input type="number" id="act-inp" value="${actual != null ? actual : ''}" placeholder="Enter actual amount">
      <button onclick="saveActual('${akey}')">Save</button>
    </div>
  `;
  let rows = '';
  if (!shifts.length) {
    rows = `<tr><td colspan="5"><div class="empty">No shifts this month</div></td></tr>`;
  } else {
    let tMins = 0, tPay = 0;
    shifts.forEach(s => {
      const pay = sPay(s.day, s.tin, s.tout);
      const mins = sMins(s.tin, s.tout);
      if (s.done) { tMins += mins; tPay += pay; }
      const we = s.day === '土' || s.day === '日';
      rows += `<tr class="${s.done ? '' : 'dim'}">
        <td><span class="dot ${s.done ? 'done' : 'up'}"></span>${s.date.slice(5).replace('-','/')}<span class="dbadge ${we ? 'we' : ''}">${s.day}</span></td>
        <td>${s.tin}→${s.tout}</td>
        <td class="r">${mins ? fmtH(mins) : '—'}</td>
        <td class="r" style="color:${s.done ? 'var(--green)' : 'var(--amber)'}">${pay ? yen(pay) : '—'}</td>
        <td><button class="del-btn" onclick="delShift(${s.id})">×</button></td>
      </tr>`;
    });
    rows += `<tr class="tot-row">
      <td colspan="2">${done.length} shifts done</td>
      <td class="r" style="color:var(--amber)">${fmtH(tMins)}</td>
      <td class="r" style="color:var(--green)">${yen(est)}</td>
      <td></td>
    </tr>`;
  }
  document.getElementById('m-tbody').innerHTML = rows;
}
function saveActual(akey) {
  const v = parseFloat(document.getElementById('act-inp').value);
  if (isNaN(v)) { toast('Enter valid amount'); return; }
  const a = gd('actuals') || {}; a[akey] = v; sd('actuals', a);
  renderMonths(); renderHome();
}
function delShift(id) {
  sd('shifts', gd('shifts').filter(s => s.id !== id));
  renderMonths(); renderHome();
}

/* ── ENGLISH ── */
function renderEnglish() {
  const items = (gd('english') || []).sort((a,b) => (a.year+a.month).localeCompare(b.year+b.month));
  const el = document.getElementById('english-list');
  const total = items.reduce((s, x) => s + (x.amount || 0), 0);
  if (!items.length) {
    el.innerHTML = '<div class="empty">No payments yet</div>';
    document.getElementById('e-month').value = (new Date().getMonth()+1) + '月';
    return;
  }
  let lastG = '', html = '';
  items.forEach(i => {
    const g = (i.year || '2026') + ' · ' + i.month;
    if (g !== lastG) { html += `<div class="mgrp">${g}</div>`; lastG = g; }
    html += `<div class="entry">
      <div><div class="e-main">${i.note || i.month}</div></div>
      <div style="display:flex;align-items:center;gap:6px">
        <div class="e-amt" style="color:var(--blue)">${yen(i.amount)}</div>
        <button class="del-btn" onclick="delEnglish(${i.id})">×</button>
      </div>
    </div>`;
  });
  html += `<div class="total-row">
    <span style="font-size:11px;color:var(--text3)">Total</span>
    <span style="font-size:16px;font-weight:500;color:var(--blue);font-family:var(--mono)">${yen(total)}</span>
  </div>`;
  el.innerHTML = html;
  document.getElementById('e-month').value = (new Date().getMonth()+1) + '月';
}
function addEnglish() {
  const month = document.getElementById('e-month').value;
  const amount = parseFloat(document.getElementById('e-amt').value);
  const note = document.getElementById('e-note').value.trim();
  if (isNaN(amount)) { toast('Enter an amount'); return; }
  const items = gd('english') || [];
  items.push({ id: Date.now(), year: new Date().getFullYear().toString(), month, amount, note });
  sd('english', items);
  document.getElementById('e-amt').value = '';
  document.getElementById('e-note').value = '';
  toast('Saved!'); renderEnglish(); renderHome();
}
function delEnglish(id) {
  sd('english', (gd('english') || []).filter(x => x.id !== id));
  renderEnglish(); renderHome();
}

/* ── GAS ── */
function renderGas() {
  const items = (gd('gas') || []).sort((a,b) => a.date.localeCompare(b.date));
  const el = document.getElementById('gas-list');
  const banner = document.getElementById('gas-banner');
  if (!items.length) {
    banner.innerHTML = '';
    el.innerHTML = '<div class="empty">No refuels yet.<br>Log your odometer each fill-up<br>to track km per refuel.</div>';
    return;
  }
  const dists = [];
  for (let i = 1; i < items.length; i++) {
    const d = items[i].odo - items[i-1].odo;
    if (d > 0) dists.push(d);
  }
  const avg = dists.length ? Math.round(dists.reduce((a,b) => a+b) / dists.length) : null;
  banner.innerHTML = avg
    ? `<div class="gas-banner">
        <div><div class="gb-lbl">Avg km per refuel · ${items.length} fill-ups</div><div class="gb-val">${avg} km</div></div>
        <i class="ti ti-gas-station" style="font-size:32px;opacity:0.5;color:var(--green-text)"></i>
       </div>` : '';
  let html = '';
  [...items].reverse().forEach(g => {
    const idx = items.findIndex(x => x.id === g.id);
    const km = idx > 0 ? g.odo - items[idx-1].odo : null;
    html += `<div class="entry">
      <div>
        <div class="e-main">${g.date}</div>
        <div class="e-sub">Odo: ${g.odo ? g.odo.toLocaleString() + ' km' : '—'}${km && km > 0 ? ' · +' + km + ' km since last' : ''}${g.note ? ' · ' + g.note : ''}</div>
      </div>
      <div style="display:flex;align-items:center;gap:6px">
        <div class="e-amt">${yen(g.cost)}</div>
        <button class="del-btn" onclick="delGas(${g.id})">×</button>
      </div>
    </div>`;
  });
  el.innerHTML = html;
}
function addGas() {
  const date = document.getElementById('g-date').value;
  const cost = parseFloat(document.getElementById('g-cost').value);
  const odo  = parseFloat(document.getElementById('g-odo').value);
  const note = document.getElementById('g-note').value.trim();
  if (!date || isNaN(cost) || isNaN(odo)) { toast('Fill date, cost & odometer'); return; }
  const items = gd('gas') || [];
  items.push({ id: Date.now(), date, cost, odo, note });
  sd('gas', items);
  document.getElementById('g-date').value = '';
  document.getElementById('g-cost').value = '';
  document.getElementById('g-odo').value = '';
  toast('Saved!'); renderGas();
}
function delGas(id) { sd('gas', (gd('gas') || []).filter(x => x.id !== id)); renderGas(); }

/* ── WALLET ── */
function fmtDate(ts) {
  if (!ts) return 'Not set yet';
  const d = new Date(ts);
  return 'Updated ' + d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0');
}
function toggleEdit(key) {
  const form = document.getElementById('edit-' + key);
  const isOpen = form.classList.contains('open');
  document.querySelectorAll('.wallet-edit-form').forEach(f => f.classList.remove('open'));
  if (!isOpen) {
    form.classList.add('open');
    const wallet = gd('wallet') || {};
    const inp = document.getElementById('inp-' + key);
    inp.value = wallet[key] != null ? wallet[key].amount : '';
    inp.focus();
  }
}
function saveWallet(key) {
  const v = parseFloat(document.getElementById('inp-' + key).value);
  if (isNaN(v)) { toast('Enter a valid amount'); return; }
  const wallet = gd('wallet') || {};
  wallet[key] = { amount: v, ts: Date.now() };
  sd('wallet', wallet);
  document.getElementById('edit-' + key).classList.remove('open');
  toast('Saved!'); renderWallet();
}
function renderWallet() {
  const wallet  = gd('wallet') || {};
  const english = gd('english') || [];
  const engTotal = english.reduce((s, x) => s + (x.amount || 0), 0);
  const ufj   = wallet['ufj'];
  const yucho = wallet['yucho'];
  const cash  = wallet['cash'];
  const ufjAmt   = ufj   != null ? ufj.amount   : null;
  const yuchoAmt = yucho != null ? yucho.amount : null;
  const cashAmt  = cash  != null ? cash.amount  : null;
  document.getElementById('w-ufj-val').textContent    = ufjAmt   != null ? yen(ufjAmt)   : '—';
  document.getElementById('w-ufj-date').textContent   = fmtDate(ufj   ? ufj.ts   : null);
  document.getElementById('w-yucho-val').textContent  = yuchoAmt != null ? yen(yuchoAmt) : '—';
  document.getElementById('w-yucho-date').textContent = fmtDate(yucho ? yucho.ts : null);
  document.getElementById('w-cash-val').textContent   = cashAmt  != null ? yen(cashAmt)  : '—';
  document.getElementById('w-cash-date').textContent  = fmtDate(cash  ? cash.ts  : null);
  document.getElementById('w-english-val').textContent = yen(engTotal);
  const grand = (ufjAmt || 0) + (yuchoAmt || 0) + (cashAmt || 0) + engTotal;
  document.getElementById('w-grand-val').textContent = yen(grand);
  const parts = [];
  if (ufjAmt   == null) parts.push('UFJ');
  if (yuchoAmt == null) parts.push('ゆうちょ');
  if (cashAmt  == null) parts.push('現金');
  document.getElementById('w-grand-sub').textContent = parts.length
    ? parts.join(', ') + ' not set — total may be incomplete'
    : 'All accounts included';
}

/* ── SALARY ── */
function getSalDefaults() {
  const d = gd('salDefaults') || {};
  return { rent: d.rent != null ? d.rent : 84000, car: d.car != null ? d.car : 40480, wallets: d.wallets != null ? d.wallets : 70000 };
}
function saveDefaults() {
  const rent    = parseFloat(document.getElementById('def-rent').value);
  const car     = parseFloat(document.getElementById('def-car').value);
  const wallets = parseFloat(document.getElementById('def-wallets').value);
  const d = gd('salDefaults') || {};
  if (!isNaN(rent))    d.rent    = rent;
  if (!isNaN(car))     d.car     = car;
  if (!isNaN(wallets)) d.wallets = wallets;
  sd('salDefaults', d);
}
function toggleSalDefaults() {
  const body = document.getElementById('sal-defaults-body');
  const chev = document.getElementById('sal-def-chevron');
  const open = body.style.display !== 'none';
  body.style.display = open ? 'none' : 'block';
  chev.className = open ? 'ti ti-chevron-down' : 'ti ti-chevron-up';
  if (!open) {
    const d = getSalDefaults();
    document.getElementById('def-rent').value    = d.rent;
    document.getElementById('def-car').value     = d.car;
    document.getElementById('def-wallets').value = d.wallets;
  }
}
function addSalary() {
  const month   = document.getElementById('sal-month').value;
  const year    = document.getElementById('sal-year').value;
  const base    = parseFloat(document.getElementById('sal-base').value) || 0;
  const bonus   = parseFloat(document.getElementById('sal-bonus').value) || 0;
  const d       = getSalDefaults();
  const rentRaw    = document.getElementById('sal-rent').value;
  const carRaw     = document.getElementById('sal-car').value;
  const walletsRaw = document.getElementById('sal-wallets').value;
  const rent    = rentRaw    !== '' ? parseFloat(rentRaw)    : d.rent;
  const car     = carRaw     !== '' ? parseFloat(carRaw)     : d.car;
  const wallets = walletsRaw !== '' ? parseFloat(walletsRaw) : d.wallets;
  const cc      = parseFloat(document.getElementById('sal-cc').value) || 0;
  const note    = document.getElementById('sal-note').value.trim();
  if (!base) { toast('Enter salary'); return; }
  const items = gd('salary') || [];
  const idx = items.findIndex(x => x.month === month && x.year === year);
  const entry = { id: Date.now(), year, month, base, bonus, rent, car, wallets, cc, note };
  if (idx >= 0) items[idx] = entry; else items.push(entry);
  sd('salary', items);
  ['sal-base','sal-bonus','sal-rent','sal-car','sal-wallets','sal-cc','sal-note'].forEach(id => {
    document.getElementById(id).value = '';
  });
  toast('Saved!'); renderSalary();
}
function delSalary(id) {
  sd('salary', (gd('salary') || []).filter(x => x.id !== id));
  renderSalary();
}
function renderSalary() {
  const yrSel = document.getElementById('sal-year');
  if (yrSel) {
    const curYr = new Date().getFullYear();
    const selVal = yrSel.value || String(curYr);
    yrSel.innerHTML = '';
    for (let y = 2024; y <= curYr + 3; y++) {
      const o = document.createElement('option');
      o.value = o.textContent = y;
      if (String(y) === selVal) o.selected = true;
      yrSel.appendChild(o);
    }
    if (!yrSel.value) yrSel.value = curYr;
  }
  const items = (gd('salary') || []).sort((a,b) => (b.year+b.month).localeCompare(a.year+a.month));
  const banner = document.getElementById('salary-year-banner');
  const el = document.getElementById('salary-list');
  const yr = new Date().getFullYear().toString();
  const yearSavings = items.filter(x => x.year === yr).reduce((s, x) => {
    const total  = x.base + (x.bonus||0);
    const deduct = (x.rent||0) + (x.car||0) + (x.wallets||0) + (x.cc||0);
    return s + (total - deduct);
  }, 0);
  banner.innerHTML = items.length ? `<div class="salary-year-banner">
    <div><div class="syb-lbl">Total savings ${yr}</div><div class="syb-val">${yen(yearSavings)}</div></div>
    <i class="ti ti-briefcase" style="font-size:30px;opacity:0.5;color:var(--green-text)"></i>
  </div>` : '';
  const d = getSalDefaults();
  document.getElementById('sal-rent').placeholder    = d.rent.toLocaleString('ja-JP') + ' (default)';
  document.getElementById('sal-car').placeholder     = d.car.toLocaleString('ja-JP') + ' (default)';
  document.getElementById('sal-wallets').placeholder = d.wallets.toLocaleString('ja-JP') + ' (default)';
  document.getElementById('sal-month').value = (new Date().getMonth()+1) + '月';
  if (!items.length) { el.innerHTML = '<div class="empty">No salary logged yet</div>'; return; }
  let html = '';
  items.forEach(x => {
    const total  = x.base + (x.bonus||0);
    const deduct = (x.rent||0) + (x.car||0) + (x.wallets||0) + (x.cc||0);
    const saving = total - deduct;
    const savCls = saving >= 0 ? 'pos' : 'neg';
    html += `<div class="salary-month-card">
      <div class="smc-header">
        <div class="smc-month">${x.year} · ${x.month}${x.note ? ' <span style="font-size:11px;color:var(--text3)">— '+x.note+'</span>' : ''}</div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="smc-total ${savCls}">${saving >= 0 ? '+' : ''}${yen(saving)}</div>
          <button class="del-btn" onclick="delSalary(${x.id})">×</button>
        </div>
      </div>
      <div class="smc-row"><span class="smc-lbl">Salary after tax</span><span class="smc-val">${yen(x.base)}</span></div>
      ${x.bonus ? `<div class="smc-row"><span class="smc-lbl">Bonus</span><span class="smc-val pos">+${yen(x.bonus)}</span></div>` : ''}
      ${x.rent ? `<div class="smc-row"><span class="smc-lbl">🏠 Rent</span><span class="smc-val neg">−${yen(x.rent)}</span></div>` : ''}
      ${x.car ? `<div class="smc-row"><span class="smc-lbl">🚗 Car loan</span><span class="smc-val neg">−${yen(x.car)}</span></div>` : ''}
      ${x.wallets ? `<div class="smc-row"><span class="smc-lbl">👫 Our wallets</span><span class="smc-val neg">−${yen(x.wallets)}</span></div>` : ''}
      ${x.cc ? `<div class="smc-row"><span class="smc-lbl">💳 Credit card</span><span class="smc-val neg">−${yen(x.cc)}</span></div>` : ''}
      <div class="smc-savings-row">
        <span class="smc-savings-lbl">Remaining / savings</span>
        <span class="smc-val ${savCls}" style="font-size:15px">${saving >= 0 ? '+' : ''}${yen(saving)}</span>
      </div>
    </div>`;
  });
  el.innerHTML = html;
}

/* ── INIT ── */
window._appReady = function() {
  const av = document.getElementById('user-avatar');
  const nm = document.getElementById('user-name');
  if (av) {
    document.getElementById('user-avatar-desk').textContent = av.textContent;
    document.getElementById('user-name-desk').textContent   = nm.textContent;
  }
  if (localStorage.getItem('theme') === 'dark') {
    dark = true; applyTheme(); setThemeButtons();
  }
  const todayM = (new Date().getMonth() + 1) + '月';
  const ams = getMonths();
  const ti = ams.indexOf(todayM);
  curMonth = ti >= 0 ? ti : Math.max(0, ams.length - 1);
  renderHome();

  // Swipe listeners registered ONCE here — never inside render functions
  addSwipe(
    document.getElementById('page-months'),
    () => chMonth(1),   // swipe left  → next month
    () => chMonth(-1)   // swipe right → previous month
  );
};
