const mongoose = require('mongoose');

const FINE_STATUS = ['UNPAID', 'PAID'];

const fineTicketMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        loanTicketId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'LoanTicketMongo',
            required: true,
            index: true,
        },
        /** userId trên phiếu mượn (có thể là mongo _id hoặc mysqlId string) */
        userId: { type: String, required: true, index: true },
        /** MSV / MSG — hiển thị trên biên lai */
        studentId: { type: String, default: null },
        overdueDays: { type: Number, required: true, min: 0 },
        fineAmount: { type: Number, required: true, min: 0 },
        status: {
            type: String,
            enum: FINE_STATUS,
            default: 'UNPAID',
            index: true,
        },
        reason: { type: String, required: true, trim: true },
    },
    { timestamps: true, collection: 'fine_tickets' },
);

fineTicketMongoSchema.index({ userId: 1, status: 1 });

module.exports = mongoose.models.FineTicketMongo || mongoose.model('FineTicketMongo', fineTicketMongoSchema);
module.exports.FINE_STATUS = FINE_STATUS;
