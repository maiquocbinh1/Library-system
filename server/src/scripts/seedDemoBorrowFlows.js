/**
 * Tạo 3 tài khoản độc giả + lịch sử mượn phong phú (5 phiếu quá khứ đa luồng + 1 phiếu hiện tại).
 *
 * Chạy từ thư mục server: npm run seed:demo-borrow
 *
 * Kết nối MongoDB: dùng `mongoSeedConnect.js` (DNS 8.8.8.8 / 1.1.1.1 giống server).
 * Nếu vẫn lỗi: trong server/.env thêm một dòng MONGODB_SEED_FAMILY=4
 *
 * Tài khoản (mật khẩu 123456):
 *   nguyenvana@gmail.com — Nguyễn Văn A
 *   tranthanhb@gmail.com — Trần Thanh B
 *   nguyenvietc@gmail.com — Nguyễn Viết C
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');

const UserMongo = require('../models/user.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

const DEFAULT_PASSWORD = '123456';

const SEED_ACCOUNTS = [
    {
        email: 'nguyenvana@gmail.com',
        fullName: 'Nguyễn Văn A',
        studentId: 'B22SEEDVA001',
        phone: '0912345001',
        address: 'Hà Nội — KTX Mỹ Đình',
    },
    {
        email: 'tranthanhb@gmail.com',
        fullName: 'Trần Thanh B',
        studentId: 'B22SEEDTB002',
        phone: '0912345002',
        address: 'TP.HCM — KTX khu B',
    },
    {
        email: 'nguyenvietc@gmail.com',
        fullName: 'Nguyễn Viết C',
        studentId: 'B22SEEDVC003',
        phone: '0912345003',
        address: 'Đà Nẵng — Ký túc xá',
    },
];

const LEGACY_DEMO_EMAILS = [
    'demoflow.ui.1@qltv.localtest',
    'demoflow.ui.2@qltv.localtest',
    'demoflow.ui.3@qltv.localtest',
];

const ALL_CLEANUP_EMAILS = [...SEED_ACCOUNTS.map((a) => a.email), ...LEGACY_DEMO_EMAILS];

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

async function cleanupDemo() {
    const users = await UserMongo.find({ email: { $in: ALL_CLEANUP_EMAILS } }).select('_id mysqlId email').lean();
    if (!users.length) return;

    const idSet = new Set();
    for (const u of users) {
        idSet.add(String(u._id));
        if (u.mysqlId) idSet.add(String(u.mysqlId));
    }
    const keys = [...idSet];

    const oldTickets = await LoanTicketMongo.find({ userId: { $in: keys } }).select('bookCopyIds bookId').lean();
    const copyIds = [...new Set(oldTickets.flatMap((t) => (t.bookCopyIds || []).map((id) => String(id))))];
    const bookIds = [...new Set(oldTickets.map((t) => t.bookId).filter(Boolean).map((id) => String(id)))];

    if (copyIds.length) {
        const oids = copyIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
        await BookCopyMongo.updateMany({ _id: { $in: oids } }, { $set: { status: 'AVAILABLE' } });
    }
    for (const bid of bookIds) {
        if (mongoose.isValidObjectId(bid)) {
            await syncBookInventoryFields(new mongoose.Types.ObjectId(bid));
        }
    }

    await FineTicketMongo.deleteMany({ userId: { $in: keys } });
    await LoanTicketMongo.deleteMany({ userId: { $in: keys } });
    await UserMongo.deleteMany({ _id: { $in: users.map((u) => u._id) } });
    for (const u of users) {
        await ApiKeyMongo.deleteMany({ userId: String(u._id) });
    }
    console.log(`[seed-demo-borrow] Đã dọn dữ liệu seed cũ: ${users.length} user.\n`);
}

async function insertLoanRaw(doc) {
    const col = mongoose.connection.db.collection('loan_tickets');
    const createdAt = doc.createdAt || new Date();
    const updatedAt = doc.updatedAt || new Date();
    const r = await col.insertOne({
        mysqlId: doc.mysqlId,
        userId: doc.userId,
        fullName: doc.fullName,
        phone: doc.phone,
        address: doc.address,
        borrowDate: doc.borrowDate,
        dueDate: doc.dueDate ?? null,
        returnedAt: doc.returnedAt ?? null,
        status: doc.status,
        bookCopyIds: doc.bookCopyIds || [],
        bookId: doc.bookId,
        requestedQuantity: doc.requestedQuantity ?? 1,
        renewalCount: doc.renewalCount ?? 0,
        createdAt,
        updatedAt,
    });
    return r.insertedId;
}

async function pickOneAvailableCopy() {
    const c = await BookCopyMongo.findOne({ status: 'AVAILABLE' }).lean();
    if (!c) throw new Error('Không còn bản sách AVAILABLE trong kho.');
    return c;
}

async function pickTwoCopiesSameBook() {
    const rows = await BookCopyMongo.aggregate([
        { $match: { status: 'AVAILABLE' } },
        { $group: { _id: '$bookId', ids: { $push: '$_id' } } },
        { $match: { $expr: { $gte: [{ $size: '$ids' }, 2] } } },
        { $limit: 1 },
    ]);
    if (!rows.length) {
        throw new Error('Cần ít nhất một đầu sách có ≥ 2 bản AVAILABLE để tạo phiếu 2 cuốn.');
    }
    const pairIds = rows[0].ids.slice(0, 2);
    return BookCopyMongo.find({ _id: { $in: pairIds } }).lean();
}

async function syncBooksForCopies(copies) {
    const ids = [...new Set(copies.map((c) => String(c.bookId)))];
    for (const bid of ids) {
        if (mongoose.isValidObjectId(bid)) {
            await syncBookInventoryFields(new mongoose.Types.ObjectId(bid));
        }
    }
}

function calendarDaysLate(dueDate, returnAt) {
    const d0 = new Date(dueDate);
    d0.setHours(0, 0, 0, 0);
    const d1 = new Date(returnAt);
    d1.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((d1.getTime() - d0.getTime()) / 86400000));
}

const PAST_SCENARIOS_BY_USER = [
    [
        { type: 'RETURNED', qty: 1, borrowDaysAgo: 228, loanDays: 14, returnMode: 'on_time' },
        { type: 'RETURNED', qty: 2, borrowDaysAgo: 178, loanDays: 14, returnMode: 'late', lateDays: 6, fine: 'UNPAID' },
        { type: 'RETURNED', qty: 1, borrowDaysAgo: 142, loanDays: 21, returnMode: 'early', earlyDaysBeforeDue: 5 },
        { type: 'CANCELLED', qty: 1, borrowDaysAgo: 88 },
        { type: 'RETURNED', qty: 1, borrowDaysAgo: 58, loanDays: 7, returnMode: 'late', lateDays: 2, fine: 'PAID' },
    ],
    [
        { type: 'RETURNED', qty: 2, borrowDaysAgo: 215, loanDays: 14, returnMode: 'early', earlyDaysBeforeDue: 3 },
        { type: 'RETURNED', qty: 1, borrowDaysAgo: 168, loanDays: 14, returnMode: 'on_time' },
        { type: 'RETURNED', qty: 1, borrowDaysAgo: 122, loanDays: 10, returnMode: 'late', lateDays: 4, fine: 'UNPAID' },
        { type: 'RETURNED', qty: 2, borrowDaysAgo: 92, loanDays: 21, returnMode: 'on_time' },
        { type: 'CANCELLED', qty: 2, borrowDaysAgo: 40 },
    ],
    [
        { type: 'RETURNED', qty: 1, borrowDaysAgo: 240, loanDays: 14, returnMode: 'late', lateDays: 8, fine: 'PAID' },
        { type: 'RETURNED', qty: 2, borrowDaysAgo: 188, loanDays: 7, returnMode: 'on_time' },
        { type: 'RETURNED', qty: 1, borrowDaysAgo: 135, loanDays: 14, returnMode: 'early', earlyDaysBeforeDue: 7 },
        { type: 'CANCELLED', qty: 1, borrowDaysAgo: 72 },
        { type: 'RETURNED', qty: 1, borrowDaysAgo: 48, loanDays: 14, returnMode: 'late', lateDays: 1, fine: 'none' },
    ],
];

async function addPastScenarioTickets(userDoc, scenarios) {
    for (let i = 0; i < scenarios.length; i += 1) {
        const sc = scenarios[i];
        const borrowDate = new Date();
        borrowDate.setHours(10, 0, 0, 0);
        borrowDate.setDate(borrowDate.getDate() - sc.borrowDaysAgo);

        if (sc.type === 'CANCELLED') {
            const ref = await pickOneAvailableCopy();
            await insertLoanRaw({
                mysqlId: random36(),
                userId: String(userDoc._id),
                fullName: userDoc.fullName,
                phone: userDoc.phone,
                address: userDoc.address,
                borrowDate,
                dueDate: null,
                returnedAt: null,
                status: 'CANCELLED',
                bookCopyIds: [],
                bookId: ref.bookId,
                requestedQuantity: sc.qty || 1,
                createdAt: borrowDate,
                updatedAt: borrowDate,
            });
            continue;
        }

        const qty = sc.qty || 1;
        const copies = qty === 1 ? [await pickOneAvailableCopy()] : await pickTwoCopiesSameBook();
        const bookId = copies[0].bookId;
        for (const c of copies) {
            await BookCopyMongo.updateOne({ _id: c._id }, { $set: { status: 'BORROWED' } });
        }

        const loanDays = sc.loanDays ?? 14;
        const renewalCount = loanDays > 14 ? 1 : 0;
        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + loanDays);
        dueDate.setHours(0, 0, 0, 0);

        let returnedAt;
        if (sc.returnMode === 'on_time') {
            returnedAt = new Date(dueDate);
            returnedAt.setDate(returnedAt.getDate() - 1);
        } else if (sc.returnMode === 'early') {
            const n = sc.earlyDaysBeforeDue ?? 4;
            returnedAt = new Date(dueDate);
            returnedAt.setDate(returnedAt.getDate() - n);
        } else if (sc.returnMode === 'late') {
            const n = sc.lateDays ?? 5;
            returnedAt = new Date(dueDate);
            returnedAt.setDate(returnedAt.getDate() + n);
        } else {
            returnedAt = new Date(dueDate);
        }

        const ticketId = await insertLoanRaw({
            mysqlId: random36(),
            userId: String(userDoc._id),
            fullName: userDoc.fullName,
            phone: userDoc.phone,
            address: userDoc.address,
            borrowDate,
            dueDate,
            returnedAt,
            status: 'RETURNED',
            bookCopyIds: [],
            bookId,
            requestedQuantity: qty,
            renewalCount,
            createdAt: borrowDate,
            updatedAt: returnedAt,
        });

        if (sc.fine === 'UNPAID' || sc.fine === 'PAID') {
            const overdueDays = calendarDaysLate(dueDate, returnedAt);
            if (overdueDays > 0) {
                const rate = 1000;
                const fineAmount = overdueDays * rate * copies.length;
                await FineTicketMongo.create({
                    mysqlId: random36(),
                    loanTicketId: ticketId,
                    userId: String(userDoc._id),
                    studentId: userDoc.studentId || null,
                    overdueDays,
                    fineAmount,
                    status: sc.fine === 'PAID' ? 'PAID' : 'UNPAID',
                    reason: `Seed demo: trễ ${overdueDays} ngày, ${copies.length} cuốn`,
                });
            }
        }

        for (const c of copies) {
            await BookCopyMongo.updateOne({ _id: c._id }, { $set: { status: 'AVAILABLE' } });
        }
        await syncBooksForCopies(copies);
    }
}

async function addFinalTicketNguyenVanA(userDoc) {
    const c = await pickOneAvailableCopy();
    await insertLoanRaw({
        mysqlId: random36(),
        userId: String(userDoc._id),
        fullName: userDoc.fullName,
        phone: userDoc.phone,
        address: userDoc.address,
        borrowDate: new Date(),
        dueDate: null,
        status: 'PENDING_APPROVAL',
        bookCopyIds: [],
        bookId: c.bookId,
        requestedQuantity: 2,
    });
    console.log(`[seed-demo-borrow] ${userDoc.email}: +1 phiếu PENDING (2 cuốn — chờ thủ thư).`);
}

async function addFinalTicketTranThanhB(userDoc) {
    const copies = await pickTwoCopiesSameBook();
    const bookId = copies[0].bookId;
    const due = new Date();
    due.setHours(0, 0, 0, 0);
    due.setDate(due.getDate() + 14);
    for (const c of copies) {
        await BookCopyMongo.updateOne({ _id: c._id }, { $set: { status: 'BORROWED' } });
    }
    await insertLoanRaw({
        mysqlId: random36(),
        userId: String(userDoc._id),
        fullName: userDoc.fullName,
        phone: userDoc.phone,
        address: userDoc.address,
        borrowDate: new Date(),
        dueDate: due,
        status: 'BORROWING',
        bookCopyIds: copies.map((c) => c._id),
        bookId,
        requestedQuantity: 2,
    });
    await syncBooksForCopies(copies);
    console.log(`[seed-demo-borrow] ${userDoc.email}: +1 phiếu BORROWING (2 cuốn).`);
}

async function addFinalTicketNguyenVietC(userDoc) {
    const copies = [await pickOneAvailableCopy()];
    const bookId = copies[0].bookId;
    const duePast = new Date();
    duePast.setHours(0, 0, 0, 0);
    duePast.setDate(duePast.getDate() - 8);
    const borrowDate = new Date(duePast);
    borrowDate.setDate(borrowDate.getDate() - 10);

    await BookCopyMongo.updateOne({ _id: copies[0]._id }, { $set: { status: 'BORROWED' } });
    await insertLoanRaw({
        mysqlId: random36(),
        userId: String(userDoc._id),
        fullName: userDoc.fullName,
        phone: userDoc.phone,
        address: userDoc.address,
        borrowDate,
        dueDate: duePast,
        status: 'OVERDUE',
        bookCopyIds: [copies[0]._id],
        bookId,
        requestedQuantity: 1,
    });
    await syncBooksForCopies(copies);
    console.log(`[seed-demo-borrow] ${userDoc.email}: +1 phiếu OVERDUE (1 cuốn).`);
}

async function run() {
    await connectSeedMongo();
    console.log('[seed-demo-borrow] Đã kết nối MongoDB\n');

    await cleanupDemo();

    const availCount = await BookCopyMongo.countDocuments({ status: 'AVAILABLE' });
    if (availCount < 25) {
        throw new Error(
            `Kho AVAILABLE quá ít (${availCount}). Nên có ít nhất ~25 bản AVAILABLE để seed 3 user x 6 phiếu an toàn.`,
        );
    }

    const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, bcrypt.genSaltSync(10));
    const now = new Date();
    const cardUntil = new Date(now);
    cardUntil.setFullYear(cardUntil.getFullYear() + 1);

    const users = [];
    for (let i = 0; i < SEED_ACCOUNTS.length; i += 1) {
        const row = SEED_ACCOUNTS[i];
        const u = await UserMongo.create({
            mysqlId: random36(),
            fullName: row.fullName,
            phone: row.phone,
            address: row.address,
            email: row.email,
            password: passwordHash,
            typeLogin: 'email',
            role: 'user',
            readerType: 'SinhVien_ChinhQuy',
            studentId: row.studentId,
            verificationStatus: 'verified',
            cardPlanMonths: 12,
            libraryCardIssuedAt: now,
            libraryCardExpiresAt: cardUntil,
            className: 'D22-SEED-UI',
        });
        await ensureApiKey(u._id);
        users.push(u);
        console.log(`[seed-demo-borrow] Đã tạo user: ${row.email} | ${row.fullName} | MSV ${row.studentId}`);
    }

    await addPastScenarioTickets(users[0], PAST_SCENARIOS_BY_USER[0]);
    console.log(`[seed-demo-borrow] ${users[0].email}: 5 phiếu lịch sử (đa luồng).`);
    await addFinalTicketNguyenVanA(users[0]);

    await addPastScenarioTickets(users[1], PAST_SCENARIOS_BY_USER[1]);
    console.log(`[seed-demo-borrow] ${users[1].email}: 5 phiếu lịch sử.`);
    await addFinalTicketTranThanhB(users[1]);

    await addPastScenarioTickets(users[2], PAST_SCENARIOS_BY_USER[2]);
    console.log(`[seed-demo-borrow] ${users[2].email}: 5 phiếu lịch sử.`);
    await addFinalTicketNguyenVietC(users[2]);

    console.log('\n========== ĐĂNG NHẬP (mật khẩu: 123456) ==========');
    for (const row of SEED_ACCOUNTS) {
        console.log(`  ${row.email}`);
        console.log(`     Họ tên: ${row.fullName}`);
    }
    console.log('====================================================');
    console.log('Mỗi tài khoản: 6 phiếu — 5 quá khứ (đa dạng luồng) + 1 trạng thái hiện tại.');
}

run()
    .then(async () => {
        await disconnectSeedMongo();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('[seed-demo-borrow] Lỗi:', err.message);
        await disconnectSeedMongo().catch(() => {});
        process.exit(1);
    });
