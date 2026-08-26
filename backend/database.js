const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'agro_productivity.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Activar claves foráneas (SQLite las tiene desactivadas por defecto)
    db.run('PRAGMA foreign_keys = ON');

    // Para SQLite, si se añaden columnas a una tabla existente que ya tiene datos en una DB local, lo más seguro en desarrollo es hacerlo con ALTER TABLE envuelto en try/catch o hacer las migraciones manuales.
    // Como esta es una estructura inicial/db_init, aseguraremos que se crean. Si ya existía, `IF NOT EXISTS` ignora.
    // Vamos a intentar añadir la columna de color y scheduleId si no existen.
    
    db.run(`CREATE TABLE IF NOT EXISTS blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL, 
        startTime TEXT,
        endTime TEXT,
        date TEXT,
        isRecurring BOOLEAN,
        recurrenceId TEXT,
        checklist TEXT,
        completed BOOLEAN DEFAULT 0,
        failed BOOLEAN DEFAULT 0,
        rewardType TEXT,
        workspace TEXT DEFAULT 'default',
        flowerId INTEGER,
        recurrentId INTEGER,
        scheduleId INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS flowers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        imageIndex INTEGER DEFAULT 0,
        color TEXT DEFAULT '#4a7c59',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS objectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flowerId INTEGER NOT NULL,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT 0,
        orderIndex INTEGER DEFAULT 0,
        FOREIGN KEY(flowerId) REFERENCES flowers(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS flower_recurrents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flowerId INTEGER NOT NULL,
        title TEXT NOT NULL,
        startTime TEXT DEFAULT '09:00',
        endTime TEXT DEFAULT '10:00',
        days TEXT DEFAULT '[]',
        checklist TEXT DEFAULT '[]',
        parentId INTEGER,
        FOREIGN KEY(flowerId) REFERENCES flowers(id) ON DELETE CASCADE
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS workshop_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS schedule_templates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scheduleId INTEGER NOT NULL,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        dayOfWeek INTEGER NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        FOREIGN KEY(scheduleId) REFERENCES schedules(id) ON DELETE CASCADE
    )`);

    // Intentar añadir las columnas si la DB ya existe y no tenía las columnas nuevas.
    // Esto previene errores si la tabla ya estaba creada antes.
    db.run(`ALTER TABLE blocks ADD COLUMN scheduleId INTEGER`, (err) => { /* Ignorar error si ya existe */ });
    db.run(`ALTER TABLE flowers ADD COLUMN color TEXT DEFAULT '#4a7c59'`, (err) => { /* Ignorar error si ya existe */ });
    db.run(`ALTER TABLE blocks ADD COLUMN color TEXT`, (err) => {});
    db.run(`ALTER TABLE workshop_presets ADD COLUMN color TEXT`, (err) => {});
    db.run(`ALTER TABLE workshop_presets ADD COLUMN duration INTEGER DEFAULT 60`, (err) => {});
    db.run(`ALTER TABLE workshop_presets ADD COLUMN checklist TEXT`, (err) => {});
    db.run(`ALTER TABLE schedule_templates ADD COLUMN color TEXT`, (err) => {});
    db.run(`ALTER TABLE schedule_templates ADD COLUMN checklist TEXT`, (err) => {});
    db.run(`ALTER TABLE schedule_templates ADD COLUMN flowerId INTEGER`, (err) => {});
    db.run(`ALTER TABLE schedule_templates ADD COLUMN recurrentId INTEGER`, (err) => {});
    db.run(`ALTER TABLE flower_recurrents ADD COLUMN duration INTEGER DEFAULT 60`, (err) => {});
    db.run(`ALTER TABLE flower_recurrents ADD COLUMN parentId INTEGER`, (err) => {});
    // Las DBs creadas con el CREATE TABLE antiguo no tienen estas dos columnas
    // (estaban en el CREATE pero nunca tuvieron migración para bases existentes).
    db.run(`ALTER TABLE blocks ADD COLUMN failed BOOLEAN DEFAULT 0`, (err) => {});
    db.run(`ALTER TABLE blocks ADD COLUMN rewardType TEXT`, (err) => {});
    // Sistema de especies del jardín: cada flor pertenece a una especie del
    // registro frontend/src/species.js (las raras se desbloquean con semillas raras).
    db.run(`ALTER TABLE flowers ADD COLUMN species TEXT DEFAULT 'jardin_clasico'`, (err) => {});

    // Rewards system columns
    db.run('ALTER TABLE flowers ADD COLUMN health INTEGER DEFAULT 100', function(err) {});
    db.run('ALTER TABLE flowers ADD COLUMN lastFailDate TEXT', function(err) {});
    db.run('ALTER TABLE objectives ADD COLUMN isMeasurable BOOLEAN DEFAULT 0', function(err) {});
    db.run('ALTER TABLE objectives ADD COLUMN dueDate TEXT', function(err) {});
    db.run('ALTER TABLE objectives ADD COLUMN shieldBroken BOOLEAN DEFAULT 0', function(err) {});
    db.run('ALTER TABLE blocks ADD COLUMN harvestedAt TEXT', function(err) {});

    db.run('CREATE TABLE IF NOT EXISTS unlocked_images (id INTEGER PRIMARY KEY AUTOINCREMENT, imagePath TEXT NOT NULL, unlockedAt DATETIME DEFAULT CURRENT_TIMESTAMP)');
    // Limpieza: las rutas '/flowers/rare_N.png' de la versión antigua apuntan a archivos
    // que nunca existieron; se eliminan junto con duplicados, y el índice UNIQUE
    // garantiza que cada imagen se desbloquea una sola vez (harvest usa INSERT OR IGNORE).
    db.run("DELETE FROM unlocked_images WHERE imagePath LIKE '/flowers/rare_%'", (err) => {});
    db.run('DELETE FROM unlocked_images WHERE id NOT IN (SELECT MIN(id) FROM unlocked_images GROUP BY imagePath)', (err) => {});
    db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_unlocked_images_path ON unlocked_images(imagePath)', (err) => {});
});

module.exports = db;
