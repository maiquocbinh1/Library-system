/**
 * 1) Dọn: email user1–user18@gmail.com + khách (không MSV) + SV test cũ.
 * 2) Nạp 3 sinh viên PTIT demo (bỏ qua nếu trùng email hoặc MSV).
 *
 * Chạy: npm run seed:test-student  (từ thư mục server)
 * Mật khẩu mặc định: 123456
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');

const UserMongo = require('../models/user.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');

const PTIT_SEED = [
    {
        studentId: 'B22DCCN082',
        fullName: 'Mai Quốc Bình',
        email: 'binhmq.b22@ptit.edu.vn',
        phone: '0987654321',
        className: 'D22CQCN01-B',
    },
    {
        studentId: 'B22DCCN001',
        fullName: 'Nguyễn Văn An',
        email: 'annv.b22@ptit.edu.vn',
        phone: '0912345678',
        className: 'D22CQCN01-B',
    },
    {
        studentId: 'B22DCCN002',
        fullName: 'Trần Thị Bích',
        email: 'bichtt.b22@ptit.edu.vn',
        phone: '0901112223',
        className: 'D22CQCN02-B',
    },
];

const DEFAULT_PASSWORD = '123456';
const LEGACY_TEST_EMAIL = 'sv.test.ptit@student.ptit.edu.vn';
const LEGACY_TEST_MSV = 'B22TESTPTIT2026';

function random36() {
    return crypto.randomUUID();
}

function hasNoStudentId() {
    return {
        $or: [{ studentId: null }, { studentId: { $exists: false } }, { studentId: '' }],
    };
}

function guestLikeUserFilter() {
    return { role: { $ne: 'admin' }, ...hasNoStudentId() };
}

const MOCK_USER_GMAIL_REGEX = /^user([1-9]|1[0-8])@gmail\.com$/i;

function mockNumberedGmailFilter() {
    return { role: { $ne: 'admin' }, email: { $regex: MOCK_USER_GMAIL_REGEX } };
}

async function deleteUsersAndRelatedTickets(users) {
    if (!users.length) return { users: 0, loans: 0, fines: 0 };
    const idSet = new Set();
    for (const u of users) {
        idSet.add(String(u._id));
        idSet.add(u.mysqlId);
    }
    const keys = [...idSet];
    const fineRes = await FineTicketMongo.deleteMany({ userId: { $in: keys } });
    const loanRes = await LoanTicketMongo.deleteMany({ userId: { $in: keys } });
    const userRes = await UserMongo.deleteMany({ _id: { $in: users.map((u) => u._id) } });
    return { users: userRes.deletedCount, loans: loanRes.deletedCount, fines: fineRes.deletedCount };
}

async function cleanupMockAndLegacy() {
    const mockGmailUsers = await UserMongo.find(mockNumberedGmailFilter()).select('_id mysqlId email fullName').lean();
    const guestUsers = await UserMongo.find(guestLikeUserFilter()).select('_id mysqlId email fullName').lean();
    const legacyUsers = await UserMongo.find({
        $or: [{ email: LEGACY_TEST_EMAIL }, { studentId: LEGACY_TEST_MSV }],
    }).select('_id mysqlId email fullName studentId').lean();

    const seen = new Map();
    for (const u of [...mockGmailUsers, ...guestUsers, ...legacyUsers]) {
        seen.set(String(u._id), u);
    }
    const merged = [...seen.values()];

    if (merged.length === 0) {
        console.log('[seed-test-student] Dọn DB: không có user mock / khách / SV test cũ cần xóa.\n');
        return;
    }
    console.log(`[seed-test-student] Dọn DB: xóa ${merged.length} user + phiếu liên quan:`);
    for (const u of merged) {
        console.log(`  - ${u.email} | MSV=${u.studentId || '-'} | ${u.fullName}`);
    }
    const counts = await deleteUsersAndRelatedTickets(merged);
    console.log(`[seed-test-student] Đã xóa: User=${counts.users}, LoanTicket=${counts.loans}, FineTicket=${counts.fines}.\n`);
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

async function seedPtitAccounts(passwordHash) {
    const now = new Date();
    const expires = new Date(now);
    expires.setFullYear(expires.getFullYear() + 1);

    let created = 0;
    let skipped = 0;

    for (const row of PTIT_SEED) {
        const email = String(row.email).toLowerCase().trim();
        const studentId = String(row.studentId).trim();
        const exists = await UserMongo.findOne({ $or: [{ email }, { studentId }] }).select('_id').lean();
        if (exists) {
            console.log(`[seed-test-student] Bỏ qua (đã tồn tại): ${email} | MSV ${studentId}`);
            skipped += 1;
            continue;
        }
        const user = await UserMongo.create({
            mysqlId: random36(),
            fullName: row.fullName,
            phone: row.phone || null,
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
        console.log(`[seed-test-student] Đã tạo SV: ${row.fullName} | ${email} | MSV ${studentId}`);
        created += 1;
    }

    console.log('');
    console.log(`[seed-test-student] Tóm tắt seed: tạo mới=${created}, bỏ qua=${skipped}`);
}

async function run() {
    await connectSeedMongo();
    console.log('[seed-test-student] Đã kết nối MongoDB\n');

    const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, bcrypt.genSaltSync(10));

    try {
        await cleanupMockAndLegacy();
        await seedPtitAccounts(passwordHash);

        console.log('');
        console.log('========== DEMO PTIT (mật khẩu: 123456) ==========');
        for (const row of PTIT_SEED) {
            console.log(`  ${row.fullName.padEnd(28)} ${row.email.padEnd(36)} MSV ${row.studentId}`);
        }
        console.log('==================================================\n');
    } finally {
        await disconnectSeedMongo();
    }
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[seed-test-student] Lỗi:', err.message);
        process.exit(1);
    });
