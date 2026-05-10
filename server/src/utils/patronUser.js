const READER_TYPES = ['SinhVien_ChinhQuy'];

function normalizeCode(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
}

/** Chuỗi MSV hiển thị */
function getPatronCodeString(user) {
    if (!user) return null;
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

/** Đủ điều kiện mượn sách: có MSV hợp lệ và không đang chờ duyệt. */
function canBorrowAsPatron(user) {
    if (!user || user.role === 'admin') return false;
    if (isPatronPending(user)) return false;
    return Boolean(getPatronCodeString(user));
}

function assignPatronCodeToUser(user, code) {
    const c = normalizeCode(code);
    if (!c) return;
    user.studentId = c;
    user.readerType = 'SinhVien_ChinhQuy';
    user.idStudent = c;
}

module.exports = {
    READER_TYPES,
    normalizeCode,
    getPatronCodeString,
    isPatronPending,
    canBorrowAsPatron,
    assignPatronCodeToUser,
};
