const { DataTypes } = require('sequelize');
const { connect } = require('../config/connectDB');

const product = connect.define('product', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
    },
    image: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    nameProduct: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    description: {
        type: DataTypes.TEXT,
        allowNull: true,
    },
    stock: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    covertType: {
        type: DataTypes.ENUM('hard', 'soft'),
        allowNull: false,
    },
    publishYear: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    pages: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
    language: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    publisher: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    publishingCompany: {
        type: DataTypes.STRING,
        allowNull: false,
    },
});

module.exports = product;
