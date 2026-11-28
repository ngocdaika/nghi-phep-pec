/**
 * Dashboard nghỉ phép PEC — Backend (Google Apps Script)
 * Dán toàn bộ file này vào Extensions > Apps Script của Google Sheet dữ liệu,
 * chạy hàm setup() một lần, rồi Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone).
 *
 * Vai trò (cột VaiTro):
 *   Admin    – toàn quyền, tab Quản trị: nhân sự, phân quyền, đặt lại PIN, loại nghỉ, ngày lễ
 *   GiamDoc  – duyệt mọi đơn, nâng/hạ tài khoản giữa Cá nhân và Phó Giám đốc
 *   PGD      – duyệt đơn của nhân viên thuộc các phòng ghi ở cột PhuTrach (cách nhau bằng dấu ;)
 *   NhanVien – cá nhân
 * PIN được lưu dạng mã hóa (h1$…). Ô PIN ghi số thường cũng được: lần đăng nhập đầu sẽ tự mã hóa.
 */

var TZ = 'Asia/Ho_Chi_Minh';
var HEADERS = {
  NhanSu: ['MaNV', 'HoTen', 'Phong', 'ChucDanh', 'VaiTro', 'PhuTrach', 'PhepNam', 'PhepTon', 'PIN', 'TrangThai'],
  LoaiNghi: ['Ten', 'TruPhep', 'Mau'],
  NgayLe: ['Ngay', 'TenNgayLe'],
  DonNghi: ['ID', 'MaNV', 'HoTen', 'LoaiNghi', 'TuNgay', 'TuBuoi', 'DenNgay', 'DenBuoi', 'SoNgay', 'LyDo',
            'TrangThai', 'NguoiDuyet', 'NgayDuyet', 'GhiChuDuyet', 'NgayTao']
};
var ST = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' };
var ROLES = { Admin: 'Quản trị', GiamDoc: 'Giám đốc', PGD: 'Phó Giám đốc', NhanVien: 'Cá nhân' };
var AUTO = '(tự động)';
var MAX_FAILS = 5;

/* ---------- Cài đặt ---------- */

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(HEADERS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) {
      sh.appendRow(HEADERS[name]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, HEADERS[name].length).setFontWeight('bold');
    }
  });
  ss.setSpreadsheetTimeZone(TZ);
  // Cột ngày và PIN để dạng chữ, tránh Sheets tự đổi định dạng
  ss.getSheetByName('DonNghi').getRange('E:G').setNumberFormat('@');
  ss.getSheetByName('NgayLe').getRange('A:A').setNumberFormat('@');
  ss.getSheetByName('NhanSu').getRange('I:I').setNumberFormat('@');
  var ns = ss.getSheetByName('NhanSu');
  ns.getRange('E2:E').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(ROLES), true).setAllowInvalid(false).build());
  ns.getRange('J2:J').setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Đang làm', 'Nghỉ việc'], true).setAllowInvalid(false).build());
  // Nạp dữ liệu ban đầu từ Seed.gs (nếu có) vào các tab còn trống
  if (typeof SEED !== 'undefined') {
    // Seed.gs chứa PIN đã mã hóa sẵn bằng muối của nó → dùng muối này khi bảng nhân sự còn trống
    if (SEED.PIN_SALT && !table_('NhanSu').rows.length)
      PropertiesService.getScriptProperties().setProperty('PIN_SALT', SEED.PIN_SALT);
    ['NhanSu', 'LoaiNghi', 'NgayLe'].forEach(function (name) {
      if (!table_(name).rows.length && SEED[name] && SEED[name].length) rewrite_(name, SEED[name]);
    });
  }
  salt_();
  // Mã hóa mọi PIN đang ghi dạng số thường
  var n = 0;
  staff_().forEach(function (s) {
    if (s.pin && s.pin.indexOf('h1$') !== 0) { writeStaff_(s._row, { PIN: hashPin_(s.ma, s.pin) }); n++; }
  });
  return 'OK – đã mã hóa ' + n + ' PIN';
}

/* ---------- HTTP ---------- */

function doGet() {
  return out_({ ok: true, app: 'nghi-phep-pec', time: new Date().toISOString() });
}

