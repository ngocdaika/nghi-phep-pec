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

  /* ---------------- DEMO ---------------- */
  var DEMO_KEY = 'np_demo_v1';

  function demoSeed() {
    var y = new Date().getFullYear();
    var phongs = ['Ban Giám đốc', 'Phòng Kỹ thuật', 'Phòng Dự án'];
    var staff = [
      ['NS01', 'Nguyễn Văn An', phongs[0], 'Giám đốc', 'Admin', ''],
      ['NS02', 'Trần Thị Bình', phongs[0], 'Phó Giám đốc', 'Duyet', 'NS01'],
      ['NS03', 'Lê Hoàng Cường', phongs[1], 'Trưởng phòng', 'Duyet', 'NS02'],
      ['NS04', 'Phạm Minh Dũng', phongs[1], 'Thành viên', 'NhanVien', 'NS03'],
      ['NS05', 'Võ Thu Hà', phongs[1], 'Thành viên', 'NhanVien', 'NS03'],
      ['NS06', 'Đặng Quốc Huy', phongs[1], 'Thành viên', 'NhanVien', 'NS03'],
      ['NS07', 'Bùi Thanh Lan', phongs[1], 'Thành viên', 'NhanVien', 'NS03'],
      ['NS08', 'Hồ Đức Minh', phongs[2], 'Trưởng phòng', 'Duyet', 'NS02'],
      ['NS09', 'Ngô Bảo Ngọc', phongs[2], 'Thành viên', 'NhanVien', 'NS08'],
      ['NS10', 'Đỗ Gia Phúc', phongs[2], 'Thành viên', 'NhanVien', 'NS08'],
      ['NS11', 'Lý Mỹ Quyên', phongs[2], 'Thành viên', 'NhanVien', 'NS08'],
      ['NS12', 'Mai Văn Sơn', phongs[2], 'Thành viên', 'NhanVien', 'NS08']
    ].map(function (a, i) {
      return { ma: a[0], ten: a[1], phong: a[2], chucDanh: a[3], vaiTro: a[4], nguoiDuyet: a[5],
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
    var reqs = [], seq = 1, cm = new Date().getMonth() + 1;
    var rnd = mulberry(42);
    var tnames = types.map(function (t) { return t.ten; });
    for (var m = 1; m <= Math.min(12, cm + 1); m++) {
      var n = 4 + Math.floor(rnd() * 4);
      for (var k = 0; k < n; k++) {
        var s = staff[Math.floor(rnd() * staff.length)];
        var d = 1 + Math.floor(rnd() * 25);
        var len = rnd() < 0.6 ? 0 : Math.floor(rnd() * 3);
        var half = len === 0 && rnd() < 0.3;
        var r = {
          id: 'DEMO' + (seq++), ma: s.ma, ten: s.ten,
          loai: rnd() < 0.6 ? tnames[0] : tnames[1 + Math.floor(rnd() * 4)],
          tuNgay: L.ymd(y, m, d), tuBuoi: half && rnd() < 0.5 ? 'Chiều' : 'Sáng',
          denNgay: L.ymd(y, m, Math.min(L.daysInMonth(y, m), d + len)), denBuoi: 'Chiều',
          lyDo: 'Việc gia đình', ngayTao: L.ymd(y, m, Math.max(1, d - 2)) + ' 08:00',
          nguoiDuyet: '', ngayDuyet: '', ghiChuDuyet: '',
          trangThai: m >= cm && rnd() < 0.5 ? ST.PENDING : ST.APPROVED
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

  function demoRoute(b) {
    var db = demoDb();
    var me = db.staff.filter(function (s) { return s.ma === String(b.ma || '').toUpperCase(); })[0];
    if (!me || me.pin !== String(b.pin)) throw new Error('Mã NV hoặc PIN không đúng (demo: NS01 … NS12, PIN 111111)');
    var ctx = { me: me, staff: db.staff };
    var approverOf = function (ma) { var s = db.staff.filter(function (x) { return x.ma === ma; })[0]; return s ? s.nguoiDuyet : ''; };
    var canApprove = function (r) {
      var a = approverOf(r.ma);
      if (a === me.ma && r.ma !== me.ma) return true;
      return me.vaiTro === 'Admin' && (r.ma !== me.ma || !a);
    };
    var pubMe = {
      ma: me.ma, ten: me.ten, phong: me.phong, chucDanh: me.chucDanh, vaiTro: me.vaiTro, isAdmin: me.vaiTro === 'Admin',
      isApprover: me.vaiTro === 'Admin' || db.staff.some(function (s) { return s.nguoiDuyet === me.ma; })
    };
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
          staff: db.staff.map(function (s) {
            return { ma: s.ma, ten: s.ten, phong: s.phong, chucDanh: s.chucDanh, nguoiDuyet: s.nguoiDuyet, phepNam: s.phepNam, phepTon: s.phepTon };
          }),
          types: db.types, holidays: db.holidays,
          requests: db.requests.filter(function (r) {
            if (r.trangThai === ST.CANCELLED) return false;
            if (r.trangThai === ST.REJECTED) return r.ma === me.ma || canApprove(r);
            return true;
          }).map(function (r) {
            var o = Object.assign({}, r);
            var see = r.ma === me.ma || me.vaiTro === 'Admin' || approverOf(r.ma) === me.ma;
            if (!see) { o.lyDo = ''; o.ghiChuDuyet = ''; }
            o.canApprove = canApprove(r);
            o.soNgay = L.expandLeave(r, hset).reduce(function (a, x) { return a + x.v; }, 0);
            return o;
          })
        };
      case 'create': {
        var q = b.req || {};
        var ma = String(q.ma || me.ma).toUpperCase();
        if (ma !== me.ma && me.vaiTro !== 'Admin') throw new Error('Bạn chỉ được khai nghỉ cho chính mình');
        var person = db.staff.filter(function (s) { return s.ma === ma; })[0];
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
        var auto = !person.nguoiDuyet;
        var r = {
          id: 'DEMO' + Date.now(), ma: ma, ten: person.ten, loai: q.loai, tuNgay: q.tuNgay, tuBuoi: q.tuBuoi,
          denNgay: q.denNgay, denBuoi: q.denBuoi, lyDo: q.lyDo || '', ngayTao: now,
          trangThai: auto ? ST.APPROVED : ST.PENDING, nguoiDuyet: auto ? '(tự động)' : '', ngayDuyet: auto ? now : '', ghiChuDuyet: ''
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
        var own = r3.ma === me.ma && r3.trangThai === ST.PENDING;
        if (!own && !canApprove(r3)) throw new Error('Chỉ hủy được đơn của mình khi còn chờ duyệt');
        r3.trangThai = ST.CANCELLED; demoSave(db);
        return { ok: true };
      }
      case 'changePin':
        if (!/^\d{4,8}$/.test(String(b.newPin))) throw new Error('PIN mới phải gồm 4–8 chữ số');
        me.pin = String(b.newPin); demoSave(db);
        return { ok: true };
      default: throw new Error('Thao tác không hỗ trợ');
    }
  }

  global.Api = {
    demo: DEMO,
    call: function (payload) { return DEMO ? demoCall(payload) : callReal(payload); },
    resetDemo: function () { localStorage.removeItem(DEMO_KEY); }
  };
})(window);
