const usersRoutes = require('./users.routes');
const bookRoutes = require('./book.routes');
const historyBookRoutes = require('./historyBook.routes');
const policyRoutes = require('./policy.routes');
const fineRoutes = require('./fine.routes');
const analyticsRoutes = require('./analytics.routes');
const oasRoutes = require('./oas.routes');
const staffRoutes = require('./staff.routes');
const notificationRoutes = require('./notification.routes');
const libraryMailRoutes = require('./libraryMail.routes');

function route(app) {
    app.use('/api/user', usersRoutes);
    app.use('/api/product', bookRoutes);
    app.use('/api/history-book', historyBookRoutes);
    app.use('/api/policy', policyRoutes);
    app.use('/api/fines', fineRoutes);
    app.use('/api/admin', analyticsRoutes);
    app.use('/api/admin/oas', oasRoutes);
    app.use('/api/admin/staff', staffRoutes);
    app.use('/api/notifications', notificationRoutes);
    app.use('/api/library-mail', libraryMailRoutes);
}

module.exports = route;
