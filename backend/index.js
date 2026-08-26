const express = require('express');
const cors = require('cors');
const db = require('./database');
const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ======== HELPERS ========

// Fecha local 'YYYY-MM-DD' (NUNCA usar toISOString para fechas de calendario: desfasa el día según la zona horaria)
function localDateStr(d = new Date()) {
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

// 'HH:MM' -> minutos del día. endTime '00:00' significa medianoche (fin de día) = 1440.
function toMin(hhmm) {
    if (!hhmm || typeof hhmm !== 'string') return null;
    const parts = hhmm.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
}

function toHHMM(min) {
    return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

function endMinOf(endTime) {
    if (endTime === '00:00') return 1440;
    return toMin(endTime);
}

// Checklist canónica: [{task: string, done: boolean}]. Acepta legacy {text} y JSON corrupto (-> []).
function parseChecklist(raw) {
    if (!raw) return [];
    let arr = raw;
    if (typeof raw === 'string') {
        try { arr = JSON.parse(raw); } catch (e) { return []; }
    }
    if (!Array.isArray(arr)) return [];
    return arr.map(item => ({
        task: (item && (item.task !== undefined && item.task !== null ? item.task : item.text)) || '',
        done: !!(item && item.done)
    }));
}

function parseJsonArray(raw) {
    if (!raw) return [];
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr : [];
    } catch (e) {
        return [];
    }
}

// ======== BLOCKS ========
app.get('/api/blocks', (req, res) => {
    const { start, end, scheduleId } = req.query;
    let query = "SELECT * FROM blocks WHERE 1=1";
    let params = [];
    
    if (start && end) {
        query += " AND date >= ? AND date <= ?";
        params.push(start, end);
    }
    
    if (scheduleId && scheduleId !== 'null') {
        query += " AND scheduleId = ?";
        params.push(scheduleId);
    } else {
        query += " AND scheduleId IS NULL";
    }

    db.all(query, params, (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.checklist = parseChecklist(r.checklist);
        });
        res.json(rows);
    });
});

app.post('/api/blocks', (req, res) => {
    const { title, type, startTime, endTime, dates, isRecurring, recurrenceId, checklist, workspace, flowerId, recurrentId, scheduleId, color } = req.body;
    if (!title || !type || !Array.isArray(dates) || dates.length === 0) {
        return res.status(400).json({ error: 'title, type y dates (array no vacío) son obligatorios' });
    }
    const chkStr = JSON.stringify(Array.isArray(checklist) ? checklist : []);
    const stmt = db.prepare(
        "INSERT INTO blocks (title, type, startTime, endTime, date, isRecurring, recurrenceId, checklist, workspace, flowerId, recurrentId, scheduleId, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    let insertError = null;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        dates.forEach(d => {
            stmt.run([title, type, startTime, endTime, d, isRecurring ? 1 : 0, recurrenceId || null, chkStr, workspace || 'default', flowerId || null, recurrentId || null, scheduleId || null, color || null], function(err) {
                if (err && !insertError) insertError = err;
            });
        });
        stmt.finalize(function(fErr) {
            if (fErr && !insertError) insertError = fErr;
            // Todo-o-nada: un COMMIT parcial duplicaría fechas cuando el usuario reintenta tras un 500
            if (insertError) {
                return db.run("ROLLBACK", function() {
                    res.status(500).json({ error: insertError.message });
                });
            }
            db.run("COMMIT", function(cErr) {
                if (cErr) {
                    return db.run("ROLLBACK", function() {
                        res.status(500).json({ error: cErr.message });
                    });
                }
                res.json({ success: true });
            });
        });
    });
});

// Batch para el corrimiento en cascada del Modo Campo: mueve varios bloques de una
// vez (fecha y horas) en una sola transacción todo-o-nada.
// IMPORTANTE: declarado ANTES de '/api/blocks/:id' para que Express no capture 'batch' como :id.
app.put('/api/blocks/batch', (req, res) => {
    const updates = req.body && req.body.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'updates (array no vacío) es obligatorio' });
    }
    const bad = updates.find(u => !u || u.id === undefined ||
        typeof u.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(u.date) ||
        !u.startTime || !u.endTime);
    if (bad) {
        return res.status(400).json({ error: 'cada update requiere id, date (YYYY-MM-DD), startTime y endTime' });
    }
    const stmt = db.prepare("UPDATE blocks SET date=?, startTime=?, endTime=? WHERE id=?");
    let updateError = null;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        updates.forEach(u => {
            stmt.run([u.date, u.startTime, u.endTime, u.id], function(err) {
                if (err && !updateError) updateError = err;
            });
        });
        stmt.finalize(function(err) {
            if (err && !updateError) updateError = err;
            if (updateError) {
                return db.run("ROLLBACK", function() {
                    res.status(500).json({ error: updateError.message });
                });
            }
            db.run("COMMIT", function(cErr) {
                if (cErr) {
                    return db.run("ROLLBACK", function() {
                        res.status(500).json({ error: cErr.message });
                    });
                }
                res.json({ success: true });
            });
        });
    });
});

