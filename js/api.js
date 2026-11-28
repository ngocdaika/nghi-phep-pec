/* Kết nối backend: Google Apps Script thật, hoặc chế độ demo (dữ liệu giả, lưu trong trình duyệt) */
(function (global) {
  'use strict';
  var L = global.Logic, ST = L.ST;
  var cfg = global.APP_CONFIG || {};
  var params = new URLSearchParams(location.search);
  var DEMO = params.has('demo') || !cfg.API_URL;

  function callReal(payload) {
    return fetch(cfg.API_URL, { method: 'POST', body: JSON.stringify(payload), redirect: 'follow' })
      .then(function (res) {
        if (!res.ok) throw new Error('Máy chủ lỗi (' + res.status + ')');
        return res.json();
      })
      .then(function (j) {
        if (!j.ok) throw new Error(j.error || 'Lỗi không xác định');
        return j;
      }, function (err) {
        if (err instanceof TypeError) throw new Error('Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.');
        throw err;
      });
  }

  /* Mã nhân sự từ họ tên – giống makeMa_() trong Code.gs: Nguyễn Hoàng Khánh Ngọc → ngoc.nhk, trùng thì thêm 2, 3… */
  function boDau(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }
  function makeMa(ten, taken) {
    var w = boDau(ten).toLowerCase().replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!w.length) w = ['nv'];
    var base = w[w.length - 1] + (w.length > 1 ? '.' + w.slice(0, -1).map(function (x) { return x[0]; }).join('') : '');
    var ma = base, i = 2;
    while (taken[ma]) ma = base + (i++);
    taken[ma] = 1;
    return ma;
  }
  function normMa(v) { return String(v == null ? '' : v).trim().toLowerCase().slice(0, 30); }
  var DEFAULT_PIN = '123456';
  function pinRule(ma, p) {
    if (p.length < 6 || p.length > 32) return 'Mật khẩu mới phải từ 6 đến 32 ký tự';
    if (p === DEFAULT_PIN) return ''; // được phép giữ lại mật khẩu mặc định
    var low = p.toLowerCase();
    if (/^(.)\1+$/.test(p) || '01234567890'.indexOf(p) >= 0 || '09876543210'.indexOf(p) >= 0 || 'abcdefghijklmnopqrstuvwxyz'.indexOf(low) >= 0)
      return 'Mật khẩu quá dễ đoán (toàn ký tự giống nhau hoặc dãy liên tiếp)';
    if (low === ma || low === ma.replace(/\./g, '')) return 'Mật khẩu không được trùng mã nhân sự';
    return '';
  }

  /* ---------------- DEMO (mô phỏng đúng quy tắc của apps-script/Code.gs) ---------------- */
  var DEMO_KEY = 'np_demo_v4';
  var AUTO = '(tự động)';

  /* Danh sách nhân sự thật (họ tên, phòng, chức danh) đọc từ Google Sheet; không được thì dùng danh sách giả bên dưới */
  var sheetStaff = null;
  var ready = !DEMO ? Promise.resolve() : !cfg.API_URL ? Promise.resolve() :
    callReal({ action: 'demoStaff' }).then(function (j) { if (j.staff && j.staff.length) sheetStaff = j.staff; })
      .catch(function () { /* demo tắt hoặc mất mạng → danh sách giả */ });

  var KT = 'Phòng Kỹ thuật', DA = 'Phòng Dự án', HC = 'Phòng Hành chính', BGD = 'Ban Giám đốc';
  var FAKE = [
    ['Nguyễn Văn An', BGD, 'Giám đốc Trung tâm', 'GiamDoc', ''],
    ['Trần Thị Bình', BGD, 'Phó Giám đốc Trung tâm', 'PGD', KT],
    ['Phan Quốc Trung', BGD, 'Phó Giám đốc Trung tâm', 'PGD', DA],
    ['Lê Hoàng Cường', KT, 'Trưởng phòng', 'TruongPhong', ''],
    ['Phạm Minh Dũng', KT, 'Phó Trưởng phòng', 'TruongPhong', ''],
    ['Võ Thu Hà', KT, 'Thành viên', 'NhanVien', ''],
    ['Đặng Quốc Huy', KT, 'Thành viên', 'NhanVien', ''],
    ['Bùi Thanh Lan', KT, 'Thành viên', 'NhanVien', ''],
    ['Hồ Đức Minh', DA, 'Trưởng phòng', 'TruongPhong', ''],
    ['Ngô Bảo Ngọc', DA, 'Thành viên', 'NhanVien', ''],
    ['Đỗ Gia Phúc', DA, 'Thành viên', 'NhanVien', ''],
    ['Lý Mỹ Quyên', DA, 'Thành viên', 'NhanVien', ''],
    ['Mai Văn Sơn', DA, 'Thành viên', 'NhanVien', ''],
    ['Trương Thị Hồng', HC, 'Trưởng bộ phận', 'TruongPhong', ''],
    ['Lâm Văn Khoa', HC, 'Thành viên', 'NhanVien', '']
  ].map(function (a) { return { ten: a[0], phong: a[1], chucDanh: a[2], vaiTro: a[3], phuTrach: a[4] }; });

  function sourceSig() {
    var src = sheetStaff || FAKE;
    return (sheetStaff ? 'sheet:' : 'fake:') + src.length + ':' + src.map(function (s) { return s.ten + s.phong + s.vaiTro + s.phuTrach; }).join('|').length;
  }

  function demoSeed() {
    var today = L.todayYMD(), y = +today.slice(0, 4), cm = +today.slice(5, 7);
    var taken = { admin: 1 };
    var staff = [{ ma: 'admin', ten: 'Quản trị hệ thống', phong: '', chucDanh: 'Quản trị', vaiTro: 'Admin', phuTrach: '', trangThai: 'Đang làm' }];
    var rnd = mulberry(7);
    (sheetStaff || FAKE).forEach(function (s) {
      staff.push({ ma: makeMa(s.ten, taken), ten: s.ten, phong: s.phong, chucDanh: s.chucDanh || '',
                   vaiTro: L.ROLES[s.vaiTro] ? s.vaiTro : 'NhanVien', phuTrach: s.phuTrach || '', trangThai: 'Đang làm',
                   chuaDoiMK: rnd() < 0.25 });
    });
    // Chưa giao phòng cho PGĐ nào → giao tạm (chỉ trong demo) để xem được luồng duyệt
    var pgds = staff.filter(function (s) { return s.vaiTro === 'PGD'; });
    if (pgds.length && !pgds.some(function (p) { return L.phuTrachList(p).length; })) {
      var lead = {}, seen = {}, phongs = [];
      staff.forEach(function (s) { if (s.vaiTro === 'GiamDoc' || s.vaiTro === 'PGD') lead[s.phong] = 1; });
      staff.forEach(function (s) {
        if (s.phong && !seen[s.phong] && staff.some(function (x) { return x.phong === s.phong && (x.vaiTro === 'NhanVien' || x.vaiTro === 'TruongPhong'); })) {
          seen[s.phong] = 1; phongs.push(s.phong);
        }
      });
      phongs.forEach(function (ph, i) { var p = pgds[i % pgds.length]; p.phuTrach = p.phuTrach ? p.phuTrach + '; ' + ph : ph; });
    }
    var types = [
      { ten: 'Nghỉ phép', tinhNghi: true, mau: '#0093DD' },
      { ten: 'Công tác', tinhNghi: false, mau: '#10B981' },
      { ten: 'Nghỉ không lương', tinhNghi: true, mau: '#F97316' }
    ];
    var holidays = [
      [y + '-01-01', 'Tết Dương lịch'], [y + '-04-30', 'Giải phóng miền Nam'], [y + '-05-01', 'Quốc tế Lao động'],
      [y + '-09-01', 'Quốc khánh'], [y + '-09-02', 'Quốc khánh'], [(y + 1) + '-01-01', 'Tết Dương lịch']
    ].map(function (h) { return { ngay: h[0], ten: h[1] }; });
    var hset = {};
    holidays.forEach(function (h) { hset[h.ngay] = true; });
    var name = {};
    staff.forEach(function (s) { name[s.ma] = s.ten; });

    var by = function (role) { return staff.filter(function (s) { return s.vaiTro === role && s.phong; }); };
    var GD = by('GiamDoc'), PG = by('PGD'), TP = by('TruongPhong'), NV = by('NhanVien');
    var gd = GD[0] || staff[0];
    function pk(arr, i) { return arr.length ? arr[i % arr.length] : null; }
    function appr(s) {
      if (s.vaiTro === 'GiamDoc') return AUTO;
      if (s.vaiTro === 'PGD') return gd.ma;
      var c = staff.filter(function (x) { return x.vaiTro === 'PGD' && L.phuTrachList(x).indexOf(s.phong) >= 0; })[0];
      return c ? c.ma : gd.ma;
    }

    // Ngày làm việc cách hôm nay `off` ngày (gặp chủ nhật/lễ thì dời về sau)
    function wd(off) {
      var d = new Date(L.parseYMD(today).getTime() + off * 86400000);
      while (d.getUTCDay() === 0 || hset[L.fmtYMD(d)]) d = new Date(d.getTime() + 86400000);
      return L.fmtYMD(d);
    }
    var reqs = [], seq = 1;
    function add(s, loai, tu, tuBuoi, den, denBuoi, st, lyDo, note) {
      if (!s || reqs.some(function (r) { return r.ma === s.ma && r.tuNgay <= den && r.denNgay >= tu; })) return;
      var created = wd(-1 - (seq % 3));
      if (tu < created) created = L.fmtYMD(new Date(L.parseYMD(tu).getTime() - 2 * 86400000));
      var duyet = st === ST.PENDING ? '' : appr(s);
      reqs.push({
        id: 'DEMO' + (seq++), ma: s.ma, ten: s.ten, loai: loai,
        tuNgay: tu, tuBuoi: tuBuoi, denNgay: den, denBuoi: denBuoi, lyDo: lyDo || '',
        ngayTao: created + ' 08:15', trangThai: st,
        nguoiDuyet: duyet === AUTO ? AUTO : name[duyet] || '',
        ngayDuyet: st === ST.PENDING ? '' : created + ' 10:30', ghiChuDuyet: note || ''
      });
    }
    var OK = ST.APPROVED, WAIT = ST.PENDING, NO = ST.REJECTED;
    // Các tình huống giả định quanh hôm nay
    add(pk(NV, 0), 'Nghỉ phép', wd(0), 'Sáng', wd(0), 'Chiều', OK, 'Đưa con đi khám bệnh');
    add(pk(NV, 1), 'Nghỉ phép', wd(0), 'Sáng', wd(0), 'Sáng', OK, 'Việc gia đình buổi sáng');
    add(pk(NV, 2), 'Công tác', wd(0), 'Sáng', wd(3), 'Chiều', OK, 'Khảo sát hiện trường cảng Cái Mép');
    add(pk(TP, 1), 'Nghỉ phép', wd(-8), 'Sáng', wd(-5), 'Chiều', OK, 'Về quê');
    add(pk(NV, 3), 'Nghỉ phép', wd(3), 'Sáng', wd(4), 'Chiều', WAIT, 'Đám cưới em gái');
    add(pk(TP, 0), 'Nghỉ phép', wd(5), 'Chiều', wd(5), 'Chiều', WAIT, 'Họp phụ huynh');
    add(pk(NV, 0), 'Nghỉ không lương', wd(7), 'Sáng', wd(8), 'Chiều', WAIT, 'Việc cá nhân');
    add(pk(PG, 0), 'Nghỉ phép', wd(2), 'Sáng', wd(2), 'Chiều', WAIT, 'Khám sức khỏe định kỳ');
    add(gd, 'Công tác', wd(-3), 'Sáng', wd(-1), 'Chiều', OK, 'Làm việc với chủ đầu tư tại Hà Nội');
    add(pk(NV, 4), 'Nghỉ phép', wd(-2), 'Sáng', wd(-2), 'Chiều', NO, 'Việc riêng', 'Trùng lịch nghiệm thu, đề nghị dời ngày');
    add(pk(NV, 5), 'Nghỉ phép', wd(1), 'Sáng', wd(1), 'Chiều', WAIT, 'Làm giấy tờ nhà');
    add(pk(NV, 6), 'Nghỉ không lương', wd(-12), 'Sáng', wd(-11), 'Chiều', OK, 'Chăm người nhà nằm viện');
    add(pk(NV, 7), 'Nghỉ phép', wd(-15), 'Chiều', wd(-15), 'Chiều', OK, 'Đi ngân hàng');
    add(pk(TP, 2), 'Công tác', wd(9), 'Sáng', wd(12), 'Chiều', OK, 'Giám sát thi công bến số 2');
    add(pk(TP, 3), 'Nghỉ phép', wd(-6), 'Sáng', wd(-6), 'Chiều', OK, 'Việc gia đình');
    add(pk(PG, 1), 'Nghỉ phép', wd(6), 'Sáng', wd(6), 'Chiều', OK, 'Việc gia đình');
    add(pk(NV, 8), 'Công tác', wd(-4), 'Sáng', wd(-3), 'Chiều', OK, 'Họp với tư vấn giám sát');
    add(pk(NV, 9), 'Nghỉ phép', wd(4), 'Sáng', wd(4), 'Sáng', WAIT, 'Đi khám răng');

    // Dữ liệu nền các tháng trước để xem tổng kết năm
    var people = staff.filter(function (s) { return s.phong; });
    for (var m = 1; m < cm; m++) {
      var n = 3 + Math.floor(rnd() * Math.max(4, people.length / 5));
      for (var k = 0; k < n; k++) {
        var s = people[Math.floor(rnd() * people.length)];
        var d = 1 + Math.floor(rnd() * 24);
        var len = rnd() < 0.6 ? 0 : 1 + Math.floor(rnd() * 2);
        var x = rnd(), loai = x < 0.65 ? 'Nghỉ phép' : x < 0.85 ? 'Công tác' : 'Nghỉ không lương';
        var half = len === 0 && loai !== 'Công tác' && rnd() < 0.3;
        var tu = L.ymd(y, m, d), den = L.ymd(y, m, Math.min(L.daysInMonth(y, m), d + len));
        var pmOnly = half && rnd() < 0.5;
        add(s, loai, tu, pmOnly ? 'Chiều' : 'Sáng', den, half && !pmOnly ? 'Sáng' : 'Chiều', OK,
            loai === 'Công tác' ? 'Công tác dự án' : 'Việc gia đình');
      }
    }
    return { sig: sourceSig(), staff: staff, types: types, holidays: holidays, requests: reqs };
  }

  function mulberry(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function demoDb() {
    var raw = localStorage.getItem(DEMO_KEY);
    if (raw) try { var old = JSON.parse(raw); if (old.sig === sourceSig()) return old; } catch (e) { /* tạo lại */ }
    var db = demoSeed();
    localStorage.setItem(DEMO_KEY, JSON.stringify(db));
    return db;
  }
  function demoSave(db) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); }

  function demoCall(b) {
    return ready.then(function () {
      return new Promise(function (resolve, reject) {
        setTimeout(function () {
          try { resolve(demoRoute(b)); } catch (e) { reject(e); }
        }, 150);
      });
    });
  }

  var GD_ROLES = ['NhanVien', 'TruongPhong', 'PGD'];
  function cleanPhuTrach(v) {
    var list = Array.isArray(v) ? v : String(v || '').split(';');
    return list.map(function (x) { return String(x).trim(); }).filter(Boolean).join('; ');
  }
  function demoToken(me) { return { token: 'demo~' + me.ma, exp: Date.now() + 30 * 86400000 }; }

  /* Demo: nhập mã và mật khẩu gì cũng vào. Mã trùng ai thì vào bằng người đó, không trùng thì vào bằng Quản trị.
     Nhập mật khẩu 123456 thì thử được màn hình bắt đổi mật khẩu lần đầu. */
  function demoRoute(b) {
    var db = demoDb();
    var key = b.token ? String(b.token).replace(/^demo~/, '') : normMa(b.ma);
    var byMa = function (ma) { return db.staff.filter(function (x) { return x.ma === ma; })[0]; };
    var me = byMa(key);
    if (!me || me.trangThai === 'Nghỉ việc') me = byMa('admin') || db.staff[0];
    var mustChange = !b.token && String(b.pin || '').trim() === DEFAULT_PIN;
    var canApprove = function (r) { return L.canApprove(me, byMa(r.ma)); };
    var manage = me.vaiTro === 'Admin' || me.vaiTro === 'GiamDoc';
    var pubMe = {
      ma: me.ma, ten: me.ten, phong: me.phong, chucDanh: me.chucDanh, vaiTro: me.vaiTro, phuTrach: me.phuTrach,
      isAdmin: me.vaiTro === 'Admin', isApprover: L.isApprover(me), canManage: manage, seeAll: L.canSeeAllTotals(me)
    };
    var requireAdmin = function () { if (me.vaiTro !== 'Admin') throw new Error('Chỉ quản trị viên được làm thao tác này'); };
    var hset = {};
    db.holidays.forEach(function (h) { hset[h.ngay] = true; });
    var find = function (id) {
      var r = db.requests.filter(function (x) { return x.id === id; })[0];
      if (!r) throw new Error('Không tìm thấy đơn');
      return r;
    };
    var now = L.todayYMD() + ' ' + new Date().toTimeString().slice(0, 5);
    var today = L.todayYMD(), onlyMine = me.vaiTro === 'NhanVien';
    if (mustChange && b.action !== 'login' && b.action !== 'changePin') throw new Error('Bạn cần đổi mật khẩu mặc định trước khi sử dụng.');

    switch (b.action) {
      case 'login': {
        var o = { ok: true, me: pubMe, mustChange: mustChange };
        if (!mustChange) { var tk = demoToken(me); o.token = tk.token; o.exp = tk.exp; }
        return o;
      }
      case 'data':
        return {
          ok: true, me: pubMe,
          staff: db.staff.filter(function (s) { return manage || s.trangThai !== 'Nghỉ việc'; }).map(function (s) {
            var x = { ma: s.ma, ten: s.ten, phong: s.phong, chucDanh: s.chucDanh, vaiTro: s.vaiTro, phuTrach: s.phuTrach,
                      trangThai: s.trangThai };
            if (manage) x.chuaDoiMK = !!s.chuaDoiMK;
            return x;
          }),
          types: db.types, holidays: db.holidays,
          requests: db.requests.filter(function (r) {
            if (r.trangThai === ST.CANCELLED) return false;
            if (onlyMine && r.ma !== me.ma && !(r.tuNgay <= today && r.denNgay >= today && (r.trangThai === ST.APPROVED || r.trangThai === ST.PENDING))) return false;
            if (r.trangThai === ST.REJECTED) return r.ma === me.ma || canApprove(r);
            return true;
          }).map(function (r) {
            var o = Object.assign({}, r);
            if (!L.canSeeReason(me, byMa(r.ma))) { o.lyDo = ''; o.ghiChuDuyet = ''; }
            if (onlyMine && r.ma !== me.ma) { // người khác: chỉ phần hôm nay
              if (o.tuNgay !== today) o.tuBuoi = 'Sáng';
              if (o.denNgay !== today) o.denBuoi = 'Chiều';
              o.tuNgay = o.denNgay = today; o.ngayTao = ''; o.ngayDuyet = ''; o.nguoiDuyet = '';
            }
            o.canApprove = canApprove(r);
            o.soNgay = L.expandLeave(r, hset).reduce(function (a, x) { return a + x.v; }, 0);
            return o;
          })
        };
      case 'create': {
        var q = b.req || {};
        var ma = normMa(q.ma || me.ma);
        if (ma !== me.ma && me.vaiTro !== 'Admin') throw new Error('Bạn chỉ được khai nghỉ cho chính mình');
        var person = byMa(ma);
        if (!person) throw new Error('Không tìm thấy nhân sự ' + ma);
        if (!db.types.some(function (t) { return t.ten === q.loai; })) throw new Error('Loại không có trong danh sách');
        var err = L.validateRange(q);
        if (err) throw new Error(err);
        var days = L.expandLeave(q, hset);
        if (!days.length) throw new Error('Khoảng thời gian này không có ngày làm việc');
        var mine = {};
        db.requests.forEach(function (x) {
          if (x.ma !== ma || !L.isActive(x)) return;
          L.expandLeave(x, hset).forEach(function (d) { mine[d.d] = (mine[d.d] || []).concat(d.part); });
        });
        days.forEach(function (d) {
          var ex = mine[d.d];
          if (ex && (d.part === 'full' || ex.indexOf('full') >= 0 || ex.indexOf(d.part) >= 0))
            throw new Error('Trùng với đơn nghỉ đã có ngày ' + L.viDate(d.d));
        });
        var auto = L.primaryApprovers(db.staff, person).length === 0;
        var r = {
          id: 'DEMO' + Date.now(), ma: ma, ten: person.ten, loai: q.loai, tuNgay: q.tuNgay, tuBuoi: q.tuBuoi,
          denNgay: q.denNgay, denBuoi: q.denBuoi, lyDo: q.lyDo || '', ngayTao: now,
          trangThai: auto ? ST.APPROVED : ST.PENDING, nguoiDuyet: auto ? AUTO : '', ngayDuyet: auto ? now : '', ghiChuDuyet: ''
        };
        db.requests.push(r); demoSave(db);
        return { ok: true, id: r.id, trangThai: r.trangThai };
      }
      case 'decide': {
        var r2 = find(b.id);
        if (!canApprove(r2)) throw new Error('Bạn không có quyền duyệt đơn này');
        r2.trangThai = b.decision === 'approve' ? ST.APPROVED : ST.REJECTED;
        r2.nguoiDuyet = me.ten; r2.ngayDuyet = now; r2.ghiChuDuyet = b.note || '';
        demoSave(db);
        return { ok: true };
      }
      case 'cancel': {
        var r3 = find(b.id);
        var own = r3.ma === me.ma && (r3.trangThai === ST.PENDING || r3.nguoiDuyet === AUTO);
        if (!own && !canApprove(r3)) throw new Error('Chỉ hủy được đơn của mình khi còn chờ duyệt');
        r3.trangThai = ST.CANCELLED; demoSave(db);
        return { ok: true };
      }
      case 'changePin': {
        var e2 = pinRule(me.ma, String(b.newPin || '').trim());
        if (e2) throw new Error(e2);
        me.chuaDoiMK = false; demoSave(db);
        var tk2 = demoToken(me);
        return { ok: true, changed: true, token: tk2.token, exp: tk2.exp, me: pubMe };
      }
      case 'saveStaff': {
        if (!manage) throw new Error('Bạn không có quyền quản lý tài khoản');
        var d = b.staff || {}, sma = normMa(d.ma), role = String(d.vaiTro || 'NhanVien');
        if (b.isNew && !sma && me.vaiTro === 'Admin') {
          var taken = {};
          db.staff.forEach(function (s) { taken[s.ma] = 1; });
          sma = makeMa(String(d.ten || ''), taken);
        }
        if (!/^[a-z0-9_.-]{2,30}$/.test(sma)) throw new Error('Mã NV chỉ gồm chữ không dấu, số, dấu chấm; 2–30 ký tự');
        if (!L.ROLES[role]) throw new Error('Vai trò không hợp lệ');
        var target = byMa(sma);
        if (me.vaiTro === 'GiamDoc') {
          if (b.isNew || !target) throw new Error('Chỉ quản trị viên được thêm nhân sự');
          if (GD_ROLES.indexOf(target.vaiTro) < 0) throw new Error('Giám đốc chỉ điều chỉnh tài khoản Nhân viên, Trưởng/Phó phòng và Phó Giám đốc');
          if (GD_ROLES.indexOf(role) < 0) throw new Error('Giám đốc chỉ đặt vai trò Nhân viên, Trưởng/Phó phòng hoặc Phó Giám đốc');
          target.vaiTro = role; target.phuTrach = role === 'PGD' ? cleanPhuTrach(d.phuTrach) : '';
          demoSave(db);
          return { ok: true, saved: sma };
        }
        var ten = String(d.ten || '').trim();
        if (!ten) throw new Error('Chưa nhập họ tên');
        var tt = d.trangThai === 'Nghỉ việc' ? 'Nghỉ việc' : 'Đang làm';
        var others = db.staff.filter(function (s) { return s.vaiTro === 'Admin' && s.trangThai !== 'Nghỉ việc' && s.ma !== sma; });
        if (!others.length && (role !== 'Admin' || tt === 'Nghỉ việc')) throw new Error('Phải còn ít nhất một tài khoản Quản trị');
        var vals = {
          ten: ten, phong: String(d.phong || '').trim(), chucDanh: String(d.chucDanh || '').trim(), vaiTro: role,
          phuTrach: role === 'PGD' ? cleanPhuTrach(d.phuTrach) : '', trangThai: tt
        };
        if (b.isNew) {
          if (target) throw new Error('Mã NV ' + sma + ' đã tồn tại');
          vals.ma = sma; vals.chuaDoiMK = true;
          db.staff.push(vals); demoSave(db);
          return { ok: true, saved: sma, pin: DEFAULT_PIN };
        }
        if (!target) throw new Error('Không tìm thấy nhân sự ' + sma);
        Object.assign(target, vals); demoSave(db);
        return { ok: true, saved: sma };
      }
      case 'resetPin': {
        requireAdmin();
        var t2 = byMa(normMa(b.target));
        if (!t2) throw new Error('Không tìm thấy nhân sự');
        t2.chuaDoiMK = true; demoSave(db);
        return { ok: true, ma: t2.ma, pin: DEFAULT_PIN };
      }
      case 'saveTypes': {
        requireAdmin();
        var seen = {}, list = [];
        (b.types || []).forEach(function (x) {
          var tn = String(x.ten || '').trim();
          if (!tn || seen[tn]) return;
          seen[tn] = 1;
          list.push({ ten: tn.slice(0, 60), tinhNghi: x.tinhNghi !== false, mau: /^#[0-9a-f]{6}$/i.test(String(x.mau)) ? String(x.mau).toUpperCase() : '#64748B' });
        });
        if (!list.length) throw new Error('Cần ít nhất một loại nghỉ');
        db.types = list; demoSave(db);
        return { ok: true, saved: list.length };
      }
      case 'saveHolidays': {
        requireAdmin();
        var seenH = {}, hl = [];
        (b.holidays || []).forEach(function (x) {
          var dd = String(x.ngay || '').trim();
          if (!/^\d{4}-\d{2}-\d{2}$/.test(dd) || seenH[dd]) return;
          seenH[dd] = 1;
          hl.push({ ngay: dd, ten: String(x.ten || '').trim().slice(0, 80) });
        });
        hl.sort(function (a, c) { return a.ngay < c.ngay ? -1 : 1; });
        db.holidays = hl; demoSave(db);
        return { ok: true, saved: hl.length };
      }
      default: throw new Error('Thao tác không hỗ trợ');
    }
  }

  /** Tài khoản mẫu cho nút chuyển vai trò: người đầu tiên của mỗi vai trò */
  function demoAs() {
    if (!DEMO) return [];
    var db = demoDb(), out = [];
    [['Admin', 'Quản trị'], ['GiamDoc', 'Giám đốc'], ['PGD', 'Phó Giám đốc'], ['TruongPhong', 'Trưởng phòng'], ['NhanVien', 'Nhân viên']]
      .forEach(function (x) {
        var s = db.staff.filter(function (p) { return p.vaiTro === x[0] && p.trangThai !== 'Nghỉ việc' && (x[0] === 'Admin' || p.phong); })[0];
        if (s) out.push({ ma: s.ma, role: x[0], label: x[1] });
      });
    return out;
  }

  global.Api = {
    demo: DEMO,
    ready: ready,
    fromSheet: function () { return !!sheetStaff; },
    call: function (payload) { return DEMO ? demoCall(payload) : callReal(payload); },
    resetDemo: function () { localStorage.removeItem(DEMO_KEY); },
    demoAs: demoAs, demoToken: function (ma) { return 'demo~' + ma; }
  };
})(window);
