/**
 * Giữ đúng: 1 admin (theo .env / mặc định seedAdmin) + 3 độc giả demo A/B/C.
 * Xóa mọi user khác; xóa phiếu mượn + phạt + API key của các user bị xóa.
 * Khôi phục mật khẩu admin về giống seedAdmin (ADMIN_PASSWORD || Admin@123456).
 *
 *   cd server
 *   node src/scripts/cleanupUsersKeepDemoAdmin.js --confirm
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');

const UserMongo = require('../models/user.mongo.model');
const AdminMongo = require('../models/admin.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');

function random36() {
    return crypto.randomUUID();
}

const DEMO_EMAILS = [
    'nguyenvana@gmail.com',
    'tranthanhb@gmail.com',
    'nguyenvietc@gmail.com',
];

async function run() {
    if (!process.argv.includes('--confirm')) {
        console.error('Thêm --confirm để chạy (sẽ xóa user không thuộc admin + 3 demo).');
        process.exit(1);
    }

    await connectSeedMongo();

    const adminEmail = String(process.env.ADMIN_EMAIL || 'admin@ptit.edu.vn').toLowerCase();
    const adminPassword = String(process.env.ADMIN_PASSWORD || 'Admin@123456');
    const adminFullName = String(process.env.ADMIN_FULLNAME || 'Mai Van B');

    const keep = new Set([adminEmail, ...DEMO_EMAILS.map((e) => e.toLowerCase())]);

    const allUsers = await UserMongo.find({}).select('_id mysqlId email role').lean();
    const toDelete = allUsers.filter((u) => !keep.has(String(u.email || '').toLowerCase()));

    if (!toDelete.length) {
        console.log('[cleanup-users] Không có user thừa để xóa.');
    } else {
        const idSet = new Set();
        for (const u of toDelete) {
            idSet.add(String(u._id));
            if (u.mysqlId) idSet.add(String(u.mysqlId));
        }
        const keys = [...idSet];

        await FineTicketMongo.deleteMany({ userId: { $in: keys } });
        await LoanTicketMongo.deleteMany({ userId: { $in: keys } });
        for (const u of toDelete) {
            await ApiKeyMongo.deleteMany({ userId: String(u._id) });
        }
        await UserMongo.deleteMany({ _id: { $in: toDelete.map((u) => u._id) } });
        console.log(`[cleanup-users] Đã xóa ${toDelete.length} user (và phiếu/phạt/key liên quan).`);
    }

    let adminUser = await UserMongo.findOne({ email: adminEmail });
    const passwordHash = bcrypt.hashSync(adminPassword, bcrypt.genSaltSync(10));

    if (!adminUser) {
        adminUser = await UserMongo.create({
            mysqlId: random36(),
            fullName: adminFullName,
            email: adminEmail,
            password: passwordHash,
            typeLogin: 'email',
            role: 'admin',
        });
        console.log(`[cleanup-users] Đã tạo lại admin: ${adminEmail}`);
    } else {
        adminUser.role = 'admin';
        adminUser.password = passwordHash;
        adminUser.fullName = adminFullName;
        adminUser.typeLogin = 'email';
        await adminUser.save();
        console.log(`[cleanup-users] Đã khôi phục admin (${adminEmail}) — mật khẩu theo ADMIN_PASSWORD hoặc mặc định seed.`);
    }

    const adminUserId = String(adminUser._id);
    await AdminMongo.deleteMany({ userId: { $ne: adminUserId } });
    const adm = await AdminMongo.findOne({ userId: adminUserId });
    if (!adm) {
        await AdminMongo.create({
            mysqlId: random36(),
            userId: adminUserId,
            email: adminEmail,
            fullName: adminUser.fullName || adminFullName,
            role: 'admin',
            isActive: true,
        });
        console.log('[cleanup-users] Đã tạo bản ghi collection admin.');
    } else {
        adm.email = adminEmail;
        adm.fullName = adminUser.fullName || adminFullName;
        adm.isActive = true;
        await adm.save();
        console.log('[cleanup-users] Đã đồng bộ bản ghi collection admin.');
    }

    const remaining = await UserMongo.countDocuments({});
    console.log('-----------------------------------------');
    console.log(`Tổng user còn lại: ${remaining} (admin + 3 demo).`);
    console.log(`Admin: ${adminEmail} / ${adminPassword}`);
    console.log('Demo: nguyenvana@gmail.com, tranthanhb@gmail.com, nguyenvietc@gmail.com / 123456');
    console.log('-----------------------------------------');
}

run()
    .then(async () => {
        await disconnectSeedMongo();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('[cleanup-users] Lỗi:', err);
        await disconnectSeedMongo().catch(() => {});
        process.exit(1);
    });
