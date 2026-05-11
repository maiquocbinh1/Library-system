const crypto = require('crypto');
const mongoose = require('mongoose');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const CirculationReturnEventMongo = require('../models/circulationReturnEvent.mongo.model');

const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const SendMailBookBorrowConfirmation = require('../utils/SendMailSuccess');
const SendMailBookBorrowFailed = require('../utils/SendMailFail');
const { canBorrowAsPatron } = require('../utils/patronUser');
const { syncBookInventoryFields } = require('../utils/bookInventory');
const { getBorrowPolicyForUser, getPolicyByReaderType } = require('../utils/policyService');

// ─── helpers ──────────────────────────────────────────────────────────────────

function random36() { return crypto.randomUUID(); }

/** Số ngày trễ (tính theo ngày dương lịch). */
function calendarDaysLate(dueDate, returnAt) {
    const d0 = new Date(dueDate); d0.setHours(0, 0, 0, 0);
    const d1 = new Date(returnAt); d1.setHours(0, 0, 0, 0);
    return Math.max(0, Math.floor((d1.getTime() - d0.getTime()) / 86400000));
}

function toClientFine(doc) {
    if (!doc) return null;
    const raw = doc.toObject ? doc.toObject() : { ...doc };
    return {
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
        loanTicketId: raw.loanTicketId ? String(raw.loanTicketId) : undefined,
        userId: raw.userId,
        studentId: raw.studentId ?? null,
        overdueDays: raw.overdueDays,
        fineAmount: raw.fineAmount,
        status: raw.status,
        reason: raw.reason,
    };
}

async function findUserByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const u = await UserMongo.findById(id);
        if (u) return u;
    }
    return UserMongo.findOne({ mysqlId: String(id) });
}

async function findBookByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const b = await BookMongo.findById(id);
        if (b) return b;
    }
    return BookMongo.findOne({ mysqlId: String(id) });
}

async function findLoanByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const t = await LoanTicketMongo.findById(id);
        if (t) return t;
    }
    return LoanTicketMongo.findOne({ mysqlId: String(id) });
}

/**
 * Resolve đầu sách từ phiếu.
 * Ưu tiên field bookId mới; fallback sang copy đầu tiên (dữ liệu cũ).
 */
async function resolveBookFromTicket(ticket) {
    const raw = ticket.toObject ? ticket.toObject() : ticket;
    if (raw.bookId) return BookMongo.findById(raw.bookId);
    const ids = raw.bookCopyIds || [];
    if (!ids.length) return null;
    const first = await BookCopyMongo.findById(ids[0]).select('bookId').lean();
    if (!first?.bookId) return null;
    return BookMongo.findById(first.bookId);
}

function toClientBookEmbedded(book) {
    if (!book) return null;
    const plain = book.toObject ? book.toObject() : book;
    const title = plain.title || plain.nameProduct || '';
    return { ...plain, title, nameProduct: title, id: plain.mysqlId || (plain._id ? String(plain._id) : undefined) };
}

function toClientLoan(ticketDoc, extras = {}) {
    const raw = ticketDoc.toObject ? ticketDoc.toObject() : { ...ticketDoc };
    // PENDING: dùng requestedQuantity; các trạng thái khác: đếm bản sao thực tế
    const q = raw.status === 'PENDING_APPROVAL'
        ? (raw.requestedQuantity || 0)
        : (Array.isArray(raw.bookCopyIds) ? raw.bookCopyIds.length : 0);
    return {
        ...raw,
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
        quantity: q,
        product: extras.product ?? null,
        returnDate: raw.dueDate ?? null,
    };
}

/** Chi tiết bản sao + tên đầu sách cho Admin. */
async function buildBookCopiesWithTitles(ticketLean) {
    const copyIds = ticketLean.bookCopyIds || [];
    if (!copyIds.length) {
        // PENDING ticket — chưa có bản sao, trả info từ bookId
        if (ticketLean.bookId) {
            const book = await BookMongo.findById(ticketLean.bookId).select('title nameProduct image bookCode').lean();
            if (book) {
                return [{
                    copyId: null,
                    barcode: null,
                    status: 'PENDING',
                    bookId: String(ticketLean.bookId),
                    title: book.title || book.nameProduct || '—',
                    image: book.image || null,
                }];
            }
        }
        return [];
    }
    const copies = await BookCopyMongo.find({ _id: { $in: copyIds } }).lean();
    const bookMongoIds = [...new Set(copies.map((c) => c.bookId).filter(Boolean).map((id) => String(id)))];
    const books = await BookMongo.find({ _id: { $in: bookMongoIds } }).select('title nameProduct image').lean();
    const bookMap = new Map(books.map((b) => [String(b._id), b]));
    return copies.map((c) => {
        const b = c.bookId ? bookMap.get(String(c.bookId)) : null;
        const title = b ? b.title || b.nameProduct || '' : '';
        return { copyId: String(c._id), barcode: c.barcode, status: c.status, bookId: c.bookId ? String(c.bookId) : '', title: title || '—', image: b?.image || null };
    });
}

/**
 * Giống buildBookCopiesWithTitles nhưng dùng map đã nạp (tránh N+1 query khi list lớn).
 */
