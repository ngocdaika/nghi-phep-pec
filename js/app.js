(function () {
  'use strict';
  var L = window.Logic, ST = L.ST, Api = window.Api, cfg = window.APP_CONFIG || {};
  var AUTH_KEY = 'np_auth' + (Api.demo ? '_demo' : '');
  var OTHER_COLOR = '#EC4899';

  var now = new Date();
  var S = {
    auth: null, me: null, staff: [], types: [], typeMap: {}, holidays: {}, holidayName: {}, requests: [], index: null,
    view: 'calendar', y: now.getFullYear(), m: now.getMonth() + 1, sumYear: now.getFullYear(), phong: '',
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
    var t = $('toast');
    t.textContent = msg;
    t.className = 'show' + (bad ? ' bad' : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.className = ''; }, bad ? 5000 : 2800);
  }
  function colorOf(loai) { return S.typeMap[loai] ? (S.typeMap[loai].mau || OTHER_COLOR) : OTHER_COLOR; }
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
  function remaining(ma, y) {
    var p = person(ma);
    if (!p) return 0;
    return (Number(p.phepNam) || 0) + (Number(p.phepTon) || 0) - L.yearTotals(S.index, ma, y).phep;
  }
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
  function saveAuth(a) { S.auth = a; if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a)); else localStorage.removeItem(AUTH_KEY); }
  function loadAuth() { try { return JSON.parse(localStorage.getItem(AUTH_KEY)); } catch (e) { return null; } }

  function showLogin(msg) {
    $('login').hidden = false;
    $('userChip').hidden = true;
    $('loginErr').textContent = msg || '';
    setTimeout(function () { $('loginMa').focus(); }, 50);
  }

  function call(action, extra) {
    var p = { action: action, ma: S.auth.ma, pin: S.auth.pin };
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
      if (/PIN|Mã NV/.test(e.message)) { saveAuth(null); showLogin(e.message); }
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
    var staff = filteredStaff();
    var h = [];

    h.push('<div class="toolbar">',
      '<button class="btn icon" data-act="prev" aria-label="Tháng trước">◀</button>',
      '<h2>Tháng ' + m + '/' + y + '</h2>',
      '<button class="btn icon" data-act="next" aria-label="Tháng sau">▶</button>',
      '<button class="btn" data-act="thisMonth">Hôm nay</button>',
      '<span class="spacer"></span>', phongSelect('calPhong'),
      '<button class="btn primary" data-goto="form">+ Khai nghỉ</button>',
      '</div>');

    // Thẻ thống kê
    var todayList = [];
    staff.forEach(function (s) {
      var e = S.index.byPerson[s.ma] && S.index.byPerson[s.ma][today];
      if (e) e.forEach(function (x) { todayList.push({ s: s, x: x }); });
    });
    var monthTotal = 0, monthPeople = 0, monthPending = 0;
    staff.forEach(function (s) {
      var t = L.yearTotals(S.index, s.ma, y).months[m - 1];
      monthTotal += t; if (t) monthPeople++;
      var p = S.index.byPerson[s.ma] || {};
      for (var d = 1; d <= n; d++) (p[L.ymd(y, m, d)] || []).forEach(function (x) { if (x.req.trangThai === ST.PENDING) monthPending += x.v; });
    });
    var pend = pendingForMe();
    var myPend = S.requests.filter(function (r) { return r.ma === S.me.ma && r.trangThai === ST.PENDING; }).length;

    h.push('<div class="stats">');
    h.push('<div class="stat accent"><div class="k">Hôm nay nghỉ</div><div class="v">' + todayList.length + ' <small>người</small></div><div class="names">' +
      (todayList.length ? todayList.map(function (o) {
        return '<button class="person-chip' + (o.x.req.trangThai === ST.PENDING ? ' pending' : '') + '" data-req="' + esc(o.x.req.id) + '"><span class="dot" style="background:' + colorOf(o.x.req.loai) + '"></span>' +
          esc(o.s.ten) + (o.x.part !== 'full' ? ' <em>' + (o.x.part === 'am' ? 'sáng' : 'chiều') + '</em>' : '') + '</button>';
      }).join('') : '<span class="muted small">Không ai nghỉ</span>') + '</div></div>');
    h.push('<div class="stat"><div class="k">Tổng ngày nghỉ tháng ' + m + '</div><div class="v">' + L.fmtNum(monthTotal) + ' <small>ngày · ' + monthPeople + ' người</small></div>' +
      (monthPending ? '<div class="small" style="color:var(--warn);font-weight:600;margin-top:4px">Trong đó ' + L.fmtNum(monthPending) + ' ngày chờ duyệt</div>' : '') + '</div>');
    if (S.me.isApprover) {
      h.push('<div class="stat" style="cursor:pointer" data-goto="approve"><div class="k">Đơn chờ tôi duyệt</div><div class="v"' + (pend.length ? ' style="color:var(--warn)"' : '') + '>' + pend.length + ' <small>đơn</small></div><div class="small muted">Bấm để xem</div></div>');
    } else {
      h.push('<div class="stat" style="cursor:pointer" data-goto="me"><div class="k">Đơn của tôi chờ duyệt</div><div class="v">' + myPend + ' <small>đơn</small></div></div>');
    }
    var rem = remaining(S.me.ma, y);
    h.push('<div class="stat" style="cursor:pointer" data-goto="me"><div class="k">Phép năm ' + y + ' của tôi còn</div><div class="v"' + (rem < 0 ? ' style="color:var(--bad)"' : '') + '>' + L.fmtNum(rem) + ' <small>ngày</small></div>' +
      '<div class="small muted">Đã nghỉ ' + L.fmtNum(L.yearTotals(S.index, S.me.ma, y).total) + ' ngày trong năm</div></div>');
    h.push('</div>');

    // Bảng lịch
    h.push('<div class="grid-wrap"><table class="cal"><thead><tr><th class="name">Họ tên</th>');
    for (var d = 1; d <= n; d++) {
      var s = L.ymd(y, m, d), wd = L.dow(s);
      var cls = 'd' + (wd === 0 ? ' sun' : '') + (S.holidays[s] ? ' hol' : '') + (s === today ? ' today' : '');
      h.push('<th class="' + cls + '"' + (S.holidayName[s] ? ' title="' + esc(S.holidayName[s]) + '"' : '') + '>' + d + '<span class="wd">' + L.DOW[wd] + '</span></th>');
    }
    h.push('<th class="sum">Tháng<br>' + m + '</th><th class="sum">Năm<br>' + y + '</th><th class="sum">Còn<br>phép</th></tr></thead><tbody>');

    var lastPhong = null;
    staff.forEach(function (st) {
      if (st.phong !== lastPhong) {
        lastPhong = st.phong;
        h.push('<tr class="grp"><td colspan="' + (n + 4) + '"><span class="grp-label">' + esc(st.phong) + '</span></td></tr>');
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
      var mt = yt.months[m - 1], rem2 = remaining(st.ma, y);
      h.push('<td class="sum' + (mt ? '' : ' zero') + '">' + L.fmtNum(mt) + (mPend ? '<span class="p">' + L.fmtNum(mPend) + ' chờ</span>' : '') + '</td>');
      h.push('<td class="sum' + (yt.total ? '' : ' zero') + '">' + L.fmtNum(yt.total) + '</td>');
      h.push('<td class="sum' + (rem2 < 0 ? ' neg' : '') + '">' + L.fmtNum(rem2) + '</td></tr>');
    });
    if (!staff.length) h.push('<tr><td class="name">Không có nhân sự</td></tr>');
    h.push('</tbody></table></div>');

    // Chú thích
    var usedTypes = {};
    S.requests.forEach(function (r) { usedTypes[r.loai] = 1; });
    S.types.forEach(function (t) { usedTypes[t.ten] = 1; });
    h.push('<div class="legend">' + Object.keys(usedTypes).map(function (t) {
      return '<span><i class="dot" style="background:' + colorOf(t) + '"></i>' + esc(t) + '</span>';
    }).join('') + '<span><i class="dot sw-pending"></i>Chờ duyệt</span><span><i class="dot sw-half"></i>Nửa ngày</span>' +
      '<span><i class="dot" style="background:var(--sun);border:1px solid var(--line)"></i>Chủ nhật</span>' +
      '<span><i class="dot" style="background:var(--hol)"></i>Ngày lễ</span></div>');

    // Danh sách theo ngày
    h.push('<div class="card daylist"><h2>Ai nghỉ ngày nào – Tháng ' + m + '/' + y + '</h2>');
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
    if (!any) h.push('<div class="empty">Tháng này chưa có ai đăng ký nghỉ.</div>');
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
    if (opt.stats) {
      var y = +r.tuNgay.slice(0, 4);
      extra = '<div class="meta">Năm ' + y + ': đã nghỉ ' + L.fmtNum(L.yearTotals(S.index, r.ma, y).total) + ' ngày · phép năm còn ' + L.fmtNum(remaining(r.ma, y)) + ' ngày</div>';
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
      '<div class="kv"><div><b>' + L.fmtNum(yt.total) + '</b><span>Đã nghỉ năm ' + y + '</span></div>' +
      '<div><b>' + L.fmtNum(remaining(ma, y)) + '</b><span>Phép năm còn lại</span></div>' +
      '<div><b>' + L.fmtNum(yt.pending) + '</b><span>Ngày chờ duyệt</span></div></div>' +
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
    return { ma: S.me ? S.me.ma : '', loai: S.types[0] ? S.types[0].ten : 'Phép năm', tuNgay: t, tuBuoi: 'Sáng', denNgay: t, denBuoi: 'Chiều', lyDo: '' };
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
    h.push('<label class="full">Loại nghỉ (chọn hoặc gõ tự do)<input name="loai" list="typeList" value="' + esc(f.loai) + '" required maxlength="60"></label>');
    h.push('<datalist id="typeList">' + S.types.map(function (t) { return '<option value="' + esc(t.ten) + '">'; }).join('') + '</datalist>');
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
    var y = +f.tuNgay.slice(0, 4);
    var tru = S.typeMap[f.loai] && S.typeMap[f.loai].truPhep;
    var rem = remaining(f.ma, y);
    box.innerHTML = '<div class="big">' + L.fmtNum(total) + ' ngày nghỉ</div>' +
      '<div class="small muted">Đã bỏ qua chủ nhật và ngày lễ. ' + who + '</div>' +
      (tru ? '<div class="small" style="margin-top:4px">Phép năm ' + y + ' còn: <b>' + L.fmtNum(rem) + '</b> → sau đơn này: <b' + (rem - total < 0 ? ' style="color:var(--bad)"' : '') + '>' + L.fmtNum(rem - total) + '</b> ngày</div>' : '') +
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

  /* ---------------- Tổng kết năm ---------------- */
  function summaryRows(y) {
    return filteredStaff().map(function (s) {
      var t = L.yearTotals(S.index, s.ma, y);
      var std = (Number(s.phepNam) || 0) + (Number(s.phepTon) || 0);
      return { s: s, t: t, std: std, rem: std - t.phep };
    });
  }

  function renderSummary() {
    var y = S.sumYear, rows = summaryRows(y), cm = new Date().getFullYear() === y ? new Date().getMonth() : -1;
    var monthSum = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], byType = {}, grand = 0;
    rows.forEach(function (o) {
      o.t.months.forEach(function (v, i) { monthSum[i] += v; });
      grand += o.t.total;
      for (var k in o.t.byType) byType[k] = (byType[k] || 0) + o.t.byType[k];
    });
    var max = Math.max.apply(null, monthSum.concat([1]));
    var h = [];
    h.push('<div class="toolbar"><button class="btn icon" data-act="yprev" aria-label="Năm trước">◀</button><h2>Năm ' + y + '</h2>' +
      '<button class="btn icon" data-act="ynext" aria-label="Năm sau">▶</button><span class="spacer"></span>' + phongSelect('sumPhong') +
      '<button class="btn" data-act="csvSummary">⬇ Xuất bảng tổng hợp</button><button class="btn" data-act="csvList">⬇ Xuất danh sách đơn</button></div>');
    h.push('<div class="two-col"><div class="card"><h2>Tổng ngày nghỉ theo tháng · cả năm ' + L.fmtNum(grand) + ' ngày</h2><div class="chart">' +
      monthSum.map(function (v, i) {
        return '<div class="col"><span class="val">' + (v ? L.fmtNum(v) : '') + '</span><div class="bar' + (i === cm ? ' cur' : '') + '" style="height:' + (v / max * 100) + '%" title="Tháng ' + (i + 1) + ': ' + L.fmtNum(v) + ' ngày"></div><span class="lbl">T' + (i + 1) + '</span></div>';
      }).join('') + '</div></div>');
    var tkeys = Object.keys(byType).sort(function (a, b) { return byType[b] - byType[a]; });
    h.push('<div class="card"><h2>Theo loại nghỉ</h2>' + (tkeys.length ? tkeys.map(function (k) {
      return '<div class="type-row"><span class="dot" style="background:' + colorOf(k) + '"></span>' + esc(k) + (S.typeMap[k] && S.typeMap[k].truPhep ? ' <span class="chip">trừ phép</span>' : '') + '<b>' + L.fmtNum(byType[k]) + ' ngày</b></div>';
    }).join('') : '<div class="empty">Chưa có dữ liệu.</div>') + '</div></div>');

    h.push('<div class="card"><h2>Bảng tổng hợp ngày nghỉ năm ' + y + '</h2><div class="tbl-wrap"><table class="sum-tbl"><thead><tr><th>Họ tên</th>');
    for (var i = 1; i <= 12; i++) h.push('<th>T' + i + '</th>');
    h.push('<th>Tổng</th><th>Chờ duyệt</th><th>Phép được hưởng</th><th>Đã trừ phép</th><th>Còn lại</th></tr></thead><tbody>');
    var last = null;
    rows.forEach(function (o) {
      if (o.s.phong !== last) { last = o.s.phong; h.push('<tr class="grp"><td colspan="18">' + esc(last) + '</td></tr>'); }
      h.push('<tr><td><a href="#" data-person="' + esc(o.s.ma) + '" style="color:inherit;text-decoration:none">' + esc(o.s.ten) + '</a></td>' +
        o.t.months.map(function (v) { return '<td' + (v ? '' : ' class="zero"') + '>' + L.fmtNum(v) + '</td>'; }).join('') +
        '<td class="tot">' + L.fmtNum(o.t.total) + '</td><td' + (o.t.pending ? ' style="color:var(--warn);font-weight:600"' : ' class="zero"') + '>' + L.fmtNum(o.t.pending) + '</td>' +
        '<td>' + L.fmtNum(o.std) + '</td><td>' + L.fmtNum(o.t.phep) + '</td><td' + (o.rem < 0 ? ' class="neg"' : '') + '>' + L.fmtNum(o.rem) + '</td></tr>');
    });
    h.push('</tbody><tfoot><tr><td>Tổng cộng (' + rows.length + ' người)</td>' + monthSum.map(function (v) { return '<td>' + L.fmtNum(v) + '</td>'; }).join('') +
      '<td>' + L.fmtNum(grand) + '</td><td colspan="4"></td></tr></tfoot></table></div></div>');
    $('view-summary').innerHTML = h.join('');
  }

  function downloadCsv(name, rows) {
    var csv = '﻿' + rows.map(function (r) {
      return r.map(function (c) {
        c = c == null ? '' : String(c);
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
    var y = S.sumYear, head = ['Mã NV', 'Họ tên', 'Phòng', 'Chức danh'];
    for (var i = 1; i <= 12; i++) head.push('T' + i);
    head = head.concat(['Tổng năm', 'Chờ duyệt', 'Phép được hưởng', 'Đã trừ phép', 'Còn lại']);
    var rows = [head].concat(summaryRows(y).map(function (o) {
      return [o.s.ma, o.s.ten, o.s.phong, o.s.chucDanh].concat(o.t.months.map(num), [num(o.t.total), num(o.t.pending), num(o.std), num(o.t.phep), num(o.rem)]);
    }));
    downloadCsv('TongHop_NghiPhep_' + y + (S.phong ? '_' + S.phong : '') + '.csv', rows);
  }
  function csvList() {
    var y = String(S.sumYear), staffSet = {};
    filteredStaff().forEach(function (s) { staffSet[s.ma] = s; });
    var list = S.requests.filter(function (r) { return staffSet[r.ma] && (r.tuNgay.slice(0, 4) === y || r.denNgay.slice(0, 4) === y); })
      .sort(function (a, b) { return a.tuNgay < b.tuNgay ? -1 : 1; });
    var rows = [['Mã NV', 'Họ tên', 'Phòng', 'Loại nghỉ', 'Từ ngày', 'Từ buổi', 'Đến ngày', 'Đến buổi', 'Số ngày', 'Trạng thái', 'Lý do', 'Người duyệt', 'Ngày duyệt', 'Ngày gửi']]
      .concat(list.map(function (r) {
        return [r.ma, r.ten, staffSet[r.ma].phong, r.loai, L.viDate(r.tuNgay), r.tuBuoi, L.viDate(r.denNgay), r.denBuoi, num(countOf(r)), r.trangThai, r.lyDo, r.nguoiDuyet, r.ngayDuyet, r.ngayTao];
      }));
    downloadCsv('DanhSach_DonNghi_' + y + '.csv', rows);
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
      '</div></div>' +
      '<div class="kv"><div><b>' + L.fmtNum(yt.total) + '</b><span>Đã nghỉ năm ' + y + '</span></div>' +
      '<div><b' + (remaining(me.ma, y) < 0 ? ' style="color:var(--bad)"' : '') + '>' + L.fmtNum(remaining(me.ma, y)) + '</b><span>Phép năm còn lại (trên ' + L.fmtNum((Number(p.phepNam) || 0) + (Number(p.phepTon) || 0)) + ')</span></div>' +
      '<div><b>' + L.fmtNum(yt.pending) + '</b><span>Ngày chờ duyệt</span></div></div></div>' +
      '<div class="card"><h2>Đơn nghỉ của tôi</h2>' + (mine.length ? mine.map(function (r) { return reqBlock(r, { noName: true }); }).join('') : '<div class="empty">Bạn chưa có đơn nghỉ nào.</div>') + '</div>' +
      '<div class="card"><h2>Đổi mã PIN</h2><form id="pinForm" class="form-grid">' +
      '<label>PIN mới (4–8 chữ số)<input type="password" inputmode="numeric" name="p1" autocomplete="new-password" required></label>' +
      '<label>Nhập lại PIN mới<input type="password" inputmode="numeric" name="p2" autocomplete="new-password" required></label>' +
      '<div class="full"><button class="btn primary" type="submit">Đổi PIN</button></div></form></div>' +
      '<div class="card" style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn" data-act="refresh">↻ Tải lại dữ liệu</button><button class="btn bad" data-act="logout">Đăng xuất</button>' +
      (Api.demo ? '<button class="btn" data-act="resetDemo">Đặt lại dữ liệu demo</button>' : '') + '</div>';
  }

  /* ---------------- Quản trị ---------------- */
  var ROLE_ORDER = { Admin: 0, GiamDoc: 1, PGD: 2, NhanVien: 3 };
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
    if (!isAdmin) h.push('<div class="card small muted">Giám đốc được nâng tài khoản lên Phó Giám đốc (và giao phòng phụ trách) hoặc hạ về Cá nhân. Các thay đổi khác do quản trị viên thực hiện.</div>');

    // Phân công duyệt theo phòng
    h.push('<div class="card"><h2>Ai duyệt đơn của từng phòng</h2>' + allPhong().map(function (ph) {
      var pgd = S.staff.filter(function (s) { return s.trangThai !== 'Nghỉ việc' && s.vaiTro === 'PGD' && L.phuTrachList(s).indexOf(ph) >= 0; });
      return '<div class="assign-row"><span>' + esc(ph) + '</span><span class="who">' +
        (pgd.length ? pgd.map(function (s) { return '<b>' + esc(s.ten) + '</b>'; }).join(', ') : '<span class="muted">Chưa giao PGĐ — Giám đốc duyệt</span>') + '</span></div>';
    }).join('') + '<div class="small muted" style="margin-top:8px">Giám đốc và Quản trị luôn duyệt được mọi đơn. Đơn của Phó Giám đốc do Giám đốc duyệt.</div></div>');

    // Bảng tài khoản
    h.push('<div class="card"><h2>Tài khoản (' + S.staff.length + ')</h2><div class="tbl-wrap"><table class="sum-tbl adm-tbl"><thead><tr>' +
      '<th>Họ tên</th><th>Mã</th><th>Vai trò</th><th>Phòng</th><th>Phụ trách duyệt</th><th>Phép năm + tồn</th><th>Trạng thái</th><th></th></tr></thead><tbody>');
    list.forEach(function (s) {
      var editable = isAdmin || s.vaiTro === 'NhanVien' || s.vaiTro === 'PGD';
      h.push('<tr' + (s.trangThai === 'Nghỉ việc' ? ' class="off"' : '') + '><td>' + esc(s.ten) + '<div class="small muted">' + esc(s.chucDanh) + '</div></td>' +
        '<td>' + esc(s.ma) + '</td><td>' + roleChip(s.vaiTro) + '</td><td>' + esc(s.phong || '—') + '</td>' +
        '<td class="wrap">' + esc(s.vaiTro === 'PGD' ? (L.phuTrachList(s).join(', ') || 'chưa giao') : '') + '</td>' +
        '<td>' + L.fmtNum(s.phepNam) + ' + ' + L.fmtNum(s.phepTon) + '</td><td>' + esc(s.trangThai) + '</td>' +
        '<td>' + (editable ? '<button class="btn" data-edit-staff="' + esc(s.ma) + '">Sửa</button>' : '') + '</td></tr>');
    });
    h.push('</tbody></table></div></div>');

    if (isAdmin) {
      h.push('<div class="adm-grid"><div class="card"><h2>Loại nghỉ</h2><form id="typesForm"><div class="ed-list" id="typeRows">' +
        S.types.map(typeRow).join('') + '</div><div class="ed-foot"><button type="button" class="btn" data-act="addTypeRow">+ Thêm loại</button>' +
        '<button class="btn primary" type="submit">Lưu loại nghỉ</button></div>' +
        '<div class="small muted" style="margin-top:8px">"Trừ phép" = số ngày nghỉ loại này được trừ vào phép năm.</div></form></div>');
      var hol = Object.keys(S.holidays).sort().map(function (d) { return { ngay: d, ten: S.holidayName[d] }; });
      h.push('<div class="card"><h2>Ngày lễ (không tính ngày nghỉ)</h2><form id="holidaysForm"><div class="ed-list" id="holRows">' +
        hol.map(holRow).join('') + '</div><div class="ed-foot"><button type="button" class="btn" data-act="addHolRow">+ Thêm ngày lễ</button>' +
        '<button class="btn primary" type="submit">Lưu ngày lễ</button></div></form></div></div>');
    }
    $('view-admin').innerHTML = h.join('');
  }

  function typeRow(t) {
    t = t || { ten: '', truPhep: false, mau: '#64748B' };
    return '<div class="ed-row"><input name="ten" value="' + esc(t.ten) + '" placeholder="Tên loại nghỉ" maxlength="60">' +
      '<label class="ck"><input type="checkbox" name="tru"' + (t.truPhep ? ' checked' : '') + '> Trừ phép</label>' +
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
    var s = isNew ? { ma: '', ten: '', phong: '', chucDanh: '', vaiTro: 'NhanVien', phuTrach: '', phepNam: 12, phepTon: 0, trangThai: 'Đang làm' } : person(ma);
    var dis = isAdmin ? '' : ' disabled';
    var roles = isAdmin ? ['NhanVien', 'PGD', 'GiamDoc', 'Admin'] : ['NhanVien', 'PGD'];
    var scope = L.phuTrachList(s);
    openModal('<h3>' + (isNew ? 'Thêm nhân sự' : 'Tài khoản ' + esc(s.ten)) + '</h3><form id="staffForm" class="form-grid" data-new="' + (isNew ? 1 : 0) + '">' +
      '<label>Mã NV<input name="ma" value="' + esc(s.ma) + '"' + (isNew ? ' required maxlength="20" placeholder="VD: NS41"' : ' readonly') + '></label>' +
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
      '<label>Phép năm (ngày)<input name="phepNam" type="number" step="0.5" min="0" value="' + esc(s.phepNam) + '"' + dis + '></label>' +
      '<label>Phép tồn năm trước<input name="phepTon" type="number" step="0.5" min="0" value="' + esc(s.phepTon) + '"' + dis + '></label>' +
      '<div class="full" style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end">' +
      (isAdmin && !isNew ? '<button type="button" class="btn" data-reset-pin="' + esc(s.ma) + '" style="margin-right:auto">Đặt lại PIN</button>' : '') +
      '<button type="button" class="btn" data-close>Thôi</button><button class="btn primary" type="submit">' + (isNew ? 'Tạo tài khoản' : 'Lưu') + '</button></div>' +
      '</form>');
  }

  function showPin(ten, ma, pin, title) {
    openModal('<h3>' + esc(title) + '</h3><p>Mã NV <b>' + esc(ma) + '</b> – ' + esc(ten) + '</p><div class="pin-box">' + esc(pin) + '</div>' +
      '<p class="small muted">Gửi riêng PIN này cho người dùng. PIN chỉ hiện một lần; hệ thống lưu dạng mã hóa nên không ai xem lại được. Người dùng nên đổi PIN ở tab Cá nhân.</p>' +
      '<div style="text-align:right"><button class="btn primary" data-close>Đã ghi lại</button></div>');
  }

  function submitStaff(f) {
    var isNew = f.getAttribute('data-new') === '1', el = f.elements;
    var data = { ma: el.ma.value.trim().toUpperCase(), vaiTro: el.vaiTro.value,
                 phuTrach: Array.prototype.filter.call(f.querySelectorAll('input[name=phuTrach]'), function (c) { return c.checked; }).map(function (c) { return c.value; }) };
    if (S.me.isAdmin) {
      data.ten = el.ten.value; data.phong = el.phong.value; data.chucDanh = el.chucDanh.value;
      data.trangThai = el.trangThai.value; data.phepNam = el.phepNam.value; data.phepTon = el.phepTon.value;
    }
    if (data.vaiTro === 'PGD' && !data.phuTrach.length && !confirm('Phó Giám đốc chưa được giao phòng nào. Vẫn lưu?')) return;
    call('saveStaff', { staff: data, isNew: isNew }).then(function (res) {
      return loadData(true).then(function () {
        if (res.pin) showPin(data.ten, data.ma, res.pin, 'Đã tạo tài khoản');
        else { closeModal(); toast('Đã lưu tài khoản ' + data.ma); }
      });
    }).catch(function (e) { toast(e.message, true); });
  }

  function collectRows(id, fn) {
    return Array.prototype.map.call($(id).querySelectorAll('.ed-row'), fn);
  }

  /* ---------------- Sự kiện ---------------- */
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('button, a, td, [data-goto]');
    if (!t) return;
    var a;
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
      openModal('<h3>Đặt lại PIN cho ' + esc(rp.ten) + '?</h3><p class="muted">PIN cũ sẽ không dùng được nữa. Hệ thống tạo PIN mới 6 số để anh/chị gửi riêng cho người này.</p>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end"><button class="btn" data-close>Thôi</button><button class="btn primary" data-reset-pin-confirm="' + esc(a) + '">Đặt lại PIN</button></div>');
      return;
    }
    if ((a = t.getAttribute('data-reset-pin-confirm'))) {
      call('resetPin', { target: a }).then(function (res) { var p2 = person(res.ma); showPin(p2 ? p2.ten : '', res.ma, res.pin, 'PIN mới'); })
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
        case 'yprev': S.sumYear--; renderSummary(); break;
        case 'ynext': S.sumYear++; renderSummary(); break;
        case 'csvSummary': csvSummary(); break;
        case 'csvList': csvList(); break;
        case 'refresh': loadData(true).then(function () { toast('Đã cập nhật'); }); break;
        case 'logout': saveAuth(null); S.me = null; S.form = null; S.view = 'calendar'; showLogin(); break;
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
        return { ten: r.querySelector('[name=ten]').value, truPhep: r.querySelector('[name=tru]').checked, mau: r.querySelector('[name=mau]').value };
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
      if (p1 !== p2) { toast('Hai lần nhập PIN không khớp', true); return; }
      call('changePin', { newPin: p1 }).then(function () {
        saveAuth({ ma: S.auth.ma, pin: p1 }); f.reset(); toast('Đã đổi PIN');
      }).catch(function (err) { toast(err.message, true); });
    }
    if (f.id === 'loginForm') {
      e.preventDefault();
      var ma = $('loginMa').value.trim().toUpperCase(), pin = $('loginPin').value.trim(), btn = $('loginBtn');
      btn.disabled = true; btn.textContent = 'Đang đăng nhập…'; $('loginErr').textContent = '';
      Api.call({ action: 'login', ma: ma, pin: pin }).then(function () {
        saveAuth({ ma: ma, pin: pin });
        $('loginPin').value = '';
        return loadData();
      }).catch(function (err) { $('loginErr').textContent = err.message; })
        .then(function () { btn.disabled = false; btn.textContent = 'Đăng nhập'; });
    }
  });

  window.addEventListener('hashchange', function () {
    var v = location.hash.slice(1);
    if (S.me && v !== S.view && VIEWS.some(function (x) { return x.id === v; })) show(v);
  });
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && S.me && Date.now() - S.lastLoad > 120000) loadData(true);
  });

  /* ---------------- Khởi động ---------------- */
  $('unitName').textContent = cfg.UNIT_NAME || '';
  $('loginUnit').textContent = cfg.UNIT_NAME || '';
  $('demoBanner').hidden = !Api.demo;
  var hv = location.hash.slice(1);
  if (VIEWS.some(function (x) { return x.id === hv; })) S.view = hv;
  var saved = loadAuth();
  if (saved && saved.ma && saved.pin) { S.auth = saved; loadData(); } else showLogin();
})();