function doPost(e) {
  var body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return out_({ ok: false, error: 'Yêu cầu không hợp lệ' });
  }
  try {
    var result = route_(body);
    result.ok = true;
    return out_(result);
  } catch (err) {
    return out_({ ok: false, error: err.message || String(err) });
  }
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function route_(b) {
  var ctx = auth_(b);
  switch (b.action) {
    case 'login':        return { me: publicMe_(ctx) };
    case 'data':         return getData_(ctx);
    case 'create':       return withLock_(function () { return createLeave_(ctx, b.req || {}); });
    case 'decide':       return withLock_(function () { return decide_(ctx, b.id, b.decision, b.note); });
    case 'cancel':       return withLock_(function () { return cancel_(ctx, b.id); });
    case 'changePin':    return withLock_(function () { return changePin_(ctx, b.newPin); });
    case 'saveStaff':    return withLock_(function () { return saveStaff_(ctx, b.staff || {}, !!b.isNew); });
    case 'resetPin':     return withLock_(function () { return resetPin_(ctx, b.target); });
    case 'saveTypes':    return withLock_(function () { return saveTypes_(ctx, b.types || []); });
    case 'saveHolidays': return withLock_(function () { return saveHolidays_(ctx, b.holidays || []); });
    default: throw new Error('Thao tác không hỗ trợ: ' + b.action);
  }
}

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/* ---------- Đọc dữ liệu ---------- */

function norm_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, TZ, 'yyyy-MM-dd');
  if (v === null || v === undefined) return '';
  return typeof v === 'string' ? v.trim() : v;
}

function table_(name) {
  var sh = SpreadsheetApp.getActive().getSheetByName(name);
  if (!sh) throw new Error('Thiếu tab ' + name + '. Hãy chạy hàm setup().');
  var values = sh.getDataRange().getValues();
  var head = values[0].map(function (h) { return String(h).trim(); });
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (values[i].every(function (c) { return c === '' || c === null; })) continue;
    var o = { _row: i + 1 };
    head.forEach(function (h, j) { o[h] = norm_(values[i][j]); });
    rows.push(o);
  }
  return { sheet: sh, head: head, rows: rows };
}

function staff_() {
  return table_('NhanSu').rows.map(function (r) {
    var role = String(r.VaiTro || 'NhanVien');
    return {
      ma: String(r.MaNV).toUpperCase(), ten: String(r.HoTen), phong: String(r.Phong),
      chucDanh: String(r.ChucDanh), vaiTro: ROLES[role] ? role : 'NhanVien', phuTrach: String(r.PhuTrach || ''),
      phepNam: r.PhepNam === '' ? 12 : Number(r.PhepNam), phepTon: Number(r.PhepTon || 0),
      pin: String(r.PIN), trangThai: String(r.TrangThai || 'Đang làm'), _row: r._row
    };
  });
}

function types_() {
  return table_('LoaiNghi').rows.map(function (r) {
    return { ten: String(r.Ten), truPhep: /^c[oó]/i.test(String(r.TruPhep)), mau: String(r.Mau || '') };
  });
}

function holidays_() {
  return table_('NgayLe').rows.filter(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.Ngay); })
    .map(function (r) { return { ngay: r.Ngay, ten: String(r.TenNgayLe) }; });
}

function requests_() {
  return table_('DonNghi').rows.map(function (r) {
    return {
      id: String(r.ID), ma: String(r.MaNV).toUpperCase(), ten: String(r.HoTen), loai: String(r.LoaiNghi),
      tuNgay: r.TuNgay, tuBuoi: r.TuBuoi || 'Sáng', denNgay: r.DenNgay, denBuoi: r.DenBuoi || 'Chiều',
      soNgay: Number(r.SoNgay), lyDo: String(r.LyDo), trangThai: String(r.TrangThai),
      nguoiDuyet: String(r.NguoiDuyet), ngayDuyet: String(r.NgayDuyet), ghiChuDuyet: String(r.GhiChuDuyet),
      ngayTao: String(r.NgayTao), _row: r._row
    };
  });
}

/* ---------- PIN ---------- */

function salt_() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('PIN_SALT');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('PIN_SALT', s); }
  return s;
}

function hashPin_(ma, pin) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + '|' + ma + '|' + pin, Utilities.Charset.UTF_8);
  return 'h1$' + Utilities.base64Encode(bytes);
}

function newPin_() {
  return String(100000 + Math.floor(Math.random() * 900000));
}

/* ---------- Đăng nhập & phân quyền (giữ giống js/logic.js) ---------- */

