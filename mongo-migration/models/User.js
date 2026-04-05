const mongoose = require('mongoose');

/**
 * Migrated from MySQL `users` table.
 * FK sources: apiKeys.userId, historyBooks.userId → resolved to ObjectId refs at migration time.
 */
const userSchema = new mongoose.Schema(
    {
        /** Original MySQL CHAR(36) UUID primary key */
        mysqlId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            maxlength: 36,
        },
        avatar: { type: String, default: null },
        fullName: { type: String, required: true },
        phone: { type: String, default: null },
        address: { type: String, default: null },
        email: { type: String, required: true },
        password: { type: String, default: null },
        role: {
            type: String,
            enum: ['admin', 'user'],
            default: 'user',
        },
        typeLogin: {
            type: String,
            enum: ['google', 'email'],
            required: true,
        },
        idStudent: { type: String, default: null },
    },
    {
        timestamps: true,
        collection: 'users',
    },
);

module.exports = mongoose.models.User || mongoose.model('User', userSchema);
