const express = require('express');
const router = express.Router();

const multer = require('multer');
const path = require('path');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'src/uploads/products');
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    },
});

var upload = multer({ storage: storage });

const { authUser, asyncHandler } = require('../auth/checkAuth');
const { isAdmin } = require('../middlewares/admin.middleware');
const { libraryStaff } = require('../middlewares/libraryStaff.middleware');

const controllerBook = require('../controllers/book.controller');

router.post('/upload-image', authUser, libraryStaff, upload.single('image'), asyncHandler(controllerBook.uploadImage));
router.post('/create', authUser, libraryStaff, upload.single('image'), asyncHandler(controllerBook.createProduct));
router.get('/sync-book-codes', authUser, libraryStaff, asyncHandler(controllerBook.syncOldBooksCode));
router.get('/get-all', asyncHandler(controllerBook.getAllProduct));
router.get('/get-one', asyncHandler(controllerBook.getOneProduct));
router.get('/search', asyncHandler(controllerBook.searchProduct));
router.get('/book-copies', authUser, libraryStaff, asyncHandler(controllerBook.listAllBookCopies));
router.post('/update', authUser, libraryStaff, asyncHandler(controllerBook.updateProduct));
router.post('/delete', authUser, libraryStaff, asyncHandler(controllerBook.deleteProduct));

module.exports = router;
