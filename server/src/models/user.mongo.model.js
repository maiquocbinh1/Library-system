const mongoose = require('mongoose');

const userMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        avatar: { type: String, default: null },
        fullName: { type: String, required: true },
        phone: { type: String, default: null },
        address: { type: String, default: null },
        email: { type: String, required: true },
        password: { type: String, default: null },
        role: { type: String, enum: ['admin', 'user'], default: 'user' },
        typeLogin: { type: String, enum: ['google', 'email'], required: true },
        idStudent: { type: String, default: null },
        favoriteBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductMongo' }],
        readLaterBooks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'ProductMongo' }],
    },
    { timestamps: true, collection: 'library_users' },
);

module.exports = mongoose.models.UserMongo || mongoose.model('UserMongo', userMongoSchema);
