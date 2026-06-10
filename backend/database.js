const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'agro_productivity.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
    // Blocks table (Modo Campo)
    db.run(`CREATE TABLE IF NOT EXISTS blocks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        type TEXT NOT NULL, 
        startTime TEXT,
        endTime TEXT,
        isRecurring BOOLEAN,
        recurrenceRule TEXT,
        checklist TEXT,
        completed BOOLEAN DEFAULT 0,
        date TEXT,
        workspace TEXT DEFAULT 'default',
        flowerId INTEGER
    )`);

    // Flowers table (Modo Jardin)
    db.run(`CREATE TABLE IF NOT EXISTS flowers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        status TEXT DEFAULT 'growing',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // Objectives table (Modo Jardin)
    db.run(`CREATE TABLE IF NOT EXISTS objectives (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        flowerId INTEGER,
        title TEXT NOT NULL,
        completed BOOLEAN DEFAULT 0,
        FOREIGN KEY(flowerId) REFERENCES flowers(id)
    )`);
});

module.exports = db;
