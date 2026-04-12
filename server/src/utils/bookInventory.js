const BookMongo = require('../models/book.mongo.model');
const BookCopyMongo = require('../models/bookCopy.mongo.model');

async function countAvailableForBook(bookObjectId) {
    return BookCopyMongo.countDocuments({
        bookId: bookObjectId,
        status: 'AVAILABLE',
    });
}

async function countTotalCopiesForBook(bookObjectId) {
    return BookCopyMongo.countDocuments({ bookId: bookObjectId });
}

async function syncBookInventoryFields(bookId) {
    const b = await BookMongo.findById(bookId);
    if (!b) return;
    const [avail, total] = await Promise.all([countAvailableForBook(bookId), countTotalCopiesForBook(bookId)]);
    b.stock = avail;
    b.totalCopies = total;
    await b.save();
}

module.exports = {
    countAvailableForBook,
    countTotalCopiesForBook,
    syncBookInventoryFields,
};