function auth_(b) {
  var ma = String(b.ma || '').trim().toUpperCase();
  var pin = String(b.pin || '').trim();
  if (!ma || !pin) throw new Error('Thiếu Mã NV hoặc PIN');
  var cache = CacheService.getScriptCache();
  var key = 'fail_' + ma;
  var fails = Number(cache.get(key) || 0);
  if (fails >= MAX_FAILS) throw new Error('Nhập sai PIN quá ' + MAX_FAILS + ' lần. Vui lòng thử lại sau 10 phút.');
  var staff = staff_();
  var me = null;
  for (var i = 0; i < staff.length; i++) if (staff[i].ma === ma) me = staff[i];
  var hashed = me && me.pin.indexOf('h1$') === 0;
  var ok = me && me.trangThai !== 'Nghỉ việc' && (hashed ? me.pin === hashPin_(ma, pin) : me.pin === pin);
  if (!ok) {
    cache.put(key, String(fails + 1), 600);
    throw new Error('Mã NV hoặc PIN không đúng');
  }
  cache.remove(key);
  if (!hashed) withLock_(function () { writeStaff_(me._row, { PIN: hashPin_(ma, pin) }); });
  return { me: me, staff: staff };
}

function phuTrachList_(s) {
  return String((s && s.phuTrach) || '').split(';').map(function (x) { return x.trim(); }).filter(Boolean);
}
function covers_(pgd, phong) { return pgd.vaiTro === 'PGD' && phuTrachList_(pgd).indexOf(phong) >= 0; }
function needsApproval_(p) { return p.vaiTro === 'NhanVien' || p.vaiTro === 'PGD'; }
function isApprover_(me) {
  return me.vaiTro === 'Admin' || me.vaiTro === 'GiamDoc' || (me.vaiTro === 'PGD' && phuTrachList_(me).length > 0);
}
function primaryApprovers_(staff, p) {
  if (!needsApproval_(p)) return [];
  var active = staff.filter(function (s) { return s.trangThai !== 'Nghỉ việc' && s.ma !== p.ma; });
  if (p.vaiTro === 'NhanVien') {
    var a = active.filter(function (s) { return covers_(s, p.phong); });
    if (a.length) return a;
  }
  var g = active.filter(function (s) { return s.vaiTro === 'GiamDoc'; });
  if (g.length) return g;
  return active.filter(function (s) { return s.vaiTro === 'Admin'; });
}
function canApprovePerson_(viewer, requester) {
  if (!viewer || !requester || viewer.ma === requester.ma) return false;
  if (viewer.vaiTro === 'Admin') return true;
  if (!needsApproval_(requester)) return false;
  if (viewer.vaiTro === 'GiamDoc') return true;
  return requester.vaiTro === 'NhanVien' && covers_(viewer, requester.phong);
}
function canSeeReasonPerson_(viewer, requester) {
  return !!viewer && !!requester && (viewer.ma === requester.ma || viewer.vaiTro === 'GiamDoc' || canApprovePerson_(viewer, requester));
}

function personOf_(ctx, ma) {
  for (var i = 0; i < ctx.staff.length; i++) if (ctx.staff[i].ma === ma) return ctx.staff[i];
  return null;
}
function canApprove_(ctx, req) { return canApprovePerson_(ctx.me, personOf_(ctx, req.ma)); }
function canSeeReason_(ctx, req) { return canSeeReasonPerson_(ctx.me, personOf_(ctx, req.ma)); }

function publicMe_(ctx) {
  var me = ctx.me;
  return {
    ma: me.ma, ten: me.ten, phong: me.phong, chucDanh: me.chucDanh, vaiTro: me.vaiTro, phuTrach: me.phuTrach,
    isAdmin: me.vaiTro === 'Admin', isApprover: isApprover_(me),
    canManage: me.vaiTro === 'Admin' || me.vaiTro === 'GiamDoc'
  };
}

function requireAdmin_(ctx) {
  if (ctx.me.vaiTro !== 'Admin') throw new Error('Chỉ quản trị viên được làm thao tác này');
}

/* ---------- Thao tác ---------- */

