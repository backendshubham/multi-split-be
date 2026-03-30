const { Sequelize, DataTypes } = require('sequelize');
require('dotenv').config();

// Professional-Grade Environment Enforcement
const { PGDATABASE, PGUSER, PGPASSWORD, PGHOST, PGPORT, DATABASE_URL } = process.env;

const isPostgresReady = (PGDATABASE && PGUSER) || DATABASE_URL;

if (!isPostgresReady) {
  console.error("--- DATABASE CONFIGURATION ERROR ---");
  console.error("The system cannot find PostgreSQL credentials.");
  console.error(`- PGDATABASE: ${PGDATABASE ? 'OK' : 'MISSING'}`);
  console.error(`- PGUSER: ${PGUSER ? 'OK' : 'MISSING'}`);
  console.error(`- PGHOST: ${PGHOST ? 'OK' : 'MISSING'}`);
  console.error("Please add these in the Render Dashboard Environment tab.");
  console.error("--------------------------------------");
  process.exit(1); // Forcefully stop the server with an error
}

// Optimized Sequelize Connection for Production
const sequelize = DATABASE_URL
  ? new Sequelize(DATABASE_URL, {
    dialect: 'postgres',
    protocol: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
    logging: false
  })
  : new Sequelize(PGDATABASE, PGUSER, PGPASSWORD, {
    host: PGHOST,
    port: PGPORT || 5432,
    dialect: 'postgres',
    dialectOptions: { ssl: { require: true, rejectUnauthorized: false } },
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
    console.log('[DATABASE] Tier-1 PostgreSQL (Supersourcing) Successfully Connected.');
  } catch (err) {
    console.error('[DATABASE] Fatal Connection Failure:', err);
    process.exit(1);
  }
};

module.exports = { Session, connectDB };
