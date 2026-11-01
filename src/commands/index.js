/**
 * Routage et enregistrement des commandes slash (CDC 4.3 et 5.4 – module commandes).
 */

import { REST, Routes } from 'discord.js';
import config from '../config.js';
import log from '../logger.js';
import { commandDefinitions } from './definitions.js';
import { handleEvents } from './events.js';
import { handleSetup } from './setup.js';
import { handleRotations } from './rotations.js';
import { handleHelp, handlePing } from './misc.js';
import { handleAdmin } from './admin.js';

const HANDLERS = {
  events: handleEvents,
  setup: handleSetup,
  rotations: handleRotations,
  help: handleHelp,
  ping: handlePing,
  admin: handleAdmin,
};

/** Réponse par défaut en cas d'erreur dans un handler. */
async function sendError(interaction, message) {
  try {
    if (interaction.deferred || interaction.replied) await interaction.editReply({ content: message });
    else await interaction.reply({ content: message, ephemeral: true });
  } catch {
    /* l'interaction a expiré : rien à faire */
  }
}

/** Dispatche une interaction vers le bon gestionnaire. */
export async function handleInteraction(interaction) {
  if (!interaction.isChatInputCommand()) return;
  const handler = HANDLERS[interaction.commandName];
  if (!handler) return;
  try {
    await handler(interaction);
  } catch (err) {
    log.exception(`Erreur de commande /${interaction.commandName}`, err);
    await sendError(interaction, '⚠️ Une erreur est survenue lors du traitement de la commande.');
  }
}

/**
 * Enregistre les commandes auprès de Discord.
 * - `TEST_GUILD_ID` renseigné : enregistrement immédiat sur ce serveur (tests).
 * - sinon : enregistrement global (visible sous 1 h environ).
 */
export async function registerCommands() {
  const body = commandDefinitions();
  const rest = new REST().setToken(config.token);

  if (config.testGuildId) {
    await rest.put(Routes.applicationGuildCommands(config.clientId, config.testGuildId), { body });
    log.info(`${body.length} commande(s) enregistrée(s) sur le serveur de test ${config.testGuildId}.`);
  } else {
    await rest.put(Routes.applicationCommands(config.clientId), { body });
    log.info(`${body.length} commande(s) enregistrée(s) globalement (mise à jour visible sous ~1 h).`);
  }
}
