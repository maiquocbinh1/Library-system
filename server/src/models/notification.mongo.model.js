const mongoose = require('mongoose');

const NOTIFICATION_TYPES = ['SYSTEM', 'WARNING', 'INFO'];

const notificationMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        /** userId (Mongo _id string hoặc mysqlId string như các collection khác) */
        userId: { type: String, required: true, index: true },
        type: { type: String, enum: NOTIFICATION_TYPES, default: 'INFO', index: true },
        title: { type: String, required: true, trim: true },
        contentHtml: { type: String, default: '', trim: true },
        /** Dedupe key để job tự động không gửi trùng. */
        dedupeKey: { type: String, default: '', index: true },
        readAt: { type: Date, default: null, index: true },
        /** Metadata tuỳ ý (loanTicketId, bookCode, dueDate...) */
        meta: { type: Object, default: null },
    },
    { timestamps: true, collection: 'library_notifications' },
);

notificationMongoSchema.index({ userId: 1, createdAt: -1 });
notificationMongoSchema.index({ userId: 1, dedupeKey: 1 });

module.exports =
    mongoose.models.NotificationMongo || mongoose.model('NotificationMongo', notificationMongoSchema);
module.exports.NOTIFICATION_TYPES = NOTIFICATION_TYPES;

