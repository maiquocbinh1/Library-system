const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const BookMongo = require('../models/book.mongo.model');

/**
 * KPI 1: Tỷ lệ khai thác kho sách
 * (số bản sao đang borrowed / tổng bản sao) * 100
 */
async function getUtilizationRate() {
    const total = await BookCopyMongo.countDocuments({});
    if (!total) return 0;
    const borrowed = await BookCopyMongo.countDocuments({ status: 'BORROWED' });
    return Math.round((borrowed / total) * 100 * 10) / 10;
}

/**
 * KPI 2: Tỷ lệ độc giả tích cực (30 ngày gần nhất)
 */
async function getActiveUserRate() {
    const totalUsers = await UserMongo.countDocuments({ role: 'user' });
    if (!totalUsers) return 0;
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const activeIds = await LoanTicketMongo.distinct('userId', {
        borrowDate: { $gte: thirtyDaysAgo },
    });
    return Math.round((activeIds.length / totalUsers) * 100 * 10) / 10;
}

/**
 * KPI 3: Tỷ lệ quá hạn
 */
async function getOverdueRate() {
    const now = new Date();
    const active = await LoanTicketMongo.countDocuments({ status: { $in: ['BORROWING', 'OVERDUE'] } });
    if (!active) return 0;
    const overdue = await LoanTicketMongo.countDocuments({
        status: { $in: ['BORROWING', 'OVERDUE'] },
        dueDate: { $ne: null, $lt: now },
    });
    return Math.round((overdue / active) * 100 * 10) / 10;
}

/**
 * KPI 4: Tài chính — đã thu + chưa thu
 */
async function getFinancialKpi() {
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
    return {
        collected: paidAgg[0]?.total || 0,
        outstanding: unpaidAgg[0]?.total || 0,
    };
}

/**
 * Tổng hợp tất cả EIS KPIs
 */
async function getAllEisKpis() {
    const [utilization_rate, active_user_rate, overdue_rate, financial] = await Promise.all([
        getUtilizationRate(),
        getActiveUserRate(),
        getOverdueRate(),
        getFinancialKpi(),
    ]);
    return { utilization_rate, active_user_rate, overdue_rate, financial };
}

/**
 * DSS: Xu hướng mượn theo thể loại
 */
async function getCategoryTrends(period = 'all') {
    const matchStage = { status: { $in: ['BORROWING', 'RETURNED', 'OVERDUE'] } };
    if (period !== 'all') {
        const days = period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
        matchStage.borrowDate = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }

    const BookCopyMongo = require('../models/bookCopy.mongo.model');
    const tickets = await LoanTicketMongo.find(matchStage).lean();
    const copyIds = tickets.flatMap((t) => t.bookCopyIds || []);

    const copies = await BookCopyMongo.find({ _id: { $in: copyIds } }).lean();
    const copyMap = new Map(copies.map((c) => [String(c._id), c]));

    const bookIds = [...new Set(copies.map((c) => String(c.bookId || c.mysqlId)).filter(Boolean))];
    const books = await BookMongo.find({
        $or: [{ _id: { $in: bookIds } }, { mysqlId: { $in: bookIds } }],
    }).lean();
    const bookMap = new Map();
    for (const b of books) {
        bookMap.set(String(b._id), b);
        if (b.mysqlId) bookMap.set(String(b.mysqlId), b);
    }

    const categoryCount = {};
    for (const ticket of tickets) {
        for (const copyId of ticket.bookCopyIds || []) {
            const copy = copyMap.get(String(copyId));
            if (!copy) continue;
            const book = bookMap.get(String(copy.bookId)) || bookMap.get(String(copy.mysqlId || ''));
            const cat = (book?.category_1 || book?.category || 'Khác').trim();
            categoryCount[cat] = (categoryCount[cat] || 0) + 1;
        }
    }

    const sorted = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]);
    return {
        labels: sorted.map(([k]) => k),
        data: sorted.map(([, v]) => v),
    };
}

/**
 * DSS: Drill-down — Top 5 sách của thể loại
 */
async function getDrilldown(category, period = 'all') {
    const matchStage = { status: { $in: ['BORROWING', 'RETURNED', 'OVERDUE'] } };
    if (period !== 'all') {
        const days = period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
        matchStage.borrowDate = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }

    const tickets = await LoanTicketMongo.find(matchStage).lean();
    const copyIds = tickets.flatMap((t) => t.bookCopyIds || []);

    const copies = await BookCopyMongo.find({ _id: { $in: copyIds } }).lean();
    const copyMap = new Map(copies.map((c) => [String(c._id), c]));

    const bookIds = [...new Set(copies.map((c) => String(c.bookId || c.mysqlId)).filter(Boolean))];
    const books = await BookMongo.find({
        $or: [{ _id: { $in: bookIds } }, { mysqlId: { $in: bookIds } }],
    }).lean();
    const bookMap = new Map();
    for (const b of books) {
        bookMap.set(String(b._id), b);
        if (b.mysqlId) bookMap.set(String(b.mysqlId), b);
    }

    const titleCount = {};
    for (const ticket of tickets) {
        for (const copyId of ticket.bookCopyIds || []) {
            const copy = copyMap.get(String(copyId));
            if (!copy) continue;
            const book = bookMap.get(String(copy.bookId)) || bookMap.get(String(copy.mysqlId || ''));
            if (!book) continue;
            const cat = (book?.category_1 || book?.category || 'Khác').trim();
            if (cat !== category) continue;
            const title = book.title || book.nameProduct || 'Không rõ';
            titleCount[title] = (titleCount[title] || 0) + 1;
        }
    }

    return Object.entries(titleCount)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([title, count]) => ({ title, count }));
}

