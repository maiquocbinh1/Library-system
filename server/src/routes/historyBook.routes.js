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

/** Thủ thư: lập phiếu tại quầy (độc giả + nhiều barcode → xuất kho ngay) */
router.post('/staff-desk-issue', authUser, libraryStaff, asyncHandler(controllerLoanTicket.staffDeskIssue));

/** Thủ thư: nhận trả một cuốn — body { barcode } */
router.post('/return-book', authUser, libraryStaff, asyncHandler(controllerLoanTicket.returnBook));

/** Thủ thư gõ barcode để nhận trả sách (một hoặc nhiều mã) */
router.post('/return-by-barcode', authUser, libraryStaff, asyncHandler(controllerLoanTicket.returnByBarcode));

/** Nhật ký trả sách trong ngày (theo tài khoản thủ thư) — F5 vẫn xem được */
router.get('/returns-today', authUser, libraryStaff, asyncHandler(controllerLoanTicket.getReturnsToday));

/** Gợi ý độc giả (MSV / tên) cho quầy lưu thông */
router.get('/find-patrons', authUser, libraryStaff, asyncHandler(controllerLoanTicket.findPatronsForDesk));

/** Gia hạn phiếu mượn (quy tắc: tối đa 1 lần, chưa quá hạn, không nợ phạt) */
router.post('/renew-loan', authUser, libraryStaff, asyncHandler(controllerLoanTicket.renewLoan));

/** Kiểm tra thông tin barcode (tên sách, trạng thái) */
router.get('/check-barcode', authUser, libraryStaff, asyncHandler(controllerLoanTicket.checkBarcode));

module.exports = router;
