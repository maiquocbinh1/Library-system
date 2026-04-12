const mongoose = require('mongoose');
const AdminMongo = require('../models/admin.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const { assignPatronCodeToUser, normalizeCode } = require('../utils/patronUser');

async function migrateLegacyPatronData() {
    const db = mongoose.connection.db;
    let codes = [];
    try {
        codes = await db.collection('library_reader_codes').find({}).toArray();
    } catch (e) {
        console.warn('[MongoDB] Không đọc được library_reader_codes (có thể đã xóa):', e.message);
    }

    for (const rc of codes) {
        if (!rc.userId) continue;
        const user = await UserMongo.findById(rc.userId).catch(() => null);
        if (!user) continue;
        const code = rc.readerCode ? normalizeCode(rc.readerCode) : '';
        if (!code) continue;
        if (user.studentId || user.staffId) continue;
        const readerTypeFromCard = rc.roleType === 'lecturer' ? 'GiangVien_CanBo' : 'SinhVien_ChinhQuy';
        assignPatronCodeToUser(user, code, readerTypeFromCard);
        if (rc.status === 'approved') user.verificationStatus = 'verified';
        user.birthDate = rc.birthDate ?? user.birthDate;
        user.className = rc.className ?? user.className;
        user.gender = rc.gender ?? user.gender;
        user.cardSystemType = rc.systemType ?? user.cardSystemType;
        user.cardPlanMonths = rc.planMonths ?? user.cardPlanMonths;
        user.libraryCardIssuedAt = rc.issuedAt ?? user.libraryCardIssuedAt;
        user.libraryCardExpiresAt = rc.expiresAt ?? user.libraryCardExpiresAt;
        try {
            await user.save();
        } catch (err) {
            console.warn('[MongoDB] Bỏ qua bản ghi reader trùng MSV/MSG:', err.message);
        }
    }

    const cursor = UserMongo.find({});
    for await (const u of cursor) {
        const legacy = u.idStudent != null ? String(u.idStudent).trim() : '';
        if (u.studentId || u.staffId) continue;
        if (!legacy) continue;
        if (legacy === '0') {
            if (u.verificationStatus !== 'pending') {
                u.verificationStatus = 'pending';
                await u.save().catch(() => {});
            }
            continue;
        }
        u.studentId = legacy;
        if (!u.readerType) u.readerType = 'SinhVien_ChinhQuy';
        u.verificationStatus = 'verified';
        try {
            await u.save();
        } catch (err) {
            console.warn('[MongoDB] migrate idStudent legacy:', err.message);
        }
    }
}

async function connectMongo() {
    const uri = process.env.MONGODB_URI;
    if (!uri || !uri.trim()) {
        return false;
    }

    try {
        await mongoose.connect(uri, {
            serverSelectionTimeoutMS: 20000,
        });
        try {
            await UserMongo.createCollection();
        } catch (createErr) {
            if (createErr?.code !== 48) {
                throw createErr;
            }
        }
        await UserMongo.syncIndexes();

        await migrateLegacyPatronData();

        try {
            await AdminMongo.createCollection();
        } catch (createErr) {
            if (createErr?.code !== 48) {
                throw createErr;
            }
        }
        await AdminMongo.syncIndexes();
        console.log('[MongoDB] Kết nối Atlas thành công');
        return true;
    } catch (err) {
        console.error('[MongoDB] Kết nối Atlas thất bại:', err.message);
        return false;
    }
}

module.exports = { connectMongo };
