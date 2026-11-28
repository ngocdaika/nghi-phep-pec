/**
 * Dashboard nghỉ phép PEC — Backend (Google Apps Script)
 * Dán toàn bộ file này vào Extensions > Apps Script của Google Sheet dữ liệu,
 * chạy hàm setup() một lần, rồi Deploy > New deployment > Web app
 * (Execute as: Me, Who has access: Anyone).
 *
 * Vai trò (cột VaiTro):
 *   Admin    – toàn quyền, tab Quản trị: nhân sự, phân quyền, đặt lại PIN, loại nghỉ, ngày lễ
 *   GiamDoc     – duyệt mọi đơn, đổi vai trò giữa Nhân viên, Trưởng/Phó phòng và Phó Giám đốc
 *   PGD         – duyệt đơn của nhân sự thuộc các phòng ghi ở cột PhuTrach (cách nhau bằng dấu ;)
 *   TruongPhong – Trưởng/Phó phòng: như nhân viên, được xem tổng kết của mọi người
 *   NhanVien    – cá nhân, chỉ xem lịch và tổng kết của mình (máy chủ không gửi đơn của người khác)
 * Không quản lý phép năm. Loại nghỉ (tab LoaiNghi): TinhNghi = Không cho loại không tính là nghỉ (VD: Công tác).
 * Mã nhân sự dạng tên.họđệm viết thường (VD: Nguyễn Hoàng Khánh Ngọc → ngoc.nhk), trùng thì thêm số (ngoc.nhk2).
 * Mật khẩu mặc định 123456; đăng nhập bằng mật khẩu mặc định thì bắt buộc đổi ngay, chưa đổi thì không xem được gì.
 * Đăng nhập xong máy chủ cấp mã phiên có ký (12 giờ, hoặc 30 ngày nếu chọn "Giữ đăng nhập"); trình duyệt không lưu mật khẩu.
 * Đổi mật khẩu → mọi phiên cũ trên các máy khác hết hiệu lực.
 * Nâng cấp file dữ liệu cũ (mã NS01…): chạy hàm capNhatV3() một lần.
 * Mật khẩu (cột PIN) lưu dạng mã hóa: h1$… = mật khẩu riêng; d1$… = mật khẩu mặc định, bắt buộc đổi khi đăng nhập.
 * Mật khẩu mới được phép trùng 123456 (khi đó không bị hỏi lại). Ô PIN ghi chữ/số thường cũng được: lần đăng nhập đầu tự mã hóa.
 * Nâng cấp lên cách đánh dấu d1$: chạy capNhatV4() một lần.
 * Bản demo (?demo=1) đọc họ tên/phòng/chức danh từ tab NhanSu. Tắt: Project Settings > Script Properties, thêm DEMO = off.
 */

