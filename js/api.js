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
  var DEMO_KEY = 'np_demo_v2';
  var AUTO = '(tự động)';

  function demoSeed() {
    var y = new Date().getFullYear();
    var phongs = ['Ban Giám đốc', 'Phòng Kỹ thuật', 'Phòng Dự án'];
    var staff = [
      ['ADMIN', 'Quản trị hệ thống', '', 'Quản trị', 'Admin', ''],
      ['NS01', 'Nguyễn Văn An', phongs[0], 'Giám đốc', 'GiamDoc', ''],
      ['NS02', 'Trần Thị Bình', phongs[0], 'Phó Giám đốc', 'PGD', phongs[1]],
      ['NS13', 'Phan Quốc Trung', phongs[0], 'Phó Giám đốc', 'PGD', phongs[2]],
      ['NS03', 'Lê Hoàng Cường', phongs[1], 'Trưởng phòng', 'NhanVien', ''],
      ['NS04', 'Phạm Minh Dũng', phongs[1], 'Thành viên', 'NhanVien', ''],
      ['NS05', 'Võ Thu Hà', phongs[1], 'Thành viên', 'NhanVien', ''],
      ['NS06', 'Đặng Quốc Huy', phongs[1], 'Thành viên', 'NhanVien', ''],
      ['NS07', 'Bùi Thanh Lan', phongs[1], 'Thành viên', 'NhanVien', ''],
      ['NS08', 'Hồ Đức Minh', phongs[2], 'Trưởng phòng', 'NhanVien', ''],
      ['NS09', 'Ngô Bảo Ngọc', phongs[2], 'Thành viên', 'NhanVien', ''],
      ['NS10', 'Đỗ Gia Phúc', phongs[2], 'Thành viên', 'NhanVien', ''],
      ['NS11', 'Lý Mỹ Quyên', phongs[2], 'Thành viên', 'NhanVien', ''],
      ['NS12', 'Mai Văn Sơn', phongs[2], 'Thành viên', 'NhanVien', '']
    ].map(function (a, i) {
      return { ma: a[0], ten: a[1], phong: a[2], chucDanh: a[3], vaiTro: a[4], phuTrach: a[5],
               phepNam: 12, phepTon: i % 3, pin: '111111', trangThai: 'Đang làm' };
    });
    var types = [
      { ten: 'Phép năm', truPhep: true, mau: '#0093DD' },
      { ten: 'Nghỉ ốm', truPhep: false, mau: '#F59E0B' },
      { ten: 'Việc riêng có lương', truPhep: false, mau: '#8B5CF6' },
      { ten: 'Nghỉ không lương', truPhep: false, mau: '#64748B' },
      { ten: 'Nghỉ bù', truPhep: false, mau: '#10B981' }
    ];
    var holidays = [
      [y + '-01-01', 'Tết Dương lịch'], [y + '-04-30', 'Giải phóng miền Nam'], [y + '-05-01', 'Quốc tế Lao động'],
      [y + '-09-02', 'Quốc khánh'], [(y + 1) + '-01-01', 'Tết Dương lịch']
    ].map(function (h) { return { ngay: h[0], ten: h[1] }; });

    // Đơn giả rải đều các tháng tới tháng hiện tại
    var people = staff.filter(function (s) { return s.phong; });
    var reqs = [], seq = 1, cm = new Date().getMonth() + 1;
    var rnd = mulberry(42);
    var tnames = types.map(function (t) { return t.ten; });
    for (var m = 1; m <= Math.min(12, cm + 1); m++) {
      var n = 4 + Math.floor(rnd() * 4);
      for (var k = 0; k < n; k++) {
        var s = people[Math.floor(rnd() * people.length)];
        var d = 1 + Math.floor(rnd() * 25);
        var len = rnd() < 0.6 ? 0 : Math.floor(rnd() * 3);
        var half = len === 0 && rnd() < 0.3;
        var pending = L.needsApproval(s) && m >= cm && rnd() < 0.5;
        var r = {
          id: 'DEMO' + (seq++), ma: s.ma, ten: s.ten,
          loai: rnd() < 0.6 ? tnames[0] : tnames[1 + Math.floor(rnd() * 4)],
          tuNgay: L.ymd(y, m, d), tuBuoi: half && rnd() < 0.5 ? 'Chiều' : 'Sáng',
          denNgay: L.ymd(y, m, Math.min(L.daysInMonth(y, m), d + len)), denBuoi: 'Chiều',
          lyDo: 'Việc gia đình', ngayTao: L.ymd(y, m, Math.max(1, d - 2)) + ' 08:00',
          nguoiDuyet: pending ? '' : 'Nguyễn Văn An', ngayDuyet: pending ? '' : L.ymd(y, m, Math.max(1, d - 1)) + ' 09:00',
          ghiChuDuyet: '', trangThai: pending ? ST.PENDING : ST.APPROVED
        };
        if (r.tuBuoi === 'Sáng' && half) r.denBuoi = 'Sáng';
        reqs.push(r);
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

  function newPin() { return String(100000 + Math.floor(Math.random() * 900000)); }
  function cleanPhuTrach(v) {
    var list = Array.isArray(v) ? v : String(v || '').split(';');
    return list.map(function (x) { return String(x).trim(); }).filter(Boolean).join('; ');
  }

  function demoRoute(b) {
    var db = demoDb();
    var me = db.staff.filter(function (s) { return s.ma === String(b.ma || '').toUpperCase(); })[0];
    if (!me || me.pin !== String(b.pin) || me.trangThai === 'Nghỉ việc')
      throw new Error('Mã NV hoặc PIN không đúng (demo: ADMIN, NS01 … NS13, PIN 111111)');
    var byMa = function (ma) { return db.staff.filter(function (x) { return x.ma === ma; })[0]; };
    var canApprove = function (r) { return L.canApprove(me, byMa(r.ma)); };
    var manage = me.vaiTro === 'Admin' || me.vaiTro === 'GiamDoc';
    var pubMe = {
      ma: me.ma, ten: me.ten, phong: me.phong, chucDanh: me.chucDanh, vaiTro: me.vaiTro, phuTrach: me.phuTrach,
      isAdmin: me.vaiTro === 'Admin', isApprover: L.isApprover(me), canManage: manage
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
                     phepNam: s.phepNam, phepTon: s.phepTon, trangThai: s.trangThai };
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
        if (!q.loai) throw new Error('Chưa nhập loại nghỉ');
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
        if (!/^\d{4,8}$/.test(String(b.newPin))) throw new Error('PIN mới phải gồm 4–8 chữ số');
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
          if (target.vaiTro !== 'NhanVien' && target.vaiTro !== 'PGD') throw new Error('Giám đốc chỉ điều chỉnh tài khoản Cá nhân và Phó Giám đốc');
          if (role !== 'NhanVien' && role !== 'PGD') throw new Error('Giám đốc chỉ nâng lên Phó Giám đốc hoặc hạ về Cá nhân');
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
          phuTrach: role === 'PGD' ? cleanPhuTrach(d.phuTrach) : '',
          phepNam: d.phepNam === '' || d.phepNam == null ? 12 : Number(d.phepNam), phepTon: Number(d.phepTon || 0), trangThai: tt
        };
        if (isNaN(vals.phepNam) || isNaN(vals.phepTon)) throw new Error('Số ngày phép không hợp lệ');
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
          list.push({ ten: tn.slice(0, 60), truPhep: !!x.truPhep, mau: /^#[0-9a-f]{6}$/i.test(String(x.mau)) ? String(x.mau).toUpperCase() : '#64748B' });
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
    resetDemo: function () { localStorage.removeItem(DEMO_KEY); }
  };
})(window);
