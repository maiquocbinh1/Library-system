/**
 * Tạo hoặc cập nhật tài khoản admin (ghi đè mật khẩu).
 * Mặc định: a1@gmail.com / 123
 *
 * Tuỳ chọn .env hoặc biến môi trường:
 *   ADMIN_IMPORT_EMAIL, ADMIN_IMPORT_PASSWORD, ADMIN_IMPORT_FULLNAME
 *
 * Chạy: npm run seed:ensure-admin
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');

const UserMongo = require('../models/user.mongo.model');
const AdminMongo = require('../models/admin.mongo.model');

function random36() {
    return crypto.randomUUID();
}

async function run() {
    await connectSeedMongo();

    const adminEmail = String(process.env.ADMIN_IMPORT_EMAIL || 'a1@gmail.com').toLowerCase();
    const adminPassword = String(process.env.ADMIN_IMPORT_PASSWORD || '123');
    const adminFullName = String(process.env.ADMIN_IMPORT_FULLNAME || 'Trần Admin');

    try {
        const passwordHash = bcrypt.hashSync(adminPassword, bcrypt.genSaltSync(10));

        let user = await UserMongo.findOne({ email: adminEmail });
        if (!user) {
            user = await UserMongo.create({
                mysqlId: random36(),
                fullName: adminFullName,
                email: adminEmail,
                password: passwordHash,
                typeLogin: 'email',
                role: 'admin',
            });
            console.log(`[ensure-admin] Đã tạo user admin: ${adminEmail}`);
        } else {
            user.fullName = user.fullName || adminFullName;
            user.role = 'admin';
            user.password = passwordHash;
            user.typeLogin = 'email';
            await user.save();
            console.log(`[ensure-admin] Đã cập nhật admin (ghi đè mật khẩu): ${adminEmail}`);
        }

        const userId = String(user._id);
        let adminDoc = await AdminMongo.findOne({ userId });
        if (!adminDoc) {
            const dupEmail = await AdminMongo.findOne({ email: adminEmail });
            if (dupEmail && dupEmail.userId !== userId) {
                await AdminMongo.deleteOne({ _id: dupEmail._id });
                console.warn('[ensure-admin] Đã gỡ bản ghi admin trùng email (userId khác).');
            }
            await AdminMongo.create({
                mysqlId: random36(),
                userId,
                email: adminEmail,
                fullName: user.fullName || adminFullName,
                role: 'admin',
                isActive: true,
            });
            console.log('[ensure-admin] Đã tạo bản ghi collection admin.');
        } else {
            adminDoc.email = adminEmail;
            adminDoc.fullName = user.fullName || adminFullName;
            adminDoc.role = 'admin';
            adminDoc.isActive = true;
            await adminDoc.save();
            console.log('[ensure-admin] Đã đồng bộ bản ghi collection admin.');
        }

        console.log('-----------------------------------------');
        console.log(`Đăng nhập: ${adminEmail}`);
        console.log(`Mật khẩu: ${adminPassword}`);
    } finally {
        await disconnectSeedMongo();
    }
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[ensure-admin] Lỗi:', err.message);
        process.exit(1);
    });
