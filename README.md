# Lịch nghỉ phép PEC – Portcoast

Dashboard nghỉ phép cho Trung tâm. Nhân sự tự khai ngày nghỉ, lãnh đạo duyệt. Lịch tháng hiện cho cả đơn vị, có tổng kết theo tháng và theo năm. Dùng được trên điện thoại và máy tính.

- Giao diện: trang tĩnh (HTML/CSS/JS) chạy trên **GitHub Pages**
- Dữ liệu: **một file Google Sheets trên Drive của người quản trị**, truy cập qua **Google Apps Script** (`apps-script/Code.gs`)
- Mở với `?demo=1` là **bản demo**: nhập mã nhân sự và mật khẩu bất kỳ đều vào được (mã không có thì vào bằng Quản trị; nhập `123456` để thử màn hình đổi mật khẩu lần đầu). Có nút chuyển vai trò: Quản trị, Giám đốc, Phó Giám đốc, Trưởng phòng, Nhân viên. Họ tên/phòng/chức danh lấy từ tab `NhanSu` (không có mật khẩu, không có đơn thật); các đơn nghỉ trong demo là giả định, lưu trong trình duyệt. Tắt việc lấy danh sách thật: Apps Script → **Project Settings → Script Properties**, thêm `DEMO` = `off` (demo chuyển sang danh sách giả).

> ⚠️ Repo này để công khai. **Không đưa file nhân sự hay mật khẩu lên đây.** `.gitignore` đã chặn `*.xlsx`, `*.csv` và thư mục `private/`.

## Phân quyền

| Vai trò (cột `VaiTro`) | Quyền |
|---|---|
| `Admin` – Quản trị | Toàn quyền. Tab **Quản trị**: thêm/sửa/khóa nhân sự, phân quyền, giao phòng cho PGĐ, đặt lại mật khẩu, sửa loại nghỉ và ngày lễ, duyệt/xóa mọi đơn, khai nghỉ thay người khác. |
| `GiamDoc` – Giám đốc | Duyệt mọi đơn. Đổi vai trò giữa Nhân viên, Trưởng/Phó phòng và Phó Giám đốc (giao phòng phụ trách). |
| `PGD` – Phó Giám đốc | Duyệt đơn của nhân sự thuộc các phòng ghi ở cột `PhuTrach` (cách nhau bằng dấu `;`). |
| `TruongPhong` – Trưởng/Phó phòng | Như Nhân viên, nhưng được xem tổng kết tháng/năm của mọi người. |
| `NhanVien` – Nhân viên | Khai đơn, hủy đơn đang chờ duyệt, xem lịch cả đơn vị, chỉ xem tổng kết của chính mình, đổi mật khẩu. |

Ai duyệt đơn của ai:
- Nhân viên, Trưởng/Phó phòng → PGĐ phụ trách phòng đó. Phòng chưa giao PGĐ → Giám đốc.
- Phó Giám đốc → Giám đốc.
- Giám đốc và Quản trị → tự được duyệt.
- Giám đốc và Quản trị luôn duyệt được mọi đơn.

Lý do nghỉ chỉ hiện cho chính người nghỉ, người có quyền duyệt đơn đó và Giám đốc.

## Dữ liệu và mật khẩu

- Mọi dữ liệu nằm trong file Google Sheet (4 tab: `NhanSu`, `LoaiNghi`, `NgayLe`, `DonNghi`). Chỉ chủ file và người được chia sẻ mở được. Google tự lưu lịch sử phiên bản.
- **Mã nhân sự** dạng `tên.họđệm`, không dấu, viết thường: Nguyễn Hoàng Khánh Ngọc → `ngoc.nhk`. Trùng thì thêm số (`ngoc.nhk2`). Thêm nhân sự mà để trống ô mã thì hệ thống tự tạo.
- **Mật khẩu mặc định `123456`**. Đăng nhập bằng mật khẩu mặc định thì phải đổi ngay (6–32 ký tự, không được toàn ký tự giống nhau, dãy liên tiếp hay trùng mã), chưa đổi thì không xem được gì. Tab Quản trị đánh dấu **Chưa đổi MK** cho người còn dùng mật khẩu mặc định — nhắc họ đăng nhập sớm, vì ai biết mã của họ cũng vào được bằng `123456`. Mỗi lần đổi mật khẩu được ghi vào tab `NhatKy`.
- Mật khẩu (cột `PIN`) lưu **dạng mã hóa** (`h1$…`), ai mở Sheet cũng không đọc được. Quên mật khẩu thì Quản trị **đặt lại mật khẩu** (về `123456`) trong tab Quản trị.
- **Giữ đăng nhập 30 ngày**: đánh dấu ô này khi đăng nhập thì 30 ngày không phải đăng nhập lại; không đánh dấu thì đóng trình duyệt (hoặc sau 12 giờ) là phải đăng nhập lại. Trình duyệt chỉ giữ **mã phiên** do máy chủ ký, không lưu mật khẩu. Đổi mật khẩu hoặc Quản trị đặt lại mật khẩu → mọi máy đang đăng nhập tài khoản đó bị thoát.
- Đổi mật khẩu ở tab Cá nhân phải nhập mật khẩu hiện tại.
- Chống dò mật khẩu: sai 5 lần → khóa tài khoản đó 15 phút (tính cả khi gửi nhiều yêu cầu cùng lúc). Cả hệ thống sai quá 30 lần/10 phút hoặc 200 lần/6 giờ → tạm dừng đăng nhập 10 phút / 1 giờ. Các lần khóa ghi vào tab `NhatKy`.
- Mọi chữ ghi vào Sheet bắt đầu bằng `= + - @` được lưu dạng chữ (chống chèn công thức). File CSV xuất ra cũng vậy.
- Trang có Content-Security-Policy: chỉ chạy script của chính trang, chỉ gọi tới Google Apps Script.
- Máy dùng chung: không đánh dấu **Giữ đăng nhập 30 ngày**, và bấm **Đăng xuất** ở tab Cá nhân sau khi dùng.

