const mongoose = require('mongoose');

const adminMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        userId: { type: String, required: true, unique: true, index: true },
        email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
        fullName: { type: String, required: true, trim: true },
        role: { type: String, enum: ['admin'], default: 'admin' },
        isActive: { type: Boolean, default: true },
    },
    { timestamps: true, collection: 'admin' },
);

module.exports = mongoose.models.AdminMongo || mongoose.model('AdminMongo', adminMongoSchema);
