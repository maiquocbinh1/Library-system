/**
 * Tạo / cập nhật 2 độc giả demo khớp `library_mail_import_sample.csv` (FORGOT_PASSWORD import-csv-017, 018)
 * để test ResetPass / đăng nhập (tránh lỗi "Không tìm thấy user theo email này").
 *
 * Chạy từ thư mục server: npm run seed:library-mail-forgot-users
 *
 * Mật khẩu ban đầu: 123456 (sau khi thủ thư ResetPass sẽ là 123).
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const UserMongo = require('../models/user.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');

const DEFAULT_PASSWORD = '123456';

const DEMO_ROWS = [
    {
        email: 'nguyenvana@stu.ptit.edu.vn',
        studentId: 'B21DCN088',
        fullName: 'Nguyễn Văn A (demo nhật ký thư)',
        className: 'B21DCN01',
    },
    {
        email: 'tranthib@gmail.com',
        studentId: 'B20DVT001',
        fullName: 'Trần Thị B (demo nhật ký thư)',
        className: 'B20DVT01',
    },
];

function random36() {
    return crypto.randomUUID();
}

async function ensureApiKey(userId) {
    const userIdStr = String(userId);
    const existing = await ApiKeyMongo.findOne({ userId: userIdStr });
    if (existing) return existing;
    await ApiKeyMongo.deleteMany({ userId: userIdStr });
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    return ApiKeyMongo.create({
        mysqlId: random36(),
        userId: userIdStr,
        publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
        privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    });
}

async function upsertDemoUser(row, passwordHash) {
    const email = String(row.email).toLowerCase().trim();
    const studentId = String(row.studentId).trim();

    let user = await UserMongo.findOne({ $or: [{ email }, { studentId }] }).exec();
    const now = new Date();
    const expires = new Date(now);
    expires.setFullYear(expires.getFullYear() + 1);

    if (user) {
        user.email = email;
        user.studentId = studentId;
        user.fullName = row.fullName;
        user.password = passwordHash;
        user.typeLogin = 'email';
        user.role = 'user';
        user.readerType = 'SinhVien_ChinhQuy';
        user.verificationStatus = 'verified';
        user.className = row.className || user.className;
        user.cardPlanMonths = user.cardPlanMonths ?? 12;
        user.libraryCardIssuedAt = user.libraryCardIssuedAt ?? now;
        user.libraryCardExpiresAt = user.libraryCardExpiresAt ?? expires;
        await user.save();
        await ensureApiKey(user._id);
        console.log(`[seed:library-mail-forgot-users] Đã cập nhật: ${email} | MSV ${studentId}`);
        return 'updated';
    }

    user = await UserMongo.create({
        mysqlId: random36(),
        fullName: row.fullName,
        phone: null,
        address: null,
        email,
        password: passwordHash,
        typeLogin: 'email',
        role: 'user',
        studentId,
        readerType: 'SinhVien_ChinhQuy',
        verificationStatus: 'verified',
        cardPlanMonths: 12,
        libraryCardIssuedAt: now,
        libraryCardExpiresAt: expires,
        className: row.className || null,
    });
    await ensureApiKey(user._id);
    console.log(`[seed:library-mail-forgot-users] Đã tạo mới: ${email} | MSV ${studentId}`);
    return 'created';
}

async function run() {
    await connectSeedMongo();
    console.log('[seed:library-mail-forgot-users] Kết nối MongoDB\n');

    const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, bcrypt.genSaltSync(10));
    let created = 0;
    let updated = 0;

    try {
        for (const row of DEMO_ROWS) {
            const r = await upsertDemoUser(row, passwordHash);
            if (r === 'created') created += 1;
            else updated += 1;
        }
        console.log('');
        console.log('========== 2 độc giả demo (khớp CSV nhật ký thư) ==========');
        console.log(`Mật khẩu hiện tại: ${DEFAULT_PASSWORD}  (sau ResetPass thủ thư: 123)`);
        for (const row of DEMO_ROWS) {
            console.log(`  ${row.fullName}`);
            console.log(`    Email: ${row.email}`);
            console.log(`    MSV:   ${row.studentId}`);
        }
        console.log(`\nTóm tắt: tạo mới=${created}, cập nhật=${updated}`);
        console.log('===========================================================\n');
    } finally {
        await disconnectSeedMongo();
    }
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[seed:library-mail-forgot-users] Lỗi:', err?.message || err);
        process.exit(1);
    });
