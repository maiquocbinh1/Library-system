const bcrypt = require('bcrypt');
const mongoose = require('mongoose');
const UserMongo = require('../models/user.mongo.model');
const ApiKeyMongo = require('../models/apiKey.mongo.model');
const AuditLogMongo = require('../models/auditLog.mongo.model');
const { BadRequestError } = require('../core/error.response');
const { OK, Created } = require('../core/success.response');
const { logAdminAction, AuditActions } = require('../utils/logAdminAction');
const { random36, createApiKeyForUser } = require('../services/apiKeyService');

/** Map adminId (ObjectId) → fullName hiện tại — audit hiển thị đúng tên sau khi đổi hồ sơ. */
async function buildStaffNameByIdMap(adminIds) {
    const uniq = [...new Set(adminIds.map((id) => String(id || '')).filter(Boolean))];
    const oids = uniq.filter((id) => mongoose.isValidObjectId(id));
    if (!oids.length) return new Map();
    const users = await UserMongo.find({ _id: { $in: oids } }).select('fullName').lean();
    return new Map(users.map((u) => [String(u._id), String(u.fullName || '').trim() || '—']));
}

/**
 * DTO trả về FE — không chứa password.
 */
function toStaffDto(u) {
    const raw = u.toObject ? u.toObject() : u;
    return {
        id: String(raw._id),
        mysqlId: raw.mysqlId,
        fullName: raw.fullName,
        email: raw.email,
        phone: raw.phone,
        address: raw.address,
        role: raw.role,
        typeLogin: raw.typeLogin,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
    };
}

/**
 * Module Quản lý nhân sự (HR) + API đọc nhật ký kiểm toán / KPI thao tác.
 * Route gốc: `/api/admin/staff` — xem `routes/staff.routes.js`.
 * Phân quyền: toàn bộ endpoint dưới đây yêu cầu `authUser` + `isAdmin` (chỉ admin).
 */
class staffController {
    /**
     * Danh sách nhân sự vận hành: Admin + Thủ thư + Nhân viên kho (để hiển thị trên trang HR).
     */
    async getAllStaff(req, res) {
        const list = await UserMongo.find({ role: { $in: ['admin', 'librarian', 'warehouse'] } })
            .select('-password')
            .sort({ role: 1, createdAt: -1 })
            .lean();
        const order = { admin: 0, librarian: 1, warehouse: 2 };
        list.sort((a, b) => (order[a.role] ?? 9) - (order[b.role] ?? 9));
        const metadata = list.map((u) => ({
            ...u,
            id: String(u._id),
        }));
        new OK({ message: 'Lấy danh sách nhân sự thành công', metadata }).send(res);
    }

    /**
     * Admin tạo tài khoản thủ thư hoặc nhân viên kho — hash mật khẩu giống User.
     * Body: { email, password, fullName, phone?, address?, staffRole?: 'librarian' | 'warehouse' }
     */
    async createStaff(req, res) {
        const { email, password, fullName, phone, address, staffRole } = req.body;
        if (!email || !password || !fullName) {
            throw new BadRequestError('Vui lòng nhập email, mật khẩu và họ tên');
        }
        if (String(password).length < 6) {
            throw new BadRequestError('Mật khẩu tối thiểu 6 ký tự');
        }
        const roleNorm = String(staffRole || 'librarian').toLowerCase();
        if (roleNorm !== 'librarian' && roleNorm !== 'warehouse') {
            throw new BadRequestError('staffRole chỉ nhận librarian hoặc warehouse');
        }
        const emailNorm = String(email).trim().toLowerCase();
        const dup = await UserMongo.findOne({ email: emailNorm });
        if (dup) {
            throw new BadRequestError('Email đã tồn tại');
        }

        const doc = await UserMongo.create({
            mysqlId: random36(),
            fullName: String(fullName).trim(),
            email: emailNorm,
            password: bcrypt.hashSync(String(password), bcrypt.genSaltSync(10)),
            phone: phone != null && String(phone).trim() ? String(phone).trim() : null,
            address: address != null ? String(address) : '',
            role: roleNorm,
            typeLogin: 'email',
        });

        await createApiKeyForUser(doc._id);

        await logAdminAction({
            req,
            action: AuditActions.STAFF_CREATED,
            targetId: String(doc._id),
            targetType: 'STAFF',
            oldValues: null,
            newValues: { email: doc.email, fullName: doc.fullName, role: doc.role },
        });

        new Created({
            message: roleNorm === 'warehouse' ? 'Đã tạo tài khoản nhân viên kho' : 'Đã tạo tài khoản thủ thư',
            metadata: toStaffDto(doc),
        }).send(res);
    }

