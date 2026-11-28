"""Sinh trang hướng dẫn sử dụng huong-dan/index.html (2 cột: Máy tính / Điện thoại).

Ảnh chụp ở huong-dan/img/ lấy từ bản demo với danh sách tên giả (không dùng tên thật).
Toạ độ khoanh (x, y, rộng, cao) tính theo pixel CSS của trang lúc chụp: máy tính 1280 px, điện thoại 390 px.
Chạy:  python tools/tao_huong_dan.py
"""
import html
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SITE = 'https://ngocdaika.github.io/nghi-phep-pec/'

# Kích thước ảnh (pixel CSS) và vị trí khoanh
SHOTS = {
    'web-login': (420, 528, [[58, 212, 304, 38], [58, 287, 304, 38], [58, 339, 304, 18], [58, 371, 304, 38]]),  # đã cắt quanh khung đăng nhập
    'mob-login': (390, 844, [[44, 369, 302, 39], [44, 445, 302, 39], [44, 498, 302, 18], [44, 530, 302, 38]]),
    'web-first': (420, 528, [[58, 256, 304, 38], [58, 331, 304, 38], [58, 383, 304, 38]]),
    'mob-first': (390, 844, [[44, 413, 302, 39], [44, 489, 302, 39], [44, 542, 302, 38]]),
    'web-calendar': (1280, 860, [[20, 71, 354, 38], [974, 70, 160, 39], [20, 121, 297, 169], [1142, 71, 104, 38], [20, 378, 190, 34], [930, 378, 30, 34]]),
    'mob-calendar': (390, 1180, [[10, 61, 355, 38], [10, 107, 355, 46], [10, 165, 355, 160], [96, 1126, 92, 50], [10, 601, 118, 34]]),
    'web-form': (1280, 860, [[276, 141, 728, 39], [276, 216, 728, 32], [276, 285, 612, 81], [276, 403, 728, 69], [276, 489, 728, 100], [276, 603, 728, 38]]),
    'mob-form': (390, 973, [[26, 132, 338, 86], [26, 254, 338, 70], [26, 361, 338, 205], [26, 603, 338, 81], [26, 701, 338, 116], [26, 831, 338, 38]]),
    'web-approve': (1280, 860, [[798, 8, 110, 35], [1062, 133, 82, 38], [1152, 133, 77, 38]]),
    'mob-approve': (390, 1100, [[151, 1046, 73, 50], [26, 254, 82, 38], [116, 254, 77, 38]]),
    'web-summary': (1280, 860, [[21, 72, 241, 35], [271, 71, 258, 38], [732, 70, 160, 39], [900, 71, 345, 38]]),
    'mob-summary': (390, 1100, [[11, 62, 353, 35], [10, 106, 355, 38], [10, 152, 355, 46], [10, 206, 345, 38]]),
    'web-me': (1280, 1350, [[36, 86, 1208, 57], [36, 357, 1208, 21], [36, 990, 1208, 218], [174, 1256, 95, 38]]),
    'mob-me': (390, 1670, [[26, 77, 338, 57], [26, 370, 338, 21], [26, 1103, 338, 312], [164, 1463, 95, 38]]),
    'web-admin': (1280, 860, [[1111, 70, 134, 38], [20, 120, 1225, 217], [998, 510, 77, 17], [1144, 443, 52, 38]]),
    'mob-admin': (390, 1100, [[231, 61, 134, 38], [10, 111, 355, 252]]),
}


def esc(s):
    return html.escape(s, quote=True)


def shot(name, alt):
    w, h, marks = SHOTS[name]
    pad = 5
    boxes = []
    for i, (x, y, bw, bh) in enumerate(marks, 1):
        l, t = max(x - pad, 0), max(y - pad, 0)
        r, b = min(x + bw + pad, w), min(y + bh + pad, h)
        boxes.append('<span class="mk" style="left:%.2f%%;top:%.2f%%;width:%.2f%%;height:%.2f%%"><b>%d</b></span>'
                     % (l / w * 100, t / h * 100, (r - l) / w * 100, (b - t) / h * 100, i))
    cls = 'shot mob' if name.startswith('mob') else 'shot'
    style = ' style="max-width:%dpx"' % w if w < 700 and not name.startswith('mob') else ''
    return ('<a class="%s"%s href="img/%s.png" target="_blank" rel="noopener" title="Bấm để xem ảnh lớn">'
            '<img src="img/%s.png" alt="%s" loading="lazy" width="%d" height="%d">%s</a>'
            % (cls, style, name, name, esc(alt), w, h, ''.join(boxes)))


def steps(items):
    return '<ol class="steps">' + ''.join('<li>%s</li>' % s for s in items) + '</ol>'


def two(web, mob, eq=False):
    return ('<div class="cols' + (' eq' if eq else '') + '"><div class="col web"><div class="col-h">' + ICON_PC + 'Trên máy tính</div>' + web + '</div>'
            '<div class="col mob"><div class="col-h">' + ICON_PHONE + 'Trên điện thoại</div>' + mob + '</div></div>')


