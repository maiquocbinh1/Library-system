/**
 * Cân chỉnh dữ liệu demo để KPI dashboard đẹp hơn, mô phỏng một thư viện vận hành tốt:
 *   - Tỷ lệ khai thác kho sách:  ≈ 50%  (BORROWED / total copies)
 *   - Tỷ lệ quá hạn:             ≈ 40%  (OVERDUE / (BORROWING + OVERDUE))
 *   - Thu hồi nợ phạt (PAID):    ≈ 80%  (số tiền PAID / tổng tiền phạt)
 *
 * Script:
 *   1. Đếm tổng copies, tổng phiếu đang mở (BORROWING + OVERDUE).
 *   2. Tạo thêm phiếu BORROWING / OVERDUE để chạm target.
 *      Phiếu mới gán cho sinh viên thật (role=user) và bản sao AVAILABLE.
 *      Bản sao đó chuyển sang BORROWED.
 *   3. Cập nhật FineTicket: 80% PAID / 20% UNPAID (giữ nguyên fineAmount/overdueDays).
 *   4. Đồng bộ stock / totalCopies cho mọi sách bị ảnh hưởng.
 *
 *   Không động đến: tài khoản admin, sách, các phiếu RETURNED / CANCELLED.
 *
 * Chạy:
 *   cd server
 *   node src/scripts/rebalanceDemoKpis.js --confirm
 *
 * Tham số tùy chọn:
 *   --util=50      (% khai thác kho mục tiêu)
 *   --overdue=40   (% phiếu mở là OVERDUE)
 *   --collect=80   (% biên lai phạt đã PAID)
 */

const crypto = require('crypto');
const mongoose = require('mongoose');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const UserMongo = require('../models/user.mongo.model');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

function random36() {
    return crypto.randomUUID();
}

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function calendarDaysLate(dueDate, returnAt) {
    const d0 = new Date(dueDate);
    d0.setHours(0, 0, 0, 0);
    const d1 = new Date(returnAt);
    d1.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((d1.getTime() - d0.getTime()) / 86400000));
}

function parseArgs() {
    const args = { util: 50, overdue: 40, collect: 80, confirm: false };
    for (const a of process.argv.slice(2)) {
        if (a === '--confirm') args.confirm = true;
        else if (a.startsWith('--util=')) args.util = Math.max(0, Math.min(100, Number(a.slice(7)) || 0));
        else if (a.startsWith('--overdue=')) args.overdue = Math.max(0, Math.min(100, Number(a.slice(10)) || 0));
        else if (a.startsWith('--collect=')) args.collect = Math.max(0, Math.min(100, Number(a.slice(10)) || 0));
    }
    return args;
}