function buildBookCopiesWithTitlesFromMaps(ticketLean, copyById, bookMap) {
    const copyIds = ticketLean.bookCopyIds || [];
    if (!copyIds.length) {
        if (ticketLean.bookId) {
            const book = bookMap.get(String(ticketLean.bookId));
            if (book) {
                return [{
                    copyId: null,
                    barcode: null,
                    status: 'PENDING',
                    bookId: String(ticketLean.bookId),
                    title: book.title || book.nameProduct || '—',
                    image: book.image || null,
                }];
            }
        }
        return [];
    }
    const copies = copyIds.map((id) => copyById.get(String(id))).filter(Boolean);
    const bookMongoIds = [...new Set(copies.map((c) => c.bookId).filter(Boolean).map((id) => String(id)))];
    const booksNeeded = bookMongoIds.map((id) => bookMap.get(id)).filter(Boolean);
    const localBookMap = new Map(booksNeeded.map((b) => [String(b._id), b]));
    return copies.map((c) => {
        const b = c.bookId ? localBookMap.get(String(c.bookId)) : null;
        const title = b ? b.title || b.nameProduct || '' : '';
        return { copyId: String(c._id), barcode: c.barcode, status: c.status, bookId: c.bookId ? String(c.bookId) : '', title: title || '—', image: b?.image || null };
    });
}

function getUserIdCandidates(user) {
    const ids = [String(user._id)];
    if (user.mysqlId) ids.push(String(user.mysqlId));
    return ids;
}

async function countUnpaidFinesForUser(user) {
    if (!user) return 0;
    const userIds = getUserIdCandidates(user);
    return FineTicketMongo.countDocuments({ userId: { $in: userIds }, status: 'UNPAID' });
}

/**
 * Tổng số lượng sách sinh viên đang giữ + chờ duyệt.
 * PENDING → dùng requestedQuantity; BORROWING/OVERDUE → đếm bản sao thực tế.
 */
async function getActiveBorrowTotalQuantity(user) {
    const userIds = getUserIdCandidates(user);

    const pendingRows = await LoanTicketMongo.find({
        userId: { $in: userIds },
        status: 'PENDING_APPROVAL',
    }).select('requestedQuantity').lean();
    const pendingQty = pendingRows.reduce((s, r) => s + (r.requestedQuantity || 0), 0);

    const activeRows = await LoanTicketMongo.find({
        userId: { $in: userIds },
        status: { $in: ['BORROWING', 'OVERDUE'] },
    }).select('bookCopyIds').lean();
    const activeQty = activeRows.reduce((s, r) => s + (Array.isArray(r.bookCopyIds) ? r.bookCopyIds.length : 0), 0);

    return pendingQty + activeQty;
}

async function hasOverdueBorrow(user) {
    const userIds = getUserIdCandidates(user);
    const now = new Date();
    const overdue = await LoanTicketMongo.findOne({
        userId: { $in: userIds },
        status: { $in: ['BORROWING', 'OVERDUE'] },
        dueDate: { $ne: null, $lt: now },
    }).lean();
    return Boolean(overdue);
}

/** Tạo FineTicket nếu trễ hạn; trả về doc hoặc null. */
async function createFineIfOverdue(ticket) {
    if (!ticket.dueDate) return null;
    const now = new Date();
    const overdueDays = calendarDaysLate(ticket.dueDate, now);
    if (overdueDays <= 0) return null;

    const borrower = await findUserByAnyId(ticket.userId);
    if (!borrower) return null;

    const policy = borrower.readerType ? await getPolicyByReaderType(borrower.readerType) : null;
    const rate = Number(policy?.overdueFinePerDay ?? 1000);
    const copyCount = Array.isArray(ticket.bookCopyIds) ? ticket.bookCopyIds.length : 1;
    const fineAmount = Math.round(overdueDays * rate * copyCount);
    const reason = `Trả trễ hạn ${overdueDays} ngày cho ${copyCount} cuốn sách`;

    return FineTicketMongo.create({
        mysqlId: random36(),
        loanTicketId: ticket._id,
        userId: String(ticket.userId),
        studentId: borrower.studentId || borrower.idStudent || null,
        overdueDays,
        fineAmount,
        status: 'UNPAID',
        reason,
    });
}

const RETURN_ERR_NOT_ON_LOAN = 'Mã sách không tồn tại hoặc sách này không ở trạng thái đang cho mượn!';
const RETURN_ERR_NO_ACTIVE_TICKET = 'Lỗi dữ liệu: không tìm thấy phiếu mượn đang chứa bản sao này.';

/**
 * Nhận trả một bản sao theo barcode (không cần loanTicketId).
 * Phạt trễ hạn: mỗi lần trả trễ tạo một FineTicket — overdueDays × 1000 VNĐ (theo ngày dương lịch).
 * @returns {Promise<object>}
 */
