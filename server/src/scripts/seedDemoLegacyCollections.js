/**
 * Bổ sung dữ liệu demo cho các collection legacy (không có model Mongoose trong app hiện tại):
 *   - library_fine_logs — nhật ký thao tác / sự kiện liên quan phạt (minh họa)
 *   - library_violations — cảnh báo / vi phạm quy định độc giả (minh họa)
 *
 * Dữ liệu thật phạt vẫn nằm ở collection `fine_tickets` (không đụng tới).
 * Mọi document chèn có field `source: 'demo_seed'` — xóa bằng:
 *   db.library_fine_logs.deleteMany({ source: 'demo_seed' })
 *   db.library_violations.deleteMany({ source: 'demo_seed' })
 *
 * Chạy: npm run seed:legacy-collections
 * Ghi đè bộ demo: npm run seed:legacy-collections -- --force
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');

function random36() {
    return crypto.randomUUID();
}

const FineTicketMongo = require('../models/fineTicket.mongo.model');
const UserMongo = require('../models/user.mongo.model');

const DEMO_SOURCE = 'demo_seed';

async function run() {
    const force = process.argv.includes('--force');
    await connectSeedMongo();
    const db = mongoose.connection.db;

    try {
        if (force) {
            await db.collection('library_fine_logs').deleteMany({ source: DEMO_SOURCE });
            await db.collection('library_violations').deleteMany({ source: DEMO_SOURCE });
            console.log('[seed-legacy] Đã xóa bản ghi demo cũ (--force).');
        } else {
            const [nLog, nVio] = await Promise.all([
                db.collection('library_fine_logs').countDocuments({ source: DEMO_SOURCE }),
                db.collection('library_violations').countDocuments({ source: DEMO_SOURCE }),
            ]);
            if (nLog > 0 || nVio > 0) {
                console.log(
                    `[seed-legacy] Đã có ${nLog} fine_logs + ${nVio} violations (demo). Bỏ qua. Chạy lại với --force để làm mới.`,
                );
                return;
            }
        }

        const fines = await FineTicketMongo.find({}).sort({ createdAt: -1 }).limit(8).lean();
        const users = await UserMongo.find({ role: 'user' }).sort({ createdAt: -1 }).limit(12).lean();

        const now = Date.now();
        const fineLogs = [];

        for (let i = 0; i < fines.length; i += 1) {
            const f = fines[i];
            const base = {
                fineTicketId: f._id,
                userId: String(f.userId),
                studentId: f.studentId || null,
                source: DEMO_SOURCE,
            };
            fineLogs.push({
                mysqlId: random36(),
                ...base,
                action: 'CREATED',
                amountVnd: Number(f.fineAmount) || 0,
                reasonSnapshot: String(f.reason || ''),
                loggedAt: f.createdAt ? new Date(f.createdAt) : new Date(now - (i + 1) * 3600000),
            });
            if (String(f.status) === 'PAID') {
                fineLogs.push({
                    mysqlId: random36(),
                    ...base,
                    action: 'PAID',
                    amountVnd: Number(f.fineAmount) || 0,
                    reasonSnapshot: 'Xác nhận thanh toán tại quầy (demo log)',
                    loggedAt: f.updatedAt ? new Date(f.updatedAt) : new Date(now - i * 1800000),
                });
            }
        }

        if (!fineLogs.length) {
            for (let i = 0; i < 3; i += 1) {
                const u = users[i];
                if (!u) break;
                fineLogs.push({
                    mysqlId: random36(),
                    fineTicketId: null,
                    userId: String(u._id),
                    studentId: u.studentId || u.idStudent || null,
                    action: 'NOTE',
                    amountVnd: 0,
                    reasonSnapshot: 'Ghi chú demo — không gắn phiếu phạt cụ thể',
                    loggedAt: new Date(now - (i + 1) * 7200000),
                    source: DEMO_SOURCE,
                });
            }
        }

        if (fineLogs.length) {
            await db.collection('library_fine_logs').insertMany(fineLogs);
            console.log(`[seed-legacy] Đã chèn ${fineLogs.length} document vào library_fine_logs.`);
        }

        const violationTypes = ['OVERDUE', 'DAMAGED_COPY', 'POLICY_WARNING', 'LOST_BOOK', 'NOISE'];
        const descriptions = [
            'Nhắc nhở: trả sách trễ hạn nhiều lần (demo).',
            'Báo cáo: làm rách bìa / hư hỏng nhẹ bản sao (demo).',
            'Vi phạm nội quy phòng đọc (demo).',
            'Cảnh báo mức độ trung bình — cần xác minh (demo).',
            'Ghi nhận mất sách — chờ xử lý (demo).',
            'Nhắc nhở hành vi gây ồn (demo).',
        ];
        const violations = [];
        for (let i = 0; i < Math.min(8, users.length); i += 1) {
            const u = users[i];
            violations.push({
                mysqlId: random36(),
                userId: String(u._id),
                studentId: u.studentId || u.idStudent || '',
                violationType: violationTypes[i % violationTypes.length],
                description: descriptions[i % descriptions.length],
                severity: ['low', 'medium', 'high'][i % 3],
                status: i % 3 === 0 ? 'open' : 'resolved',
                createdAt: new Date(now - (i + 1) * 86400000 * 2),
                resolvedAt: i % 3 === 0 ? null : new Date(now - (i + 1) * 86400000),
                source: DEMO_SOURCE,
            });
        }

        if (violations.length) {
            await db.collection('library_violations').insertMany(violations);
            console.log(`[seed-legacy] Đã chèn ${violations.length} document vào library_violations.`);
        }

        console.log('[seed-legacy] Hoàn tất.');
    } finally {
        await disconnectSeedMongo();
    }
}

run()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[seed-legacy] Lỗi:', e.message);
        process.exit(1);
    });