// UPDATE dinámico parcial: solo actualiza los campos presentes en req.body (undefined = no tocar).
app.put('/api/blocks/:id', (req, res) => {
    const body = req.body || {};
    const sets = [];
    const params = [];

    // Campos que se guardan tal cual (date SINGULAR 'YYYY-MM-DD')
    ['title', 'type', 'startTime', 'endTime', 'date', 'color', 'flowerId', 'recurrentId', 'scheduleId', 'recurrenceId'].forEach(f => {
        if (body[f] !== undefined) {
            sets.push(f + '=?');
            params.push(body[f]);
        }
    });

    // Checklist: array -> JSON string
    if (body.checklist !== undefined) {
        sets.push('checklist=?');
        params.push(JSON.stringify(Array.isArray(body.checklist) ? body.checklist : []));
    }

    // Booleans -> 1/0
    ['completed', 'failed', 'isRecurring'].forEach(f => {
        if (body[f] !== undefined) {
            sets.push(f + '=?');
            params.push(body[f] ? 1 : 0);
        }
    });

    if (sets.length === 0) {
        return res.status(400).json({ error: 'No se envió ningún campo válido para actualizar' });
    }

    params.push(req.params.id);
    db.run('UPDATE blocks SET ' + sets.join(', ') + ' WHERE id=?', params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// Elige una imagen de flor REAL ('/flowers/flower_01.png'..'/flowers/flower_10.png')
// que aún no esté desbloqueada. callback(err, imagePath | null si ya están todas).
function pickRareSeedImage(callback) {
    db.all('SELECT imagePath FROM unlocked_images', [], function(err, rows) {
        if (err) return callback(err, null);
        var unlocked = (rows || []).map(function(r) { return r.imagePath; });
        var candidates = [];
        for (var i = 1; i <= 10; i++) {
            var p = '/flowers/flower_' + String(i).padStart(2, '0') + '.png';
            if (unlocked.indexOf(p) === -1) candidates.push(p);
        }
        if (candidates.length === 0) return callback(null, null);
        callback(null, candidates[Math.floor(Math.random() * candidates.length)]);
    });
}

app.put('/api/blocks/:id/harvest', function(req, res) {
    var blockId = req.params.id;
    // Look up the block to get flowerId
    db.get("SELECT * FROM blocks WHERE id=?", [blockId], function(err, block) {
        if (err) return res.status(500).json({ error: err.message });
        if (!block) return res.status(404).json({ error: 'Block not found' });
        // Guard anti re-cosecha (cosechar un bloque failed SÍ se permite: completar tarde)
        if (block.completed) return res.status(409).json({ error: 'already_harvested' });

        // Calcular recompensa aleatoria
        var roll = Math.random();
        var rewardType = 'none';
        if (roll < 0.05) rewardType = 'rare_seed';
        else if (roll < 0.20) rewardType = 'golden_rain';
        else if (roll < 0.50) rewardType = 'fertilizer';

        function proceed(imagePath) {
            var harvestedAt = new Date().toISOString();
            // Guard atómico: solo cosecha quien transiciona completed 0->1. Un segundo request
            // concurrente (doble click, auto-cosecha por checklist) obtiene changes=0 -> 409.
            db.run(
                "UPDATE blocks SET completed=1, failed=0, rewardType=?, harvestedAt=? WHERE id=? AND completed=0",
                [rewardType, harvestedAt, blockId],
                function(err) {
                    if (err) return res.status(500).json({ error: err.message });
                    if (this.changes === 0) return res.status(409).json({ error: 'already_harvested' });

                    function finish(newHealth) {
                        if (rewardType === 'rare_seed' && imagePath) {
                            // OR IGNORE + índice UNIQUE (database.js): sin duplicados aunque dos requests elijan la misma imagen
                            db.run('INSERT OR IGNORE INTO unlocked_images (imagePath) VALUES (?)', [imagePath], function(insErr) {
                                if (insErr) return res.status(500).json({ error: insErr.message });
                                res.json({ success: true, rewardType: rewardType, newHealth: newHealth, imagePath: imagePath });
                            });
                        } else {
                            res.json({ success: true, rewardType: rewardType, newHealth: newHealth });
                        }
                    }

                    if (!block.flowerId) return finish(null);

                    // Update flower health
                    db.get("SELECT * FROM flowers WHERE id=?", [block.flowerId], function(err, flower) {
                        if (err || !flower) return finish(null);

                        var healthBonus = 5;
                        // Recovery watering: +15 if flower failed within last 7 days
                        if (flower.lastFailDate) {
                            var failDate = new Date(flower.lastFailDate);
                            var now = new Date();
                            var diffDays = (now.getTime() - failDate.getTime()) / (1000 * 60 * 60 * 24);
                            if (diffDays <= 7) {
                                healthBonus = 15;
                            }
                        }

                        // Recompensas de SALUD reales: fertilizer +5, golden_rain +10 (cap 100)
                        if (rewardType === 'fertilizer') {
                            healthBonus = healthBonus + 5;
                        } else if (rewardType === 'golden_rain') {
                            healthBonus = healthBonus + 10;
                        }

                        var newHealth = Math.min(100, (flower.health || 100) + healthBonus);
                        db.run("UPDATE flowers SET health=? WHERE id=?", [newHealth, block.flowerId], function(err) {
                            if (err) return res.status(500).json({ error: err.message });
                            finish(newHealth);
                        });
                    });
                }
            );
        }

        if (rewardType === 'rare_seed') {
            pickRareSeedImage(function(pickErr, imagePath) {
                if (pickErr) return res.status(500).json({ error: pickErr.message });
                if (!imagePath) {
                    // Todas las imágenes ya desbloqueadas: degradar a golden_rain (+10 salud)
                    rewardType = 'golden_rain';
                    return proceed(null);
                }
                proceed(imagePath);
            });
        } else {
            proceed(null);
        }
    });
});

// Marcar bloques vencidos como fallidos
app.post('/api/blocks/check-expired', function(req, res) {
    var now = new Date();
    var today = localDateStr(now);
    var currentMin = now.getHours() * 60 + now.getMinutes();

    db.serialize(function() {
        // Candidatos: bloques pendientes de hoy o de días pasados.
        // El vencimiento de HOY se decide en JS por minutos (endTime '00:00' = 1440, nunca vence dentro del propio día).
        db.all(
            "SELECT id, flowerId, date, endTime FROM blocks WHERE completed=0 AND failed=0 AND date <= ?",
            [today],
            function(err, candidates) {
                if (err) return res.status(500).json({ error: err.message });

                var failingBlocks = (candidates || []).filter(function(b) {
                    if (b.date < today) return true;
                    if (b.date === today) {
                        var em = endMinOf(b.endTime);
                        return em !== null && em < currentMin;
                    }
                    return false;
                });
                // Marcar UNO A UNO con guard failed=0 y penalizar SOLO lo que ESTA petición
                // transicionó (this.changes): evita la doble penalización de salud cuando dos
                // requests concurrentes (p.ej. doble montaje de StrictMode) leen el mismo snapshot.
                var idx = 0;
                var newlyFailed = [];
                var markError = null;
                function markNext() {
                    if (idx >= failingBlocks.length) {
                        if (markError) return res.status(500).json({ error: markError.message });
                        return applyPenalties();
                    }
                    var b = failingBlocks[idx++];
                    db.run("UPDATE blocks SET failed=1 WHERE id=? AND completed=0 AND failed=0", [b.id], function(err2) {
                        if (err2 && !markError) markError = err2;
                        else if (!err2 && this.changes > 0) newlyFailed.push(b);
                        markNext();
                    });
                }

                function applyPenalties() {
                    var expiredCount = newlyFailed.length;

                    // Reduce flower health for each newly-failed block with flowerId
                    var flowerIds = [];
                    newlyFailed.forEach(function(b) {
                        if (b.flowerId && flowerIds.indexOf(b.flowerId) === -1) {
                            flowerIds.push(b.flowerId);
                        }
                    });

                    var healthUpdated = 0;
                    function updateFlowerHealth() {
                        if (healthUpdated >= flowerIds.length) {
                            checkMeasurableObjectives();
                            return;
                        }
                        var fid = flowerIds[healthUpdated];
                        var failCount = 0;
                        newlyFailed.forEach(function(b) {
                            if (b.flowerId === fid) failCount++;
                        });
                        var penalty = failCount * 10;
                        db.run("UPDATE flowers SET health = MAX(0, health - ?), lastFailDate=? WHERE id=?", [penalty, today, fid], function(err) {
                            healthUpdated++;
                            updateFlowerHealth();
                        });
                    }

                    function checkMeasurableObjectives() {
                        db.all(
                            "SELECT o.id, o.flowerId FROM objectives o WHERE o.isMeasurable=1 AND o.dueDate < ? AND o.completed=0 AND o.shieldBroken=0",
                            [today],
                            function(err, expiredObjs) {
                                if (err || !expiredObjs || expiredObjs.length === 0) {
                                    return res.json({ success: true, expiredCount: expiredCount });
                                }
                                var objIdx = 0;
                                function processObj() {
                                    if (objIdx >= expiredObjs.length) {
                                        return res.json({ success: true, expiredCount: expiredCount });
                                    }
                                    var obj = expiredObjs[objIdx];
                                    // Guard shieldBroken=0: el -20 de salud solo lo aplica quien rompió el escudo
                                    db.run("UPDATE objectives SET shieldBroken=1 WHERE id=? AND shieldBroken=0 AND completed=0", [obj.id], function(err) {
                                        var broken = !err && this.changes > 0;
                                        if (broken && obj.flowerId) {
                                            db.run("UPDATE flowers SET health = MAX(0, health - 20) WHERE id=?", [obj.flowerId], function(err) {
                                                objIdx++;
                                                processObj();
                                            });
                                        } else {
                                            objIdx++;
                                            processObj();
                                        }
                                    });
                                }
                                processObj();
                            }
                        );
                    }

                    updateFlowerHealth();
                }

                markNext();
            }
        );
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
                        (recs || []).forEach(r => {
                            r.days = parseJsonArray(r.days);
                            r.checklist = parseChecklist(r.checklist);
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

// Valida que la especie exista y esté desbloqueada (espejo de frontend/src/species.js):
// 'jardin_clasico' y 'flor_01' siempre disponibles; 'flor_02'..'flor_10' requieren su
// imagen en unlocked_images (las desbloquea la Semilla Rara al cosechar).
// callback(errorMessage | null)
function validateSpecies(species, callback) {
    if (species === undefined || species === null || species === 'jardin_clasico') return callback(null);
    const m = /^flor_(\d{2})$/.exec(species);
    if (!m) return callback('species desconocida');
    const n = parseInt(m[1], 10);
    if (n < 1 || n > 10) return callback('species desconocida');
    if (n === 1) return callback(null); // siempre desbloqueada
    const imagePath = '/flowers/flower_' + m[1] + '.png';
    db.get('SELECT id FROM unlocked_images WHERE imagePath=?', [imagePath], (err, row) => {
        if (err) return callback(err.message);
        callback(row ? null : 'species bloqueada: se desbloquea con Semillas Raras');
    });
}

app.post('/api/flowers', (req, res) => {
    const { title, imageIndex, color, species } = req.body;
    if (!title) return res.status(400).json({ error: 'title es obligatorio' });
    validateSpecies(species, (vErr) => {
        if (vErr) return res.status(400).json({ error: vErr });
        db.run("INSERT INTO flowers (title, imageIndex, color, species) VALUES (?, ?, ?, ?)",
            [title, imageIndex || 0, color || '#4a7c59', species || 'jardin_clasico'], function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        });
    });
});

app.put('/api/flowers/:id', (req, res) => {
    const { title, imageIndex, color, species } = req.body;
    validateSpecies(species, (vErr) => {
        if (vErr) return res.status(400).json({ error: vErr });
        let query = "UPDATE flowers SET title=?, imageIndex=?, color=?";
        const params = [title, imageIndex, color || '#4a7c59'];
        if (species !== undefined) { query += ", species=?"; params.push(species); }
        query += " WHERE id=?";
        params.push(req.params.id);
        db.run(query, params, function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

app.delete('/api/flowers/:id', (req, res) => {
    db.serialize(() => {
        let cascadeError = null;
        const captureErr = function(err) { if (err && !cascadeError) cascadeError = err; };
        db.run("DELETE FROM objectives WHERE flowerId=?", [req.params.id], captureErr);
        db.run("DELETE FROM flower_recurrents WHERE flowerId=?", [req.params.id], captureErr);
        db.run("DELETE FROM blocks WHERE flowerId=?", [req.params.id], captureErr);
        db.run("DELETE FROM flowers WHERE id=?", [req.params.id], function(err) {
            const e = cascadeError || err;
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
    });
});

// ======== OBJECTIVES ========
app.post('/api/objectives', function(req, res) {
    var flowerId = req.body.flowerId;
    var title = req.body.title;
    var orderIndex = req.body.orderIndex || 0;
    var isMeasurable = req.body.isMeasurable ? 1 : 0;
    var dueDate = req.body.dueDate || null;
    if (!flowerId || !title) return res.status(400).json({ error: 'flowerId y title son obligatorios' });
    db.run("INSERT INTO objectives (flowerId, title, orderIndex, isMeasurable, dueDate) VALUES (?, ?, ?, ?, ?)", [flowerId, title, orderIndex, isMeasurable, dueDate], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/objectives/:id/complete', (req, res) => {
    const { completed } = req.body;
    const objId = req.params.id;

    db.run("UPDATE objectives SET completed=? WHERE id=?", [completed ? 1 : 0, objId], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        
        db.get("SELECT flowerId FROM objectives WHERE id=?", [objId], (err, row) => {
            if (!row) return res.json({ success: true });
            const flowerId = row.flowerId;
            
            db.get("SELECT COUNT(*) as total, SUM(CASE WHEN completed=1 THEN 1 ELSE 0 END) as done FROM objectives WHERE flowerId=?", [flowerId], (err, counts) => {
                if (err) return res.json({ success: true });
                
                if (counts.total > 0 && counts.total === counts.done) {
                    // Flor completada al 100%. Eliminar recurrentes y bloques ESTRICTAMENTE futuros:
                    // los de HOY se conservan (incluye el bloque desde el que se completa y las cosechas del día).
                    const todayStr = localDateStr();
                    db.serialize(() => {
                        let cascadeError = null;
                        db.run("DELETE FROM blocks WHERE flowerId=? AND date > ?", [flowerId, todayStr], function(e1) {
                            if (e1 && !cascadeError) cascadeError = e1;
                        });
                        db.run("DELETE FROM flower_recurrents WHERE flowerId=?", [flowerId], function(e2) {
                            const e = cascadeError || e2;
                            if (e) return res.status(500).json({ error: e.message });
                            res.json({ success: true, flowerCompleted: true });
                        });
                    });
                } else {
                    res.json({ success: true });
                }
            });
        });
    });
});

app.put('/api/objectives/reorder', (req, res) => {
    const { objectives } = req.body; // [{id, orderIndex}]
    const stmt = db.prepare("UPDATE objectives SET orderIndex=? WHERE id=?");
    let updateError = null;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        (objectives || []).forEach(o => stmt.run([o.orderIndex, o.id], function(err) {
            if (err && !updateError) updateError = err;
        }));
        stmt.finalize(function(fErr) {
            if (fErr && !updateError) updateError = fErr;
            if (updateError) {
                return db.run("ROLLBACK", function() {
                    res.status(500).json({ error: updateError.message });
                });
            }
            db.run("COMMIT", function(cErr) {
                if (cErr) {
                    return db.run("ROLLBACK", function() {
                        res.status(500).json({ error: cErr.message });
                    });
                }
                res.json({ success: true });
            });
        });
    });
});

app.delete('/api/objectives/:id', (req, res) => {
    db.run("DELETE FROM objectives WHERE id=?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ======== FLOWER RECURRENTS ========
app.post('/api/flower-recurrents', (req, res) => {
    const { flowerId, title, duration, checklist, parentId } = req.body;
    if (!flowerId || !title) return res.status(400).json({ error: 'flowerId y title son obligatorios' });
    db.run(
        "INSERT INTO flower_recurrents (flowerId, title, duration, checklist, parentId) VALUES (?, ?, ?, ?, ?)",
        [flowerId, title, duration || 60, JSON.stringify(checklist || []), parentId || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

app.put('/api/flower-recurrents/:id', (req, res) => {
    const { title, duration, checklist, parentId } = req.body;
    const recId = req.params.id;
    const chkStr = JSON.stringify(checklist || []);
    // Fin de bloque a partir de inicio+duración, con la convención '00:00' = medianoche.
    const endFromStart = (startTime, dur) => {
        const s = toMin(startTime);
        if (s === null || !dur) return null;
        const e = Math.min(s + dur, 1440);
        return e >= 1440 ? '00:00' : toHHMM(e);
    };
    db.run(
        "UPDATE flower_recurrents SET title=?, duration=?, checklist=?, parentId=? WHERE id=?",
        [title, duration, chkStr, parentId || null, recId],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            const today = localDateStr();
            db.serialize(() => {
                let syncError = null;
                const capture = (e) => { if (e && !syncError) syncError = e; };
                // Título y checklist a bloques futuros
                db.run("UPDATE blocks SET title=?, checklist=? WHERE recurrentId=? AND date >= ?",
                    [title, chkStr, recId, today], capture);
                // Título y checklist a las plantillas de horario que referencian este recurrente
                // (si no, 'Aplicar Horario' regeneraría los bloques desde copias obsoletas)
                db.run("UPDATE schedule_templates SET title=?, checklist=? WHERE recurrentId=?",
                    [title, chkStr, recId], capture);
                // Duración: recalcular endTime fila a fila conservando el startTime de cada una
                db.all(
                    "SELECT id, startTime FROM blocks WHERE recurrentId=? AND date >= ? UNION ALL SELECT id * -1 AS id, startTime FROM schedule_templates WHERE recurrentId=?",
                    [recId, today, recId],
                    (selErr, rows) => {
                        capture(selErr);
                        const pending = (duration && !syncError) ? (rows || []) : [];
                        let i = 0;
                        const next = () => {
                            if (i >= pending.length) {
                                if (syncError) return res.status(500).json({ error: syncError.message });
                                return res.json({ success: true });
                            }
                            const r = pending[i++];
                            const newEnd = endFromStart(r.startTime, duration);
                            if (!newEnd) return next();
                            const sql = r.id > 0
                                ? "UPDATE blocks SET endTime=? WHERE id=?"
                                : "UPDATE schedule_templates SET endTime=? WHERE id=?";
                            db.run(sql, [newEnd, Math.abs(r.id)], (uErr) => { capture(uErr); next(); });
                        };
                        next();
                    }
                );
            });
        }
    );
});

app.delete('/api/flower-recurrents/:id', (req, res) => {
    const today = localDateStr();
    const recId = req.params.id;
    // Borrar también las alternativas hijas (parentId = :id) y sus bloques futuros
    db.all("SELECT id FROM flower_recurrents WHERE parentId=?", [recId], (err, children) => {
        if (err) return res.status(500).json({ error: err.message });
        const ids = [recId].concat((children || []).map(c => c.id));
        const placeholders = ids.map(() => '?').join(',');
        db.serialize(() => {
            let cascadeError = null;
            db.run("DELETE FROM blocks WHERE recurrentId IN (" + placeholders + ") AND date >= ?", ids.concat([today]), function(e1) {
                if (e1 && !cascadeError) cascadeError = e1;
            });
            db.run("DELETE FROM flower_recurrents WHERE id IN (" + placeholders + ")", ids, function(err2) {
                const e = cascadeError || err2;
                if (e) return res.status(500).json({ error: e.message });
                res.json({ success: true });
            });
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

// ======== WORKSHOP PRESETS ========
app.get('/api/workshop-presets', (req, res) => {
    db.all("SELECT * FROM workshop_presets", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.checklist = parseChecklist(r.checklist);
        });
        res.json(rows);
    });
});

app.post('/api/workshop-presets', (req, res) => {
    const { title, type, color, duration, checklist } = req.body;
    const chkStr = checklist ? JSON.stringify(checklist) : '[]';
    db.run("INSERT INTO workshop_presets (title, type, color, duration, checklist) VALUES (?, ?, ?, ?, ?)", 
        [title, type, color || null, duration || 60, chkStr], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/workshop-presets/:id', (req, res) => {
    const { title, type, color, duration, checklist } = req.body;
    const chkStr = checklist ? JSON.stringify(checklist) : '[]';
    db.run("UPDATE workshop_presets SET title=?, type=?, color=?, duration=?, checklist=? WHERE id=?", 
        [title, type, color || null, duration || 60, chkStr, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/workshop-presets/:id', (req, res) => {
    db.run("DELETE FROM workshop_presets WHERE id=?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ======== SCHEDULES ========
app.get('/api/schedules', (req, res) => {
    db.all("SELECT * FROM schedules", [], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

app.post('/api/schedules', (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: 'name es obligatorio' });
    db.run("INSERT INTO schedules (name) VALUES (?)", [name], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: this.lastID });
    });
});

app.put('/api/schedules/:id', (req, res) => {
    const { name } = req.body;
    db.run("UPDATE schedules SET name=? WHERE id=?", [name, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/schedules/:id', (req, res) => {
    db.serialize(() => {
        let cascadeError = null;
        const captureErr = function(err) { if (err && !cascadeError) cascadeError = err; };
        db.run("DELETE FROM schedule_templates WHERE scheduleId=?", [req.params.id], captureErr);
        db.run("DELETE FROM blocks WHERE scheduleId=?", [req.params.id], captureErr);
        db.run("DELETE FROM schedules WHERE id=?", [req.params.id], function(err) {
            const e = cascadeError || err;
            if (e) return res.status(500).json({ error: e.message });
            res.json({ success: true });
        });
    });
});

// ======== SCHEDULE TEMPLATES ========
app.get('/api/schedules/:scheduleId/templates', (req, res) => {
    db.all("SELECT * FROM schedule_templates WHERE scheduleId=?", [req.params.scheduleId], (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        rows.forEach(r => {
            r.checklist = parseChecklist(r.checklist);
        });
        res.json(rows);
    });
});

app.post('/api/schedule-templates', (req, res) => {
    const { scheduleId, title, type, dayOfWeek, startTime, endTime, color, checklist, flowerId, recurrentId } = req.body;
    const dow = Number(dayOfWeek);
    if (!scheduleId || !title || !Number.isInteger(dow) || dow < 0 || dow > 6 || !startTime || !endTime) {
        return res.status(400).json({ error: 'scheduleId, title, dayOfWeek (0-6), startTime y endTime son obligatorios' });
    }
    const chkStr = JSON.stringify(Array.isArray(checklist) ? checklist : []);
    db.run("INSERT INTO schedule_templates (scheduleId, title, type, dayOfWeek, startTime, endTime, color, checklist, flowerId, recurrentId) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [scheduleId, title, type, dow, startTime, endTime, color || null, chkStr, flowerId || null, recurrentId || null],
        function(err) {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ id: this.lastID });
        }
    );
});

// IMPORTANTE: esta ruta debe declararse ANTES de '/api/schedule-templates/:id'
// para que Express no capture 'batch' como :id.
app.put('/api/schedule-templates/batch', (req, res) => {
    const updates = req.body && req.body.updates;
    if (!Array.isArray(updates) || updates.length === 0) {
        return res.status(400).json({ error: 'updates (array no vacío) es obligatorio' });
    }
    const bad = updates.find(u => !u || u.id === undefined ||
        !Number.isInteger(Number(u.dayOfWeek)) || Number(u.dayOfWeek) < 0 || Number(u.dayOfWeek) > 6 ||
        !u.startTime || !u.endTime);
    if (bad) {
        return res.status(400).json({ error: 'cada update requiere id, dayOfWeek (0-6), startTime y endTime' });
    }
    const stmt = db.prepare("UPDATE schedule_templates SET dayOfWeek=?, startTime=?, endTime=? WHERE id=?");
    let updateError = null;
    db.serialize(() => {
        db.run("BEGIN TRANSACTION");
        updates.forEach(u => {
            stmt.run([Number(u.dayOfWeek), u.startTime, u.endTime, u.id], function(err) {
                if (err && !updateError) updateError = err;
            });
        });
        stmt.finalize(function(err) {
            if (err && !updateError) updateError = err;
            // La cascada es todo-o-nada: sin ROLLBACK quedarían bloques corridos a medias (solapes en DB)
            if (updateError) {
                return db.run("ROLLBACK", function() {
                    res.status(500).json({ error: updateError.message });
                });
            }
            db.run("COMMIT", function(cErr) {
                if (cErr) {
                    return db.run("ROLLBACK", function() {
                        res.status(500).json({ error: cErr.message });
                    });
                }
                res.json({ success: true });
            });
        });
    });
});

app.put('/api/schedule-templates/:id', (req, res) => {
    const { startTime, endTime, dayOfWeek, color, checklist, title, flowerId, recurrentId } = req.body;

    let query = "UPDATE schedule_templates SET startTime=?, endTime=?, dayOfWeek=?";
    let params = [startTime, endTime, dayOfWeek];

    if (color !== undefined) { query += ", color=?"; params.push(color); }
    if (checklist !== undefined) { query += ", checklist=?"; params.push(JSON.stringify(Array.isArray(checklist) ? checklist : [])); }
    if (title !== undefined) { query += ", title=?"; params.push(title); }
    if (flowerId !== undefined) { query += ", flowerId=?"; params.push(flowerId); }
    if (recurrentId !== undefined) { query += ", recurrentId=?"; params.push(recurrentId); }

    query += " WHERE id=?";
    params.push(req.params.id);

    db.run(query, params, function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

app.delete('/api/schedule-templates/:id', (req, res) => {
    db.run("DELETE FROM schedule_templates WHERE id=?", [req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// ======== APPLY SCHEDULE ========
app.post('/api/schedules/:id/apply', (req, res) => {
    const scheduleId = req.params.id;
    // 1. Obtener templates
    db.all("SELECT * FROM schedule_templates WHERE scheduleId=?", [scheduleId], (err, templates) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // 2 y 3 en la MISMA transacción: si los inserts fallan, el ROLLBACK
        // también restaura los bloques borrados (nunca queda el horario vacío).
        const todayStr = localDateStr();
        {
            // Generar bloques (fechas y día de semana SIEMPRE locales)
            const limit = new Date();
            limit.setFullYear(limit.getFullYear() + 1);
            let d = new Date();

            const stmt = db.prepare("INSERT INTO blocks (title, type, startTime, endTime, date, isRecurring, scheduleId, color, checklist, flowerId, recurrentId) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)");

            let insertError = null;
            db.serialize(() => {
                db.run("BEGIN TRANSACTION");
                db.run("DELETE FROM blocks WHERE scheduleId=? AND date >= ?", [scheduleId, todayStr], function(delErr) {
                    if (delErr && !insertError) insertError = delErr;
                });
                while (d <= limit) {
                    const dayOfWeek = d.getDay();
                    const dateStr = localDateStr(d);
                    templates.forEach(t => {
                        if (t.dayOfWeek === dayOfWeek) {
                            stmt.run([t.title, t.type, t.startTime, t.endTime, dateStr, scheduleId, t.color || null, t.checklist || '[]', t.flowerId || null, t.recurrentId || null], function(runErr) {
                                if (runErr && !insertError) insertError = runErr;
                            });
                        }
                    });
                    d.setDate(d.getDate() + 1);
                }
                stmt.finalize(function(fErr) {
                    if (fErr && !insertError) insertError = fErr;
                    // Todo-o-nada: un fallo a mitad dejaría el horario aplicado parcialmente
                    if (insertError) {
                        return db.run("ROLLBACK", function() {
                            res.status(500).json({ error: insertError.message });
                        });
                    }
                    db.run("COMMIT", (cErr) => {
                        if (cErr) {
                            return db.run("ROLLBACK", function() {
                                res.status(500).json({ error: cErr.message });
                            });
                        }
                        res.json({ success: true });
                    });
                });
            });
        }
    });
});

// ======== REWARDS SYSTEM ========
// Nota: las recompensas se aplican ÍNTEGRAMENTE en PUT /api/blocks/:id/harvest
// (salud real con cap 100 e imágenes reales en unlocked_images).
// El antiguo POST /api/flowers/:id/apply-reward se eliminó: no aplicaba nada real
// y generaba rutas de imagen inexistentes; ningún componente del frontend lo usa.

// Get unlocked images
app.get('/api/unlocked-images', function(req, res) {
    db.all('SELECT * FROM unlocked_images', [], function(err, rows) {
        if (err) return res.status(500).json({ error: err.message });
        res.json(rows);
    });
});

// Reschedule a measurable objective
app.post('/api/objectives/:id/reschedule', function(req, res) {
    var newDueDate = req.body.dueDate;
    db.run('UPDATE objectives SET dueDate=?, shieldBroken=0 WHERE id=?', [newDueDate, req.params.id], function(err) {
        if (err) return res.status(500).json({ error: err.message });
        // Restore some health to the flower
        db.get('SELECT flowerId FROM objectives WHERE id=?', [req.params.id], function(err, row) {
            if (row && row.flowerId) {
                db.run('UPDATE flowers SET health = MIN(100, health + 10) WHERE id=?', [row.flowerId], function(err) {
                    res.json({ success: true });
                });
            } else {
                res.json({ success: true });
            }
        });
    });
});

app.listen(port, function() {
    console.log("Backend running on http://localhost:" + port);
});
