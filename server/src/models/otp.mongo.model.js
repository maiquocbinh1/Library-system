const mongoose = require('mongoose');

const otpMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true },
        email: { type: String, required: true, index: true },
        otp: { type: String, required: true },
    },
    { timestamps: true, collection: 'library_otps' },
);

module.exports = mongoose.models.OtpMongo || mongoose.model('OtpMongo', otpMongoSchema);
