const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Session, connectDB } = require('./database');
const { Op } = require('sequelize');
const Razorpay = require('razorpay');
require('dotenv').config();

const app = express();
const rzp = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_SECRET,
});

// --- Production Middleware ---
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// Initialize Database Layer
connectDB();

// Root Ping Route
app.get('/', (req, res) => res.json({ status: 'Orchestrater Online', rzp_active: !!process.env.RAZORPAY_KEY_ID }));

// --- 1. Session Initialization & REAL Razorpay Order Creation ---
app.post('/api/orchestrate/initialize', async (req, res) => {
    const { totalAmount, cardLegAmount } = req.body;
    
    if (!totalAmount || !cardLegAmount) {
        return res.status(400).json({ error: "Amount parameters missing" });
    }

    try {
        const upiLegAmount = totalAmount - cardLegAmount;
        const sessionID = `ORCH_${uuidv4().substring(0, 8).toUpperCase()}`;
        const expiryDate = new Date(Date.now() + 10 * 60 * 1000);

        // CREATE ACTUAL RAZORPAY ORDER FOR LEG 1
        const rzpOrder = await rzp.orders.create({
            amount: cardLegAmount * 100, // paise
            currency: "INR",
            receipt: sessionID,
            notes: { orchestration_session: sessionID, leg: "CARD_PORTION" }
        });

        const session = await Session.create({
            sessionID,
            totalAmount,
            cardLegAmount,
            upiLegAmount,
            expiresAt: expiryDate,
            cardTxID: rzpOrder.id // Store Order ID as temporary TxID
        });

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
        console.error("[RZP ERROR]", err);
        res.status(500).json({ error: "Gateway Initialization Failed", detail: err.message });
    }
});

// --- 2. Leg 1 (Card) Success callback ---
app.post('/api/orchestrate/leg1-complete', async (req, res) => {
    const { sessionID, rzpPaymentID } = req.body;
    try {
        const session = await Session.findOne({ where: { sessionID } });
        if (!session) return res.status(404).json({ error: "Invalid Session" });

        session.cardStatus = 'AUTHORIZED';
        session.cardTxID = rzpPaymentID;
        await session.save();

        res.json({ success: true, next: 'UPI_LEG' });
    } catch (err) {
        res.status(500).json({ error: "State update failed" });
    }
});

// --- 3. Leg 2 (UPI) & Final Reconciliation ---
app.post('/api/orchestrate/finalize', async (req, res) => {
    const { sessionID, txID } = req.body;
    try {
        const session = await Session.findOne({ where: { sessionID } });
        if (!session) return res.status(404).json({ error: "Session Not Found" });

        session.upiStatus = 'SUCCESS';
        session.upiTxID = txID;
        session.reconciled = true;
        await session.save();

        res.json({ success: true, receipt: session });
    } catch (err) {
        res.status(500).json({ error: "Finalization Failure" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n--- SPLIT TENDER ORCHESTRATOR RUNNING ---`);
    console.log(`Port: ${PORT}`);
    console.log(`------------------------------------------\n`);
});
