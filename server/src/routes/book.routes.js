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
router.get('/book-copy', authUser, libraryStaff, asyncHandler(controllerBook.getBookCopy));
router.post('/book-copy', authUser, libraryStaff, asyncHandler(controllerBook.createBookCopy));
router.put('/book-copy', authUser, libraryStaff, asyncHandler(controllerBook.updateBookCopy));
router.delete('/book-copy', authUser, libraryStaff, asyncHandler(controllerBook.deleteBookCopy));

router.post('/update', authUser, libraryStaff, asyncHandler(controllerBook.updateProduct));
router.post('/delete', authUser, libraryStaff, asyncHandler(controllerBook.deleteProduct));

/** Đổi tên thể loại trên toàn bộ đầu sách (đồng bộ category + category_1) */
router.post('/bulk-rename-category', authUser, libraryStaff, asyncHandler(controllerBook.bulkRenameCategory));
/** Gỡ thể loại khỏi toàn bộ đầu sách đang gán */
router.post('/bulk-clear-category', authUser, libraryStaff, asyncHandler(controllerBook.bulkClearCategory));

/** Thêm bản sao bằng barcode thủ công */
router.post('/add-copies-by-barcode', authUser, libraryStaff, asyncHandler(controllerBook.addCopiesByBarcode));

module.exports = router;
