"""Tạo dữ liệu ban đầu cho Google Sheet từ danh sách nhân sự Excel.

Đọc danh sách (STT | Họ và tên | Chức danh, có dòng tiêu đề phòng dạng I, II, ...), gán Mã NV và PIN ngẫu nhiên.
Kết quả nằm trong thư mục private/ (đã chặn trong .gitignore, KHÔNG đưa lên GitHub):
  - Seed.gs                      dán vào Apps Script (cùng Code.gs), chạy setup() để nạp dữ liệu, rồi xóa file này
  - Danh sach PIN nhan su.xlsx   danh sách Mã NV + PIN để phát riêng cho từng người

Vai trò mặc định: Giám đốc Trung tâm = GiamDoc; Phó Giám đốc = PGD (chưa giao phòng — giao trong tab Quản trị);
còn lại = NhanVien. Thêm tài khoản ADMIN (quản trị, không thuộc phòng nào nên không hiện trên lịch).

Chạy:  python tools/tao_du_lieu_ban_dau.py "PEC_Danh sach nhan su.xlsx"
"""
import json
import os
import secrets
import sys

import openpyxl
from openpyxl.styles import Font, PatternFill

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


def gan_vai_tro(people):
    for i, p in enumerate(people, 1):
        p['ma'] = 'NS%02d' % i
        c = p['chuc'].lower()
        if c == 'giám đốc trung tâm':
            p['vaitro'] = 'GiamDoc'
        elif c.startswith('phó giám đốc'):
            p['vaitro'] = 'PGD'
        else:
            p['vaitro'] = 'NhanVien'
    return people


def pin_moi(used):
    while True:
        pin = str(100000 + secrets.randbelow(900000))
        if pin not in used:
            used.add(pin)
            return pin


def main(src, out_dir='private'):
    people = gan_vai_tro(doc_nhan_su(src))
    people.insert(0, {'ma': 'ADMIN', 'ten': 'Quản trị hệ thống', 'phong': '', 'chuc': 'Quản trị', 'vaitro': 'Admin'})
    used = set()
    for p in people:
        p['pin'] = pin_moi(used)

    seed = {
        'NhanSu': [{'MaNV': p['ma'], 'HoTen': p['ten'], 'Phong': p['phong'], 'ChucDanh': p['chuc'],
                    'VaiTro': p['vaitro'], 'PhuTrach': '', 'PhepNam': '12', 'PhepTon': '0',
                    'PIN': p['pin'], 'TrangThai': 'Đang làm'} for p in people],
        'LoaiNghi': [{'Ten': t, 'TruPhep': tru, 'Mau': mau} for t, tru, mau in LOAI_NGHI],
        'NgayLe': [{'Ngay': d, 'TenNgayLe': ten} for d, ten in NGAY_LE],
    }
    os.makedirs(out_dir, exist_ok=True)
    seed_path = os.path.join(out_dir, 'Seed.gs')
    with open(seed_path, 'w', encoding='utf-8') as f:
        f.write('// Dữ liệu ban đầu — CHỨA PIN. Chạy setup() xong thì XÓA file này khỏi Apps Script.\n')
        f.write('var SEED = ' + json.dumps(seed, ensure_ascii=False, indent=1) + ';\n')

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'PIN'
    ws.append(['Mã NV', 'Họ tên', 'Phòng', 'Chức danh', 'Vai trò', 'PIN'])
    bold, fill = Font(bold=True, color='FFFFFF'), PatternFill('solid', fgColor='0093DD')
    for c in ws[1]:
        c.font, c.fill = bold, fill
    names = {'Admin': 'Quản trị', 'GiamDoc': 'Giám đốc', 'PGD': 'Phó Giám đốc', 'NhanVien': 'Cá nhân'}
    for p in people:
        ws.append([p['ma'], p['ten'], p['phong'], p['chuc'], names[p['vaitro']], p['pin']])
    for row in ws.iter_rows(min_row=2, min_col=6, max_col=6):
        for c in row:
            c.number_format = '@'
    for i, w in enumerate([9, 28, 36, 24, 14, 10]):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = w
    pin_path = os.path.join(out_dir, 'Danh sach PIN nhan su.xlsx')
    wb.save(pin_path)
    print('Đã tạo', seed_path, 'và', pin_path, '-', len(people), 'tài khoản')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'private')
