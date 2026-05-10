const express = require('express');
const router = express.Router();

const { authUser, asyncHandler } = require('../auth/checkAuth');
const { libraryStaff } = require('../middlewares/libraryStaff.middleware');
const controllerLoanTicket = require('../controllers/loanTicket.controller');

// Sinh viên
router.post('/create', authUser, asyncHandler(controllerLoanTicket.createHistoryBook));
router.get('/get-history-user', authUser, asyncHandler(controllerLoanTicket.getHistoryUser));
router.post('/cancel-book', authUser, asyncHandler(controllerLoanTicket.cancelBook));

// Admin / Thủ thư
router.get('/get-all-history-book', asyncHandler(controllerLoanTicket.getAllHistoryBook));
router.post('/update-status-book', asyncHandler(controllerLoanTicket.updateStatusBook));
router.post('/return-books', authUser, libraryStaff, asyncHandler(controllerLoanTicket.returnBooks));

// ─── API mới — luồng barcode qltv_ptit ───────────────────────────────────────
/** Thủ thư gõ barcode để xác nhận xuất kho (PENDING → BORROWING) */
router.put('/confirm-borrow', authUser, libraryStaff, asyncHandler(controllerLoanTicket.confirmBorrow));

/** Thủ thư gõ barcode để nhận trả sách */
router.post('/return-by-barcode', authUser, libraryStaff, asyncHandler(controllerLoanTicket.returnByBarcode));

/** Kiểm tra thông tin barcode (tên sách, trạng thái) */
router.get('/check-barcode', authUser, libraryStaff, asyncHandler(controllerLoanTicket.checkBarcode));

module.exports = router;