var TZ = 'Asia/Ho_Chi_Minh';
var HEADERS = {
  NhanSu: ['MaNV', 'HoTen', 'Phong', 'ChucDanh', 'VaiTro', 'PhuTrach', 'PIN', 'TrangThai'],
  LoaiNghi: ['Ten', 'TinhNghi', 'Mau'],
  NgayLe: ['Ngay', 'TenNgayLe'],
  DonNghi: ['ID', 'MaNV', 'HoTen', 'LoaiNghi', 'TuNgay', 'TuBuoi', 'DenNgay', 'DenBuoi', 'SoNgay', 'LyDo',
            'TrangThai', 'NguoiDuyet', 'NgayDuyet', 'GhiChuDuyet', 'NgayTao']
};
var ST = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' };
var ROLES = { Admin: 'Quản trị', GiamDoc: 'Giám đốc', PGD: 'Phó Giám đốc', TruongPhong: 'Trưởng/Phó phòng', NhanVien: 'Nhân viên' };
var GD_ROLES = ['NhanVien', 'TruongPhong', 'PGD'];
var DEFAULT_TYPES = [
  { Ten: 'Nghỉ phép', TinhNghi: 'Có', Mau: '#0093DD' },
  { Ten: 'Công tác', TinhNghi: 'Không', Mau: '#10B981' },
  { Ten: 'Nghỉ không lương', TinhNghi: 'Có', Mau: '#F97316' }
];
var AUTO = '(tự động)';
var MAX_FAILS = 5;          // sai 5 lần → khóa tài khoản đó 15 phút
var LOCK_SECONDS = 900;
var GLOBAL_FAILS_10M = 30;  // cả hệ thống sai quá 30 lần / 10 phút → tạm dừng đăng nhập 10 phút
var GLOBAL_FAILS_6H = 200;  // cả hệ thống sai quá 200 lần / 6 giờ → tạm dừng 1 giờ
var MAX_PENDING = 30;       // số đơn chờ duyệt tối đa của một người
var DEFAULT_PIN = '123456'; // mật khẩu khi tạo / đặt lại tài khoản – lưu dạng d1$…, bắt buộc đổi ở lần đăng nhập đầu
var SESSION_HOURS = 12;     // phiên thường
var REMEMBER_DAYS = 30;     // phiên "Giữ đăng nhập 30 ngày"
var MSG_SESSION = 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
var MSG_MUST_CHANGE = 'Bạn cần đổi mật khẩu mặc định trước khi sử dụng.';

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
  formatStaffColumns_();
  // Nạp dữ liệu ban đầu từ Seed.gs (nếu có) vào các tab còn trống
  if (typeof SEED !== 'undefined') {
    // Seed.gs chứa PIN đã mã hóa sẵn bằng muối của nó → dùng muối này khi bảng nhân sự còn trống
    if (SEED.PIN_SALT && !table_('NhanSu').rows.length)
      PropertiesService.getScriptProperties().setProperty('PIN_SALT', SEED.PIN_SALT);
    ['NhanSu', 'LoaiNghi', 'NgayLe'].forEach(function (name) {
      if (!table_(name).rows.length && SEED[name] && SEED[name].length) rewrite_(name, SEED[name]);
    });
  }
  if (!table_('LoaiNghi').rows.length) rewrite_('LoaiNghi', DEFAULT_TYPES);
  salt_();
  tokenKey_();
  // Mã hóa mọi PIN đang ghi dạng số thường
  var n = 0;
  staff_().forEach(function (s) {
    if (s.pin && !isHashed_(s.pin)) { writeStaff_(s._row, { PIN: s.pin === DEFAULT_PIN ? defaultHash_(s.ma) : hashPin_(s.ma, s.pin) }); n++; }
  });
  return 'OK – đã mã hóa ' + n + ' PIN';
}

/* ---------- HTTP ---------- */

/** Định dạng cột PIN, ô chọn vai trò và trạng thái theo tên cột (file cũ có thể khác vị trí cột) */
function formatStaffColumns_() {
  var sh = SpreadsheetApp.getActive().getSheetByName('NhanSu');
  var head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  var col = function (name) { return head.indexOf(name) + 1; };
  var rows = Math.max(sh.getMaxRows() - 1, 1);
  if (col('PIN')) sh.getRange(2, col('PIN'), rows, 1).setNumberFormat('@');
  if (col('VaiTro')) sh.getRange(2, col('VaiTro'), rows, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(ROLES), true).setAllowInvalid(false).build());
  if (col('TrangThai')) sh.getRange(2, col('TrangThai'), rows, 1).setDataValidation(SpreadsheetApp.newDataValidation()
    .requireValueInList(['Đang làm', 'Nghỉ việc'], true).setAllowInvalid(false).build());
}

/**
 * Nâng cấp file dữ liệu tạo trước bản 28/11/2026 (chạy một lần trong trình soạn Apps Script):
 *  - Thêm vai trò TruongPhong; ai đang là NhanVien có chức danh Trưởng phòng / Phó Trưởng phòng / Trưởng bộ phận → TruongPhong
 *  - Tab LoaiNghi: thay bằng 3 loại Nghỉ phép, Công tác, Nghỉ không lương (cột TinhNghi thay TruPhep)
 *  - Bỏ hai cột PhepNam, PhepTon (không quản lý phép năm)
 * Đơn nghỉ cũ giữ nguyên.
 */
