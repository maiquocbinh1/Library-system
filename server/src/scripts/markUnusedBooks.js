/**
 * Đánh dấu N đầu sách thành "ít tương tác" (0 lượt mượn trong 6 tháng gần nhất),
 * để xuất hiện trong báo cáo DSS "Sách ít tương tác" (Gợi ý thanh lý).
 *
 * Cách làm (không động đến sách / bản sao về mặt số lượng):
 *   - Chọn N sách ngẫu nhiên.
 *   - Mọi phiếu BORROWING/OVERDUE đang giữ bản sao của các sách đó:
 *       chuyển sang RETURNED (bookCopyIds=[]) với borrowDate/returnedAt > 6 tháng trước.
 *       → Bản sao trở lại AVAILABLE.
 *   - Mọi phiếu RETURNED của các sách đó trong 6 tháng gần nhất:
 *       đẩy borrowDate, returnedAt ra > 6 tháng để không tính là "tương tác gần".
 *   - Phạt UNPAID của những phiếu vừa đẩy: xoá để không lệch KPI thu hồi.
 *   - Sync stock cho các sách bị ảnh hưởng.
 *
 * Chạy:
 *   cd server
 *   node src/scripts/markUnusedBooks.js --confirm
 *
 * Tham số:
 *   --count=10   (mặc định 10)
 */

const mongoose = require('mongoose');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

function parseArgs() {
    const args = { count: 10, confirm: false };
    for (const a of process.argv.slice(2)) {
        if (a === '--confirm') args.confirm = true;
        else if (a.startsWith('--count=')) args.count = Math.max(1, Number(a.slice(8)) || 0);
    }
    return args;
}

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

async function run() {
    const args = parseArgs();
    if (!args.confirm) {
        console.error('Thêm --confirm. Lệnh: node src/scripts/markUnusedBooks.js --confirm [--count=10]');
        process.exit(1);
    }
    await connectSeedMongo();

    const allBooks = await BookMongo.find({}).select('_id bookCode title').lean();
    if (allBooks.length < args.count) {
        console.warn(`[mark-unused] Chỉ có ${allBooks.length} đầu sách, sẽ đánh dấu tất cả.`);
    }
    // Shuffle rồi chọn N
    for (let i = allBooks.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [allBooks[i], allBooks[j]] = [allBooks[j], allBooks[i]];
    }
    const picked = allBooks.slice(0, Math.min(args.count, allBooks.length));
    const pickedIds = picked.map((b) => b._id);

    console.log(`[mark-unused] Đã chọn ${picked.length} sách:`);
    picked.forEach((b, i) => {
        console.log(`  ${i + 1}. [${b.bookCode || '—'}] ${b.title}`);
    });

    const now = new Date();
    const sevenMonthsAgo = new Date(now);
    sevenMonthsAgo.setMonth(sevenMonthsAgo.getMonth() - 7);
    const tenMonthsAgo = new Date(now);
    tenMonthsAgo.setMonth(tenMonthsAgo.getMonth() - 10);

    function oldDate() {
        const t = tenMonthsAgo.getTime() + Math.random() * (sevenMonthsAgo.getTime() - tenMonthsAgo.getTime());
        const d = new Date(t);
        d.setHours(randInt(8, 17), 0, 0, 0);
        return d;
    }

    // 1. Tất cả phiếu BORROWING/OVERDUE giữ bản sao thuộc các sách đã chọn
    const openTickets = await LoanTicketMongo.find({
        bookId: { $in: pickedIds },
        status: { $in: ['BORROWING', 'OVERDUE'] },
    });

    const releasedCopyIds = [];
    const movedFineTicketIds = [];

    for (const t of openTickets) {
        const bd = oldDate();
        const due = new Date(bd);
        due.setDate(due.getDate() + 14);
        const ret = new Date(due);
        ret.setDate(ret.getDate() + randInt(0, 5));
        // Trả bản sao về AVAILABLE
        for (const cid of t.bookCopyIds || []) releasedCopyIds.push(cid);
        t.borrowDate = bd;
        t.dueDate = due;
        t.returnedAt = ret;
        t.status = 'RETURNED';
        t.bookCopyIds = [];
        t.updatedAt = ret;
        await t.save();
        movedFineTicketIds.push(t._id);
    }
    if (releasedCopyIds.length) {
        await BookCopyMongo.updateMany(
            { _id: { $in: releasedCopyIds } },
            { $set: { status: 'AVAILABLE' } },
        );
    }
    console.log(`[mark-unused] Đã đóng ${openTickets.length} phiếu mở (chuyển RETURNED và đẩy >7 tháng), giải phóng ${releasedCopyIds.length} bản sao.`);

    // 2. Phiếu RETURNED trong 6 tháng gần nhất của các sách này → đẩy borrowDate ra
    const sixMonthsAgo = new Date(now);
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const recentReturned = await LoanTicketMongo.find({
        bookId: { $in: pickedIds },
        status: 'RETURNED',
        borrowDate: { $gte: sixMonthsAgo },
    });
    for (const t of recentReturned) {
        const bd = oldDate();
        const due = new Date(bd);
        due.setDate(due.getDate() + 14);
        const ret = new Date(due);
        ret.setDate(ret.getDate() + randInt(0, 5));
        t.borrowDate = bd;
        t.dueDate = due;
        t.returnedAt = ret;
        t.updatedAt = ret;
        await t.save();
        movedFineTicketIds.push(t._id);
    }
    console.log(`[mark-unused] Đã đẩy ${recentReturned.length} phiếu RETURNED gần đây ra ngoài 6 tháng.`);

    // 3. Xóa fine UNPAID của những phiếu vừa đẩy (để KPI thu hồi không lệch)
    if (movedFineTicketIds.length) {
        const fineDel = await FineTicketMongo.deleteMany({
            loanTicketId: { $in: movedFineTicketIds },
            status: 'UNPAID',
        });
        console.log(`[mark-unused] Đã xóa ${fineDel.deletedCount} biên lai phạt UNPAID liên quan.`);
    }

    // 4. Sync inventory
    for (const b of picked) {
        await syncBookInventoryFields(b._id);
    }

    console.log('='.repeat(60));
    console.log(`Hoàn tất. ${picked.length} đầu sách giờ sẽ xuất hiện trong báo cáo "Sách ít tương tác".`);
    console.log('='.repeat(60));
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
