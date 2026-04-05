const User = require('./users.model');
const apikey = require('../models/apiKey.model');
const product = require('../models/product.model');
const historyBook = require('../models/historyBook.model');
const otp = require('../models/otp.model');

User.hasOne(apikey, { foreignKey: 'userId', as: 'apiKey', onDelete: 'CASCADE' });
apikey.belongsTo(User, { foreignKey: 'userId', as: 'user' });

const sync = async () => {
    await User.sync();
    await apikey.sync({ alter: true });
    await product.sync();
    await historyBook.sync();
    await otp.sync();
};

module.exports = sync;
