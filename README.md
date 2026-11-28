# Lịch nghỉ phép PEC – Portcoast

Dashboard nghỉ phép cho Trung tâm. Nhân sự tự khai ngày nghỉ, lãnh đạo duyệt. Lịch tháng hiện cho cả đơn vị, có tổng kết theo tháng và theo năm. Dùng được trên điện thoại và máy tính.

- Giao diện: trang tĩnh (HTML/CSS/JS) chạy trên **GitHub Pages**
- Dữ liệu: **một file Google Sheets trên Drive của người quản trị**, truy cập qua **Google Apps Script** (`apps-script/Code.gs`)
- Chưa cấu hình API thì trang tự chạy **bản demo** với dữ liệu giả (hoặc mở với `?demo=1`). Bản demo có nút chuyển vai trò: Quản trị, Giám đốc, Phó Giám đốc, Trưởng phòng, Nhân viên.

> ⚠️ Repo này để công khai. **Không đưa file nhân sự hay PIN lên đây.** `.gitignore` đã chặn `*.xlsx`, `*.csv` và thư mục `private/`.

## Phân quyền

| Vai trò (cột `VaiTro`) | Quyền |
|---|---|
| `Admin` – Quản trị | Toàn quyền. Tab **Quản trị**: thêm/sửa/khóa nhân sự, phân quyền, giao phòng cho PGĐ, đặt lại PIN, sửa loại nghỉ và ngày lễ, duyệt/xóa mọi đơn, khai nghỉ thay người khác. |
| `GiamDoc` – Giám đốc | Duyệt mọi đơn. Đổi vai trò giữa Nhân viên, Trưởng/Phó phòng và Phó Giám đốc (giao phòng phụ trách). |
| `PGD` – Phó Giám đốc | Duyệt đơn của nhân sự thuộc các phòng ghi ở cột `PhuTrach` (cách nhau bằng dấu `;`). |
| `TruongPhong` – Trưởng/Phó phòng | Như Nhân viên, nhưng được xem tổng kết tháng/năm của mọi người. |
| `NhanVien` – Nhân viên | Khai đơn, hủy đơn đang chờ duyệt, xem lịch cả đơn vị, chỉ xem tổng kết của chính mình, đổi PIN. |

Ai duyệt đơn của ai:
- Nhân viên, Trưởng/Phó phòng → PGĐ phụ trách phòng đó. Phòng chưa giao PGĐ → Giám đốc.
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
- `Seed.gs` – dữ liệu nhân sự, loại nghỉ, ngày lễ; PIN đã mã hóa sẵn (không chứa PIN gốc).
- `Danh sach PIN nhan su.xlsx` – Mã NV + PIN để phát cho từng người. Có thêm tài khoản `ADMIN` cho người quản trị.

## 2. Tạo Google Sheet và Apps Script

1. Mở https://sheets.new, đặt tên file (VD: *Dữ liệu nghỉ phép PEC*).
2. **Tiện ích mở rộng → Apps Script**.
3. Dán toàn bộ `apps-script/Code.gs` vào file `Code.gs`.
4. Bấm **+ → Tập lệnh**, đặt tên `Seed`, dán nội dung `private/Seed.gs`. Lưu.
5. Chọn hàm `setup` → **Chạy** → cấp quyền cho tài khoản Google của mình. Hàm này tạo các tab, nạp dữ liệu, đặt múi giờ GMT+7 và mã hóa PIN.
6. **Xóa file `Seed`** khỏi dự án Apps Script (không cần nữa).
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
- Không quản lý phép năm. Loại: **Nghỉ phép**, **Công tác**, **Nghỉ không lương** (sửa trong tab Quản trị). Lịch còn đánh dấu **Chờ duyệt** (gạch sọc) và **Nửa ngày** (nửa ô).
- Tổng ngày nghỉ gồm đơn đã duyệt và đơn chờ duyệt (phần chờ duyệt ghi riêng), **không tính Công tác** (loại có `TinhNghi = Không`). Công tác được đếm riêng. Đơn bị từ chối hoặc đã hủy không tính.
- Tab **Tổng kết** có tổng kết tháng và tổng kết năm. Nhân viên chỉ thấy số liệu của mình.

## Nâng cấp file dữ liệu cũ (tạo trước 28/11/2026)

Dán `apps-script/Code.gs` mới vào Apps Script, chạy hàm `capNhatV2` một lần (thêm vai trò Trưởng/Phó phòng theo chức danh, đổi loại nghỉ, bỏ cột phép năm), rồi **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới**.

## Cấu trúc

```
index.html, css/, js/        Giao diện (GitHub Pages)
js/logic.js                  Tính ngày nghỉ, tổng hợp, phân quyền
js/api.js                    Gọi Apps Script + bản demo
apps-script/Code.gs          Backend Google Apps Script
tools/                       Script tạo dữ liệu ban đầu
docs/                        Tài liệu thiết kế
```