ICON_PC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>'
ICON_PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2" width="12" height="20" rx="2"/><path d="M11 18h2"/></svg>'

SECTIONS = []


def section(sid, title, intro, body):
    SECTIONS.append((sid, title, '<section id="%s"><h2>%s</h2>%s%s</section>' % (sid, esc(title), intro, body)))


# ---------------------------------------------------------------- Nội dung
section('gioi-thieu', 'Giới thiệu', '''
<p>Ứng dụng <b>Lịch nghỉ phép PEC</b> giúp mỗi người tự khai ngày nghỉ, lãnh đạo duyệt trên điện thoại hoặc máy tính, và cả Trung tâm biết hôm nay ai vắng mặt.</p>
<div class="feat">
  <div><b>📅 Lịch tháng</b><span>Ai nghỉ ngày nào, hôm nay ai vắng mặt.</span></div>
  <div><b>➕ Khai nghỉ</b><span>Nghỉ phép, Công tác, Nghỉ không lương; cả ngày hoặc nửa ngày.</span></div>
  <div><b>✅ Duyệt</b><span>PGĐ / Giám đốc duyệt hoặc từ chối đơn, có số đơn chờ.</span></div>
  <div><b>📊 Tổng kết</b><span>Tổng hợp theo tháng, theo năm; xuất ra Excel.</span></div>
  <div><b>👤 Cá nhân</b><span>Đơn của tôi, hủy đơn, đổi mật khẩu, đăng xuất.</span></div>
  <div><b>🛡️ Quản trị</b><span>Thêm nhân sự, phân quyền, giao phòng cho PGĐ, đặt lại mật khẩu.</span></div>
</div>
<p>Địa chỉ: <a href="../">''' + SITE + '''</a> &nbsp;·&nbsp; Ngày làm việc: thứ 2 – thứ 7 (không tính chủ nhật và ngày lễ).</p>
<table class="roles">
<thead><tr><th>Vai trò</th><th>Xem được</th><th>Làm được</th></tr></thead>
<tbody>
<tr><td><b>Nhân viên</b></td><td>Hôm nay ai vắng mặt; lịch và tổng kết của chính mình</td><td>Khai đơn, hủy đơn đang chờ duyệt</td></tr>
<tr><td><b>Trưởng / Phó phòng</b></td><td>Lịch và tổng kết của cả Trung tâm</td><td>Như nhân viên</td></tr>
<tr><td><b>Phó Giám đốc</b></td><td>Như trên</td><td>Duyệt đơn của các phòng được giao phụ trách</td></tr>
<tr><td><b>Giám đốc</b></td><td>Như trên, kèm lý do nghỉ</td><td>Duyệt mọi đơn; đổi vai trò, giao phòng cho PGĐ</td></tr>
<tr><td><b>Quản trị</b></td><td>Tất cả</td><td>Toàn quyền: nhân sự, mật khẩu, loại nghỉ, ngày lễ</td></tr>
</tbody></table>
<p class="muted">Đơn của Nhân viên và Trưởng/Phó phòng do PGĐ phụ trách phòng duyệt (phòng chưa giao PGĐ thì Giám đốc duyệt). Đơn của PGĐ do Giám đốc duyệt. Lý do nghỉ chỉ người nghỉ, người duyệt và Giám đốc xem được.</p>
''', '')

section('dang-nhap', '1. Đăng nhập', '''
<p><b>Mã nhân sự</b> = tên + chữ đầu của họ và tên đệm, viết thường, không dấu. Ví dụ: Nguyễn Hoàng Khánh Ngọc → <code>ngoc.nhk</code>, Lê Vinh → <code>vinh.l</code>. Trùng mã thì thêm số (<code>ngoc.nhk2</code>). Lần đầu dùng mật khẩu <code>123456</code>.</p>
''', two(
    shot('web-login', 'Màn hình đăng nhập trên máy tính') + steps([
        'Nhập <b>mã nhân sự</b>.', 'Nhập <b>mật khẩu</b>.',
        'Đánh dấu <b>Giữ đăng nhập 30 ngày</b> nếu là máy của riêng bạn (máy dùng chung thì bỏ trống).',
        'Bấm <b>Đăng nhập</b>.']),
    shot('mob-login', 'Màn hình đăng nhập trên điện thoại') + steps([
        'Nhập <b>mã nhân sự</b>.', 'Nhập <b>mật khẩu</b>.',
        'Đánh dấu <b>Giữ đăng nhập 30 ngày</b> để không phải đăng nhập lại.', 'Bấm <b>Đăng nhập</b>.'])))

section('doi-mat-khau-lan-dau', '2. Đổi mật khẩu lần đầu', '''
<p>Lần đầu đăng nhập bằng mật khẩu mặc định, ứng dụng yêu cầu đặt mật khẩu riêng (6–32 ký tự, có thể dùng chữ và số). Không nên để mật khẩu toàn số giống nhau hay dãy liên tiếp.</p>
''', two(
    shot('web-first', 'Đổi mật khẩu lần đầu trên máy tính') + steps(['Nhập <b>mật khẩu mới</b>.', '<b>Nhập lại</b> mật khẩu mới.', 'Bấm <b>Đổi mật khẩu và vào</b>.']),
    shot('mob-first', 'Đổi mật khẩu lần đầu trên điện thoại') + steps(['Nhập <b>mật khẩu mới</b>.', '<b>Nhập lại</b> mật khẩu mới.', 'Bấm <b>Đổi mật khẩu và vào</b>.'])))

