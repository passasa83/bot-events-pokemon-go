// Vérifie que replaceRotationItems tolère les doublons (bucket, name) de la source.
import { rmSync } from 'node:fs';
rmSync('./data/test-rot.db', { force: true });

const { openDatabase, closeDatabase } = await import('../src/db.js');
const store = await import('../src/store.js');
await openDatabase('./data/test-rot.db');

const items = [
  { bucket: '7 km', name: 'Galarian Corsola', image: 'a.png', canBeShiny: true, details: { isGiftExchange: false } },
  { bucket: '7 km', name: 'Galarian Corsola', image: 'a.png', canBeShiny: true, details: { isGiftExchange: true } },
  { bucket: '1 km', name: 'Larvesta', image: 'b.png', canBeShiny: false },
];

store.replaceRotationItems('eggs', items);
const rows = store.getRotationItems('eggs');
console.log('lignes insérées :', rows.length, '(attendu : 2)');
if (rows.length !== 2) { console.error('FAIL'); process.exit(1); }
console.log('OK — doublon ignoré, contrainte UNIQUE respectée');
closeDatabase();
rmSync('./data/test-rot.db', { force: true });
process.exit(0);
