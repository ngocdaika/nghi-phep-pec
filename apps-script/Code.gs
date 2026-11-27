/**
 * Dashboard nghỉ phép PEC — Backend (Google Apps Script)
 * Dán toàn bộ file này vào Extensions > Apps Script của Google Sheet dữ liệu,
 * chạy hàm setup() một lần, rồi Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone).
 */

var TZ = 'Asia/Ho_Chi_Minh';
var HEADERS = {
  NhanSu: ['MaNV', 'HoTen', 'Phong', 'ChucDanh', 'VaiTro', 'NguoiDuyet', 'PhepNam', 'PhepTon', 'PIN', 'TrangThai'],
  LoaiNghi: ['Ten', 'TruPhep', 'Mau'],
  NgayLe: ['Ngay', 'TenNgayLe'],
  DonNghi: ['ID', 'MaNV', 'HoTen', 'LoaiNghi', 'TuNgay', 'TuBuoi', 'DenNgay', 'DenBuoi', 'SoNgay', 'LyDo',
            'TrangThai', 'NguoiDuyet', 'NgayDuyet', 'GhiChuDuyet', 'NgayTao']
};
var ST = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' };
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
  // Cột ngày và PIN để dạng chữ, tránh Sheets tự đổi định dạng
  ss.getSheetByName('DonNghi').getRange('E:G').setNumberFormat('@');
  ss.getSheetByName('NhanSu').getRange('I:I').setNumberFormat('@');
  return 'OK';
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
    case 'login':     return { me: publicMe_(ctx) };
    case 'data':      return getData_(ctx);
    case 'create':    return withLock_(function () { return createLeave_(ctx, b.req || {}); });
    case 'decide':    return withLock_(function () { return decide_(ctx, b.id, b.decision, b.note); });
    case 'cancel':    return withLock_(function () { return cancel_(ctx, b.id); });
    case 'changePin': return withLock_(function () { return changePin_(ctx, b.newPin); });
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
    return {
      ma: String(r.MaNV).toUpperCase(), ten: String(r.HoTen), phong: String(r.Phong),
      chucDanh: String(r.ChucDanh), vaiTro: String(r.VaiTro || 'NhanVien'),
      nguoiDuyet: String(r.NguoiDuyet || '').toUpperCase(),
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

/* ---------- Đăng nhập & phân quyền ---------- */

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
  if (!me || me.pin !== pin || me.trangThai === 'Nghỉ việc') {
    cache.put(key, String(fails + 1), 600);
    throw new Error('Mã NV hoặc PIN không đúng');
  }
  cache.remove(key);
  return { me: me, staff: staff };
}

function publicMe_(ctx) {
  var me = ctx.me;
  return {
    ma: me.ma, ten: me.ten, phong: me.phong, chucDanh: me.chucDanh, vaiTro: me.vaiTro,
    isAdmin: me.vaiTro === 'Admin',
    isApprover: me.vaiTro === 'Admin' || ctx.staff.some(function (s) { return s.nguoiDuyet === me.ma; })
  };
}

function approverOf_(ctx, ma) {
  for (var i = 0; i < ctx.staff.length; i++) if (ctx.staff[i].ma === ma) return ctx.staff[i].nguoiDuyet;
  return '';
}

function canApprove_(ctx, req) {
  var approver = approverOf_(ctx, req.ma);
  if (approver === ctx.me.ma && req.ma !== ctx.me.ma) return true;
  return ctx.me.vaiTro === 'Admin' && (req.ma !== ctx.me.ma || !approver);
}

function canSeeReason_(ctx, req) {
  return req.ma === ctx.me.ma || ctx.me.vaiTro === 'Admin' || approverOf_(ctx, req.ma) === ctx.me.ma;
}

/* ---------- Thao tác ---------- */

function getData_(ctx) {
  var staff = ctx.staff.filter(function (s) { return s.trangThai !== 'Nghỉ việc'; }).map(function (s) {
    return { ma: s.ma, ten: s.ten, phong: s.phong, chucDanh: s.chucDanh, nguoiDuyet: s.nguoiDuyet,
             phepNam: s.phepNam, phepTon: s.phepTon };
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
  var person = null;
  ctx.staff.forEach(function (s) { if (s.ma === ma) person = s; });
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

  var autoApprove = !person.nguoiDuyet;
  var now = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm');
  var id = 'D' + Utilities.formatDate(new Date(), TZ, 'yyMMddHHmmss') + Math.floor(Math.random() * 900 + 100);
  var row = {
    ID: id, MaNV: ma, HoTen: person.ten, LoaiNghi: loai, TuNgay: r.tuNgay, TuBuoi: r.tuBuoi,
    DenNgay: r.denNgay, DenBuoi: r.denBuoi, SoNgay: total, LyDo: String(req.lyDo || '').slice(0, 500),
    TrangThai: autoApprove ? ST.APPROVED : ST.PENDING, NguoiDuyet: autoApprove ? '(tự động)' : '',
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

function setCells_(rowNum, values) {
  var t = table_('DonNghi');
  Object.keys(values).forEach(function (h) {
    var col = t.head.indexOf(h);
    if (col >= 0) t.sheet.getRange(rowNum, col + 1).setValue(values[h]);
  });
}

function decide_(ctx, id, decision, note) {
  var r = findReq_(id);
  if (!canApprove_(ctx, r)) throw new Error('Bạn không có quyền duyệt đơn này');
  if (r.trangThai === ST.CANCELLED) throw new Error('Đơn đã bị hủy');
  var st = decision === 'approve' ? ST.APPROVED : decision === 'reject' ? ST.REJECTED : null;
  if (!st) throw new Error('Quyết định không hợp lệ');
  setCells_(r._row, {
    TrangThai: st, NguoiDuyet: ctx.me.ten, GhiChuDuyet: String(note || '').slice(0, 300),
    NgayDuyet: Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')
  });
  return { id: r.id, trangThai: st };
}

function cancel_(ctx, id) {
  var r = findReq_(id);
  var own = r.ma === ctx.me.ma && r.trangThai === ST.PENDING;
  if (!own && !canApprove_(ctx, r)) throw new Error('Chỉ hủy được đơn của mình khi còn chờ duyệt');
  setCells_(r._row, {
    TrangThai: ST.CANCELLED,
    GhiChuDuyet: 'Hủy bởi ' + ctx.me.ten + ' lúc ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm')
  });
  return { id: r.id, trangThai: ST.CANCELLED };
}

function changePin_(ctx, newPin) {
  newPin = String(newPin || '').trim();
  if (!/^\d{4,8}$/.test(newPin)) throw new Error('PIN mới phải gồm 4–8 chữ số');
  var t = table_('NhanSu');
  var col = t.head.indexOf('PIN');
  var cell = t.sheet.getRange(ctx.me._row, col + 1);
  cell.setNumberFormat('@');
  cell.setValue(newPin);
  return { changed: true };
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
