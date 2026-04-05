const mongoose = require('mongoose');

const apiKeyMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        userId: { type: String, required: true, index: true },
        publicKey: { type: String, required: true },
        privateKey: { type: String, required: true },
    },
    { timestamps: true, collection: 'library_api_keys' },
);

module.exports = mongoose.models.ApiKeyMongo || mongoose.model('ApiKeyMongo', apiKeyMongoSchema);
