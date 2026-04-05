const usersRoutes = require('./users.routes');
const productRoutes = require('./product.routes');
const historyBookRoutes = require('./historyBook.routes');
const bookshelfRoutes = require('./bookshelf.routes');

function route(app) {
    app.use('/api/user', usersRoutes);
    app.use('/api/product', productRoutes);
    app.use('/api/history-book', historyBookRoutes);
    app.use('/api/bookshelf', bookshelfRoutes);
}

module.exports = route;
