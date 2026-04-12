const mongoose = require('mongoose');

const LOAN_TICKET_STATUS = ['PENDING_APPROVAL', 'BORROWING', 'RETURNED', 'OVERDUE', 'CANCELLED'];

const loanTicketMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        userId: { type: String, required: true, index: true },
        fullName: { type: String, required: true },
        phone: { type: String, default: null },
        address: { type: String, default: null },
        /** Danh sách bản sao vật lý (mã vạch) gắn với phiếu — thay cho bookId + quantity */
        bookCopyIds: {
            type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'BookCopyMongo' }],
            required: true,
            validate: [(v) => Array.isArray(v) && v.length > 0, 'Cần ít nhất một bản sao'],
        },
        /** Ngày gửi yêu cầu / mượn (theo form) */
        borrowDate: { type: Date, required: true },
        /** Ngày phải trả — gán khi duyệt (duyệt + loanDays theo Policy) */
        dueDate: { type: Date, default: null, index: true },
        /** Ngày trả thực tế khi hoàn tất */
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
