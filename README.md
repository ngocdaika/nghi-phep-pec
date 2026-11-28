# Lịch nghỉ phép PEC – Portcoast

Dashboard nghỉ phép cho Trung tâm. Nhân sự tự khai ngày nghỉ, lãnh đạo duyệt. Lịch tháng hiện cho cả đơn vị, có tổng kết theo tháng và theo năm. Dùng được trên điện thoại và máy tính.

- Giao diện: trang tĩnh (HTML/CSS/JS) chạy trên **GitHub Pages**
- Dữ liệu: **một file Google Sheets trên Drive của người quản trị**, truy cập qua **Google Apps Script** (`apps-script/Code.gs`)
- Chưa cấu hình API thì trang tự chạy **bản demo** với dữ liệu giả (hoặc mở với `?demo=1`)

> ⚠️ Repo này để công khai. **Không đưa file nhân sự hay PIN lên đây.** `.gitignore` đã chặn `*.xlsx`, `*.csv` và thư mục `private/`.

## Phân quyền

| Vai trò (cột `VaiTro`) | Quyền |
|---|---|
| `Admin` – Quản trị | Toàn quyền. Tab **Quản trị**: thêm/sửa/khóa nhân sự, phân quyền, giao phòng cho PGĐ, đặt lại PIN, sửa loại nghỉ và ngày lễ, duyệt/xóa mọi đơn, khai nghỉ thay người khác. |
| `GiamDoc` – Giám đốc | Duyệt mọi đơn. Nâng tài khoản lên Phó Giám đốc (giao phòng phụ trách) hoặc hạ về Cá nhân. |
| `PGD` – Phó Giám đốc | Duyệt đơn của nhân viên thuộc các phòng ghi ở cột `PhuTrach` (cách nhau bằng dấu `;`). |
| `NhanVien` – Cá nhân | Khai đơn, hủy đơn đang chờ duyệt, xem lịch, đổi PIN. |

Ai duyệt đơn của ai:
- Nhân viên → PGĐ phụ trách phòng đó. Phòng chưa giao PGĐ → Giám đốc.
- Phó Giám đốc → Giám đốc.
- Giám đốc và Quản trị → tự được duyệt.
- Giám đốc và Quản trị luôn duyệt được mọi đơn.

Lý do nghỉ chỉ hiện cho chính người nghỉ, người có quyền duyệt đơn đó và Giám đốc.

## Dữ liệu và mật khẩu

- Mọi dữ liệu nằm trong file Google Sheet (4 tab: `NhanSu`, `LoaiNghi`, `NgayLe`, `DonNghi`). Chỉ chủ file và người được chia sẻ mở được. Google tự lưu lịch sử phiên bản.
- Đăng nhập bằng **Mã NV + PIN**. PIN lưu **dạng mã hóa** (`h1$…`), ai mở Sheet cũng không đọc được. Quên PIN thì Quản trị **đặt lại PIN** trong tab Quản trị; PIN mới chỉ hiện một lần.
- Muốn đặt PIN thủ công: ghi số vào cột `PIN` trong Sheet. Lần đăng nhập đầu tiên hệ thống tự mã hóa.

## 1. Tạo dữ liệu ban đầu (trên máy)

```
python tools/tao_du_lieu_ban_dau.py "PEC_Danh sach nhan su.xlsx"
```

Lệnh này tạo trong thư mục `private/` (không lên GitHub):
- `Seed.gs` – dữ liệu nhân sự, loại nghỉ, ngày lễ, kèm PIN ban đầu.
- `Danh sach PIN nhan su.xlsx` – Mã NV + PIN để phát cho từng người. Có thêm tài khoản `ADMIN` cho người quản trị.

## 2. Tạo Google Sheet và Apps Script

1. Mở https://sheets.new, đặt tên file (VD: *Dữ liệu nghỉ phép PEC*).
2. **Tiện ích mở rộng → Apps Script**.
3. Dán toàn bộ `apps-script/Code.gs` vào file `Code.gs`.
4. Bấm **+ → Tập lệnh**, đặt tên `Seed`, dán nội dung `private/Seed.gs`. Lưu.
5. Chọn hàm `setup` → **Chạy** → cấp quyền cho tài khoản Google của mình. Hàm này tạo các tab, nạp dữ liệu, đặt múi giờ GMT+7 và mã hóa PIN.
6. **Xóa file `Seed`** khỏi dự án Apps Script (nó chứa PIN gốc).
7. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: *Thực thi với tư cách* **Tôi**, *Người có quyền truy cập* **Bất kỳ ai** → sao chép URL `https://script.google.com/macros/s/…/exec`.

Khi sửa `Code.gs` về sau: **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới** (URL giữ nguyên).

## 3. Nối giao diện với dữ liệu

Dán URL vào `API_URL` trong `js/config.js`, commit và push. GitHub Pages tự cập nhật sau khoảng 1 phút. Khi sửa CSS/JS, tăng số `?v=` trong `index.html` để máy người dùng tải bản mới.

## 4. Phát mã cho nhân sự

Gửi riêng cho từng người **link trang + Mã NV + PIN** (file `private/Danh sach PIN nhan su.xlsx`). Mỗi người đăng nhập một lần, máy tự nhớ. Trên điện thoại chọn **Thêm vào màn hình chính** để dùng như ứng dụng.

Sau đó đăng nhập `ADMIN`, vào tab **Quản trị** giao phòng phụ trách cho từng Phó Giám đốc.

## Quy tắc tính

- Ngày làm việc: thứ 2 – thứ 7. Không tính chủ nhật và ngày lễ trong tab `NgayLe`.
- Tính được nửa ngày: "từ chiều" ở ngày đầu, "hết buổi sáng" ở ngày cuối.
- Tổng ngày nghỉ gồm đơn đã duyệt và đơn chờ duyệt (phần chờ duyệt ghi riêng). Đơn bị từ chối hoặc đã hủy không tính.
- Phép còn lại = PhepNam + PhepTon − số ngày của các loại nghỉ có `TruPhep = Có`.

## Cấu trúc

```
index.html, css/, js/        Giao diện (GitHub Pages)
js/logic.js                  Tính ngày nghỉ, tổng hợp, phân quyền
js/api.js                    Gọi Apps Script + bản demo
apps-script/Code.gs          Backend Google Apps Script
tools/                       Script tạo dữ liệu ban đầu
docs/                        Tài liệu thiết kế
```
