const express = require('express');
const router = express.Router();

const { authUser, asyncHandler } = require('../auth/checkAuth');
const bookshelfController = require('../controllers/bookshelf.controller');

router.get('/', authUser, asyncHandler(bookshelfController.getBookshelf));
router.post('/toggle-favorite', authUser, asyncHandler(bookshelfController.toggleFavorite));
router.post('/toggle-read-later', authUser, asyncHandler(bookshelfController.toggleReadLater));

module.exports = router;
