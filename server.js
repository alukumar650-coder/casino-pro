const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json());
app.use(cors());
app.use(express.static(__dirname));

const DB_FILE = path.join(__dirname, 'casino.db');

function loadDb() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            users: [{ user_id: 1, username: 'admin', password: 'admin123', role: 'admin', balance: 10000.00 }],
            settings: { upi_id: 'royal@ybl', merchant_name: 'RoyalVegas' },
            transactions: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
        return initialData;
    }
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

loadDb();
console.log('✅ Multi-Game Casino Server Ready!');

app.post('/api/register', (req, res) => {
    const { username, password } = req.body;
    const db = loadDb();
    if (db.users.find(u => u.username === username)) return res.status(400).json({ success: false, message: 'User already exists!' });
    const newUser = { user_id: db.users.length + 1, username, password, role: 'user', balance: 100.00 };
    db.users.push(newUser);
    saveDb(db);
    res.json({ success: true, message: 'Registered! ₹100 bonus added.', user: newUser });
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const db = loadDb();
    const user = db.users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ success: false, message: 'Invalid credentials!' });
    res.json({ success: true, user });
});

app.get('/api/user-data/:userId', (req, res) => {
    const db = loadDb();
    const user = db.users.find(u => u.user_id === parseInt(req.params.userId));
    const transactions = db.transactions.filter(t => t.user_id === user.user_id).reverse();
    res.json({ success: true, user, transactions, settings: db.settings });
});

app.post('/api/play-game', (req, res) => {
    const { userId, game, betAmount, choice } = req.body;
    const amount = parseFloat(betAmount);
    const db = loadDb();
    const user = db.users.find(u => u.user_id === parseInt(userId));

    if (!user || user.balance < amount || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Insufficient balance!' });
    }

    user.balance -= amount;
    let win = false;
    let payout = 0;
    let extraData = {};

    if (game === 'aviator') {
        const crashPoint = parseFloat((1.01 + Math.random() * 3).toFixed(2));
        return res.json({ success: true, betId: Date.now(), crashPoint, balance: user.balance });
    } 
    else if (game === 'teen_patti') {
        win = Math.random() < 0.48;
        if (win) { payout = amount * 2.0; user.balance += payout; }
    } 
    else if (game === 'andar_bahar') {
        const sides = ['Andar', 'Bahar'];
        const winningSide = sides[Math.floor(Math.random() * sides.length)];
        win = (choice === winningSide);
        if (win) { payout = amount * 2.0; user.balance += payout; }
        extraData = { joker: '7♠', winningSide };
    } 
    else if (game === 'call_break') {
        const tricks = Math.floor(Math.random() * 5) + 1;
        win = tricks >= 3;
        if (win) { payout = amount * 2.5; user.balance += payout; }
        extraData = { tricks };
    }

    saveDb(db);
    res.json({ success: true, win, payout, balance: user.balance, ...extraData });
});

app.post('/api/cashout-aviator', (req, res) => {
    const { userId, multiplier } = req.body;
    const db = loadDb();
    const user = db.users.find(u => u.user_id === parseInt(userId));
    const payout = 50 * parseFloat(multiplier);
    user.balance += payout;
    saveDb(db);
    res.json({ success: true, payout, balance: user.balance });
});

app.post('/api/deposit-request', (req, res) => {
    const { userId, amount, utr } = req.body;
    const db = loadDb();
    const user = db.users.find(u => u.user_id === parseInt(userId));
    db.transactions.push({ tx_id: Date.now(), user_id: user.user_id, username: user.username, type: 'deposit', amount: parseFloat(amount), utr_or_upi: utr, status: 'pending' });
    saveDb(db);
    res.json({ success: true, message: 'Deposit request sent to admin.' });
});

app.post('/api/withdraw-request', (req, res) => {
    const { userId, amount, upiId } = req.body;
    const db = loadDb();
    const user = db.users.find(u => u.user_id === parseInt(userId));
    if (user.balance < parseFloat(amount)) return res.status(400).json({ success: false, message: 'Low balance!' });
    user.balance -= parseFloat(amount);
    db.transactions.push({ tx_id: Date.now(), user_id: user.user_id, username: user.username, type: 'withdraw', amount: parseFloat(amount), utr_or_upi: upiId, status: 'pending' });
    saveDb(db);
    res.json({ success: true, balance: user.balance, message: 'Withdrawal requested.' });
});

app.get('/api/admin/dashboard', (req, res) => {
    const db = loadDb();
    res.json({ success: true, users: db.users, transactions: db.transactions.reverse(), settings: db.settings });
});

app.post('/api/admin/transaction-action', (req, res) => {
    const { txId, action } = req.body;
    const db = loadDb();
    const tx = db.transactions.find(t => t.tx_id === parseInt(txId));
    tx.status = action;
    const user = db.users.find(u => u.user_id === tx.user_id);
    if (tx.type === 'deposit' && action === 'approved') user.balance += tx.amount;
    if (tx.type === 'withdraw' && action === 'rejected') user.balance += tx.amount;
    saveDb(db);
    res.json({ success: true });
});

app.post('/api/admin/update-balance', (req, res) => {
    const { userId, newBalance } = req.body;
    const db = loadDb();
    const user = db.users.find(u => u.user_id === parseInt(userId));
    user.balance = parseFloat(newBalance);
    saveDb(db);
    res.json({ success: true });
});

app.post('/api/admin/settings', (req, res) => {
    const db = loadDb();
    db.settings = req.body;
    saveDb(db);
    res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`🚀 Pro Casino Server running on port ${PORT}`));
