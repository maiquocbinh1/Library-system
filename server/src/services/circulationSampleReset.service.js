const mongoose = require('mongoose');
const { CIRCULATION_SAMPLE_STUDENT_IDS } = require('../scripts/data/circulationSampleStudentIds');
const UserMongo = require('../models/user.mongo.model');
const LoanTicketMongo = require('../models/loanTicket.mongo.model');
const FineTicketMongo = require('../models/fineTicket.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');
const { syncBookInventoryFields } = require('../utils/bookInventory');

/**
 * Xóa phiếu mượn + phạt của các MSV mẫu quầy (FE `circulationSamplePatrons`),
 * trả bản sao về AVAILABLE và đồng bộ tồn đầu sách — giống bước "làm sạch" trong seed:circulation-sample.
 * @returns {Promise<{ patronCount: number, ticketsRemoved: number, finesRemoved: number }>}
 */
async function resetCirculationSamplePatronsState() {
    const users = await UserMongo.find({ studentId: { $in: CIRCULATION_SAMPLE_STUDENT_IDS } })
        .select('_id mysqlId studentId')
        .lean();
    if (!users.length) {
        return { patronCount: 0, ticketsRemoved: 0, finesRemoved: 0 };
    }

    const idSet = new Set();
    for (const u of users) {
        idSet.add(String(u._id));
        if (u.mysqlId) idSet.add(String(u.mysqlId));
    }
    const keys = [...idSet];

    const tickets = await LoanTicketMongo.find({ userId: { $in: keys } }).select('bookCopyIds bookId').lean();
    const copyIds = [...new Set(tickets.flatMap((t) => (t.bookCopyIds || []).map((id) => String(id))))].filter((id) =>
        mongoose.isValidObjectId(id),
    );
    if (copyIds.length) {
        const oids = copyIds.map((id) => new mongoose.Types.ObjectId(id));
        await BookCopyMongo.updateMany({ _id: { $in: oids } }, { $set: { status: 'AVAILABLE' } });
    }
    const bookIds = [...new Set(tickets.map((t) => t.bookId).filter(Boolean).map((id) => String(id)))];
    for (const bid of bookIds) {
        if (mongoose.isValidObjectId(bid)) {
            await syncBookInventoryFields(new mongoose.Types.ObjectId(bid));
        }
    }
    const fr = await FineTicketMongo.deleteMany({ userId: { $in: keys } });
    const lr = await LoanTicketMongo.deleteMany({ userId: { $in: keys } });

    return {
        patronCount: users.length,
        ticketsRemoved: lr.deletedCount || 0,
        finesRemoved: fr.deletedCount || 0,
    };
}

module.exports = { resetCirculationSamplePatronsState };
