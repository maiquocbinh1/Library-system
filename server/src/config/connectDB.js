require('dotenv').config();
const { Sequelize } = require('sequelize');

const dbHost = process.env.DB_HOST || '127.0.0.1';
const dbPort = Number(process.env.MYSQL_PORT || 3306);

const connect = new Sequelize('books', 'root', process.env.DB_PASSWORD, {
    host: dbHost,
    dialect: 'mysql',
    port: dbPort,
    logging: false,
});

/** Kết nối MySQL; lỗi không throw. Mặc định host 127.0.0.1. */
const connectDB = async () => {
    try {
        await connect.authenticate();
        console.log('[MySQL] Kết nối thành công');
        return true;
    } catch (error) {
        console.error('[MySQL] Kết nối thất bại:', error.message);
        return false;
    }
};

module.exports = { connectDB, connect };
