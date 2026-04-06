const mongoose = require('mongoose');

const historyBookMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        userId: { type: String, required: true, index: true },
        fullName: { type: String, required: true },
        phone: { type: String, default: null },
        address: { type: String, default: null },
        bookId: { type: String, required: true },
        borrowDate: { type: Date, required: true },
        returnDate: { type: Date, default: null },
        status: { type: String, enum: ['pending', 'success', 'cancel'], default: 'pending' },
        quantity: { type: Number, required: true, default: 1 },
    },
    { timestamps: true, collection: 'library_history_books' },
);

historyBookMongoSchema.index({ userId: 1, status: 1, returnDate: 1 });

module.exports = mongoose.models.HistoryBookMongo || mongoose.model('HistoryBookMongo', historyBookMongoSchema);
