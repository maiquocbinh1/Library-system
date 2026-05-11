/**
 * Nạp kho bản sao + 3 độc giả để thử quầy lưu thông (lập phiếu mượn) trên toàn hệ thống.
 * Dữ liệu mang tính nghiệp vụ thật, không dùng từ "demo" trong tên sách / MSV / barcode.
 *
 * Chạy: npm run seed:circulation-sample  (từ thư mục server, cần MONGODB_URI trong .env)
 * Mật khẩu 3 tài khoản: 123456
 *
 * MSV đồng bộ với FE: server/src/scripts/data/circulationSampleStudentIds.js
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');
const { CIRCULATION_SAMPLE_STUDENT_IDS } = require('./data/circulationSampleStudentIds');
const { resetCirculationSamplePatronsState } = require('../services/circulationSampleReset.service');

const PolicyMongo = require('../models/policy.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const { createBookCopiesFromBarcodes } = require('../services/bookCopy.service');
const { syncBookInventoryFields } = require('../utils/bookInventory');

const DEFAULT_PASSWORD = '123456';
const COVER_IMG = 'https://images.unsplash.com/photo-1544947950-fa07a98d237f?auto=format&fit=max&w=480&q=80';

const PATRONS = [
    {
        studentId: CIRCULATION_SAMPLE_STUDENT_IDS[0],
        fullName: 'Nguyễn Gia Khang',
        email: 'nguyengiakhang.b23@student.mail.vn',
        phone: '0398124456',
        address: 'Ký túc xá B — Đại học Công nghệ Thông tin',
        className: 'D23CQCN08-B',
    },
    {
        studentId: CIRCULATION_SAMPLE_STUDENT_IDS[1],
        fullName: 'Hoàng Thuỳ Linh',
        email: 'hoangthuylinh.b23@student.mail.vn',
        phone: '0976231188',
        address: 'Phường Láng — Đống Đa, Hà Nội',
        className: 'D23CQCN08-B',
    },
    {
        studentId: CIRCULATION_SAMPLE_STUDENT_IDS[2],
        fullName: 'Vũ Hoàng Nam',
        email: 'vuhoangnam.b23@student.mail.vn',
        phone: '0339012277',
        address: 'Chung cư Mipec, Long Biên',
        className: 'D23CQCN09-N',
    },
];

/** Đầu sách phổ biến — mỗi cuốn có thêm vài bản sao AVAILABLE. */
const BOOK_SEEDS = [
    {
        bookCode: 'BK-QLTV-8841',
        title: 'Đắc nhân tâm',
        description: 'Bản in tái bản, phục vụ mượn tại chỗ.',
        publishYear: 2022,
        pages: 320,
        language: 'Tiếng Việt',
        publisher: 'NXB Trẻ',
        publishingCompany: 'NXB Trẻ',
        covertType: 'soft',
        category: 'Kỹ năng sống',
        barcodes: ['HN-KHO-8841-A12', 'HN-KHO-8841-B07', 'HN-KHO-8841-C33', 'HN-KHO-8841-D04'],
    },
    {
        bookCode: 'BK-QLTV-8842',
        title: 'Nhà giả kim',
        description: 'Tiểu thuyết, bìa mềm.',
        publishYear: 2021,
        pages: 228,
        language: 'Tiếng Việt',
        publisher: 'NXB Nhã Nam',
        publishingCompany: 'Nhã Nam',
        covertType: 'soft',
        category: 'Văn học',
        barcodes: ['HN-KHO-8842-X01', 'HN-KHO-8842-X02', 'HN-KHO-8842-X03'],
    },
    {
        bookCode: 'BK-QLTV-8843',
        title: 'Sapiens: Lược sử loài người',
        description: 'Bản dịch tiếng Việt.',
        publishYear: 2020,
        pages: 560,
        language: 'Tiếng Việt',
        publisher: 'NXB Tri thức',
        publishingCompany: 'Tri thức',
        covertType: 'hard',
        category: 'Lịch sử',
        barcodes: ['HN-KHO-8843-M91', 'HN-KHO-8843-M92', 'HN-KHO-8843-M93', 'HN-KHO-8843-M94'],
    },
    {
        bookCode: 'BK-QLTV-8844',
        title: 'Giáo trình Cấu trúc dữ liệu và giải thuật',
        description: 'Phục vụ sinh viên ngành Công nghệ thông tin.',
        publishYear: 2023,
        pages: 412,
        language: 'Tiếng Việt',
        publisher: 'NXB Đại học Quốc gia',
        publishingCompany: 'NXB ĐHQGHN',
        covertType: 'soft',
        category: 'Giáo trình',
        barcodes: ['HN-KHO-8844-T01', 'HN-KHO-8844-T02', 'HN-KHO-8844-T03', 'HN-KHO-8844-T04', 'HN-KHO-8844-T05'],
    },
    {
        bookCode: 'BK-QLTV-8845',
        title: 'Mạng máy tính và truyền thông dữ liệu',
        description: 'Tài liệu học tập.',
        publishYear: 2023,
        pages: 368,
        language: 'Tiếng Việt',
        publisher: 'NXB Bách khoa',
        publishingCompany: 'NXB Bách khoa Hà Nội',
        covertType: 'soft',
        category: 'Giáo trình',
        barcodes: ['HN-KHO-8845-N44', 'HN-KHO-8845-N45', 'HN-KHO-8845-N46'],
    },
    {
        bookCode: 'BK-QLTV-8846',
        title: 'Nhập môn lập trình hướng đối tượng',
        description: 'Java / OOP cơ bản.',
        publishYear: 2024,
        pages: 290,
        language: 'Tiếng Việt',
        publisher: 'NXB Thông tin và Truyền thông',
        publishingCompany: 'NXB TT&TT',
        covertType: 'soft',
        category: 'Lập trình',
        barcodes: ['HN-KHO-8846-P11', 'HN-KHO-8846-P12', 'HN-KHO-8846-P13', 'HN-KHO-8846-P14'],
    },
];

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