async function rebalanceUtilization(targetUtilPercent, overduePercent) {
    const totalCopies = await BookCopyMongo.countDocuments({});
    const targetBorrowed = Math.round((totalCopies * targetUtilPercent) / 100);
    const currentBorrowed = await BookCopyMongo.countDocuments({ status: 'BORROWED' });
    const need = targetBorrowed - currentBorrowed;
    console.log(`[rebalance] Kho: ${totalCopies} bản, đang BORROWED ${currentBorrowed}, mục tiêu ${targetBorrowed} → cần thêm ${need}.`);
    if (need <= 0) {
        console.log('[rebalance] Đã đủ hoặc dư, không thêm phiếu mới.');
        return { addedTickets: 0, affectedBookIds: new Set(), addedFines: 0 };
    }

    // Hiện trạng phiếu mở
    const curBorrowing = await LoanTicketMongo.countDocuments({ status: 'BORROWING' });
    const curOverdue = await LoanTicketMongo.countDocuments({ status: 'OVERDUE' });
    const targetOverdue = Math.round((targetBorrowed * overduePercent) / 100);
    const targetBorrowing = targetBorrowed - targetOverdue;
    const needOverdue = Math.max(0, targetOverdue - curOverdue);
    const needBorrowing = Math.max(0, targetBorrowing - curBorrowing);
    console.log(`[rebalance] Phiếu mở: BORROWING ${curBorrowing} → ${targetBorrowing} (+${needBorrowing}), OVERDUE ${curOverdue} → ${targetOverdue} (+${needOverdue}).`);

    // Lấy user role=user (sinh viên)
    const students = await UserMongo.find({ role: 'user' }).select('_id mysqlId fullName phone studentId').lean();
    if (!students.length) throw new Error('Không có sinh viên trong DB.');

    // Lấy copy AVAILABLE
    const availCopies = await BookCopyMongo.find({ status: 'AVAILABLE' })
        .select('_id bookId barcode')
        .lean();
    if (availCopies.length < need) {
        console.warn(`[rebalance] Không đủ bản AVAILABLE (${availCopies.length}) để đạt mục tiêu ${need}. Sẽ làm hết khả năng.`);
    }
    // Shuffle để đa dạng
    for (let i = availCopies.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [availCopies[i], availCopies[j]] = [availCopies[j], availCopies[i]];
    }

    const now = new Date();
    const loans = [];
    const fines = [];
    const updateCopyIds = [];
    const affectedBookIds = new Set();

    /** Slot đang mở theo userId (string) — không vượt quá 8 / độc giả. */
    const activeSlots = new Map();
    async function refreshActiveSlots() {
        activeSlots.clear();
        const open = await LoanTicketMongo.find({
            status: { $in: ['PENDING_APPROVAL', 'BORROWING', 'OVERDUE'] },
        })
            .select('userId status requestedQuantity bookCopyIds')
            .lean();
        for (const t of open) {
            const k = String(t.userId);
            let add = 0;
            if (t.status === 'PENDING_APPROVAL') add = Number(t.requestedQuantity) || 0;
            else add = Array.isArray(t.bookCopyIds) ? t.bookCopyIds.length : 0;
            activeSlots.set(k, (activeSlots.get(k) || 0) + add);
        }
    }
    await refreshActiveSlots();

    function canTake(studentIdStr, qty) {
        return (activeSlots.get(studentIdStr) || 0) + qty <= 8;
    }
    function registerTake(studentIdStr, qty) {
        activeSlots.set(studentIdStr, (activeSlots.get(studentIdStr) || 0) + qty);
    }

    function pickStudentWithRoom() {
        const shuffled = [...students];
        for (let i = shuffled.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        for (const s of shuffled) {
            if (canTake(String(s._id), 1)) return s;
        }
        return null;
    }

    let copyCursor = 0;
    function nextCopy() {
        if (copyCursor >= availCopies.length) return null;
        return availCopies[copyCursor++];
    }

    function makeBorrowingTicket(student, copy) {
        const borrowDate = new Date(now);
        borrowDate.setDate(borrowDate.getDate() - randInt(0, 12));
        borrowDate.setHours(randInt(8, 17), 0, 0, 0);
        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + 14);
        dueDate.setHours(0, 0, 0, 0);
        return {
            _id: new mongoose.Types.ObjectId(),
            mysqlId: random36(),
            userId: String(student._id),
            fullName: student.fullName,
            phone: student.phone || null,
            address: '',
            borrowDate,
            dueDate,
            returnedAt: null,
            status: 'BORROWING',
            bookCopyIds: [copy._id],
            bookId: copy.bookId,
            requestedQuantity: 1,
            renewalCount: 0,
            createdAt: borrowDate,
            updatedAt: borrowDate,
        };
    }

    function makeOverdueTicket(student, copy) {
        const overdueDays = randInt(1, 60);
        const borrowDate = new Date(now);
        borrowDate.setDate(borrowDate.getDate() - (14 + overdueDays));
        borrowDate.setHours(randInt(8, 17), 0, 0, 0);
        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + 14);
        dueDate.setHours(0, 0, 0, 0);
        return {
            ticket: {
                _id: new mongoose.Types.ObjectId(),
                mysqlId: random36(),
                userId: String(student._id),
                fullName: student.fullName,
                phone: student.phone || null,
                address: '',
                borrowDate,
                dueDate,
                returnedAt: null,
                status: 'OVERDUE',
                bookCopyIds: [copy._id],
                bookId: copy.bookId,
                requestedQuantity: 1,
                renewalCount: 0,
                createdAt: borrowDate,
                updatedAt: now,
            },
            overdueDays: calendarDaysLate(dueDate, now),
        };
    }

    let actuallyAddedBorrowing = 0;
    let actuallyAddedOverdue = 0;

    for (let i = 0; i < needBorrowing; i += 1) {
        const copy = nextCopy();
        if (!copy) break;
        const student = pickStudentWithRoom();
        if (!student) {
            console.warn('[rebalance] Không còn độc giả nào dưới ngưỡng 8 slot — dừng thêm BORROWING.');
            break;
        }
        loans.push(makeBorrowingTicket(student, copy));
        updateCopyIds.push(copy._id);
        affectedBookIds.add(String(copy.bookId));
        registerTake(String(student._id), 1);
        actuallyAddedBorrowing += 1;
    }

    for (let i = 0; i < needOverdue; i += 1) {
        const copy = nextCopy();
        if (!copy) break;
        const student = pickStudentWithRoom();
        if (!student) {
            console.warn('[rebalance] Không còn độc giả nào dưới ngưỡng 8 slot — dừng thêm OVERDUE.');
            break;
        }
        const { ticket, overdueDays } = makeOverdueTicket(student, copy);
        loans.push(ticket);
        updateCopyIds.push(copy._id);
        affectedBookIds.add(String(copy.bookId));
        registerTake(String(student._id), 1);

        // Mỗi phiếu OVERDUE tạo 1 fine UNPAID (sẽ được balance lại ở bước collect)
        fines.push({
            mysqlId: random36(),
            loanTicketId: ticket._id,
            userId: ticket.userId,
            studentId: student.studentId || null,
            overdueDays: Math.max(1, overdueDays),
            fineAmount: Math.max(1000, overdueDays * 1000),
            status: 'UNPAID',
            reason: `Quá hạn ${overdueDays} ngày chưa trả`,
            createdAt: now,
            updatedAt: now,
        });
        actuallyAddedOverdue += 1;
    }

    console.log(`[rebalance] Đã chuẩn bị ${actuallyAddedBorrowing} BORROWING + ${actuallyAddedOverdue} OVERDUE = ${loans.length} phiếu, ${fines.length} biên lai phạt mới.`);

    const BATCH = 500;
    for (let i = 0; i < loans.length; i += BATCH) {
        await LoanTicketMongo.insertMany(loans.slice(i, i + BATCH), { ordered: false });
    }
    if (fines.length) {
        for (let i = 0; i < fines.length; i += BATCH) {
            await FineTicketMongo.insertMany(fines.slice(i, i + BATCH), { ordered: false });
        }
    }
    if (updateCopyIds.length) {
        await BookCopyMongo.updateMany({ _id: { $in: updateCopyIds } }, { $set: { status: 'BORROWED' } });
    }

    return { addedTickets: loans.length, affectedBookIds, addedFines: fines.length };
}

