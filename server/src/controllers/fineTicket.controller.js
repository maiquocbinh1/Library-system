const mongoose = require('mongoose');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');

const { BadRequestError } = require('../core/error.response');
const { OK } = require('../core/success.response');
const { logAdminAction, AuditActions } = require('../utils/logAdminAction');

async function findUserByAnyId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const byMongoId = await UserMongo.findById(id);
        if (byMongoId) return byMongoId;
    }
    return UserMongo.findOne({ mysqlId: String(id) });
}

function userIdCandidates(user) {
    const ids = [String(user._id)];
    if (user.mysqlId) ids.push(String(user.mysqlId));
    return ids;
}

/** Giống phiếu mượn: ưu tiên snapshot bản sao đã xuất (sau trả vẫn biết cuốn nào). */
function copyIdsOnLoan(loanLean) {
    if (!loanLean) return [];
    const issued = loanLean.issuedBookCopyIds || [];
    if (issued.length) return issued;
    return loanLean.bookCopyIds || [];
}

/**
 * Map loanTicketId → { title, bookCode, copyBarcodes } cho danh sách phiếu phạt.
 */
async function buildViolationBookByLoanId(loans) {
    const bookIdSet = new Set();
    const allCopyIdStrs = new Set();
    for (const l of loans) {
        if (l.bookId) bookIdSet.add(String(l.bookId));
        for (const cid of copyIdsOnLoan(l)) {
            if (cid && mongoose.isValidObjectId(cid)) allCopyIdStrs.add(String(cid));
        }
    }
    const bookOids = [...bookIdSet]
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    const books = bookOids.length
        ? await BookMongo.find({ _id: { $in: bookOids } }).select('title nameProduct bookCode').lean()
        : [];
    const bookById = new Map(books.map((b) => [String(b._id), b]));

    const copyOids = [...allCopyIdStrs]
        .filter((id) => mongoose.isValidObjectId(id))
        .map((id) => new mongoose.Types.ObjectId(id));
    const copies = copyOids.length
        ? await BookCopyMongo.find({ _id: { $in: copyOids } }).select('barcode').lean()
        : [];
    const copyById = new Map(copies.map((c) => [String(c._id), c]));

    const out = new Map();
    for (const l of loans) {
        const bid = l.bookId ? String(l.bookId) : '';
        const b = bid ? bookById.get(bid) : null;
        const barcodes = [...new Set(
            copyIdsOnLoan(l)
                .map((id) => copyById.get(String(id))?.barcode)
                .filter((x) => x != null && String(x).trim() !== ''),
        )].map((x) => String(x).trim());
        const title = b ? (b.title || b.nameProduct || '').trim() : '';
        out.set(String(l._id), {
            title: title || null,
            bookCode: b?.bookCode ? String(b.bookCode).trim() : null,
            copyBarcodes: barcodes,
        });
    }
    return out;
}

function toClientFineRow(fine, userDoc, loanDoc, violationBook) {
    const f = fine.toObject ? fine.toObject() : { ...fine };
    const u = userDoc
        ? {
              id: userDoc.mysqlId || String(userDoc._id),
              fullName: userDoc.fullName,
              email: userDoc.email,
              studentId: userDoc.studentId || userDoc.idStudent || null,
          }
        : null;
    const loan = loanDoc
        ? {
              id: loanDoc.mysqlId || String(loanDoc._id),
              status: loanDoc.status,
              dueDate: loanDoc.dueDate,
              returnedAt: loanDoc.returnedAt,
          }
        : null;
    const hasVio =
        violationBook &&
        (violationBook.title || violationBook.bookCode || (violationBook.copyBarcodes && violationBook.copyBarcodes.length));
    return {
        id: f.mysqlId || String(f._id),
        _id: String(f._id),
        mysqlId: f.mysqlId,
        loanTicketId: f.loanTicketId ? String(f.loanTicketId) : null,
        userId: f.userId,
        studentId: f.studentId,
        overdueDays: f.overdueDays,
        fineAmount: f.fineAmount,
        status: f.status,
        reason: f.reason,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        user: u,
        loanTicket: loan,
        violationBook: hasVio ? violationBook : null,
    };
}

async function findFineByParamId(id) {
    if (!id) return null;
    if (mongoose.isValidObjectId(id)) {
        const byId = await FineTicketMongo.findById(id);
        if (byId) return byId;
    }
    return FineTicketMongo.findOne({ mysqlId: String(id) });
}

/** Nạp user theo lô — tránh N×2 query song song (timeout client / quá tải pool). */
async function loadUsersForFineList(userIdSet) {
    const patronByKey = new Map();
    const uids = [...userIdSet];
    const CHUNK = 60;
    for (let i = 0; i < uids.length; i += CHUNK) {
        const slice = uids.slice(i, i + CHUNK);
        const orConds = [];
        for (const uid of slice) {
            if (mongoose.isValidObjectId(uid)) {
                orConds.push({ _id: new mongoose.Types.ObjectId(uid) });
            }
            orConds.push({ mysqlId: uid });
        }
        if (!orConds.length) continue;
        const users = await UserMongo.find({ $or: orConds }).lean();
        for (const u of users) {
            patronByKey.set(String(u._id), u);
            if (u.mysqlId) patronByKey.set(String(u.mysqlId), u);
        }
    }
    return patronByKey;
}

