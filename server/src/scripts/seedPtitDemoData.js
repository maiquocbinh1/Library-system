/**
 * Seed dữ liệu test cho hệ thống — tạo 200 sinh viên + ~2000 phiếu mượn (13 tháng qua)
 * dựa trên kho sách HIỆN CÓ. KHÔNG xóa dữ liệu cũ (admin, sách, 3 demo A/B/C vẫn nguyên).
 *
 * MSV định dạng: B{20|21|22}SEED{KHMT|HTTT|TMDT|CV|BT}{001..999}  (liền, không gạch)
 *   Ví dụ: B22SEEDKHMT042
 * Email: 70% theo MSV @stu.ptit.edu.vn, 30% là gmail thường (tên không dấu + số)
 * Mật khẩu: 123 (bcrypt)
 *
 * Chạy:
 *   cd server
 *   npm run seed:ptit-demo
 *
 * Tham số tùy chọn:
 *   --users=200     Số sinh viên muốn tạo (mặc định 200)
 *   --loans=2000    Số phiếu mượn muốn tạo (mặc định 2000)
 *   --clean         Xóa các seed lần trước (theo MSV `*-SEED-*`) trước khi tạo lại
 */

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const mongoose = require('mongoose');

const { connectSeedMongo, disconnectSeedMongo } = require('./mongoSeedConnect');

const UserMongo = require('../models/user.mongo.model');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

const KHOAS = ['B20', 'B21', 'B22'];
const NGANHS = ['KHMT', 'HTTT', 'TMDT', 'CV', 'BT'];

const HO = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ', 'Ngô', 'Dương', 'Lý'];
const DEM_NAM = ['Văn', 'Đức', 'Minh', 'Quang', 'Tuấn', 'Anh', 'Thành', 'Hữu', 'Bá', 'Mạnh', 'Quốc', 'Hoàng'];
const DEM_NU = ['Thị', 'Thu', 'Hồng', 'Ngọc', 'Mỹ', 'Phương', 'Diệu', 'Bích', 'Như', 'Khánh', 'Hà'];
const TEN_NAM = ['An', 'Bình', 'Dũng', 'Hải', 'Hùng', 'Khoa', 'Long', 'Minh', 'Nam', 'Phúc', 'Quân', 'Sơn', 'Tài', 'Tùng', 'Việt', 'Khôi', 'Bảo', 'Trung', 'Đạt', 'Phong'];
const TEN_NU = ['Anh', 'Chi', 'Dung', 'Hà', 'Hương', 'Lan', 'Linh', 'Mai', 'My', 'Ngọc', 'Oanh', 'Phương', 'Thu', 'Trang', 'Vy', 'Yến', 'Hằng', 'Nhung', 'Trâm', 'Quyên'];

function random36() {
    return crypto.randomUUID();
}

function randInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

function randomVnName() {
    const gender = Math.random() < 0.5 ? 'm' : 'f';
    const ho = pick(HO);
    const dem = gender === 'm' ? pick(DEM_NAM) : pick(DEM_NU);
    const ten = gender === 'm' ? pick(TEN_NAM) : pick(TEN_NU);
    return { fullName: `${ho} ${dem} ${ten}`, gender: gender === 'm' ? 'male' : 'female' };
}

/** Chuyển tiếng Việt có dấu sang ASCII không dấu, ghép liền chữ thường. */
function asciiSlug(s) {
    return String(s || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '');
}

const GMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com'];

/** Sinh email gmail thường từ fullName: nguyenvanan + 2-4 số ngẫu nhiên @gmail.com (hoặc yahoo/outlook). */
function randomPersonalEmail(fullName) {
    const base = asciiSlug(fullName) || 'user';
    const suffix = String(randInt(1, 9999));
    return `${base}${suffix}@${pick(GMAIL_DOMAINS)}`;
}

function randomPhone() {
    const heads = ['032', '033', '034', '035', '036', '037', '038', '039', '070', '076', '077', '078', '079', '081', '082', '083', '084', '085', '086', '088', '089'];
    let s = pick(heads);
    for (let i = 0; i < 7; i += 1) s += String(randInt(0, 9));
    return s;
}

function randomDateBetween(start, end) {
    const t0 = start.getTime();
    const t1 = end.getTime();
    return new Date(t0 + Math.random() * (t1 - t0));
}

