/**
 * Test à blanc de la chaîne complète SANS Discord (aucun token requis).
 *
 *   npm run dry                 → collecte + résumé + rotations + 1 embed d'exemple
 *   npm run dry -- --embed cd   → affiche les 3 messages (nouveau / rappel / début)
 *                                 pour un événement dont le titre contient « cd »
 *   npm run dry -- --place "New York, USA" --embed "Master League"
 *                               → force un lieu géocodé et vérifie la conversion
 *                                 d'heure locale en heure française (CDC 4.6)
 *   npm run dry -- --reset      → oublie les notifications envoyées (relance d'un test)
 *   npm run dry -- --db ./test.db
 *
 * Sert de validation rapide après modification du code ou de la source,
 * et d'outil de recette des critères du CDC §11.
 */

import { parseArgs } from 'node:util';
import { setLogLevel } from '../src/logger.js';
import config from '../src/config.js';
import { openDatabase, closeDatabase } from '../src/db.js';
import { syncEvents } from '../src/collector.js';
import { eventEmbed, rotationEmbed, setSourceLabel, startValue, endValue, placeValue } from '../src/notifier.js';
import { attachCoordinates } from '../src/geo.js';
import { buildVedettes } from '../src/sources/leekduck.js';
import * as store from '../src/store.js';
import { typeLabel } from '../src/i18n.js';

const { values } = parseArgs({
  options: {
    embed: { type: 'string' },
    place: { type: 'string' },
    reset: { type: 'boolean', default: false },
    db: { type: 'string' },
    lang: { type: 'string', default: 'fr' },
  },
});

setLogLevel(process.env.LOG_LEVEL || 'info');
if (values.db) config.dbPath = values.db;

await openDatabase(config.dbPath);

if (values.reset) {
  const s = store.stats();
  console.log(`--reset : oubli de ${s.notifications} notification(s) déjà envoyée(s).`);
  // Recrée une base neuve pour les notifications.
  const { getDb } = await import('../src/db.js');
  getDb().prepare('DELETE FROM notifications').run();
}

const started = Date.now();
const data = await syncEvents();
const elapsed = Date.now() - started;

if (!data) {
  console.error('❌ Aucune source disponible : impossible de poursuivre le test.');
  process.exit(1);
}

setSourceLabel(data.source);
console.log(`\n=== Collecte (${data.source}) ===`);
console.log(`Durée : ${elapsed} ms · événements : ${data.events.length} · raids : ${data.raids?.length ?? '—'} · œufs : ${data.eggs?.length ?? '—'}`);
console.log(`Nouveaux : ${data.fresh.length}`);
for (const ev of data.fresh.slice(0, 20)) console.log(`  🆕 ${ev.title} [${ev.type}] ${ev.startRaw ?? ''} → ${ev.endRaw ?? ''}`);

const lang = values.lang === 'en' ? 'en' : 'fr';
const now = new Date();

/* ---------- Résumé des prochains événements ---------- */
const upcoming = store.getUpcomingEvents({ includePastDays: 0 });
console.log(`\n=== Prochains événements (base locale) : ${upcoming.length} ===`);
for (const ev of upcoming.slice(0, 12)) {
  console.log(`• ${ev.title} [${typeLabel(lang, ev.type)}]`);
  console.log(`   Début : ${startValue(ev, lang).replace(/\n/g, ' | ')}`);
  console.log(`   Fin   : ${endValue(ev, lang)}`);
  const place = placeValue(ev, lang);
  if (place) console.log(`   Lieu  : ${place.replace(/\n/g, ' | ')}`);
}

/* ---------- Rotations ---------- */
for (const [cat, items] of [['raids', data.raids], ['eggs', data.eggs], ['vedettes', buildVedettes(data.events, now)]]) {
  if (!Array.isArray(items)) continue;
  const buckets = new Map();
  for (const it of items) buckets.set(it.bucket, (buckets.get(it.bucket) ?? 0) + 1);
  console.log(`\n=== Rotation ${cat} : ${items.length} élément(s) ===`);
  for (const [b, n] of buckets) console.log(`  ${b} : ${n}`);
}

/* ---------- Embeds d'exemple ---------- */
const target = values.embed
  ? upcoming.find((e) => e.title.toLowerCase().includes(values.embed.toLowerCase()))
  : upcoming.find((e) => e.startUtc && e.startUtc > now) || upcoming[0];

if (target) {
  // Test du CDC 4.5/4.6 : `--place "New York, USA"` force un lieu géocodé
  // et permet de vérifier la conversion heure locale / heure française.
  if (values.place) {
    target.placeName = values.place;
    await attachCoordinates(target);
    console.log(`\nLieu de test : ${target.placeName} · ${target.latitude?.toFixed(5)}, ${target.longitude?.toFixed(5)} · fuseau ${target.timezone}`);
  }
  console.log(`\n=== Aperçu de l'embed pour « ${target.title} » (${target.id}) ===`);
  for (const kind of ['new', 'reminder', 'start']) {
    console.log(`\n--- ${kind} ---`);
    console.log(JSON.stringify(eventEmbed(target, kind, lang).toJSON(), null, 2));
  }
  const raids = store.getRotationItems('raids');
  if (raids.length) {
    console.log('\n--- rotation:raids ---');
    console.log(JSON.stringify(rotationEmbed('raids', raids, { lang }).toJSON(), null, 2));
  }
} else {
  console.log('\n(Aucun événement à afficher.)');
}

const s = store.stats();
console.log(`\n=== Base === ${s.events} événement(s) · ${s.notifications} notification(s) · ${s.rotations} rotation(s)`);
console.log(`Mémoire : ${Math.round(process.memoryUsage().rss / 1048576)} Mo`);

closeDatabase();
