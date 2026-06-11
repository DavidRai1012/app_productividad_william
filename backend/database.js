const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'agro_productivity.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
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
        workspace TEXT DEFAULT 'default',
        flowerId INTEGER,
        recurrentId INTEGER
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS flowers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        imageIndex INTEGER DEFAULT 0,
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
        FOREIGN KEY(flowerId) REFERENCES flowers(id) ON DELETE CASCADE
    )`);
});

module.exports = db;
