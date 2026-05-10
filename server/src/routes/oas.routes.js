const express = require('express');
const router = express.Router();
const { authUser, asyncHandler } = require('../auth/checkAuth');
const { libraryStaff } = require('../middlewares/libraryStaff.middleware');
const oasController = require('../controllers/oas.controller');

router.post('/send-warning-email', authUser, libraryStaff, asyncHandler(oasController.sendWarningEmail));
router.post('/send-mass-email', authUser, libraryStaff, asyncHandler(oasController.sendMassEmail));
router.get('/email-logs', authUser, libraryStaff, asyncHandler(oasController.getEmailLogs));

module.exports = router;
