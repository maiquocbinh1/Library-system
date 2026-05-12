const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const BookCopy = require('../models/bookCopy.mongo.model');
const Loan = require('../models/loanTicket.mongo.model');
const Fine = require('../models/fineTicket.mongo.model');

(async () => {
    await connectSeedMongo();
    const total = await BookCopy.countDocuments({});
    const borrowed = await BookCopy.countDocuments({ status: 'BORROWED' });
    const borrowing = await Loan.countDocuments({ status: 'BORROWING' });
    const overdue = await Loan.countDocuments({ status: 'OVERDUE' });
    const paidAgg = await Fine.aggregate([{ $match: { status: 'PAID' } }, { $group: { _id: null, t: { $sum: '$fineAmount' } } }]);
    const unpaidAgg = await Fine.aggregate([{ $match: { status: 'UNPAID' } }, { $group: { _id: null, t: { $sum: '$fineAmount' } } }]);
    const p = paidAgg[0]?.t || 0;
    const u = unpaidAgg[0]?.t || 0;
    console.log(`Khai thác kho:    ${((borrowed / total) * 100).toFixed(1)}%  (${borrowed}/${total})`);
    console.log(`Quá hạn:          ${(((overdue / (borrowing + overdue)) * 100) || 0).toFixed(1)}%  (${overdue}/${borrowing + overdue})`);
    console.log(`Thu hồi nợ phạt:  ${((p / (p + u)) * 100).toFixed(1)}%  (PAID ${p.toLocaleString('vi-VN')}đ / UNPAID ${u.toLocaleString('vi-VN')}đ)`);
    await disconnectSeedMongo();
    process.exit(0);
})();