    /**
     * Admin cập nhật thủ thư / nhân viên kho (họ tên, email, vai trò, SĐT, địa chỉ; mật khẩu tuỳ chọn).
     * PATCH body: { fullName, email, staffRole?, phone?, address?, password? }
     */
    async updateStaff(req, res) {
        const userId = String(req.params.userId || '').trim();
        if (!userId) {
            throw new BadRequestError('Thiếu userId');
        }
        const target = await UserMongo.findById(userId);
        if (!target) {
            throw new BadRequestError('Không tìm thấy nhân viên');
        }
        if (target.role === 'admin') {
            throw new BadRequestError('Không thể sửa tài khoản quản trị viên tại đây');
        }
        if (target.role !== 'librarian' && target.role !== 'warehouse') {
            throw new BadRequestError('Chỉ có thể sửa tài khoản thủ thư hoặc nhân viên kho');
        }

        const { email, fullName, phone, address, staffRole, password } = req.body;
        if (!fullName || !String(fullName).trim()) {
            throw new BadRequestError('Vui lòng nhập họ tên');
        }
        if (!email || !String(email).trim()) {
            throw new BadRequestError('Vui lòng nhập email');
        }
        const emailNorm = String(email).trim().toLowerCase();
        const roleNorm = String(staffRole || target.role).toLowerCase();
        if (roleNorm !== 'librarian' && roleNorm !== 'warehouse') {
            throw new BadRequestError('staffRole chỉ nhận librarian hoặc warehouse');
        }

        const dup = await UserMongo.findOne({ email: emailNorm, _id: { $ne: target._id } });
        if (dup) {
            throw new BadRequestError('Email đã được tài khoản khác sử dụng');
        }

        const oldSnap = toStaffDto(target);

        target.fullName = String(fullName).trim();
        target.email = emailNorm;
        target.role = roleNorm;
        target.phone = phone != null && String(phone).trim() ? String(phone).trim() : null;
        target.address = address != null ? String(address) : '';

        if (password != null && String(password).trim() !== '') {
            if (String(password).length < 6) {
                throw new BadRequestError('Mật khẩu tối thiểu 6 ký tự');
            }
            target.password = bcrypt.hashSync(String(password), bcrypt.genSaltSync(10));
        }

        await target.save();

        await logAdminAction({
            req,
            action: AuditActions.STAFF_UPDATED,
            targetId: String(target._id),
            targetType: 'STAFF',
            oldValues: oldSnap,
            newValues: toStaffDto(target),
        });

        new OK({ message: 'Đã cập nhật nhân sự', metadata: toStaffDto(target) }).send(res);
    }

