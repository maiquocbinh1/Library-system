const mongoose = require('mongoose');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const UserMongo = require('../models/user.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');

const { BadRequestError } = require('../core/error.response');
const { OK } = require('../core/success.response');

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

function toClientFineRow(fine, userDoc, loanDoc) {
    const f = fine.toObject ? fine.toObject() : { ...fine };
    const u = userDoc
        ? {
              id: userDoc.mysqlId || String(userDoc._id),
              fullName: userDoc.fullName,
              email: userDoc.email,
              studentId: userDoc.studentId || userDoc.staffId || userDoc.idStudent || null,
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

class fineTicketController {
    /** Admin: danh sách phiếu phạt + user + phiếu mượn */
    async getAllFines(req, res) {
        const list = await FineTicketMongo.find({}).sort({ createdAt: -1 });
        const data = await Promise.all(
            list.map(async (doc) => {
                const userDoc = await findUserByAnyId(doc.userId);
                const loanDoc = await LoanTicketMongo.findById(doc.loanTicketId).lean();
                return toClientFineRow(doc, userDoc, loanDoc);
            }),
        );
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
        fine.status = 'PAID';
        await fine.save();
        const userDoc = await findUserByAnyId(fine.userId);
        const loanDoc = await LoanTicketMongo.findById(fine.loanTicketId).lean();
        new OK({
            message: 'Đã xác nhận thu tiền phạt',
            metadata: toClientFineRow(fine, userDoc, loanDoc),
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