LEGEND = '''<div class="legend">
<span><i style="background:#0093DD"></i>Nghỉ phép</span><span><i style="background:#10B981"></i>Công tác</span>
<span><i style="background:#F97316"></i>Nghỉ không lương</span><span><i class="sw-p"></i>Chờ duyệt (ô sọc)</span>
<span><i class="sw-h"></i>Nửa ngày (nửa ô)</span><span><i style="background:#EEF2F6;border:1px solid #CBD5E1"></i>Chủ nhật</span></div>'''

section('lich-thang', '3. Lịch tháng', '''
<p>Màn hình chính. Mỗi dòng là một người, mỗi cột là một ngày; cột ngày hôm nay tô xanh. <b>Kéo ngang</b> trong bảng để xem các ngày khác, <b>kéo dọc</b> để cuộn trang (dòng ngày luôn nằm trên cùng).
Nhân viên chỉ thấy dòng của mình và mục <b>Hôm nay vắng mặt</b>; Trưởng/Phó phòng trở lên thấy cả Trung tâm kèm cột tổng ngày nghỉ.</p>
''' + LEGEND, two(
    shot('web-calendar', 'Lịch tháng trên máy tính') + steps([
        '<b>◀ ▶</b> chuyển tháng, <b>Hôm nay</b> quay về tháng này.', 'Lọc theo <b>phòng</b>.',
        '<b>Hôm nay vắng mặt</b>: bấm tên để xem chi tiết.', 'Bấm <b>+ Khai nghỉ</b> để tạo đơn.',
        'Bấm <b>tên</b> một người để xem các đơn của người đó trong năm.', 'Bấm <b>ô màu</b> để xem chi tiết ngày nghỉ.']),
    shot('mob-calendar', 'Lịch tháng trên điện thoại') + steps([
        '<b>◀ ▶</b> chuyển tháng, <b>Hôm nay</b> quay về tháng này.', 'Chạm để chọn <b>phòng</b> cần xem.',
        '<b>Hôm nay vắng mặt</b>: chạm tên để xem chi tiết.', 'Thanh dưới cùng: chạm <b>Khai nghỉ</b> để tạo đơn.',
        'Chạm <b>tên</b> để xem đơn của người đó; chạm <b>ô màu</b> để xem chi tiết. Vuốt ngang trong bảng để xem các ngày khác.'])))

section('khai-nghi', '4. Khai nghỉ', '''
<p>Chủ nhật và ngày lễ tự bỏ qua. Nghỉ nửa ngày: chọn <b>Từ chiều</b> ở ngày đầu hoặc <b>Hết buổi sáng</b> ở ngày cuối. Đơn mới ở trạng thái <b>Chờ duyệt</b> (ô sọc trên lịch) cho đến khi được duyệt.</p>
''', two(
    shot('web-form', 'Khai nghỉ trên máy tính') + steps([
        'Chọn <b>loại</b>: Nghỉ phép, Công tác hoặc Nghỉ không lương.', '<b>Chọn nhanh</b>: cả ngày hôm nay, sáng nay, chiều nay, ngày mai.',
        'Hoặc chọn <b>Từ ngày – Đến ngày</b> và buổi.', 'Ghi <b>lý do</b> (chỉ bạn, người duyệt và quản trị xem được).',
        'Kiểm tra <b>số ngày nghỉ</b> và người sẽ duyệt.', 'Bấm <b>Gửi đơn nghỉ</b>.']),
    shot('mob-form', 'Khai nghỉ trên điện thoại') + steps([
        'Chọn <b>loại</b>.', '<b>Chọn nhanh</b> ngày phổ biến.', 'Hoặc chọn <b>Từ ngày – Đến ngày</b> và buổi.',
        'Ghi <b>lý do</b>.', 'Kiểm tra <b>số ngày</b> và người duyệt.', 'Chạm <b>Gửi đơn nghỉ</b>.'])))

section('duyet', '5. Duyệt đơn (PGĐ, Giám đốc, Quản trị)', '''
<p>Tab <b>Duyệt</b> chỉ hiện với người có quyền duyệt; số đỏ là số đơn đang chờ. Mỗi đơn kèm số ngày người đó đã nghỉ trong năm để tham khảo.</p>
''', two(
    shot('web-approve', 'Duyệt đơn trên máy tính') + steps(['Mở tab <b>Duyệt</b>.', 'Bấm <b>✓ Duyệt</b> để đồng ý.', 'Bấm <b>Từ chối</b> và ghi lý do (người nghỉ sẽ thấy).']),
    shot('mob-approve', 'Duyệt đơn trên điện thoại') + steps(['Chạm tab <b>Duyệt</b> ở thanh dưới.', 'Chạm <b>✓ Duyệt</b>.', 'Chạm <b>Từ chối</b> và ghi lý do.'])))

