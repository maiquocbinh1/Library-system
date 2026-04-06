const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const UserMongo = require('../models/user.mongo.model');
const AdminMongo = require('../models/admin.mongo.model');

dotenv.config();

function random36() {
    return crypto.randomUUID();
}

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Thiếu MONGODB_URI trong file .env');
    }

    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@ptit.edu.vn').toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || 'Admin@123456');
    const adminFullName = String(process.env.ADMIN_FULLNAME || 'Quản trị hệ thống');

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });

    try {
        let user = await UserMongo.findOne({ email: adminEmail });

        if (!user) {
            const passwordHash = bcrypt.hashSync(adminPassword, bcrypt.genSaltSync(10));
            user = await UserMongo.create({
                mysqlId: random36(),
                fullName: adminFullName,
                email: adminEmail,
                password: passwordHash,
                typeLogin: 'email',
                role: 'admin',
            });
            console.log(`[seed-admin] Đã tạo user admin mới: ${adminEmail}`);
        } else if (user.role !== 'admin') {
            user.role = 'admin';
            await user.save();
            console.log(`[seed-admin] Đã nâng quyền admin cho user: ${adminEmail}`);
        } else {
            console.log(`[seed-admin] User admin đã tồn tại: ${adminEmail}`);
        }

        const userId = String(user._id);
        const adminDoc = await AdminMongo.findOne({ userId });
        if (!adminDoc) {
            await AdminMongo.create({
                mysqlId: random36(),
                userId,
                email: adminEmail,
                fullName: user.fullName || adminFullName,
                role: 'admin',
                isActive: true,
            });
            console.log('[seed-admin] Đã tạo bản ghi trong collection admin');
        } else {
            console.log('[seed-admin] Bản ghi admin đã tồn tại');
        }

        console.log('-----------------------------------------');
        console.log(`Email đăng nhập admin: ${adminEmail}`);
        console.log(`Mật khẩu admin: ${adminPassword}`);
        console.log('Vui lòng đổi mật khẩu sau khi đăng nhập.');
    } finally {
        await mongoose.disconnect();
    }
}

run()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error('[seed-admin] Lỗi:', error.message);
        process.exit(1);
    });
