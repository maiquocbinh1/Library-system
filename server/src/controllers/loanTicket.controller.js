const crypto = require('crypto');
const mongoose = require('mongoose');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');

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

function getUserIdCandidates(user) {
    const ids = [String(user._id)];
    if (user.mysqlId) ids.push(String(user.mysqlId));
    return ids;
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
        if (ticket.status !== 'PENDING_APPROVAL') throw new BadRequestError('Phiếu không ở trạng thái chờ duyệt');
        if (!ticket.bookId) throw new BadRequestError('Phiếu không có thông tin đầu sách');

        const trimmedBarcodes = barcodes.map((b) => String(b || '').trim()).filter(Boolean);
        if (trimmedBarcodes.length !== ticket.requestedQuantity) {
            throw new BadRequestError(
                `Sinh viên yêu cầu ${ticket.requestedQuantity} cuốn, bạn đang xác nhận ${trimmedBarcodes.length} mã vạch`,
            );
        }

        // Tìm các bản sao theo barcode
        const copies = await BookCopyMongo.find({ barcode: { $in: trimmedBarcodes } });
        const foundBarcodes = copies.map((c) => c.barcode);
        const notFound = trimmedBarcodes.filter((b) => !foundBarcodes.includes(b));
        if (notFound.length > 0) throw new BadRequestError(`Mã vạch không tồn tại trong hệ thống: ${notFound.join(', ')}`);

        // Tất cả phải AVAILABLE
        const notAvailable = copies.filter((c) => c.status !== 'AVAILABLE');
        if (notAvailable.length > 0) {
            throw new BadRequestError(`Các mã vạch đang không sẵn sàng: ${notAvailable.map((c) => c.barcode).join(', ')}`);
        }

        // Tất cả phải thuộc đúng đầu sách của phiếu
        const wrongBook = copies.filter((c) => String(c.bookId) !== String(ticket.bookId));
        if (wrongBook.length > 0) {
            throw new BadRequestError(`Mã vạch không thuộc đầu sách của phiếu mượn này: ${wrongBook.map((c) => c.barcode).join(', ')}`);
        }

        // Lấy policy để tính dueDate
        const borrower = await findUserByAnyId(ticket.userId);
        if (!borrower) throw new BadRequestError('Không tìm thấy người mượn');
        const policy = await getBorrowPolicyForUser(borrower);

        const due = new Date();
        due.setHours(0, 0, 0, 0);
        due.setDate(due.getDate() + Number(policy.loanDays));

        const copyIds = copies.map((c) => c._id);

        // Cập nhật bản sao → BORROWED
        await BookCopyMongo.updateMany({ _id: { $in: copyIds } }, { $set: { status: 'BORROWED' } });

        // Cập nhật phiếu
        ticket.bookCopyIds = copyIds;
        ticket.status = 'BORROWING';
        ticket.dueDate = due;
        await ticket.save();

        // Đồng bộ kho
        const book = await findBookByAnyId(String(ticket.bookId));
        if (book) await syncBookInventoryFields(book._id);

        // Gửi email xác nhận
        try {
            if (borrower?.email && book) {
                await SendMailBookBorrowConfirmation(borrower.email, toClientBookEmbedded(book), ticket.borrowDate, ticket.dueDate);
            }
        } catch { /* không chặn nếu email lỗi */ }

        new OK({
            message: `Xuất kho thành công ${copies.length} cuốn. Hạn trả: ${due.toLocaleDateString('vi-VN')}`,
            metadata: {
                ticket: toClientLoan(ticket, { product: toClientBookEmbedded(book) }),
                barcodes: copies.map((c) => c.barcode),
                dueDate: due,
            },
        }).send(res);
    }

    /**
     * [BƯỚC 4] Trả sách bằng cách gõ mã vạch.
     * POST /api/history-book/return-by-barcode
     * Body: { barcodes: ["DNT-01", "DNT-02"] }
     * Trả từng barcode độc lập; phiếu tự động đóng khi hết bản sao.
     */
    async returnByBarcode(req, res) {
        const { barcodes } = req.body;
        if (!Array.isArray(barcodes) || !barcodes.length) throw new BadRequestError('Vui lòng nhập ít nhất một mã sách');

        const results = [];

        for (const rawBarcode of barcodes) {
            const barcode = String(rawBarcode || '').trim();
            if (!barcode) continue;

            try {
                // 1. Tìm bản sao
                const copy = await BookCopyMongo.findOne({ barcode });
                if (!copy) { results.push({ barcode, success: false, message: 'Mã vạch không tồn tại trong hệ thống' }); continue; }
                if (copy.status !== 'BORROWED') { results.push({ barcode, success: false, message: `Bản sao đang ở trạng thái: ${copy.status} (cần: BORROWED)` }); continue; }

                // 2. Tìm phiếu chứa bản sao này
                const ticket = await LoanTicketMongo.findOne({
                    bookCopyIds: copy._id,
                    status: { $in: ['BORROWING', 'OVERDUE'] },
                });
                if (!ticket) { results.push({ barcode, success: false, message: 'Không tìm thấy phiếu mượn đang hoạt động cho mã vạch này' }); continue; }

                // 3. Trả bản sao → AVAILABLE
                copy.status = 'AVAILABLE';
                await copy.save();

                // 4. Rút bản sao khỏi phiếu
                ticket.bookCopyIds = ticket.bookCopyIds.filter((id) => String(id) !== String(copy._id));

                let fineDoc = null;
                let overdueDays = 0;

                // 5. Nếu đã trả hết bản sao → đóng phiếu
                if (ticket.bookCopyIds.length === 0) {
                    const now = new Date();
                    overdueDays = calendarDaysLate(ticket.dueDate, now);

                    if (overdueDays > 0) {
                        fineDoc = await createFineIfOverdue(ticket);
                    }

                    ticket.status = 'RETURNED';
                    ticket.returnedAt = now;
                }
                await ticket.save();

                // 6. Đồng bộ kho
                const book = await BookMongo.findById(copy.bookId);
                if (book) await syncBookInventoryFields(book._id);

                const isFullyReturned = ticket.status === 'RETURNED';
                results.push({
                    barcode,
                    success: true,
                    message: isFullyReturned
                        ? (overdueDays > 0 ? `Trả thành công, trễ ${overdueDays} ngày. Phiếu phạt đã tạo.` : 'Trả sách thành công. Phiếu mượn đã đóng.')
                        : `Đã nhận cuốn này. Phiếu còn ${ticket.bookCopyIds.length} cuốn chưa trả.`,
                    ticketId: String(ticket._id),
                    ticketStatus: ticket.status,
                    fine: fineDoc ? toClientFine(fineDoc) : null,
                    overdueDays,
                    remainingCopies: ticket.bookCopyIds.length,
                });
            } catch (err) {
                results.push({ barcode, success: false, message: err.message || 'Lỗi xử lý' });
            }
        }

        const successCount = results.filter((r) => r.success).length;
        new OK({
            message: `Đã xử lý ${results.length} mã vạch — ${successCount} thành công`,
            metadata: results,
        }).send(res);
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
        const list = await LoanTicketMongo.find({}).sort({ createdAt: -1 }).lean();
        const data = await Promise.all(list.map(async (item) => {
            const bookCopies = await buildBookCopiesWithTitles(item);
            const patron = await findUserByAnyId(item.userId);
            const borrowerStudentId = patron?.studentId || patron?.idStudent || null;

            let product = null;
            // Ưu tiên bookId field
            if (item.bookId) {
                const bm = await BookMongo.findById(item.bookId).lean();
                product = bm ? toClientBookEmbedded(bm) : null;
            }
            if (!product && bookCopies.length && bookCopies[0].bookId) {
                const bm = await BookMongo.findById(bookCopies[0].bookId).lean();
                product = bm ? toClientBookEmbedded(bm) : null;
            }

            return { ...toClientLoan(item, { product }), bookCopies, borrowerStudentId };
        }));
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
}

module.exports = new loanTicketController();
