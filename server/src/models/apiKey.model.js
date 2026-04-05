const { DataTypes } = require('sequelize');
const { connect } = require('../config/connectDB');

const apiKey = connect.define('apiKey', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    userId: {
        type: DataTypes.UUID,
        allowNull: false,
    },
    publicKey: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
    privateKey: {
        type: DataTypes.TEXT,
        allowNull: false,
    },
});

module.exports = apiKey;
