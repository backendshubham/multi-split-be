const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const { Session, connectDB } = require('./database');
const { Op } = require('sequelize');
require('dotenv').config();

const app = express();

// --- Production Middleware ---
app.use(cors({ origin: process.env.CLIENT_URL || '*' }));
app.use(express.json());

// Initialize Database Layer
connectDB();

// Root Ping Route (To wake up Free Tier Render)
app.get('/', (req, res) => res.json({ status: 'Orchestrater Online', tier: 'PROD_MIDDLEWARE' }));

/**
 * Split-Tender Orchestration Logic (Tier-1 Persistent)
 * Full State Machine Transition as per Project Proposal
 */

// --- 1. Session Initialization (Orchestrator Entry) ---
app.post('/api/orchestrate/initialize', async (req, res) => {
    const { totalAmount, cardLegAmount } = req.body;
    
    if (!totalAmount || !cardLegAmount) {
        return res.status(400).json({ error: "Amount parameters missing" });
    }

    const upiLegAmount = totalAmount - cardLegAmount;
    const sessionID = `ORCH_${uuidv4().substring(0, 8).toUpperCase()}`;
    const expiryDate = new Date(Date.now() + 10 * 60 * 1000); // 10 Min Strictly

    try {
        const session = await Session.create({
            sessionID,
            totalAmount,
            cardLegAmount,
            upiLegAmount,
            expiresAt: expiryDate
        });

        console.log(`[ORCHESTRATOR] Persistent Session Initialized: ${sessionID} | Total: ₹${totalAmount}`);
        res.json({
            sessionID: session.sessionID,
            totalAmount: session.totalAmount,
            legs: {
                card: { amount: session.cardLegAmount, status: session.cardStatus },
                upi: { amount: session.upiLegAmount, status: session.upiStatus }
            },
            expiresAt: session.expiresAt
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: "Failed to initialize persistent session" });
    }
});

// --- 2. Leg 1 (Card) Callback / Webhook Simulation ---
app.post('/api/orchestrate/leg1-complete', async (req, res) => {
    const { sessionID, txID } = req.body;
    
    try {
        const session = await Session.findOne({ 
            where: { sessionID, expiresAt: { [Op.gt]: new Date() } }
        });

        if (!session) return res.status(404).json({ error: "Session expired or invalid" });

        session.cardStatus = 'AUTHORIZED';
        session.cardTxID = txID;
        await session.save();

        console.log(`[ORCHESTRATOR] Leg 1 Success: ${sessionID} | TX: ${txID}`);
        res.json({ success: true, next: 'UPI_LEG' });
    } catch (err) {
        res.status(500).json({ error: "Internal State Update Error" });
    }
});

// --- 3. Leg 2 (UPI) & Final Reconciliation ---
app.post('/api/orchestrate/finalize', async (req, res) => {
    const { sessionID, txID } = req.body;
    
    try {
        const session = await Session.findOne({ where: { sessionID } });

        if (!session) return res.status(404).json({ error: "Session Not Found" });
        if (session.cardStatus !== 'AUTHORIZED') {
            return res.status(403).json({ error: "Pre-requisite Leg 1 Auth Missing" });
        }

        session.upiStatus = 'SUCCESS';
        session.upiTxID = txID;
        session.reconciled = true;
        await session.save();

        console.log(`[ORCHESTRATOR] FULL RECONCILIATION: ${sessionID} | Persistent Table Settled.`);
        res.json({ success: true, receipt: session });
    } catch (err) {
        res.status(500).json({ error: "Finalization Failure" });
    }
});

// --- 4. Special Failure Handler: Safe-Fail Refund Trigger ---
app.post('/api/orchestrate/fail-recovery', async (req, res) => {
    const { sessionID, errorReason } = req.body;
    
    try {
        const session = await Session.findOne({ where: { sessionID } });
        if (!session) return res.status(404).json({ error: "Session Not Found" });

        // If card was success but UPI failed, flag for refund
        if (session.cardStatus === 'AUTHORIZED' && session.upiStatus !== 'SUCCESS') {
           session.cardStatus = 'FAILED'; // Mocking Refund Status
           await session.save();
           console.log(`[ORCHESTRATOR] SAFE-FAIL RECOVERY: Refund queued for ${sessionID}`);
        }

        res.json({ success: true, status: 'RECOVERY_QUEUED' });
    } catch (err) {
        res.status(500).json({ error: "Recovery system offline" });
    }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`\n-----------------------------------------`);
    console.log(`SPLIT-PAYMENT PROPOSAL ORCHESTRATOR (PROD)`);
    console.log(`Layer: Persistent PostgreSQL-Compatible Node Tier`);
    console.log(`Port: ${PORT}`);
    console.log(`-----------------------------------------\n`);
});