section('tong-ket', '6. Tổng kết', '''
<p>Tổng ngày nghỉ theo tháng hoặc năm, theo từng loại, từng người. Công tác được đếm riêng, không cộng vào ngày nghỉ. Nhân viên chỉ thấy số liệu của mình.</p>
''', two(
    shot('web-summary', 'Tổng kết trên máy tính') + steps(['Chọn <b>Tổng kết tháng</b> hoặc <b>Tổng kết năm</b>.', '<b>◀ ▶</b> chuyển tháng / năm.', 'Lọc theo <b>phòng</b>.', '<b>Xuất</b> bảng tổng hợp hoặc danh sách đơn ra file CSV, mở bằng Excel.']),
    shot('mob-summary', 'Tổng kết trên điện thoại') + steps(['Chọn <b>tháng</b> hoặc <b>năm</b>.', '<b>◀ ▶</b> chuyển kỳ.', 'Lọc theo <b>phòng</b>.', '<b>Xuất</b> file CSV.'])))

section('ca-nhan', '7. Cá nhân – đơn của tôi, đổi mật khẩu, đăng xuất', '''
<p>Bấm vào <b>tên của bạn</b> ở góc trên bên phải (hoặc tab <b>Cá nhân</b>). Đổi mật khẩu xong, các máy khác đang đăng nhập tài khoản của bạn sẽ phải đăng nhập lại.</p>
''', two(
    shot('web-me', 'Trang cá nhân trên máy tính') + steps([
        'Thông tin của bạn và <b>người duyệt đơn</b> của bạn; số ngày nghỉ tháng / năm.',
        '<b>Đơn nghỉ của tôi</b>: đơn đang chờ duyệt có nút <b>Hủy đơn</b>.',
        '<b>Đổi mật khẩu</b>: nhập mật khẩu hiện tại và mật khẩu mới.', '<b>Đăng xuất</b> (nhớ đăng xuất trên máy dùng chung).']),
    shot('mob-me', 'Trang cá nhân trên điện thoại') + steps([
        'Thông tin và người duyệt đơn của bạn.', '<b>Đơn nghỉ của tôi</b>, hủy đơn đang chờ.', '<b>Đổi mật khẩu</b>.', '<b>Đăng xuất</b>.'])))

section('quan-tri', '8. Quản trị (Quản trị viên, Giám đốc)', '''
<p>Quản trị viên quản lý toàn bộ tài khoản, loại nghỉ và ngày lễ. Giám đốc đổi được vai trò giữa Nhân viên, Trưởng/Phó phòng và Phó Giám đốc, và giao phòng phụ trách cho PGĐ.</p>
''', two(
    shot('web-admin', 'Quản trị trên máy tính') + steps([
        '<b>+ Thêm nhân sự</b>: để trống ô mã thì hệ thống tự tạo (dạng <code>ten.hodem</code>), mật khẩu ban đầu <code>123456</code>.',
        '<b>Ai duyệt đơn của từng phòng</b>: phòng chưa giao PGĐ thì Giám đốc duyệt.',
        '<b>Chưa đổi MK</b>: người này chưa đăng nhập lần nào; nhắc họ đăng nhập và đổi mật khẩu.',
        '<b>Sửa</b>: đổi vai trò, giao phòng phụ trách cho PGĐ, <b>đặt lại mật khẩu</b> (về 123456), chuyển trạng thái <b>Nghỉ việc</b>.']),
    shot('mob-admin', 'Quản trị trên điện thoại') + steps([
        '<b>+ Thêm nhân sự</b>.', '<b>Ai duyệt đơn của từng phòng</b>.',
        'Kéo ngang bảng <b>Tài khoản</b> để thấy nhãn <b>Chưa đổi MK</b> và nút <b>Sửa</b>.'])))

# ---------------------------------------------------------------- Cài đặt như ứng dụng
APP_ICON = '<img class="appicon" src="../assets/apple-touch-icon.png" alt="">'
DOTS_V = '<svg viewBox="0 0 24 24"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>'
DOTS_H = '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>'
SHARE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>'


def n(i):
    return '<b class="n">%d</b>' % i


chrome_mock = '''
<div class="mock browser">
  <div class="bbar"><span class="dots3"><i></i><i></i><i></i></span><span class="url">🔒 ngocdaika.github.io/nghi-phep-pec</span>
  <span class="ico ring">''' + DOTS_V + n(1) + '''</span></div>
  <div class="menu">
    <div>Thẻ mới</div><div>Cửa sổ mới</div><div class="sep"></div>
    <div class="ring">Truyền, lưu và chia sẻ ›''' + n(2) + '''</div>
    <div class="sub"><div>Lưu trang dưới dạng…</div><div class="ring">Tạo lối tắt…''' + n(3) + '''</div></div>
  </div>
  <div class="dlg"><div class="dlg-h">Tạo lối tắt?</div><div class="dlg-r">''' + APP_ICON + '''<span class="inp">Nghỉ phép PEC</span></div>
  <label class="ring">☑ Mở dưới dạng cửa sổ''' + n(4) + '''</label><div class="dlg-b"><span>Hủy</span><span class="pri ring">Tạo''' + n(5) + '''</span></div></div>
</div>'''

