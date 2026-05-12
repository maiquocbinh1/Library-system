/**
 * Kiểm tra phân bố số bản sao theo từng đầu sách trong MongoDB.
 * In ra:
 *   - Tổng số đầu sách / tổng số bản sao
 *   - Histogram số bản sao
 *   - Top 10 sách nhiều bản nhất
 *   - Bottom 10 sách ít bản nhất
 *   - Cảnh báo nếu có sách 0 bản
 *
 * Chạy: cd server && node src/scripts/checkBookCopyDistribution.js
 */

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');

async function run() {
    await connectSeedMongo();

    const totalBooks = await BookMongo.countDocuments();
    const totalCopies = await BookCopyMongo.countDocuments();
    const availCopies = await BookCopyMongo.countDocuments({ status: 'AVAILABLE' });
    const borrowedCopies = await BookCopyMongo.countDocuments({ status: 'BORROWED' });

    console.log('='.repeat(60));
    console.log('PHÂN BỐ KHO SÁCH');
    console.log('='.repeat(60));
    console.log(`Tổng đầu sách:       ${totalBooks}`);
    console.log(`Tổng bản sao:        ${totalCopies}`);
    console.log(`  - AVAILABLE:       ${availCopies}`);
    console.log(`  - BORROWED:        ${borrowedCopies}`);
    console.log(`  - Khác:            ${totalCopies - availCopies - borrowedCopies}`);
    console.log('');

    const agg = await BookCopyMongo.aggregate([
        { $group: { _id: '$bookId', count: { $sum: 1 } } },
    ]);
    const countByBookId = new Map(agg.map((r) => [String(r._id), r.count]));

    const books = await BookMongo.find({}).select('_id bookCode title stock totalCopies').lean();

    const histogram = {};
    let zeroCopyBooks = 0;
    const rows = books.map((b) => {
        const actual = countByBookId.get(String(b._id)) || 0;
        const bucket =
            actual === 0
                ? '0'
                : actual <= 5
                ? '1-5'
                : actual <= 10
                ? '6-10'
                : actual <= 20
                ? '11-20'
                : actual <= 50
                ? '21-50'
                : actual <= 100
                ? '51-100'
                : actual <= 200
                ? '101-200'
                : '200+';
        histogram[bucket] = (histogram[bucket] || 0) + 1;
        if (actual === 0) zeroCopyBooks += 1;
        return { bookCode: b.bookCode || '—', title: b.title || '—', actual, stock: b.stock, totalCopies: b.totalCopies };
    });

    const counts = rows.map((r) => r.actual);
    const min = Math.min(...counts);
    const max = Math.max(...counts);
    const sum = counts.reduce((a, b) => a + b, 0);
    const avg = (sum / counts.length).toFixed(1);
    const sortedCounts = [...counts].sort((a, b) => a - b);
    const median = sortedCounts[Math.floor(sortedCounts.length / 2)];

    console.log('THỐNG KÊ SỐ BẢN SAO/ĐẦU SÁCH');
    console.log('-'.repeat(60));
    console.log(`Min:                 ${min}`);
    console.log(`Max:                 ${max}`);
    console.log(`Trung bình:          ${avg}`);
    console.log(`Trung vị:            ${median}`);
    console.log(`Sách có 0 bản sao:   ${zeroCopyBooks}`);
    console.log('');

    console.log('HISTOGRAM (số bản sao trên 1 đầu sách → số đầu sách)');
    console.log('-'.repeat(60));
    const order = ['0', '1-5', '6-10', '11-20', '21-50', '51-100', '101-200', '200+'];
    for (const b of order) {
        if (histogram[b]) {
            const bar = '█'.repeat(Math.min(50, Math.round((histogram[b] / totalBooks) * 50)));
            console.log(`  ${b.padEnd(8)} | ${String(histogram[b]).padStart(4)} ${bar}`);
        }
    }
    console.log('');

    console.log('TOP 10 SÁCH NHIỀU BẢN SAO NHẤT');
    console.log('-'.repeat(60));
    rows
        .sort((a, b) => b.actual - a.actual)
        .slice(0, 10)
        .forEach((r, i) => {
            console.log(`  ${String(i + 1).padStart(2)}. [${r.bookCode.padEnd(6)}] ${r.actual.toString().padStart(4)} bản · ${r.title.slice(0, 50)}`);
        });
    console.log('');

    console.log('BOTTOM 10 SÁCH ÍT BẢN SAO NHẤT');
    console.log('-'.repeat(60));
    rows
        .sort((a, b) => a.actual - b.actual)
        .slice(0, 10)
        .forEach((r, i) => {
            console.log(`  ${String(i + 1).padStart(2)}. [${r.bookCode.padEnd(6)}] ${r.actual.toString().padStart(4)} bản · ${r.title.slice(0, 50)}`);
        });
    console.log('');

    const mismatches = rows.filter((r) => Number(r.totalCopies || 0) !== r.actual).slice(0, 5);
    if (mismatches.length) {
        console.log('⚠ CẢNH BÁO: totalCopies trong sách không khớp với count bản sao (cần chạy syncBookInventoryFields):');
        mismatches.forEach((r) => {
            console.log(`  [${r.bookCode}] DB stock=${r.stock}, totalCopies=${r.totalCopies}, đếm thực=${r.actual}`);
        });
    } else {
        console.log('✓ Đồng bộ: mọi sách có totalCopies khớp với count thực tế.');
    }
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
