const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');
require('dotenv').config();

// Auto-switch between PostgreSQL (Production/Render) and SQLite (Local)
const isProduction = process.env.NODE_ENV === 'production' && process.env.DATABASE_URL;

const sequelize = isProduction
  ? new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
  })
  : new Sequelize({
    dialect: 'sqlite',
    storage: path.join(__dirname, 'orchestrator.sqlite'),
    logging: false
  });

const Session = sequelize.define('PaymentSession', {
  sessionID: { type: DataTypes.STRING, primaryKey: true },
  totalAmount: { type: DataTypes.FLOAT, allowNull: false },
  cardLegAmount: { type: DataTypes.FLOAT, allowNull: false },
  cardStatus: { type: DataTypes.ENUM('PENDING', 'AUTHORIZED', 'FAILED'), defaultValue: 'PENDING' },
  cardTxID: { type: DataTypes.STRING },
  upiLegAmount: { type: DataTypes.FLOAT, allowNull: false },
  upiStatus: { type: DataTypes.ENUM('PENDING', 'SUCCESS', 'FAILED'), defaultValue: 'PENDING' },
  upiTxID: { type: DataTypes.STRING },
  reconciled: { type: DataTypes.BOOLEAN, defaultValue: false },
  expiresAt: { type: DataTypes.DATE, allowNull: false }
});

const connectDB = async () => {
  try {
    await sequelize.authenticate();
    await sequelize.sync({ alter: true });
    console.log(`[DATABASE] ${isProduction ? 'PostgreSQL (Render)' : 'SQLite (Local)'} initialized.`);
  } catch (err) {
    console.error('[DATABASE] Core initialization failure:', err);
  }
};

module.exports = { Session, connectDB };