async function executeReturnOneBarcode(inputBarcode, req) {
    const barcode = String(inputBarcode || '').trim();
    if (!barcode) throw new BadRequestError('Vui lòng nhập barcode');

    const copy = await BookCopyMongo.findOne({ barcode });
    if (!copy || copy.status !== 'BORROWED') {
        throw new BadRequestError(RETURN_ERR_NOT_ON_LOAN);
    }

    const ticket = await LoanTicketMongo.findOne({
        bookCopyIds: copy._id,
        status: { $in: ['BORROWING', 'OVERDUE'] },
    });
    if (!ticket) {
        throw new BadRequestError(RETURN_ERR_NO_ACTIVE_TICKET);
    }

    const now = new Date();
    copy.status = 'AVAILABLE';
    await copy.save();

    ticket.bookCopyIds = (ticket.bookCopyIds || []).filter((id) => String(id) !== String(copy._id));

    let overdueDays = 0;
    let fineDoc = null;
    let fineAmount = 0;
    if (ticket.dueDate) {
        overdueDays = calendarDaysLate(ticket.dueDate, now);
        if (overdueDays > 0) {
            const borrower = await findUserByAnyId(ticket.userId);
            fineAmount = overdueDays * 1000;
            fineDoc = await FineTicketMongo.create({
                mysqlId: random36(),
                loanTicketId: ticket._id,
                userId: String(ticket.userId),
                studentId: borrower?.studentId || borrower?.idStudent || null,
                overdueDays,
                fineAmount,
                status: 'UNPAID',
                reason: `Trả trễ cuốn ${barcode} quá hạn ${overdueDays} ngày`,
            });
        }
    }

    let ticketClosed = false;
    if (ticket.bookCopyIds.length === 0) {
        ticket.status = 'RETURNED';
        ticket.returnedAt = now;
        ticketClosed = true;
    }
    await ticket.save();

    const book = await BookMongo.findById(copy.bookId);
    if (book) await syncBookInventoryFields(book._id);
    const bookLean = book?.toObject ? book.toObject() : book;
    const bookTitle = bookLean?.title || bookLean?.nameProduct || '—';
    const borrower = await findUserByAnyId(ticket.userId);
    const borrowerStudentId = borrower?.studentId || borrower?.idStudent || borrower?.readerCode || '';
    const borrowerName = borrower?.fullName || '';

    try {
        await CirculationReturnEventMongo.create({
            mysqlId: random36(),
            barcode: String(barcode).trim().toUpperCase(),
            bookTitle,
            borrowerStudentId,
            borrowerName,
            ticketId: String(ticket._id),
            fineAmount,
            onTime: overdueDays === 0,
            recordedAt: new Date(),
            staffUserId: req.user?.id ? String(req.user.id) : null,
        });
    } catch (logErr) {
        console.error('[executeReturnOneBarcode] circulation_return_events:', logErr.message);
    }

    return {
        barcode,
        overdueDays,
        fineAmount,
        fineDoc,
        ticket,
        ticketClosed,
        remainingCopies: ticket.bookCopyIds.length,
        bookTitle,
        borrowerStudentId,
        borrowerName,
    };
}

/**
 * Xuất kho: phiếu PENDING_APPROVAL → BORROWING, gắn bản sao theo đúng barcode.
 * @param {import('mongoose').Document} ticket — document đã có bookId, requestedQuantity
 * @param {string[]} trimmedBarcodes — độ dài = ticket.requestedQuantity
 */
async function applyConfirmBorrowToPendingTicket(ticket, trimmedBarcodes) {
    if (ticket.status !== 'PENDING_APPROVAL') throw new BadRequestError('Phiếu không ở trạng thái chờ duyệt');
    if (!ticket.bookId) throw new BadRequestError('Phiếu không có thông tin đầu sách');
    if (trimmedBarcodes.length !== ticket.requestedQuantity) {
        throw new BadRequestError(
            `Cần đúng ${ticket.requestedQuantity} mã vạch, hiện có ${trimmedBarcodes.length}`,
        );
    }

    const copies = await BookCopyMongo.find({ barcode: { $in: trimmedBarcodes } });
    const foundBarcodes = copies.map((c) => c.barcode);
    const notFound = trimmedBarcodes.filter((b) => !foundBarcodes.includes(b));
    if (notFound.length > 0) throw new BadRequestError(`Mã vạch không tồn tại trong hệ thống: ${notFound.join(', ')}`);

    const notAvailable = copies.filter((c) => c.status !== 'AVAILABLE');
    if (notAvailable.length > 0) {
        throw new BadRequestError(`Các mã vạch đang không sẵn sàng: ${notAvailable.map((c) => c.barcode).join(', ')}`);
    }

    const wrongBook = copies.filter((c) => String(c.bookId) !== String(ticket.bookId));
    if (wrongBook.length > 0) {
        throw new BadRequestError(`Mã vạch không thuộc đầu sách của phiếu này: ${wrongBook.map((c) => c.barcode).join(', ')}`);
    }

    const borrower = await findUserByAnyId(ticket.userId);
    if (!borrower) throw new BadRequestError('Không tìm thấy người mượn');
    const policy = await getBorrowPolicyForUser(borrower);

    const due = new Date();
    due.setHours(0, 0, 0, 0);
    due.setDate(due.getDate() + Number(policy.loanDays));

    const copyIds = copies.map((c) => c._id);

    await BookCopyMongo.updateMany({ _id: { $in: copyIds } }, { $set: { status: 'BORROWED' } });

    ticket.bookCopyIds = copyIds;
    ticket.status = 'BORROWING';
    ticket.dueDate = due;
    await ticket.save();

    const book = await findBookByAnyId(String(ticket.bookId));
    if (book) await syncBookInventoryFields(book._id);

    try {
        if (borrower?.email && book) {
            await SendMailBookBorrowConfirmation(borrower.email, toClientBookEmbedded(book), ticket.borrowDate, ticket.dueDate);
        }
    } catch { /* không chặn nếu email lỗi */ }

    return { ticket, book, copies, due };
}

