/**
 * Point d'entrée du bot « Events Pokémon GO ».
 *
 * Séquence de démarrage :
 *  1. configuration et contrôle des variables d'environnement ;
 *  2. ouverture de la base SQLite (+ schéma) ;
 *  3. connexion Discord et enregistrement des commandes slash ;
 *  4. lancement de la planification (collecte, rappels, rotations, purge).
 *
 * Le bot ne doit jamais s'arrêter pour une erreur ponctuelle : toutes les
 * exceptions sont journalisées et absorbées (exigence de robustesse, CDC §8).
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import config, { validateConfig } from './config.js';
import log, { setLogLevel } from './logger.js';
import { openDatabase, closeDatabase } from './db.js';
import { startScheduler } from './scheduler.js';
import { handleInteraction, registerCommands } from './commands/index.js';

async function main() {
  setLogLevel(config.logLevel);

  // 1. Contrôle de la configuration.
  const problems = validateConfig();
  if (problems.length) {
    log.error('Démarrage impossible :', problems.join(' · '));
    log.error('Renseignez les variables dans `.env` (voir `.env.example`) ou dans le panel Pterodactyl.');
    process.exit(1);
  }

  // 2. Base de données.
  await openDatabase(config.dbPath);

  // 3. Client Discord (aucun intent privilégié requis, CDC 5.2).
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once(Events.ClientReady, async (c) => {
    log.info(`Connecté en tant que ${c.user.tag} · ${c.guilds.cache.size} serveur(s) · Node ${process.version}`);
    log.info(`Collecte toutes les ${config.pollIntervalMinutes} min · fuseau ${config.defaultTimezone}`);
    try {
      await registerCommands();
    } catch (err) {
      log.exception("Échec de l'enregistrement des commandes slash", err);
    }
    startScheduler(client);
  });

  client.on(Events.InteractionCreate, handleInteraction);

  client.on(Events.GuildCreate, (guild) => {
    log.info(`Nouveau serveur : ${guild.name} (${guild.id}) — utilisez /setup channel pour activer les notifications.`);
  });
  client.on(Events.GuildDelete, (guild) => log.info(`Serveur quitté : ${guild.name} (${guild.id})`));

  client.on(Events.Warn, (msg) => log.warn(msg));
  client.on(Events.Error, (err) => log.exception('Erreur du client Discord', err));
  client.on(Events.Debug, (msg) => log.debug(msg));

  // 4. Filets de sécurité : on journalise sans redémarrer.
  process.on('uncaughtException', (err) => log.exception('uncaughtException (le bot continue)', err));
  process.on('unhandledRejection', (err) => log.exception('unhandledRejection (le bot continue)', err));

  const shutdown = (signal) => {
    log.info(`Arrêt demandé (${signal}) : fermeture propre…`);
    try { client.destroy(); } catch { /* déjà arrêté */ }
    closeDatabase();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await client.login(config.token);
}

main().catch((err) => {
  log.exception('Démarrage impossible', err);
  process.exit(1);
});
