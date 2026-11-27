"""Tạo file Excel dữ liệu ban đầu để nhập vào Google Sheets.

Đọc danh sách nhân sự (STT | Họ và tên | Chức danh, có dòng tiêu đề phòng dạng I, II, ...),
gán Mã NV, PIN ngẫu nhiên, người duyệt mặc định. File kết quả chứa PIN — KHÔNG đưa lên GitHub.

Chạy:  python tools/tao_du_lieu_ban_dau.py "PEC_Danh sach nhan su.xlsx" "Du lieu Google Sheet - Nghi phep PEC.xlsx"
"""
import secrets
import sys

import openpyxl
from openpyxl.styles import Font, PatternFill
from openpyxl.worksheet.datavalidation import DataValidation

HEADERS = {
    'NhanSu': ['MaNV', 'HoTen', 'Phong', 'ChucDanh', 'VaiTro', 'NguoiDuyet', 'PhepNam', 'PhepTon', 'PIN', 'TrangThai'],
    'LoaiNghi': ['Ten', 'TruPhep', 'Mau'],
    'NgayLe': ['Ngay', 'TenNgayLe'],
    'DonNghi': ['ID', 'MaNV', 'HoTen', 'LoaiNghi', 'TuNgay', 'TuBuoi', 'DenNgay', 'DenBuoi', 'SoNgay', 'LyDo',
                'TrangThai', 'NguoiDuyet', 'NgayDuyet', 'GhiChuDuyet', 'NgayTao'],
}

LOAI_NGHI = [
    ('Phép năm', 'Có', '#0093DD'),
    ('Nghỉ ốm', 'Không', '#F59E0B'),
    ('Việc riêng có lương (cưới, tang…)', 'Không', '#8B5CF6'),
    ('Nghỉ không lương', 'Không', '#64748B'),
    ('Nghỉ bù', 'Không', '#10B981'),
    ('Công tác', 'Không', '#0EA5E9'),
]

# Ngày lễ: kiểm tra lại theo thông báo của công ty. Mục "(dự kiến)" cần xác nhận.
NGAY_LE = [
    ('2026-01-01', 'Tết Dương lịch'),
    ('2026-02-16', 'Tết Nguyên đán'), ('2026-02-17', 'Tết Nguyên đán'), ('2026-02-18', 'Tết Nguyên đán'),
    ('2026-02-19', 'Tết Nguyên đán'), ('2026-02-20', 'Tết Nguyên đán'),
    ('2026-04-27', 'Giỗ Tổ Hùng Vương (nghỉ bù)'),
    ('2026-04-30', 'Ngày Giải phóng miền Nam'), ('2026-05-01', 'Quốc tế Lao động'),
    ('2026-09-01', 'Quốc khánh'), ('2026-09-02', 'Quốc khánh'),
    ('2027-01-01', 'Tết Dương lịch'),
    ('2027-02-05', 'Tết Nguyên đán (dự kiến)'), ('2027-02-06', 'Tết Nguyên đán (dự kiến)'),
    ('2027-02-08', 'Tết Nguyên đán (dự kiến)'), ('2027-02-09', 'Tết Nguyên đán (dự kiến)'),
    ('2027-02-10', 'Tết Nguyên đán (dự kiến)'),
    ('2027-04-16', 'Giỗ Tổ Hùng Vương (dự kiến)'),
    ('2027-04-30', 'Ngày Giải phóng miền Nam'), ('2027-05-01', 'Quốc tế Lao động'),
    ('2027-09-02', 'Quốc khánh'), ('2027-09-03', 'Quốc khánh (dự kiến)'),
]

ROMAN = {'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'}


def ten_phong(s):
    s = str(s).strip()
    if s.upper().startswith('BAN GIÁM ĐỐC'):
        return 'Ban Giám đốc'
    s = s.lower().replace('và chuyển đổi số', '& chuyển đổi số')
    if s.startswith('phòng '):
        rest = s[6:]
        return 'Phòng ' + rest[:1].upper() + rest[1:]
    return s[:1].upper() + s[1:]