// ─── Controller ───────────────────────────────────────────────────────────────

class loanTicketController {
    /**
     * [BƯỚC 2] Sinh viên đặt mượn online.
     * Chỉ kiểm tra tồn kho, KHÔNG giữ chỗ bản sao.
     * bookCopyIds để rỗng — thủ thư điền khi confirm-borrow.
     */
    async createHistoryBook(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');
        if (!canBorrowAsPatron(user)) throw new BadRequestError('Bạn chưa có MSV hợp lệ hoặc đang chờ thư viện xác nhận');

        const borrowPolicy = await getBorrowPolicyForUser(user);
        const overdueBorrow = await hasOverdueBorrow(user);
        if (overdueBorrow) throw new BadRequestError('Bạn đang có sách quá hạn chưa trả, vui lòng hoàn tất trước khi mượn thêm');

        const { fullName, phoneNumber, address, bookId, borrowDate, quantity } = req.body;
        if (!fullName || !phoneNumber || !address || !bookId || !quantity) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        const quantityNumber = Number(quantity);
        if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
            throw new BadRequestError('Số lượng mượn không hợp lệ');
        }

        const activeBorrowQty = await getActiveBorrowTotalQuantity(user);
        if (activeBorrowQty + quantityNumber > borrowPolicy.maxBooks) {
            throw new BadRequestError(
                `Bạn chỉ được mượn tối đa ${borrowPolicy.maxBooks} ấn phẩm (đang giữ ${activeBorrowQty}, yêu cầu thêm ${quantityNumber})`,
            );
        }

        const borrowDateValue = borrowDate ? new Date(borrowDate) : new Date();
        if (Number.isNaN(borrowDateValue.getTime())) throw new BadRequestError('Ngày mượn không hợp lệ');

        const existedBook = await findBookByAnyId(bookId);
        if (!existedBook) throw new BadRequestError('Sách không tồn tại');

        // Kiểm tra tồn kho (KHÔNG giữ chỗ)
        const availableCount = await BookCopyMongo.countDocuments({ bookId: existedBook._id, status: 'AVAILABLE' });
        if (availableCount < quantityNumber) {
            throw new BadRequestError(`Không đủ sách vật lý sẵn sàng (hiện có ${availableCount} bản, bạn cần ${quantityNumber})`);
        }

        const ticket = await LoanTicketMongo.create({
            mysqlId: random36(),
            fullName,
            phone: phoneNumber,
            address,
            borrowDate: borrowDateValue,
            dueDate: null,
            userId: String(user._id),
            bookId: existedBook._id,
            requestedQuantity: quantityNumber,
            bookCopyIds: [],          // Thủ thư sẽ điền khi xuất kho
            status: 'PENDING_APPROVAL',
        });

