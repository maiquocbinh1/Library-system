const express = require('express');
const router = express.Router();

const multer = require('multer');
const path = require('path');

const { authUser, asyncHandler } = require('../auth/checkAuth');
const { libraryStaff } = require('../middlewares/libraryStaff.middleware');

const controllerLoanTicket = require('../controllers/loanTicket.controller');

router.post('/create', authUser, asyncHandler(controllerLoanTicket.createHistoryBook));
router.get('/get-history-user', authUser, asyncHandler(controllerLoanTicket.getHistoryUser));
router.post('/cancel-book', authUser, asyncHandler(controllerLoanTicket.cancelBook));
router.get('/get-all-history-book', asyncHandler(controllerLoanTicket.getAllHistoryBook));
router.post('/update-status-book', asyncHandler(controllerLoanTicket.updateStatusBook));
router.post('/return-books', authUser, libraryStaff, asyncHandler(controllerLoanTicket.returnBooks));

module.exports = router;
