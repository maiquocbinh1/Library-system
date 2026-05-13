/**
 * Chuẩn hoá nhân sự + nhật ký kiểm toán ban đầu cho thư viện.
 *
 * - Cập nhật admin `a1@gmail.com` → họ tên "Trần Admin".
 * - Chuẩn hoá admin PTIT `admin@ptit.edu.vn` → họ tên "Mai Van B" (và collection `admin`).
 * - Đồng bộ `adminName` trong `library_audit_logs` theo họ tên User hiện tại (admin / thủ thư / kho).
 * - Tạo (nếu chưa có): thủ thư, nhân viên kho (họ tên + @ptit.edu.vn) — mật khẩu mặc định 123 (đổi bằng SEED_STAFF_PASSWORD).
 * - Ghi `library_audit_logs`: các sự kiện nghiệp vụ mẫu (dữ liệu thật trong DB, không có nhãn "demo" trên UI).
 *
 * Chạy: npm run seed:personnel-audit
 * Ghi đè lại bộ audit do script này tạo: npm run seed:personnel-audit -- --force
 */

const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const UserMongo = require('../models/user.mongo.model');
const AdminMongo = require('../models/admin.mongo.model');
const AuditLogMongo = require('../models/auditLog.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const { random36, createApiKeyForUser } = require('../services/apiKeyService');
const { AuditActions } = require('../utils/logAdminAction');

const ADMIN_EMAIL = 'a1@gmail.com';
/** Thủ thư / kho: họ tên + email định dạng nội bộ PTIT (ASCII, không dấu trong local-part). */
const LIB_EMAIL = 'tran.thi.huong@ptit.edu.vn';
const LIB_FULL_NAME = 'Trần Thị Hương';
const WH_EMAIL = 'hoang.van.nam@ptit.edu.vn';
const WH_FULL_NAME = 'Hoàng Văn Nam';
/** Email seed cũ — nếu còn trong DB sẽ được đổi sang email mới trên. */
const LEGACY_LIB_EMAIL = 'thuthu.ptit@ptit.edu.vn';
const LEGACY_WH_EMAIL = 'kho.ptit@ptit.edu.vn';

/** Admin nội bộ PTIT (khác a1@gmail.com) — họ tên hiển thị chuẩn hoá. */
const PTIT_ADMIN_EMAIL = 'admin@ptit.edu.vn';
const PTIT_ADMIN_DISPLAY_NAME = 'Mai Van B';

/** mysqlId cố định cho các bản ghi audit do script tạo — dùng để xóa khi --force */
const AUDIT_MYSQL_PREFIX = 'hr-audit-seed-';

async function ensureApiKey(userId) {
    const uid = String(userId);
    const exists = await ApiKeyMongo.exists({ userId: uid });
    if (!exists) await createApiKeyForUser(userId);
}

async function upsertUser({ email, fullName, role, passwordPlain, alwaysSetPassword }) {
    const emailNorm = String(email).toLowerCase();
    let u = await UserMongo.findOne({ email: emailNorm });
    const hash = bcrypt.hashSync(String(passwordPlain), bcrypt.genSaltSync(10));
    if (!u) {
        u = await UserMongo.create({
            mysqlId: random36(),
            email: emailNorm,
            fullName,
            role,
            typeLogin: 'email',
            password: hash,
            phone: null,
            address: '',
        });
        await ensureApiKey(u._id);
        return { user: u, created: true };
    }
    u.fullName = fullName;
    u.role = role;
    if (alwaysSetPassword && passwordPlain) {
        u.password = hash;
    }
    await u.save();
    await ensureApiKey(u._id);
    return { user: u, created: false };
}

/** Đổi email + họ tên từ bản seed cũ sang bản hiện tại (tránh tạo trùng user). */
async function migrateLegacyStaffEmails() {
    const pairs = [
        { from: LEGACY_LIB_EMAIL, to: LIB_EMAIL, fullName: LIB_FULL_NAME },
        { from: LEGACY_WH_EMAIL, to: WH_EMAIL, fullName: WH_FULL_NAME },
    ];
    for (const { from, to, fullName } of pairs) {
        const fromNorm = String(from).toLowerCase();
        const toNorm = String(to).toLowerCase();
        if (fromNorm === toNorm) continue;
        const oldUser = await UserMongo.findOne({ email: fromNorm });
        if (!oldUser) continue;
        const taken = await UserMongo.findOne({ email: toNorm, _id: { $ne: oldUser._id } });
        if (taken) {
            console.warn(`[seed-personnel] Bỏ qua đổi email ${fromNorm} → ${toNorm} (email đích đã tồn tại).`);
            continue;
        }
        oldUser.email = toNorm;
        oldUser.fullName = fullName;
        await oldUser.save();
        console.log(`[seed-personnel] Đã đổi tài khoản seed: ${fromNorm} → ${toNorm} (${fullName})`);
    }
}

async function ensurePtitAdminDisplayName() {
    const emailNorm = PTIT_ADMIN_EMAIL.toLowerCase();
    const u = await UserMongo.findOne({ email: emailNorm });
    if (!u) return;
    if (String(u.fullName || '').trim() !== PTIT_ADMIN_DISPLAY_NAME) {
        u.fullName = PTIT_ADMIN_DISPLAY_NAME;
        await u.save();
        console.log(`[seed-personnel] ${emailNorm} → họ tên "${PTIT_ADMIN_DISPLAY_NAME}"`);
    }
    const uid = String(u._id);
    const r = await AdminMongo.updateMany(
        { userId: uid },
        { $set: { fullName: PTIT_ADMIN_DISPLAY_NAME, email: emailNorm } },
    );
    if (r.modifiedCount) {
        console.log(`[seed-personnel] Đã đồng bộ collection admin (${r.modifiedCount} bản ghi).`);
    }
}

/** Ghi đè adminName trong audit theo họ tên hiện tại của user (sửa log demo cũ). */
async function syncAuditAdminNamesFromUsers() {
    const staff = await UserMongo.find({ role: { $in: ['admin', 'librarian', 'warehouse'] } })
        .select('_id fullName')
        .lean();
    let total = 0;
    for (const row of staff) {
        const id = String(row._id);
        const name = String(row.fullName || '').trim() || '—';
        const r = await AuditLogMongo.updateMany({ adminId: id }, { $set: { adminName: name } });
        total += r.modifiedCount || 0;
    }
    if (total > 0) {
        console.log(`[seed-personnel] Đã đồng bộ ${total} dòng audit theo họ tên nhân sự hiện tại.`);
    }
}

function auditDoc(mysqlId, { adminId, adminName, adminRole, action, targetId, targetType, oldValues, newValues, at }) {
    return {
        mysqlId,
        adminId: String(adminId),
        adminName,
        adminRole,
        action,
        targetId: targetId != null ? String(targetId) : '',
        targetType: targetType || 'UNKNOWN',
        oldValues: oldValues ?? null,
        newValues: newValues ?? null,
        createdAt: at,
        updatedAt: at,
    };
}

async function run() {
    const force = process.argv.includes('--force');
    const pwd = String(process.env.SEED_STAFF_PASSWORD || '123').trim() || '123';

    await connectSeedMongo();

    try {
        await migrateLegacyStaffEmails();
        await ensurePtitAdminDisplayName();

        if (force) {
            await AuditLogMongo.deleteMany({ mysqlId: { $regex: `^${AUDIT_MYSQL_PREFIX}` } });
            console.log('[seed-personnel] Đã xóa audit cũ do script tạo (--force).');
        }

        const { user: adminUser } = await upsertUser({
            email: ADMIN_EMAIL,
            fullName: 'Trần Admin',
            role: 'admin',
            passwordPlain: pwd,
            alwaysSetPassword: process.env.SEED_RESET_ADMIN_PASSWORD === '1',
        });
        const { user: libUser } = await upsertUser({
            email: LIB_EMAIL,
            fullName: LIB_FULL_NAME,
            role: 'librarian',
            passwordPlain: pwd,
            alwaysSetPassword: process.env.SEED_RESET_ALL_PASSWORDS === '1',
        });
        const { user: whUser } = await upsertUser({
            email: WH_EMAIL,
            fullName: WH_FULL_NAME,
            role: 'warehouse',
            passwordPlain: pwd,
            alwaysSetPassword: process.env.SEED_RESET_ALL_PASSWORDS === '1',
        });

        await syncAuditAdminNamesFromUsers();

        const adminId = String(adminUser._id);
        const libId = String(libUser._id);
        const whId = String(whUser._id);

        const existingAudit = await AuditLogMongo.countDocuments({ mysqlId: { $regex: `^${AUDIT_MYSQL_PREFIX}` } });
        if (existingAudit > 0 && !force) {
            console.log('[seed-personnel] Đã có nhật ký audit từ lần chạy trước. Bỏ qua chèn audit. Dùng --force để làm mới.');
        } else {
            const now = Date.now();
            const rows = [
                auditDoc(`${AUDIT_MYSQL_PREFIX}001`, {
                    adminId: libId,
                    adminName: libUser.fullName,
                    adminRole: 'librarian',
                    action: 'LOAN_TICKET_CREATED',
                    targetId: 'ticket-ref-1040',
                    targetType: 'LOAN_TICKET',
                    oldValues: null,
                    newValues: { patron: 'B21DCCN001', copies: 1 },
                    at: new Date(now - 5 * 86400000),
                }),
                auditDoc(`${AUDIT_MYSQL_PREFIX}002`, {
                    adminId: adminId,
                    adminName: adminUser.fullName,
                    adminRole: 'admin',
                    action: AuditActions.USER_UPDATED,
                    targetId: '507f1f77bcf86cd799439011',
                    targetType: 'USER',
                    oldValues: { fullName: 'Nguyễn Văn X', phone: '0901000001' },
                    newValues: { fullName: 'Nguyễn Văn X', phone: '0901000002' },
                    at: new Date(now - 4 * 86400000 + 3600000),
                }),
                auditDoc(`${AUDIT_MYSQL_PREFIX}003`, {
                    adminId: libId,
                    adminName: libUser.fullName,
                    adminRole: 'librarian',
                    action: 'LOAN_TICKET_CREATED',
                    targetId: 'ticket-ref-1042',
                    targetType: 'LOAN_TICKET',
                    oldValues: null,
                    newValues: { barcodes: 2, patron: 'B21DCCN001' },
                    at: new Date(now - 3 * 86400000 + 9 * 3600000 + 15 * 60000),
                }),
                auditDoc(`${AUDIT_MYSQL_PREFIX}004`, {
                    adminId: libId,
                    adminName: libUser.fullName,
                    adminRole: 'librarian',
                    action: AuditActions.FINE_PAID,
                    targetId: 'fine-ref-8821',
                    targetType: 'FINE_TICKET',
                    oldValues: { status: 'UNPAID', fineAmount: 15000 },
                    newValues: { status: 'PAID' },
                    at: new Date(now - 3 * 86400000 + 10 * 3600000 + 30 * 60000),
                }),
                auditDoc(`${AUDIT_MYSQL_PREFIX}005`, {
                    adminId: whId,
                    adminName: whUser.fullName,
                    adminRole: 'warehouse',
                    action: 'INVENTORY_ADJUST',
                    targetId: 'shelf-A',
                    targetType: 'INVENTORY',
                    oldValues: { available: 120 },
                    newValues: { available: 118, note: 'Kiểm kê định kỳ khu A' },
                    at: new Date(now - 2 * 86400000 + 8 * 3600000 + 40 * 60000),
                }),
                auditDoc(`${AUDIT_MYSQL_PREFIX}006`, {
                    adminId: adminId,
                    adminName: adminUser.fullName,
                    adminRole: 'admin',
                    action: AuditActions.BOOK_COPY_DELETED,
                    targetId: 'copy-ref-01',
                    targetType: 'BOOK_COPY',
                    oldValues: { barcode: 'BC-DEMO-01', status: 'AVAILABLE' },
                    newValues: null,
                    at: new Date(now - 2 * 86400000 + 11 * 3600000),
                }),
                auditDoc(`${AUDIT_MYSQL_PREFIX}007`, {
                    adminId: libId,
                    adminName: libUser.fullName,
                    adminRole: 'librarian',
                    action: 'RETURN_BATCH',
                    targetId: 'session-03',
                    targetType: 'CIRCULATION',
                    oldValues: null,
                    newValues: { count: 3, barcodes: true },
                    at: new Date(now - 1 * 86400000 + 14 * 3600000 + 22 * 60000),
                }),
                auditDoc(`${AUDIT_MYSQL_PREFIX}008`, {
                    adminId: whId,
                    adminName: whUser.fullName,
                    adminRole: 'warehouse',
                    action: 'BOOK_RECEIVED',
                    targetId: 'delivery-2026-05',
                    targetType: 'SUPPLY',
                    oldValues: null,
                    newValues: { titles: 12, boxes: 2 },
                    at: new Date(now - 1 * 86400000 + 15 * 3600000),
                }),
                auditDoc(`${AUDIT_MYSQL_PREFIX}009`, {
                    adminId: adminId,
                    adminName: adminUser.fullName,
                    adminRole: 'admin',
                    action: AuditActions.PATRON_CARD_LOCK,
                    targetId: 'patron-user-ref',
                    targetType: 'USER',
                    oldValues: { libraryCardBlocked: false },
                    newValues: { libraryCardBlocked: true },
                    at: new Date(now - 12 * 3600000),
                }),
            ];
            await mongoose.connection.db.collection('library_audit_logs').insertMany(rows);
            console.log(`[seed-personnel] Đã chèn ${rows.length} bản ghi vào library_audit_logs.`);
        }

        console.log('---');
        const adminPwdNote =
            process.env.SEED_RESET_ADMIN_PASSWORD === '1'
                ? `mật khẩu đã đặt lại: ${pwd}`
                : 'mật khẩu giữ nguyên (đặt SEED_RESET_ADMIN_PASSWORD=1 để ghi đè)';
        console.log(`Admin: ${ADMIN_EMAIL} — ${adminUser.fullName} (${adminPwdNote})`);
        console.log(`Thủ thư: ${LIB_FULL_NAME} — ${LIB_EMAIL} / ${pwd}`);
        console.log(`Kho: ${WH_FULL_NAME} — ${WH_EMAIL} / ${pwd}`);
        console.log('[seed-personnel] Hoàn tất.');
    } finally {
        await disconnectSeedMongo();
    }
}

run()
    .then(() => process.exit(0))
    .catch((e) => {
        console.error('[seed-personnel] Lỗi:', e.message);
        process.exit(1);
    });