        new Created({
            message: 'Đặt mượn thành công. Vui lòng đến thư viện nhận sách.',
            metadata: toClientLoan(ticket, { product: toClientBookEmbedded(existedBook) }),
        }).send(res);
    }

    /**
     * [BƯỚC 3] Thủ thư xác nhận xuất kho — gõ barcode từng cuốn vật lý.
     * PUT /api/history-book/confirm-borrow
     * Body: { loanTicketId, barcodes: ["DNT-01", "DNT-02"] }
     */
    async confirmBorrow(req, res) {
        const { loanTicketId, barcodes } = req.body;
        if (!loanTicketId) throw new BadRequestError('Thiếu loanTicketId');
        if (!Array.isArray(barcodes) || !barcodes.length) throw new BadRequestError('Vui lòng nhập ít nhất một mã sách');

        const ticket = await findLoanByAnyId(loanTicketId);
        if (!ticket) throw new BadRequestError('Không tìm thấy phiếu mượn');

        const trimmedBarcodes = barcodes.map((b) => String(b || '').trim()).filter(Boolean);
        const { ticket: t2, book, copies, due } = await applyConfirmBorrowToPendingTicket(ticket, trimmedBarcodes);

        new OK({
            message: `Xuất kho thành công ${copies.length} cuốn. Hạn trả: ${due.toLocaleDateString('vi-VN')}`,
            metadata: {
                ticket: toClientLoan(t2, { product: toClientBookEmbedded(book) }),
                barcodes: copies.map((c) => c.barcode),
                dueDate: due,
            },
        }).send(res);
    }

    /**
     * Thủ thư lập phiếu tại quầy: chọn độc giả + quét nhiều barcode (nhiều đầu sách) → tạo phiếu và xuất kho ngay.
     * POST /api/history-book/staff-desk-issue
     */
    async staffDeskIssue(req, res) {
        const { userId, barcodes } = req.body;
        if (!userId) throw new BadRequestError('Thiếu thông tin độc giả');
        if (!Array.isArray(barcodes) || !barcodes.length) throw new BadRequestError('Thiếu danh sách mã vạch');

        const patron = await findUserByAnyId(userId);
        if (!patron) throw new BadRequestError('Không tìm thấy độc giả');
        if (!canBorrowAsPatron(patron)) throw new BadRequestError('Độc giả không đủ điều kiện mượn');
        if (await hasOverdueBorrow(patron)) throw new BadRequestError('Độc giả đang có sách quá hạn chưa trả');

        const policy = await getBorrowPolicyForUser(patron);
        const trimmed = [...new Set(barcodes.map((b) => String(b || '').trim()).filter(Boolean))];
        if (!trimmed.length) throw new BadRequestError('Thiếu danh sách mã vạch');

        const activeBorrowQty = await getActiveBorrowTotalQuantity(patron);
        if (activeBorrowQty + trimmed.length > policy.maxBooks) {
            throw new BadRequestError(
                `Vượt giới hạn mượn: tối đa ${policy.maxBooks} ấn phẩm (đang giữ/chờ ${activeBorrowQty}, thêm ${trimmed.length})`,
            );
        }

        const copies = await BookCopyMongo.find({ barcode: { $in: trimmed } });
        const foundBarcodes = copies.map((c) => c.barcode);
        const notFound = trimmed.filter((b) => !foundBarcodes.includes(b));
        if (notFound.length > 0) throw new BadRequestError(`Mã vạch không tồn tại: ${notFound.join(', ')}`);

        const notAvailable = copies.filter((c) => c.status !== 'AVAILABLE');
        if (notAvailable.length > 0) {
            throw new BadRequestError(`Bản sao không sẵn sàng: ${notAvailable.map((c) => `${c.barcode} (${c.status})`).join(', ')}`);
        }

        const byBook = new Map();
        for (const c of copies) {
            const bid = String(c.bookId);
            if (!byBook.has(bid)) byBook.set(bid, []);
            byBook.get(bid).push(c);
        }

        const issued = [];
        const now = new Date();

        for (const [, copyList] of byBook) {
            const existedBook = await findBookByAnyId(String(copyList[0].bookId));
            if (!existedBook) throw new BadRequestError('Lỗi dữ liệu đầu sách');

            const qty = copyList.length;
            const groupBarcodes = copyList.map((c) => c.barcode);

            const ticket = await LoanTicketMongo.create({
                mysqlId: random36(),
                fullName: patron.fullName,
                phone: patron.phone || '',
                address: patron.address || '',
                borrowDate: now,
                dueDate: null,
                userId: String(patron._id),
                bookId: existedBook._id,
                requestedQuantity: qty,
                bookCopyIds: [],
                status: 'PENDING_APPROVAL',
            });

            const { ticket: saved, book, due } = await applyConfirmBorrowToPendingTicket(ticket, groupBarcodes);
            issued.push({
                ticket: toClientLoan(saved, { product: toClientBookEmbedded(book) }),
                barcodes: groupBarcodes,
                dueDate: due,
            });
        }

        new OK({
            message: `Đã cho mượn ${trimmed.length} cuốn (${issued.length} phiếu)`,
            metadata: { tickets: issued, loanDays: policy.loanDays },
        }).send(res);
    }

    /**
     * Nhận trả sách (một barcode) — payload: { barcode }.
     * POST /api/history-book/return-book
     */
    async returnBook(req, res) {
        const barcode = String(req.body?.barcode ?? '').trim();
        if (!barcode) throw new BadRequestError('Vui lòng nhập barcode');

        const result = await executeReturnOneBarcode(barcode, req);
        const fineVnd = `${Number(result.fineAmount || 0).toLocaleString('vi-VN')} VNĐ`;

        const message =
            result.overdueDays > 0 && result.fineAmount > 0
                ? `Đã nhận trả cuốn ${result.barcode}. CẢNH BÁO: Sách trễ hạn ${result.overdueDays} ngày, hệ thống đã tự động ghi nhận khoản nợ ${fineVnd}!`
                : `Đã nhận trả cuốn ${result.barcode} thành công.`;

        new OK({
            message,
            metadata: {
                barcode: result.barcode,
                overdueDays: result.overdueDays,
                fineAmount: result.fineAmount,
                fine: result.fineDoc ? toClientFine(result.fineDoc) : null,
                ticketId: String(result.ticket._id),
                ticketStatus: result.ticket.status,
                ticketClosed: result.ticketClosed,
                remainingCopies: result.remainingCopies,
                bookTitle: result.bookTitle,
                borrowerStudentId: result.borrowerStudentId,
                borrowerName: result.borrowerName,
            },
        }).send(res);
    }

    /**
     * Trả sách theo danh sách barcode (mỗi mã dùng cùng luồng return-book).
     * POST /api/history-book/return-by-barcode
     * Body: { barcodes: ["..."] } hoặc { barcode: "..." } (một mã).
     */
    async returnByBarcode(req, res) {
        const rawList = Array.isArray(req.body?.barcodes)
            ? req.body.barcodes
            : req.body?.barcode != null && String(req.body.barcode).trim()
              ? [req.body.barcode]
              : [];
        if (!rawList.length) throw new BadRequestError('Vui lòng nhập ít nhất một mã sách');

        const results = [];

        for (const rawBarcode of rawList) {
            const barcode = String(rawBarcode || '').trim();
            if (!barcode) continue;

            try {
                const result = await executeReturnOneBarcode(barcode, req);
                const isFullyReturned = result.ticketClosed;
                const fineVnd = `${Number(result.fineAmount || 0).toLocaleString('vi-VN')} VNĐ`;
                let message;
                if (isFullyReturned) {
                    message =
                        result.overdueDays > 0 && result.fineAmount > 0
                            ? `Đã nhận trả cuốn ${result.barcode}. CẢNH BÁO: Sách trễ hạn ${result.overdueDays} ngày, hệ thống đã tự động ghi nhận khoản nợ ${fineVnd}!`
                            : `Đã nhận trả cuốn ${result.barcode} thành công.`;
                } else if (result.overdueDays > 0 && result.fineAmount > 0) {
                    message = `Đã nhận trả cuốn ${result.barcode}. CẢNH BÁO: Sách trễ hạn ${result.overdueDays} ngày, hệ thống đã tự động ghi nhận khoản nợ ${fineVnd}! Phiếu còn ${result.remainingCopies} cuốn chưa trả.`;
                } else {
                    message = `Đã nhận trả cuốn ${result.barcode} thành công. Phiếu còn ${result.remainingCopies} cuốn chưa trả.`;
                }

                results.push({
                    barcode: result.barcode,
                    success: true,
                    message,
                    ticketId: String(result.ticket._id),
                    ticketStatus: result.ticket.status,
                    fine: result.fineDoc ? toClientFine(result.fineDoc) : null,
                    overdueDays: result.overdueDays,
                    remainingCopies: result.remainingCopies,
                    bookTitle: result.bookTitle,
                    borrowerStudentId: result.borrowerStudentId,
                    borrowerName: result.borrowerName,
                    returnedAt: new Date().toISOString(),
                    fineAmount: result.fineAmount,
                    onTime: result.overdueDays === 0,
                });
            } catch (err) {
                const msg = err instanceof BadRequestError ? err.message : err.message || 'Lỗi xử lý';
                results.push({ barcode, success: false, message: msg });
            }
        }

        const successCount = results.filter((r) => r.success).length;
        new OK({
            message: `Đã xử lý ${results.length} mã vạch — ${successCount} thành công`,
            metadata: results,
        }).send(res);
    }

    async getReturnsToday(req, res) {
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        const end = new Date();
        end.setHours(23, 59, 59, 999);

        const staffId = req.user?.id ? String(req.user.id) : null;
        const filter = { recordedAt: { $gte: start, $lte: end } };
        if (staffId) filter.staffUserId = staffId;

        const list = await CirculationReturnEventMongo.find(filter).sort({ recordedAt: -1 }).limit(500).lean();
        const metadata = list.map((x) => ({
            key: String(x._id),
            bookTitle: x.bookTitle,
            barcode: x.barcode,
            borrowerStudentId: x.borrowerStudentId || '',
            borrowerName: x.borrowerName || '',
            returnedAt: x.recordedAt,
            fineAmount: Number(x.fineAmount) || 0,
            onTime: Boolean(x.onTime),
        }));
        new OK({ message: 'OK', metadata }).send(res);
    }

    /**
     * Kiểm tra thông tin một barcode (dùng khi thủ thư gõ mã để xem cuốn đó là gì).
     * GET /api/history-book/check-barcode?barcode=DNT-01
     */
    async checkBarcode(req, res) {
        const barcode = String(req.query.barcode || '').trim();
        if (!barcode) throw new BadRequestError('Vui lòng nhập mã vạch');

        const copy = await BookCopyMongo.findOne({ barcode }).lean();
        if (!copy) throw new BadRequestError(`Mã vạch "${barcode}" không tồn tại trong hệ thống`);

        const book = copy.bookId ? await BookMongo.findById(copy.bookId).select('title nameProduct bookCode image').lean() : null;
        const title = book?.title || book?.nameProduct || '—';

        new OK({
            message: 'Tìm thấy bản sao',
            metadata: {
                barcode: copy.barcode,
                copyId: String(copy._id),
                status: copy.status,
                condition: copy.condition,
                bookId: copy.bookId ? String(copy.bookId) : null,
                bookCode: book?.bookCode || '',
                title,
                image: book?.image || null,
            },
        }).send(res);
    }

    // ─── Các API hiện tại (giữ nguyên) ───────────────────────────────────────

    async getHistoryUser(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');

        const userIds = [String(user._id)];
        if (user.mysqlId) userIds.push(String(user.mysqlId));

        const list = await LoanTicketMongo.find({ userId: { $in: userIds } }).sort({ createdAt: -1 }).lean();
        const data = await Promise.all(list.map(async (item) => {
            const book = await resolveBookFromTicket(item);
            return toClientLoan(item, { product: toClientBookEmbedded(book) });
        }));
        new OK({ message: 'Get history book success', metadata: data }).send(res);
    }

    async cancelBook(req, res) {
        const { id } = req.user;
        const { idHistory } = req.body;

        const user = await findUserByAnyId(id);
        if (!user) throw new BadRequestError('Người dùng không tồn tại');

        const ticket = await findLoanByAnyId(idHistory);
        if (!ticket) throw new BadRequestError('Lịch sử mượn không tồn tại');

        const userIds = [String(user._id)];
        if (user.mysqlId) userIds.push(String(user.mysqlId));
        if (!userIds.includes(String(ticket.userId))) throw new BadRequestError('Lịch sử mượn không tồn tại');
        if (ticket.status !== 'PENDING_APPROVAL') throw new BadRequestError('Chỉ có thể huỷ phiếu đang chờ duyệt');

        ticket.status = 'CANCELLED';
        await ticket.save();

        // PENDING tickets không có bản sao giữ chỗ — nhưng handle edge case nếu có
        if (ticket.bookCopyIds?.length) {
            await BookCopyMongo.updateMany({ _id: { $in: ticket.bookCopyIds } }, { $set: { status: 'AVAILABLE' } });
            const book = await resolveBookFromTicket(ticket);
            if (book) await syncBookInventoryFields(book._id);
        }

        new OK({ message: 'Hủy phiếu mượn thành công' }).send(res);
    }

    /**
     * Trả sách theo loanTicketId (giữ nguyên cho tương thích ngược).
     * Thủ thư nên dùng returnByBarcode trong luồng mới.
     */
    async returnBooks(req, res) {
        const { loanTicketId } = req.body;
        if (!loanTicketId) throw new BadRequestError('Thiếu loanTicketId');

        const findTicket = await findLoanByAnyId(loanTicketId);
        if (!findTicket) throw new BadRequestError('Không tìm thấy phiếu mượn');
        if (findTicket.status === 'RETURNED') throw new BadRequestError('Phiếu đã được trả');
        if (!['BORROWING', 'OVERDUE'].includes(findTicket.status)) throw new BadRequestError('Chỉ xác nhận trả khi phiếu đang mượn hoặc quá hạn');
        if (!findTicket.dueDate) throw new BadRequestError('Phiếu không có hạn trả');

        const copyIds = findTicket.bookCopyIds || [];
        const now = new Date();

        let fineDoc = null;
        if (findTicket.dueDate) {
            fineDoc = await createFineIfOverdue(findTicket);
        }

        if (copyIds.length) {
            await BookCopyMongo.updateMany({ _id: { $in: copyIds } }, { $set: { status: 'AVAILABLE' } });
        }

        findTicket.status = 'RETURNED';
        findTicket.returnedAt = now;
        findTicket.bookCopyIds = [];
        await findTicket.save();

        const findBook = await resolveBookFromTicket(findTicket);
        if (findBook) await syncBookInventoryFields(findBook._id);

        const overdueDays = findTicket.dueDate ? calendarDaysLate(findTicket.dueDate, now) : 0;
        new OK({
            message: fineDoc ? 'Trả sách thành công. Đã ghi nhận phạt quá hạn.' : 'Trả sách thành công.',
            metadata: {
                loan: toClientLoan(findTicket, { product: toClientBookEmbedded(findBook) }),
                fine: fineDoc ? toClientFine(fineDoc) : null,
                overdueDays,
                copyCount: copyIds.length,
            },
        }).send(res);
    }

    async getAllHistoryBook(req, res) {
        const rawLimit = parseInt(String(req.query.limit ?? ''), 10);
        const DEFAULT_LIMIT = 1500;
        const MAX_LIMIT = 4000;
        const limit = Number.isFinite(rawLimit) && rawLimit > 0
            ? Math.min(rawLimit, MAX_LIMIT)
            : DEFAULT_LIMIT;

        const list = await LoanTicketMongo.find({})
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        const allCopyIdSet = new Set();
        const bookIdSet = new Set();
        const userIdSet = new Set();
        for (const item of list) {
            if (item.userId != null) userIdSet.add(String(item.userId));
            if (item.bookId) bookIdSet.add(String(item.bookId));
            for (const cid of item.bookCopyIds || []) {
                if (cid) allCopyIdSet.add(String(cid));
            }
        }

        const copyOids = [...allCopyIdSet]
            .filter((id) => mongoose.isValidObjectId(id))
            .map((id) => new mongoose.Types.ObjectId(id));
        const copies = copyOids.length
            ? await BookCopyMongo.find({ _id: { $in: copyOids } }).lean()
            : [];
        const copyById = new Map(copies.map((c) => [String(c._id), c]));
        for (const c of copies) {
            if (c.bookId) bookIdSet.add(String(c.bookId));
        }

        const bookOids = [...bookIdSet]
            .filter((id) => mongoose.isValidObjectId(id))
            .map((id) => new mongoose.Types.ObjectId(id));
        const books = bookOids.length
            ? await BookMongo.find({ _id: { $in: bookOids } }).lean()
            : [];
        const bookMap = new Map(books.map((b) => [String(b._id), b]));

        const orConds = [];
        for (const uid of userIdSet) {
            if (mongoose.isValidObjectId(uid)) {
                orConds.push({ _id: new mongoose.Types.ObjectId(uid) });
            }
            orConds.push({ mysqlId: uid });
        }
        const users = orConds.length ? await UserMongo.find({ $or: orConds }).lean() : [];
        const patronByKey = new Map();
        for (const u of users) {
            patronByKey.set(String(u._id), u);
            if (u.mysqlId) patronByKey.set(String(u.mysqlId), u);
        }

        const data = list.map((item) => {
            const bookCopies = buildBookCopiesWithTitlesFromMaps(item, copyById, bookMap);
            const patron = patronByKey.get(String(item.userId)) || null;
            const borrowerStudentId = patron?.studentId || patron?.idStudent || null;

            let product = null;
            if (item.bookId) {
                const bm = bookMap.get(String(item.bookId));
                product = bm ? toClientBookEmbedded(bm) : null;
            }
            if (!product && bookCopies.length && bookCopies[0].bookId) {
                const bm = bookMap.get(String(bookCopies[0].bookId));
                product = bm ? toClientBookEmbedded(bm) : null;
            }

            return { ...toClientLoan(item, { product }), bookCopies, borrowerStudentId };
        });
        new OK({ message: 'Get all history book success', metadata: data }).send(res);
    }

    async updateStatusBook(req, res) {
        const { idHistory, status, productId, userId } = req.body;
        const legacyMap = { pending: 'PENDING_APPROVAL', success: 'BORROWING', cancel: 'CANCELLED' };
        const next = legacyMap[status] || String(status || '').trim();
        const validNext = ['CANCELLED', 'OVERDUE'];
        if (!validNext.includes(next)) {
            throw new BadRequestError(`Trạng thái không hợp lệ. Để duyệt phiếu, dùng API confirm-borrow với barcode.`);
        }

        const findTicket = await findLoanByAnyId(idHistory);
        if (!findTicket) throw new BadRequestError('Lịch sử mượn không tồn tại');
        const findUser = await findUserByAnyId(userId || findTicket.userId);
        let findBook = await findBookByAnyId(productId);
        if (!findBook) findBook = await resolveBookFromTicket(findTicket);
        if (findTicket.status === next) throw new BadRequestError('Phiếu mượn đã ở trạng thái này');
        if (findTicket.status === 'CANCELLED') throw new BadRequestError('Phiếu đã huỷ');
        if (findTicket.status === 'RETURNED') throw new BadRequestError('Phiếu đã trả');

        const copyIds = findTicket.bookCopyIds || [];

        if (next === 'CANCELLED') {
            if (copyIds.length) {
                await BookCopyMongo.updateMany({ _id: { $in: copyIds } }, { $set: { status: 'AVAILABLE' } });
                if (findBook) await syncBookInventoryFields(findBook._id);
            }
            findTicket.status = 'CANCELLED';
            await findTicket.save();
            if (findUser && findBook) {
                try { await SendMailBookBorrowFailed(findUser.email, toClientBookEmbedded(findBook)); } catch { }
            }
        } else if (next === 'OVERDUE') {
            if (findTicket.status !== 'BORROWING') throw new BadRequestError('Chỉ đánh dấu quá hạn khi đang mượn');
            findTicket.status = 'OVERDUE';
            await findTicket.save();
        }

        new OK({ message: 'Cập nhật trạng thái thành công' }).send(res);
    }

    /**
     * Gợi ý độc giả tại quầy (MSV, tên, email).
     * GET /api/history-book/find-patrons?q=...
     */
    async findPatronsForDesk(req, res) {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) {
            new OK({ message: 'OK', metadata: [] }).send(res);
            return;
        }
        const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(escaped, 'i');
        const list = await UserMongo.find({
            role: 'user',
            $or: [{ fullName: rx }, { studentId: rx }, { idStudent: rx }, { email: rx }],
        })
            .limit(20)
            .select('fullName studentId idStudent email mysqlId libraryCardBlocked readerType')
            .lean();
        const metadata = list.map((u) => ({
            id: String(u._id),
            fullName: u.fullName,
            studentId: u.studentId || u.idStudent || '',
            email: u.email || '',
            readerType: u.readerType,
            libraryCardBlocked: Boolean(u.libraryCardBlocked),
        }));
        new OK({ message: 'OK', metadata }).send(res);
    }

    /**
     * Gia hạn một phiếu mượn đang mượn (chưa quá hạn theo lịch), tối đa 1 lần, không nợ phạt.
     * POST /api/history-book/renew-loan  body: { loanTicketId }
     */
    async renewLoan(req, res) {
        const { loanTicketId } = req.body || {};
        const ticket = await findLoanByAnyId(loanTicketId);
        if (!ticket) throw new BadRequestError('Không tìm thấy phiếu mượn');
        if (ticket.status !== 'BORROWING') {
            throw new BadRequestError(
                ticket.status === 'OVERDUE'
                    ? 'Phiếu quá hạn — không thể gia hạn'
                    : 'Chỉ gia hạn phiếu đang mượn (chưa quá hạn)',
            );
        }
        if (!ticket.dueDate) throw new BadRequestError('Phiếu không có hạn trả');

        const patron = await findUserByAnyId(ticket.userId);
        if (!patron) throw new BadRequestError('Không tìm thấy độc giả');

        const unpaid = await countUnpaidFinesForUser(patron);
        if (unpaid > 0) throw new BadRequestError('Độc giả còn phạt chưa thanh toán — không thể gia hạn');

        if ((ticket.renewalCount || 0) >= 1) throw new BadRequestError('Đã hết lượt gia hạn (tối đa 1 lần / phiếu)');

        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const dueNorm = new Date(ticket.dueDate);
        dueNorm.setHours(0, 0, 0, 0);
        if (dueNorm < startOfToday) throw new BadRequestError('Đã quá hạn trả — không thể gia hạn');

        const policy = await getBorrowPolicyForUser(patron);
        const ext =
            policy?.renewExtensionDays != null && [7, 14].includes(Number(policy.renewExtensionDays))
                ? Number(policy.renewExtensionDays)
                : 14;
        const newDue = new Date(dueNorm);
        newDue.setDate(newDue.getDate() + ext);

        ticket.dueDate = newDue;
        ticket.renewalCount = (ticket.renewalCount || 0) + 1;
        await ticket.save();

        new OK({
            message: 'Gia hạn thành công',
            metadata: {
                loanTicketId: String(ticket._id),
                dueDate: newDue,
                renewalCount: ticket.renewalCount,
                loanDaysAdded: ext,
                renewExtensionDays: ext,
            },
        }).send(res);
    }
}

module.exports = new loanTicketController();
