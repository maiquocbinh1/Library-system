const mongoose = require('mongoose');

const readerCodeMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        userId: { type: String, required: true, unique: true, index: true },
        readerCode: { type: String, default: null, unique: true, sparse: true, trim: true },
        status: { type: String, enum: ['pending', 'approved'], default: 'pending', index: true },
        requestedAt: { type: Date, default: Date.now },
        approvedAt: { type: Date, default: null },
        planMonths: { type: Number, default: null },
        expiresAt: { type: Date, default: null, index: true },
        birthDate: { type: Date, default: null },
        className: { type: String, default: null, trim: true },
        gender: { type: String, enum: ['male', 'female', 'other', null], default: null },
        roleType: { type: String, enum: ['student', 'lecturer', null], default: null },
        systemType: { type: String, enum: ['civil', 'military', null], default: null },
        issuedAt: { type: Date, default: null },
    },
    { timestamps: true, collection: 'library_reader_codes' },
);

module.exports = mongoose.models.ReaderCodeMongo || mongoose.model('ReaderCodeMongo', readerCodeMongoSchema);
