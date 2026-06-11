const express = require('express');
const cors = require('cors');
const db = require('./database');
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ======== BLOCKS ========
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
        rows.forEach(r => {
            if (r.checklist) r.checklist = JSON.parse(r.checklist);
        });
        res.json(rows);
    });
});

app.post('/api/blocks', (req, res) => {
    const { title, type, startTime, endTime, dates, isRecurring, recurrenceId, checklist, workspace, flowerId, recurrentId } = req.body;
    const chkStr = checklist ? JSON.stringify(checklist) : '[]';
    const stmt = db.prepare(
        "INSERT INTO blocks (title, type, startTime, endTime, date, isRecurring, recurrenceId, checklist, workspace, flowerId, recurrentId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        (dates || []).forEach(d => {
            stmt.run([title, type, startTime, endTime, d, isRecurring ? 1 : 0, recurrenceId || null, chkStr, workspace || 'default', flowerId || null, recurrentId || null]);
        });
        db.run("COMMIT", function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
    stmt.finalize();
});

app.put('/api/blocks/:id', (req, res) => {
    const { title, type, startTime, endTime, date, checklist } = req.body;
    const chkStr = checklist ? JSON.stringify(checklist) : '[]';
    db.run(
        "UPDATE blocks SET title=?, type=?, startTime=?, endTime=?, date=?, checklist=? WHERE id=?",
        [title, type, startTime, endTime, date, chkStr, req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        }
    );
});

