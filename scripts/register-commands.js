/**
 * Enregistre les commandes sans lancer le bot (utile si l'enregistrement
 * automatique au démarrage échoue, ou pour forcer une mise à jour).
 *
 *   DISCORD_TOKEN=... DISCORD_CLIENT_ID=... [TEST_GUILD_ID=...] npm run register
 */

import { setLogLevel } from '../src/logger.js';
import config, { validateConfig } from '../src/config.js';
import { openDatabase, closeDatabase } from '../src/db.js';
import { registerCommands } from '../src/commands/index.js';

setLogLevel('info');

const problems = validateConfig();
if (problems.length) {
  console.error('Configuration incomplète :', problems.join(' · '));
  process.exit(1);
}

// La base est nécessaire : /setup types s'appuie sur les types connus et observés.
await openDatabase(config.dbPath);
try {
  await registerCommands();
  console.log('✅ Commandes enregistrées.');
} catch (err) {
  console.error('❌ Échec :', err.message);
  process.exitCode = 1;
} finally {
  closeDatabase();
}
