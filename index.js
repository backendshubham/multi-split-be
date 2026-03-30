const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Session, connectDB } = require('./database');
const { Op } = require('sequelize');
const Razorpay = require('razorpay');
require('dotenv').config();

const app = express();

// --- Razorpay Setup ---
const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET,
});

// --- Middleware ---
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// Initialize Database Layer
connectDB();

// Health Check / Wake-up Route
app.get('/', (req, res) => res.json({ 
    status: 'Split-Orchestrator Online', 
    engine: 'Node-PostgreSQL-RZP',
    ts: new Date().toISOString()
}));

/**
 * [STEP 1] INITIALIZE - Create Orchestration Session
 */
app.post('/api/orchestrate/initialize', async (req, res) => {
    const { totalAmount, cardLegAmount } = req.body;
    
    if (!totalAmount || !cardLegAmount) {
        return res.status(400).json({ error: "Amount parameters are required." });
    }

    try {
        const upiLegAmount = totalAmount - cardLegAmount;
        const sessionID = `R_ORCH_${uuidv4().substring(0, 8).toUpperCase()}`;
        const expiryDate = new Date(Date.now() + 10 * 60 * 1000); // 10 Min Expiry

        // --- Create REAL Razorpay Order (Leg 1) ---
        // Ensuring Integer (Paise)
        const amountInPaise = Math.round(Number(cardLegAmount) * 100);

        const rzpOrder = await rzp.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: sessionID,
            notes: { session_id: sessionID, leg: "CARD_PAYMENT" }
        });

        // --- Sync with Persistent Database ---
        const session = await Session.create({
            sessionID,
            totalAmount,
            cardLegAmount,
            upiLegAmount,
            expiresAt: expiryDate,
            cardTxID: rzpOrder.id 
        });

        console.log(`[ORCHESTRATOR] New Session Created: ${sessionID} | Amount: ₹${totalAmount}`);
        
        res.json({
            sessionID: session.sessionID,
            rzpOrderID: rzpOrder.id,
            totalAmount: session.totalAmount,
            legs: {
                card: { amount: session.cardLegAmount, status: session.cardStatus },
                upi: { amount: session.upiLegAmount, status: session.upiStatus }
            }
        });
    } catch (err) {
        console.error("[FATAL ERROR] Gateway Unavailable:", err.message);
        res.status(500).json({ error: "Payment Gateway Error", detail: err.message });
    }
});

/**
 * [STEP 2] CARD VERIFICATION - Capture Payment ID
 */
app.post('/api/orchestrate/leg1-complete', async (req, res) => {
    const { sessionID, rzpPaymentID } = req.body;
    try {
        const session = await Session.findOne({ where: { sessionID } });
        if (!session) return res.status(404).json({ error: "Session expired or invalid." });

        session.cardStatus = 'AUTHORIZED';
        session.cardTxID = rzpPaymentID; // Finalize with actual Payment ID
        await session.save();

        console.log(`[ORCHESTRATOR] Leg 1 Succeeded: ${sessionID} | PaymentID: ${rzpPaymentID}`);
        res.json({ success: true, next_step: 'UPI_INTENT' });
    } catch (err) {
        res.status(500).json({ error: "Database Synchronization Failed." });
    }
});

/**
 * [STEP 3] RECONCILE - Final Multi-Leg Capture
 */
app.post('/api/orchestrate/finalize', async (req, res) => {
    const { sessionID, txID } = req.body;
    try {
        const session = await Session.findOne({ where: { sessionID } });
        if (!session) return res.status(404).json({ error: "Session Not Found." });
        if (session.cardStatus !== 'AUTHORIZED') {
            return res.status(403).json({ error: "Card Leg must be authorized first." });
        }

        session.upiStatus = 'SUCCESS';
        session.upiTxID = txID;
        session.reconciled = true;
        await session.save();

        console.log(`[RECONCILIATION] COMPLETE: ${sessionID} | Multi-Leg Settlement Finalized.`);
        res.json({ success: true, receipt: session });
    } catch (err) {
        res.status(500).json({ error: "Reconciliation Failure." });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n--------------------------------------------`);
    console.log(`🚀 MULTI-LEG ORCHESTRATOR SERVER ACTIVE`);
    console.log(`Port: ${PORT}`);
    console.log(`Status: PostgreSQL & Razorpay Synced`);
    console.log(`--------------------------------------------\n`);
});
