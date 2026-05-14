/**
 * Seed demo data for collection `library_mail` — thống kê demo (OAS-style):
 *   Tổng đã gửi: 247 | Thành công: 241 | Thất bại: 6 | Tổng người nhận: 1842
 *
 * Công thức: 240 × BORROW_CONFIRM success (1 người) + 1 × SYSTEM success (1596 người)
 *            + 6 × BORROW_CONFIRM failed (1 người) = 247 gửi, 241 thành công, 6 thất bại
 *            Người nhận: 240 + 1596 + 6 = 1842
 *
 * Usage:
 *   node src/scripts/seedLibraryMailDemo.js
 *   node src/scripts/seedLibraryMailDemo.js --force
 */
require('dotenv').config();
const mongoose = require('mongoose');
const crypto = require('crypto');

const LibraryMailMongo = require('../models/libraryMail.mongo.model');
const UserMongo = require('../models/user.mongo.model');

function randomId() {
    return crypto.randomUUID();
}

function daysAgo(days, hour = 10) {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hour, Math.floor(Math.random() * 59), 0, 0);
    return d;
}

async function main() {
    const force = process.argv.includes('--force');
    const uri = process.env.MONGODB_URI || process.env.MONGO_URL || process.env.MONGO_URI;
    if (!uri) {
        // eslint-disable-next-line no-console
        console.error('Missing MONGODB_URI (or MONGO_URL/MONGO_URI) env var.');
        process.exit(1);
    }
    await mongoose.connect(uri);

    const DEMO_SOURCE = 'seed_library_mail_demo';
    if (force) {
        await LibraryMailMongo.deleteMany({ 'meta.source': DEMO_SOURCE });
    } else {
        const n = await LibraryMailMongo.countDocuments({ 'meta.source': DEMO_SOURCE });
        if (n > 0) {
            // eslint-disable-next-line no-console
            console.log(`[seed-library-mail] Already seeded (${n}). Use --force to reseed.`);
            process.exit(0);
        }
    }

    const anyUsers = await UserMongo.find({ role: 'user' }).select('_id email fullName studentId').limit(30).lean();
    const pickUser = (i) => anyUsers[i % (anyUsers.length || 1)] || null;

    const rows = [];
    const now = Date.now();

    // 240 thành công — xác nhận mượn, 1 người nhận
    for (let i = 0; i < 240; i += 1) {
        const u = pickUser(i);
        const createdAt = daysAgo(1 + (i % 60), 8 + (i % 8));
        rows.push({
            mysqlId: randomId(),
            type: 'BORROW_CONFIRM',
            title: 'Xác nhận mượn sách',
            contentHtml: `<p>Xin chào <b>${u?.fullName || 'Độc giả'}</b>, phiếu mượn đã được xác nhận.</p>
              <p>Email: ${u?.email || '—'} · Hạn trả: <b>${new Date(now + 86400000 * 14).toLocaleDateString('vi-VN')}</b></p>`,
            senderEmail: 'no-reply@thuvien.local',
            senderName: 'Hệ thống thư viện',
            recipientUserId: u?._id ? String(u._id) : '',
            status: 'RESOLVED',
            deliveryStatus: 'success',
            recipientCount: 1,
            resolvedAt: createdAt,
            meta: { source: DEMO_SOURCE, demoIndex: i },
            createdAt,
            updatedAt: createdAt,
        });
    }

    // 1 thành công — toàn hệ thống, nhiều người nhận
    const sysAt = daysAgo(2, 9);
    rows.push({
        mysqlId: randomId(),
        type: 'SYSTEM',
        title: 'Thông báo toàn hệ thống',
        contentHtml:
            '<p>Thư viện gửi thông báo tới toàn thể độc giả: cập nhật quy định mượn/trả và thời gian phục vụ Tết.</p>',
        senderEmail: 'no-reply@thuvien.local',
        senderName: 'Ban quản trị',
        status: 'RESOLVED',
        deliveryStatus: 'success',
        recipientCount: 1596,
        resolvedAt: sysAt,
        meta: { source: DEMO_SOURCE, broadcast: true },
        createdAt: sysAt,
        updatedAt: sysAt,
    });

    // 6 thất bại — gửi xác nhận không thành công
    for (let j = 0; j < 6; j += 1) {
        const u = pickUser(j + 3);
        const createdAt = daysAgo(3 + j, 14);
        rows.push({
            mysqlId: randomId(),
            type: 'BORROW_CONFIRM',
            title: 'Xác nhận mượn sách (lỗi gửi)',
            contentHtml: `<p>Gửi thông báo xác nhận tới <b>${u?.email || 'độc giả'}</b> thất bại (hộp thư đầy / từ chối).</p>`,
            senderEmail: 'no-reply@thuvien.local',
            senderName: 'Hệ thống thư viện',
            recipientUserId: u?._id ? String(u._id) : '',
            status: 'RESOLVED',
            deliveryStatus: 'failed',
            recipientCount: 1,
            meta: { source: DEMO_SOURCE, failReason: 'delivery_rejected', demoFail: j },
            createdAt,
            updatedAt: createdAt,
        });
    }

    await LibraryMailMongo.insertMany(rows);

    // eslint-disable-next-line no-console
    console.log(`[seed-library-mail] Inserted ${rows.length} docs (demo KPI: 247 / 241 / 6 / 1842 người nhận).`);
    await mongoose.disconnect();
}

main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seed-library-mail] Failed:', err);
    process.exit(1);
});
