const mongoose = require('mongoose');

/**
 * Migrated from MySQL `apiKeys`.
 * Prefer reference to User over embedding (userId → user ObjectId).
 */
const apiKeySchema = new mongoose.Schema(
    {
        mysqlId: {
            type: String,
            required: true,
            unique: true,
            index: true,
            maxlength: 36,
        },
        /** Original MySQL user UUID for idempotent runs / debugging */
        mysqlUserId: { type: String, required: true, index: true },
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        publicKey: { type: String, required: true },
        privateKey: { type: String, required: true },
    },
    {
        timestamps: true,
        collection: 'apiKeys',
    },
);

module.exports = mongoose.models.ApiKey || mongoose.model('ApiKey', apiKeySchema);
