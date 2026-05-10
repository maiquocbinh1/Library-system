# PROMPT NÂNG CẤP HỆ THỐNG QUẢN LÝ THƯ VIỆN

---

## BỐI CẢNH

Tôi có một hệ thống quản lý thư viện (React + Vite + Ant Design ở FE, Node.js/Express + MongoDB ở BE). Hệ thống hiện tại **đã có đủ nghiệp vụ cơ bản** nhưng bị đánh giá là **thiếu thực tế** và **thiếu tính chất của một Hệ thống Thông tin Quản lý (MIS)** đúng nghĩa.

Tôi có một hệ thống tham chiếu (hệ thống `qltv_ptit`) làm chuẩn để nâng cấp theo. Dưới đây là toàn bộ yêu cầu thay đổi cần thực hiện.

---

## PHÂN TÍCH ĐIỂM YẾU HIỆN TẠI

### 1. Dashboard (Statistics) — Chưa phải MIS thực sự
- Hiện tại chỉ có 6 thẻ số đơn giản (tổng users, tổng sách, chờ duyệt…) + 1 biểu đồ Pie/Bar theo trạng thái phiếu mượn
- Không có KPI chiến lược, không có phân tích xu hướng, không có cảnh báo rủi ro
- Không có tính năng hỗ trợ ra quyết định (DSS/EIS)

### 2. Phân cấp hệ thống chưa rõ
- Menu chỉ phân theo chức năng nghiệp vụ, chưa thể hiện phân tầng TPS → MIS → DSS/EIS
- Không phân biệt rõ "xử lý giao dịch hàng ngày" vs "báo cáo phục vụ quản lý"

### 3. Tính năng phân tích thiếu
- Không có phân tích xu hướng mượn theo thể loại/thời gian
- Không có cảnh báo tự động (sách sắp hết, độc giả rủi ro cao)
- Không có tính năng What-If / mô phỏng chính sách

### 4. Công cụ quản lý độc giả thiếu
- Không có phân loại độc giả theo mức độ rủi ro (nợ phạt nhiều, hay vi phạm)
- Không có tính năng gửi email nhắc nhở hàng loạt hoặc cảnh báo tự động

---

## YÊU CẦU NÂNG CẤP CỤ THỂ

---

### PHẦN 1: NÂNG CẤP DASHBOARD (file: `Statistics.jsx`)

#### 1.1 Thêm section "EIS KPIs — Chỉ số điều hành chiến lược"

Thêm 4 thẻ KPI ở đầu trang, mỗi thẻ gồm tên chỉ số + giá trị lớn + thanh progress bar:

**KPI 1 — Tỷ lệ khai thác kho sách**
- Công thức: `(số bản sao đang được mượn / tổng số bản sao) * 100`
- Hiển thị dạng phần trăm + thanh progress màu indigo
- Nhãn hai đầu: "Kho nhàn rỗi" ↔ "Lưu thông"

**KPI 2 — Tỷ lệ độc giả tích cực**
- Công thức: `(số độc giả có ít nhất 1 phiếu mượn trong 30 ngày gần nhất / tổng độc giả) * 100`
- Hiển thị dạng phần trăm + thanh progress màu xanh sky
- Phụ đề: "Sinh viên có mượn sách (30 ngày)"

**KPI 3 — Tỷ lệ quá hạn**
- Công thức: `(số phiếu mượn đang OVERDUE / tổng phiếu đang BORROWING + OVERDUE) * 100`
- Màu sắc động:
  - < 10%: màu xanh lá + badge "An toàn"
  - 10–20%: màu vàng + badge "Cảnh báo"
  - > 20%: màu đỏ + badge "Nguy hiểm" + hiệu ứng nhấp nháy (pulse)

**KPI 4 — Thu hồi nợ phạt**
- Hiển thị 2 số: tổng đã thu (màu xanh + mũi tên xuống) và tổng chưa thu (màu đỏ + mũi tên lên)
- Thanh progress 2 màu: phần xanh = đã thu / tổng

API cần thêm (backend): `GET /api/admin/eis/kpis` trả về JSON:
```json
{
  "utilization_rate": 68,
  "active_user_rate": 42,
  "overdue_rate": 8,
  "financial": {
    "collected": 2450000,
    "outstanding": 860000
  }
}
```

---

#### 1.2 Thêm "Biểu đồ xu hướng mượn theo thể loại" (DSS — Trend Analysis)

Thay biểu đồ Pie/Bar hiện tại bằng layout 2 cột:

