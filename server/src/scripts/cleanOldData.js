/**
 * Dọn DB:
 *  1) User có email mock user1@gmail.com … user18@gmail.com (trừ admin).
 *  2) Tài khoản “khách” (không MSV/MSG), trừ admin.
 *
 * Chạy từ thư mục server: node src/scripts/cleanOldData.js
 * (cần MONGODB_URI trong server/.env)
 */
const path = require('path');
const mongoose = require('mongoose');
const dotenv = require('dotenv');

const UserMongo = require('../models/user.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/** user1@gmail.com … user18@gmail.com */
const MOCK_USER_GMAIL_REGEX = /^user([1-9]|1[0-8])@gmail\.com$/i;

/** Không có studentId / staffId (null, thiếu field, hoặc chuỗi rỗng). */
function hasNoStudentId() {
    return {
        $or: [
            { studentId: null },
            { studentId: { $exists: false } },
            { studentId: '' },
        ],
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

/** Email dạng user1 … user18 @gmail (mock), luôn trừ admin. */
function mockNumberedGmailFilter() {
    return {
        role: { $ne: 'admin' },
        email: { $regex: MOCK_USER_GMAIL_REGEX },
    };
}

function mergeUsersById(arrays) {
    const map = new Map();
    for (const list of arrays) {
        for (const u of list) {
            map.set(String(u._id), u);
        }
    }
    return [...map.values()];
}

async function deleteUsersAndRelatedTickets(toRemove) {
    if (!toRemove.length) {
        return { users: 0, loans: 0, fines: 0 };
    }

    const idSet = new Set();
    for (const u of toRemove) {
        idSet.add(String(u._id));
        idSet.add(u.mysqlId);
    }
    const userKeys = [...idSet];

    const fineRes = await FineTicketMongo.deleteMany({ userId: { $in: userKeys } });
    const loanRes = await LoanTicketMongo.deleteMany({ userId: { $in: userKeys } });
    const userRes = await UserMongo.deleteMany({ _id: { $in: toRemove.map((u) => u._id) } });

    return {
        users: userRes.deletedCount,
        loans: loanRes.deletedCount,
        fines: fineRes.deletedCount,
    };
}

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        throw new Error('Thiếu MONGODB_URI trong .env');
    }

    await mongoose.connect(uri, { serverSelectionTimeoutMS: 20000 });
    console.log('[cleanOldData] Đã kết nối MongoDB\n');

    try {
        const select = '_id mysqlId email fullName role studentId staffId';

        const mockEmailUsers = await UserMongo.find(mockNumberedGmailFilter()).select(select).lean();
        const guestUsers = await UserMongo.find(guestLikeUserFilter()).select(select).lean();

        console.log(`[cleanOldData] Khớp email mock user1–user18@gmail.com: ${mockEmailUsers.length} user`);
        console.log(`[cleanOldData] Khách (không MSV & không MSG, trừ admin): ${guestUsers.length} user`);

        const toRemove = mergeUsersById([mockEmailUsers, guestUsers]);

        if (toRemove.length === 0) {
            console.log('\n[cleanOldData] Không có bản ghi nào cần xóa.');
            console.log('[cleanOldData] User=0, LoanTicket=0, FineTicket=0.');
            return;
        }

        console.log(`\n[cleanOldData] Tổng sau gộp (trùng _id chỉ xóa 1 lần): ${toRemove.length} user:`);
        for (const u of toRemove) {
            console.log(
                `  - _id=${u._id} | mysqlId=${u.mysqlId} | role=${u.role} | email=${u.email || ''}`,
            );
        }
        console.log('');

        const counts = await deleteUsersAndRelatedTickets(toRemove);

        console.log('[cleanOldData] Kết quả xóa:');
        console.log(`  - UserMongo:       ${counts.users}`);
        console.log(`  - LoanTicketMongo: ${counts.loans}`);
        console.log(`  - FineTicketMongo: ${counts.fines}`);
        console.log('\n[cleanOldData] Hoàn tất.');
    } finally {
        await mongoose.disconnect();
    }
}

run().catch((e) => {
    console.error('[cleanOldData] Lỗi:', e.message);
    process.exit(1);
});
