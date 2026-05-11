/**
 * Tạo thư mục uploads local (server/src/uploads/...) và tải ảnh theo đường dẫn trong Mongo
 * (sách: image; user: avatar) nếu là dạng `uploads/...`.
 *
 * Đặt URL gốc nơi từng có file (VPS, bản deploy cũ…):
 *   UPLOAD_SYNC_BASE_URL=https://your-old-domain.com
 *
 * PowerShell:
 *   cd server
 *   $env:UPLOAD_SYNC_BASE_URL="https://example.com"
 *   node src/scripts/syncUploadImagesFromUrl.js
 *
 * Ghi đè file đã có:
 *   node src/scripts/syncUploadImagesFromUrl.js --force
 *
 * Chỉ tạo thư mục, không tải (chưa có BASE):
 *   node src/scripts/syncUploadImagesFromUrl.js
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const BookMongo = require('../models/book.mongo.model');
const UserMongo = require('../models/user.mongo.model');

/** Thư mục `server/src` — cùng cấp với multer `src/uploads/...` khi chạy từ thư mục `server/`. */
const UPLOAD_ROOT = path.resolve(__dirname, '..');

function toUploadsRelative(imageField) {
    if (!imageField || typeof imageField !== 'string') return null;
    const s = imageField.trim();
    if (s.startsWith('http://') || s.startsWith('https://')) return null;
    if (s.startsWith('uploads/')) return s.replace(/\\/g, '/');
    return null;
}

async function downloadTo(url, destPath) {
    const dir = path.dirname(destPath);
    fs.mkdirSync(dir, { recursive: true });
    const res = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 90000,
        maxContentLength: 50 * 1024 * 1024,
        validateStatus: () => true,
    });
    if (res.status !== 200) {
        return { ok: false, status: res.status };
    }
    fs.writeFileSync(destPath, Buffer.from(res.data));
    return { ok: true, status: res.status };
}

async function run() {
    const base = String(process.env.UPLOAD_SYNC_BASE_URL || '').trim().replace(/\/$/, '');
    const force = process.argv.includes('--force');

    await connectSeedMongo();

    fs.mkdirSync(path.join(UPLOAD_ROOT, 'uploads', 'products'), { recursive: true });
    fs.mkdirSync(path.join(UPLOAD_ROOT, 'uploads', 'avatars'), { recursive: true });

    const images = new Set();
    for (const i of await BookMongo.distinct('image')) {
        const r = toUploadsRelative(i);
        if (r) images.add(r);
    }
    for (const i of await UserMongo.distinct('avatar')) {
        const r = toUploadsRelative(i);
        if (r) images.add(r);
    }

    const list = [...images].sort();
    console.log(`[sync-uploads] ${list.length} đường dẫn uploads/... trong DB.`);

    if (!base) {
        console.log('[sync-uploads] Không có UPLOAD_SYNC_BASE_URL — đã tạo thư mục, bỏ qua tải file.');
        console.log('  Thêm biến môi trường rồi chạy lại để kéo ảnh từ server cũ.');
        await disconnectSeedMongo();
        return;
    }

    let ok = 0;
    let skipped = 0;
    let fail = 0;

    for (const rel of list) {
        const dest = path.join(UPLOAD_ROOT, rel.split('/').join(path.sep));
        if (fs.existsSync(dest) && !force) {
            skipped += 1;
            continue;
        }
        const url = `${base}/${rel}`;
        try {
            const r = await downloadTo(url, dest);
            if (r.ok) ok += 1;
            else {
                fail += 1;
                console.warn(`[sync-uploads] HTTP ${r.status} ${url}`);
            }
        } catch (e) {
            fail += 1;
            console.warn(`[sync-uploads] ${rel}: ${e.message}`);
        }
    }

    console.log(`[sync-uploads] Tải xong: ${ok} file mới/ghi đè, ${skipped} đã có (bỏ qua), ${fail} lỗi.`);
    await disconnectSeedMongo();
}

run().catch(async (err) => {
    console.error('[sync-uploads] Lỗi:', err);
    await disconnectSeedMongo().catch(() => {});
    process.exit(1);
});
