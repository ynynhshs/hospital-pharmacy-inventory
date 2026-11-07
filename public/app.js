/* Hospital Information: Pharmacy and Medical Inventory Management System - front-end */
const $ = (s, r = document) => r.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = d => d ? new Date(d).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const fmtDT = d => d ? new Date(d).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';
const ymd = d => new Date(d).toISOString().slice(0, 10);
const todayStr = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const ROLE_LABEL = { admin: 'Administrator', pharmacist: 'Pharmacist', staff: 'Inventory Staff' };

const state = { token: localStorage.getItem('pt_token'), user: null };

/* ---------- API / UI helpers ---------- */
async function api(path, opts = {}) {
  const res = await fetch('/api' + path, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined
  });
  let data = {};
  try { data = await res.json(); } catch { /* empty */ }
  if (res.status === 401 && state.token && !path.startsWith('/auth/login')) { logout(); throw new Error(data.error || 'Please log in again.'); }
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type; t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4200);
}
function closeModal() { $('#modalRoot').innerHTML = ''; }
function openModal(html, wide) {
  $('#modalRoot').innerHTML = `<div class="overlay"><div class="modal ${wide ? 'wide' : ''}">${html}</div></div>`;
  $('#modalRoot .overlay').addEventListener('mousedown', e => { if (e.target.classList.contains('overlay')) closeModal(); });
  return $('#modalRoot .modal');
}
function confirmBox(msg) { return window.confirm(msg); }