edge_mock = '''
<div class="mock browser">
  <div class="bbar"><span class="url">🔒 ngocdaika.github.io/nghi-phep-pec</span><span class="ico ring">''' + DOTS_H + n(1) + '''</span></div>
  <div class="menu"><div>Thẻ mới</div><div class="sep"></div><div class="ring">Ứng dụng ›''' + n(2) + '''</div>
  <div class="sub"><div class="ring">Cài đặt trang web này dưới dạng ứng dụng''' + n(3) + '''</div></div></div>
  <div class="dlg"><div class="dlg-h">Cài đặt ứng dụng</div><div class="dlg-r">''' + APP_ICON + '''<span class="inp">Nghỉ phép PEC</span></div>
  <div class="dlg-b"><span>Hủy</span><span class="pri ring">Cài đặt''' + n(4) + '''</span></div></div>
</div>'''

desktop_result = '''<div class="mock desk"><div class="desk-ic">''' + APP_ICON + '''<span>Nghỉ phép PEC</span></div>
<p>Biểu tượng Portcoast xuất hiện trên màn hình nền (Desktop). Bấm đúp để mở, ứng dụng chạy trong cửa sổ riêng như phần mềm.
Muốn ghim xuống thanh tác vụ: mở ứng dụng → chuột phải vào biểu tượng ở thanh tác vụ → <b>Ghim vào thanh tác vụ</b>.</p></div>'''

ios_mock = '''
<div class="phone"><div class="scr">
  <div class="p-top">ngocdaika.github.io</div>
  <div class="p-body"><b>Lịch nghỉ phép</b><span>Trung tâm PEC</span></div>
  <div class="p-bar"><span>‹</span><span>›</span><span class="ring sh">''' + SHARE + n(1) + '''</span><span>▢</span><span>⧉</span></div>
</div></div>
<div class="phone"><div class="scr sheet-ios">
  <div class="p-sheet"><div class="row">Sao chép</div><div class="row">Thêm vào Mục ưa thích</div>
  <div class="row ring">Thêm vào MH chính <span class="r">⊞</span>''' + n(2) + '''</div><div class="row">Đánh dấu</div></div>
</div></div>
<div class="phone"><div class="scr">
  <div class="p-nav"><span>Hủy</span><b>Thêm vào MH chính</b><span class="ring add">Thêm''' + n(3) + '''</span></div>
  <div class="p-add">''' + APP_ICON + '''<div><span class="inp">Nghỉ phép PEC</span><small>ngocdaika.github.io</small></div></div>
</div></div>'''

android_mock = '''
<div class="phone"><div class="scr">
  <div class="p-top a"><span>ngocdaika.github.io</span><span class="ring dot3">''' + DOTS_V + n(1) + '''</span></div>
  <div class="p-menu"><div>Thẻ mới</div><div>Lịch sử</div><div class="ring">Thêm vào màn hình chính''' + n(2) + '''</div><div>Chia sẻ…</div></div>
</div></div>
<div class="phone"><div class="scr dim">
  <div class="p-dlg"><b>Thêm vào màn hình chính</b><div class="p-add">''' + APP_ICON + '''<span class="inp">Nghỉ phép PEC</span></div>
  <div class="dlg-b"><span>Hủy</span><span class="pri ring">Thêm''' + n(3) + '''</span></div></div>
</div></div>
<div class="phone"><div class="scr home">
  <div class="hgrid"><i></i><i></i><i></i><div class="hic">''' + APP_ICON + '''<span>Nghỉ phép PEC</span></div><i></i><i></i><i></i><i></i></div>
</div></div>'''

