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

  /* ---------------- DEMO (mô phỏng đúng quy tắc của apps-script/Code.gs) ---------------- */
  var DEMO_KEY = 'np_demo_v3';
  var AUTO = '(tự động)';

  /* Tài khoản mẫu để chuyển vai trò trong bản demo */
  var DEMO_AS = [
    { ma: 'ADMIN', role: 'Admin', label: 'Quản trị' },
    { ma: 'NS01', role: 'GiamDoc', label: 'Giám đốc' },
    { ma: 'NS02', role: 'PGD', label: 'Phó Giám đốc' },
    { ma: 'NS03', role: 'TruongPhong', label: 'Trưởng phòng' },
    { ma: 'NS05', role: 'NhanVien', label: 'Nhân viên' }
  ];
  var DEMO_PIN = '111111';

  function demoSeed() {
    var today = L.todayYMD(), y = +today.slice(0, 4), cm = +today.slice(5, 7);
    var KT = 'Phòng Kỹ thuật', DA = 'Phòng Dự án', HC = 'Phòng Hành chính', BGD = 'Ban Giám đốc';
    var staff = [
      ['ADMIN', 'Quản trị hệ thống', '', 'Quản trị', 'Admin', ''],
      ['NS01', 'Nguyễn Văn An', BGD, 'Giám đốc Trung tâm', 'GiamDoc', ''],
      ['NS02', 'Trần Thị Bình', BGD, 'Phó Giám đốc Trung tâm', 'PGD', KT],
      ['NS13', 'Phan Quốc Trung', BGD, 'Phó Giám đốc Trung tâm', 'PGD', DA],
      ['NS03', 'Lê Hoàng Cường', KT, 'Trưởng phòng', 'TruongPhong', ''],
      ['NS04', 'Phạm Minh Dũng', KT, 'Phó Trưởng phòng', 'TruongPhong', ''],
      ['NS05', 'Võ Thu Hà', KT, 'Thành viên', 'NhanVien', ''],
      ['NS06', 'Đặng Quốc Huy', KT, 'Thành viên', 'NhanVien', ''],
      ['NS07', 'Bùi Thanh Lan', KT, 'Thành viên', 'NhanVien', ''],
      ['NS08', 'Hồ Đức Minh', DA, 'Trưởng phòng', 'TruongPhong', ''],
      ['NS09', 'Ngô Bảo Ngọc', DA, 'Thành viên', 'NhanVien', ''],
      ['NS10', 'Đỗ Gia Phúc', DA, 'Thành viên', 'NhanVien', ''],
      ['NS11', 'Lý Mỹ Quyên', DA, 'Thành viên', 'NhanVien', ''],
      ['NS12', 'Mai Văn Sơn', DA, 'Thành viên', 'NhanVien', ''],
      ['NS14', 'Trương Thị Hồng', HC, 'Trưởng bộ phận', 'TruongPhong', ''],
      ['NS15', 'Lâm Văn Khoa', HC, 'Thành viên', 'NhanVien', '']
    ].map(function (a) {
      return { ma: a[0], ten: a[1], phong: a[2], chucDanh: a[3], vaiTro: a[4], phuTrach: a[5], pin: DEMO_PIN, trangThai: 'Đang làm' };
    });
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

    // Ngày làm việc cách hôm nay `off` ngày (gặp chủ nhật/lễ thì dời về sau)
    function wd(off) {
      var d = new Date(L.parseYMD(today).getTime() + off * 86400000);
      while (d.getUTCDay() === 0 || hset[L.fmtYMD(d)]) d = new Date(d.getTime() + 86400000);
      return L.fmtYMD(d);
    }
    var reqs = [], seq = 1;
    function add(ma, loai, tu, tuBuoi, den, denBuoi, st, duyet, lyDo, note) {
      var created = wd(-1 - (seq % 3));
      if (tu < created) created = L.fmtYMD(new Date(L.parseYMD(tu).getTime() - 2 * 86400000));
      reqs.push({
        id: 'DEMO' + (seq++), ma: ma, ten: name[ma], loai: loai,
        tuNgay: tu, tuBuoi: tuBuoi, denNgay: den, denBuoi: denBuoi, lyDo: lyDo || '',
        ngayTao: created + ' 08:15', trangThai: st,
        nguoiDuyet: st === ST.PENDING ? '' : (duyet === AUTO ? AUTO : name[duyet] || ''),
        ngayDuyet: st === ST.PENDING ? '' : created + ' 10:30', ghiChuDuyet: note || ''
      });
    }
    var OK = ST.APPROVED, WAIT = ST.PENDING, NO = ST.REJECTED;
    // Các tình huống giả định quanh hôm nay
    add('NS05', 'Nghỉ phép', wd(0), 'Sáng', wd(0), 'Chiều', OK, 'NS02', 'Đưa con đi khám bệnh');
    add('NS07', 'Nghỉ phép', wd(0), 'Sáng', wd(0), 'Sáng', OK, 'NS02', 'Việc gia đình buổi sáng');
    add('NS09', 'Công tác', wd(0), 'Sáng', wd(3), 'Chiều', OK, 'NS13', 'Khảo sát hiện trường cảng Cái Mép');
    add('NS04', 'Nghỉ phép', wd(-8), 'Sáng', wd(-5), 'Chiều', OK, 'NS02', 'Về quê');
    add('NS06', 'Nghỉ phép', wd(3), 'Sáng', wd(4), 'Chiều', WAIT, '', 'Đám cưới em gái');
    add('NS03', 'Nghỉ phép', wd(5), 'Chiều', wd(5), 'Chiều', WAIT, '', 'Họp phụ huynh');
    add('NS05', 'Nghỉ không lương', wd(7), 'Sáng', wd(8), 'Chiều', WAIT, '', 'Việc cá nhân');
    add('NS02', 'Nghỉ phép', wd(2), 'Sáng', wd(2), 'Chiều', WAIT, '', 'Khám sức khỏe định kỳ');
    add('NS01', 'Công tác', wd(-3), 'Sáng', wd(-1), 'Chiều', OK, AUTO, 'Làm việc với chủ đầu tư tại Hà Nội');
    add('NS11', 'Nghỉ phép', wd(-2), 'Sáng', wd(-2), 'Chiều', NO, 'NS13', 'Việc riêng', 'Trùng lịch nghiệm thu, đề nghị dời ngày');
    add('NS15', 'Nghỉ phép', wd(1), 'Sáng', wd(1), 'Chiều', WAIT, '', 'Làm giấy tờ nhà');
    add('NS10', 'Nghỉ không lương', wd(-12), 'Sáng', wd(-11), 'Chiều', OK, 'NS13', 'Chăm người nhà nằm viện');
    add('NS12', 'Nghỉ phép', wd(-15), 'Chiều', wd(-15), 'Chiều', OK, 'NS13', 'Đi ngân hàng');
    add('NS08', 'Công tác', wd(9), 'Sáng', wd(12), 'Chiều', OK, 'NS13', 'Giám sát thi công bến số 2');
    add('NS14', 'Nghỉ phép', wd(-6), 'Sáng', wd(-6), 'Chiều', OK, 'NS01', 'Việc gia đình');
    add('NS13', 'Nghỉ phép', wd(6), 'Sáng', wd(6), 'Chiều', OK, 'NS01', 'Việc gia đình');

    // Dữ liệu nền các tháng trước để xem tổng kết năm
    var people = staff.filter(function (s) { return s.phong; });
    var rnd = mulberry(7);
    var appr = function (s) {
      if (s.vaiTro === 'GiamDoc') return AUTO;
      if (s.vaiTro === 'PGD') return 'NS01';
      var c = staff.filter(function (x) { return L.phuTrachList(x).indexOf(s.phong) >= 0; })[0];
      return c ? c.ma : 'NS01';
    };
    for (var m = 1; m < cm; m++) {
      var n = 3 + Math.floor(rnd() * 4);
      for (var k = 0; k < n; k++) {
        var s = people[Math.floor(rnd() * people.length)];
        var d = 1 + Math.floor(rnd() * 24);
        var len = rnd() < 0.6 ? 0 : 1 + Math.floor(rnd() * 2);
        var x = rnd(), loai = x < 0.65 ? 'Nghỉ phép' : x < 0.85 ? 'Công tác' : 'Nghỉ không lương';
        var half = len === 0 && loai !== 'Công tác' && rnd() < 0.3;
        var tu = L.ymd(y, m, d), den = L.ymd(y, m, Math.min(L.daysInMonth(y, m), d + len));
        var pmOnly = half && rnd() < 0.5;
        add(s.ma, loai, tu, pmOnly ? 'Chiều' : 'Sáng', den, half && !pmOnly ? 'Sáng' : 'Chiều', OK, appr(s),
            loai === 'Công tác' ? 'Công tác dự án' : 'Việc gia đình');
      }
    }
    return { staff: staff, types: types, holidays: holidays, requests: reqs };
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
    if (raw) try { return JSON.parse(raw); } catch (e) { /* tạo lại */ }
    var db = demoSeed();
    localStorage.setItem(DEMO_KEY, JSON.stringify(db));
    return db;
  }
  function demoSave(db) { localStorage.setItem(DEMO_KEY, JSON.stringify(db)); }

  function demoCall(b) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try { resolve(demoRoute(b)); } catch (e) { reject(e); }
      }, 150);
    });
  }

  var GD_ROLES = ['NhanVien', 'TruongPhong', 'PGD'];
  function newPin() { return String(100000 + Math.floor(Math.random() * 900000)); }
  function cleanPhuTrach(v) {
    var list = Array.isArray(v) ? v : String(v || '').split(';');
    return list.map(function (x) { return String(x).trim(); }).filter(Boolean).join('; ');
  }

  function demoRoute(b) {
    var db = demoDb();
    var me = db.staff.filter(function (s) { return s.ma === String(b.ma || '').toUpperCase(); })[0];
    if (!me || me.pin !== String(b.pin) || me.trangThai === 'Nghỉ việc')
      throw new Error('Mã NV hoặc PIN không đúng (demo: ADMIN, NS01 … NS15, PIN 111111)');
    var byMa = function (ma) { return db.staff.filter(function (x) { return x.ma === ma; })[0]; };
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

    switch (b.action) {
      case 'login': return { ok: true, me: pubMe };
      case 'data':
        return {
          ok: true, me: pubMe,
          staff: db.staff.filter(function (s) { return manage || s.trangThai !== 'Nghỉ việc'; }).map(function (s) {
            return { ma: s.ma, ten: s.ten, phong: s.phong, chucDanh: s.chucDanh, vaiTro: s.vaiTro, phuTrach: s.phuTrach,
                     trangThai: s.trangThai };
          }),
          types: db.types, holidays: db.holidays,
          requests: db.requests.filter(function (r) {
            if (r.trangThai === ST.CANCELLED) return false;
            if (r.trangThai === ST.REJECTED) return r.ma === me.ma || canApprove(r);
            return true;
          }).map(function (r) {
            var o = Object.assign({}, r);
            if (!L.canSeeReason(me, byMa(r.ma))) { o.lyDo = ''; o.ghiChuDuyet = ''; }
            o.canApprove = canApprove(r);
            o.soNgay = L.expandLeave(r, hset).reduce(function (a, x) { return a + x.v; }, 0);
            return o;
          })
        };
      case 'create': {
        var q = b.req || {};
        var ma = String(q.ma || me.ma).toUpperCase();
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
      case 'changePin':
        if (!/^\d{6,8}$/.test(String(b.newPin))) throw new Error('PIN mới phải gồm 6–8 chữ số');
        me.pin = String(b.newPin); demoSave(db);
        return { ok: true };
      case 'saveStaff': {
        if (!manage) throw new Error('Bạn không có quyền quản lý tài khoản');
        var d = b.staff || {}, sma = String(d.ma || '').trim().toUpperCase(), role = String(d.vaiTro || 'NhanVien');
        if (!/^[A-Z0-9_.-]{2,20}$/.test(sma)) throw new Error('Mã NV chỉ gồm chữ không dấu, số; 2–20 ký tự');
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
          var pin = newPin();
          vals.ma = sma; vals.pin = pin;
          db.staff.push(vals); demoSave(db);
          return { ok: true, saved: sma, pin: pin };
        }
        if (!target) throw new Error('Không tìm thấy nhân sự ' + sma);
        Object.assign(target, vals); demoSave(db);
        return { ok: true, saved: sma };
      }
      case 'resetPin': {
        requireAdmin();
        var t2 = byMa(String(b.target || '').toUpperCase());
        if (!t2) throw new Error('Không tìm thấy nhân sự');
        t2.pin = newPin(); demoSave(db);
        return { ok: true, ma: t2.ma, pin: t2.pin };
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

  global.Api = {
    demo: DEMO,
    call: function (payload) { return DEMO ? demoCall(payload) : callReal(payload); },
    resetDemo: function () { localStorage.removeItem(DEMO_KEY); },
    demoAs: DEMO_AS, demoPin: DEMO_PIN
  };
})(window);