**Cột trái (2/3): Biểu đồ Bar — Lượt mượn theo thể loại sách**
- Trục X: tên thể loại (CNTT, Kinh tế, Văn học, Kỹ năng…)
- Trục Y: số lượt mượn
- Dropdown lọc thời gian: 30 ngày / Quý / 1 năm / Tất cả
- Click vào cột → mở modal "Top 5 sách được mượn nhiều nhất trong thể loại đó" (DSS drill-down)

API cần thêm: `GET /api/admin/dss/category-trends?period=month|quarter|year|all`
```json
{
  "labels": ["CNTT", "Kinh tế", "Văn học"],
  "data": [45, 28, 17]
}
```

API drill-down: `GET /api/admin/dss/drilldown?category=CNTT&period=month`
```json
[
  { "title": "Clean Code", "count": 12 },
  { "title": "Design Patterns", "count": 9 }
]
```

**Cột phải (1/3): What-If Analysis — Kịch bản mô phỏng chính sách**
- Slider 1: "Thời gian mượn tối đa (ngày)" — range 5 đến 30
- Slider 2: "Phí phạt trễ hạn (VNĐ/ngày)" — range 500 đến 5000
- Dropdown: chọn baseline thời gian (30 ngày / Quý / Năm / Tất cả)
- Nút "Chạy mô phỏng" → gọi API và hiển thị:
  - Dự phóng doanh thu phạt
  - So sánh với baseline: "Tăng X%" hoặc "Giảm X%"

API cần thêm: `POST /api/admin/dss/what-if`
- Body: `{ max_days: 14, fine_rate: 1000, period: "month" }`
- Response: `{ projected_revenue, baseline_revenue, diff_percent }`

---

#### 1.3 Thêm 2 bảng cảnh báo ở cuối Dashboard

**Bảng 1 — Cảnh báo: Độc giả rủi ro cao**
- Tiêu chí: độc giả có tổng nợ phạt > 0 HOẶC có phiếu mượn quá hạn
- Cột: MSV | Họ tên | Tổng nợ phạt | Số lần đã nhắc | Nút "Gửi Email nhắc"
- Nút "Gửi Email": gọi API gửi email cảnh báo tự động tới độc giả đó, cập nhật bộ đếm "Số lần đã nhắc"
- Nút "Xuất Excel" ở header bảng

**Bảng 2 — Gợi ý: Sách ít tương tác (cân nhắc thanh lý)**
- Tiêu chí: sách có 0 lượt mượn trong 6 tháng gần nhất
- Cột: ISBN | Tên sách | Thể loại | Tồn kho
- Nút "Xuất Excel" ở header bảng

API cần thêm:
- `GET /api/admin/dss/high-risk-users`
- `GET /api/admin/dss/unused-books`
- `POST /api/admin/oas/send-warning-email` body: `{ userId, total_fine, overdue_books }`
- `GET /api/admin/dss/export/high-risk` (trả file Excel)
- `GET /api/admin/dss/export/unused-books` (trả file Excel)

---

### PHẦN 2: NÂNG CẤP SIDEBAR ADMIN (file: `Admin.jsx`)

Thêm phân cấp rõ ràng theo tầng hệ thống thông tin:

```
[EIS/DSS] Hỗ trợ ra quyết định
  └── Dashboard & Phân tích

[TPS] Nghiệp vụ giao dịch hàng ngày
  └── Phê duyệt mượn
  └── Quản lý trả sách
  └── Thu Phạt
  └── Nhật ký gửi thư

[Kho & Danh mục]
  └── Danh mục đầu sách
  └── Bản sao & Barcode

[Quản lý Độc giả]
  └── Hồ sơ Độc giả
  └── Kích hoạt Độc giả

[Quản trị Hệ thống] (chỉ Admin)
  └── Cấu hình chính sách
  └── Tài khoản thủ thư & phân quyền
```

Thêm section label cho từng nhóm menu (dạng text nhỏ in hoa, màu xám nhạt):
- "HỖ TRỢ RA QUYẾT ĐỊNH (EIS/DSS)"
- "NGHIỆP VỤ (TPS)"
- "QUẢN TRỊ HỆ THỐNG"

---

### PHẦN 3: THÊM TRANG "NHẬT KÝ GỬI THƯ" (file mới: `EmailLogManagement.jsx`)

Tạo component mới hiển thị lịch sử email đã gửi:
- Bảng gồm: Thời gian gửi | Loại email | Người nhận (MSV + tên) | Chủ đề | Trạng thái (Thành công / Thất bại)
- Lọc theo loại: Cảnh báo quá hạn / Thông báo hàng loạt / Xác nhận mượn
- Lọc theo khoảng ngày

