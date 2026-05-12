/**
 * Chuẩn hóa dữ liệu demo:
 *   - Mỗi độc giả (role=user): tối đa 8 slot đang mở =
 *       PENDING_APPROVAL (requestedQuantity) + BORROWING/OVERDUE (|bookCopyIds|).
 *   - BORROWING còn hạn: dueDate ≤ borrowDate + 14 (+7 nếu đã gia hạn 1 lần); renewalCount > 1 → 1.
 *   - BORROWING mà hạn trả đã qua (theo ngày): chuyển OVERDUE, thêm phạt UNPAID nếu chưa có.
 *   - OVERDUE: không đổi borrowDate/dueDate; chỉ đóng phiếu khi cần giảm slot > 8.
 *
 *   node src/scripts/repairDemoLoanLimits.js --dry-run
 *   node src/scripts/repairDemoLoanLimits.js --confirm
 */

const crypto = require('crypto');
const mongoose = require('mongoose');
const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const UserMongo = require('../models/user.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

const MAX_SLOTS = 8;
const BASE_LOAN_DAYS = 14;
const RENEW_DAYS = 7;

function parseArgs() {
    const a = { dryRun: false, confirm: false };
    for (const x of process.argv.slice(2)) {
        if (x === '--dry-run') a.dryRun = true;
        if (x === '--confirm') a.confirm = true;
    }
    return a;
}

function patronKeys(user) {
    const s = new Set([String(user._id)]);
    if (user.mysqlId) s.add(String(user.mysqlId));
    return [...s];
}

function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

function maxDueForTicket(borrowDate, renewalCapped01) {
    const b = startOfDay(borrowDate);
    const d = new Date(b);
    d.setDate(d.getDate() + BASE_LOAN_DAYS + (renewalCapped01 >= 1 ? RENEW_DAYS : 0));
    d.setHours(0, 0, 0, 0);
    return d;
}

function ticketSlots(t) {
    if (t.status === 'PENDING_APPROVAL') return Number(t.requestedQuantity) || 0;
    if (t.status === 'BORROWING' || t.status === 'OVERDUE') return Array.isArray(t.bookCopyIds) ? t.bookCopyIds.length : 0;
    return 0;
}

async function computeSlots(userKeys) {
    const rows = await LoanTicketMongo.find({
        userId: { $in: userKeys },
        status: { $in: ['PENDING_APPROVAL', 'BORROWING', 'OVERDUE'] },
    })
        .select('_id status borrowDate dueDate bookCopyIds requestedQuantity renewalCount createdAt mysqlId')
        .lean();
    let n = 0;
    for (const t of rows) n += ticketSlots(t);
    return { n, rows };
}

async function closeOpenTicket(ticketLean, dryRun) {
    const copyIds = (ticketLean.bookCopyIds || []).filter(Boolean);
    const bookIds = new Set();
    if (!dryRun) {
        if (copyIds.length) {
            await BookCopyMongo.updateMany({ _id: { $in: copyIds } }, { $set: { status: 'AVAILABLE' } });
            for (const cid of copyIds) {
                const c = await BookCopyMongo.findById(cid).select('bookId').lean();
                if (c?.bookId) bookIds.add(String(c.bookId));
            }
        }
        await FineTicketMongo.deleteMany({ loanTicketId: ticketLean._id });
        await LoanTicketMongo.updateOne(
            { _id: ticketLean._id },
            {
                $set: {
                    status: 'RETURNED',
                    returnedAt: new Date(),
                    bookCopyIds: [],
                },
            },
        );
        for (const bid of bookIds) {
            if (mongoose.isValidObjectId(bid)) await syncBookInventoryFields(new mongoose.Types.ObjectId(bid));
        }
    }
    return copyIds.length || ticketSlots(ticketLean);
}

async function cancelPending(ticketLean, dryRun) {
    const q = Number(ticketLean.requestedQuantity) || 0;
    if (!dryRun) {
        await LoanTicketMongo.updateOne({ _id: ticketLean._id }, { $set: { status: 'CANCELLED' } });
    }
    return q;
}

async function repairUser(user, dryRun) {
    const keys = patronKeys(user);
    let { n, rows } = await computeSlots(keys);
    let closedTickets = 0;
    let cancelledPending = 0;
    let releasedCopies = 0;

    const borrowing = rows.filter((t) => t.status === 'BORROWING').sort((a, b) => new Date(b.borrowDate) - new Date(a.borrowDate));
    const pending = rows
        .filter((t) => t.status === 'PENDING_APPROVAL')
        .sort((a, b) => new Date(b.createdAt || b.borrowDate) - new Date(a.createdAt || a.borrowDate));
    const overdue = rows.filter((t) => t.status === 'OVERDUE').sort((a, b) => new Date(b.borrowDate) - new Date(a.borrowDate));

    while (n > MAX_SLOTS) {
        let freed = 0;
        if (borrowing.length) {
            const t = borrowing.shift();
            freed = await closeOpenTicket(t, dryRun);
            closedTickets += 1;
            releasedCopies += freed;
        } else if (pending.length) {
            const t = pending.shift();
            freed = await cancelPending(t, dryRun);
            cancelledPending += 1;
        } else if (overdue.length) {
            const t = overdue.shift();
            freed = await closeOpenTicket(t, dryRun);
            closedTickets += 1;
            releasedCopies += freed;
        } else {
            break;
        }
        n -= freed;
    }

    let clampedDue = 0;
    let promotedOverdue = 0;

    const refreshed = await LoanTicketMongo.find({
        userId: { $in: keys },
        status: 'BORROWING',
    }).lean();

    const today = startOfDay(new Date());
    for (const t of refreshed) {
        const renewRaw = Number(t.renewalCount) || 0;
        const renew = Math.min(Math.max(renewRaw, 0), 1);
        const maxDue = maxDueForTicket(t.borrowDate, renew);
        let due = t.dueDate ? startOfDay(t.dueDate) : maxDue;
        let needClamp = false;
        if (due > maxDue) {
            due = maxDue;
            needClamp = true;
        }
        const isPastDue = due < today;

        if (dryRun) {
            if (needClamp) clampedDue += 1;
            if (isPastDue) promotedOverdue += 1;
            continue;
        }

        if (isPastDue) {
            await LoanTicketMongo.updateOne(
                { _id: t._id },
                { $set: { status: 'OVERDUE', dueDate: due, renewalCount: renew } },
            );
            promotedOverdue += 1;
            const od = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
            if (od > 0) {
                const exists = await FineTicketMongo.findOne({ loanTicketId: t._id, status: 'UNPAID' }).lean();
                if (!exists) {
                    await FineTicketMongo.create({
                        mysqlId: crypto.randomUUID(),
                        loanTicketId: t._id,
                        userId: String(t.userId),
                        studentId: user.studentId || user.idStudent || null,
                        overdueDays: od,
                        fineAmount: od * 1000,
                        status: 'UNPAID',
                        reason: `Quá hạn ${od} ngày (repair demo)`,
                    });
                }
            }
        } else {
            if (needClamp || renewRaw !== renew) clampedDue += 1;
            await LoanTicketMongo.updateOne({ _id: t._id }, { $set: { dueDate: due, renewalCount: renew } });
        }
    }

    return { closedTickets, cancelledPending, releasedCopies, clampedDue, promotedOverdue };
}

async function run() {
    const args = parseArgs();
    if (!args.dryRun && !args.confirm) {
        console.error('Dùng --dry-run hoặc --confirm.');
        process.exit(1);
    }
    const dryRun = Boolean(args.dryRun && !args.confirm);

    await connectSeedMongo();
    const users = await UserMongo.find({ role: 'user' }).select('_id mysqlId studentId idStudent').lean();

    let over = 0;
    for (const u of users) {
        const { n } = await computeSlots(patronKeys(u));
        if (n > MAX_SLOTS) over += 1;
    }
    console.log(`[repair-loan-limits] Sinh viên có >${MAX_SLOTS} slot đang mở: ${over}`);

    let totClosed = 0;
    let totCancel = 0;
    let totReleased = 0;
    let totClamp = 0;
    let totPromote = 0;

    for (const u of users) {
        const r = await repairUser(u, dryRun);
        totClosed += r.closedTickets;
        totCancel += r.cancelledPending;
        totReleased += r.releasedCopies;
        totClamp += r.clampedDue;
        totPromote += r.promotedOverdue;
    }

    console.log(dryRun ? '[repair-loan-limits] DRY-RUN (không ghi DB).' : '[repair-loan-limits] Đã ghi DB.');
    console.log(`  Đóng phiếu BORROWING/OVERDUE: ${totClosed} (≈ ${totReleased} bản trả kho)`);
    console.log(`  Hủy phiếu PENDING: ${totCancel}`);
    console.log(`  Chỉnh hạn trả / renewal BORROWING: ${totClamp}`);
    console.log(`  BORROWING → OVERDUE (đã quá hạn lịch): ${totPromote}`);
}

run()
    .then(async () => {
        await disconnectSeedMongo();
        process.exit(0);
    })
    .catch(async (e) => {
        console.error(e);
        await disconnectSeedMongo().catch(() => {});
        process.exit(1);
    });
