(function () {
  'use strict';
  var L = window.Logic, ST = L.ST, Api = window.Api, cfg = window.APP_CONFIG || {};
  var AUTH_KEY = 'np_auth' + (Api.demo ? '_demo' : '');
  var OTHER_COLOR = '#EC4899';
  // Bản demo, chế độ chụp ảnh hướng dẫn: ?demo=1&shot&as=<mã> (vào thẳng vai trò), &as=login, &first (màn hình đổi mật khẩu)
  var QS = new URLSearchParams(location.search), SHOT = Api.demo && QS.has('shot');

  var now = new Date();
  var S = {
    auth: null, me: null, staff: [], types: [], typeMap: {}, holidays: {}, holidayName: {}, requests: [], index: null,
    view: 'calendar', y: now.getFullYear(), m: now.getMonth() + 1, sumYear: now.getFullYear(), sumMonth: now.getMonth() + 1, sumMode: 'month', phong: '',
    form: null, lastLoad: 0
  };

  var SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
  var VIEWS = [
    { id: 'calendar', label: 'Lịch tháng', icon: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>' },
    { id: 'form', label: 'Khai nghỉ', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>' },
    { id: 'approve', label: 'Duyệt', approver: true, icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>' },
    { id: 'summary', label: 'Tổng kết', icon: '<path d="M3 3v18h18"/><path d="M7 16v-5M12 16V7M17 16v-8"/>' },
    { id: 'me', label: 'Cá nhân', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>' },
    { id: 'admin', label: 'Quản trị', manage: true, icon: '<path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6z"/><path d="M9 12l2 2 4-4"/>' }
  ];
  function canView(v) {
    if (v.approver) return !!(S.me && S.me.isApprover);
    if (v.manage) return !!(S.me && S.me.canManage);
    return true;
  }

  /* ---------------- Tiện ích ---------------- */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  var toastTimer;
  function toast(msg, bad) {
    if (SHOT) return;
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, bad ? 5000 : 2800);
  }
  function colorOf(loai) {
    var c = S.typeMap[loai] && S.typeMap[loai].mau;
    return /^#[0-9a-f]{6}$/i.test(c || '') ? c : OTHER_COLOR;
  }
  function statusChip(st) {
    var c = st === ST.PENDING ? 'pending' : st === ST.APPROVED ? 'approved' : 'rejected';
    return '<span class="chip ' + c + '">' + esc(st) + '</span>';
  }
  function person(ma) { for (var i = 0; i < S.staff.length; i++) if (S.staff[i].ma === ma) return S.staff[i]; return null; }
  function daysOf(r) { return L.expandLeave(r, S.holidays); }
  function countOf(r) { return daysOf(r).reduce(function (a, x) { return a + x.v; }, 0); }
  function fmtRange(r) {
    var a = L.viDate(r.tuNgay), b = L.viDate(r.denNgay);
    if (r.tuNgay === r.denNgay) {
      if (r.tuBuoi === 'Chiều') return a + ' (buổi chiều)';
      if (r.denBuoi === 'Sáng') return a + ' (buổi sáng)';
      return a;
    }
    return a + (r.tuBuoi === 'Chiều' ? ' (chiều)' : '') + ' → ' + b + (r.denBuoi === 'Sáng' ? ' (sáng)' : '');
  }
  function initials(name) {
    var p = String(name).trim().split(/\s+/);
    return ((p.length > 1 ? p[p.length - 2][0] : '') + p[p.length - 1][0]).toUpperCase();
  }
  /** Admin, Giám đốc, PGĐ, Trưởng/Phó phòng xem tổng kết của mọi người; Nhân viên chỉ xem của mình */
  function seeAll() { return L.canSeeAllTotals(S.me); }
  function canSeeTotals(ma) { return seeAll() || (S.me && S.me.ma === ma); }
  function ctNote(v) { return v ? '<span class="ct">' + L.fmtNum(v) + ' CT</span>' : ''; }
  /** Nhân sự hiện trên lịch: đang làm và có phòng (tài khoản quản trị không thuộc phòng nào thì ẩn) */
  function activeStaff() { return S.staff.filter(function (s) { return s.phong && s.trangThai !== 'Nghỉ việc'; }); }
  function phongList() {
    var seen = {}, out = [];
    activeStaff().forEach(function (s) { if (!seen[s.phong]) { seen[s.phong] = 1; out.push(s.phong); } });
    return out;
  }
  function filteredStaff() { return activeStaff().filter(function (s) { return !S.phong || s.phong === S.phong; }); }
  function approverText(p) {
    if (!p || !p.ma) return '';
    var list = L.primaryApprovers(S.staff, p);
    return list.length ? list.map(function (s) { return s.ten; }).join(' hoặc ') : '';
  }
  function roleChip(role) { return '<span class="role ' + esc(role) + '">' + esc(L.ROLES[role] || role) + '</span>'; }
  function phongSelect(id) {
    return '<select id="' + id + '" aria-label="Lọc theo phòng"><option value="">Tất cả phòng</option>' +
      phongList().map(function (p) { return '<option' + (p === S.phong ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') +
      '</select>';
  }
  function ownCancelable(r) { return r.ma === S.me.ma && (r.trangThai === ST.PENDING || r.nguoiDuyet === '(tự động)'); }
  function pendingForMe() { return S.requests.filter(function (r) { return r.canApprove && r.trangThai === ST.PENDING; }); }

  /* ---------------- Đăng nhập & dữ liệu ---------------- */
  /* Trình duyệt chỉ giữ mã phiên do máy chủ cấp (không lưu mật khẩu).
     "Giữ đăng nhập 30 ngày" → localStorage; không chọn → sessionStorage (đóng trình duyệt là thoát). */
  function saveAuth(a) {
    S.auth = a;
    try { localStorage.removeItem(AUTH_KEY); sessionStorage.removeItem(AUTH_KEY); } catch (e) { /* bỏ qua */ }
    if (a) (a.remember ? localStorage : sessionStorage).setItem(AUTH_KEY, JSON.stringify(a));
  }
  function loadAuth() {
    var a = null;
    try { a = JSON.parse(sessionStorage.getItem(AUTH_KEY) || localStorage.getItem(AUTH_KEY)); } catch (e) { a = null; }
    if (!a || !a.token || !(a.exp > Date.now())) { saveAuth(null); return null; } // bản cũ lưu Mã + PIN → bỏ, đăng nhập lại
    return a;
  }
  /** Điện thoại: sau khi đăng nhập đưa màn hình về đúng kích thước (bỏ phóng to do lúc gõ ô nhập) */
  function fitScreen() {
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    var vp = document.querySelector('meta[name=viewport]'), orig = vp.getAttribute('content');
    vp.setAttribute('content', orig.replace(/,\s*maximum-scale=[^,]*/g, '') + ', maximum-scale=1');
    setTimeout(function () { vp.setAttribute('content', orig); }, 500);
    window.scrollTo(0, 0);
  }
  function authFrom(res, remember) {
    return { token: res.token, exp: res.exp, remember: !!remember, ma: res.me ? res.me.ma : '' };
  }

  var pendingFirst = null; // { ma, pin, remember } khi phải đổi mật khẩu mặc định
  function showLogin(msg) {
    $('login').hidden = false;
    $('loginForm').hidden = false;
    $('firstPinForm').hidden = true;
    pendingFirst = null;
    $('userChip').hidden = true;
    $('loginErr').textContent = msg || '';
    setTimeout(function () { $('loginMa').focus(); }, 50);
  }
  function showFirstPin(me) {
    $('loginForm').hidden = true;
    $('firstPinForm').hidden = false;
    $('firstPinForm').reset();
    $('firstPinWho').textContent = me.ten + ' · ' + me.ma;
    $('firstPinUser').value = me.ma;
    $('firstPinErr').textContent = '';
    setTimeout(function () { $('firstPinForm').elements.p1.focus(); }, 50);
  }

  /* ---------------- Bản demo: chuyển vai trò ---------------- */
  function renderDemoBar() {
    if (!Api.demo || SHOT) return;
    var cur = S.auth && S.auth.ma;
    var btns = Api.demoAs().map(function (o) {
      return '<button type="button" class="role-btn' + (o.ma === cur ? ' on' : '') + '" data-demo-as="' + o.ma + '">' + esc(o.label) + '</button>';
    }).join('');
    $('demoBanner').innerHTML = '<span class="demo-tag">DEMO</span><span class="demo-lbl">Xem với vai trò:</span><div class="role-btns">' + btns + '</div>';
    $('demoRoles').innerHTML = '<div class="small muted" style="margin:14px 0 8px">Bản demo – chọn vai trò để xem giao diện</div><div class="role-btns">' + btns + '</div>';
    $('demoRoles').hidden = false;
    $('loginHint').textContent = 'Bản demo: nhập mã nhân sự bất kỳ (VD: ngoc.nhk) và mật khẩu bất kỳ. Mã không có trong danh sách sẽ vào bằng Quản trị. Nhập mật khẩu 123456 để thử màn hình đổi mật khẩu lần đầu.' +
      (Api.fromSheet() ? ' Danh sách nhân sự lấy từ Google Sheet; các đơn nghỉ là giả định.' : '');
  }
  function demoSwitch(ma) {
    saveAuth({ token: Api.demoToken(ma), exp: Date.now() + 30 * 86400000, remember: true, ma: ma });
    S.form = null; S.phong = '';
    closeModal();
    if (!$('login').hidden) fitScreen();
    loadData().then(function () { renderDemoBar(); if (S.me) toast('Đang xem với vai trò ' + (L.ROLES[S.me.vaiTro] || '') + ': ' + S.me.ten); });
  }

  function call(action, extra) {
    var p = { action: action, token: S.auth.token };
    for (var k in extra) p[k] = extra[k];
    return Api.call(p);
  }

  function loadData(silent) {
    if (!silent && !S.index) $('view-calendar').innerHTML = '<div class="loading">Đang tải dữ liệu…</div>';
    return call('data').then(function (d) {
      S.me = d.me; S.staff = d.staff; S.types = d.types; S.requests = d.requests;
      S.typeMap = {}; d.types.forEach(function (t) { S.typeMap[t.ten] = t; });
      S.holidays = {}; S.holidayName = {};
      d.holidays.forEach(function (h) { S.holidays[h.ngay] = true; S.holidayName[h.ngay] = h.ten; });
      S.index = L.buildIndex(S.requests, S.holidays, S.typeMap);
      S.lastLoad = Date.now();
      $('login').hidden = true;
      var chip = $('userChip');
      chip.hidden = false;
      chip.textContent = S.me.ten;
      renderTabs();
      show(S.view);
    }).catch(function (e) {
      if (/Phiên đăng nhập|mật khẩu|Mã NV/.test(e.message)) { saveAuth(null); S.me = null; showLogin(e.message); }
      else toast(e.message, true);
    });
  }

  /* ---------------- Điều hướng ---------------- */
  function renderTabs() {
    var pend = pendingForMe().length;
    $('tabs').innerHTML = VIEWS.filter(canView).map(function (v) {
      return '<button type="button" class="tab' + (v.id === S.view ? ' active' : '') + '" data-view="' + v.id + '" title="' + v.label + '">' +
        SVG + v.icon + '</svg><span class="lbl">' + v.label + '</span>' +
        (v.id === 'approve' && pend ? '<span class="badge">' + pend + '</span>' : '') + '</button>';
    }).join('');
  }

  function show(view) {
    var vdef = VIEWS.filter(function (v) { return v.id === view; })[0];
    if (!vdef || !canView(vdef)) view = 'calendar';
    S.view = view;
    VIEWS.forEach(function (v) { $('view-' + v.id).hidden = v.id !== view; });
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-view') === view);
    });
    if (location.hash !== '#' + view) history.replaceState(null, '', '#' + view);
    ({ calendar: renderCalendar, form: renderForm, approve: renderApprove, summary: renderSummary, me: renderMe, admin: renderAdmin })[view]();
    window.scrollTo(0, 0);
  }

  /* ---------------- Lịch tháng ---------------- */
  function renderCalendar() {
    var y = S.y, m = S.m, n = L.daysInMonth(y, m), today = L.todayYMD();
    // Nhân viên chỉ xem lịch của chính mình (máy chủ cũng không gửi đơn của người khác)
    var mineOnly = S.me.vaiTro === 'NhanVien';
    var staff = mineOnly ? [person(S.me.ma) || S.me] : filteredStaff();
    var todayStaff = mineOnly ? activeStaff() : staff; // Hôm nay vắng mặt: nhân viên cũng xem được cả đơn vị
    var h = [];

    h.push('<div class="toolbar">',
      '<button class="btn icon" data-act="prev" aria-label="Tháng trước">◀</button>',
      '<h2>Tháng ' + m + '/' + y + '</h2>',
      '<button class="btn icon" data-act="next" aria-label="Tháng sau">▶</button>',
      '<button class="btn" data-act="thisMonth">Hôm nay</button>',
      '<span class="spacer"></span>', mineOnly ? '' : phongSelect('calPhong'),
      '<button class="btn primary" data-goto="form">+ Khai nghỉ</button>',
      '</div>');

    // Thẻ thống kê
    var todayList = [];
    todayStaff.forEach(function (s) {
      var e = S.index.byPerson[s.ma] && S.index.byPerson[s.ma][today];
      if (e) e.forEach(function (x) { todayList.push({ s: s, x: x }); });
    });
    var monthTotal = 0, monthPeople = 0, monthPending = 0, monthCT = 0, ctPeople = 0;
    staff.forEach(function (s) {
      var yt0 = L.yearTotals(S.index, s.ma, y), t = yt0.months[m - 1], c = yt0.ctMonths[m - 1];
      monthTotal += t; if (t) monthPeople++;
      monthCT += c; if (c) ctPeople++;
      var p = S.index.byPerson[s.ma] || {};
      for (var d = 1; d <= n; d++) (p[L.ymd(y, m, d)] || []).forEach(function (x) { if (x.req.trangThai === ST.PENDING) monthPending += x.v; });
    });
    var pend = pendingForMe();
    var myPend = S.requests.filter(function (r) { return r.ma === S.me.ma && r.trangThai === ST.PENDING; }).length;
    var myY = L.yearTotals(S.index, S.me.ma, y);

    h.push('<div class="stats">');
    h.push('<div class="stat accent"><div class="k">Hôm nay vắng mặt</div><div class="v">' + todayList.length + ' <small>người</small></div><div class="names">' +
      (todayList.length ? todayList.map(function (o) {
        return '<button class="person-chip' + (o.x.req.trangThai === ST.PENDING ? ' pending' : '') + '" data-req="' + esc(o.x.req.id) + '"><span class="dot" style="background:' + colorOf(o.x.req.loai) + '"></span>' +
          esc(o.s.ten) + ' <em>' + esc(o.x.req.loai) + (o.x.part !== 'full' ? ', ' + (o.x.part === 'am' ? 'sáng' : 'chiều') : '') + '</em></button>';
      }).join('') : '<span class="muted small">Đủ quân số</span>') + '</div></div>');
    if (seeAll()) {
      h.push('<div class="stat"><div class="k">Tổng ngày nghỉ tháng ' + m + '</div><div class="v">' + L.fmtNum(monthTotal) + ' <small>ngày · ' + monthPeople + ' người</small></div>' +
        (monthPending ? '<div class="small" style="color:var(--warn);font-weight:600;margin-top:4px">Có ' + L.fmtNum(monthPending) + ' ngày đang chờ duyệt</div>' : '') + '</div>');
      h.push('<div class="stat"><div class="k">Công tác tháng ' + m + '</div><div class="v">' + L.fmtNum(monthCT) + ' <small>ngày · ' + ctPeople + ' người</small></div></div>');
    } else {
      h.push('<div class="stat" style="cursor:pointer" data-goto="summary"><div class="k">Tôi nghỉ tháng ' + m + '</div><div class="v">' + L.fmtNum(myY.months[m - 1]) + ' <small>ngày</small></div>' +
        (myY.ctMonths[m - 1] ? '<div class="small muted">Công tác ' + L.fmtNum(myY.ctMonths[m - 1]) + ' ngày</div>' : '') + '</div>');
      h.push('<div class="stat" style="cursor:pointer" data-goto="summary"><div class="k">Tôi nghỉ năm ' + y + '</div><div class="v">' + L.fmtNum(myY.total) + ' <small>ngày</small></div>' +
        (myY.ct ? '<div class="small muted">Công tác ' + L.fmtNum(myY.ct) + ' ngày</div>' : '') + '</div>');
    }
    if (S.me.isApprover) {
      h.push('<div class="stat" style="cursor:pointer" data-goto="approve"><div class="k">Đơn chờ tôi duyệt</div><div class="v"' + (pend.length ? ' style="color:var(--warn)"' : '') + '>' + pend.length + ' <small>đơn</small></div><div class="small muted">Bấm để xem</div></div>');
    } else {
      h.push('<div class="stat" style="cursor:pointer" data-goto="me"><div class="k">Đơn của tôi chờ duyệt</div><div class="v"' + (myPend ? ' style="color:var(--warn)"' : '') + '>' + myPend + ' <small>đơn</small></div></div>');
    }
    h.push('</div>');

    // Bảng lịch
    h.push('<div class="grid-wrap"><table class="cal"><thead><tr><th class="name">Họ tên</th>');
    for (var d = 1; d <= n; d++) {
      var s = L.ymd(y, m, d), wd = L.dow(s);
      var cls = 'd' + (wd === 0 ? ' sun' : '') + (S.holidays[s] ? ' hol' : '') + (s === today ? ' today' : '');
      h.push('<th class="' + cls + '"' + (S.holidayName[s] ? ' title="' + esc(S.holidayName[s]) + '"' : '') + '>' + d + '<span class="wd">' + L.DOW[wd] + '</span></th>');
    }
    var showSum = seeAll();
    if (showSum) h.push('<th class="sum" title="Số ngày nghỉ (không gồm công tác)">Nghỉ<br>T' + m + '</th><th class="sum" title="Số ngày nghỉ cả năm (không gồm công tác)">Nghỉ<br>' + y + '</th>');
    h.push('</tr></thead><tbody>');

    var lastPhong = null;
    staff.forEach(function (st) {
      if (st.phong !== lastPhong) {
        lastPhong = st.phong;
        h.push('<tr class="grp"><td colspan="' + (n + (showSum ? 3 : 1)) + '"><span class="grp-label">' + esc(st.phong) + '</span></td></tr>');
      }
      var p = S.index.byPerson[st.ma] || {};
      var yt = L.yearTotals(S.index, st.ma, y);
      var mPend = 0;
      h.push('<tr' + (st.ma === S.me.ma ? ' class="mine"' : '') + '><td class="name" data-person="' + esc(st.ma) + '" title="' + esc(st.ten + ' – ' + st.chucDanh) + '">' +
        esc(st.ten) + '<small>' + esc(st.chucDanh) + '</small></td>');
      for (var d2 = 1; d2 <= n; d2++) {
        var s2 = L.ymd(y, m, d2), wd2 = L.dow(s2);
        var cls2 = 'd' + (wd2 === 0 ? ' sun' : '') + (S.holidays[s2] ? ' hol' : '') + (s2 === today ? ' today' : '');
        var e = p[s2];
        if (e) {
          var tip = e.map(function (x) {
            if (x.req.trangThai === ST.PENDING) mPend += x.v;
            return x.req.loai + (x.part !== 'full' ? ' (' + (x.part === 'am' ? 'sáng' : 'chiều') + ')' : '') + ' – ' + x.req.trangThai;
          }).join('\n');
          h.push('<td class="' + cls2 + ' has" data-ma="' + esc(st.ma) + '" data-d="' + s2 + '" title="' + esc(st.ten + ' · ' + L.viDate(s2) + '\n' + tip) + '">' +
            e.map(function (x) {
              return '<span class="seg ' + x.part + (x.req.trangThai === ST.PENDING ? ' pending' : '') + '" style="--c:' + colorOf(x.req.loai) + '"></span>';
            }).join('') + '</td>');
        } else {
          h.push('<td class="' + cls2 + '"></td>');
        }
      }
      if (showSum) {
        var mt = yt.months[m - 1];
        h.push('<td class="sum' + (mt ? '' : ' zero') + '">' + L.fmtNum(mt) + ctNote(yt.ctMonths[m - 1]) + (mPend ? '<span class="p">' + L.fmtNum(mPend) + ' chờ</span>' : '') + '</td>');
        h.push('<td class="sum' + (yt.total ? '' : ' zero') + '">' + L.fmtNum(yt.total) + ctNote(yt.ct) + '</td>');
      }
      h.push('</tr>');
    });
    if (!staff.length) h.push('<tr><td class="name">Không có nhân sự</td></tr>');
    h.push('</tbody></table></div>');

    // Chú thích: các loại nghỉ + Chờ duyệt + Nửa ngày
    var usedTypes = {};
    S.types.forEach(function (t) { usedTypes[t.ten] = 1; });
    S.requests.forEach(function (r) { if (L.isActive(r)) usedTypes[r.loai] = 1; });
    h.push('<div class="legend">' + Object.keys(usedTypes).map(function (t) {
      return '<span><i class="dot" style="background:' + colorOf(t) + '"></i>' + esc(t) + '</span>';
    }).join('') + '<span><i class="dot sw-pending"></i>Chờ duyệt</span><span><i class="dot sw-half"></i>Nửa ngày</span>' +
      '<span><i class="dot" style="background:var(--sun);border:1px solid var(--line)"></i>Chủ nhật</span>' +
      '<span><i class="dot" style="background:var(--hol)"></i>Ngày lễ</span></div>');

    // Danh sách theo ngày
    h.push('<div class="card daylist"><h2>' + (mineOnly ? 'Ngày nghỉ của tôi' : 'Ai nghỉ ngày nào') + ' – Tháng ' + m + '/' + y + '</h2>');
    var any = false;
    for (var d3 = 1; d3 <= n; d3++) {
      var s3 = L.ymd(y, m, d3), items = [];
      staff.forEach(function (st) {
        var e3 = S.index.byPerson[st.ma] && S.index.byPerson[st.ma][s3];
        if (e3) e3.forEach(function (x) { items.push({ st: st, x: x }); });
      });
      if (!items.length) continue;
      any = true;
      h.push('<div class="day"><div class="date' + (s3 === today ? ' today' : '') + '"><b>' + d3 + '</b><span>' + L.DOW[L.dow(s3)] + '</span></div><div class="who">' +
        items.map(function (o) {
          return '<button class="person-chip' + (o.x.req.trangThai === ST.PENDING ? ' pending' : '') + '" data-req="' + esc(o.x.req.id) + '">' +
            '<span class="dot" style="background:' + colorOf(o.x.req.loai) + '"></span>' + esc(o.st.ten) +
            ' <em>' + esc(o.x.req.loai) + (o.x.part !== 'full' ? ', ' + (o.x.part === 'am' ? 'sáng' : 'chiều') : '') +
            (o.x.req.trangThai === ST.PENDING ? ', chờ duyệt' : '') + '</em></button>';
        }).join('') + '</div></div>');
    }
    if (!any) h.push('<div class="empty">' + (mineOnly ? 'Tháng này bạn chưa đăng ký nghỉ.' : 'Tháng này chưa có ai đăng ký nghỉ.') + '</div>');
    h.push('</div>');

    $('view-calendar').innerHTML = h.join('');
    // Cuộn tới hôm nay
    var th = document.querySelector('.cal thead th.today');
    if (th) { var wrap = document.querySelector('.grid-wrap'); wrap.scrollLeft = Math.max(0, th.offsetLeft - wrap.clientWidth / 2); }
  }

  /* ---------------- Chi tiết đơn ---------------- */
  function reqBlock(r, opt) {
    opt = opt || {};
    var p = person(r.ma) || { ten: r.ten, phong: '' };
    var acts = [];
    if (r.canApprove && r.trangThai === ST.PENDING) {
      acts.push('<button class="btn ok" data-approve="' + esc(r.id) + '">✓ Duyệt</button>');
      acts.push('<button class="btn bad" data-reject="' + esc(r.id) + '">Từ chối</button>');
    }
    if (ownCancelable(r)) acts.push('<button class="btn bad" data-cancel="' + esc(r.id) + '">Hủy đơn</button>');
    else if (r.canApprove && r.trangThai !== ST.PENDING) acts.push('<button class="btn bad" data-cancel="' + esc(r.id) + '">Xóa đơn</button>');
    var extra = '';
    if (opt.stats && canSeeTotals(r.ma)) {
      var y = +r.tuNgay.slice(0, 4), yt = L.yearTotals(S.index, r.ma, y);
      extra = '<div class="meta">Năm ' + y + ': đã nghỉ ' + L.fmtNum(yt.total) + ' ngày' + (yt.ct ? ' · công tác ' + L.fmtNum(yt.ct) + ' ngày' : '') + '</div>';
    }
    return '<div class="req"><div>' +
      '<div class="title">' + (opt.noName ? '' : esc(p.ten) + ' ') + '<span class="chip"><span class="dot" style="background:' + colorOf(r.loai) + '"></span>' + esc(r.loai) + '</span>' + statusChip(r.trangThai) + '</div>' +
      '<div class="meta"><b>' + esc(fmtRange(r)) + '</b> · ' + L.fmtNum(countOf(r)) + ' ngày' + (opt.noName ? '' : ' · ' + esc(p.phong)) + '</div>' +
      (r.lyDo ? '<div class="reason">' + esc(r.lyDo) + '</div>' : '') + extra +
      '<div class="meta small">Gửi lúc ' + esc(r.ngayTao) +
      (r.ngayDuyet ? ' · ' + (r.trangThai === ST.REJECTED ? 'Từ chối' : 'Duyệt') + ' bởi ' + esc(r.nguoiDuyet) + ' lúc ' + esc(r.ngayDuyet) : '') +
      (r.ghiChuDuyet ? ' · Ghi chú: ' + esc(r.ghiChuDuyet) : '') + '</div>' +
      '</div><div class="actions">' + acts.join('') + '</div></div>';
  }

  function openModal(html) { $('modalBody').innerHTML = html; $('modal').hidden = false; }
  function closeModal() { $('modal').hidden = true; $('modalBody').innerHTML = ''; }

  function openReqs(list, title) {
    openModal('<h3>' + esc(title) + '</h3>' + list.map(function (r) { return reqBlock(r, { stats: true }); }).join(''));
  }

  function openPerson(ma) {
    var p = person(ma), y = S.y, yt = L.yearTotals(S.index, ma, y);
    var list = S.requests.filter(function (r) { return r.ma === ma && (r.tuNgay.slice(0, 4) == y || r.denNgay.slice(0, 4) == y); })
      .sort(function (a, b) { return a.tuNgay < b.tuNgay ? 1 : -1; });
    openModal('<h3>' + esc(p.ten) + '</h3><div class="muted">' + esc(p.chucDanh + ' · ' + p.phong) + '</div>' +
      (canSeeTotals(ma) ? '<div class="kv"><div><b>' + L.fmtNum(yt.total) + '</b><span>Ngày nghỉ năm ' + y + '</span></div>' +
      '<div><b>' + L.fmtNum(yt.ct) + '</b><span>Ngày công tác</span></div>' +
      '<div><b>' + L.fmtNum(yt.pending) + '</b><span>Ngày chờ duyệt</span></div></div>' : '') +
      '<h3 style="margin-top:18px">Các đơn năm ' + y + '</h3>' +
      (list.length ? list.map(function (r) { return reqBlock(r, { noName: true }); }).join('') : '<div class="empty">Chưa có đơn nào.</div>'));
  }

  function findReq(id) { for (var i = 0; i < S.requests.length; i++) if (S.requests[i].id === id) return S.requests[i]; return null; }

  function doAction(promise, okMsg) {
    return promise.then(function () { toast(okMsg); closeModal(); return loadData(true); })
      .catch(function (e) { toast(e.message, true); });
  }
  function approve(id) { doAction(call('decide', { id: id, decision: 'approve' }), 'Đã duyệt đơn'); }
  function rejectAsk(id) {
    var r = findReq(id);
    openModal('<h3>Từ chối đơn của ' + esc(r.ten) + '</h3><p class="muted">' + esc(r.loai + ' · ' + fmtRange(r)) + '</p>' +
      '<label>Lý do từ chối (không bắt buộc)<textarea id="rejectNote" rows="3"></textarea></label>' +
      '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end"><button class="btn" data-close>Thôi</button>' +
      '<button class="btn primary" data-reject-confirm="' + esc(id) + '">Xác nhận từ chối</button></div>');
  }
  function cancelAsk(id) {
    var r = findReq(id);
    var own = ownCancelable(r);
    openModal('<h3>' + (own ? 'Hủy đơn nghỉ?' : 'Xóa đơn nghỉ của ' + esc(r.ten) + '?') + '</h3><p>' + esc(r.loai + ' · ' + fmtRange(r) + ' · ' + L.fmtNum(countOf(r)) + ' ngày') + '</p>' +
      '<p class="muted small">Đơn sẽ không còn hiện trên lịch và không được tính vào tổng. Sheet vẫn lưu lại với trạng thái "Đã hủy".</p>' +
      '<div style="display:flex;gap:8px;margin-top:14px;justify-content:flex-end"><button class="btn" data-close>Thôi</button>' +
      '<button class="btn primary" data-cancel-confirm="' + esc(id) + '">' + (own ? 'Hủy đơn' : 'Xóa đơn') + '</button></div>');
  }

  /* ---------------- Khai nghỉ ---------------- */
  function newForm() {
    var t = L.todayYMD();
    return { ma: S.me ? S.me.ma : '', loai: S.types[0] ? S.types[0].ten : 'Nghỉ phép', tuNgay: t, tuBuoi: 'Sáng', denNgay: t, denBuoi: 'Chiều', lyDo: '' };
  }

  function renderForm() {
    if (!S.form) S.form = newForm();
    var f = S.form, h = [];
    h.push('<div class="card" style="max-width:760px;margin:0 auto"><h2>Khai báo nghỉ phép</h2><form id="leaveForm" class="form-grid" novalidate>');
    if (S.me.isAdmin) {
      h.push('<label class="full">Người nghỉ<select name="ma">' + S.staff.filter(function (s) { return s.trangThai !== 'Nghỉ việc'; }).map(function (s) {
        return '<option value="' + esc(s.ma) + '"' + (s.ma === f.ma ? ' selected' : '') + '>' + esc(s.ten + ' – ' + s.phong) + '</option>';
      }).join('') + '</select></label>');
    }
    h.push('<div class="full"><div class="small muted" style="margin-bottom:6px">Loại</div><div class="type-pick">' +
      S.types.map(function (t) {
        return '<label class="tp' + (t.ten === f.loai ? ' on' : '') + '" style="--c:' + esc(colorOf(t.ten)) + '"><input type="radio" name="loai" value="' + esc(t.ten) + '"' +
          (t.ten === f.loai ? ' checked' : '') + '><span class="dot"></span>' + esc(t.ten) + '</label>';
      }).join('') + '</div></div>');
    h.push('<div class="full"><div class="small muted" style="margin-bottom:6px">Chọn nhanh</div><div class="quick">' +
      '<button type="button" class="btn" data-quick="today">Cả ngày hôm nay</button>' +
      '<button type="button" class="btn" data-quick="am">Sáng nay</button>' +
      '<button type="button" class="btn" data-quick="pm">Chiều nay</button>' +
      '<button type="button" class="btn" data-quick="tomorrow">Ngày mai</button></div></div>');
    h.push('<div><label>Từ ngày<input type="date" name="tuNgay" value="' + f.tuNgay + '" required></label>' +
      '<div class="seg-ctl" data-seg="tuBuoi"><button type="button" class="' + (f.tuBuoi === 'Sáng' ? 'on' : '') + '" data-v="Sáng">Từ sáng</button><button type="button" class="' + (f.tuBuoi === 'Chiều' ? 'on' : '') + '" data-v="Chiều">Từ chiều</button></div></div>');
    h.push('<div><label>Đến ngày<input type="date" name="denNgay" value="' + f.denNgay + '" required></label>' +
      '<div class="seg-ctl" data-seg="denBuoi"><button type="button" class="' + (f.denBuoi === 'Sáng' ? 'on' : '') + '" data-v="Sáng">Hết buổi sáng</button><button type="button" class="' + (f.denBuoi === 'Chiều' ? 'on' : '') + '" data-v="Chiều">Hết buổi chiều</button></div></div>');
    h.push('<label class="full">Lý do / ghi chú<textarea name="lyDo" rows="3" maxlength="500" placeholder="Chỉ bạn, người duyệt và quản trị viên xem được">' + esc(f.lyDo) + '</textarea></label>');
    h.push('<div class="full preview" id="formPreview"></div>');
    h.push('<div class="full"><button class="btn primary block" type="submit" id="submitLeave">Gửi đơn nghỉ</button></div>');
    h.push('</form></div>');
    $('view-form').innerHTML = h.join('');
    updatePreview();
  }

  function updatePreview() {
    var f = S.form, box = $('formPreview');
    if (!box) return;
    var err = L.validateRange(f);
    var p = person(f.ma) || {};
    var appr = approverText(p);
    var who = appr ? 'Đơn sẽ chờ <b>' + esc(appr) + '</b> duyệt.' : 'Đơn được <b>duyệt tự động</b>.';
    if (err) { box.innerHTML = '<span class="err">' + esc(err) + '</span>'; $('submitLeave').disabled = true; return; }
    var days = L.expandLeave(f, S.holidays), total = days.reduce(function (a, x) { return a + x.v; }, 0);
    $('submitLeave').disabled = !total;
    box.innerHTML = '<div class="big">' + L.fmtNum(total) + ' ngày ' + (L.isOff(S.typeMap, f.loai) ? 'nghỉ' : esc(String(f.loai).toLowerCase())) + '</div>' +
      '<div class="small muted">Đã bỏ qua chủ nhật và ngày lễ. ' + who + '</div>' +
      (days.length ? '<div class="days">' + days.slice(0, 40).map(function (x) {
        return '<span>' + L.DOW[L.dow(x.d)] + ' ' + L.viDate(x.d).slice(0, 5) + (x.part !== 'full' ? (x.part === 'am' ? ' sáng' : ' chiều') : '') + '</span>';
      }).join('') + (days.length > 40 ? '<span>…</span>' : '') + '</div>' : '<div class="err">Khoảng này không có ngày làm việc.</div>');
  }

  function submitForm() {
    var f = S.form, btn = $('submitLeave');
    if (!String(f.loai).trim()) { toast('Chưa nhập loại nghỉ', true); return; }
    btn.disabled = true; btn.textContent = 'Đang gửi…';
    call('create', { req: f }).then(function (res) {
      toast(res.trangThai === ST.APPROVED ? 'Đã ghi nhận đơn nghỉ' : 'Đã gửi đơn, đang chờ duyệt');
      S.y = +f.tuNgay.slice(0, 4); S.m = +f.tuNgay.slice(5, 7);
      S.form = null; S.view = 'calendar';
      return loadData(true);
    }).catch(function (e) {
      toast(e.message, true);
      btn.disabled = false; btn.textContent = 'Gửi đơn nghỉ';
    });
  }

  /* ---------------- Duyệt ---------------- */
  function renderApprove() {
    var pend = pendingForMe().sort(function (a, b) { return a.tuNgay < b.tuNgay ? -1 : 1; });
    var done = S.requests.filter(function (r) { return r.canApprove && r.trangThai !== ST.PENDING && r.nguoiDuyet && r.nguoiDuyet !== '(tự động)'; })
      .sort(function (a, b) { return a.ngayDuyet < b.ngayDuyet ? 1 : -1; }).slice(0, 30);
    $('view-approve').innerHTML =
      '<div class="card"><h2>Đơn chờ duyệt (' + pend.length + ')</h2>' +
      (pend.length ? pend.map(function (r) { return reqBlock(r, { stats: true }); }).join('') : '<div class="empty">Không có đơn nào chờ duyệt. 👍</div>') + '</div>' +
      '<div class="card"><h2>Đã xử lý gần đây</h2>' +
      (done.length ? done.map(function (r) { return reqBlock(r); }).join('') : '<div class="empty">Chưa có.</div>') + '</div>';
  }

  /* ---------------- Tổng kết tháng / năm ---------------- */
  /** Ai được hiện trong tổng kết: Nhân viên chỉ thấy chính mình */
  function summaryStaff() {
    if (seeAll()) return filteredStaff();
    var me = person(S.me.ma);
    return me ? [me] : [];
  }
  function typeNames() {
    var seen = {}, out = [];
    S.types.forEach(function (t) { if (!seen[t.ten]) { seen[t.ten] = 1; out.push(t.ten); } });
    S.requests.forEach(function (r) { if (L.isActive(r) && !seen[r.loai]) { seen[r.loai] = 1; out.push(r.loai); } });
    return out;
  }
  /** Số ngày theo loại của một người trong năm (mIdx = null) hoặc trong tháng mIdx (0..11) */
  function typeDays(t, loai, mIdx) {
    if (mIdx == null) return t.byType[loai] || 0;
    return (t.byTypeMonth[loai] || [])[mIdx] || 0;
  }
  function summaryRows(y) {
    return summaryStaff().map(function (s) { return { s: s, t: L.yearTotals(S.index, s.ma, y) }; });
  }
  /** Ngày chờ duyệt của một người trong tháng m (1..12) */
  function pendingInMonth(ma, y, m) {
    var p = S.index.byPerson[ma] || {}, n = L.daysInMonth(y, m), v = 0;
    for (var d = 1; d <= n; d++) (p[L.ymd(y, m, d)] || []).forEach(function (x) { if (x.req.trangThai === ST.PENDING) v += x.v; });
    return v;
  }

  function renderSummary() {
    var mode = S.sumMode || 'month', all = seeAll();
    var h = [];
    var title = mode === 'month' ? 'Tháng ' + S.sumMonth + '/' + S.sumYear : 'Năm ' + S.sumYear;
    h.push('<div class="toolbar"><div class="seg-ctl mode"><button type="button" class="' + (mode === 'month' ? 'on' : '') + '" data-act="sumMonth">Tổng kết tháng</button>' +
      '<button type="button" class="' + (mode === 'year' ? 'on' : '') + '" data-act="sumYear">Tổng kết năm</button></div>' +
      '<button class="btn icon" data-act="sprev" aria-label="Trước">◀</button><h2>' + title + '</h2>' +
      '<button class="btn icon" data-act="snext" aria-label="Sau">▶</button><span class="spacer"></span>' +
      (all ? phongSelect('sumPhong') : '') +
      '<button class="btn" data-act="csvSummary">⬇ Xuất bảng tổng hợp</button><button class="btn" data-act="csvList">⬇ Xuất danh sách đơn</button></div>');
    if (!all) h.push('<div class="note small">Bạn đang xem tổng kết của chính mình. Tổng kết của cả đơn vị dành cho lãnh đạo và trưởng/phó phòng.</div>');
    h.push(mode === 'month' ? summaryMonth() : summaryYear());
    $('view-summary').innerHTML = h.join('');
  }

  function typeCards(byType, label) {
    var tkeys = typeNames().filter(function (k) { return byType[k]; });
    return '<div class="card"><h2>' + label + '</h2>' + (tkeys.length ? tkeys.map(function (k) {
      return '<div class="type-row"><span class="dot" style="background:' + colorOf(k) + '"></span>' + esc(k) +
        (L.isOff(S.typeMap, k) ? '' : ' <span class="chip">không tính nghỉ</span>') + '<b>' + L.fmtNum(byType[k]) + ' ngày</b></div>';
    }).join('') : '<div class="empty">Chưa có dữ liệu.</div>') + '</div>';
  }

  function summaryMonth() {
    var y = S.sumYear, m = S.sumMonth, mi = m - 1, rows = summaryRows(y), types = typeNames(), h = [];
    var byType = {}, off = 0, ct = 0, pend = 0, people = 0;
    rows.forEach(function (o) {
      types.forEach(function (k) { byType[k] = (byType[k] || 0) + typeDays(o.t, k, mi); });
      off += o.t.months[mi]; ct += o.t.ctMonths[mi];
      if (o.t.months[mi]) people++;
      o.pend = pendingInMonth(o.s.ma, y, m); pend += o.pend;
    });
    h.push('<div class="stats">' +
      '<div class="stat accent"><div class="k">Ngày nghỉ</div><div class="v">' + L.fmtNum(off) + ' <small>ngày' + (rows.length > 1 ? ' · ' + people + ' người' : '') + '</small></div></div>' +
      '<div class="stat"><div class="k">Công tác</div><div class="v">' + L.fmtNum(ct) + ' <small>ngày</small></div></div>' +
      '<div class="stat"><div class="k">Chờ duyệt</div><div class="v"' + (pend ? ' style="color:var(--warn)"' : '') + '>' + L.fmtNum(pend) + ' <small>ngày</small></div></div>' +
      '</div>');
    h.push('<div class="two-col">' + typeCards(byType, 'Theo loại – tháng ' + m) + summaryReqList(y, m, rows) + '</div>');
    h.push('<div class="card"><h2>Bảng tổng hợp tháng ' + m + '/' + y + '</h2><div class="tbl-wrap"><table class="sum-tbl"><thead><tr><th>Họ tên</th>' +
      types.map(function (k) { return '<th><span class="dot" style="background:' + colorOf(k) + '"></span> ' + esc(k) + '</th>'; }).join('') +
      '<th>Tổng nghỉ</th><th>Chờ duyệt</th></tr></thead><tbody>');
    var last = null;
    rows.forEach(function (o) {
      if (all() && o.s.phong !== last) { last = o.s.phong; h.push('<tr class="grp"><td colspan="' + (types.length + 3) + '"><span class="grp-label">' + esc(last) + '</span></td></tr>'); }
      h.push('<tr><td><a href="#" data-person="' + esc(o.s.ma) + '" style="color:inherit;text-decoration:none">' + esc(o.s.ten) + '</a></td>' +
        types.map(function (k) { var v = typeDays(o.t, k, mi); return '<td' + (v ? '' : ' class="zero"') + '>' + L.fmtNum(v) + '</td>'; }).join('') +
        '<td class="tot">' + L.fmtNum(o.t.months[mi]) + '</td><td' + (o.pend ? ' style="color:var(--warn);font-weight:600"' : ' class="zero"') + '>' + L.fmtNum(o.pend) + '</td></tr>');
    });
    if (rows.length > 1) h.push('</tbody><tfoot><tr><td>Tổng cộng (' + rows.length + ' người)</td>' +
      types.map(function (k) { return '<td>' + L.fmtNum(byType[k]) + '</td>'; }).join('') + '<td>' + L.fmtNum(off) + '</td><td>' + L.fmtNum(pend) + '</td></tr></tfoot>');
    h.push('</table></div></div>');
    return h.join('');
  }
  function all() { return seeAll(); }

  /** Danh sách đơn trong tháng (của những người đang xem được) */
  function summaryReqList(y, m, rows) {
    var set = {};
    rows.forEach(function (o) { set[o.s.ma] = 1; });
    var a = L.ymd(y, m, 1), b = L.ymd(y, m, L.daysInMonth(y, m));
    var list = S.requests.filter(function (r) { return set[r.ma] && L.isActive(r) && r.tuNgay <= b && r.denNgay >= a; })
      .sort(function (p, q) { return p.tuNgay < q.tuNgay ? -1 : 1; });
    return '<div class="card"><h2>Các đơn trong tháng (' + list.length + ')</h2>' + (list.length ? '<div class="mini-list">' + list.map(function (r) {
      return '<button class="mini" data-req="' + esc(r.id) + '"><span class="dot" style="background:' + colorOf(r.loai) + '"></span><b>' + esc(r.ten) + '</b>' +
        '<span>' + esc(r.loai) + ' · ' + esc(fmtRange(r)) + '</span>' + (r.trangThai === ST.PENDING ? '<span class="chip pending">Chờ duyệt</span>' : '') + '</button>';
    }).join('') + '</div>' : '<div class="empty">Không có đơn nào.</div>') + '</div>';
  }

  function summaryYear() {
    var y = S.sumYear, rows = summaryRows(y), types = typeNames(), cm = new Date().getFullYear() === y ? new Date().getMonth() : -1;
    var monthSum = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ctSum = 0, byType = {}, grand = 0, pend = 0;
    rows.forEach(function (o) {
      o.t.months.forEach(function (v, i) { monthSum[i] += v; });
      grand += o.t.total; ctSum += o.t.ct; pend += o.t.pending;
      for (var k in o.t.byType) byType[k] = (byType[k] || 0) + o.t.byType[k];
    });
    var max = Math.max.apply(null, monthSum.concat([1]));
    var h = [];
    h.push('<div class="two-col"><div class="card"><h2>Ngày nghỉ theo tháng · cả năm ' + L.fmtNum(grand) + ' ngày</h2><div class="chart">' +
      monthSum.map(function (v, i) {
        return '<div class="col" data-month="' + (i + 1) + '"><span class="val">' + (v ? L.fmtNum(v) : '') + '</span><div class="bar' + (i === cm ? ' cur' : '') + '" style="height:' + (v / max * 100) + '%" title="Tháng ' + (i + 1) + ': ' + L.fmtNum(v) + ' ngày nghỉ"></div><span class="lbl">T' + (i + 1) + '</span></div>';
      }).join('') + '</div><div class="small muted">Bấm vào cột để xem tổng kết tháng đó.</div></div>');
    h.push(typeCards(byType, 'Theo loại – năm ' + y) + '</div>');

    h.push('<div class="card"><h2>Bảng tổng hợp ngày nghỉ năm ' + y + '</h2><div class="tbl-wrap"><table class="sum-tbl"><thead><tr><th>Họ tên</th>');
    for (var i = 1; i <= 12; i++) h.push('<th>T' + i + '</th>');
    h.push('<th>Tổng nghỉ</th>' + types.map(function (k) { return '<th><span class="dot" style="background:' + colorOf(k) + '"></span> ' + esc(k) + '</th>'; }).join('') +
      '<th>Chờ duyệt</th></tr></thead><tbody>');
    var last = null, cols = 15 + types.length;
    rows.forEach(function (o) {
      if (all() && o.s.phong !== last) { last = o.s.phong; h.push('<tr class="grp"><td colspan="' + cols + '"><span class="grp-label">' + esc(last) + '</span></td></tr>'); }
      h.push('<tr><td><a href="#" data-person="' + esc(o.s.ma) + '" style="color:inherit;text-decoration:none">' + esc(o.s.ten) + '</a></td>' +
        o.t.months.map(function (v) { return '<td' + (v ? '' : ' class="zero"') + '>' + L.fmtNum(v) + '</td>'; }).join('') +
        '<td class="tot">' + L.fmtNum(o.t.total) + '</td>' +
        types.map(function (k) { var v = typeDays(o.t, k); return '<td' + (v ? '' : ' class="zero"') + '>' + L.fmtNum(v) + '</td>'; }).join('') +
        '<td' + (o.t.pending ? ' style="color:var(--warn);font-weight:600"' : ' class="zero"') + '>' + L.fmtNum(o.t.pending) + '</td></tr>');
    });
    if (rows.length > 1) h.push('</tbody><tfoot><tr><td>Tổng cộng (' + rows.length + ' người)</td>' + monthSum.map(function (v) { return '<td>' + L.fmtNum(v) + '</td>'; }).join('') +
      '<td>' + L.fmtNum(grand) + '</td>' + types.map(function (k) { return '<td>' + L.fmtNum(byType[k] || 0) + '</td>'; }).join('') + '<td>' + L.fmtNum(pend) + '</td></tr></tfoot>');
    h.push('</table></div><div class="small muted" style="margin-top:8px">Cột tháng và "Tổng nghỉ" không tính ngày công tác. Ngày chờ duyệt đã gồm trong số liệu.</div></div>');
    return h.join('');
  }

  function downloadCsv(name, rows) {
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) {
        c = c == null ? '' : String(c);
        if (/^[=+\-@\t\r]/.test(c)) c = "'" + c; // chống chèn công thức khi mở bằng Excel
        return /[",;\n]/.test(c) ? '"' + c.replace(/"/g, '""') + '"' : c;
      }).join(',');
    }).join('\r\n');
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }
  function num(v) { return String(Math.round(v * 2) / 2); }

  function csvSummary() {
    var y = S.sumYear, types = typeNames(), head = ['Mã NV', 'Họ tên', 'Phòng', 'Chức danh'], rows, suffix;
    if (S.sumMode === 'year') {
      for (var i = 1; i <= 12; i++) head.push('T' + i);
      head = head.concat(['Tổng nghỉ'], types, ['Chờ duyệt']);
      rows = [head].concat(summaryRows(y).map(function (o) {
        return [o.s.ma, o.s.ten, o.s.phong, o.s.chucDanh].concat(o.t.months.map(num), [num(o.t.total)],
          types.map(function (k) { return num(typeDays(o.t, k)); }), [num(o.t.pending)]);
      }));
      suffix = y;
    } else {
      var m = S.sumMonth, mi = m - 1;
      head = head.concat(types, ['Tổng nghỉ', 'Chờ duyệt']);
      rows = [head].concat(summaryRows(y).map(function (o) {
        return [o.s.ma, o.s.ten, o.s.phong, o.s.chucDanh].concat(types.map(function (k) { return num(typeDays(o.t, k, mi)); }),
          [num(o.t.months[mi]), num(pendingInMonth(o.s.ma, y, m))]);
      }));
      suffix = y + '-' + ('0' + m).slice(-2);
    }
    downloadCsv('TongKet_NghiPhep_' + suffix + (seeAll() && S.phong ? '_' + S.phong : '') + '.csv', rows);
  }
  function csvList() {
    var y = S.sumYear, staffSet = {};
    summaryStaff().forEach(function (s) { staffSet[s.ma] = s; });
    var a = S.sumMode === 'year' ? y + '-01-01' : L.ymd(y, S.sumMonth, 1);
    var b = S.sumMode === 'year' ? y + '-12-31' : L.ymd(y, S.sumMonth, L.daysInMonth(y, S.sumMonth));
    var list = S.requests.filter(function (r) { return staffSet[r.ma] && r.tuNgay <= b && r.denNgay >= a; })
      .sort(function (p, q) { return p.tuNgay < q.tuNgay ? -1 : 1; });
    var rows = [['Mã NV', 'Họ tên', 'Phòng', 'Loại', 'Từ ngày', 'Từ buổi', 'Đến ngày', 'Đến buổi', 'Số ngày', 'Trạng thái', 'Lý do', 'Người duyệt', 'Ngày duyệt', 'Ngày gửi']]
      .concat(list.map(function (r) {
        return [r.ma, r.ten, staffSet[r.ma].phong, r.loai, L.viDate(r.tuNgay), r.tuBuoi, L.viDate(r.denNgay), r.denBuoi, num(countOf(r)), r.trangThai, r.lyDo, r.nguoiDuyet, r.ngayDuyet, r.ngayTao];
      }));
    downloadCsv('DanhSach_DonNghi_' + (S.sumMode === 'year' ? y : y + '-' + ('0' + S.sumMonth).slice(-2)) + '.csv', rows);
  }

  /* ---------------- Cá nhân ---------------- */
  function renderMe() {
    var me = S.me, y = new Date().getFullYear(), p = person(me.ma) || {}, yt = L.yearTotals(S.index, me.ma, y);
    var mine = S.requests.filter(function (r) { return r.ma === me.ma; }).sort(function (a, b) { return a.tuNgay < b.tuNgay ? 1 : -1; });
    var appr = approverText(p);
    var scope = me.vaiTro === 'PGD' ? L.phuTrachList(me) : [];
    $('view-me').innerHTML =
      '<div class="card"><div class="me-head"><div class="avatar">' + esc(initials(me.ten)) + '</div><div><h2 style="margin:0">' + esc(me.ten) + ' ' + roleChip(me.vaiTro) + '</h2>' +
      '<div class="muted">' + esc([me.chucDanh, me.phong].filter(Boolean).join(' · ')) + ' · Mã ' + esc(me.ma) + '</div>' +
      '<div class="muted small">Người duyệt đơn của tôi: ' + (appr ? esc(appr) : 'duyệt tự động') + '</div>' +
      (me.vaiTro === 'PGD' ? '<div class="muted small">Phụ trách duyệt: ' + (scope.length ? esc(scope.join(', ')) : 'chưa được giao phòng nào') + '</div>' : '') +
      (me.vaiTro === 'GiamDoc' || me.vaiTro === 'Admin' ? '<div class="muted small">Được duyệt đơn của tất cả nhân sự</div>' : '') +
      (me.vaiTro === 'TruongPhong' ? '<div class="muted small">Được xem tổng kết tháng, năm của mọi người</div>' : '') +
      '</div></div>' +
      '<div class="kv"><div><b>' + L.fmtNum(yt.months[new Date().getMonth()]) + '</b><span>Ngày nghỉ tháng ' + (new Date().getMonth() + 1) + '</span></div>' +
      '<div><b>' + L.fmtNum(yt.total) + '</b><span>Ngày nghỉ năm ' + y + '</span></div>' +
      '<div><b>' + L.fmtNum(yt.ct) + '</b><span>Ngày công tác năm ' + y + '</span></div>' +
      '<div><b>' + L.fmtNum(yt.pending) + '</b><span>Ngày chờ duyệt</span></div></div></div>' +
      '<div class="card"><h2>Đơn nghỉ của tôi</h2>' + (mine.length ? mine.map(function (r) { return reqBlock(r, { noName: true }); }).join('') : '<div class="empty">Bạn chưa có đơn nghỉ nào.</div>') + '</div>' +
      '<div class="card"><h2>Đổi mật khẩu</h2><form id="pinForm" class="form-grid">' +
      '<input type="text" name="username" autocomplete="username" value="' + esc(me.ma) + '" hidden>' +
      '<label class="full">Mật khẩu hiện tại<input type="password" name="p0" autocomplete="current-password" required></label>' +
      '<label>Mật khẩu mới (6–32 ký tự)<input type="password" name="p1" autocomplete="new-password" required minlength="6" maxlength="32"></label>' +
      '<label>Nhập lại mật khẩu mới<input type="password" name="p2" autocomplete="new-password" required minlength="6" maxlength="32"></label>' +
      '<div class="full small muted">Đổi mật khẩu xong, các máy khác đang đăng nhập tài khoản này sẽ phải đăng nhập lại.</div>' +
      '<div class="full"><button class="btn primary" type="submit">Đổi mật khẩu</button></div></form></div>' +
      '<div class="card" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="refresh">↻ Tải lại dữ liệu</button>' +
      '<a class="btn" href="huong-dan/" target="_blank" rel="noopener">📖 Hướng dẫn sử dụng</a><button class="btn bad" data-act="logout">Đăng xuất</button>' +
      (Api.demo ? '<button class="btn" data-act="resetDemo">Đặt lại dữ liệu demo</button>' : '') + '</div>';
  }

  /* ---------------- Quản trị ---------------- */
  var ROLE_ORDER = { Admin: 0, GiamDoc: 1, PGD: 2, TruongPhong: 3, NhanVien: 4 };
  var GD_ROLES = ['NhanVien', 'TruongPhong', 'PGD'];
  function allPhong() {
    var seen = {}, out = [];
    S.staff.forEach(function (s) { if (s.phong && !seen[s.phong]) { seen[s.phong] = 1; out.push(s.phong); } });
    return out;
  }

  function renderAdmin() {
    var isAdmin = S.me.isAdmin, h = [];
    var list = S.staff.slice().sort(function (a, b) {
      return (a.trangThai === 'Nghỉ việc') - (b.trangThai === 'Nghỉ việc') || ROLE_ORDER[a.vaiTro] - ROLE_ORDER[b.vaiTro];
    });
    h.push('<div class="toolbar"><h2>Quản trị</h2><span class="spacer"></span>' +
      (isAdmin ? '<button class="btn primary" data-act="addStaff">+ Thêm nhân sự</button>' : '') + '</div>');
    if (!isAdmin) h.push('<div class="card small muted">Giám đốc được đổi vai trò giữa Nhân viên, Trưởng/Phó phòng và Phó Giám đốc (kèm giao phòng phụ trách). Các thay đổi khác do quản trị viên thực hiện.</div>');

    // Phân công duyệt theo phòng
    h.push('<div class="card"><h2>Ai duyệt đơn của từng phòng</h2>' + allPhong().map(function (ph) {
      var pgd = S.staff.filter(function (s) { return s.trangThai !== 'Nghỉ việc' && s.vaiTro === 'PGD' && L.phuTrachList(s).indexOf(ph) >= 0; });
      return '<div class="assign-row"><span>' + esc(ph) + '</span><span class="who">' +
        (pgd.length ? pgd.map(function (s) { return '<b>' + esc(s.ten) + '</b>'; }).join(', ') : '<span class="muted">Chưa giao PGĐ — Giám đốc duyệt</span>') + '</span></div>';
    }).join('') + '<div class="small muted" style="margin-top:8px">Giám đốc và Quản trị luôn duyệt được mọi đơn. Đơn của Phó Giám đốc do Giám đốc duyệt.</div></div>');

    // Bảng tài khoản
    h.push('<div class="card"><h2>Tài khoản (' + S.staff.length + ')</h2><div class="tbl-wrap"><table class="sum-tbl adm-tbl"><thead><tr>' +
      '<th>Họ tên</th><th>Mã</th><th>Vai trò</th><th>Phòng</th><th>Phụ trách duyệt</th><th>Trạng thái</th><th></th></tr></thead><tbody>');
    list.forEach(function (s) {
      var editable = isAdmin || GD_ROLES.indexOf(s.vaiTro) >= 0;
      h.push('<tr' + (s.trangThai === 'Nghỉ việc' ? ' class="off"' : '') + '><td>' + esc(s.ten) + '<div class="small muted">' + esc(s.chucDanh) + '</div></td>' +
        '<td>' + esc(s.ma) + '</td><td>' + roleChip(s.vaiTro) + '</td><td>' + esc(s.phong || '—') + '</td>' +
        '<td class="wrap">' + esc(s.vaiTro === 'PGD' ? (L.phuTrachList(s).join(', ') || 'chưa giao') : '') + '</td>' +
        '<td>' + esc(s.trangThai) + (s.chuaDoiMK && s.trangThai !== 'Nghỉ việc' ? '<div class="tag-warn" title="Còn dùng mật khẩu mặc định 123456 – chưa đăng nhập lần nào">Chưa đổi MK</div>' : '') + '</td>' +
        '<td>' + (editable ? '<button class="btn" data-edit-staff="' + esc(s.ma) + '">Sửa</button>' : '') + '</td></tr>');
    });
    h.push('</tbody></table></div></div>');

    if (isAdmin) {
      h.push('<div class="adm-grid"><div class="card"><h2>Loại nghỉ</h2><form id="typesForm"><div class="ed-list" id="typeRows">' +
        S.types.map(typeRow).join('') + '</div><div class="ed-foot"><button type="button" class="btn" data-act="addTypeRow">+ Thêm loại</button>' +
        '<button class="btn primary" type="submit">Lưu loại nghỉ</button></div>' +
        '<div class="small muted" style="margin-top:8px">Bỏ chọn "Tính là nghỉ" cho loại không phải nghỉ (VD: Công tác) để không cộng vào tổng ngày nghỉ.</div></form></div>');
      var hol = Object.keys(S.holidays).sort().map(function (d) { return { ngay: d, ten: S.holidayName[d] }; });
      h.push('<div class="card"><h2>Ngày lễ (không tính ngày nghỉ)</h2><form id="holidaysForm"><div class="ed-list" id="holRows">' +
        hol.map(holRow).join('') + '</div><div class="ed-foot"><button type="button" class="btn" data-act="addHolRow">+ Thêm ngày lễ</button>' +
        '<button class="btn primary" type="submit">Lưu ngày lễ</button></div></form></div></div>');
    }
    $('view-admin').innerHTML = h.join('');
  }

  function typeRow(t) {
    t = t || { ten: '', tinhNghi: true, mau: '#64748B' };
    return '<div class="ed-row"><input name="ten" value="' + esc(t.ten) + '" placeholder="Tên loại nghỉ" maxlength="60">' +
      '<label class="ck"><input type="checkbox" name="tinh"' + (t.tinhNghi !== false ? ' checked' : '') + '> Tính là nghỉ</label>' +
      '<input type="color" name="mau" value="' + esc(/^#[0-9a-f]{6}$/i.test(t.mau) ? t.mau : '#64748B') + '" aria-label="Màu">' +
      '<button type="button" class="btn icon del" data-delrow aria-label="Xóa">×</button></div>';
  }
  function holRow(x) {
    x = x || { ngay: '', ten: '' };
    return '<div class="ed-row"><input type="date" name="ngay" value="' + esc(x.ngay) + '">' +
      '<input name="ten" value="' + esc(x.ten) + '" placeholder="Tên ngày lễ" maxlength="80">' +
      '<button type="button" class="btn icon del" data-delrow aria-label="Xóa">×</button></div>';
  }

  function staffForm(ma) {
    var isNew = !ma, isAdmin = S.me.isAdmin;
    var s = isNew ? { ma: '', ten: '', phong: '', chucDanh: '', vaiTro: 'NhanVien', phuTrach: '', trangThai: 'Đang làm' } : person(ma);
    var dis = isAdmin ? '' : ' disabled';
    var roles = isAdmin ? ['NhanVien', 'TruongPhong', 'PGD', 'GiamDoc', 'Admin'] : GD_ROLES;
    var scope = L.phuTrachList(s);
    openModal('<h3>' + (isNew ? 'Thêm nhân sự' : 'Tài khoản ' + esc(s.ten)) + '</h3><form id="staffForm" class="form-grid" data-new="' + (isNew ? 1 : 0) + '">' +
      '<label>Mã nhân sự<input name="ma" value="' + esc(s.ma) + '"' + (isNew ? ' maxlength="30" autocapitalize="none" placeholder="Để trống: tự tạo (VD: ngoc.nhk)"' : ' readonly') + '></label>' +
      '<label>Họ tên<input name="ten" value="' + esc(s.ten) + '" required' + dis + '></label>' +
      '<label>Phòng<input name="phong" list="phongList" value="' + esc(s.phong) + '"' + dis + ' placeholder="Để trống: không hiện trên lịch"></label>' +
      '<datalist id="phongList">' + allPhong().map(function (p) { return '<option value="' + esc(p) + '">'; }).join('') + '</datalist>' +
      '<label>Chức danh<input name="chucDanh" value="' + esc(s.chucDanh) + '"' + dis + '></label>' +
      '<label>Vai trò<select name="vaiTro">' + roles.map(function (r) {
        return '<option value="' + r + '"' + (r === s.vaiTro ? ' selected' : '') + '>' + L.ROLES[r] + '</option>';
      }).join('') + '</select></label>' +
      '<label>Trạng thái<select name="trangThai"' + dis + '><option' + (s.trangThai !== 'Nghỉ việc' ? ' selected' : '') + '>Đang làm</option><option' + (s.trangThai === 'Nghỉ việc' ? ' selected' : '') + '>Nghỉ việc</option></select></label>' +
      '<div class="full" id="phuTrachBox"' + (s.vaiTro === 'PGD' ? '' : ' hidden') + '><b class="small">Phòng phụ trách duyệt</b><div class="ck-list">' +
      allPhong().map(function (p) {
        return '<label><input type="checkbox" name="phuTrach" value="' + esc(p) + '"' + (scope.indexOf(p) >= 0 ? ' checked' : '') + '> ' + esc(p) + '</label>';
      }).join('') + '</div></div>' +
      '<div class="full" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">' +
      (isAdmin && !isNew ? '<button type="button" class="btn" data-reset-pin="' + esc(s.ma) + '" style="margin-right:auto">Đặt lại mật khẩu</button>' : '') +
      '<button type="button" class="btn" data-close>Thôi</button><button class="btn primary" type="submit">' + (isNew ? 'Tạo tài khoản' : 'Lưu') + '</button></div>' +
      '</form>');
  }

  function showPin(ten, ma, pin, title) {
    openModal('<h3>' + esc(title) + '</h3><p>Mã nhân sự <b>' + esc(ma) + '</b> – ' + esc(ten) + '</p><div class="pin-box">' + esc(pin) + '</div>' +
      '<p class="small muted">Mật khẩu mặc định. Người dùng đăng nhập bằng mã trên + mật khẩu này và phải đổi mật khẩu ngay lần đầu. ' +
      'Nhắc họ đăng nhập sớm: khi chưa đổi, ai biết mã cũng vào được.</p>' +
      '<div style="text-align:right"><button class="btn primary" data-close>Đã ghi lại</button></div>');
  }

  function submitStaff(f) {
    var isNew = f.getAttribute('data-new') === '1', el = f.elements;
    var data = { ma: el.ma.value.trim().toLowerCase(), vaiTro: el.vaiTro.value,
                 phuTrach: Array.prototype.filter.call(f.querySelectorAll('input[name=phuTrach]'), function (c) { return c.checked; }).map(function (c) { return c.value; }) };
    if (S.me.isAdmin) {
      data.ten = el.ten.value; data.phong = el.phong.value; data.chucDanh = el.chucDanh.value;
      data.trangThai = el.trangThai.value;
    }
    if (data.vaiTro === 'PGD' && !data.phuTrach.length && !confirm('Phó Giám đốc chưa được giao phòng nào. Vẫn lưu?')) return;
    call('saveStaff', { staff: data, isNew: isNew }).then(function (res) {
      return loadData(true).then(function () {
        if (res.pin) showPin(data.ten, res.saved || data.ma, res.pin, 'Đã tạo tài khoản');
        else { closeModal(); toast('Đã lưu tài khoản ' + (res.saved || data.ma)); }
      });
    }).catch(function (e) { toast(e.message, true); });
  }

  function collectRows(id, fn) {
    return Array.prototype.map.call($(id).querySelectorAll('.ed-row'), fn);
  }

  /* ---------------- Sự kiện ---------------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, a, td, [data-goto], [data-month]');
    if (!t) return;
    var a;
    if ((a = t.getAttribute('data-demo-as'))) { demoSwitch(a); return; }
    if ((a = t.getAttribute('data-month'))) { S.sumMode = 'month'; S.sumMonth = +a; renderSummary(); return; }
    if ((a = t.getAttribute('data-view'))) { show(a); return; }
    if ((a = t.getAttribute('data-goto'))) { show(a); return; }
    if (t.hasAttribute('data-close')) { closeModal(); return; }
    if ((a = t.getAttribute('data-approve'))) { approve(a); return; }
    if ((a = t.getAttribute('data-reject'))) { rejectAsk(a); return; }
    if ((a = t.getAttribute('data-reject-confirm'))) {
      doAction(call('decide', { id: a, decision: 'reject', note: ($('rejectNote') || {}).value || '' }), 'Đã từ chối đơn'); return;
    }
    if ((a = t.getAttribute('data-cancel'))) { cancelAsk(a); return; }
    if ((a = t.getAttribute('data-cancel-confirm'))) { doAction(call('cancel', { id: a }), 'Đã hủy đơn'); return; }
    if ((a = t.getAttribute('data-req'))) { var r = findReq(a); if (r) openReqs([r], r.ten); return; }
    if ((a = t.getAttribute('data-person'))) { ev.preventDefault(); openPerson(a); return; }
    if (t.tagName === 'TD' && t.hasAttribute('data-d')) {
      var ma = t.getAttribute('data-ma'), d = t.getAttribute('data-d');
      var seen = {}, list = [];
      (S.index.byPerson[ma][d] || []).forEach(function (x) { if (!seen[x.req.id]) { seen[x.req.id] = 1; list.push(x.req); } });
      openReqs(list, person(ma).ten + ' · ' + L.viDate(d));
      return;
    }
    if ((a = t.getAttribute('data-seg'))) return;
    var seg = t.parentElement && t.parentElement.getAttribute && t.parentElement.getAttribute('data-seg');
    if (seg) {
      S.form[seg] = t.getAttribute('data-v');
      Array.prototype.forEach.call(t.parentElement.children, function (b) { b.classList.toggle('on', b === t); });
      updatePreview(); return;
    }
    if ((a = t.getAttribute('data-quick'))) {
      var td = L.todayYMD(), tm = L.fmtYMD(new Date(L.parseYMD(td).getTime() + 86400000));
      var q = { today: [td, 'Sáng', td, 'Chiều'], am: [td, 'Sáng', td, 'Sáng'], pm: [td, 'Chiều', td, 'Chiều'], tomorrow: [tm, 'Sáng', tm, 'Chiều'] }[a];
      S.form.tuNgay = q[0]; S.form.tuBuoi = q[1]; S.form.denNgay = q[2]; S.form.denBuoi = q[3];
      renderForm(); return;
    }
    if ((a = t.getAttribute('data-edit-staff'))) { staffForm(a); return; }
    if ((a = t.getAttribute('data-reset-pin'))) {
      var rp = person(a);
      openModal('<h3>Đặt lại mật khẩu cho ' + esc(rp.ten) + '?</h3><p class="muted">Mật khẩu cũ không dùng được nữa, mọi máy đang đăng nhập tài khoản này bị thoát. Mật khẩu trở về mặc định 123456; người này phải đổi ngay khi đăng nhập.</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Thôi</button><button class="btn primary" data-reset-pin-confirm="' + esc(a) + '">Đặt lại mật khẩu</button></div>');
      return;
    }
    if ((a = t.getAttribute('data-reset-pin-confirm'))) {
      call('resetPin', { target: a }).then(function (res) {
        var p2 = person(res.ma); showPin(p2 ? p2.ten : '', res.ma, res.pin, 'Đã đặt lại mật khẩu');
        loadData(true);
      })
        .catch(function (e) { toast(e.message, true); });
      return;
    }
    if (t.hasAttribute('data-delrow')) { t.closest('.ed-row').remove(); return; }
    if ((a = t.getAttribute('data-act'))) {
      switch (a) {
        case 'addStaff': staffForm(null); return;
        case 'addTypeRow': $('typeRows').insertAdjacentHTML('beforeend', typeRow()); $('typeRows').lastElementChild.querySelector('input').focus(); return;
        case 'addHolRow': $('holRows').insertAdjacentHTML('beforeend', holRow()); $('holRows').lastElementChild.querySelector('input').focus(); return;
        case 'prev': if (--S.m < 1) { S.m = 12; S.y--; } renderCalendar(); break;
        case 'next': if (++S.m > 12) { S.m = 1; S.y++; } renderCalendar(); break;
        case 'thisMonth': S.y = new Date().getFullYear(); S.m = new Date().getMonth() + 1; renderCalendar(); break;
        case 'sumMonth': S.sumMode = 'month'; renderSummary(); break;
        case 'sumYear': S.sumMode = 'year'; renderSummary(); break;
        case 'sprev':
          if (S.sumMode === 'year') S.sumYear--;
          else if (--S.sumMonth < 1) { S.sumMonth = 12; S.sumYear--; }
          renderSummary(); break;
        case 'snext':
          if (S.sumMode === 'year') S.sumYear++;
          else if (++S.sumMonth > 12) { S.sumMonth = 1; S.sumYear++; }
          renderSummary(); break;
        case 'csvSummary': csvSummary(); break;
        case 'csvList': csvList(); break;
        case 'refresh': loadData(true).then(function () { toast('Đã cập nhật'); }); break;
        case 'logout': saveAuth(null); S.me = null; S.form = null; S.view = 'calendar'; showLogin(); break;
        case 'cancelFirst': showLogin(); break;
        case 'resetDemo': Api.resetDemo(); loadData(true).then(function () { toast('Đã đặt lại dữ liệu demo'); }); break;
      }
    }
  });

  $('userChip').addEventListener('click', function () { show('me'); });
  $('modal').addEventListener('click', function (e) { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'calPhong') { S.phong = t.value; renderCalendar(); }
    if (t.id === 'sumPhong') { S.phong = t.value; renderSummary(); }
    if (t.name === 'vaiTro' && t.form && t.form.id === 'staffForm') $('phuTrachBox').hidden = t.value !== 'PGD';
  });

  document.addEventListener('input', function (e) {
    var form = e.target.form;
    if (form && form.id === 'leaveForm' && e.target.name) {
      S.form[e.target.name] = e.target.value;
      if (e.target.name === 'tuNgay' && S.form.denNgay < S.form.tuNgay) {
        S.form.denNgay = S.form.tuNgay;
        form.elements.denNgay.value = S.form.tuNgay;
      }
      updatePreview();
    }
  });

  document.addEventListener('submit', function (e) {
    var f = e.target;
    if (f.id === 'leaveForm') { e.preventDefault(); submitForm(); }
    if (f.id === 'staffForm') { e.preventDefault(); submitStaff(f); }
    if (f.id === 'typesForm') {
      e.preventDefault();
      var types = collectRows('typeRows', function (r) {
        return { ten: r.querySelector('[name=ten]').value, tinhNghi: r.querySelector('[name=tinh]').checked, mau: r.querySelector('[name=mau]').value };
      });
      doAction(call('saveTypes', { types: types }), 'Đã lưu loại nghỉ');
    }
    if (f.id === 'holidaysForm') {
      e.preventDefault();
      var hols = collectRows('holRows', function (r) { return { ngay: r.querySelector('[name=ngay]').value, ten: r.querySelector('[name=ten]').value }; });
      doAction(call('saveHolidays', { holidays: hols }), 'Đã lưu ngày lễ');
    }
    if (f.id === 'pinForm') {
      e.preventDefault();
      var p1 = f.elements.p1.value, p2 = f.elements.p2.value;
      if (p1 !== p2) { toast('Hai lần nhập mật khẩu mới không khớp', true); return; }
      Api.call({ action: 'changePin', token: S.auth.token, oldPin: f.elements.p0.value, newPin: p1, remember: S.auth.remember }).then(function (res) {
        saveAuth(authFrom(res, S.auth.remember)); f.reset(); toast('Đã đổi mật khẩu');
      }).catch(function (err) {
        if (/Phiên đăng nhập/.test(err.message)) { saveAuth(null); S.me = null; showLogin(err.message); }
        else toast(err.message, true);
      });
    }
    if (f.id === 'loginForm') {
      e.preventDefault();
      var ma = $('loginMa').value.trim().toLowerCase(), pin = $('loginPin').value.trim(), btn = $('loginBtn');
      var remember = $('loginRemember').checked;
      btn.disabled = true; btn.textContent = 'Đang đăng nhập…'; $('loginErr').textContent = '';
      Api.call({ action: 'login', ma: ma, pin: pin, remember: remember }).then(function (res) {
        $('loginPin').value = '';
        fitScreen();
        if (res.mustChange) { pendingFirst = { ma: ma, pin: pin, remember: remember }; showFirstPin(res.me); return; }
        saveAuth(authFrom(res, remember));
        return loadData();
      }).catch(function (err) { $('loginErr').textContent = err.message; })
        .then(function () { btn.disabled = false; btn.textContent = 'Đăng nhập'; });
    }
    if (f.id === 'firstPinForm') {
      e.preventDefault();
      var n1 = f.elements.p1.value, n2 = f.elements.p2.value, fb = $('firstPinBtn'), pf = pendingFirst;
      if (!pf) { showLogin(); return; }
      if (n1 !== n2) { $('firstPinErr').textContent = 'Hai lần nhập mật khẩu không khớp'; return; }
      fb.disabled = true; $('firstPinErr').textContent = '';
      Api.call({ action: 'changePin', ma: pf.ma, pin: pf.pin, newPin: n1, remember: pf.remember }).then(function (res) {
        pendingFirst = null; f.reset();
        saveAuth(authFrom(res, pf.remember));
        fitScreen();
        toast('Đã đổi mật khẩu. Chào ' + (res.me ? res.me.ten : '') + '!');
        return loadData();
      }).catch(function (err) { $('firstPinErr').textContent = err.message; })
        .then(function () { fb.disabled = false; });
    }
  });

  window.addEventListener('hashchange', function () {
    var v = location.hash.slice(1);
    if (S.me && v !== S.view && VIEWS.some(function (x) { return x.id === v; })) show(v);
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S.me && Date.now() - S.lastLoad > 120000) loadData(true);
  });

  /* ---------------- Bảng: kéo ngang trong khung, kéo dọc cuộn cả trang ----------------
     Khung bảng chỉ cuộn ngang nên mỗi lần vuốt chỉ đi một hướng. Dòng tiêu đề (ngày, cột) được đẩy xuống
     theo trang để luôn nằm ngay dưới thanh trên cùng. */
  var headTick = 0;
  function stickHeads() {
    headTick = 0;
    var top = document.querySelector('.topbar').getBoundingClientRect().bottom;
    Array.prototype.forEach.call(document.querySelectorAll('.grid-wrap > table, .tbl-wrap > table'), function (t) {
      if (!t.tHead || !t.offsetParent) return;
      var r = t.getBoundingClientRect(), hh = t.tHead.offsetHeight, foot = t.tFoot ? t.tFoot.offsetHeight : 0;
      var dy = Math.max(0, Math.min(top - r.top, r.height - hh - foot));
      t.style.setProperty('--hy', dy + 'px');
    });
  }
  function queueHeads() { if (!headTick) headTick = requestAnimationFrame(stickHeads); }
  window.addEventListener('scroll', queueHeads, { passive: true });
  window.addEventListener('resize', queueHeads);
  new MutationObserver(queueHeads).observe($('main'), { childList: true, subtree: true });

  /* ---------------- Khởi động ---------------- */
  // "Trung tâm PEC – Portcoast": trên điện thoại ẩn phần sau dấu – (logo đã có chữ Portcoast)
  var unitParts = String(cfg.UNIT_NAME || '').split(' – ');
  $('unitName').innerHTML = esc(unitParts[0]) + (unitParts.length > 1 ? '<em class="unit-sfx"> – ' + esc(unitParts.slice(1).join(' – ')) + '</em>' : '');
  $('loginUnit').textContent = cfg.UNIT_NAME || '';
  $('demoBanner').hidden = !Api.demo || SHOT;
  var hv = location.hash.slice(1);
  if (VIEWS.some(function (x) { return x.id === hv; })) S.view = hv;
  Api.ready.then(function () {
    renderDemoBar();
    if (SHOT && QS.get('as')) {
      var as = QS.get('as');
      if (as === 'login') { showLogin(); return; }
      if (QS.has('first')) {
        Api.call({ action: 'login', ma: as, pin: '123456' }).then(function (res) {
          showLogin(); pendingFirst = { ma: as, pin: '123456', remember: false }; showFirstPin(res.me);
        });
        return;
      }
      S.auth = { token: Api.demoToken(as), exp: Date.now() + 3600000, remember: false, ma: as };
      loadData();
      return;
    }
    var saved = loadAuth();
    if (saved) { S.auth = saved; loadData(); } else showLogin();
  });
})();