function capNhatV2() {
  var ss = SpreadsheetApp.getActive();
  var ns = ss.getSheetByName('NhanSu');
  // Xóa cột phép năm
  ['PhepTon', 'PhepNam'].forEach(function (name) {
    var head = ns.getRange(1, 1, 1, ns.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
    var c = head.indexOf(name);
    if (c >= 0) ns.deleteColumn(c + 1);
  });
  ns.getDataRange().clearDataValidations();
  formatStaffColumns_();
  var n = 0;
  staff_().forEach(function (s) {
    if (s.vaiTro === 'NhanVien' && /^(trưởng|phó trưởng)/i.test(s.chucDanh.trim())) {
      writeStaff_(s._row, { VaiTro: 'TruongPhong' }); n++;
    }
  });
  // Loại nghỉ
  var lt = ss.getSheetByName('LoaiNghi');
  lt.getRange(1, 1, 1, 3).setValues([HEADERS.LoaiNghi]).setFontWeight('bold');
  if (lt.getLastColumn() > 3) lt.deleteColumns(4, lt.getLastColumn() - 3);
  rewrite_('LoaiNghi', DEFAULT_TYPES);
  return 'OK – ' + n + ' tài khoản chuyển sang Trưởng/Phó phòng; loại nghỉ: Nghỉ phép, Công tác, Nghỉ không lương';
}

/**
 * Nâng cấp lên mã nhân sự dạng tên.họđệm (chạy một lần; chạy lại không đổi gì thêm):
 *  - Nếu file còn cấu trúc cũ (cột PhepNam / TruPhep) thì chạy capNhatV2() trước
 *  - Mã dạng NS01, NS02… → tên.họđệm; mật khẩu đặt về 123456 (bắt buộc đổi khi đăng nhập lần đầu)
 *  - Tài khoản khác (VD: ADMIN) giữ mật khẩu, chỉ đổi mã sang chữ thường
 *  - Cột MaNV trong tab DonNghi đổi theo
 */
function capNhatV3() {
  var ss = SpreadsheetApp.getActive();
  var headOf = function (name) {
    var sh = ss.getSheetByName(name);
    return sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(function (h) { return String(h).trim(); });
  };
  var v2 = '';
  if (headOf('NhanSu').indexOf('PhepNam') >= 0 || headOf('LoaiNghi').indexOf('TruPhep') >= 0) v2 = capNhatV2() + '\n';
  tokenKey_();
  var t = table_('NhanSu');
  var cMa = t.head.indexOf('MaNV') + 1, cPin = t.head.indexOf('PIN') + 1;
  var rows = t.rows.map(function (r) { return { row: r._row, raw: String(r.MaNV), ma: normMa_(r.MaNV), ten: String(r.HoTen) }; });
  var taken = {};
  rows.forEach(function (r) { if (!/^ns\d+$/.test(r.ma)) taken[r.ma] = 1; });
  var map = {}, list = [];
  rows.forEach(function (r) {
    if (/^ns\d+$/.test(r.ma)) {
      var nm = makeMa_(r.ten, taken);
      map[r.ma] = nm;
      t.sheet.getRange(r.row, cMa).setValue(nm);
      t.sheet.getRange(r.row, cPin).setNumberFormat('@').setValue(defaultHash_(nm));
      list.push(r.ma.toUpperCase() + ' → ' + nm);
    } else if (r.raw !== r.ma) {
      t.sheet.getRange(r.row, cMa).setValue(r.ma); // chữ thường, mật khẩu giữ nguyên (mã hóa không phân biệt hoa thường)
    }
  });
  var d = table_('DonNghi'), cD = d.head.indexOf('MaNV') + 1, nd = 0;
  d.rows.forEach(function (r) {
    var o = normMa_(r.MaNV);
    if (map[o]) { d.sheet.getRange(r._row, cD).setValue(map[o]); nd++; }
  });
  log_('Chuyển ' + list.length + ' mã nhân sự sang dạng tên.họđệm, mật khẩu đặt về mặc định', '');
  return v2 + 'OK – đổi ' + list.length + ' mã, cập nhật ' + nd + ' đơn nghỉ.\n' + list.join('\n');
}

/** Bỏ dấu tiếng Việt */
function boDau_(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
}
/** Mã nhân sự từ họ tên: tên + '.' + chữ đầu của họ và tên đệm. Trùng thì thêm số 2, 3… */
function makeMa_(ten, taken) {
  var w = boDau_(ten).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
  if (!w.length) w = ['nv'];
  var base = w[w.length - 1] + (w.length > 1 ? '.' + w.slice(0, -1).map(function (x) { return x[0]; }).join('') : '');
  var ma = base, i = 2;
  while (taken[ma]) ma = base + (i++);
  taken[ma] = 1;
  return ma;
}
function normMa_(v) { return String(v == null ? '' : v).trim().toLowerCase().slice(0, 30); }

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
  if (b.action === 'demoStaff') return demoStaff_();
  var ctx = auth_(b);
  if (ctx.mustChange && b.action !== 'login' && b.action !== 'changePin') throw new Error(MSG_MUST_CHANGE);
  switch (b.action) {
    case 'login': {
      var o = { me: publicMe_(ctx), mustChange: !!ctx.mustChange };
      if (!ctx.mustChange) { var tk = makeToken_(ctx.me, !!b.remember); o.token = tk.token; o.exp = tk.exp; }
      return o;
    }
    case 'data':         return getData_(ctx);
    case 'create':       return withLock_(function () { return createLeave_(ctx, b.req || {}); });
    case 'decide':       return withLock_(function () { return decide_(ctx, b.id, b.decision, b.note); });
    case 'cancel':       return withLock_(function () { return cancel_(ctx, b.id); });
    case 'changePin':    return changePin_(ctx, b.newPin, b.oldPin, !!b.remember);
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
      ma: normMa_(r.MaNV), ten: String(r.HoTen), phong: String(r.Phong),
      chucDanh: String(r.ChucDanh), vaiTro: ROLES[role] ? role : 'NhanVien', phuTrach: String(r.PhuTrach || ''),
      pin: String(r.PIN), trangThai: String(r.TrangThai || 'Đang làm'), _row: r._row
    };
  });
}

