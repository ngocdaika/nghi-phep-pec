/* Logic thuần: tính ngày nghỉ, tổng hợp. Giữ giống phần tính ngày trong apps-script/Code.gs */
(function (global) {
  'use strict';

  var ST = { PENDING: 'Chờ duyệt', APPROVED: 'Đã duyệt', REJECTED: 'Từ chối', CANCELLED: 'Đã hủy' };

  function parseYMD(s) {
    var p = String(s).split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function fmtYMD(d) {
    return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  function todayYMD() {
    var n = new Date();
    return n.getFullYear() + '-' + ('0' + (n.getMonth() + 1)).slice(-2) + '-' + ('0' + n.getDate()).slice(-2);
  }
  function daysInMonth(y, m) { return new Date(Date.UTC(y, m, 0)).getUTCDate(); } // m: 1..12
  function ymd(y, m, d) { return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2); }
  function dow(s) { return parseYMD(s).getUTCDay(); } // 0 = CN
  function viDate(s) { var p = s.split('-'); return p[2] + '/' + p[1] + '/' + p[0]; }
  var DOW = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

  function validateRange(r) {
    var re = /^\d{4}-\d{2}-\d{2}$/;
    if (!re.test(r.tuNgay) || !re.test(r.denNgay)) return 'Ngày không hợp lệ';
    if (r.denNgay < r.tuNgay) return 'Ngày kết thúc phải sau ngày bắt đầu';
    if (r.tuNgay === r.denNgay && r.tuBuoi === 'Chiều' && r.denBuoi === 'Sáng') return 'Buổi kết thúc phải sau buổi bắt đầu';
    if ((parseYMD(r.denNgay) - parseYMD(r.tuNgay)) / 86400000 > 366) return 'Một đơn không quá 1 năm';
    return '';
  }

  /** [{d, v, part}] — bỏ chủ nhật và ngày lễ; thứ 7 là ngày làm việc */
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

  function isActive(r) { return r.trangThai === ST.APPROVED || r.trangThai === ST.PENDING; }

  function emptyYear() {
    var z = function () { return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; };
    return { months: z(), total: 0, ctMonths: z(), ct: 0, pending: 0, byType: {}, byTypeMonth: {} };
  }
  /** Loại nghỉ có tính là ngày nghỉ không (Công tác thì không). Loại lạ mặc định là nghỉ. */
  function isOff(typeMap, loai) { return !(typeMap[loai] && typeMap[loai].tinhNghi === false); }

  /**
   * Dựng chỉ mục: byPerson[ma][ymd] = [{req, part, v}] và tổng theo năm/tháng.
   * months/total: ngày nghỉ (không gồm công tác); ctMonths/ct: ngày công tác; pending: ngày chờ duyệt (mọi loại).
   */
  function buildIndex(requests, holidaySet, typeMap) {
    var byPerson = {};
    var totals = {};
    requests.forEach(function (r) {
      if (!isActive(r)) return;
      var pend = r.trangThai === ST.PENDING;
      var off = isOff(typeMap, r.loai);
      expandLeave(r, holidaySet).forEach(function (x) {
        var p = byPerson[r.ma] || (byPerson[r.ma] = {});
        (p[x.d] || (p[x.d] = [])).push({ req: r, part: x.part, v: x.v });
        var y = +x.d.slice(0, 4), m = +x.d.slice(5, 7);
        var t = totals[r.ma] || (totals[r.ma] = {});
        var ty = t[y] || (t[y] = emptyYear());
        if (off) { ty.months[m - 1] += x.v; ty.total += x.v; } else { ty.ctMonths[m - 1] += x.v; ty.ct += x.v; }
        if (pend) ty.pending += x.v;
        ty.byType[r.loai] = (ty.byType[r.loai] || 0) + x.v;
        var bm = ty.byTypeMonth[r.loai] || (ty.byTypeMonth[r.loai] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        bm[m - 1] += x.v;
      });
    });
    return { byPerson: byPerson, totals: totals };
  }

  function yearTotals(index, ma, y) {
    var t = index.totals[ma] && index.totals[ma][y];
    return t || emptyYear();
  }

  function fmtNum(n) {
    if (!n) return '0';
    return (Math.round(n * 2) / 2).toString().replace('.', ',');
  }

  /* ---------- Phân quyền (giữ giống apps-script/Code.gs) ----------
   * Admin: toàn quyền. GiamDoc: duyệt mọi đơn. PGD: duyệt đơn của nhân sự thuộc các phòng phụ trách.
   * TruongPhong (Trưởng/Phó phòng): như cá nhân nhưng được xem tổng kết của mọi người.
   * NhanVien: cá nhân, chỉ xem tổng kết của chính mình.
   * Đơn của NhanVien/TruongPhong → PGĐ phụ trách phòng (không có thì Giám đốc);
   * đơn của PGD → Giám đốc; đơn của Giám đốc và Admin tự được duyệt. */
  var ROLES = { Admin: 'Quản trị', GiamDoc: 'Giám đốc', PGD: 'Phó Giám đốc', TruongPhong: 'Trưởng/Phó phòng', NhanVien: 'Nhân viên' };

  function phuTrachList(s) {
    return String((s && s.phuTrach) || '').split(';').map(function (x) { return x.trim(); }).filter(Boolean);
  }
  function isStaffRole(p) { return p.vaiTro === 'NhanVien' || p.vaiTro === 'TruongPhong'; }
  function covers(pgd, phong) { return pgd.vaiTro === 'PGD' && phuTrachList(pgd).indexOf(phong) >= 0; }
  function needsApproval(p) { return isStaffRole(p) || p.vaiTro === 'PGD'; }
  function isApprover(me) {
    return me.vaiTro === 'Admin' || me.vaiTro === 'GiamDoc' || (me.vaiTro === 'PGD' && phuTrachList(me).length > 0);
  }
  /** Được xem tổng kết tháng/năm của mọi người (Nhân viên chỉ xem của mình) */
  function canSeeAllTotals(me) { return !!me && me.vaiTro !== 'NhanVien'; }
  /** Người duyệt chính của p (để hiển thị và quyết định có tự duyệt hay không) */
  function primaryApprovers(staff, p) {
    if (!needsApproval(p)) return [];
    var active = staff.filter(function (s) { return s.trangThai !== 'Nghỉ việc' && s.ma !== p.ma; });
    if (isStaffRole(p)) {
      var a = active.filter(function (s) { return covers(s, p.phong); });
      if (a.length) return a;
    }
    var g = active.filter(function (s) { return s.vaiTro === 'GiamDoc'; });
    if (g.length) return g;
    return active.filter(function (s) { return s.vaiTro === 'Admin'; });
  }
  /** viewer có được duyệt / xóa đơn của requester không */
  function canApprove(viewer, requester) {
    if (!viewer || !requester || viewer.ma === requester.ma) return false;
    if (viewer.vaiTro === 'Admin') return true;
    if (!needsApproval(requester)) return false;
    if (viewer.vaiTro === 'GiamDoc') return true;
    return isStaffRole(requester) && covers(viewer, requester.phong);
  }
  /** Lý do nghỉ: chính người nghỉ và lãnh đạo từ Phó Giám đốc trở lên (giống Code.gs) */
  function canSeeReason(viewer, requester) {
    return !!viewer && !!requester && (viewer.ma === requester.ma || ['PGD', 'GiamDoc', 'Admin'].indexOf(viewer.vaiTro) >= 0);
  }

  global.Logic = {
    ST: ST, DOW: DOW, parseYMD: parseYMD, fmtYMD: fmtYMD, todayYMD: todayYMD, daysInMonth: daysInMonth, ymd: ymd,
    dow: dow, viDate: viDate, validateRange: validateRange, expandLeave: expandLeave, isActive: isActive,
    buildIndex: buildIndex, yearTotals: yearTotals, fmtNum: fmtNum, isOff: isOff,
    ROLES: ROLES, phuTrachList: phuTrachList, isStaffRole: isStaffRole, needsApproval: needsApproval, isApprover: isApprover, canSeeAllTotals: canSeeAllTotals,
    primaryApprovers: primaryApprovers, canApprove: canApprove, canSeeReason: canSeeReason
  };
})(typeof window !== 'undefined' ? window : this);
