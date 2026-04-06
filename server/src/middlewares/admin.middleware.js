function isAdmin(req, res, next) {
    const role = String(req?.user?.role || '').toLowerCase();

    if (role !== 'admin') {
        return res.status(403).json({ message: 'Forbidden: Bạn không có quyền truy cập' });
    }

    return next();
}

module.exports = { isAdmin };
