const express = require('express');
const router = express.Router();

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'src/uploads/avatars');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

var upload = multer({ storage: storage });

const { authUser, asyncHandler } = require('../auth/checkAuth');
const { isAdmin } = require('../middlewares/admin.middleware');

const controllerUser = require('../controllers/users.controller');

router.post('/register', asyncHandler(controllerUser.registerUser));
router.post('/login', asyncHandler(controllerUser.loginUser));
router.get('/auth', authUser, asyncHandler(controllerUser.authUser));
router.get('/refresh-token', asyncHandler(controllerUser.refreshToken));
router.get('/logout', authUser, asyncHandler(controllerUser.logout));
router.post('/update-user', authUser, upload.single('avatar'), asyncHandler(controllerUser.updateInfoUser));
router.post('/login-google', asyncHandler(controllerUser.loginGoogle));
router.post('/forgot-password', asyncHandler(controllerUser.forgotPassword));
router.post('/reset-password', asyncHandler(controllerUser.resetPassword));
router.get('/get-users', authUser, isAdmin, asyncHandler(controllerUser.getUsers));
router.post('/update-user-admin', authUser, isAdmin, asyncHandler(controllerUser.updateUser));
router.post('/delete-user', authUser, isAdmin, asyncHandler(controllerUser.deleteUser));
router.post('/update-password', authUser, isAdmin, asyncHandler(controllerUser.updatePassword));
router.post('/upload-image', upload.single('image'), authUser, asyncHandler(controllerUser.changeAvatar));

router.post('/request-id-student', authUser, asyncHandler(controllerUser.requestIdStudent));
router.post('/confirm-id-student', authUser, isAdmin, asyncHandler(controllerUser.confirmIdStudent));
router.get('/get-request-loan', authUser, isAdmin, asyncHandler(controllerUser.getRequestLoan));
router.get('/statistics', authUser, isAdmin, asyncHandler(controllerUser.getStatistics));

module.exports = router;
