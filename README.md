# Hệ thống quản lý thư viện (Library)

Frontend (React + Vite + Ant Design) và backend (Node.js + Express + MySQL/Sequelize, tùy chọn MongoDB Atlas).

## Yêu cầu

- [Node.js](https://nodejs.org/) 18+ (khuyến nghị LTS)
- MySQL 8 (local hoặc Docker)
- (Tùy chọn) MongoDB Atlas nếu bật `USE_MONGODB=true`

## Cài đặt nhanh

### 1. Clone

```bash
git clone https://github.com/maiquocbinh1/Library-system.git
cd Library-system
```

### 2. Database MySQL

Tạo database tên `books`, user `root` (hoặc chỉnh trong `server/src/config/connectDB.js` / biến môi trường).

Import schema mẫu (nếu cần):

```bash
mysql -u root -p books < mysql/init/init.sql
```

### 3. Backend (`server/`)

```bash
cd server
copy .env.example .env
```

Sửa `server/.env`: `DB_PASSWORD`, `JWT_SECRET`, `SECRET_CRYPTO` (bắt buộc cho auth/mã hóa).  
Nếu dùng MongoDB: thêm `MONGODB_URI`, đặt `USE_MONGODB=true`.  
Email (Gmail OAuth): điền `CLIENT_ID`, `CLIENT_SECRET`, `REDIRECT_URI`, `REFRESH_TOKEN`, `USER_EMAIL` nếu dùng gửi mail.

```bash
npm install
npm run dev
```

API mặc định: `http://localhost:3000`

### 4. Frontend (`FE/`)

Mở terminal **mới**:

```bash
cd FE
copy .env.example .env
```

Đảm bảo `VITE_API_URL=http://localhost:3000` (trùng cổng backend).

```bash
npm install
npm run dev
```

Mở trình duyệt theo URL Vite in ra (thường `http://localhost:5173`).

## Cấu trúc thư mục

| Thư mục | Mô tả |
|--------|--------|
| `FE/` | Giao diện React (Vite) |
| `server/` | API Express |
| `mysql/init/` | Script SQL khởi tạo |

## Ghi chú

- Không commit file `.env`; chỉ dùng `.env.example` làm mẫu.
- Cookie auth dùng `secure: true` — trên môi trường dev HTTP thuần, nếu gặp lỗi cookie có thể cần chỉnh tạm trong code hoặc chạy HTTPS local.

## License

Dự án cá nhân / học tập.
