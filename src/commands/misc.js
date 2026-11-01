/**
 * Commandes `/help` et `/ping` (CDC 4.3).
 */

import { EmbedBuilder } from 'discord.js';
import { getGuildConfig, stats } from '../store.js';
import { t } from '../i18n.js';
import { COLORS } from '../notifier.js';

/** Aide bilingue (fr/en) — conforme à la configuration de langue du serveur. */
const HELP = {
  fr: [
    ['`/events`', 'Événements en cours et à venir'],
    ['`/events today`', 'Uniquement les événements du jour'],
    ['`/events type <type>`', 'Filtrer par type (Community Day, Raid Hour…)'],
    ['`/rotations raids|oeufs|vedettes`', 'Rotations en cours'],
    ['`/ping`', 'État du bot'],
    ['`/help`', 'Cette aide'],
  ],
  frAdmin: [
    ['`/setup channel <salon>`', 'Salon des notifications'],
    ['`/setup role <rôle>`', 'Rôle à mentionner'],
    ['`/setup rotations-channel <salon>`', 'Salon des rotations'],
    ['`/setup types`', 'Types et rotations notifiés'],
    ['`/setup reminder <délai>`', 'Délai de rappel (+ rappel 24 h)'],
    ['`/setup lang <fr|en>`', 'Langue des messages'],
    ['`/setup view`', 'Configuration actuelle'],
  ],
  en: [
    ['`/events`', 'Ongoing and upcoming events'],
    ['`/events today`', "Today's events only"],
    ['`/events type <type>`', 'Filter by type (Community Day, Raid Hour…)'],
    ['`/rotations raids|oeufs|vedettes`', 'Current rotations'],
    ['`/ping`', 'Bot status'],
    ['`/help`', 'This help'],
  ],
  enAdmin: [
    ['`/setup channel <channel>`', 'Notification channel'],
    ['`/setup role <role>`', 'Role to ping'],
    ['`/setup rotations-channel <channel>`', 'Rotation channel'],
    ['`/setup types`', 'Notified types and rotations'],
    ['`/setup reminder <delay>`', 'Reminder delay (+ 24 h reminder)'],
    ['`/setup lang <fr|en>`', 'Message language'],
    ['`/setup view`', 'Current configuration'],
  ],
};

export async function handleHelp(interaction) {
  const lang = getGuildConfig(interaction.guildId).lang;
  const commands = HELP[lang] || HELP.fr;
  const admin = HELP[`${lang}Admin`] || HELP.frAdmin;

  const embed = new EmbedBuilder()
    .setColor(COLORS.new)
    .setTitle(`❔ ${t(lang, 'help.title')}`)
    .setDescription(t(lang, 'help.desc'))
    .addFields(
      { name: `⌨️ ${t(lang, 'help.commands')}`, value: commands.map(([c, d]) => `${c} — ${d}`).join('\n') },
      { name: `🛠️ ${t(lang, 'help.admin')}`, value: admin.map(([c, d]) => `${c} — ${d}`).join('\n') },
    )
    .setFooter({ text: t(lang, 'help.footer') });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handlePing(interaction) {
  const lang = getGuildConfig(interaction.guildId).lang;
  const s = stats();
  const latency = Math.round(interaction.client.ws.ping);
  await interaction.reply({
    content: t(lang, 'ping.ok', { ms: latency, events: s.events, guilds: s.guilds }),
    ephemeral: true,
  });
}