section('cai-dat', '9. Đưa ứng dụng ra màn hình (lối tắt / nút app)', '''
<p>Sau khi cài, ứng dụng có biểu tượng <b>Portcoast</b>, mở bằng một chạm như phần mềm bình thường, không cần nhớ địa chỉ web.
Lần đầu mở từ biểu tượng có thể phải <b>đăng nhập lại một lần</b> — nhớ đánh dấu <b>Giữ đăng nhập 30 ngày</b>.</p>
''', two(
    '<h3>Google Chrome (Windows)</h3>' + chrome_mock + steps([
        'Mở trang ' + SITE + ', bấm nút <b>⋮</b> ở góc trên bên phải.', 'Chọn <b>Truyền, lưu và chia sẻ</b>.',
        'Chọn <b>Tạo lối tắt…</b> <span class="muted">(nếu thấy <b>Cài đặt trang…</b> / biểu tượng cài đặt ở cuối thanh địa chỉ thì bấm vào đó cũng được)</span>.',
        'Đánh dấu <b>Mở dưới dạng cửa sổ</b>.', 'Bấm <b>Tạo</b>.']) +
    '<h3>Microsoft Edge</h3>' + edge_mock + steps([
        'Bấm nút <b>…</b> ở góc trên bên phải.', 'Chọn <b>Ứng dụng</b>.', 'Chọn <b>Cài đặt trang web này dưới dạng ứng dụng</b>.', 'Bấm <b>Cài đặt</b>.']) +
    '<h3>Kết quả</h3>' + desktop_result,
    '<h3>iPhone / iPad (Safari)</h3><div class="phones">' + ios_mock + '</div>' + steps([
        'Mở trang bằng <b>Safari</b> (nếu bấm link trong Zalo/Messenger, chọn <b>Mở bằng Safari</b> trước). Chạm nút <b>Chia sẻ</b> ' +
        '<span class="muted">(ô vuông có mũi tên lên, ở thanh dưới; trên iOS mới có thể nằm trong nút <b>•••</b>)</span>.',
        'Kéo xuống, chọn <b>Thêm vào MH chính</b> (Add to Home Screen).', 'Chạm <b>Thêm</b> ở góc trên bên phải.']) +
    '<h3>Android (Chrome)</h3><div class="phones">' + android_mock + '</div>' + steps([
        'Mở trang bằng <b>Chrome</b>, chạm nút <b>⋮</b> ở góc trên bên phải.',
        'Chọn <b>Thêm vào màn hình chính</b> <span class="muted">(có máy ghi <b>Cài đặt ứng dụng</b>)</span>.',
        'Chạm <b>Thêm</b> (hoặc <b>Cài đặt</b>). Biểu tượng Portcoast <b>Nghỉ phép PEC</b> xuất hiện trên màn hình chính.']), eq=True))

section('hoi-dap', '10. Câu hỏi thường gặp', '''
<dl class="faq">
<dt>Quên mật khẩu?</dt><dd>Báo Quản trị viên đặt lại. Mật khẩu trở về <code>123456</code>, đăng nhập rồi đặt mật khẩu mới.</dd>
<dt>Báo "Nhập sai mật khẩu quá 5 lần"?</dt><dd>Tài khoản tạm khóa 15 phút để chống dò mật khẩu. Chờ 15 phút rồi thử lại.</dd>
<dt>Không thấy tab Duyệt / Quản trị?</dt><dd>Các tab này chỉ hiện với người có quyền (PGĐ được giao phòng, Giám đốc, Quản trị).</dd>
<dt>Gửi nhầm đơn?</dt><dd>Vào <b>Cá nhân → Đơn nghỉ của tôi</b>, bấm <b>Hủy đơn</b> khi đơn còn chờ duyệt. Đơn đã duyệt thì nhờ người duyệt hủy giúp.</dd>
<dt>Dùng máy tính chung?</dt><dd>Không đánh dấu <b>Giữ đăng nhập 30 ngày</b>, và bấm <b>Đăng xuất</b> ở tab Cá nhân sau khi dùng.</dd>
<dt>Màn hình hiển thị bản cũ?</dt><dd>Đóng hẳn trang / ứng dụng rồi mở lại, hoặc kéo xuống để tải lại.</dd>
</dl>''', '')

