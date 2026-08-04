import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = process.argv[2] ?? path.join(import.meta.dirname, '..', 'db', 'app.db');
const db = new DatabaseSync(dbPath);

const classes = db.prepare('SELECT name, name_normalized FROM classes LIMIT 5').all();
const courses = db.prepare('SELECT name, name_normalized FROM courses LIMIT 5').all();
const version = db.prepare('SELECT user_version FROM pragma_user_version').get();

console.log('user_version:', version);
console.log('CLASSES:');
for (const row of classes) console.log(' ', row.name, '->', row.name_normalized);
console.log('COURSES:');
for (const row of courses) console.log(' ', row.name, '->', row.name_normalized);

const nullCount = db
  .prepare(
    `SELECT (SELECT COUNT(*) FROM classes WHERE name_normalized = '') AS c,
            (SELECT COUNT(*) FROM courses WHERE name_normalized = '') AS co`,
  )
  .get() as { c: number; co: number };
console.log('bos name_normalized -> classes:', nullCount.c, 'courses:', nullCount.co);

db.close();
