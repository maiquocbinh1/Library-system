/** Admin hoặc Thủ thư — quyền vận hành thư viện (không gồm cấu hình hệ thống chỉ dành cho admin). */
function libraryStaff(req, res, next) {
    const role = String(req?.user?.role || '').toLowerCase();
    if (role !== 'admin' && role !== 'librarian') {
        return res.status(403).json({ message: 'Forbidden: Bạn không có quyền truy cập' });
    }
    return next();
}

module.exports = { libraryStaff };
