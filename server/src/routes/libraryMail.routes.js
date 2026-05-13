const express = require('express');
const router = express.Router();

const libraryMailController = require('../controllers/libraryMail.controller');
const { authUser, asyncHandler } = require('../auth/checkAuth');
const { libraryStaff } = require('../middlewares/libraryStaff.middleware');

/**
 * Staff: list mails/logs
 * GET /api/library-mail?type=all|SYSTEM|BORROW_CONFIRM|FORGOT_PASSWORD&status=all|PENDING|RESOLVED&q=
 */
router.get('/', authUser, libraryStaff, asyncHandler(libraryMailController.list));

/**
 * Public: create forgot password request
 * POST /api/library-mail/forgot-password
 */
router.post('/forgot-password', asyncHandler(libraryMailController.createForgotPasswordRequest));

/**
 * Staff: resolve forgot password -> reset to 123 + notify user
 * POST /api/library-mail/resolve-forgot-password
 */
router.post('/resolve-forgot-password', authUser, libraryStaff, asyncHandler(libraryMailController.resolveForgotPassword));

module.exports = router;

