# Dashboard nghỉ phép PEC — Thiết kế (đã chốt 27/11/2026)

## Mục đích
Nhân sự trong Trung tâm tự khai lịch nghỉ phép. Mọi người thấy lịch nghỉ của đơn vị theo tháng. Lãnh đạo phụ trách duyệt đơn. Có tổng số ngày nghỉ theo tháng, theo năm. Dùng được trên điện thoại và máy tính qua một đường link.

## Đã chốt với anh
- Giao diện: **GitHub Pages**. Dữ liệu: **Google Sheets** + Google Apps Script làm API.
- Danh sách nhân sự: `PEC_Danh sach nhan su.xlsx` (40 người, 6 nhóm).
- Loại nghỉ: nhập tay. Ô "Loại nghỉ" có gợi ý sẵn nhưng được gõ tự do; danh sách gợi ý sửa được trong tab `LoaiNghi`.
- Ngày làm việc: **thứ 2 – thứ 7**. Chỉ trừ chủ nhật và ngày lễ (tab `NgayLe`).
- Quy trình: nhân sự tự khai → lãnh đạo phụ trách duyệt. Đơn **chưa duyệt vẫn hiện trên lịch** (gạch sọc, ghi "Chờ duyệt").
- Có logo và màu Portcoast (xanh #0093DD).

## Em tự quyết (anh xem lại)
1. **Đăng nhập** bằng Mã NV + mã PIN 6 số, máy tự nhớ sau lần đầu. Mã NV do em tạo (`NS01`…); anh thay bằng mã thật trong tab `NhanSu` nếu muốn. Sai PIN 5 lần thì khóa 10 phút.
2. **Người duyệt mặc định**: thành viên → Trưởng phòng / Trưởng bộ phận; Trưởng phòng và PGĐ → Giám đốc Trung tâm; phòng chưa có trưởng phòng → Giám đốc. Đổi được ở cột `NguoiDuyet`.
3. **Vai trò**: `Admin` (xem lý do, duyệt và xóa mọi đơn), `Duyet` (duyệt đơn của người mình phụ trách), `NhanVien`.
4. **Lý do nghỉ** chỉ hiện cho chính người nghỉ, người duyệt và Admin. Người khác chỉ thấy loại nghỉ.
5. **Nửa ngày**: đơn có "từ ngày (sáng/chiều)" đến "đến ngày (sáng/chiều)". Thứ 7 tính cả ngày.
6. **Số ngày tính tổng** = đơn đã duyệt + đơn chờ duyệt (phần chờ duyệt ghi riêng). Đơn bị từ chối không hiện, không tính.
7. **Phép năm** mặc định 12 ngày/người, cộng phép tồn; sửa ở cột `PhepNam`, `PhepTon`. "Còn lại" chỉ trừ những loại nghỉ có `TruPhep = Có`.
8. Người khai được hủy đơn khi còn chờ duyệt. Người duyệt hoặc Admin được xóa đơn đã duyệt.
9. Chưa gửi email báo cho người duyệt (danh sách chưa có email). Thay vào đó, tab Duyệt hiện số đơn đang chờ.

## Cấu trúc dữ liệu (Google Sheet)
- `NhanSu`: MaNV, HoTen, Phong, ChucDanh, VaiTro, NguoiDuyet, PhepNam, PhepTon, PIN, TrangThai
- `LoaiNghi`: Ten, TruPhep (Có/Không), Mau
- `NgayLe`: Ngay, TenNgayLe
- `DonNghi`: ID, MaNV, HoTen, LoaiNghi, TuNgay, TuBuoi, DenNgay, DenBuoi, SoNgay, LyDo, TrangThai, NguoiDuyet, NgayDuyet, GhiChuDuyet, NgayTao

## Giao diện
- **Lịch tháng**: hàng = nhân sự (nhóm theo phòng), cột = ngày. Mỗi ô tô màu theo loại nghỉ, nửa ngày tô nửa ô, chờ duyệt có gạch sọc. Cột cuối hiện tổng tháng, tổng năm và phép còn lại. Phía trên có thẻ: hôm nay ai nghỉ, tổng ngày nghỉ trong tháng, số đơn chờ duyệt. Lọc được theo phòng.
- Trên điện thoại: phần tên được ghim cố định, bảng cuộn ngang; thêm danh sách "Ai nghỉ ngày nào".
- **Khai nghỉ**: form; số ngày tính trực tiếp khi nhập.
- **Duyệt**: danh sách đơn chờ, có nút Duyệt / Từ chối kèm ghi chú.
- **Tổng kết năm**: bảng nhân sự × 12 tháng, cộng năm, phép còn lại; biểu đồ tổng theo tháng; xuất CSV mở bằng Excel.
- **Cá nhân**: đơn của mình (trạng thái, hủy), đổi PIN.
- **Chế độ demo** (`?demo=1` hoặc khi chưa cấu hình API): chạy bằng dữ liệu giả, dùng để xem trước.

## Bảo mật
- Repo GitHub để công khai nhưng **không chứa dữ liệu nhân sự** (`*.xlsx` nằm trong `.gitignore`). Dữ liệu chỉ nằm trong Google Sheet.
- Mọi lệnh gọi API đều phải đúng Mã NV + PIN.

## Phương án đã cân nhắc
- A. GitHub Pages + Google Sheets — **được chọn**: 0đ, có link GitHub, anh sửa trực tiếp trên Sheet được.
- B. Microsoft 365 (Forms + Excel + Power BI) — không có link GitHub, khó tùy biến.
- C. GitHub Pages + Supabase — bảo mật tốt hơn nhưng cài đặt phức tạp; để dành nếu sau này cần.
