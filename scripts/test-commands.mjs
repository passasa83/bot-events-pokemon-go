/**
 * Test d'intégration des commandes slash SANS Discord (CDC §11).
 *
 *   npm run test:commands
 *
 * Vérifie que chaque commande répond sans exception, que la configuration
 * fonctionne, et surtout qu'**un serveur n'affecte pas les autres** :
 *  - serveur A : /setup channel + /setup role + /setup types add community-day ;
 *  - serveur B : configuration inchangée.
 */

import { openDatabase, closeDatabase, getDb } from '../src/db.js';
import config from '../src/config.js';
import { setLogLevel } from '../src/logger.js';
import * as store from '../src/store.js';
import { handleInteraction } from '../src/commands/index.js';

setLogLevel('warn');
config.dbPath = './data/test-commands.db';
await openDatabase(config.dbPath);

getDb().prepare('DELETE FROM guild_config').run();
getDb().prepare('DELETE FROM events').run();

/* --- Faux serveurs Discord --- */
const sent = [];
const makeGuild = (id, name) => ({
  id,
  name,
  channels: {
    fetch: async (channelId) => ({
      id: channelId,
      isTextBased: () => true,
      send: async (payload) => { sent.push({ guild: name, payload }); return payload; },
    }),
  },
});
const guildA = makeGuild('A', 'Serveur A');
const guildB = makeGuild('B', 'Serveur B');
const client = { guilds: { cache: new Map([['A', guildA], ['B', guildB]]), size: 2 }, ws: { ping: 42 } };

/* --- Fausse interaction --- */
function fakeInteraction(commandName, guildId, options = {}) {
  const state = { replied: false, deferred: false, out: [] };
  const finish = async (payload) => { state.out.push(payload); sent.push({ guild: guildId, payload }); return payload; };
  return {
    commandName,
    guildId,
    user: { id: 'u1' },
    client,
    isChatInputCommand: () => true,
    isCommand: () => true,
    get replied() { return state.replied; },
    get deferred() { return state.deferred; },
    options: {
      getSubcommand: () => options.__sub ?? null,
      getBoolean: (n) => options[n] ?? null,
      getString: (n) => options[n] ?? null,
      getNumber: (n) => options[n] ?? null,
      getInteger: (n) => options[n] ?? null,
      getChannel: (n) => options[n] ?? null,
      getRole: (n) => options[n] ?? null,
    },
    deferReply: async () => { state.deferred = true; },
    reply: finish,
    editReply: finish,
  };
}

const last = (guildId) => {
  const items = sent.filter((s) => s.guild === guildId);
  return items.length ? items[items.length - 1].payload : null;
};
const text = (payload) => JSON.stringify(payload ?? '');
const embedTitles = (payload) => (payload?.embeds ?? []).map((e) => e.data.title).join(' | ');

/* --- Déroulé des commandes --- */
const results = [];
const check = (name, ok, extra = '') => results.push([ok, `${name}${extra ? ` — ${extra}` : ''}`]);
const noError = (guildId) => !String(last(guildId)?.content ?? '').includes('⚠️');

// /help, /ping
await handleInteraction(fakeInteraction('help', 'A'));
check('/help répond sans erreur', Boolean(last('A')) && noError('A'), embedTitles(last('A')));
await handleInteraction(fakeInteraction('ping', 'A'));
check('/ping répond sans erreur', Boolean(last('A')) && noError('A'), last('A')?.content);

// /setup : serveur A configuré, serveur B non
const iChan = fakeInteraction('setup', 'A', { __sub: 'channel', salon: { id: 'chan-A', isTextBased: () => true } });
await handleInteraction(iChan);
check('/setup channel appliqué au serveur A', store.getGuildConfig('A').channelId === 'chan-A');

const iRole = fakeInteraction('setup', 'A', { __sub: 'role', role: { id: 'role-A' } });
await handleInteraction(iRole);
check('/setup role appliqué', store.getGuildConfig('A').roleId === 'role-A');

const iRemove = fakeInteraction('setup', 'A', { __sub: 'types', remove: 'raid-hour' });
await handleInteraction(iRemove);
const afterRemove = store.getGuildConfig('A').enabledTypes;
check('/setup types remove passe en liste explicite', Array.isArray(afterRemove) && !afterRemove.includes('raid-hour'));

const iTypes = fakeInteraction('setup', 'A', { __sub: 'types', add: 'community-day' });
await handleInteraction(iTypes);
const afterAdd = store.getGuildConfig('A').enabledTypes;
check('/setup types add', Array.isArray(afterAdd) && afterAdd.includes('community-day'), `${afterAdd?.length} type(s)`);

const iReset = fakeInteraction('setup', 'A', { __sub: 'types', reset: true });
await handleInteraction(iReset);
check('/setup types reset revient à « tous »', store.getGuildConfig('A').enabledTypes === null);

const iLang = fakeInteraction('setup', 'A', { __sub: 'lang', langue: 'en' });
await handleInteraction(iLang);
check('/setup lang', store.getGuildConfig('A').lang === 'en');

const iRem = fakeInteraction('setup', 'A', { __sub: 'reminder', delai: 120, en_24h: true });
await handleInteraction(iRem);
const cfgA = store.getGuildConfig('A');
check('/setup reminder', cfgA.reminderMinutes === 120 && cfgA.reminder24h === true);

const cfgB = store.getGuildConfig('B');
check('serveur B non affecté', cfgB.channelId === null && cfgB.roleId === null && cfgB.enabledTypes === null && cfgB.lang === 'fr' && cfgB.reminderMinutes === 60);

// /setup view
await handleInteraction(fakeInteraction('setup', 'A', { __sub: 'view' }));
check('/setup view affiche la config', embedTitles(last('A')).includes('⚙️'), noError('A') ? '' : 'erreur');

// /events et /rotations sur base vide
await handleInteraction(fakeInteraction('events', 'A'));
check('/events répond sur base vide', Boolean(last('A')) && noError('A'), embedTitles(last('A')));
await handleInteraction(fakeInteraction('rotations', 'A', { categorie: 'raids' }));
check('/rotations répond sur base vide', Boolean(last('A')) && noError('A'), embedTitles(last('A')));

// Commande inconnue : ne doit rien planter
await handleInteraction(fakeInteraction('inconnue', 'A'));
check('commande inconnue ignorée', true);

void text;

/* --- Résultats --- */
let failed = 0;
for (const [ok, name] of results) {
  console.log(`${ok ? '✅' : '❌'} ${name}`);
  if (!ok) failed += 1;
}
closeDatabase();
process.exit(failed === 0 ? 0 : 1);
