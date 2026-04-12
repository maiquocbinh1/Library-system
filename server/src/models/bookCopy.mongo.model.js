const mongoose = require('mongoose');

const bookCopyMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        bookId: { type: mongoose.Schema.Types.ObjectId, ref: 'BookMongo', required: true, index: true },
        barcode: { type: String, required: true, unique: true, trim: true, index: true },
        status: {
            type: String,
            enum: ['AVAILABLE', 'RESERVED', 'BORROWED', 'MAINTENANCE', 'LOST'],
            default: 'AVAILABLE',
            index: true,
        },
        condition: {
            type: String,
            enum: ['NEW', 'GOOD', 'FAIR', 'POOR', 'DAMAGED'],
            default: 'NEW',
        },
    },
    { timestamps: true, collection: 'library_book_copies' },
);

bookCopyMongoSchema.index({ bookId: 1, status: 1 });

module.exports = mongoose.models.BookCopyMongo || mongoose.model('BookCopyMongo', bookCopyMongoSchema);
