const express = require('express');
const router = express.Router();

const { authUser, asyncHandler } = require('../auth/checkAuth');
const { libraryStaff } = require('../middlewares/libraryStaff.middleware');
const notificationController = require('../controllers/notification.controller');

// User
router.get('/my', authUser, asyncHandler(notificationController.getMyNotifications));
router.post('/mark-read', authUser, asyncHandler(notificationController.markRead));
router.post('/mark-all-read', authUser, asyncHandler(notificationController.markAllRead));

// Staff (admin/librarian/warehouse)
router.post('/send-warning', authUser, libraryStaff, asyncHandler(notificationController.sendWarning));
router.post('/send-mass', authUser, libraryStaff, asyncHandler(notificationController.sendMass));

module.exports = router;

