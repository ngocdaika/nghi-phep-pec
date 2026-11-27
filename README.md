# Lịch nghỉ phép PEC – Portcoast

Dashboard nghỉ phép cho Trung tâm. Nhân sự tự khai ngày nghỉ, lãnh đạo phụ trách duyệt. Lịch tháng hiện cho cả đơn vị, có tổng kết theo tháng và theo năm. Dùng được trên điện thoại và máy tính.

- Giao diện: trang tĩnh (HTML/CSS/JS) chạy trên **GitHub Pages**
- Dữ liệu: **Google Sheets**, truy cập qua **Google Apps Script** (`apps-script/Code.gs`)
- Chưa cấu hình API thì trang tự chạy **bản demo** với dữ liệu giả (hoặc mở với `?demo=1`)

> ⚠️ Repo này để công khai. **Không đưa file Excel nhân sự hay PIN lên đây** (`.gitignore` đã chặn `*.xlsx`, `*.csv`).

## 1. Tạo Google Sheet dữ liệu (làm một lần)

1. Vào Google Drive, tải lên file `Du lieu Google Sheet - Nghi phep PEC.xlsx`. File này tạo bằng `tools/tao_du_lieu_ban_dau.py`, chỉ lưu trên máy, không có trên GitHub.
2. Mở file, chọn **Tệp → Lưu dưới dạng Google Trang tính**. Từ đây làm việc trên bản Google Sheets.
3. Vào **Tệp → Cài đặt**, đặt múi giờ **(GMT+07:00) Bangkok/Hanoi**.
4. Kiểm tra lại các tab:
   - `NhanSu`: Mã NV, phòng, **VaiTro** (`Admin` / `Duyet` / `NhanVien`), **NguoiDuyet** (Mã NV của lãnh đạo phụ trách; để trống thì đơn tự được duyệt), PhepNam, PhepTon, **PIN**, TrangThai.
   - `LoaiNghi`: tên loại nghỉ gợi ý, có trừ phép năm hay không, màu hiển thị.
   - `NgayLe`: ngày lễ, ghi dạng `yyyy-mm-dd`. Kiểm tra các dòng ghi "(dự kiến)" theo thông báo của công ty.
   - `DonNghi`: để trống, hệ thống tự ghi.

## 2. Cài Apps Script (backend)

1. Trong Google Sheet, chọn **Tiện ích mở rộng → Apps Script**.
2. Xóa nội dung mẫu, dán toàn bộ `apps-script/Code.gs`, rồi lưu.
3. Chọn hàm `setup` → **Chạy**, rồi cấp quyền cho chính tài khoản Google của anh.
4. Chọn **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**:
   - *Thực thi với tư cách*: **Tôi**
   - *Người có quyền truy cập*: **Bất kỳ ai**
5. Sao chép **URL ứng dụng web** (dạng `https://script.google.com/macros/s/…/exec`).

Khi sửa `Code.gs` về sau: vào **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới**. Làm vậy thì URL giữ nguyên.

## 3. Nối giao diện với dữ liệu

Mở `js/config.js`, dán URL vào `API_URL`, rồi commit và push. GitHub Pages tự cập nhật sau khoảng 1 phút.

## 4. Phát mã cho nhân sự

Gửi riêng cho từng người **link trang + Mã NV + PIN** (lấy trong tab `NhanSu`). Mỗi người đăng nhập một lần, máy tự nhớ. Họ đổi PIN được ở tab **Cá nhân**.

Trên điện thoại, chọn **Thêm vào màn hình chính** để dùng như một ứng dụng.

## Quy tắc tính

- Ngày làm việc: thứ 2 – thứ 7. Không tính chủ nhật và ngày lễ trong tab `NgayLe`.
- Tính được nửa ngày: "từ chiều" ở ngày đầu, "hết buổi sáng" ở ngày cuối.
- Tổng ngày nghỉ gồm đơn đã duyệt và đơn chờ duyệt (phần chờ duyệt ghi riêng). Đơn bị từ chối hoặc đã hủy không tính.
- Phép còn lại = PhepNam + PhepTon − số ngày của các loại nghỉ có `TruPhep = Có`.
- Lý do nghỉ chỉ hiện cho người nghỉ, người duyệt của họ và Admin.

## Cấu trúc

```
index.html, css/, js/        Giao diện (GitHub Pages)
js/logic.js                  Tính ngày nghỉ, tổng hợp
js/api.js                    Gọi Apps Script + bản demo
apps-script/Code.gs          Backend Google Apps Script
tools/                       Script tạo file dữ liệu ban đầu
docs/                        Tài liệu thiết kế
```
