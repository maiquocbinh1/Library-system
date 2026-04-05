const mongoose = require('mongoose');

/**
 * Migrated from MySQL `otps` (INT AUTO_INCREMENT id).
 */
const otpSchema = new mongoose.Schema(
    {
        /** Original MySQL integer primary key */
        mysqlId: {
            type: Number,
            required: true,
            unique: true,
            index: true,
        },
        email: { type: String, required: true },
        otp: { type: String, required: true },
    },
    {
        timestamps: true,
        collection: 'otps',
    },
);

module.exports = mongoose.models.Otp || mongoose.model('Otp', otpSchema);