    /**
     * Admin thu hồi tài khoản thủ thư hoặc nhân viên kho (không xóa Admin).
     */
    async deleteStaff(req, res) {
        const userId = String(req.params.userId || req.body?.userId || '').trim();
        if (!userId) {
            throw new BadRequestError('Thiếu userId');
        }
        const target = await UserMongo.findById(userId);
        if (!target) {
            throw new BadRequestError('Không tìm thấy nhân viên');
        }
        if (target.role === 'admin') {
            throw new BadRequestError('Không thể xóa tài khoản quản trị viên');
        }
        if (target.role !== 'librarian' && target.role !== 'warehouse') {
            throw new BadRequestError('Chỉ có thể xóa tài khoản thủ thư hoặc nhân viên kho');
        }
        if (String(req.user.id) === String(target._id)) {
            throw new BadRequestError('Không thể xóa chính tài khoản đang đăng nhập');
        }

        const oldSnap = toStaffDto(target);
        const uid = String(target._id);
        await ApiKeyMongo.deleteMany({ userId: uid });
        await UserMongo.deleteOne({ _id: target._id });

        await logAdminAction({
            req,
            action: AuditActions.STAFF_DELETED,
            targetId: uid,
            targetType: 'STAFF',
            oldValues: oldSnap,
            newValues: null,
        });

        new OK({ message: 'Đã xóa tài khoản nhân sự' }).send(res);
    }

    /**
     * Nhật ký kiểm toán — chỉ Admin (route đã gắn isAdmin).
     * Query: page, limit, action?, adminId?
     */
    async getAuditLogs(req, res) {
        const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit || '20'), 10) || 20));
        const action = String(req.query.action || '').trim();
        const adminId = String(req.query.adminId || '').trim();
        const targetType = String(req.query.targetType || '').trim();

        const filter = {};
        if (action) filter.action = action;
        if (adminId) filter.adminId = adminId;
        if (targetType) filter.targetType = targetType;

        const skip = (page - 1) * limit;
        const [items, total] = await Promise.all([
            AuditLogMongo.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            AuditLogMongo.countDocuments(filter),
        ]);

        const nameById = await buildStaffNameByIdMap(items.map((r) => r.adminId));

        const metadata = {
            items: items.map((r) => ({
                ...r,
                _id: String(r._id),
                adminName: nameById.get(String(r.adminId)) || r.adminName,
            })),
            total,
            page,
            limit,
        };
        new OK({ message: 'Lấy nhật ký kiểm toán thành công', metadata }).send(res);
    }

    /**
     * KPI: tổng số thao tác theo từng nhân viên (dựa trên audit log).
     * Aggregation — ai có totalActions cao = hoạt động nhiều trên hệ thống.
     */
    async getStaffActionStats(req, res) {
        const pipeline = [
            { $match: { adminRole: { $in: ['admin', 'librarian', 'warehouse'] } } },
            {
                $group: {
                    _id: '$adminId',
                    adminName: { $last: '$adminName' },
                    adminRole: { $last: '$adminRole' },
                    totalActions: { $sum: 1 },
                },
            },
            { $sort: { totalActions: -1 } },
        ];
        const summary = await AuditLogMongo.aggregate(pipeline);
        const nameById = await buildStaffNameByIdMap(summary.map((s) => s._id));
        const metadata = summary.map((s) => ({
            staffId: s._id,
            adminName: nameById.get(String(s._id)) || s.adminName,
            adminRole: s.adminRole,
            totalActions: s.totalActions,
        }));
        new OK({ message: 'Thống kê hiệu suất thao tác', metadata }).send(res);
    }

    /**
     * Chi tiết số lần theo từng mã action của một nhân viên (phục vụ biểu đồ drill-down).
     * Query: staffId (bắt buộc) — trùng adminId trong audit log.
     */
    async getStaffActionBreakdown(req, res) {
        const staffId = String(req.query.staffId || '').trim();
        if (!staffId) {
            throw new BadRequestError('Thiếu staffId');
        }
        const pipeline = [
            { $match: { adminId: staffId } },
            { $group: { _id: '$action', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
        ];
        const rows = await AuditLogMongo.aggregate(pipeline);
        new OK({
            message: 'OK',
            metadata: rows.map((r) => ({ action: r._id, count: r.count })),
        }).send(res);
    }
}

module.exports = new staffController();
