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

  /**
   * Dựng chỉ mục: byPerson[ma][ymd] = [{req, part, v}], và tổng theo năm/tháng.
   */
  function buildIndex(requests, holidaySet, typeMap) {
    var byPerson = {};
    var totals = {}; // totals[ma][year] = {months:[12], total, pending, phep}
    requests.forEach(function (r) {
      if (!isActive(r)) return;
      var pend = r.trangThai === ST.PENDING;
      var tru = typeMap[r.loai] ? typeMap[r.loai].truPhep : false;
      expandLeave(r, holidaySet).forEach(function (x) {
        var p = byPerson[r.ma] || (byPerson[r.ma] = {});
        (p[x.d] || (p[x.d] = [])).push({ req: r, part: x.part, v: x.v });
        var y = +x.d.slice(0, 4), m = +x.d.slice(5, 7);
        var t = totals[r.ma] || (totals[r.ma] = {});
        var ty = t[y] || (t[y] = { months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 0, pending: 0, phep: 0, byType: {} });
        ty.months[m - 1] += x.v;
        ty.total += x.v;
        if (pend) ty.pending += x.v;
        if (tru) ty.phep += x.v;
        ty.byType[r.loai] = (ty.byType[r.loai] || 0) + x.v;
      });
    });
    return { byPerson: byPerson, totals: totals };
  }

  function yearTotals(index, ma, y) {
    var t = index.totals[ma] && index.totals[ma][y];
    return t || { months: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], total: 0, pending: 0, phep: 0, byType: {} };
  }

  function fmtNum(n) {
    if (!n) return '0';
    return (Math.round(n * 2) / 2).toString().replace('.', ',');
  }

  global.Logic = {
    ST: ST, DOW: DOW, parseYMD: parseYMD, fmtYMD: fmtYMD, todayYMD: todayYMD, daysInMonth: daysInMonth, ymd: ymd,
    dow: dow, viDate: viDate, validateRange: validateRange, expandLeave: expandLeave, isActive: isActive,
    buildIndex: buildIndex, yearTotals: yearTotals, fmtNum: fmtNum
  };
})(typeof window !== 'undefined' ? window : this);