## 1. Tạo dữ liệu ban đầu (trên máy)

```
python tools/tao_du_lieu_ban_dau.py "PEC_Danh sach nhan su.xlsx"
```

Lệnh này tạo trong thư mục `private/` (không lên GitHub):
- `Seed.gs` – dữ liệu nhân sự, loại nghỉ, ngày lễ; mật khẩu đã mã hóa sẵn (mọi người `123456`, riêng `admin` ngẫu nhiên).
- `Danh sach PIN nhan su.xlsx` – mã nhân sự của từng người và mật khẩu của tài khoản `admin`.

## 2. Tạo Google Sheet và Apps Script

1. Mở https://sheets.new, đặt tên file (VD: *Dữ liệu nghỉ phép PEC*).
2. **Tiện ích mở rộng → Apps Script**.
3. Dán toàn bộ `apps-script/Code.gs` vào file `Code.gs`.
4. Bấm **+ → Tập lệnh**, đặt tên `Seed`, dán nội dung `private/Seed.gs`. Lưu.
5. Chọn hàm `setup` → **Chạy** → cấp quyền cho tài khoản Google của mình. Hàm này tạo các tab, nạp dữ liệu, đặt múi giờ GMT+7 và mã hóa mật khẩu.
6. **Xóa file `Seed`** khỏi dự án Apps Script (không cần nữa).
7. **Triển khai → Tùy chọn triển khai mới → Ứng dụng web**: *Thực thi với tư cách* **Tôi**, *Người có quyền truy cập* **Bất kỳ ai** → sao chép URL `https://script.google.com/macros/s/…/exec`.

Khi sửa `Code.gs` về sau: **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới** (URL giữ nguyên).

## 3. Nối giao diện với dữ liệu

Dán URL vào `API_URL` trong `js/config.js`, commit và push. GitHub Pages tự cập nhật sau khoảng 1 phút. Khi sửa CSS/JS, tăng số `?v=` trong `index.html` để máy người dùng tải bản mới.

## 4. Phát mã cho nhân sự

Gửi cho từng người **link trang + mã nhân sự**, mật khẩu lần đầu `123456`. Mỗi người đăng nhập, đổi mật khẩu, đánh dấu **Giữ đăng nhập 30 ngày** nếu là máy riêng. Trên điện thoại chọn **Thêm vào màn hình chính** để dùng như ứng dụng.

Sau đó đăng nhập `admin`, vào tab **Quản trị** giao phòng phụ trách cho từng Phó Giám đốc.

## Quy tắc tính

- Ngày làm việc: thứ 2 – thứ 7. Không tính chủ nhật và ngày lễ trong tab `NgayLe`.
- Tính được nửa ngày: "từ chiều" ở ngày đầu, "hết buổi sáng" ở ngày cuối.
- Không quản lý phép năm. Loại: **Nghỉ phép**, **Công tác**, **Nghỉ không lương** (sửa trong tab Quản trị). Lịch còn đánh dấu **Chờ duyệt** (gạch sọc) và **Nửa ngày** (nửa ô).
- Tổng ngày nghỉ gồm đơn đã duyệt và đơn chờ duyệt (phần chờ duyệt ghi riêng), **không tính Công tác** (loại có `TinhNghi = Không`). Công tác được đếm riêng. Đơn bị từ chối hoặc đã hủy không tính.
- Tab **Tổng kết** có tổng kết tháng và tổng kết năm. Nhân viên chỉ thấy số liệu của mình.

## Nâng cấp file dữ liệu cũ (tạo trước 28/11/2026)

Dán `apps-script/Code.gs` mới vào Apps Script, chạy hàm `capNhatV3` một lần, rồi **Triển khai → Quản lý triển khai → Chỉnh sửa → Phiên bản mới**. Hàm này:
- chạy `capNhatV2` nếu file còn cấu trúc cũ (thêm vai trò Trưởng/Phó phòng theo chức danh, đổi loại nghỉ, bỏ cột phép năm);
- đổi mã `NS01`, `NS02`… sang `tên.họđệm`, đặt mật khẩu về `123456` (phải đổi khi đăng nhập lần đầu), đổi theo cột `MaNV` trong tab `DonNghi`;
- tài khoản khác (VD: `ADMIN`) chỉ đổi sang chữ thường (`admin`), giữ mật khẩu.

## Cấu trúc

```
index.html, css/, js/        Giao diện (GitHub Pages)
js/logic.js                  Tính ngày nghỉ, tổng hợp, phân quyền
js/api.js                    Gọi Apps Script + bản demo
apps-script/Code.gs          Backend Google Apps Script
tools/                       Script tạo dữ liệu ban đầu
docs/                        Tài liệu thiết kế
```
