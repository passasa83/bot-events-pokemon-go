/**
 * Test de recette des rappels et du redémarrage (CDC §11), SANS Discord.
 *
 *   npm run test:reminders
 *
 * Scénario vérifié :
 *  1. un événement commençant dans 30 min  → message « rappel » ;
 *  2. un événement commencé il y a 5 min   → message « commence maintenant » ;
 *  3. un événement commençant dans 25 h    → rien (rappel 24 h désactivé) ;
 *  4. un événement commencé il y a 2 h     → rien (hors fenêtre de rattrapage) ;
 *  5. un second passage ne renvoie RIEN   → aucun doublon après redémarrage.
 */

import { openDatabase, closeDatabase, getDb } from '../src/db.js';
import config from '../src/config.js';
import { setLogLevel } from '../src/logger.js';
import * as store from '../src/store.js';
import { startScheduler, tick, markPollDone } from '../src/scheduler.js';
import { contentHash } from '../src/util.js';

setLogLevel('info');
config.dbPath = './data/test-reminders.db';
await openDatabase(config.dbPath);

/* --- Base de test : serveur fictif + 4 événements synthétiques --- */
getDb().prepare('DELETE FROM events').run();
getDb().prepare('DELETE FROM notifications').run();
getDb().prepare('DELETE FROM guild_config').run();

const GUILD_ID = '100000000000000001';
store.setGuildConfig(GUILD_ID, {
  channelId: '200000000000000001',
  roleId: '300000000000000001',
  reminderMinutes: 60,
  lang: 'fr',
});

const now = Date.now();
const fakeEvent = (id, title, startMs) => {
  const start = new Date(startMs);
  const ev = {
    id,
    dedupeKey: id,
    title,
    type: 'event',
    timeMode: 'absolute',
    startUtc: start,
    endUtc: new Date(startMs + 3600_000),
    startRaw: start.toISOString(),
    endRaw: new Date(startMs + 3600_000).toISOString(),
    image: null,
    link: null,
    description: null,
    details: null,
    placeName: null,
    latitude: null,
    longitude: null,
    timezone: null,
  };
  store.upsertEvent(ev, contentHash([id, title, startMs]));
  return ev;
};

fakeEvent('ev-reminder', 'Événement avec rappel', now + 30 * 60_000);
fakeEvent('ev-now', 'Événement en cours', now - 5 * 60_000);
fakeEvent('ev-24h', 'Événement dans 25 h', now + 25 * 3600_000);
fakeEvent('ev-old', 'Événement commencé il y a 2 h', now - 2 * 3600_000);

/* --- Faux client Discord : capture les messages envoyés --- */
const sent = [];
const channel = {
  isTextBased: () => true,
  send: async (payload) => { sent.push(payload); return payload; },
};
const guild = { id: GUILD_ID, name: 'Serveur de test', channels: { fetch: async () => channel } };
const client = { guilds: { cache: new Map([[GUILD_ID, guild]]) } };

startScheduler(client, { immediate: false, cronEnabled: false });
markPollDone(); // on ne teste pas la collecte ici : uniquement les rappels

const titleOf = (payload) => payload.embeds?.[0]?.data?.title ?? '(sans titre)';

console.log('\n=== Passage 1 ===');
await tick(new Date());
console.log(`Messages envoyés : ${sent.length}`);
for (const p of sent) console.log(` • ${p.content ?? '(sans mention)'} → ${titleOf(p)}`);

console.log('\n=== Passage 2 (simulation de redémarrage) ===');
const before = sent.length;
await tick(new Date());
console.log(`Messages supplémentaires : ${sent.length - before}`);

/* --- Contrôles --- */
const checks = [
  ['rappel envoyé', sent.some((p) => titleOf(p).includes('avec rappel'))],
  ['« commence maintenant » envoyé', sent.some((p) => titleOf(p).includes('Événement en cours'))],
  ['pas de rappel 25 h', !sent.some((p) => titleOf(p).includes('dans 25 h'))],
  ['pas de message pour l’événement ancien', !sent.some((p) => titleOf(p).includes('il y a 2 h'))],
  ['mention du rôle incluse', sent.some((p) => p.content === `<@&300000000000000001>`)],
  ['aucun doublon au 2e passage', sent.length - before === 0],
];

console.log('\n=== Résultats ===');
let failed = 0;
for (const [name, ok] of checks) {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (!ok) failed += 1;
}

closeDatabase();
process.exit(failed === 0 ? 0 : 1);
