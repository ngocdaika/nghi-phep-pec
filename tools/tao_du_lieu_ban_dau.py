"""Tạo dữ liệu ban đầu cho Google Sheet từ danh sách nhân sự Excel.

Đọc danh sách (STT | Họ và tên | Chức danh, có dòng tiêu đề phòng dạng I, II, ...).
Mã NV dạng tên.họđệm (Nguyễn Hoàng Khánh Ngọc → ngoc.nhk), mật khẩu mặc định 123456 (bắt buộc đổi khi đăng nhập lần đầu).
Tài khoản admin có mật khẩu ngẫu nhiên.
Kết quả nằm trong thư mục private/ (đã chặn trong .gitignore, KHÔNG đưa lên GitHub):
  - Seed.gs                      (PIN đã mã hóa) dán vào Apps Script (cùng Code.gs), chạy setup() để nạp dữ liệu, rồi xóa file này
  - Danh sach PIN nhan su.xlsx   danh sách Mã NV (+ mật khẩu admin) để phát cho từng người

Vai trò mặc định: Giám đốc Trung tâm = GiamDoc; Phó Giám đốc = PGD (chưa giao phòng — giao trong tab Quản trị);
Trưởng phòng / Phó Trưởng phòng / Trưởng bộ phận = TruongPhong; còn lại = NhanVien. Thêm tài khoản admin (quản trị, không thuộc phòng nào nên không hiện trên lịch).

Chạy:  python tools/tao_du_lieu_ban_dau.py "PEC_Danh sach nhan su.xlsx"
"""
import base64
import hashlib
import json
import os
import secrets
import sys
import unicodedata

import openpyxl
from openpyxl.styles import Font, PatternFill

# (Tên, Tính là ngày nghỉ, Màu). Không quản lý phép năm.
LOAI_NGHI = [
    ('Nghỉ phép', 'Có', '#0093DD'),
    ('Công tác', 'Không', '#10B981'),
    ('Nghỉ không lương', 'Có', '#F97316'),
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

DEFAULT_PIN = '123456'


def bo_dau(s):
    s = s.replace('đ', 'd').replace('Đ', 'D')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')


def tao_ma(ten, taken):
    """Giống makeMa_() trong Code.gs: tên + '.' + chữ đầu họ và tên đệm, trùng thì thêm 2, 3…"""
    w = ''.join(c if c.isalnum() else ' ' for c in bo_dau(ten).lower()).split() or ['nv']
    base = w[-1] + ('.' + ''.join(x[0] for x in w[:-1]) if len(w) > 1 else '')
    ma, i = base, 2
    while ma in taken:
        ma, i = base + str(i), i + 1
    taken.add(ma)
    return ma


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
    taken = {'admin'}
    for p in people:
        p['ma'] = tao_ma(p['ten'], taken)
        c = p['chuc'].lower()
        if c == 'giám đốc trung tâm':
            p['vaitro'] = 'GiamDoc'
        elif c.startswith('phó giám đốc'):
            p['vaitro'] = 'PGD'
        elif c.startswith('trưởng') or c.startswith('phó trưởng'):
            p['vaitro'] = 'TruongPhong'
        else:
            p['vaitro'] = 'NhanVien'
    return people


def hash_pin(salt, ma, pin):
    """Giống hashPin_() trong Code.gs: 'h1$' + base64(SHA-256(salt|MÃ VIẾT HOA|pin))"""
    return 'h1$' + base64.b64encode(hashlib.sha256(('%s|%s|%s' % (salt, ma.upper(), pin)).encode('utf-8')).digest()).decode()


def pin_moi(used):
    while True:
        pin = str(100000 + secrets.randbelow(900000))
        if pin not in used:
            used.add(pin)
            return pin


def main(src, out_dir='private'):
    people = gan_vai_tro(doc_nhan_su(src))
    people.insert(0, {'ma': 'admin', 'ten': 'Quản trị hệ thống', 'phong': '', 'chuc': 'Quản trị', 'vaitro': 'Admin'})
    salt = secrets.token_hex(32)
    for p in people:
        p['pin'] = pin_moi(set()) if p['vaitro'] == 'Admin' else DEFAULT_PIN

    seed = {
        'PIN_SALT': salt,
        'NhanSu': [{'MaNV': p['ma'], 'HoTen': p['ten'], 'Phong': p['phong'], 'ChucDanh': p['chuc'],
                    'VaiTro': p['vaitro'], 'PhuTrach': '',
                    'PIN': hash_pin(salt, p['ma'], p['pin']), 'TrangThai': 'Đang làm'} for p in people],
        'LoaiNghi': [{'Ten': t, 'TinhNghi': tinh, 'Mau': mau} for t, tinh, mau in LOAI_NGHI],
        'NgayLe': [{'Ngay': d, 'TenNgayLe': ten} for d, ten in NGAY_LE],
    }
    os.makedirs(out_dir, exist_ok=True)
    seed_path = os.path.join(out_dir, 'Seed.gs')
    with open(seed_path, 'w', encoding='utf-8') as f:
        f.write('// Dữ liệu ban đầu (PIN đã mã hóa). Chạy setup() xong thì XÓA file này khỏi Apps Script.\n')
        f.write('var SEED = ' + json.dumps(seed, ensure_ascii=False, separators=(',', ':')) + ';\n')

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = 'PIN'
    ws.append(['Mã NV', 'Họ tên', 'Phòng', 'Chức danh', 'Vai trò', 'Mật khẩu ban đầu'])
    bold, fill = Font(bold=True, color='FFFFFF'), PatternFill('solid', fgColor='0093DD')
    for c in ws[1]:
        c.font, c.fill = bold, fill
    names = {'Admin': 'Quản trị', 'GiamDoc': 'Giám đốc', 'PGD': 'Phó Giám đốc', 'TruongPhong': 'Trưởng/Phó phòng', 'NhanVien': 'Nhân viên'}
    for p in people:
        ws.append([p['ma'], p['ten'], p['phong'], p['chuc'], names[p['vaitro']], p['pin']])
    for row in ws.iter_rows(min_row=2, min_col=6, max_col=6):
        for c in row:
            c.number_format = '@'
    for i, w in enumerate([12, 28, 36, 24, 14, 16]):
        ws.column_dimensions[openpyxl.utils.get_column_letter(i + 1)].width = w
    pin_path = os.path.join(out_dir, 'Danh sach PIN nhan su.xlsx')
    wb.save(pin_path)
    print('Đã tạo', seed_path, 'và', pin_path, '-', len(people), 'tài khoản')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else 'private')
