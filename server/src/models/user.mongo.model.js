const mongoose = require('mongoose');

const READER_TYPES = ['SinhVien_ChinhQuy', 'GiangVien_CanBo', 'HocVien_NCS'];

const userMongoSchema = new mongoose.Schema(
    {
        mysqlId: { type: String, required: true, unique: true, index: true, maxlength: 36 },
        avatar: { type: String, default: null },
        fullName: { type: String, required: true },
        phone: { type: String, default: null },
        address: { type: String, default: null },
        email: { type: String, required: true },
        password: { type: String, default: null },
        role: { type: String, enum: ['admin', 'user', 'librarian'], default: 'user' },
        typeLogin: { type: String, enum: ['google', 'email'], required: true },

        /** MSV — sparse unique (không default null để tránh trùng index khi nhiều doc không có MSV) */
        studentId: { type: String, trim: true, sparse: true, unique: true },
        /** MSG — sparse unique */
        staffId: { type: String, trim: true, sparse: true, unique: true },
        /** Trường cũ: đồng bộ với MSV khi còn dữ liệu legacy; không dùng làm nghiệp vụ mới */
        idStudent: { type: String, default: null },

        readerType: { type: String, enum: READER_TYPES, default: null },
        verificationStatus: {
            type: String,
            enum: ['none', 'pending', 'verified'],
            default: 'none',
            index: true,
        },

        birthDate: { type: Date, default: null },
        className: { type: String, default: null, trim: true },
        gender: { type: String, enum: ['male', 'female', 'other', null], default: null },
        cardSystemType: { type: String, enum: ['civil', 'military', null], default: null },
        cardPlanMonths: { type: Number, default: null },
        libraryCardIssuedAt: { type: Date, default: null },
        libraryCardExpiresAt: { type: Date, default: null, index: true },
    },
    { timestamps: true, collection: 'library_users' },
);

userMongoSchema.pre('save', function syncLegacyIdStudent(next) {
    if (this.studentId) this.idStudent = this.studentId;
    else if (this.staffId) this.idStudent = this.staffId;
    next();
});

module.exports = mongoose.models.UserMongo || mongoose.model('UserMongo', userMongoSchema);
module.exports.READER_TYPES = READER_TYPES;
