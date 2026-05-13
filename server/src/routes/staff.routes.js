const express = require('express');

/**
 * HR + Audit (chỉ Admin).
 *
 * GET    /api/admin/staff              — danh sách thủ thư
 * POST   /api/admin/staff              — tạo thủ thư / kho
 * PATCH  /api/admin/staff/:userId     — sửa thủ thư / kho
 * DELETE /api/admin/staff/:userId    — xóa thủ thư / kho
 * GET    /api/admin/staff/audit-logs   ?page&limit&action&adminId&targetType
 * GET    /api/admin/staff/audit-stats  — KPI tổng thao tác / nhân viên
 * GET    /api/admin/staff/audit-breakdown ?staffId — chi tiết action của 1 người
 */
const { authUser, asyncHandler } = require('../auth/checkAuth');
const { isAdmin } = require('../middlewares/admin.middleware');
const staffController = require('../controllers/staff.controller');

const router = express.Router();

/** Danh sách thủ thư */
router.get('/', authUser, isAdmin, asyncHandler(staffController.getAllStaff));

/** Tạo thủ thư mới */
router.post('/', authUser, isAdmin, asyncHandler(staffController.createStaff));

/** Nhật ký kiểm toán (phân trang) — đặt trước /:userId */
router.get('/audit-logs', authUser, isAdmin, asyncHandler(staffController.getAuditLogs));

/** KPI tổng thao tác theo nhân viên */
router.get('/audit-stats', authUser, isAdmin, asyncHandler(staffController.getStaffActionStats));

/** Phân rã action theo một staffId */
router.get('/audit-breakdown', authUser, isAdmin, asyncHandler(staffController.getStaffActionBreakdown));

/** Sửa thủ thư / nhân viên kho — :userId là Mongo _id */
router.patch('/:userId', authUser, isAdmin, asyncHandler(staffController.updateStaff));

/** Xóa thủ thư — :userId là Mongo _id (sau các route tĩnh) */
router.delete('/:userId', authUser, isAdmin, asyncHandler(staffController.deleteStaff));

module.exports = router;