# ---------------------------------------------------------------- Trang
CSS = '''
:root{--brand:#0093DD;--brand-d:#006FA8;--line:#E2E8F0;--muted:#64748B;--mk:#E11D48;--bg:#F3F6F9}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;font:15px/1.55 "Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#0F172A;background:var(--bg)}
a{color:var(--brand-d)}code{background:#E8F4FB;color:#035c8a;padding:1px 6px;border-radius:5px;font-size:.92em}
.muted{color:var(--muted)}
header.top{background:#fff;border-bottom:3px solid var(--brand);position:sticky;top:0;z-index:20}
.top-in{max-width:1180px;margin:0 auto;display:flex;align-items:center;gap:14px;padding:10px 18px}
.top-in img{height:30px}.top-in .t{border-left:1px solid var(--line);padding-left:14px;line-height:1.2}
.top-in .t b{display:block;font-size:16px}.top-in .t span{font-size:12px;color:var(--muted)}
.top-in .go{margin-left:auto;background:var(--brand);color:#fff;text-decoration:none;font-weight:600;padding:8px 14px;border-radius:10px;white-space:nowrap}
main{max-width:1180px;margin:0 auto;padding:18px}
.hero{background:linear-gradient(135deg,#0093DD,#006FA8);color:#fff;border-radius:16px;padding:22px 24px;margin-bottom:16px}
.hero h1{margin:0 0 6px;font-size:26px}.hero p{margin:0;opacity:.92}
nav.toc{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 18px}
nav.toc a{background:#fff;border:1px solid var(--line);border-radius:999px;padding:6px 12px;text-decoration:none;color:#0F172A;font-size:14px;font-weight:600}
nav.toc a:hover{border-color:var(--brand);color:var(--brand-d)}
section{background:#fff;border-radius:16px;box-shadow:0 1px 3px rgba(15,23,42,.06);padding:20px 22px;margin-bottom:18px;scroll-margin-top:70px}
section h2{margin:0 0 8px;font-size:21px;color:var(--brand-d)}section h3{margin:18px 0 10px;font-size:16px}
.cols{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(0,1fr);gap:22px;margin-top:14px}
.col-h{display:flex;align-items:center;gap:8px;font-weight:700;color:var(--brand-d);border-bottom:2px solid #E8F4FB;padding-bottom:6px;margin-bottom:12px}
.col-h svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round}
.shot{position:relative;display:block;border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fff}
.shot img{display:block;width:100%;height:auto}
.shot[style]{margin:0 auto}
.cols.eq{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.shot.mob{max-width:320px;margin:0 auto;border-radius:22px;border:6px solid #1E293B}
.mk{position:absolute;border:3px solid var(--mk);border-radius:8px;box-shadow:0 0 0 3px rgba(225,29,72,.18);pointer-events:none}
.mk b,.n{position:absolute;top:-13px;left:-13px;width:24px;height:24px;border-radius:50%;background:var(--mk);color:#fff;font:700 13px/24px "Segoe UI",Arial,sans-serif;text-align:center;box-shadow:0 1px 3px rgba(0,0,0,.3)}
.steps{counter-reset:s;list-style:none;padding:0;margin:12px 0 0}
.steps li{counter-increment:s;position:relative;padding:4px 0 4px 34px;margin:2px 0}
.steps li::before{content:counter(s);position:absolute;left:0;top:4px;width:24px;height:24px;border-radius:50%;background:var(--mk);color:#fff;font-weight:700;font-size:13px;line-height:24px;text-align:center}
.feat{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:12px 0}
.feat div{border:1px solid var(--line);border-radius:12px;padding:10px 12px}.feat b{display:block}.feat span{color:var(--muted);font-size:14px}
table.roles{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}
.roles th,.roles td{border-bottom:1px solid var(--line);padding:8px;text-align:left;vertical-align:top}.roles th{color:var(--muted);font-size:12px;text-transform:uppercase}
.legend{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:14px;margin:8px 0}
.legend span{display:inline-flex;align-items:center;gap:6px}.legend i{width:16px;height:16px;border-radius:4px;display:inline-block}
.legend .sw-p{background:repeating-linear-gradient(45deg,#0093DD 0 3px,#fff 3px 6px);border:1px solid #0093DD}
.legend .sw-h{background:linear-gradient(90deg,#0093DD 50%,#fff 50%);border:1px solid #0093DD}
.faq dt{font-weight:700;margin-top:10px}.faq dd{margin:2px 0 0}
/* Hình minh hoạ cài đặt */
.ring{position:relative;outline:3px solid var(--mk);outline-offset:2px;border-radius:6px}
.ring>.n{top:-14px;left:auto;right:-14px}
.mock{border:1px solid var(--line);border-radius:12px;background:#F8FAFC;padding:12px;font-size:13px;position:relative}
.browser .bbar{display:flex;align-items:center;gap:10px;background:#fff;border:1px solid var(--line);border-radius:10px;padding:6px 10px}
.browser .url{flex:1;background:#F1F5F9;border-radius:999px;padding:4px 12px;color:#334155;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dots3 i{display:inline-block;width:9px;height:9px;border-radius:50%;background:#CBD5E1;margin-right:4px}
.ico{display:inline-flex;width:26px;height:26px;align-items:center;justify-content:center}.ico svg{width:18px;height:18px;fill:#334155}
.menu{margin:10px 0 0 auto;width:270px;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 8px 20px rgba(15,23,42,.12);padding:6px}
.menu>div,.sub>div{padding:6px 10px}.menu .sep{height:1px;background:var(--line);padding:0;margin:4px 0}
.menu .sub{margin:4px 0 4px 26px;border-left:2px solid var(--line)}
.dlg{margin-top:14px;background:#fff;border:1px solid var(--line);border-radius:12px;padding:14px;max-width:340px;box-shadow:0 8px 20px rgba(15,23,42,.1)}
.dlg-h{font-weight:700;margin-bottom:10px}.dlg-r{display:flex;align-items:center;gap:10px;margin-bottom:10px}.dlg label{display:inline-block;padding:2px 6px}
.dlg-b{display:flex;justify-content:flex-end;gap:10px;margin-top:10px}.dlg-b span{padding:6px 14px;border-radius:8px;border:1px solid var(--line)}
.dlg-b .pri{background:var(--brand);color:#fff;border-color:var(--brand)}
.inp{border:1px solid var(--line);border-radius:6px;padding:4px 8px;background:#fff}
.appicon{width:44px;height:44px;border-radius:10px;border:1px solid var(--line);background:#fff}
.desk{display:flex;gap:14px;align-items:center;background:linear-gradient(135deg,#1E3A5F,#0F5C8C);color:#fff}
.desk p{margin:0;font-size:14px}.desk a{color:#BDE6FB}
.desk-ic{display:flex;flex-direction:column;align-items:center;gap:4px;width:92px;flex:none;font-size:12px;text-align:center}.desk-ic .appicon{width:56px;height:56px}
.phones{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.phone{border:5px solid #1E293B;border-radius:22px;background:#1E293B;aspect-ratio:9/16;overflow:visible}
.scr{position:relative;height:100%;background:#fff;border-radius:16px;font-size:11px;display:flex;flex-direction:column}
.p-top{background:#F1F5F9;margin:8px;border-radius:999px;padding:4px 8px;text-align:center;color:#334155;font-size:10px}
.p-top.a{display:flex;justify-content:space-between;align-items:center;border-radius:8px}
.dot3{display:inline-flex}.dot3 svg{width:14px;height:14px;fill:#334155}
.p-body{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--brand-d)}.p-body b{font-size:13px}.p-body span{color:var(--muted)}
.p-bar{display:flex;justify-content:space-around;align-items:center;border-top:1px solid var(--line);padding:8px 4px;font-size:14px;color:#334155}
.p-bar .sh{display:inline-flex;color:var(--brand)}.p-bar svg{width:18px;height:18px}
.sheet-ios{background:#CBD5E1;justify-content:flex-end}
.p-sheet{background:#fff;border-radius:12px;margin:8px;padding:4px}.p-sheet .row{padding:7px 8px;border-bottom:1px solid #F1F5F9;display:flex;justify-content:space-between}
.p-nav{display:flex;justify-content:space-between;align-items:center;padding:10px 6px;border-bottom:1px solid var(--line);gap:4px;font-size:10px}.p-nav b{font-size:9px;text-align:center}
.p-nav .add{color:var(--brand);font-weight:700;padding:0 4px}
.p-add{display:flex;align-items:center;gap:8px;padding:12px 8px}.p-add small{display:block;color:var(--muted);font-size:9px;margin-top:3px}
.p-add .appicon{width:38px;height:38px}.p-add .inp{font-size:10px}
.p-menu{margin:0 8px 0 auto;width:85%;background:#fff;border:1px solid var(--line);border-radius:8px;box-shadow:0 6px 16px rgba(15,23,42,.15);padding:4px}
.p-menu div{padding:6px}
.scr.dim{background:#94A3B8;justify-content:center}
.p-dlg{background:#fff;border-radius:12px;margin:10px;padding:10px}.p-dlg .dlg-b span{padding:3px 8px;font-size:10px}
.scr.home{background:linear-gradient(160deg,#0B4F7C,#1E293B);padding:14px 10px}
.hgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.hgrid i{aspect-ratio:1;border-radius:9px;background:rgba(255,255,255,.18)}
.hic{display:flex;flex-direction:column;align-items:center;gap:2px;color:#fff;font-size:7px;line-height:1.1;text-align:center;outline:3px solid var(--mk);outline-offset:2px;border-radius:9px;min-width:0}
.hic span{overflow-wrap:anywhere}
.hic .appicon{width:100%;height:auto;aspect-ratio:1;border-radius:9px}
footer{text-align:center;color:var(--muted);font-size:13px;padding:10px 0 30px}
@media (max-width:900px){
  .cols{grid-template-columns:1fr}.col.mob{order:-1}
  .feat{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media (max-width:560px){
  main{padding:10px}section{padding:16px 14px;border-radius:12px}.hero{padding:18px}.hero h1{font-size:21px}
  .top-in .t span{display:none}.feat{grid-template-columns:1fr}
  .roles th:nth-child(2),.roles td:nth-child(2){display:none}
  .phones{grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}.scr{font-size:9px}
}
@media print{header.top,nav.toc{display:none}section{break-inside:avoid;box-shadow:none;border:1px solid var(--line)}}
'''


