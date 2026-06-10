const express = require('express');
const cors = require('cors');
const db = require('./database');
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// === Blocks API (Modo Campo) ===
app.get('/api/blocks', (req, res) => {
    db.all("SELECT * FROM blocks", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => { if(r.checklist) r.checklist = JSON.parse(r.checklist); });
        res.json(rows);
    });
});

app.post('/api/blocks', (req, res) => {
    const { title, type, startHour, duration, day, isRecurring, recurrenceRule, checklist, date, workspace, flowerId } = req.body;
    const chkStr = checklist ? JSON.stringify(checklist) : null;
    db.run(
        `INSERT INTO blocks (title, type, startHour, duration, day, isRecurring, recurrenceRule, checklist, date, workspace, flowerId) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [title, type, startHour, duration, day, isRecurring ? 1 : 0, recurrenceRule, chkStr, date, workspace, flowerId],
        function (err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/blocks/:id/complete', (req, res) => {
    const { completed } = req.body;
    db.run(`UPDATE blocks SET completed = ? WHERE id = ?`, [completed ? 1 : 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/blocks/:id', (req, res) => {
    const { title, type, startHour, duration, day, checklist, date, workspace } = req.body;
    const chkStr = checklist ? JSON.stringify(checklist) : null;
    db.run(
        `UPDATE blocks SET title=?, type=?, startHour=?, duration=?, day=?, checklist=?, date=?, workspace=? WHERE id=?`,
        [title, type, startHour, duration, day, chkStr, date, workspace, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.delete('/api/blocks/:id', (req, res) => {
    db.run(`DELETE FROM blocks WHERE id=?`, [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// === Flowers API (Modo Jardin) ===
app.get('/api/flowers', (req, res) => {
    db.all("SELECT * FROM flowers", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/flowers', (req, res) => {
    const { title } = req.body;
    db.run(`INSERT INTO flowers (title) VALUES (?)`, [title], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.listen(port, () => {
    console.log("Backend running on http://localhost:" + port);
});
