const mongoose = require('mongoose');

const LOAN_TICKET_STATUS = [
    'PENDING_APPROVAL',
    'READY_FOR_PICKUP',
    'BORROWING',
    'OVERDUE',
    'RETURNED',
    'CANCELLED',
];

const loanTicketMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        userId: { type: String, required: true, index: true },
        fullName: { type: String, required: true },
        phone: { type: String, default: null },
        address: { type: String, default: null },
        bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookMongo', default: null, index: true },
        requestedQuantity: { type: Number, default: null },
        /** Số lần đã gia hạn (tối đa 1 theo quy định thư viện) */
        renewalCount: { type: Number, default: 0 },
        bookCopyIds: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BookCopyMongo' }],
            default: [],
        },
        /** Snapshot bản sao đã xuất — giữ sau khi trả để lịch sử / báo cáo vẫn biết mã cuốn đã mượn */
        issuedBookCopyIds: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BookCopyMongo' }],
            default: [],
        },
        borrowDate: { type: Date, required: true },
        dueDate: { type: Date, default: null, index: true },
        returnedAt: { type: Date, default: null },
        status: {
            type: String,
            enum: LOAN_TICKET_STATUS,
            default: 'PENDING_APPROVAL',
            index: true,
        },
    },
    { timestamps: true, collection: 'loan_tickets' },
);

loanTicketMongoSchema.index({ userId: 1, status: 1 });
loanTicketMongoSchema.index({ status: 1, dueDate: 1 });

module.exports = mongoose.models.LoanTicketMongo || mongoose.model('LoanTicketMongo', loanTicketMongoSchema);
module.exports.LOAN_TICKET_STATUS = LOAN_TICKET_STATUS;
