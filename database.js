const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

/**
 * Split-Tender Orchestration Database Logic (Tier-1 Persistent Layer)
 * Using SQLite locally for portability (Can be swapped for PostgreSQL in .env)
 */
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(__dirname, 'orchestrator.sqlite'),
  logging: false
});

const Session = sequelize.define('PaymentSession', {
  sessionID: { type: DataTypes.STRING, primaryKey: true },
  totalAmount: { type: DataTypes.FLOAT, allowNull: false },
  
  // Leg 1: Card
  cardLegAmount: { type: DataTypes.FLOAT, allowNull: false },
  cardStatus: { type: DataTypes.ENUM('PENDING', 'AUTHORIZED', 'FAILED'), defaultValue: 'PENDING' },
  cardTxID: { type: DataTypes.STRING },
  
  // Leg 2: UPI
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
    console.log('[DATABASE] PostgreSQL-compatible SQLite layer initialized.');
  } catch (err) {
    console.error('[DATABASE] Core initialization failure:', err);
  }
};

module.exports = { Session, connectDB };