def build():
    toc = ''.join('<a href="#%s">%s</a>' % (sid, esc(t)) for sid, t, _ in SECTIONS)
    page = '''<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer">
<title>Hướng dẫn sử dụng – Lịch nghỉ phép PEC</title>
<link rel="icon" type="image/png" href="../assets/favicon.png">
<link rel="apple-touch-icon" href="../assets/apple-touch-icon.png">
<style>''' + CSS + '''</style>
</head>
<body>
<header class="top"><div class="top-in"><img src="../assets/logo.png" alt="Portcoast"><div class="t"><b>Hướng dẫn sử dụng</b><span>Lịch nghỉ phép – Trung tâm PEC</span></div>
<a class="go" href="../">Mở ứng dụng →</a></div></header>
<main>
<div class="hero"><h1>Hướng dẫn sử dụng Lịch nghỉ phép PEC</h1>
<p>Mỗi mục có 2 cột: <b>Trên máy tính</b> và <b>Trên điện thoại</b>. Ô khoanh đỏ đánh số là chỗ cần bấm, giải thích theo số ở bên dưới ảnh. Bấm vào ảnh để xem cỡ lớn.</p></div>
<nav class="toc">''' + toc + '''</nav>
''' + '\n'.join(s for _, _, s in SECTIONS) + '''
<footer>Ảnh minh hoạ chụp từ bản demo với tên giả. © Portcoast – Trung tâm PEC</footer>
</main>
</body>
</html>
'''
    out = os.path.join(ROOT, 'huong-dan', 'index.html')
    with open(out, 'w', encoding='utf-8') as f:
        f.write(page)
    print('Đã tạo', out)


if __name__ == '__main__':
    build()