function types_() {
  return table_('LoaiNghi').rows.map(function (r) {
    var ten = String(r.Ten);
    // TinhNghi = Không → không cộng vào tổng ngày nghỉ (VD: Công tác). File cũ chưa có cột này thì đoán theo tên.
    var tinh = r.TinhNghi !== undefined ? !/^kh/i.test(String(r.TinhNghi)) : !/công tác/i.test(ten);
    var mau = String(r.Mau || '');
    return { ten: ten, tinhNghi: tinh, mau: /^#[0-9a-f]{6}$/i.test(mau) ? mau : '#64748B' };
  });
}

function holidays_() {
  return table_('NgayLe').rows.filter(function (r) { return /^\d{4}-\d{2}-\d{2}$/.test(r.Ngay); })
    .map(function (r) { return { ngay: r.Ngay, ten: String(r.TenNgayLe) }; });
}

function requests_() {
  return table_('DonNghi').rows.map(function (r) {
    return {
      id: String(r.ID), ma: normMa_(r.MaNV), ten: String(r.HoTen), loai: String(r.LoaiNghi),
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

/** Mã hóa mật khẩu. Mã NV viết hoa khi băm để mật khẩu cũ (tạo lúc mã còn viết hoa) vẫn dùng được. */
function hashPin_(ma, pin) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt_() + '|' + String(ma).toUpperCase() + '|' + pin, Utilities.Charset.UTF_8);
  return 'h1$' + Utilities.base64Encode(bytes);
}
/** Mật khẩu mặc định 123456, đánh dấu d1$ = bắt buộc đổi khi đăng nhập */
function defaultHash_(ma) { return 'd1$' + hashPin_(ma, DEFAULT_PIN).slice(3); }
function isHashed_(v) { return /^[hd]1\$/.test(v); }
function mustChange_(p) { return p.pin.indexOf('d1$') === 0 || p.pin === DEFAULT_PIN; }
function pinMatches_(p, pin) {
  if (isHashed_(p.pin)) return p.pin.slice(3) === hashPin_(p.ma, pin).slice(3);
  return p.pin !== '' && p.pin === pin;
}

/**
 * Chạy một lần sau khi cập nhật bản 28/11 (tối): tài khoản còn mật khẩu mặc định 123456 dạng h1$ → d1$
 * để vẫn bị bắt đổi khi đăng nhập (từ bản này người dùng được phép tự chọn lại 123456 mà không bị hỏi lại).
 */
function capNhatV4() {
  var n = 0;
  withLock_(function () {
    staff_().forEach(function (s) {
      if (s.pin.indexOf('h1$') === 0 && s.pin === hashPin_(s.ma, DEFAULT_PIN)) { writeStaff_(s._row, { PIN: defaultHash_(s.ma) }); n++; }
    });
  });
  log_('Đánh dấu ' + n + ' tài khoản còn mật khẩu mặc định (d1$)', '');
  return 'OK – ' + n + ' tài khoản';
}

/* ---------- Mã phiên đăng nhập: v1~ma~hạn~nhớ~chữ ký HMAC (ký kèm mật khẩu đã mã hóa → đổi mật khẩu là phiên cũ hết hiệu lực) ---------- */

function tokenKey_() {
  var p = PropertiesService.getScriptProperties();
  var k = p.getProperty('TOKEN_KEY');
  if (!k) { k = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('TOKEN_KEY', k); }
  return k;
}
function sign_(s) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(s, tokenKey_(), Utilities.Charset.UTF_8)).replace(/=+$/, '');
}
function makeToken_(me, remember) {
  var exp = Date.now() + (remember ? REMEMBER_DAYS * 86400000 : SESSION_HOURS * 3600000);
  var body = 'v1~' + me.ma + '~' + exp.toString(36) + '~' + (remember ? 1 : 0);
  return { token: body + '~' + sign_(body + '~' + me.pin), exp: exp, remember: !!remember };
}
function verifyToken_(tok, staff) {
  var p = String(tok || '').slice(0, 200).split('~');
  if (p.length !== 5 || p[0] !== 'v1') return null;
  var exp = parseInt(p[2], 36);
  if (!(exp > Date.now())) return null;
  var me = null;
  for (var i = 0; i < staff.length; i++) if (staff[i].ma === p[1]) me = staff[i];
  if (!me || me.trangThai === 'Nghỉ việc' || !me.pin) return null;
  var want = sign_(p.slice(0, 4).join('~') + '~' + me.pin), diff = want.length ^ p[4].length;
  for (var j = 0; j < want.length; j++) diff |= want.charCodeAt(j) ^ p[4].charCodeAt(j);
  return diff === 0 ? me : null;
}

/* ---------- Đăng nhập & phân quyền (giữ giống js/logic.js) ---------- */

function auth_(b) {
  if (b.token) {
    var all = staff_();
    var who = verifyToken_(b.token, all);
    if (!who) throw new Error(MSG_SESSION);
    return { me: who, staff: all, viaToken: true };
  }
  var ma = normMa_(b.ma);
  var pin = String(b.pin || '').trim().slice(0, 40);
  if (!ma || !pin) throw new Error('Thiếu Mã NV hoặc mật khẩu');
  checkPin_(ma, pin);
  var staff = staff_();
  var me = null;
  for (var i = 0; i < staff.length; i++) if (staff[i].ma === ma) me = staff[i];
  return { me: me, staff: staff, mustChange: mustChange_(me) };
}

/** Kiểm tra mật khẩu, có đếm số lần sai. Giữ chỗ một lần thử TRƯỚC khi kiểm tra → gửi song song cũng không vượt quá MAX_FAILS */
function checkPin_(ma, pin) {
  reserveAttempt_(ma);
  var me = null;
  staff_().forEach(function (s) { if (s.ma === ma) me = s; });
  var hashed = me && isHashed_(me.pin);
  var ok = !!me && me.trangThai !== 'Nghỉ việc' && pinMatches_(me, pin);
  if (!ok) {
    recordFail_(ma);
    throw new Error('Mã NV hoặc mật khẩu không đúng');
  }
  releaseAttempt_(ma);
  if (!hashed) withLock_(function () { writeStaff_(me._row, { PIN: pin === DEFAULT_PIN ? defaultHash_(ma) : hashPin_(ma, pin) }); });
}

/** Bản demo: chỉ họ tên, phòng, chức danh, vai trò của người đang làm (không có mã, mật khẩu, đơn nghỉ) */
function demoStaff_() {
  if (String(PropertiesService.getScriptProperties().getProperty('DEMO') || '').toLowerCase() === 'off') throw new Error('Bản demo đang tắt');
  return {
    staff: staff_().filter(function (s) { return s.trangThai !== 'Nghỉ việc' && s.vaiTro !== 'Admin' && s.phong; })
      .map(function (s) { return { ten: s.ten, phong: s.phong, chucDanh: s.chucDanh, vaiTro: s.vaiTro, phuTrach: s.phuTrach }; })
  };
}

/* Bộ đếm sai PIN. Mọi thao tác đọc-ghi bộ đếm nằm trong khóa để không bị vượt qua bằng yêu cầu song song. */
function reserveAttempt_(ma) {
  withLock_(function () {
    var c = CacheService.getScriptCache();
    var v = c.getAll(['glock', 'try_' + ma]);
    if (v.glock) throw new Error('Hệ thống tạm dừng đăng nhập do có nhiều lần nhập sai mật khẩu. Vui lòng thử lại sau.');
    var n = Number(v['try_' + ma] || 0);
    if (n >= MAX_FAILS) throw new Error('Nhập sai mật khẩu quá ' + MAX_FAILS + ' lần. Vui lòng thử lại sau 15 phút.');
    c.put('try_' + ma, String(n + 1), LOCK_SECONDS);
  });
}
function releaseAttempt_(ma) {
  withLock_(function () {
    var c = CacheService.getScriptCache();
    var n = Number(c.get('try_' + ma) || 0);
    if (n > 1) c.put('try_' + ma, String(n - 1), LOCK_SECONDS); else c.remove('try_' + ma);
  });
}
function recordFail_(ma) {
  withLock_(function () {
    var c = CacheService.getScriptCache();
    var v = c.getAll(['g10', 'g6h', 'try_' + ma]);
    var g10 = Number(v.g10 || 0) + 1, g6h = Number(v.g6h || 0) + 1;
    c.put('g10', String(g10), 600);
    c.put('g6h', String(g6h), 21600);
    if (Number(v['try_' + ma] || 0) >= MAX_FAILS) log_('Khóa tài khoản 15 phút', ma);
    if (g6h >= GLOBAL_FAILS_6H) { c.put('glock', '1', 3600); log_('Tạm dừng đăng nhập 1 giờ (sai mật khẩu ' + g6h + ' lần / 6 giờ)', ma); }
    else if (g10 >= GLOBAL_FAILS_10M) { c.put('glock', '1', 600); log_('Tạm dừng đăng nhập 10 phút (sai mật khẩu ' + g10 + ' lần / 10 phút)', ma); }
  });
}
/** Ghi sự kiện bảo mật vào tab NhatKy (tự tạo) */
function log_(event, ma) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('NhatKy');
    if (!sh) { sh = ss.insertSheet('NhatKy'); sh.appendRow(['ThoiGian', 'SuKien', 'MaNV']); sh.setFrozenRows(1); }
    sh.appendRow([Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'), event, safe_(ma)]);
  } catch (e) { /* không chặn đăng nhập vì lỗi ghi nhật ký */ }
}

/** Chống chèn công thức: chuỗi bắt đầu bằng = + - @ được ghi thành chữ thường (thêm dấu ' ở đầu) */
function safe_(v) {
  return typeof v === 'string' && /^[=+\-@\t\r]/.test(v) ? "'" + v : v;
}

function phuTrachList_(s) {
  return String((s && s.phuTrach) || '').split(';').map(function (x) { return x.trim(); }).filter(Boolean);
}
function covers_(pgd, phong) { return pgd.vaiTro === 'PGD' && phuTrachList_(pgd).indexOf(phong) >= 0; }
function isStaffRole_(p) { return p.vaiTro === 'NhanVien' || p.vaiTro === 'TruongPhong'; }
function needsApproval_(p) { return isStaffRole_(p) || p.vaiTro === 'PGD'; }
function isApprover_(me) {
  return me.vaiTro === 'Admin' || me.vaiTro === 'GiamDoc' || (me.vaiTro === 'PGD' && phuTrachList_(me).length > 0);
}
function primaryApprovers_(staff, p) {
  if (!needsApproval_(p)) return [];
  var active = staff.filter(function (s) { return s.trangThai !== 'Nghỉ việc' && s.ma !== p.ma; });
  if (isStaffRole_(p)) {
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
  return isStaffRole_(requester) && covers_(viewer, requester.phong);
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
    canManage: me.vaiTro === 'Admin' || me.vaiTro === 'GiamDoc',
    seeAll: me.vaiTro !== 'NhanVien'
  };
}

function requireAdmin_(ctx) {
  if (ctx.me.vaiTro !== 'Admin') throw new Error('Chỉ quản trị viên được làm thao tác này');
}

/* ---------- Thao tác ---------- */

function getData_(ctx) {
  var manage = ctx.me.vaiTro === 'Admin' || ctx.me.vaiTro === 'GiamDoc';
  var staff = ctx.staff.filter(function (s) { return manage || s.trangThai !== 'Nghỉ việc'; }).map(function (s) {
    var o = { ma: s.ma, ten: s.ten, phong: s.phong, chucDanh: s.chucDanh, vaiTro: s.vaiTro, phuTrach: s.phuTrach,
              trangThai: s.trangThai };
    // Người quản lý thấy ai còn dùng mật khẩu mặc định (chưa đăng nhập lần nào)
    if (manage) o.chuaDoiMK = s.pin === '' || mustChange_(s);
    return o;
  });
  // Nhân viên: đơn của mình đầy đủ; đơn người khác chỉ nhận phần hôm nay (để biết hôm nay ai vắng), không xem ai nghỉ ngày nào
  var onlyMine = ctx.me.vaiTro === 'NhanVien';
  var today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  var reqs = requests_().filter(function (r) {
    if (r.trangThai === ST.CANCELLED) return false;
    if (onlyMine && r.ma !== ctx.me.ma && !(r.tuNgay <= today && r.denNgay >= today && (r.trangThai === ST.APPROVED || r.trangThai === ST.PENDING))) return false;
    if (r.trangThai === ST.REJECTED) return r.ma === ctx.me.ma || canApprove_(ctx, r);
    return true;
  }).map(function (r) {
    var o = {};
    for (var k in r) if (k !== '_row') o[k] = r[k];
    if (!canSeeReason_(ctx, r)) { o.lyDo = ''; o.ghiChuDuyet = ''; }
    if (onlyMine && r.ma !== ctx.me.ma) {
      if (o.tuNgay !== today) o.tuBuoi = 'Sáng';
      if (o.denNgay !== today) o.denBuoi = 'Chiều';
      o.tuNgay = o.denNgay = today; o.soNgay = ''; o.ngayTao = ''; o.ngayDuyet = ''; o.nguoiDuyet = '';
    }
    o.canApprove = canApprove_(ctx, r);
    return o;
  });
  return { me: publicMe_(ctx), staff: staff, types: types_(), holidays: holidays_(), requests: reqs };
}

function createLeave_(ctx, req) {
  var ma = normMa_(req.ma || ctx.me.ma);
  if (ma !== ctx.me.ma && ctx.me.vaiTro !== 'Admin') throw new Error('Bạn chỉ được khai nghỉ cho chính mình');
  var person = personOf_(ctx, ma);
  if (!person) throw new Error('Không tìm thấy nhân sự ' + ma);

  var loai = String(req.loai || '').trim();
  if (!loai) throw new Error('Chưa chọn loại');
  if (!types_().some(function (t) { return t.ten === loai; })) throw new Error('Loại "' + loai.slice(0, 40) + '" không có trong danh sách');
  var r = { tuNgay: String(req.tuNgay || ''), tuBuoi: req.tuBuoi === 'Chiều' ? 'Chiều' : 'Sáng',
            denNgay: String(req.denNgay || ''), denBuoi: req.denBuoi === 'Sáng' ? 'Sáng' : 'Chiều' };
  var err = validateRange(r);
  if (err) throw new Error(err);
  var yNow = Number(Utilities.formatDate(new Date(), TZ, 'yyyy'));
  var y1 = Number(r.tuNgay.slice(0, 4)), y2 = Number(r.denNgay.slice(0, 4));
  if (y1 < yNow - 1 || y2 > yNow + 1) throw new Error('Chỉ khai được đơn trong năm trước, năm nay và năm sau');
  var pendingCount = requests_().filter(function (x) { return x.ma === ma && x.trangThai === ST.PENDING; }).length;
  if (pendingCount >= MAX_PENDING) throw new Error('Đã có ' + MAX_PENDING + ' đơn chờ duyệt, hãy đợi duyệt bớt');

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
    DenNgay: r.denNgay, DenBuoi: r.denBuoi, SoNgay: total, LyDo: String(req.lyDo || '').trim().slice(0, 500),
    TrangThai: autoApprove ? ST.APPROVED : ST.PENDING, NguoiDuyet: autoApprove ? AUTO : '',
    NgayDuyet: autoApprove ? now : '', GhiChuDuyet: '', NgayTao: now
  };
  var t = table_('DonNghi');
  t.sheet.appendRow(t.head.map(function (h) { return row[h] !== undefined ? safe_(row[h]) : ''; }));
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
    cell.setValue(safe_(values[h]));
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

/** Đổi mật khẩu. Đang dùng mã phiên thì phải nhập mật khẩu hiện tại (tránh người cầm máy đổi mất mật khẩu). Trả về mã phiên mới. */
function changePin_(ctx, newPin, oldPin, remember) {
  var me = ctx.me;
  newPin = String(newPin || '').trim();
  var err = pinRule_(me.ma, newPin);
  if (err) throw new Error(err);
  if (ctx.viaToken) checkPin_(me.ma, String(oldPin || '').trim().slice(0, 40));
  var h = hashPin_(me.ma, newPin);
  withLock_(function () { writeStaff_(me._row, { PIN: h }); });
  me.pin = h;
  log_(ctx.mustChange ? 'Đổi mật khẩu mặc định (đăng nhập lần đầu)' : 'Đổi mật khẩu', me.ma);
  var tk = makeToken_(me, remember);
  return { changed: true, token: tk.token, exp: tk.exp, me: publicMe_(ctx) };
}
function pinRule_(ma, p) {
  if (p.length < 6 || p.length > 32) return 'Mật khẩu mới phải từ 6 đến 32 ký tự';
  if (p === DEFAULT_PIN) return ''; // được phép giữ lại mật khẩu mặc định
  var low = p.toLowerCase();
  if (/^(.)\1+$/.test(p) || '01234567890'.indexOf(p) >= 0 || '09876543210'.indexOf(p) >= 0 || 'abcdefghijklmnopqrstuvwxyz'.indexOf(low) >= 0)
    return 'Mật khẩu quá dễ đoán (toàn ký tự giống nhau hoặc dãy liên tiếp)';
  if (low === ma || low === ma.replace(/\./g, '')) return 'Mật khẩu không được trùng mã nhân sự';
  return '';
}

/* ---------- Quản trị ---------- */

function cleanPhuTrach_(v) {
  var list = Array.isArray(v) ? v : String(v || '').split(';');
  return list.map(function (x) { return String(x).trim(); }).filter(Boolean).join('; ');
}

function saveStaff_(ctx, d, isNew) {
  var me = ctx.me;
  if (me.vaiTro !== 'Admin' && me.vaiTro !== 'GiamDoc') throw new Error('Bạn không có quyền quản lý tài khoản');
  var ma = normMa_(d.ma);
  if (isNew && !ma && me.vaiTro === 'Admin') {
    var taken = {};
    ctx.staff.forEach(function (s) { taken[s.ma] = 1; });
    ma = makeMa_(String(d.ten || ''), taken);
  }
  if (!/^[a-z0-9_.-]{2,30}$/.test(ma)) throw new Error('Mã NV chỉ gồm chữ không dấu, số, dấu chấm; 2–30 ký tự');
  var target = personOf_(ctx, ma);
  var role = String(d.vaiTro || 'NhanVien');
  if (!ROLES[role]) throw new Error('Vai trò không hợp lệ');

  if (me.vaiTro === 'GiamDoc') {
    if (isNew || !target) throw new Error('Chỉ quản trị viên được thêm nhân sự');
    if (GD_ROLES.indexOf(target.vaiTro) < 0) throw new Error('Giám đốc chỉ điều chỉnh tài khoản Nhân viên, Trưởng/Phó phòng và Phó Giám đốc');
    if (GD_ROLES.indexOf(role) < 0) throw new Error('Giám đốc chỉ đặt vai trò Nhân viên, Trưởng/Phó phòng hoặc Phó Giám đốc');
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
    TrangThai: trangThai
  };
  var admins = ctx.staff.filter(function (s) { return s.vaiTro === 'Admin' && s.trangThai !== 'Nghỉ việc' && s.ma !== ma; });
  if (!admins.length && (role !== 'Admin' || trangThai === 'Nghỉ việc')) throw new Error('Phải còn ít nhất một tài khoản Quản trị');

  if (isNew) {
    if (target) throw new Error('Mã NV ' + ma + ' đã tồn tại');
    values.MaNV = ma;
    values.PIN = defaultHash_(ma);
    var t = table_('NhanSu');
    t.sheet.appendRow(t.head.map(function (h) { return values[h] !== undefined ? safe_(values[h]) : ''; }));
    return { saved: ma, pin: DEFAULT_PIN };
  }
  if (!target) throw new Error('Không tìm thấy nhân sự ' + ma);
  writeStaff_(target._row, values);
  return { saved: ma };
}

function resetPin_(ctx, targetMa) {
  requireAdmin_(ctx);
  var target = personOf_(ctx, normMa_(targetMa));
  if (!target) throw new Error('Không tìm thấy nhân sự');
  writeStaff_(target._row, { PIN: defaultHash_(target.ma) });
  CacheService.getScriptCache().remove('try_' + target.ma);
  log_('Quản trị đặt lại mật khẩu mặc định (bởi ' + ctx.me.ma + ')', target.ma);
  return { ma: target.ma, pin: DEFAULT_PIN };
}

function rewrite_(sheetName, rows) {
  var t = table_(sheetName);
  var last = t.sheet.getLastRow();
  if (last > 1) t.sheet.getRange(2, 1, last - 1, t.head.length).clearContent();
  if (rows.length) {
    var range = t.sheet.getRange(2, 1, rows.length, t.head.length);
    range.setNumberFormat('@');
    range.setValues(rows.map(function (o) { return t.head.map(function (h) { return o[h] !== undefined ? safe_(o[h]) : ''; }); }));
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
    rows.push({ Ten: ten.slice(0, 60), TinhNghi: x.tinhNghi === false ? 'Không' : 'Có', Mau: mau });
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