/**
 * DSS: What-If mô phỏng chính sách phạt
 */
async function getWhatIfAnalysis(maxDays, fineRate, period = 'all') {
    const matchStage = { status: 'RETURNED' };
    if (period !== 'all') {
        const days = period === 'month' ? 30 : period === 'quarter' ? 90 : 365;
        matchStage.borrowDate = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }

    const tickets = await LoanTicketMongo.find(matchStage).lean();

    let baselineRevenue = 0;
    let projectedRevenue = 0;

    const fines = await FineTicketMongo.find({
        loanTicketId: { $in: tickets.map((t) => t._id) },
    }).lean();
    const fineByTicket = new Map();
    for (const f of fines) {
        fineByTicket.set(String(f.loanTicketId), f.fineAmount || 0);
    }

    for (const t of tickets) {
        baselineRevenue += fineByTicket.get(String(t._id)) || 0;

        const returnDate = t.returnedAt;
        const borrowDate = t.borrowDate;
        if (!returnDate || !borrowDate) continue;
        const days = Math.floor((new Date(returnDate) - new Date(borrowDate)) / (1000 * 60 * 60 * 24));
        if (days > maxDays) {
            projectedRevenue += (days - maxDays) * fineRate;
        }
    }

    let diffPercent = 0;
    if (baselineRevenue > 0) {
        diffPercent = Math.round(((projectedRevenue - baselineRevenue) / baselineRevenue) * 100 * 10) / 10;
    } else if (projectedRevenue > 0) {
        diffPercent = 100;
    }

    return {
        projected_revenue: projectedRevenue,
        baseline_revenue: baselineRevenue,
        diff_percent: diffPercent,
    };
}

/**
 * DSS: Độc giả rủi ro cao
 */
async function getHighRiskUsers() {
    const overdueUsers = await LoanTicketMongo.aggregate([
        { $match: { status: 'OVERDUE' } },
        { $group: { _id: '$userId', overdueBooksCount: { $sum: 1 } } },
    ]);

    const unpaidFines = await FineTicketMongo.aggregate([
        { $match: { status: 'UNPAID' } },
        { $group: { _id: '$userId', totalFine: { $sum: '$fineAmount' } } },
    ]);

    const riskMap = {};
    for (const u of overdueUsers) {
        const uid = String(u._id);
        if (!riskMap[uid]) riskMap[uid] = { overdueBooksCount: 0, totalFine: 0 };
        riskMap[uid].overdueBooksCount = u.overdueBooksCount;
    }
    for (const f of unpaidFines) {
        const uid = String(f._id);
        if (!riskMap[uid]) riskMap[uid] = { overdueBooksCount: 0, totalFine: 0 };
        riskMap[uid].totalFine = f.totalFine;
    }

    const riskUserIds = Object.keys(riskMap);
    if (!riskUserIds.length) return [];

    const users = await UserMongo.find({ _id: { $in: riskUserIds } }).lean();
    return users.map((u) => {
        const uid = String(u._id);
        return {
            id: uid,
            studentId: u.studentId || u.idStudent || '',
            fullName: u.fullName,
            email: u.email,
            totalFine: riskMap[uid]?.totalFine || 0,
            overdueBooksCount: riskMap[uid]?.overdueBooksCount || 0,
            warningCount: u.warningCount || 0,
        };
    }).sort((a, b) => b.totalFine - a.totalFine);
}

/**
 * DSS: Sách ít tương tác (0 lượt mượn trong 6 tháng)
 */
async function getUnusedBooks() {
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);
    const recentCopyIds = await LoanTicketMongo.distinct('bookCopyIds', {
        borrowDate: { $gte: sixMonthsAgo },
        status: { $in: ['BORROWING', 'RETURNED', 'OVERDUE'] },
    });

    const recentCopies = await BookCopyMongo.find({ _id: { $in: recentCopyIds } }).lean();
    const recentBookIds = new Set(recentCopies.map((c) => String(c.bookId || c.mysqlId)).filter(Boolean));

    const allBooks = await BookMongo.find({}).lean();
    return allBooks
        .filter((b) => !recentBookIds.has(String(b._id)) && !recentBookIds.has(String(b.mysqlId)))
        .map((b) => ({
            isbn: b.bookCode || b.mysqlId || '',
            title: b.title || b.nameProduct || '',
            category: b.category_1 || b.category || '',
            stock: b.stock || b.totalCopies || 0,
        }));
}

module.exports = {
    getAllEisKpis,
    getCategoryTrends,
    getDrilldown,
    getWhatIfAnalysis,
    getHighRiskUsers,
    getUnusedBooks,
};
