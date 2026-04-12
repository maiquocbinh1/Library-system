const express = require('express');
const router = express.Router();

const { authUser, asyncHandler } = require('../auth/checkAuth');
const { libraryStaff } = require('../middlewares/libraryStaff.middleware');
const fineTicketController = require('../controllers/fineTicket.controller');

router.get('/my-unpaid', authUser, asyncHandler(fineTicketController.getMyUnpaidFines));
router.get('/', authUser, libraryStaff, asyncHandler(fineTicketController.getAllFines));
router.put('/:id/pay', authUser, libraryStaff, asyncHandler(fineTicketController.payFine));

module.exports = router;