class fineTicketController {
    /** Admin: danh sách phiếu phạt + user + phiếu mượn */
    async getAllFines(req, res) {
        const userIdFilter = String(req.query.userId ?? '').trim();
        let query = {};
        if (userIdFilter) {
            const cand = new Set([userIdFilter]);
            if (mongoose.isValidObjectId(userIdFilter)) {
                const u = await UserMongo.findById(userIdFilter).select('_id mysqlId').lean();
                if (u) {
                    cand.add(String(u._id));
                    if (u.mysqlId) cand.add(String(u.mysqlId));
                }
            } else {
                const u = await UserMongo.findOne({ mysqlId: userIdFilter }).select('_id mysqlId').lean();
                if (u) {
                    cand.add(String(u._id));
                    if (u.mysqlId) cand.add(String(u.mysqlId));
                }
            }
            query = { userId: { $in: [...cand] } };
        }

        const MAX_LIST = 8000;
        const list = await FineTicketMongo.find(query).sort({ createdAt: -1 }).limit(MAX_LIST).lean();

        const userIdSet = new Set();
        const loanOidStrings = new Set();
        for (const doc of list) {
            if (doc.userId != null) userIdSet.add(String(doc.userId));
            if (doc.loanTicketId && mongoose.isValidObjectId(doc.loanTicketId)) {
                loanOidStrings.add(String(doc.loanTicketId));
            }
        }

        const patronByKey = await loadUsersForFineList(userIdSet);

        const loanOids = [...loanOidStrings].map((id) => new mongoose.Types.ObjectId(id));
        const loans = loanOids.length
            ? await LoanTicketMongo.find({ _id: { $in: loanOids } }).lean()
            : [];
        const loanById = new Map(loans.map((l) => [String(l._id), l]));

        const violationByLoanId = await buildViolationBookByLoanId(loans);

        const data = list.map((doc) => {
            const userDoc = patronByKey.get(String(doc.userId)) || null;
            const loanDoc = doc.loanTicketId ? loanById.get(String(doc.loanTicketId)) || null : null;
            const violationBook = loanDoc ? violationByLoanId.get(String(loanDoc._id)) || null : null;
            return toClientFineRow(doc, userDoc, loanDoc, violationBook);
        });
        new OK({
            message: 'Lấy danh sách phiếu phạt thành công',
            metadata: data,
        }).send(res);
    }

    /** Admin: xác nhận đã thu tiền */
    async payFine(req, res) {
        const { id } = req.params;
        const fine = await findFineByParamId(id);
        if (!fine) {
            throw new BadRequestError('Không tìm thấy phiếu phạt');
        }
        if (fine.status === 'PAID') {
            throw new BadRequestError('Phiếu phạt đã được thanh toán');
        }
        const before = fine.toObject ? fine.toObject() : { ...fine };
        fine.status = 'PAID';
        await fine.save();
        await logAdminAction({
            req,
            action: AuditActions.FINE_PAID,
            targetId: String(fine._id),
            targetType: 'FINE_TICKET',
            oldValues: {
                status: before.status,
                fineAmount: before.fineAmount,
                userId: String(before.userId),
                loanTicketId: before.loanTicketId ? String(before.loanTicketId) : null,
            },
            newValues: { status: 'PAID' },
        });
        const userDoc = await findUserByAnyId(fine.userId);
        const loanDoc = await LoanTicketMongo.findById(fine.loanTicketId).lean();
        const violationBook = loanDoc ? (await buildViolationBookByLoanId([loanDoc])).get(String(loanDoc._id)) || null : null;
        new OK({
            message: 'Đã xác nhận thu tiền phạt',
            metadata: toClientFineRow(fine, userDoc, loanDoc, violationBook),
        }).send(res);
    }

    /** Độc giả: phiếu phạt chưa nộp (cảnh báo trang cá nhân) */
    async getMyUnpaidFines(req, res) {
        const { id } = req.user;
        const user = await findUserByAnyId(id);
        if (!user) {
            throw new BadRequestError('Người dùng không tồn tại');
        }
        const ids = userIdCandidates(user);
        const fines = await FineTicketMongo.find({
            userId: { $in: ids },
            status: 'UNPAID',
        })
            .sort({ createdAt: -1 })
            .lean();
        const totalUnpaidAmount = fines.reduce((s, x) => s + Number(x.fineAmount || 0), 0);
        new OK({
            message: 'OK',
            metadata: {
                unpaidCount: fines.length,
                totalUnpaidAmount,
                fines: fines.map((f) => ({
                    id: f.mysqlId || String(f._id),
                    fineAmount: f.fineAmount,
                    reason: f.reason,
                    overdueDays: f.overdueDays,
                    createdAt: f.createdAt,
                })),
            },
        }).send(res);
    }
}

module.exports = new fineTicketController();
