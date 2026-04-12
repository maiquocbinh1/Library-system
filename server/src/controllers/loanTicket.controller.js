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

/** Map FE/admin cũ sang enum mới */
function normalizeIncomingStatus(status) {
    const s = String(status || '').trim();
    const legacy = {
        pending: 'PENDING_APPROVAL',
        success: 'BORROWING',
        cancel: 'CANCELLED',
    };
    return legacy[s] || s;
}

function random36() {
    return crypto.randomUUID();
}

/** Số ngày trễ (0 = đúng hạn hoặc trả sớm trong cùng ngày hạn). */
function calendarDaysLate(dueDate, returnAt) {
    const d0 = new Date(dueDate);
    d0.setHours(0, 0, 0, 0);
    const d1 = new Date(returnAt);
    d1.setHours(0, 0, 0, 0);
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

function shuffleIds(docs) {
    const arr = docs.map((d) => d._id);
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

async function findUserByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await UserMongo.findById(id);
        if (byMongoId) return byMongoId;
    }
    return UserMongo.findOne({ mysqlId: String(id) });
}

async function findBookByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await BookMongo.findById(id);
        if (byMongoId) return byMongoId;
    }
    return BookMongo.findOne({ mysqlId: String(id) });
}

async function findLoanByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await LoanTicketMongo.findById(id);
        if (byMongoId) return byMongoId;
    }
    return LoanTicketMongo.findOne({ mysqlId: String(id) });
}

async function resolveBookFromTicket(ticket) {
    const ids = ticket.bookCopyIds;
    if (!ids || !ids.length) return null;
    const first = await BookCopyMongo.findById(ids[0]).select('bookId').lean();
    if (!first?.bookId) return null;
    return BookMongo.findById(first.bookId);
}

function toClientBookEmbedded(book) {
    if (!book) return null;
    const plain = book.toObject ? book.toObject() : book;
    const title = plain.title || plain.nameProduct || '';
    return {
        ...plain,
        title,
        nameProduct: title,
        id: plain.mysqlId || (plain._id ? String(plain._id) : undefined),
    };
}

function toClientLoan(ticketDoc, extras = {}) {
    const raw = ticketDoc.toObject ? ticketDoc.toObject() : { ...ticketDoc };
    const q = Array.isArray(raw.bookCopyIds) ? raw.bookCopyIds.length : 0;
    return {
        ...raw,
        id: raw.mysqlId || (raw._id ? String(raw._id) : undefined),
        quantity: q,
        product: extras.product ?? null,
        /** Hiển thị: hạn trả sau duyệt */
        returnDate: raw.dueDate ?? null,
    };
}

function getUserIdCandidates(user) {
    const ids = [String(user._id)];
    if (user.mysqlId) ids.push(String(user.mysqlId));
    return ids;
}