async function rebalanceFineCollection(targetPaidPercent) {
    const all = await FineTicketMongo.find({}).select('_id status').lean();
    if (!all.length) {
        console.log('[rebalance] Không có biên lai phạt nào.');
        return { paid: 0, unpaid: 0 };
    }
    // Shuffle
    for (let i = all.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [all[i], all[j]] = [all[j], all[i]];
    }
    const paidCount = Math.round((all.length * targetPaidPercent) / 100);
    const paidIds = all.slice(0, paidCount).map((f) => f._id);
    const unpaidIds = all.slice(paidCount).map((f) => f._id);

    if (paidIds.length) {
        await FineTicketMongo.updateMany({ _id: { $in: paidIds } }, { $set: { status: 'PAID' } });
    }
    if (unpaidIds.length) {
        await FineTicketMongo.updateMany({ _id: { $in: unpaidIds } }, { $set: { status: 'UNPAID' } });
    }
    console.log(`[rebalance] Đã set ${paidIds.length} PAID + ${unpaidIds.length} UNPAID (${targetPaidPercent}% PAID).`);
    return { paid: paidIds.length, unpaid: unpaidIds.length };
}

async function printFinalKpis() {
    const totalCopies = await BookCopyMongo.countDocuments({});
    const borrowed = await BookCopyMongo.countDocuments({ status: 'BORROWED' });
    const util = totalCopies ? ((borrowed / totalCopies) * 100).toFixed(1) : 0;

    const borrowing = await LoanTicketMongo.countDocuments({ status: 'BORROWING' });
    const overdue = await LoanTicketMongo.countDocuments({ status: 'OVERDUE' });
    const overdueRate = (borrowing + overdue) ? ((overdue / (borrowing + overdue)) * 100).toFixed(1) : 0;

    const [paidAgg, unpaidAgg] = await Promise.all([
        FineTicketMongo.aggregate([
            { $match: { status: 'PAID' } },
            { $group: { _id: null, total: { $sum: '$fineAmount' } } },
        ]),
        FineTicketMongo.aggregate([
            { $match: { status: 'UNPAID' } },
            { $group: { _id: null, total: { $sum: '$fineAmount' } } },
        ]),
    ]);
    const paidVnd = paidAgg[0]?.total || 0;
    const unpaidVnd = unpaidAgg[0]?.total || 0;
    const collectRate = (paidVnd + unpaidVnd) ? ((paidVnd / (paidVnd + unpaidVnd)) * 100).toFixed(1) : 0;

    console.log('='.repeat(60));
    console.log('KPI SAU CÂN CHỈNH');
    console.log('='.repeat(60));
    console.log(`  Tỷ lệ khai thác kho:  ${util}%  (${borrowed}/${totalCopies} bản BORROWED)`);
    console.log(`  Tỷ lệ quá hạn:        ${overdueRate}%  (${overdue}/${borrowing + overdue} phiếu mở là OVERDUE)`);
    console.log(`  Thu hồi nợ phạt:      ${collectRate}%  (PAID ${paidVnd.toLocaleString('vi-VN')}đ / UNPAID ${unpaidVnd.toLocaleString('vi-VN')}đ)`);
    console.log('='.repeat(60));
}

async function run() {
    const args = parseArgs();
    if (!args.confirm) {
        console.error('Thêm --confirm. Lệnh đầy đủ: node src/scripts/rebalanceDemoKpis.js --confirm');
        process.exit(1);
    }
    await connectSeedMongo();

    const { affectedBookIds } = await rebalanceUtilization(args.util, args.overdue);
    await rebalanceFineCollection(args.collect);

    if (affectedBookIds && affectedBookIds.size) {
        console.log(`[rebalance] Đồng bộ stock cho ${affectedBookIds.size} sách bị thay đổi...`);
        for (const bid of affectedBookIds) {
            if (mongoose.isValidObjectId(bid)) {
                await syncBookInventoryFields(new mongoose.Types.ObjectId(bid));
            }
        }
    }

    await printFinalKpis();
}

run()
    .then(async () => {
        await disconnectSeedMongo();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('Lỗi:', err);
        await disconnectSeedMongo().catch(() => {});
        process.exit(1);
    });
