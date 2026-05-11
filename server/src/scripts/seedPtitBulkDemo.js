/**
 * Bản chuyển từ seed Python (PyMongo + Faker) sang stack dự án: Node + Mongoose + bcrypt.
 *
 * Tạo: 1 admin, 200 độc giả (MSV PTIT), 300 đầu sách + bản sao (3–12/đầu), ~2000 phiếu mượn
 * (loan_tickets + fine_tickets khi có phạt trễ).
 *
 * CẢNH BÁO: Xóa sạch users / books / copies / loans / fines / api keys / admin / circulation events.
 * Chạy:  npm run seed:ptit-bulk -- --confirm-wipe
 *
 * Đăng nhập admin: admin@ptit.edu.vn / 123
 * Độc giả: email dạng {msv}@stu.ptit.edu.vn / 123
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');

const UserMongo = require('../models/user.mongo.model');
const AdminMongo = require('../models/admin.mongo.model');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const CirculationReturnEventMongo = require('../models/circulationReturnEvent.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

const CATEGORIES = ['CNTT', 'Kinh tế', 'Kỹ năng', 'Văn học', 'Ngoại ngữ', 'Chính trị', 'Thể dục'];
const CAT_WEIGHTS = [40, 20, 15, 10, 5, 5, 5];
const BG_COLORS = ['4f46e5', '059669', 'ea580c', 'e11d48', '0891b2', '4c1d95', 'b45309'];

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'];
const DEM = ['Văn', 'Thị', 'Đức', 'Minh', 'Thu', 'Hồng', 'Quang', 'Tuấn'];
const TEN = ['An', 'Bình', 'Chi', 'Dũng', 'Hà', 'Lan', 'Long', 'Mai', 'Nam', 'Oanh', 'Phúc', 'Quân'];

function random36() {
    return crypto.randomUUID();
}

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function randomPick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function weightedCategory() {
    const total = CAT_WEIGHTS.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < CATEGORIES.length; i += 1) {
        r -= CAT_WEIGHTS[i];
        if (r <= 0) return CATEGORIES[i];
    }
    return CATEGORIES[CATEGORIES.length - 1];
}

function fakeVnName() {
    return `${randomPick(HO)} ${randomPick(DEM)} ${randomPick(TEN)}`;
}

function fakePhone() {
    return `09${String(randInt(10000000, 99999999))}`;
}

function randomDateBetween(start, end) {
    const t0 = start.getTime();
    const t1 = end.getTime();
    return new Date(t0 + Math.random() * (t1 - t0));
}

const generatedTitles = new Set();

function generateBookInfo() {
    const cat = weightedCategory();
    let title;
    if (cat === 'CNTT') {
        title = `${randomPick(['Lập trình', 'Giáo trình', 'Cơ sở', 'Hệ thống', 'Làm chủ'])} ${randomPick(['Python', 'Java', 'C++', 'AI', 'Mạng máy tính', 'Web', 'Mobile', 'Bảo mật', 'Cấu trúc dữ liệu', 'Hệ điều hành'])} ${randomPick(['Cơ bản', 'Nâng cao', 'Toàn tập', 'Ứng dụng', 'Thực hành'])}`;
    } else if (cat === 'Kinh tế') {
        title = `${randomPick(['Nguyên lý', 'Quản trị', 'Giáo trình', 'Phân tích', 'Cơ sở'])} ${randomPick(['Kinh tế Vĩ mô', 'Marketing', 'Tài chính', 'Nhân sự', 'Kế toán', 'Chuỗi cung ứng', 'Logistics'])} ${randomPick(['Hiện đại', 'Căn bản', 'Nâng cao', 'Ứng dụng', 'Toàn tập'])}`;
    } else if (cat === 'Kỹ năng') {
        title = `${randomPick(['Kỹ năng', 'Nghệ thuật', 'Bí quyết', 'Tư duy', 'Sức mạnh'])} ${randomPick(['Giao tiếp', 'Lãnh đạo', 'Quản lý thời gian', 'Thuyết trình', 'Đàm phán', 'Làm việc nhóm', 'Tập trung'])} ${randomPick(['Hiệu quả', 'Đỉnh cao', 'Thành công', 'Cho Sinh Viên'])}`;
    } else if (cat === 'Văn học') {
        title = `Tuyển tập ${randomPick(['truyện', 'tản văn', 'thơ'])} ${fakeVnName().split(' ').pop().toLowerCase()} ${randInt(1, 99)}`;
    } else {
        title = `${randomPick(['Giáo trình', 'Sổ tay', 'Tài liệu'])} ${cat} ${randInt(2018, 2025)}`;
    }
    let t = title;
    while (generatedTitles.has(t)) {
        t = `${title} (Phần ${randInt(2, 5)})`;
    }
    generatedTitles.add(t);
    return { title: t, author: fakeVnName(), category: cat };
}

function calendarDaysLate(dueDate, returnAt) {
    const d0 = new Date(dueDate);
    d0.setHours(0, 0, 0, 0);
    const d1 = new Date(returnAt);
    d1.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((d1.getTime() - d0.getTime()) / 86400000));
}

async function wipeAll() {
    console.log('Đang xóa dữ liệu cũ (Mongo — collections thư viện)...');
    await CirculationReturnEventMongo.deleteMany({});
    await FineTicketMongo.deleteMany({});
    await LoanTicketMongo.deleteMany({});
    await BookCopyMongo.deleteMany({});
    await BookMongo.deleteMany({});
    await ApiKeyMongo.deleteMany({});
    await AdminMongo.deleteMany({});
    await UserMongo.deleteMany({});
}

async function run() {
    const args = new Set(process.argv.slice(2));
    if (!args.has('--confirm-wipe')) {
        console.error('Thiếu --confirm-wipe. Lệnh đầy đủ: npm run seed:ptit-bulk -- --confirm-wipe');
        process.exit(1);
    }

    await connectSeedMongo();
    await wipeAll();

    const now = new Date();
    const thirteenMonthsAgo = new Date(now);
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13);
    const twoYearsAgo = new Date(now);
    twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

    const passwordHash = bcrypt.hashSync('123', bcrypt.genSaltSync(10));
    const cardUntil = new Date(now);
    cardUntil.setFullYear(cardUntil.getFullYear() + 1);

    console.log('Đang tạo Admin...');
    const adminUser = await UserMongo.create({
        mysqlId: random36(),
        fullName: 'Quản Trị Viên (Thủ thư)',
        email: 'admin@ptit.edu.vn',
        password: passwordHash,
        typeLogin: 'email',
        role: 'admin',
        phone: null,
        address: null,
    });
    await AdminMongo.create({
        mysqlId: random36(),
        userId: String(adminUser._id),
        email: 'admin@ptit.edu.vn',
        fullName: adminUser.fullName,
        role: 'admin',
        isActive: true,
    });

    console.log('Đang tạo 200 Độc giả (Sinh viên PTIT)...');
    const generatedMsv = new Set();
    const userDocs = [];
    while (userDocs.length < 200) {
        const khoa = randomPick(['B19', 'B20', 'B21', 'B22', 'B23']);
        const nganh = randomPick(['DCCN', 'DCAT', 'DCVT', 'DCKT', 'DCMR', 'DCPT']);
        const msv = `${khoa}${nganh}${String(randInt(1, 999)).padStart(3, '0')}`;
        if (generatedMsv.has(msv)) continue;
        generatedMsv.add(msv);
        const createdAt = randomDateBetween(thirteenMonthsAgo, now);
        userDocs.push({
            mysqlId: random36(),
            fullName: fakeVnName(),
            email: `${msv.toLowerCase()}@stu.ptit.edu.vn`,
            phone: fakePhone(),
            password: passwordHash,
            typeLogin: 'email',
            role: 'user',
            readerType: 'SinhVien_ChinhQuy',
            studentId: msv,
            idStudent: msv,
            verificationStatus: 'verified',
            cardPlanMonths: 12,
            libraryCardIssuedAt: now,
            libraryCardExpiresAt: cardUntil,
            className: `${khoa}-${nganh}`,
            createdAt,
            updatedAt: createdAt,
        });
    }
    await UserMongo.insertMany(userDocs);

    const patronUsers = await UserMongo.find({ role: 'user' }).lean();
    const userIds = patronUsers.map((u) => String(u._id));
    const userById = new Map(patronUsers.map((u) => [String(u._id), u]));

    console.log('Đang tạo 300 Đầu sách ngẫu nhiên và Bản sao...');
    const bookPayloads = [];
    for (let i = 0; i < 300; i += 1) {
        const { title, author, category } = generateBookInfo();
        const isbn = `978-84-${String(i + 1).padStart(4, '0')}`;
        const qty = randInt(3, 12);
        const bg = randomPick(BG_COLORS);
        const coverUrl = `https://placehold.co/400x600/${bg}/white?font=montserrat&text=${encodeURIComponent(title)}`;
        bookPayloads.push({
            mysqlId: random36(),
            bookCode: isbn,
            image: coverUrl,
            title,
            category,
            description: `Tác giả: ${author}`,
            stock: 0,
            totalCopies: 0,
            covertType: Math.random() < 0.35 ? 'hard' : 'soft',
            publishYear: randInt(2010, 2024),
            pages: randInt(120, 650),
            language: Math.random() < 0.85 ? 'Tiếng Việt' : 'English',
            publisher: randomPick(['NXB Giáo dục', 'NXB KHKT', 'NXB ĐHQGHN', 'NXB Trẻ', 'Pearson VN']),
            publishingCompany: randomPick(['FPT Press', 'Alpha Books', 'Kim Đồng', 'Lavibe']),
            _seedQty: qty,
            _seedIsbn: isbn,
        });
    }

    const booksInserted = await BookMongo.insertMany(
        bookPayloads.map(
            ({
                mysqlId,
                bookCode,
                image,
                title,
                category,
                description,
                stock,
                totalCopies,
                covertType,
                publishYear,
                pages,
                language,
                publisher,
                publishingCompany,
            }) => ({
                mysqlId,
                bookCode,
                image,
                title,
                category,
                description,
                stock,
                totalCopies,
                covertType,
                publishYear,
                pages,
                language,
                publisher,
                publishingCompany,
            }),
        ),
    );

    const copyRows = [];
    for (let i = 0; i < booksInserted.length; i += 1) {
        const b = booksInserted[i];
        const qty = bookPayloads[i]._seedQty;
        const isbn = bookPayloads[i]._seedIsbn;
        for (let j = 0; j < qty; j += 1) {
            copyRows.push({
                mysqlId: random36(),
                bookId: b._id,
                barcode: `${isbn}-${j + 1}`,
                status: 'AVAILABLE',
            });
        }
    }
    await BookCopyMongo.insertMany(copyRows);

    const allBooks = await BookMongo.find({}).lean();
    for (const b of allBooks) {
        await syncBookInventoryFields(b._id);
    }

    const copies = await BookCopyMongo.find({}).lean();
    const bookById = new Map(allBooks.map((b) => [String(b._id), b]));

    console.log('Đang tạo ~2000 phiếu mượn / trả (13 tháng)...');
    let ticketCount = 0;
    const TARGET = 2000;
    let attempts = 0;
    const maxAttempts = 120000;

    while (ticketCount < TARGET && attempts < maxAttempts) {
        attempts += 1;
        const copy = randomPick(copies);
        const book = bookById.get(String(copy.bookId));
        if (!book) continue;

        if (['Chính trị', 'Thể dục'].includes(book.category) && Math.random() > 0.05) continue;

        const userId = randomPick(userIds);
        const patron = userById.get(userId);
        if (!patron) continue;

        const borrowDate = randomDateBetween(thirteenMonthsAgo, now);
        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + 14);
        dueDate.setHours(0, 0, 0, 0);

        const statusRoll = Math.random();
        if (statusRoll < 0.85) {
            let returnDate;
            let overdueDays = 0;
            let fineAmount = 0;
            let finePaid = true;

            if (Math.random() < 0.8) {
                returnDate = new Date(borrowDate);
                returnDate.setDate(returnDate.getDate() + randInt(1, 14));
            } else {
                returnDate = new Date(dueDate);
                returnDate.setDate(returnDate.getDate() + randInt(1, 30));
                overdueDays = calendarDaysLate(dueDate, returnDate);
                fineAmount = overdueDays * 1000;
                finePaid = Math.random() < 0.9;
            }

            const ticket = await LoanTicketMongo.create({
                mysqlId: random36(),
                userId,
                fullName: patron.fullName,
                phone: patron.phone || null,
                address: '',
                borrowDate,
                dueDate,
                returnedAt: returnDate,
                status: 'RETURNED',
                bookCopyIds: [],
                bookId: book._id,
                requestedQuantity: 1,
                renewalCount: randInt(0, 1),
            });

            if (fineAmount > 0) {
                await FineTicketMongo.create({
                    mysqlId: random36(),
                    loanTicketId: ticket._id,
                    userId,
                    studentId: patron.studentId || null,
                    overdueDays,
                    fineAmount,
                    status: finePaid ? 'PAID' : 'UNPAID',
                    reason: `Trễ ${overdueDays} ngày (seed PTIT bulk)`,
                });
            }
            ticketCount += 1;
        } else {
            if (copy.status !== 'AVAILABLE') continue;

            const isOverdue = dueDate.getTime() < now.getTime();
            let fineAmount = 0;
            if (isOverdue) {
                fineAmount = calendarDaysLate(dueDate, now) * 1000;
            }
            const finePaid = !isOverdue;

            await BookCopyMongo.updateOne({ _id: copy._id }, { $set: { status: 'BORROWED' } });
            copy.status = 'BORROWED';

            const ticket = await LoanTicketMongo.create({
                mysqlId: random36(),
                userId,
                fullName: patron.fullName,
                phone: patron.phone || null,
                address: '',
                borrowDate,
                dueDate,
                returnedAt: null,
                status: isOverdue ? 'OVERDUE' : 'BORROWING',
                bookCopyIds: [copy._id],
                bookId: book._id,
                requestedQuantity: 1,
                renewalCount: 0,
            });

            if (isOverdue && fineAmount > 0) {
                await FineTicketMongo.create({
                    mysqlId: random36(),
                    loanTicketId: ticket._id,
                    userId,
                    studentId: patron.studentId || null,
                    overdueDays: calendarDaysLate(dueDate, now),
                    fineAmount,
                    status: 'UNPAID',
                    reason: 'Quá hạn chưa trả (seed PTIT bulk)',
                });
            }

            ticketCount += 1;
        }
    }

    if (ticketCount < TARGET) {
        console.warn(`[seed-ptit-bulk] Chỉ tạo được ${ticketCount}/${TARGET} phiếu sau ${attempts} lần thử (thiếu bản AVAILABLE hoặc lọc category).`);
    }

    for (const b of allBooks) {
        await syncBookInventoryFields(b._id);
    }

    console.log('='.repeat(50));
    console.log('TẠO DỮ LIỆU THÀNH CÔNG!');
    console.log(`Đã tạo: 200 độc giả, 300 đầu sách, ${copies.length} bản sao, ${ticketCount} phiếu mượn`);
    console.log('Admin: admin@ptit.edu.vn / 123');
    console.log('User: email {MSV}@stu.ptit.edu.vn / 123');
    console.log('='.repeat(50));
}

run()
    .then(async () => {
        await disconnectSeedMongo();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('[seed-ptit-bulk] Lỗi:', err);
        await disconnectSeedMongo().catch(() => {});
        process.exit(1);
    });
