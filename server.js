require('dotenv').config();
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const M = require('./models');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    'Referrer-Policy': 'same-origin'
  });
  next();
});

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.DB_NAME || 'medilink_lab_dev'; 
const FAR_FUTURE = new Date('9999-12-31');

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const bad = msg => new HttpError(400, msg);
const num = v => (v === '' || v === null || v === undefined ? NaN : Number(v));
const str = v => (v === undefined || v === null ? '' : String(v).trim());
const isId = v => mongoose.Types.ObjectId.isValid(v);

/* ---------------- Auth ---------------- */
const attempts = new Map();
function tooManyAttempts(key) {
  const now = Date.now();
  const list = (attempts.get(key) || []).filter(t => now - t < 15 * 60 * 1000);
  attempts.set(key, list);
  return list.length >= 10;
}
const noteAttempt = key => attempts.set(key, [...(attempts.get(key) || []), Date.now()]);

const signToken = u => jwt.sign({ id: u._id, role: u.role }, JWT_SECRET, { expiresIn: '12h' });
const publicUser = u => ({ id: u._id, fullName: u.fullName, username: u.username, role: u.role, active: u.active, hasSecurity: !!u.securityAnswerHash });
const normAnswer = v => str(v).toLowerCase().replace(/\s+/g, ' ');

const auth = wrap(async (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) throw new HttpError(401, 'Please log in.');
  let payload;
  try { payload = jwt.verify(token, JWT_SECRET); } catch { throw new HttpError(401, 'Session expired. Please log in again.'); }
  const user = await M.User.findById(payload.id);
  if (!user || !user.active) throw new HttpError(401, 'Account not available.');
  req.user = user;
  next();
});
const allow = (...roles) => (req, res, next) =>
  roles.includes(req.user.role) ? next() : next(new HttpError(403, 'Your role is not allowed to do this.'));
const ADMIN = 'admin', PHARM = 'pharmacist', STAFF = 'staff';

app.get('/health', (req, res) => res.json({ ok: true, db: mongoose.connection.readyState === 1 }));