async function upsertPolicy() {
    const doc = await PolicyMongo.findOneAndUpdate(
        { readerType: 'SinhVien_ChinhQuy' },
        {
            $set: {
                maxBooks: 8,
                loanDays: 14,
                renewExtensionDays: 14,
                overdueFinePerDay: 1000,
            },
        },
        { upsert: true, new: true },
    );
    console.log('[seed-circulation] Quy định SinhVien_ChinhQuy:', {
        maxBooks: doc.maxBooks,
        loanDays: doc.loanDays,
        renewExtensionDays: doc.renewExtensionDays,
        overdueFinePerDay: doc.overdueFinePerDay,
    });
}

async function releasePatronCopiesAndTickets() {
    const metadata = await resetCirculationSamplePatronsState();
    if (metadata.patronCount > 0) {
        console.log(
            `[seed-circulation] Đã giải phóng phiếu/phạt của ${metadata.patronCount} độc giả mẫu (xóa ${metadata.ticketsRemoved} phiếu, ${metadata.finesRemoved} phạt).`,
        );
    }
}

async function ensureBooksAndCopies() {
    for (const row of BOOK_SEEDS) {
        let book = await BookMongo.findOne({ bookCode: row.bookCode }).select('_id').lean();
        if (!book) {
            const doc = await BookMongo.create({
                mysqlId: random36(),
                bookCode: row.bookCode,
                title: row.title,
                image: COVER_IMG,
                category: row.category,
                category_1: row.category,
                description: row.description,
                stock: 0,
                totalCopies: 0,
                covertType: row.covertType,
                publishYear: row.publishYear,
                pages: row.pages,
                language: row.language,
                publisher: row.publisher,
                publishingCompany: row.publishingCompany,
            });
            book = { _id: doc._id };
            console.log(`[seed-circulation] Tạo đầu sách: ${row.bookCode} — ${row.title}`);
        }

        const existingBarcodes = new Set(
            (await BookCopyMongo.find({ bookId: book._id }).select('barcode').lean()).map((c) => c.barcode),
        );
        const toAdd = row.barcodes.filter((b) => !existingBarcodes.has(b));
        if (toAdd.length) {
            const { created, duplicates } = await createBookCopiesFromBarcodes(book._id, toAdd);
            console.log(`  + ${created.length} bản sao (${row.bookCode}), trùng bỏ qua: ${duplicates.length}`);
        }
        await syncBookInventoryFields(book._id);
    }
}

async function ensurePatrons(passwordHash) {
    const now = new Date();
    const expires = new Date(now);
    expires.setFullYear(expires.getFullYear() + 1);

    for (const row of PATRONS) {
        const email = String(row.email).toLowerCase().trim();
        const studentId = String(row.studentId).trim();

        let user = await UserMongo.findOne({ $or: [{ email }, { studentId }] });
        if (user) {
            user.fullName = row.fullName;
            user.phone = row.phone;
            user.address = row.address;
            user.className = row.className;
            user.studentId = studentId;
            user.email = email;
            user.password = passwordHash;
            user.role = 'user';
            user.readerType = 'SinhVien_ChinhQuy';
            user.verificationStatus = 'verified';
            user.libraryCardBlocked = false;
            user.cardPlanMonths = 12;
            user.libraryCardIssuedAt = now;
            user.libraryCardExpiresAt = expires;
            await user.save();
            console.log(`[seed-circulation] Cập nhật độc giả: ${row.fullName} | ${email} | ${studentId}`);
        } else {
            user = await UserMongo.create({
                mysqlId: random36(),
                fullName: row.fullName,
                phone: row.phone,
                address: row.address,
                email,
                password: passwordHash,
                typeLogin: 'email',
                role: 'user',
                studentId,
                readerType: 'SinhVien_ChinhQuy',
                verificationStatus: 'verified',
                cardPlanMonths: 12,
                libraryCardIssuedAt: now,
                libraryCardExpiresAt: expires,
                className: row.className,
                libraryCardBlocked: false,
            });
            console.log(`[seed-circulation] Tạo độc giả: ${row.fullName} | ${email} | ${studentId}`);
        }
        await ensureApiKey(user._id);
    }
}

async function run() {
    await connectSeedMongo();
    console.log('[seed-circulation] Kết nối MongoDB\n');

    const passwordHash = bcrypt.hashSync(DEFAULT_PASSWORD, bcrypt.genSaltSync(10));

    try {
        await upsertPolicy();
        await releasePatronCopiesAndTickets();
        await ensureBooksAndCopies();
        await ensurePatrons(passwordHash);

        const avail = await BookCopyMongo.countDocuments({ status: 'AVAILABLE' });
        console.log('\n[seed-circulation] Tổng bản AVAILABLE trong hệ thống:', avail);
        console.log('\n========== Đăng nhập độc giả (mật khẩu: 123456) ==========');
        for (const row of PATRONS) {
            console.log(`  ${row.fullName}`);
            console.log(`     Email: ${row.email}`);
            console.log(`     MSV:   ${row.studentId}`);
        }
        console.log('==========================================================');
        console.log('Trên quầy "Lập phiếu mượn": tìm theo MSV hoặc tên — giỏ sẽ tự thêm sách sẵn có (FE đồng bộ MSV).');
    } finally {
        await disconnectSeedMongo();
    }
}

run()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('[seed-circulation] Lỗi:', err.message);
        process.exit(1);
    });
