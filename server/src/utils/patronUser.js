const READER_TYPES = ['SinhVien_ChinhQuy', 'GiangVien_CanBo', 'HocVien_NCS'];

function normalizeCode(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

/** Chuỗi MSV/MSG hiển thị (ưu tiên staffId nếu có) — không dùng mã độc giả riêng. */
function getPatronCodeString(user) {
    if (!user) return null;
    const staff = normalizeCode(user.staffId);
    if (staff) return staff;
    const stu = normalizeCode(user.studentId);
    if (stu && stu !== '0') return stu;
    const legacy = normalizeCode(user.idStudent);
    if (legacy && legacy !== '0') return legacy;
    return null;
}

function isPatronPending(user) {
    if (!user) return false;
    if (user.verificationStatus === 'pending') return true;
    const legacy = normalizeCode(user.idStudent);
    return legacy === '0';
}

/** Đủ điều kiện mượn sách: có MSV/MSG hợp lệ và không đang chờ duyệt. */
function canBorrowAsPatron(user) {
    if (!user || user.role === 'admin') return false;
    if (isPatronPending(user)) return false;
    return Boolean(getPatronCodeString(user));
}

function assignPatronCodeToUser(user, code, readerType) {
    const c = normalizeCode(code);
    if (!c) return;
    const type = readerType || user.readerType || 'SinhVien_ChinhQuy';
    if (type === 'GiangVien_CanBo') {
        user.staffId = c;
        user.studentId = null;
    } else {
        user.studentId = c;
        user.staffId = null;
    }
    user.readerType = type;
    user.idStudent = user.studentId || user.staffId || null;
}

module.exports = {
    READER_TYPES,
    normalizeCode,
    getPatronCodeString,
    isPatronPending,
    canBorrowAsPatron,
    assignPatronCodeToUser,
};