function calendarDaysLate(dueDate, returnAt) {
    const d0 = new Date(dueDate);
    d0.setHours(0, 0, 0, 0);
    const d1 = new Date(returnAt);
    d1.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((d1.getTime() - d0.getTime()) / 86400000));
}

function parseArgs() {
    const args = { users: 200, loans: 2000, clean: false };
    for (const a of process.argv.slice(2)) {
        if (a === '--clean') args.clean = true;
        else if (a.startsWith('--users=')) args.users = Math.max(0, Number(a.slice(8)) || 0);
        else if (a.startsWith('--loans=')) args.loans = Math.max(0, Number(a.slice(8)) || 0);
    }
    return args;
}

async function cleanPreviousSeed() {
    console.log('[seed-ptit-demo] Xóa seed cũ (MSV pattern *SEED* — cả có gạch và liền)...');
    // Bắt cả format có gạch (cũ) và liền (mới): chỉ cần chứa "SEED" và bắt đầu B20/B21/B22
    const rx = /^B(20|21|22)[-]?SEED[-]?(KHMT|HTTT|TMDT|CV|BT)[-]?\d{3}$/i;
    const users = await UserMongo.find({ studentId: { $regex: rx } }).select('_id mysqlId').lean();
    if (!users.length) {
        console.log('[seed-ptit-demo] Không có seed cũ để xóa.');
        return;
    }
    const idSet = new Set();
    for (const u of users) {
        idSet.add(String(u._id));
        if (u.mysqlId) idSet.add(String(u.mysqlId));
    }
    const keys = [...idSet];

    // Trả các bản sao về AVAILABLE và đồng bộ stock
    const oldTickets = await LoanTicketMongo.find({ userId: { $in: keys } }).select('bookCopyIds bookId').lean();
    const copyIds = [...new Set(oldTickets.flatMap((t) => (t.bookCopyIds || []).map((id) => String(id))))];
    const bookIds = [...new Set(oldTickets.map((t) => t.bookId).filter(Boolean).map((id) => String(id)))];
    if (copyIds.length) {
        const oids = copyIds
            .filter((id) => mongoose.isValidObjectId(id))
            .map((id) => new mongoose.Types.ObjectId(id));
        await BookCopyMongo.updateMany({ _id: { $in: oids } }, { $set: { status: 'AVAILABLE' } });
    }

    await FineTicketMongo.deleteMany({ userId: { $in: keys } });
    await LoanTicketMongo.deleteMany({ userId: { $in: keys } });
    for (const u of users) {
        await ApiKeyMongo.deleteMany({ userId: String(u._id) });
    }
    await UserMongo.deleteMany({ _id: { $in: users.map((u) => u._id) } });

    for (const bid of bookIds) {
        if (mongoose.isValidObjectId(bid)) {
            await syncBookInventoryFields(new mongoose.Types.ObjectId(bid));
        }
    }
    console.log(`[seed-ptit-demo] Đã xóa ${users.length} sinh viên seed cũ + phiếu/phạt/key liên quan.`);
}

async function createStudents(targetCount) {
    if (targetCount <= 0) return [];
    console.log(`[seed-ptit-demo] Tạo ${targetCount} sinh viên...`);

    const existed = await UserMongo.find({ studentId: { $exists: true, $ne: null, $ne: '' } })
        .select('studentId email')
        .lean();
    const usedMsv = new Set(existed.map((u) => String(u.studentId || '').toUpperCase()));
    const usedEmail = new Set(existed.map((u) => String(u.email || '').toLowerCase()));

    const now = new Date();
    const back13m = new Date(now);
    back13m.setMonth(back13m.getMonth() - 13);
    const cardUntil = new Date(now);
    cardUntil.setFullYear(cardUntil.getFullYear() + 1);

    const passwordHash = bcrypt.hashSync('123', bcrypt.genSaltSync(10));

    const docs = [];
    let attempts = 0;
    while (docs.length < targetCount && attempts < targetCount * 50) {
        attempts += 1;
        const khoa = pick(KHOAS);
        const nganh = pick(NGANHS);
        const stt = String(randInt(1, 999)).padStart(3, '0');
        const msv = `${khoa}SEED${nganh}${stt}`;
        if (usedMsv.has(msv)) continue;

        const { fullName, gender } = randomVnName();
        let email;
        // 70% dùng MSV @stu.ptit.edu.vn (tài khoản chính thức), 30% gmail/yahoo/outlook (tên cá nhân)
        if (Math.random() < 0.7) {
            email = `${msv.toLowerCase()}@stu.ptit.edu.vn`;
        } else {
            email = randomPersonalEmail(fullName);
            // Tránh trùng email cá nhân — thử lại tối đa 5 lần
            let guard = 0;
            while (usedEmail.has(email.toLowerCase()) && guard < 5) {
                email = randomPersonalEmail(fullName);
                guard += 1;
            }
        }
        const emailLc = email.toLowerCase();
        if (usedEmail.has(emailLc)) continue;
        usedMsv.add(msv);
        usedEmail.add(emailLc);

        const createdAt = randomDateBetween(back13m, now);
        docs.push({
            mysqlId: random36(),
            fullName,
            email,
            phone: randomPhone(),
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
            className: `${khoa}${nganh}`,
            gender,
            createdAt,
            updatedAt: createdAt,
        });
    }

    if (docs.length < targetCount) {
        console.warn(`[seed-ptit-demo] Chỉ tạo được ${docs.length}/${targetCount} sinh viên (MSV đã cạn tổ hợp ngẫu nhiên).`);
    }

    await UserMongo.insertMany(docs);
    const inserted = await UserMongo.find({ studentId: { $in: docs.map((d) => d.studentId) } })
        .select('_id mysqlId fullName phone studentId')
        .lean();
    console.log(`[seed-ptit-demo] Đã tạo ${inserted.length} sinh viên.`);
    return inserted;
}