async function getActiveBorrowTotalQuantity(user) {
    const userIds = getUserIdCandidates(user);
    const rows = await LoanTicketMongo.find({
        userId: { $in: userIds },
        status: { $in: ['PENDING_APPROVAL', 'BORROWING', 'OVERDUE'] },
    })
        .select('bookCopyIds')
        .lean();
    return rows.reduce((sum, r) => sum + (Array.isArray(r.bookCopyIds) ? r.bookCopyIds.length : 0), 0);
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

class loanTicketController {
    async createHistoryBook(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        if (!canBorrowAsPatron(user)) {
            throw new BadRequestError('Bạn chưa có MSV/MSG hợp lệ hoặc đang chờ thư viện xác nhận');
        }

        const borrowPolicy = await getBorrowPolicyForUser(user);
        const maxBooks = borrowPolicy.maxBooks;

        const overdueBorrow = await hasOverdueBorrow(user);
        if (overdueBorrow) {
            throw new BadRequestError('Bạn đang có sách quá hạn chưa trả, vui lòng hoàn tất trước khi mượn thêm');
        }

        const { fullName, phoneNumber, address, bookId, borrowDate, quantity } = req.body;
        if (!fullName || !phoneNumber || !address || !bookId || !quantity) {
            throw new BadRequestError('Vui lòng nhập đầy đủ thông tin');
        }

        const quantityNumber = Number(quantity);
        if (!Number.isFinite(quantityNumber) || quantityNumber <= 0) {
            throw new BadRequestError('Số lượng mượn không hợp lệ');
        }

        const activeBorrowQty = await getActiveBorrowTotalQuantity(user);
        if (activeBorrowQty + quantityNumber > maxBooks) {
            throw new BadRequestError(
                `Theo nội quy PTIT, bạn chỉ được mượn tối đa ${maxBooks} ấn phẩm cùng lúc (đang mượn/giữ chỗ ${activeBorrowQty}, yêu cầu thêm ${quantityNumber})`,
            );
        }

        const borrowDateValue = borrowDate ? new Date(borrowDate) : new Date();
        if (Number.isNaN(borrowDateValue.getTime())) {
            throw new BadRequestError('Ngày mượn không hợp lệ');
        }

        const existedBook = await findBookByAnyId(bookId);
        if (!existedBook) {
            throw new BadRequestError('Sách không tồn tại');
        }

        const available = await BookCopyMongo.find({
            bookId: existedBook._id,
            status: 'AVAILABLE',
        })
            .select('_id')
            .lean();

        if (available.length < quantityNumber) {
            throw new BadRequestError('Không đủ sách vật lý sẵn sàng');
        }

        const pickIds = shuffleIds(available).slice(0, quantityNumber);

        let ticket = null;
        try {
            await BookCopyMongo.updateMany({ _id: { $in: pickIds } }, { $set: { status: 'RESERVED' } });

            ticket = await LoanTicketMongo.create({
                mysqlId: random36(),
                fullName,
                phone: phoneNumber,
                address,
                borrowDate: borrowDateValue,
                dueDate: null,
                userId: String(user._id),
                bookCopyIds: pickIds,
                status: 'PENDING_APPROVAL',
            });

            await syncBookInventoryFields(existedBook._id);
        } catch (error) {
            if (pickIds.length) {
                await BookCopyMongo.updateMany({ _id: { $in: pickIds } }, { $set: { status: 'AVAILABLE' } });
                await syncBookInventoryFields(existedBook._id);
            }
            throw error;
        }

        const book = await resolveBookFromTicket(ticket);
        new Created({
            message: 'Create history book success',
            metadata: toClientLoan(ticket, { product: toClientBookEmbedded(book) }),
        }).send(res);
    }

    async getHistoryUser(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const userIds = [String(user._id)];
        if (user.mysqlId) userIds.push(String(user.mysqlId));

        const list = await LoanTicketMongo.find({ userId: { $in: userIds } }).sort({ createdAt: -1 }).lean();
        const data = await Promise.all(
            list.map(async (item) => {
                const book = await resolveBookFromTicket(item);
                return toClientLoan(item, { product: toClientBookEmbedded(book) });
            }),
        );

        new OK({
            message: 'Get history book success',
            metadata: data,
        }).send(res);
    }

    async cancelBook(req, res) {
        const { id } = req.user;
        const { idHistory } = req.body;

        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }

        const ticket = await findLoanByAnyId(idHistory);
        if (!ticket) {
            throw new BadRequestError('Lịch sử mượn không tồn tại');
        }

        const userIds = [String(user._id)];
        if (user.mysqlId) userIds.push(String(user.mysqlId));
        if (!userIds.includes(String(ticket.userId))) {
            throw new BadRequestError('Lịch sử mượn không tồn tại');
        }

        if (ticket.status !== 'PENDING_APPROVAL') {
            throw new BadRequestError('Chỉ có thể huỷ phiếu đang chờ duyệt');
        }

        ticket.status = 'CANCELLED';
        await ticket.save();

        if (ticket.bookCopyIds?.length) {
            await BookCopyMongo.updateMany({ _id: { $in: ticket.bookCopyIds } }, { $set: { status: 'AVAILABLE' } });
            const book = await resolveBookFromTicket(ticket);
            if (book) await syncBookInventoryFields(book._id);
        }

        new OK({
            message: 'Cancel book success',
        }).send(res);
    }

    /**
     * Admin xác nhận trả sách: nhả bản sao về AVAILABLE, đóng phiếu RETURNED;
     * nếu trễ hạn — tạo FineTicket (UNPAID) theo Policy.overdueFinePerDay.
     */
    async returnBooks(req, res) {
        const { loanTicketId } = req.body;
        if (!loanTicketId) {
            throw new BadRequestError('Thiếu loanTicketId');
        }

        const findTicket = await findLoanByAnyId(loanTicketId);
        if (!findTicket) {
            throw new BadRequestError('Không tìm thấy phiếu mượn');
        }
        if (findTicket.status === 'RETURNED') {
            throw new BadRequestError('Phiếu đã được trả');
        }
        if (!['BORROWING', 'OVERDUE'].includes(findTicket.status)) {
            throw new BadRequestError('Chỉ xác nhận trả khi phiếu đang mượn hoặc quá hạn (chưa trả)');
        }
        if (!findTicket.dueDate) {
            throw new BadRequestError('Phiếu không có hạn trả, không thể xác nhận trả');
        }

        const copyIds = findTicket.bookCopyIds || [];
        const copyCount = copyIds.length;
        if (!copyCount) {
            throw new BadRequestError('Phiếu không có bản sao sách');
        }

        const now = new Date();
        const overdueDays = calendarDaysLate(findTicket.dueDate, now);

        let fineDoc = null;
        if (overdueDays > 0) {
            const borrower = await findUserByAnyId(findTicket.userId);
            if (!borrower) {
                throw new BadRequestError('Không tìm thấy người mượn');
            }
            const policy = borrower.readerType ? await getPolicyByReaderType(borrower.readerType) : null;
            const rate = Number(policy?.overdueFinePerDay ?? 1000);
            const fineAmount = Math.round(overdueDays * rate * copyCount);
            const reason = `Trả trễ hạn ${overdueDays} ngày cho ${copyCount} cuốn sách`;
            fineDoc = await FineTicketMongo.create({
                mysqlId: random36(),
                loanTicketId: findTicket._id,
                userId: String(findTicket.userId),
                studentId: borrower.studentId || borrower.staffId || borrower.idStudent || null,
                overdueDays,
                fineAmount,
                status: 'UNPAID',
                reason,
            });
        }

        await BookCopyMongo.updateMany({ _id: { $in: copyIds } }, { $set: { status: 'AVAILABLE' } });

        findTicket.status = 'RETURNED';
        findTicket.returnedAt = now;
        await findTicket.save();

        const findBook = await resolveBookFromTicket(findTicket);
        if (findBook) await syncBookInventoryFields(findBook._id);

        new OK({
            message: fineDoc ? 'Trả sách thành công. Đã ghi nhận phạt quá hạn.' : 'Trả sách thành công.',
            metadata: {
                loan: toClientLoan(findTicket, { product: toClientBookEmbedded(findBook) }),
                fine: fineDoc ? toClientFine(fineDoc) : null,
                overdueDays,
                copyCount,
            },
        }).send(res);
    }

    async getAllHistoryBook(req, res) {
        const list = await LoanTicketMongo.find({}).sort({ createdAt: -1 }).lean();
        const data = await Promise.all(
            list.map(async (item) => {
                const book = await resolveBookFromTicket(item);
                return toClientLoan(item, { product: toClientBookEmbedded(book) });
            }),
        );
        new OK({
            message: 'Get all history book success',
            metadata: data,
        }).send(res);
    }

    async updateStatusBook(req, res) {
        const { idHistory, status, productId, userId } = req.body;
        const next = normalizeIncomingStatus(status);
        const validNext = ['BORROWING', 'CANCELLED', 'OVERDUE'];
        if (!validNext.includes(next)) {
            throw new BadRequestError('Trạng thái cập nhật không hợp lệ');
        }

        const findTicket = await findLoanByAnyId(idHistory);
        if (!findTicket) {
            throw new BadRequestError('Lịch sử mượn không tồn tại');
        }

        const findUser = await findUserByAnyId(userId || findTicket.userId);
        let findBook = await findBookByAnyId(productId);
        if (!findBook) {
            findBook = await resolveBookFromTicket(findTicket);
        }

        if (findTicket.status === next) {
            throw new BadRequestError('Phiếu mượn đã ở trạng thái này');
        }
        if (findTicket.status === 'CANCELLED') {
            throw new BadRequestError('Phiếu đã huỷ không thể cập nhật lại');
        }
        if (findTicket.status === 'RETURNED') {
            throw new BadRequestError('Phiếu đã trả không thể cập nhật lại');
        }

        const copyIds = findTicket.bookCopyIds || [];

        if (next === 'BORROWING') {
            if (findTicket.status !== 'PENDING_APPROVAL') {
                throw new BadRequestError('Chỉ duyệt được phiếu đang chờ');
            }
            if (!findUser) {
                throw new BadRequestError('Không tìm thấy người mượn');
            }
            const policy = await getBorrowPolicyForUser(findUser);
            const due = new Date();
            due.setHours(0, 0, 0, 0);
            due.setDate(due.getDate() + Number(policy.loanDays));

            await BookCopyMongo.updateMany({ _id: { $in: copyIds } }, { $set: { status: 'BORROWED' } });
            findTicket.dueDate = due;
            findTicket.status = 'BORROWING';
            await findTicket.save();

            if (findUser && findBook) {
                await SendMailBookBorrowConfirmation(
                    findUser.email,
                    toClientBookEmbedded(findBook),
                    findTicket.borrowDate,
                    findTicket.dueDate,
                );
            }
        } else if (next === 'CANCELLED') {
            if (!findBook) {
                throw new BadRequestError('Không xác định được đầu sách');
            }
            await BookCopyMongo.updateMany({ _id: { $in: copyIds } }, { $set: { status: 'AVAILABLE' } });
            findTicket.status = 'CANCELLED';
            await findTicket.save();
            await syncBookInventoryFields(findBook._id);

            if (findUser && findBook) {
                await SendMailBookBorrowFailed(findUser.email, toClientBookEmbedded(findBook));
            }
        } else if (next === 'OVERDUE') {
            if (findTicket.status !== 'BORROWING') {
                throw new BadRequestError('Chỉ đánh dấu quá hạn khi đang mượn');
            }
            findTicket.status = 'OVERDUE';
            await findTicket.save();
        }

        new OK({
            message: 'Update status book success',
        }).send(res);
    }
}

module.exports = new loanTicketController();
