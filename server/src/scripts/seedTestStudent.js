/**
 * Tạo / cập nhật tài khoản sinh viên test để thử chức năng mượn sách.
 * Điều kiện mượn: có MSV, readerType, verificationStatus = verified (không pending).
 *
 * Chạy:  npm run seed:test-student
 * Hoặc:  node src/scripts/seedTestStudent.js
 *
 * Biến môi trường (tuỳ chọn):
 *   TEST_STUDENT_EMAIL, TEST_STUDENT_PASSWORD, TEST_STUDENT_MSV
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const UserMongo = require('../models/user.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');

dotenv.config();

function random36() {
    return crypto.randomUUID();
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

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Thiếu MONGODB_URI trong file .env');
    }

    const email = String(process.env.TEST_STUDENT_EMAIL || 'sv.test.ptit@student.ptit.edu.vn').toLowerCase();
    const password = String(process.env.TEST_STUDENT_PASSWORD || 'Student@123456');
    const msv = String(process.env.TEST_STUDENT_MSV || 'B22TESTPTIT2026').trim();

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });

    try {
        const clash = await UserMongo.findOne({ studentId: msv, email: { $ne: email } }).select('email').lean();
        if (clash) {
            throw new Error(`MSV "${msv}" đã được user khác dùng (${clash.email}). Đặt TEST_STUDENT_MSV khác.`);
        }

        const passwordHash = bcrypt.hashSync(password, bcrypt.genSaltSync(10));
        let user = await UserMongo.findOne({ email });

        if (!user) {
            user = await UserMongo.create({
                mysqlId: random36(),
                fullName: 'Sinh viên Test PTIT',
                phone: '0912345678',
                address: 'Hà Nội — tài khoản test mượn sách thư viện',
                email,
                password: passwordHash,
                typeLogin: 'email',
                role: 'user',
                readerType: 'SinhVien_ChinhQuy',
                studentId: msv,
                staffId: null,
                verificationStatus: 'verified',
            });
            console.log('[seed-test-student] Đã tạo user mới.');
        } else {
            user.fullName = user.fullName || 'Sinh viên Test PTIT';
            if (!user.phone) user.phone = '0912345678';
            if (!user.address) user.address = 'Hà Nội — tài khoản test mượn sách thư viện';
            user.password = passwordHash;
            user.role = 'user';
            user.readerType = 'SinhVien_ChinhQuy';
            user.studentId = msv;
            user.staffId = null;
            user.verificationStatus = 'verified';
            await user.save();
            console.log('[seed-test-student] Đã cập nhật user hiện có cùng email.');
        }

        await ensureApiKey(user._id);

        console.log('');
        console.log('========== TÀI KHOẢN SINH VIÊN TEST ==========');
        console.log('Đăng nhập tại trang /login (hoặc form đăng nhập):');
        console.log('  Email   :', email);
        console.log('  Mật khẩu:', password);
        console.log('  MSV     :', msv);
        console.log('  Loại    : SinhVien_ChinhQuy | Đã xác thực (verified)');
        console.log('============================================');
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
