/**
 * 1) Dọn: email user1–user18@gmail.com + khách (không MSV/MSG) + SV test cũ (B22TESTPTIT2026 / sv.test.ptit@...).
 * 2) Nạp 3 sinh viên + 1 giảng viên PTIT demo (bỏ qua nếu trùng email hoặc MSV/MSG).
 *
 * Chạy: npm run seed:test-student  (từ thư mục server)
 * Hoặc: node src/scripts/seedTestStudent.js
 *
 * Mật khẩu mặc định tất cả tài khoản được tạo mới: 123456
 */

const crypto = require('crypto');
const path = require('path');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const UserMongo = require('../models/user.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** Dữ liệu demo PTIT (3 SV + 1 GV). */
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
    {
        staffId: 'GV00123',
        fullName: 'TS. Phạm Văn Đồng',
        email: 'dongpv@ptit.edu.vn',
        phone: '0977123123',
        readerType: 'GiangVien_CanBo',
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

function hasNoStaffId() {
    return {
        $or: [{ staffId: null }, { staffId: { $exists: false } }, { staffId: '' }],
    };
}

function guestLikeUserFilter() {
    return {
        role: { $ne: 'admin' },
        $and: [hasNoStudentId(), hasNoStaffId()],
    };
}

/** user1@gmail.com … user18@gmail.com (mock), trừ admin. */
const MOCK_USER_GMAIL_REGEX = /^user([1-9]|1[0-8])@gmail\.com$/i;

function mockNumberedGmailFilter() {
    return {
        role: { $ne: 'admin' },
        email: { $regex: MOCK_USER_GMAIL_REGEX },
    };
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

    return {
        users: userRes.deletedCount,
        loans: loanRes.deletedCount,
        fines: fineRes.deletedCount,
    };
}

/** Gỡ null khỏi index sparse (dữ liệu cũ từ khi schema còn default null). */
async function unsetRedundantSparseNulls() {
    const r1 = await UserMongo.collection.updateMany(
        { studentId: { $nin: [null, ''] }, staffId: null },
        { $unset: { staffId: 1 } },
    );
    const r2 = await UserMongo.collection.updateMany(
        { staffId: { $nin: [null, ''] }, studentId: null },
        { $unset: { studentId: 1 } },
    );
    if (r1.modifiedCount || r2.modifiedCount) {
        console.log(
            `[seed-test-student] Đã unset staffId/studentId thừa (null): modified ${r1.modifiedCount + r2.modifiedCount} doc.\n`,
        );
    }
}

async function cleanupMockAndLegacy() {
    const mockGmailUsers = await UserMongo.find(mockNumberedGmailFilter()).select('_id mysqlId email fullName').lean();
    const guestUsers = await UserMongo.find(guestLikeUserFilter()).select('_id mysqlId email fullName').lean();

    const legacyUsers = await UserMongo.find({
        $or: [{ email: LEGACY_TEST_EMAIL }, { studentId: LEGACY_TEST_MSV }],
    })
        .select('_id mysqlId email fullName studentId')
        .lean();

    const seen = new Map();
    for (const u of [...mockGmailUsers, ...guestUsers, ...legacyUsers]) {
        seen.set(String(u._id), u);
    }
    const merged = [...seen.values()];

    if (merged.length === 0) {
        console.log('[seed-test-student] Dọn DB: không có user mock / khách / SV test cũ cần xóa.\n');
        return;
    }

    console.log(
        `[seed-test-student] Dọn DB: xóa ${merged.length} user (user1–18@gmail + khách + legacy test) + phiếu liên quan:`,
    );
    for (const u of merged) {
        console.log(`  - ${u.email} | MSV=${u.studentId || '-'} | ${u.fullName}`);
    }

    const counts = await deleteUsersAndRelatedTickets(merged);
    console.log(
        `[seed-test-student] Đã xóa: User=${counts.users}, LoanTicket=${counts.loans}, FineTicket=${counts.fines}.\n`,
    );
}

async function ensureApiKey(userId) {
    const userIdStr = String(userId);
    const existing = await ApiKeyMongo.findOne({ userId: userIdStr });
    if (existing) return existing;
    await ApiKeyMongo.deleteMany({ userId: userIdStr });
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const privateKeyString = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const publicKeyString = publicKey.export({ type: 'spki', format: 'pem' });
    return ApiKeyMongo.create({
        mysqlId: random36(),
        userId: userIdStr,
        publicKey: publicKeyString,
        privateKey: privateKeyString,
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
        const isStaff = Boolean(row.staffId);

        if (isStaff) {
            const staffId = String(row.staffId).trim();
            const exists = await UserMongo.findOne({
                $or: [{ email }, { staffId }],
            })
                .select('_id')
                .lean();
            if (exists) {
                console.log(`[seed-test-student] Bỏ qua (email hoặc MSG đã tồn tại): ${email} | MSG ${staffId}`);
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
                staffId,
                readerType: row.readerType || 'GiangVien_CanBo',
                verificationStatus: 'verified',
                cardPlanMonths: 12,
                libraryCardIssuedAt: now,
                libraryCardExpiresAt: expires,
            });
            await ensureApiKey(user._id);
            console.log(`[seed-test-student] Đã tạo GV: ${row.fullName} | ${email} | MSG ${staffId}`);
            created += 1;
        } else {
            const studentId = String(row.studentId).trim();
            const exists = await UserMongo.findOne({
                $or: [{ email }, { studentId }],
            })
                .select('_id')
                .lean();
            if (exists) {
                console.log(`[seed-test-student] Bỏ qua (email hoặc MSV đã tồn tại): ${email} | MSV ${studentId}`);
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
    }

    console.log('');
    console.log(`[seed-test-student] Tóm tắt seed: tạo mới=${created}, bỏ qua=${skipped}`);
}

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Thiếu MONGODB_URI trong file .env (thư mục server)');
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('[seed-test-student] Đã kết nối MongoDB\n');

    const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, bcrypt.genSaltSync(10));

    try {
        await unsetRedundantSparseNulls();
        await cleanupMockAndLegacy();
        await seedPtitAccounts(passwordHash);

        console.log('');
        console.log('========== DEMO PTIT (mật khẩu: 123456) ==========');
        for (const row of PTIT_SEED) {
            const tag = row.studentId ? `MSV ${row.studentId}` : `MSG ${row.staffId}`;
            console.log(`  ${row.fullName.padEnd(28)} ${row.email.padEnd(36)} ${tag}`);
        }
        console.log('==================================================');
        console.log('');
    } finally {
        await mongoose.disconnect();
    }
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[seed-test-student] Lỗi:', err.message);
        process.exit(1);
    });