def doc_nhan_su(path):
    ws = openpyxl.load_workbook(path, data_only=True).active
    people, phong = [], ''
    for stt, ten, chuc in ws.iter_rows(min_row=2, max_col=3, values_only=True):
        if ten is None:
            continue
        if isinstance(stt, str) and stt.strip().upper() in ROMAN:
            phong = ten_phong(ten)
            continue
        people.append({'ten': str(ten).strip(), 'chuc': str(chuc or '').strip(), 'phong': phong})
    return people


def gan_nguoi_duyet(people):
    for i, p in enumerate(people, 1):
        p['ma'] = 'NS%02d' % i
    gd = next((p for p in people if p['chuc'].lower() == 'giám đốc trung tâm'), None)
    truong = {}
    for p in people:
        c = p['chuc'].lower()
        if c in ('trưởng phòng', 'trưởng bộ phận') and p['phong'] not in truong:
            truong[p['phong']] = p
    for p in people:
        c = p['chuc'].lower()
        if p is gd:
            p['vaitro'], p['duyet'] = 'Admin', ''
        elif p['phong'] == 'Ban Giám đốc' or p is truong.get(p['phong']):
            p['vaitro'], p['duyet'] = 'Duyet', gd['ma'] if gd else ''
        else:
            head = truong.get(p['phong'])
            p['vaitro'], p['duyet'] = 'NhanVien', head['ma'] if head else (gd['ma'] if gd else '')
    return people


def main(src, dst):
    people = gan_nguoi_duyet(doc_nhan_su(src))
    pins = set()
    wb = openpyxl.Workbook()
    wb.remove(wb.active)
    bold, fill = Font(bold=True, color='FFFFFF'), PatternFill('solid', fgColor='0093DD')
    for name, head in HEADERS.items():
        ws = wb.create_sheet(name)
        ws.append(head)
        for c in ws[1]:
            c.font, c.fill = bold, fill
        ws.freeze_panes = 'A2'
    ns = wb['NhanSu']
    for p in people:
        pin = str(100000 + secrets.randbelow(900000))
        while pin in pins:
            pin = str(100000 + secrets.randbelow(900000))
        pins.add(pin)
        ns.append([p['ma'], p['ten'], p['phong'], p['chuc'], p['vaitro'], p['duyet'], 12, 0, pin, 'Đang làm'])
    for row in ns.iter_rows(min_row=2, min_col=9, max_col=9):
        for c in row:
            c.number_format = '@'
    dv = DataValidation(type='list', formula1='"Admin,Duyet,NhanVien"', allow_blank=False)
    ns.add_data_validation(dv)
    dv.add('E2:E200')
    dv2 = DataValidation(type='list', formula1='"Đang làm,Nghỉ việc"')
    ns.add_data_validation(dv2)
    dv2.add('J2:J200')
    for t in LOAI_NGHI:
        wb['LoaiNghi'].append(list(t))
    for d in NGAY_LE:
        wb['NgayLe'].append(list(d))
    for ws_name, col in (('NgayLe', 'A'), ('DonNghi', 'E'), ('DonNghi', 'G')):
        for c in wb[ws_name][col]:
            c.number_format = '@'
    widths = {'NhanSu': [8, 28, 30, 24, 11, 12, 9, 9, 10, 11], 'LoaiNghi': [34, 9, 10], 'NgayLe': [12, 34],
              'DonNghi': [18, 8, 26, 22, 12, 8, 12, 8, 8, 40, 11, 22, 17, 30, 17]}
    for ws_name, ws_widths in widths.items():
        for i, w in enumerate(ws_widths):
            wb[ws_name].column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = w
    wb.save(dst)
    print('Đã tạo', dst, '-', len(people), 'nhân sự')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1], sys.argv[2])