Thêm vào sidebar menu với key `email-logs`.

---

### PHẦN 4: THÊM TÍNH NĂNG "GỬI THÔNG BÁO TOÀN TRƯỜNG" (trong Dashboard)

Ở topbar của trang Dashboard, thêm nút "Gửi thông báo toàn trường":
- Mở modal với form:
  - Input "Chủ đề (Subject)"
  - Textarea "Nội dung thông báo"
  - Ghi chú: "Email sẽ gửi BCC ẩn danh tới tất cả độc giả trong hệ thống"
- Nút "Gửi Ngay" → gọi `POST /api/admin/oas/send-mass-email`

API cần thêm: `POST /api/admin/oas/send-mass-email`
- Body: `{ subject: string, content: string }`
- Logic backend: lấy toàn bộ email users có role = "user", gửi BCC

---

### PHẦN 5: NÂNG CẤP TRANG QUẢN LÝ ĐỘC GIẢ (file: `UserManagement.jsx`)

Thêm cột "Mức độ rủi ro" vào bảng danh sách độc giả:
- Tính dựa trên: số phiếu quá hạn + tổng nợ phạt chưa trả
- Badge màu: Xanh (An toàn) | Vàng (Cần theo dõi) | Đỏ (Rủi ro cao)

Thêm tab lọc nhanh:
- Tất cả | Đang hoạt động | Có nợ phạt | Đang có sách quá hạn

---

### PHẦN 6: NÂNG CẤP TRANG QUẢN LÝ PHẠT (file: `FineManagement.jsx`)

Thêm 3 thẻ tổng quan ở đầu trang:
- Tổng nợ phạt chưa thu (VNĐ)
- Đã thu hôm nay (VNĐ)
- Số phiếu phạt chưa thanh toán

Thêm nút "Xuất Excel" danh sách phạt theo bộ lọc hiện tại.

---

## YÊU CẦU KỸ THUẬT

### Backend (Node.js/Express/MongoDB)

1. **Thêm router mới**: `src/routes/analytics.routes.js` và `src/routes/oas.routes.js`
2. **Thêm controller**: `src/controllers/analytics.controller.js` và `src/controllers/oas.controller.js`
3. **Các hàm tính toán KPI** nên được đặt trong `src/utils/kpiCalculator.js`
4. **Email hàng loạt**: dùng thư viện Nodemailer đã có, gửi BCC
5. **Export Excel**: dùng thư viện `exceljs` hoặc `xlsx`
6. Tất cả API mới đặt dưới prefix `/api/admin/` và bảo vệ bằng middleware `libraryStaff.middleware.js`

### Frontend (React + Ant Design)

1. Thêm các hàm gọi API mới vào `src/config/request.jsx`
2. Các component mới đặt trong `src/pages/DashbroadComponents/`
3. Biểu đồ xu hướng dùng `@ant-design/charts` (Bar chart) — đã có sẵn trong project
4. What-If sliders dùng component `Slider` của Ant Design
5. Bảng cảnh báo dùng `Table` của Ant Design

---

## THỨ TỰ TRIỂN KHAI GỢI Ý

1. **Bước 1**: Thêm API backend (analytics + oas routes/controllers)
2. **Bước 2**: Cập nhật `Statistics.jsx` — thêm 4 KPI cards
3. **Bước 3**: Cập nhật `Statistics.jsx` — thêm biểu đồ xu hướng + What-If
4. **Bước 4**: Cập nhật `Statistics.jsx` — thêm 2 bảng cảnh báo
5. **Bước 5**: Cập nhật `Admin.jsx` — thêm section label phân tầng + menu "Nhật ký thư"
6. **Bước 6**: Tạo `EmailLogManagement.jsx`
7. **Bước 7**: Nâng cấp `UserManagement.jsx` và `FineManagement.jsx`

---

## GHI CHÚ QUAN TRỌNG

- **Không phá vỡ logic nghiệp vụ hiện tại** — các tính năng mượn/trả/phê duyệt giữ nguyên
- **Chỉ thêm**, không xóa bất kỳ component hay API nào đang hoạt động
- Tất cả API mới cần có **xử lý lỗi đầy đủ** và trả về đúng format response hiện tại (`{ metadata: ... }`)
- KPI và biểu đồ nên có **trạng thái loading** khi đang fetch data
- Các bảng cảnh báo nên hiển thị thông báo "Không có dữ liệu" khi rỗng (không để trống hoặc crash)