async function createLoans(students, targetLoans) {
    if (!students.length || targetLoans <= 0) return;

    const allBooks = await BookMongo.find({}).select('_id title category coverPrice').lean();
    if (!allBooks.length) {
        console.warn('[seed-ptit-demo] Không có sách trong DB để tạo phiếu.');
        return;
    }
    const bookById = new Map(allBooks.map((b) => [String(b._id), b]));

    // Group bản sao AVAILABLE theo bookId — dùng để bốc copy khi cần (BORROWING/OVERDUE)
    const allCopies = await BookCopyMongo.find({ status: 'AVAILABLE' })
        .select('_id bookId barcode status')
        .lean();
    if (!allCopies.length) {
        console.warn('[seed-ptit-demo] Không còn bản sao AVAILABLE.');
        return;
    }
    const copiesByBook = new Map();
    for (const c of allCopies) {
        const k = String(c.bookId);
        if (!copiesByBook.has(k)) copiesByBook.set(k, []);
        copiesByBook.get(k).push(c);
    }

    const now = new Date();
    const back13m = new Date(now);
    back13m.setMonth(back13m.getMonth() - 13);

    const loanDocs = [];
    const fineDocs = [];
    const copyStatusUpdates = []; // {_id, status}
    const usedCopiesForActive = new Set(); // copy đang BORROWING/OVERDUE — không tái sử dụng
    const affectedBookIds = new Set();
    const activeSlotsByUser = new Map();
    function activeSlots(uid) {
        return activeSlotsByUser.get(String(uid)) || 0;
    }
    function addActiveSlots(uid, n) {
        const k = String(uid);
        activeSlotsByUser.set(k, activeSlots(k) + n);
    }

    // Tăng độ phủ: thay vì pick(allCopies) (sách nhiều bản sẽ áp đảo),
    // ta dựng pool ID sách phẳng theo trọng số = log(stock) — sách ít bản vẫn được chọn.
    // Đồng thời chèn round-robin cho mọi sách để đảm bảo MỌI đầu sách đều có phiếu.
    const bookIdsRR = allBooks.map((b) => String(b._id));
    // Shuffle nhẹ để round-robin bắt đầu khác nhau mỗi lần
    for (let i = bookIdsRR.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [bookIdsRR[i], bookIdsRR[j]] = [bookIdsRR[j], bookIdsRR[i]];
    }
    let rrCursor = 0;
    // MIN_LOANS_PER_BOOK: số phiếu tối thiểu mỗi sách trong nửa đầu phiên
    // Khi target loans = 2000 và có 159 sách → ~6 phiếu/sách min, phần còn lại random
    const minPerBook = Math.max(3, Math.floor((targetLoans * 0.6) / bookIdsRR.length));
    const seenBookCount = new Map();
    function nextBookId() {
        // Trong nửa đầu: round-robin đảm bảo mọi sách đều được khai thác
        if (rrCursor < bookIdsRR.length * minPerBook) {
            const bid = bookIdsRR[rrCursor % bookIdsRR.length];
            rrCursor += 1;
            return bid;
        }
        // Nửa sau: random thuần (mỗi sách xác suất ngang)
        return pick(bookIdsRR);
    }

    let created = 0;
    let attempts = 0;
    const maxAttempts = targetLoans * 30;

    while (created < targetLoans && attempts < maxAttempts) {
        attempts += 1;
        const bookId = nextBookId();
        const book = bookById.get(bookId);
        if (!book) continue;

        // Giả lập DSS: sách thuộc 1 số category ít được mượn
        const cat = String(book.category || '').toLowerCase();
        if ((cat.includes('chính trị') || cat.includes('thể dục')) && Math.random() > 0.05) continue;

        const borrowDate = randomDateBetween(back13m, now);
        const dueDate = new Date(borrowDate);
        dueDate.setDate(dueDate.getDate() + 14);
        const renewalOnce = randInt(0, 1);
        if (renewalOnce) dueDate.setDate(dueDate.getDate() + 7);

        const roll = Math.random();
        let student;
        let userId;
        if (roll >= 0.85 && roll < 0.95) {
            let found = null;
            for (let tryi = 0; tryi < 48; tryi += 1) {
                const s = pick(students);
                if (activeSlots(String(s._id)) < 8) {
                    found = s;
                    break;
                }
            }
            if (!found) {
                continue;
            }
            student = found;
            userId = String(student._id);
        } else {
            student = pick(students);
            userId = String(student._id);
        }
        const fullName = student.fullName;
        const phone = student.phone || null;

        if (roll < 0.85) {
            // RETURNED — 80% đúng hạn, 20% trễ
            let returnedAt;
            let overdueDays = 0;
            let fineAmount = 0;
            let finePaid = true;
            if (Math.random() < 0.8) {
                returnedAt = new Date(borrowDate);
                returnedAt.setDate(returnedAt.getDate() + randInt(1, 14));
            } else {
                returnedAt = new Date(dueDate);
                returnedAt.setDate(returnedAt.getDate() + randInt(1, 30));
                overdueDays = calendarDaysLate(dueDate, returnedAt);
                fineAmount = overdueDays * 1000;
                finePaid = Math.random() < 0.9;
            }
            const ticketId = new mongoose.Types.ObjectId();
            loanDocs.push({
                _id: ticketId,
                mysqlId: random36(),
                userId,
                fullName,
                phone,
                address: '',
                borrowDate,
                dueDate,
                returnedAt,
                status: 'RETURNED',
                bookCopyIds: [],
                bookId: book._id,
                requestedQuantity: 1,
                renewalCount: renewalOnce,
                createdAt: borrowDate,
                updatedAt: returnedAt,
            });
            if (fineAmount > 0) {
                fineDocs.push({
                    mysqlId: random36(),
                    loanTicketId: ticketId,
                    userId,
                    studentId: student.studentId || null,
                    overdueDays,
                    fineAmount,
                    status: finePaid ? 'PAID' : 'UNPAID',
                    reason: `Trả trễ ${overdueDays} ngày`,
                    createdAt: returnedAt,
                    updatedAt: returnedAt,
                });
            }
            // Theo dõi mọi sách bị tác động (kể cả RETURNED) để báo cáo độ phủ
            const _bk = seenBookCount.get(String(book._id)) || 0;
            seenBookCount.set(String(book._id), _bk + 1);
            created += 1;
        } else if (roll < 0.95) {
            // BORROWING / OVERDUE — bốc 1 copy AVAILABLE của sách này, chưa dùng trong seed
            const pool = copiesByBook.get(String(book._id)) || [];
            const freeCopy = pool.find((c) => !usedCopiesForActive.has(String(c._id)));
            if (!freeCopy) continue; // hết bản sao của sách này, thử vòng khác
            usedCopiesForActive.add(String(freeCopy._id));

            const ticketId = new mongoose.Types.ObjectId();
            const isOverdue = dueDate.getTime() < now.getTime();
            loanDocs.push({
                _id: ticketId,
                mysqlId: random36(),
                userId,
                fullName,
                phone,
                address: '',
                borrowDate,
                dueDate,
                returnedAt: null,
                status: isOverdue ? 'OVERDUE' : 'BORROWING',
                bookCopyIds: [freeCopy._id],
                bookId: book._id,
                requestedQuantity: 1,
                renewalCount: renewalOnce,
                createdAt: borrowDate,
                updatedAt: borrowDate,
            });
            copyStatusUpdates.push({ _id: freeCopy._id, status: 'BORROWED' });
            affectedBookIds.add(String(book._id));
            const _bk2 = seenBookCount.get(String(book._id)) || 0;
            seenBookCount.set(String(book._id), _bk2 + 1);

            if (isOverdue) {
                const od = calendarDaysLate(dueDate, now);
                if (od > 0) {
                    fineDocs.push({
                        mysqlId: random36(),
                        loanTicketId: ticketId,
                        userId,
                        studentId: student.studentId || null,
                        overdueDays: od,
                        fineAmount: od * 1000,
                        status: 'UNPAID',
                        reason: `Quá hạn ${od} ngày chưa trả`,
                        createdAt: now,
                        updatedAt: now,
                    });
                }
            }
            created += 1;
            addActiveSlots(userId, 1);
        } else {
            // CANCELLED — đăng ký nhưng huỷ
            loanDocs.push({
                _id: new mongoose.Types.ObjectId(),
                mysqlId: random36(),
                userId,
                fullName,
                phone,
                address: '',
                borrowDate,
                dueDate: null,
                returnedAt: null,
                status: 'CANCELLED',
                bookCopyIds: [],
                bookId: book._id,
                requestedQuantity: 1,
                renewalCount: 0,
                createdAt: borrowDate,
                updatedAt: borrowDate,
            });
            const _bk3 = seenBookCount.get(String(book._id)) || 0;
            seenBookCount.set(String(book._id), _bk3 + 1);
            created += 1;
        }

        if (created % 200 === 0) {
            console.log(`  ... đã chuẩn bị ${created}/${targetLoans} phiếu`);
        }
    }

    console.log(`[seed-ptit-demo] Chuẩn bị xong ${loanDocs.length} phiếu, ${fineDocs.length} biên lai phạt. Đang ghi DB...`);

    const BATCH = 500;
    for (let i = 0; i < loanDocs.length; i += BATCH) {
        await LoanTicketMongo.insertMany(loanDocs.slice(i, i + BATCH), { ordered: false });
    }
    if (fineDocs.length) {
        for (let i = 0; i < fineDocs.length; i += BATCH) {
            await FineTicketMongo.insertMany(fineDocs.slice(i, i + BATCH), { ordered: false });
        }
    }
    if (copyStatusUpdates.length) {
        const ids = copyStatusUpdates.map((c) => c._id);
        await BookCopyMongo.updateMany({ _id: { $in: ids } }, { $set: { status: 'BORROWED' } });
    }

    console.log(`[seed-ptit-demo] Đồng bộ stock cho ${affectedBookIds.size} đầu sách bị tồn kho thay đổi...`);
    for (const bid of affectedBookIds) {
        if (mongoose.isValidObjectId(bid)) {
            await syncBookInventoryFields(new mongoose.Types.ObjectId(bid));
        }
    }
    const totalBooks = allBooks.length;
    const exploited = seenBookCount.size;
    const coverage = ((exploited / totalBooks) * 100).toFixed(1);
    console.log(`[seed-ptit-demo] Độ phủ kho: ${exploited}/${totalBooks} đầu sách có phiếu mượn (${coverage}%).`);
    console.log(`[seed-ptit-demo] Hoàn tất ghi phiếu mượn.`);
}

async function run() {
    const args = parseArgs();
    await connectSeedMongo();

    if (args.clean) {
        await cleanPreviousSeed();
    }

    const students = await createStudents(args.users);
    if (!students.length) {
        console.warn('[seed-ptit-demo] Không có sinh viên — bỏ qua bước tạo phiếu.');
    } else {
        await createLoans(students, args.loans);
    }

    console.log('='.repeat(60));
    console.log('SEED PTIT DEMO — HOÀN TẤT');
    console.log(`  Sinh viên đã tạo: ${students.length}`);
    console.log(`  Mẫu MSV: ${students.slice(0, 5).map((s) => s.studentId).join(', ')}${students.length > 5 ? ' …' : ''}`);
    console.log('  Đăng nhập: 70% dùng email @stu.ptit.edu.vn theo MSV, 30% gmail/yahoo/outlook (mật khẩu chung: 123)');
    console.log('  Ví dụ: b22seedkhmt042@stu.ptit.edu.vn / 123');
    console.log('='.repeat(60));
}

run()
    .then(async () => {
        await disconnectSeedMongo();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error('[seed-ptit-demo] Lỗi:', err);
        await disconnectSeedMongo().catch(() => {});
        process.exit(1);
    });