function getData_(ctx) {
  var manage = ctx.me.vaiTro === 'Admin' || ctx.me.vaiTro === 'GiamDoc';
  var staff = ctx.staff.filter(function (s) { return manage || s.trangThai !== 'Nghỉ việc'; }).map(function (s) {
    return { ma: s.ma, ten: s.ten, phong: s.phong, chucDanh: s.chucDanh, vaiTro: s.vaiTro, phuTrach: s.phuTrach,
             phepNam: s.phepNam, phepTon: s.phepTon, trangThai: s.trangThai };
  });
  var reqs = requests_().filter(function (r) {
    if (r.trangThai === ST.CANCELLED) return false;
    if (r.trangThai === ST.REJECTED) return r.ma === ctx.me.ma || canApprove_(ctx, r);
    return true;
  }).map(function (r) {
    var o = {};
    for (var k in r) if (k !== '_row') o[k] = r[k];
    if (!canSeeReason_(ctx, r)) { o.lyDo = ''; o.ghiChuDuyet = ''; }
    o.canApprove = canApprove_(ctx, r);
    return o;
  });
  return { me: publicMe_(ctx), staff: staff, types: types_(), holidays: holidays_(), requests: reqs };
}

function createLeave_(ctx, req) {
  var ma = String(req.ma || ctx.me.ma).toUpperCase();
  if (ma !== ctx.me.ma && ctx.me.vaiTro !== 'Admin') throw new Error('Bạn chỉ được khai nghỉ cho chính mình');
  var person = personOf_(ctx, ma);
  if (!person) throw new Error('Không tìm thấy nhân sự ' + ma);

  var loai = String(req.loai || '').trim();
  if (!loai) throw new Error('Chưa nhập loại nghỉ');
  var r = { tuNgay: String(req.tuNgay || ''), tuBuoi: req.tuBuoi === 'Chiều' ? 'Chiều' : 'Sáng',
            denNgay: String(req.denNgay || ''), denBuoi: req.denBuoi === 'Sáng' ? 'Sáng' : 'Chiều' };
  var err = validateRange(r);
  if (err) throw new Error(err);

  var hset = {};
  holidays_().forEach(function (h) { hset[h.ngay] = true; });
  var days = expandLeave(r, hset);
  if (!days.length) throw new Error('Khoảng thời gian này không có ngày làm việc (chỉ gồm chủ nhật / ngày lễ)');
  var total = days.reduce(function (a, d) { return a + d.v; }, 0);

  // Không cho trùng với đơn khác của cùng người
  var mine = {};
  requests_().forEach(function (x) {
    if (x.ma !== ma || x.trangThai === ST.REJECTED || x.trangThai === ST.CANCELLED) return;
    expandLeave(x, hset).forEach(function (d) { mine[d.d] = (mine[d.d] || []).concat(d.part); });
  });
  days.forEach(function (d) {
    var ex = mine[d.d];
    if (!ex) return;
    if (d.part === 'full' || ex.indexOf('full') >= 0 || ex.indexOf(d.part) >= 0)
      throw new Error('Trùng với đơn nghỉ đã có ngày ' + d.d);
  });

  var autoApprove = primaryApprovers_(ctx.staff, person).length === 0;
  var now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var id = 'D' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + Math.floor(Math.random() * 900 + 100);
  var row = {
    ID: id, MaNV: ma, HoTen: person.ten, LoaiNghi: loai, TuNgay: r.tuNgay, TuBuoi: r.tuBuoi,
    DenNgay: r.denNgay, DenBuoi: r.denBuoi, SoNgay: total, LyDo: String(req.lyDo || '').slice(0, 500),
    TrangThai: autoApprove ? ST.APPROVED : ST.PENDING, NguoiDuyet: autoApprove ? AUTO : '',
    NgayDuyet: autoApprove ? now : '', GhiChuDuyet: '', NgayTao: now
  };
  var t = table_('DonNghi');
  t.sheet.appendRow(t.head.map(function (h) { return row[h] !== undefined ? row[h] : ''; }));
  return { id: id, soNgay: total, trangThai: row.TrangThai };
}

function findReq_(id) {
  var list = requests_();
  for (var i = 0; i < list.length; i++) if (list[i].id === String(id)) return list[i];
  throw new Error('Không tìm thấy đơn ' + id);
}

function setCells_(sheetName, rowNum, values) {
  var t = table_(sheetName);
  Object.keys(values).forEach(function (h) {
    var col = t.head.indexOf(h);
    if (col < 0) return;
    var cell = t.sheet.getRange(rowNum, col + 1);
    if (h === 'PIN') cell.setNumberFormat('@');
    cell.setValue(values[h]);
  });
}
function writeStaff_(rowNum, values) { setCells_('NhanSu', rowNum, values); }

