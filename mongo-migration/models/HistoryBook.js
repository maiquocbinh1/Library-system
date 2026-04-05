const mongoose = require('mongoose');

/**
 * Migrated from MySQL `historyBooks` (borrow / return history).
 * userId → user ref; bookId → product ref.
 */
const historyBookSchema = new mongoose.Schema(
    {
        mysqlId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            maxlength: 36,
        },
        mysqlUserId: { type: String, required: true, index: true },
        mysqlBookId: { type: String, required: true, index: true },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
        },
        book: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Product',
            required: true,
        },
        fullName: { type: String, required: true },
        phone: { type: String, default: null },
        address: { type: String, default: null },
        borrowDate: { type: Date, required: true },
        returnDate: { type: Date, default: null },
        status: {
            type: String,
            enum: ['pending', 'success', 'cancel'],
            default: 'pending',
        },
        quantity: { type: Number, required: true, default: 1 },
    },
    {
        timestamps: true,
        collection: 'historyBooks',
    },
);

module.exports = mongoose.models.HistoryBook || mongoose.model('HistoryBook', historyBookSchema);
