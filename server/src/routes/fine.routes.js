const express = require('express');
const router = express.Router();

const { authUser, asyncHandler } = require('../auth/checkAuth');
const { isAdmin } = require('../middlewares/admin.middleware');
const fineTicketController = require('../controllers/fineTicket.controller');

router.get('/my-unpaid', authUser, asyncHandler(fineTicketController.getMyUnpaidFines));
router.get('/', authUser, isAdmin, asyncHandler(fineTicketController.getAllFines));
router.put('/:id/pay', authUser, isAdmin, asyncHandler(fineTicketController.payFine));

module.exports = router;