app.put('/api/blocks/:id/complete', (req, res) => {
    const { completed } = req.body;
    db.run("UPDATE blocks SET completed = ? WHERE id = ?", [completed ? 1 : 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/blocks/:id', (req, res) => {
    const { deleteFollowing, recurrenceId, date } = req.query;
    if (deleteFollowing === 'true' && recurrenceId) {
        db.run("DELETE FROM blocks WHERE recurrenceId=? AND date >= ?", [recurrenceId, date], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    } else {
        db.run("DELETE FROM blocks WHERE id=?", [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    }
});

// ======== FLOWERS ========
app.get('/api/flowers', (req, res) => {
    db.all("SELECT * FROM flowers", [], (err, flowers) => {
        if (err) return res.status(500).json({ error: err.message });
        // Para cada flor, cargar objectives y recurrents
        const promises = flowers.map(f => {
            return new Promise((resolve) => {
                db.all("SELECT * FROM objectives WHERE flowerId=? ORDER BY orderIndex ASC", [f.id], (e1, objs) => {
                    db.all("SELECT * FROM flower_recurrents WHERE flowerId=?", [f.id], (e2, recs) => {
                        recs.forEach(r => {
                            if (r.days) r.days = JSON.parse(r.days);
                            if (r.checklist) r.checklist = JSON.parse(r.checklist);
                        });
                        const total = (objs || []).length;
                        const done = (objs || []).filter(o => o.completed).length;
                        resolve({
                            ...f,
                            objectives: objs || [],
                            recurrents: recs || [],
                            progress: total > 0 ? Math.round((done / total) * 100) : 0
                        });
                    });
                });
            });
        });
        Promise.all(promises).then(result => res.json(result));
    });
});

app.post('/api/flowers', (req, res) => {
    const { title, imageIndex } = req.body;
    db.run("INSERT INTO flowers (title, imageIndex) VALUES (?, ?)", [title, imageIndex || 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/flowers/:id', (req, res) => {
    const { title, imageIndex } = req.body;
    db.run("UPDATE flowers SET title=?, imageIndex=? WHERE id=?", [title, imageIndex, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/flowers/:id', (req, res) => {
    db.serialize(() => {
        db.run("DELETE FROM objectives WHERE flowerId=?", [req.params.id]);
        db.run("DELETE FROM flower_recurrents WHERE flowerId=?", [req.params.id]);
        db.run("DELETE FROM blocks WHERE flowerId=?", [req.params.id]);
        db.run("DELETE FROM flowers WHERE id=?", [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// ======== OBJECTIVES ========
app.post('/api/objectives', (req, res) => {
    const { flowerId, title, orderIndex } = req.body;
    db.run("INSERT INTO objectives (flowerId, title, orderIndex) VALUES (?, ?, ?)", [flowerId, title, orderIndex || 0], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/objectives/:id/complete', (req, res) => {
    const { completed } = req.body;
    db.run("UPDATE objectives SET completed=? WHERE id=?", [completed ? 1 : 0, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.put('/api/objectives/reorder', (req, res) => {
    const { objectives } = req.body; // [{id, orderIndex}]
    const stmt = db.prepare("UPDATE objectives SET orderIndex=? WHERE id=?");
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        (objectives || []).forEach(o => stmt.run([o.orderIndex, o.id]));
        db.run("COMMIT", function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
    stmt.finalize();
});

app.delete('/api/objectives/:id', (req, res) => {
    db.run("DELETE FROM objectives WHERE id=?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ======== FLOWER RECURRENTS ========
app.post('/api/flower-recurrents', (req, res) => {
    const { flowerId, title, startTime, endTime, days, checklist } = req.body;
    db.run(
        "INSERT INTO flower_recurrents (flowerId, title, startTime, endTime, days, checklist) VALUES (?, ?, ?, ?, ?, ?)",
        [flowerId, title, startTime || '09:00', endTime || '10:00', JSON.stringify(days || []), JSON.stringify(checklist || [])],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const recurrentId = this.lastID;
            // Generar bloques en el calendario para los próximos 365 días
            const recurrenceId = 'rec_' + Date.now();
            const today = new Date();
            const limit = new Date(today);
            limit.setFullYear(limit.getFullYear() + 1);
            const dates = [];
            let d = new Date(today);
            while (d <= limit) {
                if ((days || []).includes(d.getDay())) {
                    dates.push(d.toISOString().split('T')[0]);
                }
                d.setDate(d.getDate() + 1);
            }
            if (dates.length > 0) {
                const stmt2 = db.prepare(
                    "INSERT INTO blocks (title, type, startTime, endTime, date, isRecurring, recurrenceId, checklist, flowerId, recurrentId) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?)"
                );
                db.serialize(() => {
                    db.run("BEGIN TRANSACTION");
                    dates.forEach(dt => {
                        stmt2.run([title, 'garden', startTime || '09:00', endTime || '10:00', dt, recurrenceId, JSON.stringify(checklist || []), flowerId, recurrentId]);
                    });
                    db.run("COMMIT");
                });
                stmt2.finalize();
            }
            res.json({ id: recurrentId, recurrenceId });
        }
    );
});

app.put('/api/flower-recurrents/:id', (req, res) => {
    const { title, startTime, endTime, days, checklist } = req.body;
    db.run(
        "UPDATE flower_recurrents SET title=?, startTime=?, endTime=?, days=?, checklist=? WHERE id=?",
        [title, startTime, endTime, JSON.stringify(days || []), JSON.stringify(checklist || []), req.params.id],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            // Actualizar bloques futuros de este recurrente
            const today = new Date().toISOString().split('T')[0];
            db.run(
                "UPDATE blocks SET title=?, startTime=?, endTime=?, checklist=? WHERE recurrentId=? AND date >= ?",
                [title, startTime, endTime, JSON.stringify(checklist || []), req.params.id, today],
                function(err2) {
                    if (err2) return res.status(500).json({ error: err2.message });
                    res.json({ success: true });
                }
            );
        }
    );
});

app.delete('/api/flower-recurrents/:id', (req, res) => {
    const today = new Date().toISOString().split('T')[0];
    db.serialize(() => {
        db.run("DELETE FROM blocks WHERE recurrentId=? AND date >= ?", [req.params.id, today]);
        db.run("DELETE FROM flower_recurrents WHERE id=?", [req.params.id], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// ======== NEXT OBJECTIVE for a flower ========
app.get('/api/flowers/:id/next-objective', (req, res) => {
    db.get("SELECT * FROM objectives WHERE flowerId=? AND completed=0 ORDER BY orderIndex ASC LIMIT 1", [req.params.id], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(row || null);
    });
});

app.listen(port, () => {
    console.log("Backend running on http://localhost:" + port);
});