/* Generic form modal. fields: {name,label,type,options,required,value,full,hint,placeholder,min,step,list} */
function formModal({ title, fields, submitLabel = 'Save', onSubmit, wide }) {
  const inputs = fields.map(f => {
    const v = f.value ?? '';
    let ctl;
    if (f.type === 'select') {
      ctl = `<select name="${f.name}" ${f.required ? 'required' : ''}>${(f.options || []).map(o => `<option value="${esc(o.value)}" ${String(o.value) === String(v) ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>`;
    } else if (f.type === 'textarea') {
      ctl = `<textarea name="${f.name}" rows="2" ${f.required ? 'required' : ''} placeholder="${esc(f.placeholder || '')}">${esc(v)}</textarea>`;
    } else {
      ctl = `<input name="${f.name}" type="${f.type || 'text'}" value="${esc(v)}" ${f.required ? 'required' : ''} ${f.min !== undefined ? `min="${f.min}"` : ''} ${f.step ? `step="${f.step}"` : ''} ${f.list ? `list="${f.list.id}"` : ''} placeholder="${esc(f.placeholder || '')}" ${f.type === 'password' ? 'autocomplete="new-password"' : ''}>`;
      if (f.list) ctl += `<datalist id="${f.list.id}">${f.list.values.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
    }
    return `<label class="${f.full ? 'full' : ''}">${esc(f.label)}${ctl}${f.hint ? `<span class="hint">${esc(f.hint)}</span>` : ''}</label>`;
  }).join('');
  const m = openModal(`<h3>${esc(title)}</h3><form><div class="fields">${inputs}</div><div class="err"></div><div class="modal-actions"><button type="button" class="btn" data-cancel>Cancel</button><button class="btn primary" type="submit">${esc(submitLabel)}</button></div></form>`, wide);
  const form = $('form', m);
  $('[data-cancel]', m).onclick = closeModal;
  form.onsubmit = async e => {
    e.preventDefault();
    const btn = $('button[type=submit]', form); btn.disabled = true;
    $('.err', form).textContent = '';
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await onSubmit(data);
      closeModal();
    } catch (err) { $('.err', form).textContent = err.message; btn.disabled = false; }
  };
  return m;
}

const can = (...roles) => roles.includes(state.user.role);
const ICON = {
  dash: '<path d="M3 13h8V3H3zM13 21h8V11h-8zM13 3v6h8V3zM3 21h8v-6H3z"/>',
  pill: '<path d="M10.5 20.5a5 5 0 0 1-7-7l9-9a5 5 0 0 1 7 7zM8.5 8.5l7 7"/>',
  box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8"/>',
  swap: '<path d="M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  truck: '<path d="M1 6h13v10H1zM14 10h4l3 3v3h-7zM6 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01"/>',
  tag: '<path d="M20 12l-8 8-9-9V3h8zM7.5 7.5h.01"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  alert: '<path d="M12 9v4M12 17h.01M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/>',
  clock: '<path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/>',
  ban: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM5.6 5.6l12.8 12.8"/>',
  truck2: '<path d="M3 7h18M5 7v13h14V7M9 11h6"/>'
};
const ic = k => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON[k]}</svg>`;

const PAGES = [
  { id: 'dashboard', title: 'Dashboard', icon: 'dash', roles: ['admin', 'pharmacist', 'staff'], render: pgDashboard },
  { id: 'medicines', title: 'Medicines', icon: 'pill', roles: ['admin', 'pharmacist', 'staff'], render: () => pgItems('medicine') },
  { id: 'supplies', title: 'Medical Supplies', icon: 'box', roles: ['admin', 'pharmacist', 'staff'], render: () => pgItems('supply') },
  { id: 'stock', title: 'Stock In / Out', icon: 'swap', roles: ['admin', 'pharmacist', 'staff'], render: pgStock },
  { id: 'transactions', title: 'Transactions', icon: 'list', roles: ['admin', 'pharmacist', 'staff'], render: pgTransactions },
  { id: 'suppliers', title: 'Suppliers', icon: 'truck', roles: ['admin', 'pharmacist', 'staff'], render: pgSuppliers },
  { id: 'categories', title: 'Categories', icon: 'tag', roles: ['admin', 'pharmacist', 'staff'], render: pgCategories },
  { id: 'reports', title: 'Reports', icon: 'chart', roles: ['admin', 'pharmacist', 'staff'], render: pgReports },
  { id: 'users', title: 'Users', icon: 'users', roles: ['admin'], render: pgUsers }
];

/* ---------- Auth & shell ---------- */
function showAuth() { $('#app').classList.add('hidden'); $('#auth').classList.remove('hidden'); }
function showApp() {
  $('#auth').classList.add('hidden'); $('#app').classList.remove('hidden');
  $('#whoName').textContent = state.user.fullName;
  $('#whoRole').textContent = ROLE_LABEL[state.user.role];
  $('#nav').innerHTML = PAGES.filter(p => p.roles.includes(state.user.role))
    .map(p => `<a href="#/${p.id}" data-p="${p.id}">${ic(p.icon)}<span>${p.title}</span></a>`).join('');
  route();
}
function logout() {
  localStorage.removeItem('pt_token'); state.token = null; state.user = null; showAuth();
}
async function boot() {
  if (state.token) {
    try { state.user = (await api('/auth/me')).user; showApp(); return; } catch { /* fall through */ }
  }
  showAuth();
}

const authForms = ['loginForm', 'registerForm', 'forgotForm'];
const showForm = id => authForms.forEach(f => $('#' + f).classList.toggle('hidden', f !== id));
$('#toRegister').onclick = e => { e.preventDefault(); showForm('registerForm'); };
$('#toForgot').onclick = e => { e.preventDefault(); resetForgot(); showForm('forgotForm'); };
document.querySelectorAll('.toLogin').forEach(a => a.onclick = e => { e.preventDefault(); showForm('loginForm'); });
document.addEventListener('click', e => {
  const b = e.target.closest('[data-eye]'); if (!b) return;
  const inp = b.previousElementSibling; inp.type = inp.type === 'password' ? 'text' : 'password'; b.textContent = inp.type === 'password' ? 'Show' : 'Hide';
});
$('#loginForm').onsubmit = async e => {
  e.preventDefault();
  const f = new FormData(e.target), btn = $('button[type=submit]', e.target);
  $('#loginErr').textContent = ''; btn.disabled = true; btn.textContent = 'Logging in…';
  try {
    const r = await api('/auth/login', { method: 'POST', body: { username: f.get('username'), password: f.get('password') } });
    state.token = r.token; state.user = r.user; localStorage.setItem('pt_token', r.token);
    e.target.reset(); location.hash = '#/dashboard'; showApp();
  } catch (err) { $('#loginErr').textContent = err.message; }
  btn.disabled = false; btn.textContent = 'Log in';
};
$('#registerForm').onsubmit = async e => {
  e.preventDefault();
  $('#regErr').textContent = ''; $('#regOk').textContent = '';
  try {
    const r = await api('/auth/register', { method: 'POST', body: Object.fromEntries(new FormData(e.target).entries()) });
    $('#regOk').textContent = r.message; e.target.reset();
  } catch (err) { $('#regErr').textContent = err.message; }
};

/* ---------- Forgot password / account recovery ---------- */
let recoverStep = 1;
function resetForgot() {
  recoverStep = 1;
  const f = $('#forgotForm'); f.reset();
  $('#forgotStep2').classList.add('hidden');
  $('#forgotErr').textContent = ''; $('#forgotOk').textContent = '';
  f.username.readOnly = false; $('#forgotBtn').textContent = 'Continue'; $('#forgotBtn').disabled = false;
  $('#forgotHelp').textContent = 'Enter your username to get your security question.';
  ['answer', 'newPassword', 'confirm'].forEach(n => f[n].required = false);
}
$('#forgotForm').onsubmit = async e => {
  e.preventDefault();
  const f = e.target, btn = $('#forgotBtn');
  $('#forgotErr').textContent = ''; $('#forgotOk').textContent = ''; btn.disabled = true;
  try {
    if (recoverStep === 1) {
      const r = await api('/auth/recover/question', { method: 'POST', body: { username: f.username.value } });
      $('#forgotQ').textContent = r.question;
      $('#forgotStep2').classList.remove('hidden');
      ['answer', 'newPassword', 'confirm'].forEach(n => f[n].required = true);
      f.username.readOnly = true; recoverStep = 2; btn.textContent = 'Reset password';
      $('#forgotHelp').textContent = 'Answer your security question and set a new password.';
      f.answer.focus();
    } else {
      if (f.newPassword.value !== f.confirm.value) throw new Error('Passwords do not match.');
      const r = await api('/auth/recover/reset', { method: 'POST', body: { username: f.username.value, answer: f.answer.value, newPassword: f.newPassword.value } });
      resetForgot(); showForm('loginForm'); toast(r.message, 'success');
      return;
    }
  } catch (err) { $('#forgotErr').textContent = err.message; }
  btn.disabled = false;
};
$('#logoutBtn').onclick = logout;
$('#pwBtn').onclick = () => formModal({
  title: 'Change password', submitLabel: 'Update',
  fields: [
    { name: 'current', label: 'Current password', type: 'password', required: true, full: true },
    { name: 'next', label: 'New password (min 6 characters)', type: 'password', required: true, full: true }
  ],
  onSubmit: async d => { await api('/auth/password', { method: 'POST', body: d }); toast('Password updated', 'success'); }
});
const SEC_QUESTIONS = ["What is the name of your first pet?", "What is your mother's maiden name?", "What city were you born in?", "What was the name of your elementary school?", "What is your favorite food?"];
$('#secBtn').onclick = () => formModal({
  title: 'Account recovery question', submitLabel: 'Save',
  fields: [
    { name: 'securityQuestion', label: 'Security question', type: 'select', required: true, full: true, value: state.user.hasSecurity ? '' : SEC_QUESTIONS[0], options: SEC_QUESTIONS.map(q => ({ value: q, label: q })) },
    { name: 'securityAnswer', label: 'Your answer', required: true, full: true, hint: 'Not case-sensitive. Used if you forget your password.' },
    { name: 'current', label: 'Current password', type: 'password', required: true, full: true }
  ],
  onSubmit: async d => { await api('/auth/security', { method: 'POST', body: d }); state.user.hasSecurity = true; toast('Recovery question saved', 'success'); }
});
const sidebar = $('#sidebar'), scrim = $('#scrim');
const toggleMenu = open => { sidebar.classList.toggle('open', open); scrim.classList.toggle('open', open); };
$('#menuBtn').onclick = () => toggleMenu(true);
scrim.onclick = () => toggleMenu(false);
setInterval(() => { const c = $('#clock'); if (c) c.textContent = new Date().toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' }); }, 1000);

/* ---------- Router ---------- */
let currentPage = null;
async function route() {
  if (!state.user) return;
  const id = (location.hash.replace('#/', '') || 'dashboard').split('?')[0];
  const page = PAGES.find(p => p.id === id && p.roles.includes(state.user.role)) || PAGES[0];
  currentPage = page.id;
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('active', a.dataset.p === page.id));
  $('#pageTitle').textContent = page.title;
  toggleMenu(false);
  $('#view').onclick = null;
  $('#view').innerHTML = '<div class="empty">Loading…</div>';
  try { await page.render(); } catch (err) { $('#view').innerHTML = `<div class="empty">${esc(err.message)}</div>`; }
}
window.addEventListener('hashchange', route);
const refresh = () => route();

/* ---------- Shared render bits ---------- */
const statusBadge = s => ({ ok: '<span class="badge b-ok">In stock</span>', low: '<span class="badge b-low">Low stock</span>', out: '<span class="badge b-out">Out of stock</span>', expired: '<span class="badge b-expired">Expired only</span>' }[s]);
const typeBadge = t => ({ in: '<span class="badge b-in">Stock in</span>', out: '<span class="badge b-outx">Stock out</span>', adjust: '<span class="badge b-adj">Adjustment</span>' }[t]);
const kindBadge = k => k === 'medicine' ? '<span class="badge b-med">Medicine</span>' : '<span class="badge b-sup">Supply</span>';
function expiryBadge(b) {
  if (!b.expiryDate) return '<span class="muted">No expiry</span>';
  const days = Math.ceil((new Date(b.expiryDate) - Date.now()) / 86400000);
  if (days <= 0) return `<span class="badge b-expired">Expired ${fmtDate(b.expiryDate)}</span>`;
  if (days <= 90) return `<span class="badge b-near">${fmtDate(b.expiryDate)} · ${days}d left</span>`;
  return fmtDate(b.expiryDate);
}
function table(cols, rows, emptyMsg = 'No records yet.') {
  if (!rows.length) return `<div class="tbl"><div class="empty">${emptyMsg}</div></div>`;
  return `<div class="tbl"><table><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${cols.map(c => `<td class="${c.cls || ''}">${c.f(r)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const debounce = (fn, ms = 300) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- Dashboard ---------- */
async function pgDashboard() {
  const d = await api('/dashboard'), t = d.totals;
  const max = Math.max(1, ...d.days.flatMap(x => [x.in, x.out]));
  $('#view').innerHTML = `
    <div class="grid stats">
      <div class="card stat">${`<div class="ic">${ic('pill')}</div>`}<div><b>${t.medicines}</b><span>Medicines</span></div></div>
      <div class="card stat"><div class="ic">${ic('box')}</div><div><b>${t.supplies}</b><span>Medical supplies</span></div></div>
      <div class="card stat warn"><div class="ic">${ic('alert')}</div><div><b>${t.lowStock}</b><span>Low / out of stock</span></div></div>
      <div class="card stat warn"><div class="ic">${ic('clock')}</div><div><b>${t.nearExpiry}</b><span>Batches near expiry (90d)</span></div></div>
      <div class="card stat bad"><div class="ic">${ic('ban')}</div><div><b>${t.expired}</b><span>Expired batches in stock</span></div></div>
      <div class="card stat ok"><div class="ic">${ic('swap')}</div><div><b>${t.transactionsToday}</b><span>Transactions today</span></div></div>
    </div>
    <div class="grid two">
      <div class="card"><h3>Stock movement — last 7 days</h3>
        <div class="chart">${d.days.map(x => `<div class="col"><div class="bars"><div class="bar in" title="In: ${x.in}" style="height:${x.in / max * 100}%"></div><div class="bar out" title="Out: ${x.out}" style="height:${x.out / max * 100}%"></div></div><small>${x.label}</small></div>`).join('')}</div>
        <div class="legend"><span><i style="background:#38bdf8"></i>Stock in</span><span><i style="background:#f59e0b"></i>Stock out</span></div>
      </div>
      <div class="card"><h3>Low-stock items</h3>
        <div class="list">${d.lowItems.length ? d.lowItems.map(i => `<div class="row"><div><strong>${esc(i.name)}</strong><span class="sub">${esc(i.code)} · reorder at ${i.reorderLevel}</span></div><div>${i.available} ${esc(i.unit)} ${statusBadge(i.status)}</div></div>`).join('') : '<div class="empty">All items are above their reorder level.</div>'}</div>
      </div>
      <div class="card"><h3>Expiring soon</h3>
        <div class="list">${d.nearBatches.length ? d.nearBatches.map(b => `<div class="row"><div><strong>${esc(b.item?.name)}</strong><span class="sub">Batch ${esc(b.batchNo)} · ${b.quantity} ${esc(b.item?.unit)}</span></div><div>${expiryBadge(b)}</div></div>`).join('') : '<div class="empty">Nothing expiring in the next 90 days.</div>'}</div>
      </div>
      <div class="card"><h3>Recent transactions</h3>
        <div class="list">${d.recent.length ? d.recent.map(x => `<div class="row"><div><strong>${esc(x.itemName)}</strong><span class="sub">${fmtDT(x.date)} · ${esc(x.userName)}</span></div><div>${typeBadge(x.type)} <strong>${x.change > 0 ? '+' : ''}${x.change}</strong></div></div>`).join('') : '<div class="empty">No transactions yet. Add medicines, then record a Stock In.</div>'}</div>
      </div>
    </div>
    ${d.expiredBatches.length ? `<div class="card" style="margin-top:16px;border-color:#fecaca"><h3 style="color:#b91c1c">Expired stock — remove or adjust</h3><div class="list">${d.expiredBatches.map(b => `<div class="row"><div><strong>${esc(b.item?.name)}</strong><span class="sub">Batch ${esc(b.batchNo)} · ${b.quantity} ${esc(b.item?.unit)}</span></div><div>${expiryBadge(b)}</div></div>`).join('')}</div></div>` : ''}`;
}

/* ---------- Items (medicines / supplies) ---------- */
async function pgItems(kind) {
  const label = kind === 'medicine' ? 'Medicine' : 'Supply';
  $('#view').innerHTML = `
    <div class="toolbar">
      <input class="grow" id="q" placeholder="Search by name, code or category…">
      <select id="st"><option value="">All status</option><option value="ok">In stock</option><option value="low">Low stock</option><option value="out">Out of stock</option><option value="expired">Expired only</option></select>
      ${can('admin', 'pharmacist') ? `<button class="btn primary" id="add">+ Add ${label}</button>` : ''}
    </div><div id="list"></div>`;
  const load = async () => {
    const items = await api(`/items?kind=${kind}&q=${encodeURIComponent($('#q').value)}&status=${$('#st').value}`);
    const cols = [
      { h: 'Code', f: i => `<strong>${esc(i.code)}</strong>` },
      { h: label, f: i => `${esc(i.name)}${kind === 'medicine' ? `<span class="sub">${esc([i.genericName, i.strength, i.dosageForm].filter(Boolean).join(' · '))}</span>` : ''}` },
      { h: 'Category', f: i => esc(i.category) || '—' },
      { h: 'Unit', f: i => esc(i.unit) },
      { h: 'Available', cls: 'num', f: i => `<strong>${i.available}</strong>${i.expiredQty ? `<span class="sub" style="color:#b91c1c">+${i.expiredQty} expired</span>` : ''}` },
      { h: 'Reorder', cls: 'num', f: i => i.reorderLevel },
      { h: 'Status', f: i => statusBadge(i.status) },
      { h: '', cls: 'actions', f: i => `<button class="btn sm" data-batches="${i._id}">Batches</button>${can('admin', 'pharmacist') ? `<button class="btn sm" data-edit="${i._id}">Edit</button>` : ''}${can('admin') ? `<button class="btn sm danger" data-del="${i._id}">Delete</button>` : ''}` }
    ];
    $('#list').innerHTML = table(cols, items, `No ${label.toLowerCase()} records yet.${can('admin', 'pharmacist') ? ' Click “Add” to create the first one.' : ''}`);
    $('#list').onclick = async e => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.edit) itemForm(kind, items.find(x => x._id === b.dataset.edit), refresh);
      if (b.dataset.batches) showBatches(items.find(x => x._id === b.dataset.batches));
      if (b.dataset.del && confirmBox('Delete this item? This cannot be undone.')) {
        try { await api('/items/' + b.dataset.del, { method: 'DELETE' }); toast('Item deleted', 'success'); load(); } catch (err) { toast(err.message, 'error'); }
      }
    };
  };
  $('#q').oninput = debounce(load); $('#st').onchange = load;
  if ($('#add')) $('#add').onclick = () => itemForm(kind, null, refresh);
  await load();
}
async function itemForm(kind, item, done) {
  const cats = (await api('/categories')).filter(c => c.kind === 'both' || c.kind === kind).map(c => c.name);
  const fields = [
    { name: 'name', label: kind === 'medicine' ? 'Medicine name (brand)' : 'Supply name', required: true, value: item?.name, full: true },
    { name: 'code', label: 'Item code', value: item?.code, placeholder: 'Auto-generated if blank', hint: 'e.g. MED-0001' }
  ];
  if (kind === 'medicine') fields.push(
    { name: 'genericName', label: 'Generic name', value: item?.genericName },
    { name: 'strength', label: 'Strength', value: item?.strength, placeholder: 'e.g. 500 mg' },
    { name: 'dosageForm', label: 'Dosage form', value: item?.dosageForm, placeholder: 'Tablet, Syrup, Vial…' });
  fields.push(
    { name: 'category', label: 'Category', value: item?.category, list: { id: 'catlist', values: cats }, hint: 'Pick from the list or type a new name' },
    { name: 'unit', label: 'Unit', value: item?.unit || (kind === 'medicine' ? 'tablet' : 'pcs'), required: true, placeholder: 'box, bottle, pcs…' },
    { name: 'reorderLevel', label: 'Reorder level', type: 'number', min: 0, value: item?.reorderLevel ?? 10, required: true, hint: 'Flag as low stock at or below this quantity' });
  formModal({
    title: `${item ? 'Edit' : 'Add'} ${kind === 'medicine' ? 'medicine' : 'medical supply'}`, fields,
    onSubmit: async d => {
      d.kind = kind;
      if (d.category && !cats.includes(d.category)) { try { await api('/categories', { method: 'POST', body: { name: d.category, kind } }); } catch { /* exists */ } }
      await api(item ? '/items/' + item._id : '/items', { method: item ? 'PUT' : 'POST', body: d });
      toast('Saved', 'success'); done();
    }
  });
}
async function showBatches(item) {
  const batches = await api('/batches?item=' + item._id);
  const m = openModal(`<h3>${esc(item.name)} — batches</h3>${table([
    { h: 'Batch no.', f: b => `<strong>${esc(b.batchNo)}</strong>` },
    { h: 'Expiry', f: expiryBadge },
    { h: 'Supplier', f: b => esc(b.supplier?.name) || '—' },
    { h: 'Qty', cls: 'num', f: b => `${b.quantity} ${esc(item.unit)}` }
  ], batches, 'No stock on hand for this item.')}<div class="modal-actions"><button class="btn" data-cancel>Close</button></div>`, true);
  $('[data-cancel]', m).onclick = closeModal;
}

/* ---------- Stock In / Out ---------- */
async function pgStock() {
  const batches = await api('/batches');
  $('#view').innerHTML = `
    <div class="toolbar">
      <button class="btn primary" id="bIn">+ Stock In (receive)</button>
      <button class="btn" id="bOut" style="background:#ffedd5;color:#9a3412">− Stock Out (issue)</button>
      ${can('admin', 'pharmacist') ? '<button class="btn" id="bAdj">Adjust stock</button>' : ''}
    </div>
    <div class="card" style="margin-bottom:14px"><span class="muted small">Stock out automatically uses the batch that expires first (FEFO) and never issues expired stock.</span></div>
    ${table([
      { h: 'Item', f: b => `<strong>${esc(b.item?.name)}</strong><span class="sub">${esc(b.item?.code)}</span>` },
      { h: 'Batch no.', f: b => esc(b.batchNo) },
      { h: 'Expiry', f: expiryBadge },
      { h: 'Supplier', f: b => esc(b.supplier?.name) || '—' },
      { h: 'On hand', cls: 'num', f: b => `<strong>${b.quantity}</strong> ${esc(b.item?.unit)}` }
    ], batches, 'No stock yet. Add a medicine or supply first, then use “Stock In”.')}`;
  $('#bIn').onclick = () => stockInForm();
  $('#bOut').onclick = () => stockOutForm();
  if ($('#bAdj')) $('#bAdj').onclick = () => adjustForm(batches);
}
const itemOptions = items => [{ value: '', label: '— choose —' }, ...items.map(i => ({ value: i._id, label: `${i.code} — ${i.name}${i.strength ? ' ' + i.strength : ''} (${i.available} ${i.unit} available)` }))];
async function stockInForm() {
  const [items, sups] = await Promise.all([api('/items'), api('/suppliers')]);
  if (!items.length) return toast('Add a medicine or supply first.', 'error');
  formModal({
    title: 'Stock In — receive items', submitLabel: 'Record stock in',
    fields: [
      { name: 'item', label: 'Item', type: 'select', options: itemOptions(items), required: true, full: true },
      { name: 'quantity', label: 'Quantity received', type: 'number', min: 1, step: 'any', required: true },
      { name: 'date', label: 'Date received', type: 'date', value: todayStr(), required: true },
      { name: 'batchNo', label: 'Batch / lot number', hint: 'Required for medicines' },
      { name: 'expiryDate', label: 'Expiry date', type: 'date', hint: 'Required for medicines' },
      { name: 'supplier', label: 'Supplier', type: 'select', options: [{ value: '', label: '— none —' }, ...sups.map(s => ({ value: s._id, label: s.name }))] },
      { name: 'reference', label: 'Reference (DR / PO no.)' }
    ],
    onSubmit: async d => { await api('/transactions/in', { method: 'POST', body: d }); toast('Stock received', 'success'); refresh(); }
  });
}
async function stockOutForm() {
  const items = (await api('/items')).filter(i => i.available > 0);
  if (!items.length) return toast('No usable stock available to issue.', 'error');
  formModal({
    title: 'Stock Out — issue items', submitLabel: 'Record stock out',
    fields: [
      { name: 'item', label: 'Item', type: 'select', options: itemOptions(items), required: true, full: true },
      { name: 'quantity', label: 'Quantity to issue', type: 'number', min: 1, step: 'any', required: true },
      { name: 'date', label: 'Date issued', type: 'date', value: todayStr(), required: true },
      { name: 'reference', label: 'Issued to / reference', full: true, placeholder: 'Ward, department, patient or request no.' }
    ],
    onSubmit: async d => {
      const r = await api('/transactions/out', { method: 'POST', body: d });
      toast(`Issued ${r.issued}. Batches used: ${r.batchesUsed.map(b => b.batchNo).join(', ')}`, 'success'); refresh();
    }
  });
}
function adjustForm(batches) {
  if (!batches.length) return toast('No batches to adjust.', 'error');
  formModal({
    title: 'Adjust stock (authorized)', submitLabel: 'Save adjustment',
    fields: [
      { name: 'batch', label: 'Batch', type: 'select', required: true, full: true, options: batches.map(b => ({ value: b._id, label: `${b.item?.name} — batch ${b.batchNo} (now ${b.quantity})` })) },
      { name: 'newQuantity', label: 'Correct quantity', type: 'number', min: 0, step: 'any', required: true },
      { name: 'reference', label: 'Reference' },
      { name: 'reason', label: 'Reason for adjustment', type: 'textarea', required: true, full: true, placeholder: 'e.g. Physical count correction, damaged, expired disposal' }
    ],
    onSubmit: async d => { await api('/transactions/adjust', { method: 'POST', body: d }); toast('Adjustment recorded', 'success'); refresh(); }
  });
}

/* ---------- Transactions ---------- */
const txCols = [
  { h: 'Date', f: t => fmtDate(t.date) },
  { h: 'Type', f: t => typeBadge(t.type) },
  { h: 'Item', f: t => `<strong>${esc(t.itemName)}</strong><span class="sub">${esc(t.itemCode)}</span>` },
  { h: 'Batch', f: t => esc(t.batchNo) },
  { h: 'Change', cls: 'num', f: t => `<strong style="color:${t.change > 0 ? '#15803d' : '#b45309'}">${t.change > 0 ? '+' : ''}${t.change}</strong>` },
  { h: 'Reference / reason', f: t => esc([t.reference, t.reason, t.supplierName].filter(Boolean).join(' · ')) || '—' },
  { h: 'User', f: t => esc(t.userName) }
];
async function pgTransactions() {
  $('#view').innerHTML = `<div class="toolbar">
    <input class="grow" id="q" placeholder="Search item, batch, reference, user…">
    <select id="type"><option value="">All types</option><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjust">Adjustments</option></select>
    <input type="date" id="from" title="From"><input type="date" id="to" title="To"></div><div id="list"></div>`;
  const load = async () => {
    const qs = new URLSearchParams({ q: $('#q').value, type: $('#type').value, from: $('#from').value, to: $('#to').value });
    $('#list').innerHTML = table(txCols, await api('/transactions?' + qs), 'No transactions found.');
  };
  $('#q').oninput = debounce(load);
  ['type', 'from', 'to'].forEach(id => $('#' + id).onchange = load);
  await load();
}

/* ---------- Suppliers ---------- */
async function pgSuppliers() {
  const list = await api('/suppliers');
  const edit = can('admin', 'pharmacist');
  $('#view').innerHTML = `${edit ? '<div class="toolbar"><button class="btn primary" id="add">+ Add supplier</button></div>' : ''}${table([
    { h: 'Supplier', f: s => `<strong>${esc(s.name)}</strong>` },
    { h: 'Contact person', f: s => esc(s.contactPerson) || '—' },
    { h: 'Phone', f: s => esc(s.phone) || '—' },
    { h: 'Email', f: s => esc(s.email) || '—' },
    { h: 'Address', f: s => esc(s.address) || '—' },
    { h: '', cls: 'actions', f: s => `${edit ? `<button class="btn sm" data-edit="${s._id}">Edit</button>` : ''}${can('admin') ? `<button class="btn sm danger" data-del="${s._id}">Delete</button>` : ''}` }
  ], list, 'No suppliers yet.')}`;
  const form = s => formModal({
    title: s ? 'Edit supplier' : 'Add supplier',
    fields: [
      { name: 'name', label: 'Supplier name', required: true, value: s?.name, full: true },
      { name: 'contactPerson', label: 'Contact person', value: s?.contactPerson },
      { name: 'phone', label: 'Phone', value: s?.phone },
      { name: 'email', label: 'Email', type: 'email', value: s?.email },
      { name: 'address', label: 'Address', value: s?.address }
    ],
    onSubmit: async d => { await api(s ? '/suppliers/' + s._id : '/suppliers', { method: s ? 'PUT' : 'POST', body: d }); toast('Saved', 'success'); refresh(); }
  });
  if ($('#add')) $('#add').onclick = () => form();
  $('#view').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) form(list.find(x => x._id === b.dataset.edit));
    if (b.dataset.del && confirmBox('Delete this supplier?')) {
      try { await api('/suppliers/' + b.dataset.del, { method: 'DELETE' }); toast('Deleted', 'success'); refresh(); } catch (err) { toast(err.message, 'error'); }
    }
  };
}

/* ---------- Categories ---------- */
async function pgCategories() {
  const list = await api('/categories');
  const edit = can('admin', 'pharmacist');
  $('#view').innerHTML = `${edit ? '<div class="toolbar"><button class="btn primary" id="add">+ Add category</button></div>' : ''}${table([
    { h: 'Category', f: c => `<strong>${esc(c.name)}</strong>` },
    { h: 'Applies to', f: c => ({ both: 'Medicines & supplies', medicine: 'Medicines', supply: 'Supplies' }[c.kind]) },
    { h: 'Description', f: c => esc(c.description) || '—' },
    { h: 'Items', cls: 'num', f: c => c.itemCount },
    { h: '', cls: 'actions', f: c => `${edit ? `<button class="btn sm" data-edit="${c._id}">Edit</button>` : ''}${can('admin') ? `<button class="btn sm danger" data-del="${c._id}">Delete</button>` : ''}` }
  ], list, 'No categories yet.')}`;
  const form = c => formModal({
    title: c ? 'Edit category' : 'Add category',
    fields: [
      { name: 'name', label: 'Category name', required: true, value: c?.name, full: true, placeholder: 'e.g. Antibiotics, Syringes' },
      { name: 'kind', label: 'Applies to', type: 'select', value: c?.kind || 'both', options: [{ value: 'both', label: 'Medicines & supplies' }, { value: 'medicine', label: 'Medicines only' }, { value: 'supply', label: 'Supplies only' }] },
      { name: 'description', label: 'Description', value: c?.description }
    ],
    onSubmit: async d => { await api(c ? '/categories/' + c._id : '/categories', { method: c ? 'PUT' : 'POST', body: d }); toast('Saved', 'success'); refresh(); }
  });
  if ($('#add')) $('#add').onclick = () => form();
  $('#view').onclick = async e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.edit) form(list.find(x => x._id === b.dataset.edit));
    if (b.dataset.del && confirmBox('Delete this category?')) {
      try { await api('/categories/' + b.dataset.del, { method: 'DELETE' }); toast('Deleted', 'success'); refresh(); } catch (err) { toast(err.message, 'error'); }
    }
  };
}

/* ---------- Reports ---------- */
const REPORTS = {
  stock: { title: 'Stock Report', url: () => '/reports/stock', cols: [
    { h: 'Code', f: i => esc(i.code) }, { h: 'Item', f: i => `${esc(i.name)}<span class="sub">${esc([i.genericName, i.strength].filter(Boolean).join(' · '))}</span>` },
    { h: 'Type', f: i => kindBadge(i.kind) }, { h: 'Category', f: i => esc(i.category) || '—' },
    { h: 'On hand', cls: 'num', f: i => `${i.onHand} ${esc(i.unit)}` }, { h: 'Usable', cls: 'num', f: i => i.available },
    { h: 'Reorder', cls: 'num', f: i => i.reorderLevel }, { h: 'Status', f: i => statusBadge(i.status) }] },
  low: { title: 'Low-Stock Report', url: () => '/reports/low-stock', cols: [
    { h: 'Code', f: i => esc(i.code) }, { h: 'Item', f: i => esc(i.name) }, { h: 'Type', f: i => kindBadge(i.kind) },
    { h: 'Usable', cls: 'num', f: i => `${i.available} ${esc(i.unit)}` }, { h: 'Reorder level', cls: 'num', f: i => i.reorderLevel },
    { h: 'To order (approx.)', cls: 'num', f: i => Math.max(i.reorderLevel * 2 - i.available, 0) }, { h: 'Status', f: i => statusBadge(i.status) }] },
  expiry: { title: 'Expiry Report', url: days => `/reports/expiry?days=${days}`, cols: [
    { h: 'Item', f: b => `${esc(b.item?.name)}<span class="sub">${esc(b.item?.code)}</span>` }, { h: 'Batch', f: b => esc(b.batchNo) },
    { h: 'Supplier', f: b => esc(b.supplier?.name) || '—' }, { h: 'Qty', cls: 'num', f: b => `${b.quantity} ${esc(b.item?.unit)}` }, { h: 'Expiry', f: expiryBadge }] },
  movement: { title: 'Movement Report', url: q => '/reports/movement?' + q, cols: txCols }
};
async function pgReports() {
  let tab = 'stock';
  $('#view').innerHTML = `
    <div class="tabs">${Object.entries(REPORTS).map(([k, r]) => `<button class="tab ${k === tab ? 'active' : ''}" data-tab="${k}">${r.title.replace(' Report', '')}</button>`).join('')}</div>
    <div class="toolbar" id="rfilters"></div>
    <div class="print-head"><h2>Hospital Pharmacy &amp; Medical Inventory</h2><div id="ptitle"></div></div>
    <div id="rbody"></div>`;
  const filters = () => {
    const f = $('#rfilters');
    f.innerHTML = tab === 'expiry'
      ? '<label style="margin:0">Show batches expiring within <select id="days" style="display:inline-block;width:auto"><option value="30">30 days</option><option value="60">60 days</option><option value="90" selected>90 days</option><option value="180">180 days</option><option value="365">1 year</option></select></label>'
      : tab === 'movement'
        ? '<select id="mtype"><option value="">All types</option><option value="in">Stock in</option><option value="out">Stock out</option><option value="adjust">Adjustments</option></select><input type="date" id="mfrom" title="From"><input type="date" id="mto" title="To">'
        : '';
    f.insertAdjacentHTML('beforeend', '<span class="spacer"></span><button class="btn primary" id="print">Print report</button>');
    $('#print').onclick = () => window.print();
    f.querySelectorAll('select,input').forEach(el => el.onchange = load);
  };
  const load = async () => {
    const r = REPORTS[tab];
    let arg = '';
    if (tab === 'expiry') arg = $('#days')?.value || 90;
    if (tab === 'movement') arg = new URLSearchParams({ type: $('#mtype')?.value || '', from: $('#mfrom')?.value || '', to: $('#mto')?.value || '' }).toString();
    const rows = await api(r.url(arg));
    $('#ptitle').innerHTML = `<strong>${r.title}</strong> — printed ${fmtDT(new Date())} by ${esc(state.user.fullName)}`;
    $('#rbody').innerHTML = table(r.cols, rows, 'Nothing to report.');
  };
  $('#view').querySelector('.tabs').onclick = e => {
    const b = e.target.closest('[data-tab]'); if (!b) return;
    tab = b.dataset.tab;
    document.querySelectorAll('.tab').forEach(x => x.classList.toggle('active', x === b));
    filters(); load();
  };
  filters(); await load();
}

/* ---------- Users (admin) ---------- */
async function pgUsers() {
  const users = await api('/users');
  $('#view').innerHTML = `<div class="toolbar"><button class="btn primary" id="add">+ Add user</button><span class="muted small">Self-registered accounts can log in immediately. Disable an account here if needed.</span></div>${table([
    { h: 'Name', f: u => `<strong>${esc(u.fullName)}</strong>` },
    { h: 'Username', f: u => esc(u.username) },
    { h: 'Role', f: u => ROLE_LABEL[u.role] },
    { h: 'Status', f: u => u.active ? '<span class="badge b-ok">Active</span>' : '<span class="badge b-low">Disabled</span>' },
    { h: '', cls: 'actions', f: u => `<button class="btn sm" data-toggle="${u.id}">${u.active ? 'Disable' : 'Activate'}</button><button class="btn sm" data-edit="${u.id}">Edit</button>${u.id !== state.user.id ? `<button class="btn sm danger" data-del="${u.id}">Delete</button>` : ''}` }
  ], users)}`;
  const roles = [{ value: 'staff', label: 'Inventory Staff' }, { value: 'pharmacist', label: 'Pharmacist' }, { value: 'admin', label: 'Administrator' }];
  $('#add').onclick = () => formModal({
    title: 'Add user',
    fields: [
      { name: 'fullName', label: 'Full name', required: true, full: true },
      { name: 'username', label: 'Username', required: true },
      { name: 'role', label: 'Role', type: 'select', options: roles },
      { name: 'password', label: 'Password (min 6)', type: 'password', required: true, full: true }
    ],
    onSubmit: async d => { await api('/users', { method: 'POST', body: d }); toast('User created', 'success'); refresh(); }
  });
  $('#view').onclick = async e => {
    const b = e.target.closest('button'); if (!b || b.id === 'add') return;
    const find = id => users.find(u => u.id === id);
    try {
      if (b.dataset.toggle) { const u = find(b.dataset.toggle); await api('/users/' + u.id, { method: 'PUT', body: { active: !u.active } }); refresh(); }
      if (b.dataset.del && confirmBox('Delete this user?')) { await api('/users/' + b.dataset.del, { method: 'DELETE' }); refresh(); }
      if (b.dataset.edit) {
        const u = find(b.dataset.edit);
        formModal({
          title: 'Edit user',
          fields: [
            { name: 'fullName', label: 'Full name', value: u.fullName, required: true, full: true },
            { name: 'role', label: 'Role', type: 'select', value: u.role, options: roles, full: true },
            { name: 'password', label: 'Reset password', type: 'password', full: true, hint: 'Leave blank to keep the current password' }
          ],
          onSubmit: async d => { if (!d.password) delete d.password; await api('/users/' + u.id, { method: 'PUT', body: d }); toast('Saved', 'success'); refresh(); }
        });
      }
    } catch (err) { toast(err.message, 'error'); }
  };
}

boot();
