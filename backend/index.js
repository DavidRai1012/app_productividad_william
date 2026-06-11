const express = require('express');
const cors = require('cors');
const db = require('./database');
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// === Blocks API ===
app.get('/api/blocks', (req, res) => {
    const { start, end } = req.query;
    let query = "SELECT * FROM blocks";
    let params = [];
    if (start && end) {
        query += " WHERE date >= ? AND date <= ?";
        params = [start, end];
    }
    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => { if(r.checklist) r.checklist = JSON.parse(r.checklist); });
        res.json(rows);
    });
});

app.post('/api/blocks', (req, res) => {
    const { title, type, startTime, endTime, dates, isRecurring, recurrenceId, checklist, workspace, flowerId } = req.body;
    const chkStr = checklist ? JSON.stringify(checklist) : null;
    
    const stmt = db.prepare(`INSERT INTO blocks (title, type, startTime, endTime, date, isRecurring, recurrenceId, checklist, workspace, flowerId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`);
    
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        dates.forEach(d => {
            stmt.run([title, type, startTime, endTime, d, isRecurring ? 1 : 0, recurrenceId, chkStr, workspace || 'default', flowerId]);
        });
        db.run("COMMIT", function(err) {
            if(err) res.status(500).json({ error: err.message });
            else res.json({ success: true, recurrenceId });
        });
    });
    stmt.finalize();
});

app.put('/api/blocks/:id', (req, res) => {
    const { title, type, startTime, endTime, date, checklist } = req.body;
    const chkStr = checklist ? JSON.stringify(checklist) : null;
    db.run(
        `UPDATE blocks SET title=?, type=?, startTime=?, endTime=?, date=?, checklist=? WHERE id=?`,
        [title, type, startTime, endTime, date, chkStr, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
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

app.delete('/api/blocks/:id', (req, res) => {
    const { deleteFollowing, recurrenceId, date } = req.query;
    if (deleteFollowing === 'true' && recurrenceId) {
        db.run(`DELETE FROM blocks WHERE recurrenceId=? AND date >= ?`, [recurrenceId, date], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    } else {
        db.run(`DELETE FROM blocks WHERE id=?`, [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    }
});

// === Flowers API ===
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