function decide_(ctx, id, decision, note) {
  var r = findReq_(id);
  if (!canApprove_(ctx, r)) throw new Error('Bạn không có quyền duyệt đơn này');
  if (r.trangThai === ST.CANCELLED) throw new Error('Đơn đã bị hủy');
  var st = decision === 'approve' ? ST.APPROVED : decision === 'reject' ? ST.REJECTED : null;
  if (!st) throw new Error('Quyết định không hợp lệ');
  setCells_('DonNghi', r._row, {
    TrangThai: st, NguoiDuyet: ctx.me.ten, GhiChuDuyet: String(note || '').slice(0, 300),
    NgayDuyet: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')
  });
  return { id: r.id, trangThai: st };
}

function cancel_(ctx, id) {
  var r = findReq_(id);
  var own = r.ma === ctx.me.ma && (r.trangThai === ST.PENDING || r.nguoiDuyet === AUTO);
  if (!own && !canApprove_(ctx, r)) throw new Error('Chỉ hủy được đơn của mình khi còn chờ duyệt');
  setCells_('DonNghi', r._row, {
    TrangThai: ST.CANCELLED,
    GhiChuDuyet: 'Hủy bởi ' + ctx.me.ten + ' lúc ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')
  });
  return { id: r.id, trangThai: ST.CANCELLED };
}

function changePin_(ctx, newPin) {
  newPin = String(newPin || '').trim();
  if (!/^\d{4,8}$/.test(newPin)) throw new Error('PIN mới phải gồm 4–8 chữ số');
  writeStaff_(ctx.me._row, { PIN: hashPin_(ctx.me.ma, newPin) });
  return { changed: true };
}

/* ---------- Quản trị ---------- */

function cleanPhuTrach_(v) {
  var list = Array.isArray(v) ? v : String(v || '').split(';');
  return list.map(function (x) { return String(x).trim(); }).filter(Boolean).join('; ');
}

function saveStaff_(ctx, d, isNew) {
  var me = ctx.me;
  if (me.vaiTro !== 'Admin' && me.vaiTro !== 'GiamDoc') throw new Error('Bạn không có quyền quản lý tài khoản');
  var ma = String(d.ma || '').trim().toUpperCase();
  if (!/^[A-Z0-9_.-]{2,20}$/.test(ma)) throw new Error('Mã NV chỉ gồm chữ không dấu, số; 2–20 ký tự');
  var target = personOf_(ctx, ma);
  var role = String(d.vaiTro || 'NhanVien');
  if (!ROLES[role]) throw new Error('Vai trò không hợp lệ');

  if (me.vaiTro === 'GiamDoc') {
    if (isNew || !target) throw new Error('Chỉ quản trị viên được thêm nhân sự');
    if (target.vaiTro !== 'NhanVien' && target.vaiTro !== 'PGD') throw new Error('Giám đốc chỉ điều chỉnh tài khoản Cá nhân và Phó Giám đốc');
    if (role !== 'NhanVien' && role !== 'PGD') throw new Error('Giám đốc chỉ nâng lên Phó Giám đốc hoặc hạ về Cá nhân');
    writeStaff_(target._row, { VaiTro: role, PhuTrach: role === 'PGD' ? cleanPhuTrach_(d.phuTrach) : '' });
    return { saved: ma };
  }

  // Admin
  var ten = String(d.ten || '').trim();
  if (!ten) throw new Error('Chưa nhập họ tên');
  var trangThai = d.trangThai === 'Nghỉ việc' ? 'Nghỉ việc' : 'Đang làm';
  var values = {
    HoTen: ten, Phong: String(d.phong || '').trim(), ChucDanh: String(d.chucDanh || '').trim(), VaiTro: role,
    PhuTrach: role === 'PGD' ? cleanPhuTrach_(d.phuTrach) : '',
    PhepNam: d.phepNam === '' || d.phepNam == null ? 12 : Number(d.phepNam), PhepTon: Number(d.phepTon || 0),
    TrangThai: trangThai
  };
  if (isNaN(values.PhepNam) || isNaN(values.PhepTon)) throw new Error('Số ngày phép không hợp lệ');
  var admins = ctx.staff.filter(function (s) { return s.vaiTro === 'Admin' && s.trangThai !== 'Nghỉ việc' && s.ma !== ma; });
  if (!admins.length && (role !== 'Admin' || trangThai === 'Nghỉ việc')) throw new Error('Phải còn ít nhất một tài khoản Quản trị');

  if (isNew) {
    if (target) throw new Error('Mã NV ' + ma + ' đã tồn tại');
    var pin = newPin_();
    values.MaNV = ma;
    values.PIN = hashPin_(ma, pin);
    var t = table_('NhanSu');
    t.sheet.appendRow(t.head.map(function (h) { return values[h] !== undefined ? values[h] : ''; }));
    return { saved: ma, pin: pin };
  }
  if (!target) throw new Error('Không tìm thấy nhân sự ' + ma);
  writeStaff_(target._row, values);
  return { saved: ma };
}