app.post('/api/auth/login', wrap(async (req, res) => {
  const username = str(req.body.username).toLowerCase();
  const key = `${req.ip}:${username}`;
  if (tooManyAttempts(key)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  const user = await M.User.findOne({ username });
  const ok = user && await bcrypt.compare(str(req.body.password), user.passwordHash);
  if (!ok) { noteAttempt(key); throw new HttpError(401, 'Wrong username or password.'); }
  if (!user.active) throw new HttpError(403, 'Your account has been disabled. Please contact the administrator.');
  res.json({ token: signToken(user), user: publicUser(user) });
}));

app.post('/api/auth/register', wrap(async (req, res) => {
  const fullName = str(req.body.fullName), username = str(req.body.username).toLowerCase(), password = str(req.body.password);
  const role = [PHARM, STAFF].includes(req.body.role) ? req.body.role : STAFF;
  if (!fullName || !username) throw bad('Full name and username are required.');
  if (!/^[a-z0-9._-]{3,30}$/.test(username)) throw bad('Username: 3-30 letters, numbers, dot, dash or underscore.');
  if (password.length < 6) throw bad('Password must be at least 6 characters.');
  if (await M.User.findOne({ username })) throw bad('That username is already taken.');
  const q = str(req.body.securityQuestion), a = normAnswer(req.body.securityAnswer);
  if (!q) throw bad('Please choose a security question (used to recover your account).');
  if (a.length < 2) throw bad('Please answer your security question.');
  await M.User.create({ fullName, username, role, active: true, passwordHash: await bcrypt.hash(password, 10),
    securityQuestion: q, securityAnswerHash: await bcrypt.hash(a, 10) });
  res.json({ message: 'Registration successful! You can log in now.' });
}));

app.get('/api/auth/me', auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.post('/api/auth/password', auth, wrap(async (req, res) => {
  const { current, next: np } = req.body;
  if (!(await bcrypt.compare(str(current), req.user.passwordHash))) throw bad('Current password is wrong.');
  if (str(np).length < 6) throw bad('New password must be at least 6 characters.');
  req.user.passwordHash = await bcrypt.hash(str(np), 10);
  await req.user.save();
  res.json({ ok: true });
}));

/* ---- Account recovery (forgot password) ---- */
app.post('/api/auth/recover/question', wrap(async (req, res) => {
  const username = str(req.body.username).toLowerCase();
  const key = `rq:${req.ip}`;
  if (tooManyAttempts(key)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  noteAttempt(key);
  const user = await M.User.findOne({ username });
  if (!user || !user.active) throw bad('No active account found with that username.');
  if (!user.securityQuestion || !user.securityAnswerHash)
    throw bad('This account has no security question yet. Please ask the administrator to reset your password.');
  res.json({ question: user.securityQuestion });
}));

app.post('/api/auth/recover/reset', wrap(async (req, res) => {
  const username = str(req.body.username).toLowerCase();
  const key = `rr:${req.ip}:${username}`;
  if (tooManyAttempts(key)) throw new HttpError(429, 'Too many attempts. Try again in 15 minutes.');
  const np = str(req.body.newPassword);
  if (np.length < 6) throw bad('New password must be at least 6 characters.');
  const user = await M.User.findOne({ username });
  const ok = user && user.active && user.securityAnswerHash && await bcrypt.compare(normAnswer(req.body.answer), user.securityAnswerHash);
  if (!ok) { noteAttempt(key); throw bad('Incorrect answer. Please try again.'); }
  user.passwordHash = await bcrypt.hash(np, 10);
  await user.save();
  res.json({ message: 'Password reset successful! You can log in with your new password.' });
}));

app.post('/api/auth/security', auth, wrap(async (req, res) => {
  if (!(await bcrypt.compare(str(req.body.current), req.user.passwordHash))) throw bad('Current password is wrong.');
  const q = str(req.body.securityQuestion), a = normAnswer(req.body.securityAnswer);
  if (!q) throw bad('Please choose a security question.');
  if (a.length < 2) throw bad('Please enter an answer.');
  req.user.securityQuestion = q;
  req.user.securityAnswerHash = await bcrypt.hash(a, 10);
  await req.user.save();
  res.json({ ok: true });
}));

/* ---------------- Users (admin) ---------------- */
app.get('/api/users', auth, allow(ADMIN), wrap(async (req, res) => {
  const users = await M.User.find().sort({ createdAt: -1 });
  res.json(users.map(publicUser));
}));
app.post('/api/users', auth, allow(ADMIN), wrap(async (req, res) => {
  const { fullName, role } = req.body;
  const username = str(req.body.username).toLowerCase(), password = str(req.body.password);
  if (!str(fullName) || !username) throw bad('Full name and username are required.');
  if (password.length < 6) throw bad('Password must be at least 6 characters.');
  if (!['admin', 'pharmacist', 'staff'].includes(role)) throw bad('Invalid role.');
  if (await M.User.findOne({ username })) throw bad('That username is already taken.');
  const u = await M.User.create({ fullName: str(fullName), username, role, active: true, passwordHash: await bcrypt.hash(password, 10) });
  res.json(publicUser(u));
}));
app.put('/api/users/:id', auth, allow(ADMIN), wrap(async (req, res) => {
  const u = await M.User.findById(req.params.id);
  if (!u) throw new HttpError(404, 'User not found.');
  const isSelf = String(u._id) === String(req.user._id);
  if (req.body.fullName) u.fullName = str(req.body.fullName);
  if (req.body.role && ['admin', 'pharmacist', 'staff'].includes(req.body.role)) {
    if (isSelf && req.body.role !== ADMIN) throw bad('You cannot remove your own admin role.');
    u.role = req.body.role;
  }
  if (typeof req.body.active === 'boolean') {
    if (isSelf && !req.body.active) throw bad('You cannot deactivate yourself.');
    u.active = req.body.active;
  }
  if (req.body.password) {
    if (str(req.body.password).length < 6) throw bad('Password must be at least 6 characters.');
    u.passwordHash = await bcrypt.hash(str(req.body.password), 10);
  }
  await u.save();
  res.json(publicUser(u));
}));
app.delete('/api/users/:id', auth, allow(ADMIN), wrap(async (req, res) => {
  if (String(req.params.id) === String(req.user._id)) throw bad('You cannot delete yourself.');
  await M.User.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

/* ---------------- Stock helpers ---------------- */
async function stockMap(itemIds) {
  const now = new Date();
  const match = { quantity: { $gt: 0 } };
  if (itemIds) match.item = { $in: itemIds };
  const exp = { $ifNull: ['$expiryDate', FAR_FUTURE] };
  const rows = await M.Batch.aggregate([
    { $match: match },
    { $group: {
      _id: '$item',
      total: { $sum: '$quantity' },
      available: { $sum: { $cond: [{ $gt: [exp, now] }, '$quantity', 0] } },
      expired: { $sum: { $cond: [{ $lte: [exp, now] }, '$quantity', 0] } },
      nearest: { $min: '$expiryDate' }
    } }
  ]);
  const map = new Map();
  rows.forEach(r => map.set(String(r._id), r));
  return map;
}
function withStock(item, map) {
  const s = map.get(String(item._id)) || { total: 0, available: 0, expired: 0, nearest: null };
  const o = item.toObject ? item.toObject() : item;
  const status = s.total === 0 ? 'out' : s.available === 0 ? 'expired' : s.available <= o.reorderLevel ? 'low' : 'ok';
  return { ...o, onHand: s.total, available: s.available, expiredQty: s.expired, nearestExpiry: s.nearest, status };
}
async function nextCode(kind) {
  const prefix = kind === 'medicine' ? 'MED' : 'SUP';
  let n = await M.Item.countDocuments({ kind }) + 1;
  for (;;) {
    const code = `${prefix}-${String(n).padStart(4, '0')}`;
    if (!(await M.Item.exists({ code }))) return code;
    n++;
  }
}
function parseDate(v, label, required) {
  if (!v) { if (required) throw bad(`${label} is required.`); return null; }
  const d = new Date(v);
  if (isNaN(d)) throw bad(`${label} is not a valid date.`);
  return d;
}
const logTx = (data, user) => M.Transaction.create({ ...data, user: user._id, userName: user.fullName });

/* ---------------- Categories ---------------- */
app.get('/api/categories', auth, wrap(async (req, res) => {
  const [cats, counts] = await Promise.all([
    M.Category.find().sort({ name: 1 }).lean(),
    M.Item.aggregate([{ $group: { _id: '$category', n: { $sum: 1 } } }])
  ]);
  const cm = new Map(counts.map(c => [c._id, c.n]));
  res.json(cats.map(c => ({ ...c, itemCount: cm.get(c.name) || 0 })));
}));
app.post('/api/categories', auth, allow(ADMIN, PHARM), wrap(async (req, res) => {
  if (!str(req.body.name)) throw bad('Category name is required.');
  if (await M.Category.findOne({ name: str(req.body.name) })) throw bad('Category already exists.');
  res.json(await M.Category.create({ name: str(req.body.name), kind: req.body.kind || 'both', description: str(req.body.description) }));
}));
app.put('/api/categories/:id', auth, allow(ADMIN, PHARM), wrap(async (req, res) => {
  const c = await M.Category.findById(req.params.id);
  if (!c) throw new HttpError(404, 'Category not found.');
  const oldName = c.name;
  if (str(req.body.name)) c.name = str(req.body.name);
  if (req.body.kind) c.kind = req.body.kind;
  c.description = str(req.body.description);
  await c.save();
  if (oldName !== c.name) await M.Item.updateMany({ category: oldName }, { category: c.name });
  res.json(c);
}));
app.delete('/api/categories/:id', auth, allow(ADMIN), wrap(async (req, res) => {
  const c = await M.Category.findById(req.params.id);
  if (c && await M.Item.exists({ category: c.name })) throw bad('Category is used by items. Change those items first.');
  await M.Category.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

/* ---------------- Suppliers ---------------- */
app.get('/api/suppliers', auth, wrap(async (req, res) => res.json(await M.Supplier.find().sort({ name: 1 }))));
app.post('/api/suppliers', auth, allow(ADMIN, PHARM), wrap(async (req, res) => {
  const b = req.body;
  if (!str(b.name)) throw bad('Supplier name is required.');
  if (await M.Supplier.findOne({ name: str(b.name) })) throw bad('Supplier already exists.');
  res.json(await M.Supplier.create({ name: str(b.name), contactPerson: str(b.contactPerson), phone: str(b.phone), email: str(b.email), address: str(b.address) }));
}));
app.put('/api/suppliers/:id', auth, allow(ADMIN, PHARM), wrap(async (req, res) => {
  const b = req.body;
  const s = await M.Supplier.findById(req.params.id);
  if (!s) throw new HttpError(404, 'Supplier not found.');
  Object.assign(s, { name: str(b.name) || s.name, contactPerson: str(b.contactPerson), phone: str(b.phone), email: str(b.email), address: str(b.address) });
  await s.save();
  res.json(s);
}));
app.delete('/api/suppliers/:id', auth, allow(ADMIN), wrap(async (req, res) => {
  if (await M.Batch.exists({ supplier: req.params.id })) throw bad('This supplier has received stock records and cannot be deleted.');
  await M.Supplier.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

/* ---------------- Items (medicines & supplies) ---------------- */
app.get('/api/items', auth, wrap(async (req, res) => {
  const filter = {};
  if (['medicine', 'supply'].includes(req.query.kind)) filter.kind = req.query.kind;
  if (req.query.q) {
    const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ name: rx }, { code: rx }, { genericName: rx }, { category: rx }];
  }
  const items = await M.Item.find(filter).sort({ name: 1 });
  const map = await stockMap(items.map(i => i._id));
  let list = items.map(i => withStock(i, map));
  if (req.query.status) list = list.filter(i => i.status === req.query.status);
  res.json(list);
}));

function itemFields(b) {
  const kind = b.kind === 'supply' ? 'supply' : 'medicine';
  const reorder = num(b.reorderLevel);
  if (!str(b.name)) throw bad('Name is required.');
  if (isNaN(reorder) || reorder < 0) throw bad('Reorder level must be 0 or more.');
  return {
    kind, name: str(b.name), category: str(b.category), unit: str(b.unit) || 'pcs', reorderLevel: reorder,
    genericName: kind === 'medicine' ? str(b.genericName) : '',
    strength: kind === 'medicine' ? str(b.strength) : '',
    dosageForm: kind === 'medicine' ? str(b.dosageForm) : ''
  };
}
app.post('/api/items', auth, allow(ADMIN, PHARM), wrap(async (req, res) => {
  const f = itemFields(req.body);
  f.code = str(req.body.code).toUpperCase() || await nextCode(f.kind);
  if (await M.Item.exists({ code: f.code })) throw bad(`Code ${f.code} is already used.`);
  res.json(await M.Item.create(f));
}));
app.put('/api/items/:id', auth, allow(ADMIN, PHARM), wrap(async (req, res) => {
  const item = await M.Item.findById(req.params.id);
  if (!item) throw new HttpError(404, 'Item not found.');
  const f = itemFields({ ...req.body, kind: item.kind });
  const code = str(req.body.code).toUpperCase() || item.code;
  if (code !== item.code && await M.Item.exists({ code })) throw bad(`Code ${code} is already used.`);
  Object.assign(item, f, { code });
  await item.save();
  res.json(item);
}));
app.delete('/api/items/:id', auth, allow(ADMIN), wrap(async (req, res) => {
  if (await M.Transaction.exists({ item: req.params.id })) throw bad('This item has transaction history and cannot be deleted (history must be preserved).');
  await M.Batch.deleteMany({ item: req.params.id });
  await M.Item.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
}));

app.get('/api/batches', auth, wrap(async (req, res) => {
  const filter = {};
  if (req.query.item && isId(req.query.item)) filter.item = req.query.item;
  if (req.query.all !== '1') filter.quantity = { $gt: 0 };
  const batches = await M.Batch.find(filter).populate('item', 'code name kind unit').populate('supplier', 'name').sort({ expiryDate: 1 }).lean();
  const now = new Date();
  res.json(batches.map(b => ({ ...b, expired: !!b.expiryDate && b.expiryDate <= now })));
}));

/* ---------------- Transactions ---------------- */
app.post('/api/transactions/in', auth, allow(ADMIN, PHARM, STAFF), wrap(async (req, res) => {
  const b = req.body;
  const item = isId(b.item) && await M.Item.findById(b.item);
  if (!item) throw bad('Please choose an item.');
  const qty = num(b.quantity);
  if (!(qty > 0)) throw bad('Quantity must be greater than 0.');
  const date = parseDate(b.date, 'Date', false) || new Date();
  const expiry = parseDate(b.expiryDate, 'Expiry date', item.kind === 'medicine');
  const batchNo = str(b.batchNo) || (item.kind === 'medicine' ? '' : 'GENERAL');
  if (!batchNo) throw bad('Batch number is required for medicines.');
  const supplier = b.supplier && isId(b.supplier) ? await M.Supplier.findById(b.supplier) : null;

  let batch = await M.Batch.findOne({ item: item._id, batchNo });
  if (batch) {
    const same = (!batch.expiryDate && !expiry) || (batch.expiryDate && expiry && batch.expiryDate.getTime() === expiry.getTime());
    if (!same) throw bad(`Batch ${batchNo} already exists with a different expiry date.`);
    batch.quantity += qty;
    if (supplier) batch.supplier = supplier._id;
    await batch.save();
  } else {
    batch = await M.Batch.create({ item: item._id, batchNo, expiryDate: expiry, quantity: qty, supplier: supplier ? supplier._id : null, receivedDate: date });
  }
  const tx = await logTx({
    type: 'in', item: item._id, itemCode: item.code, itemName: item.name, batch: batch._id, batchNo,
    quantity: qty, change: qty, date, reference: str(b.reference), supplierName: supplier ? supplier.name : ''
  }, req.user);
  res.json(tx);
}));

app.post('/api/transactions/out', auth, allow(ADMIN, PHARM, STAFF), wrap(async (req, res) => {
  const b = req.body;
  const item = isId(b.item) && await M.Item.findById(b.item);
  if (!item) throw bad('Please choose an item.');
  const qty = num(b.quantity);
  if (!(qty > 0)) throw bad('Quantity must be greater than 0.');
  const date = parseDate(b.date, 'Date', false) || new Date();
  const now = new Date();

  const filter = { item: item._id, quantity: { $gt: 0 }, $or: [{ expiryDate: null }, { expiryDate: { $gt: now } }] };
  if (b.batch && isId(b.batch)) filter._id = b.batch;
  // First-Expired-First-Out: earliest expiry first, batches without expiry last
  const batches = (await M.Batch.find(filter)).sort((x, y) =>
    (x.expiryDate ? x.expiryDate.getTime() : Infinity) - (y.expiryDate ? y.expiryDate.getTime() : Infinity));
  const available = batches.reduce((s, x) => s + x.quantity, 0);
  if (qty > available) throw bad(`Not enough usable stock. Available (not expired): ${available} ${item.unit}.`);

  let need = qty;
  const applied = [];
  try {
    for (const bt of batches) {
      if (need <= 0) break;
      const take = Math.min(bt.quantity, need);
      const r = await M.Batch.updateOne({ _id: bt._id, quantity: { $gte: take } }, { $inc: { quantity: -take } });
      if (!r.modifiedCount) throw bad('Stock changed while saving. Please try again.');
      applied.push({ bt, take });
      need -= take;
    }
    if (need > 0) throw bad('Stock changed while saving. Please try again.');
  } catch (e) {
    for (const a of applied) await M.Batch.updateOne({ _id: a.bt._id }, { $inc: { quantity: a.take } });
    throw e;
  }
  const txs = [];
  for (const a of applied) {
    txs.push(await logTx({
      type: 'out', item: item._id, itemCode: item.code, itemName: item.name, batch: a.bt._id, batchNo: a.bt.batchNo,
      quantity: a.take, change: -a.take, date, reference: str(b.reference)
    }, req.user));
  }
  res.json({ issued: qty, batchesUsed: applied.map(a => ({ batchNo: a.bt.batchNo, qty: a.take })), transactions: txs.length });
}));

app.post('/api/transactions/adjust', auth, allow(ADMIN, PHARM), wrap(async (req, res) => {
  const b = req.body;
  const batch = isId(b.batch) && await M.Batch.findById(b.batch).populate('item');
  if (!batch) throw bad('Please choose a batch.');
  const newQty = num(b.newQuantity);
  if (isNaN(newQty) || newQty < 0) throw bad('New quantity must be 0 or more.');
  if (!str(b.reason)) throw bad('A reason is required for adjustments.');
  const change = newQty - batch.quantity;
  if (change === 0) throw bad('The quantity is unchanged.');
  batch.quantity = newQty;
  await batch.save();
  const tx = await logTx({
    type: 'adjust', item: batch.item._id, itemCode: batch.item.code, itemName: batch.item.name, batch: batch._id,
    batchNo: batch.batchNo, quantity: Math.abs(change), change, date: new Date(), reason: str(b.reason), reference: str(b.reference)
  }, req.user);
  res.json(tx);
}));

function txFilter(q) {
  const f = {};
  if (['in', 'out', 'adjust'].includes(q.type)) f.type = q.type;
  if (q.item && isId(q.item)) f.item = q.item;
  if (q.from || q.to) {
    f.date = {};
    if (q.from) f.date.$gte = new Date(q.from);
    if (q.to) { const t = new Date(q.to); t.setHours(23, 59, 59, 999); f.date.$lte = t; }
  }
  if (q.q) {
    const rx = new RegExp(String(q.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    f.$or = [{ itemName: rx }, { itemCode: rx }, { batchNo: rx }, { reference: rx }, { userName: rx }];
  }
  return f;
}
app.get('/api/transactions', auth, wrap(async (req, res) => {
  res.json(await M.Transaction.find(txFilter(req.query)).sort({ date: -1, createdAt: -1 }).limit(500).lean());
}));

/* ---------------- Dashboard & reports ---------------- */
const NEAR_DAYS = 90;
app.get('/api/dashboard', auth, wrap(async (req, res) => {
  const now = new Date();
  const near = new Date(now.getTime() + NEAR_DAYS * 86400000);
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const week = new Date(startToday.getTime() - 6 * 86400000);

  const [items, supplierCount, nearBatches, expiredBatches, recent, weekTx, todayCount] = await Promise.all([
    M.Item.find().lean(),
    M.Supplier.countDocuments(),
    M.Batch.find({ quantity: { $gt: 0 }, expiryDate: { $gt: now, $lte: near } }).populate('item', 'code name unit').sort({ expiryDate: 1 }).lean(),
    M.Batch.find({ quantity: { $gt: 0 }, expiryDate: { $lte: now, $ne: null } }).populate('item', 'code name unit').lean(),
    M.Transaction.find().sort({ createdAt: -1 }).limit(8).lean(),
    M.Transaction.find({ date: { $gte: week }, type: { $in: ['in', 'out'] } }).lean(),
    M.Transaction.countDocuments({ date: { $gte: startToday } })
  ]);
  const map = await stockMap();
  const stocked = items.map(i => withStock(i, map));
  const low = stocked.filter(i => i.status === 'low' || i.status === 'out');

  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(week.getTime() + i * 86400000);
    days.push({ date: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-US', { weekday: 'short' }), in: 0, out: 0 });
  }
  weekTx.forEach(t => {
    const k = new Date(t.date);
    const key = new Date(k.getFullYear(), k.getMonth(), k.getDate());
    const idx = Math.round((key - week) / 86400000);
    if (days[idx]) days[idx][t.type] += t.quantity;
  });

  res.json({
    totals: {
      medicines: items.filter(i => i.kind === 'medicine').length,
      supplies: items.filter(i => i.kind === 'supply').length,
      suppliers: supplierCount,
      lowStock: low.length,
      nearExpiry: nearBatches.length,
      expired: expiredBatches.length,
      transactionsToday: todayCount
    },
    lowItems: low.slice(0, 6),
    nearBatches: nearBatches.slice(0, 6),
    expiredBatches: expiredBatches.slice(0, 6),
    recent, days
  });
}));

app.get('/api/reports/stock', auth, wrap(async (req, res) => {
  const items = await M.Item.find().sort({ kind: 1, name: 1 });
  const map = await stockMap();
  res.json(items.map(i => withStock(i, map)));
}));
app.get('/api/reports/low-stock', auth, wrap(async (req, res) => {
  const items = await M.Item.find().sort({ name: 1 });
  const map = await stockMap();
  res.json(items.map(i => withStock(i, map)).filter(i => i.status === 'low' || i.status === 'out' || i.status === 'expired'));
}));
app.get('/api/reports/expiry', auth, wrap(async (req, res) => {
  const days = Math.min(Math.max(parseInt(req.query.days) || NEAR_DAYS, 1), 3650);
  const limit = new Date(Date.now() + days * 86400000);
  const batches = await M.Batch.find({ quantity: { $gt: 0 }, expiryDate: { $ne: null, $lte: limit } })
    .populate('item', 'code name unit kind').populate('supplier', 'name').sort({ expiryDate: 1 }).lean();
  const now = new Date();
  res.json(batches.map(b => ({ ...b, expired: b.expiryDate <= now })));
}));
app.get('/api/reports/movement', auth, wrap(async (req, res) => {
  res.json(await M.Transaction.find(txFilter(req.query)).sort({ date: -1, createdAt: -1 }).limit(2000).lean());
}));

/* ---------------- Static front-end & errors ---------------- */
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => { // eslint-disable-line
  if (err.code === 11000) return res.status(400).json({ error: 'That value already exists.' });
  if (err.name === 'CastError' || err.name === 'ValidationError') return res.status(400).json({ error: err.message });
  const status = err.status || 500;
  if (status === 500) console.error(err);
  res.status(status).json({ error: status === 500 ? 'Server error. Please try again.' : err.message });
});

/* ---------------- Start ---------------- */
async function seedAdmin() {
  if (await M.User.countDocuments() > 0) return;
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'Admin@123';
  await M.User.create({ fullName: 'System Administrator', username, role: 'admin', active: true, passwordHash: await bcrypt.hash(password, 10) });
  console.log(`First run: admin account created -> username: ${username}  password: ${password}`);
}

async function start() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI is missing. Copy .env.example to .env and fill it in.');
    process.exit(1);
  }
  try {
    await mongoose.connect(MONGODB_URI, { dbName: DB_NAME, serverSelectionTimeoutMS: 15000 });
    console.log(`Connected to MongoDB Atlas (database: ${DB_NAME})`);
  } catch (e) {
    console.error('\nCould not connect to MongoDB Atlas:', e.message);
    console.error('Check: (1) password in MONGODB_URI, (2) Atlas > Network Access allows your IP / 0.0.0.0/0, (3) internet connection.\n');
    process.exit(1);
  }
  await seedAdmin();
  app.listen(PORT, '0.0.0.0', () => console.log(`Pharmacy & Medical Inventory running on port ${PORT}  ->  http://localhost:${PORT}`));
}
start();
