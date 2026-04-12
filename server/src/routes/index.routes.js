const usersRoutes = require('./users.routes');
const bookRoutes = require('./book.routes');
const historyBookRoutes = require('./historyBook.routes');
const policyRoutes = require('./policy.routes');
const fineRoutes = require('./fine.routes');

function route(app) {
    app.use('/api/user', usersRoutes);
    app.use('/api/product', bookRoutes);
    app.use('/api/history-book', historyBookRoutes);
    app.use('/api/policy', policyRoutes);
    app.use('/api/fines', fineRoutes);
}

module.exports = route;