function resetPin_(ctx, targetMa) {
  requireAdmin_(ctx);
  var target = personOf_(ctx, String(targetMa || '').toUpperCase());
  if (!target) throw new Error('Không tìm thấy nhân sự');
  var pin = newPin_();
  writeStaff_(target._row, { PIN: hashPin_(target.ma, pin) });
  CacheService.getScriptCache().remove('fail_' + target.ma);
  return { ma: target.ma, pin: pin };
}

function rewrite_(sheetName, rows) {
  var t = table_(sheetName);
  var last = t.sheet.getLastRow();
  if (last > 1) t.sheet.getRange(2, 1, last - 1, t.head.length).clearContent();
  if (rows.length) {
    var range = t.sheet.getRange(2, 1, rows.length, t.head.length);
    range.setNumberFormat('@');
    range.setValues(rows.map(function (o) { return t.head.map(function (h) { return o[h] !== undefined ? o[h] : ''; }); }));
  }
}

function saveTypes_(ctx, list) {
  requireAdmin_(ctx);
  var seen = {}, rows = [];
  list.forEach(function (x) {
    var ten = String(x.ten || '').trim();
    if (!ten || seen[ten]) return;
    seen[ten] = 1;
    var mau = /^#[0-9a-f]{6}$/i.test(String(x.mau)) ? String(x.mau).toUpperCase() : '#64748B';
    rows.push({ Ten: ten.slice(0, 60), TruPhep: x.truPhep ? 'Có' : 'Không', Mau: mau });
  });
  if (!rows.length) throw new Error('Cần ít nhất một loại nghỉ');
  rewrite_('LoaiNghi', rows);
  return { saved: rows.length };
}

function saveHolidays_(ctx, list) {
  requireAdmin_(ctx);
  var seen = {}, rows = [];
  list.forEach(function (x) {
    var d = String(x.ngay || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || seen[d]) return;
    seen[d] = 1;
    rows.push({ Ngay: d, TenNgayLe: String(x.ten || '').trim().slice(0, 80) });
  });
  rows.sort(function (a, b) { return a.Ngay < b.Ngay ? -1 : 1; });
  rewrite_('NgayLe', rows);
  return { saved: rows.length };
}

/* ---------- Tính ngày nghỉ (giống js/logic.js phía giao diện) ---------- */

function parseYMD(s) {
  var p = String(s).split('-');
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
}

function fmtYMD(d) {
  return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
}

function validateRange(r) {
  var re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(r.tuNgay) || !re.test(r.denNgay)) return 'Ngày không hợp lệ';
  if (r.denNgay < r.tuNgay) return 'Ngày kết thúc phải sau ngày bắt đầu';
  if (r.tuNgay === r.denNgay && r.tuBuoi === 'Chiều' && r.denBuoi === 'Sáng') return 'Buổi kết thúc phải sau buổi bắt đầu';
  if ((parseYMD(r.denNgay) - parseYMD(r.tuNgay)) / 86400000 > 366) return 'Một đơn không quá 1 năm';
  return '';
}

/** Trả về các ngày nghỉ thực tế: [{d:'yyyy-mm-dd', v:1|0.5, part:'full'|'am'|'pm'}]. Bỏ chủ nhật và ngày lễ. */
function expandLeave(r, holidaySet) {
  var out = [];
  var d = parseYMD(r.tuNgay), end = parseYMD(r.denNgay);
  while (d <= end) {
    var s = fmtYMD(d);
    if (d.getUTCDay() !== 0 && !holidaySet[s]) {
      var am = !(s === r.tuNgay && r.tuBuoi === 'Chiều');
      var pm = !(s === r.denNgay && r.denBuoi === 'Sáng');
      if (am || pm) out.push({ d: s, v: am && pm ? 1 : 0.5, part: am && pm ? 'full' : (am ? 'am' : 'pm') });
    }
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}
