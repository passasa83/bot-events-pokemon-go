/**
 * Commande `/setup` (CDC 4.3 et 4.4) : configuration par serveur.
 * Réservée aux membres disposant de la permission « Gérer le serveur »
 * (imposée à l'enregistrement de la commande).
 */

import { EmbedBuilder } from 'discord.js';
import { getGuildConfig, setGuildConfig } from '../store.js';
import { t, formatDelay, LANGS, typeLabel } from '../i18n.js';
import { COLORS } from '../notifier.js';
import { ROTATION_CATEGORIES } from '../eventTypes.js';

const ROTATION_FLAG = { raids: 'rotationRaids', eggs: 'rotationEggs', vedettes: 'rotationVedettes' };

const reply = (interaction, content) => interaction.reply({ content, ephemeral: true });

/** Résumé des types notifiés, pour la réponse. */
function describeTypes(cfg, lang) {
  if (cfg.enabledTypes === null) return t(lang, 'generic.all');
  if (!cfg.enabledTypes.length) return t(lang, 'setup.types.none');
  return cfg.enabledTypes.map((x) => typeLabel(lang, x)).join(', ');
}

export async function handleSetup(interaction) {
  const guildId = interaction.guildId;
  const cfg = getGuildConfig(guildId);
  const lang = cfg.lang;
  const sub = interaction.options.getSubcommand();

  /* ---------- salon principal ---------- */
  if (sub === 'channel') {
    const channel = interaction.options.getChannel('salon');
    if (!channel || !channel.isTextBased()) return reply(interaction, t(lang, 'setup.channel.required'));
    setGuildConfig(guildId, { channelId: channel.id });
    return reply(interaction, t(lang, 'setup.channel.ok', { channel: `<#${channel.id}>` }));
  }

  /* ---------- rôle de ping ---------- */
  if (sub === 'role') {
    const role = interaction.options.getRole('role');
    setGuildConfig(guildId, { roleId: role ? role.id : null });
    return reply(interaction, role ? t(lang, 'setup.role.ok', { role: `<@&${role.id}>` }) : t(lang, 'setup.role.none'));
  }

  /* ---------- salon des rotations ---------- */
  if (sub === 'rotations-channel') {
    const channel = interaction.options.getChannel('salon');
    setGuildConfig(guildId, { rotationsChannelId: channel ? channel.id : null });
    return reply(interaction, channel ? t(lang, 'setup.rotChannel.ok', { channel: `<#${channel.id}>` }) : t(lang, 'setup.rotChannel.none'));
  }

  /* ---------- types d'événements et rotations ---------- */
  if (sub === 'types') {
    const reset = interaction.options.getBoolean('reset') ?? false;
    const add = interaction.options.getString('add');
    const remove = interaction.options.getString('remove');

    if (reset) {
      const next = setGuildConfig(guildId, { enabledTypes: null, rotationRaids: true, rotationEggs: true, rotationVedettes: true });
      return reply(interaction, t(lang, 'setup.types.ok', { types: describeTypes(next, lang) }));
    }

    // Catégories de rotation : `rot:raids`, `rot:eggs`, `rot:vedettes` (CDC 4.7).
    const rotationCat = (value) => (value?.startsWith('rot:') && ROTATION_CATEGORIES.includes(value.slice(4)) ? value.slice(4) : null);
    const addCat = rotationCat(add);
    const removeCat = rotationCat(remove);
    if (addCat || removeCat) {
      const patch = {};
      if (addCat) patch[ROTATION_FLAG[addCat]] = true;
      if (removeCat) patch[ROTATION_FLAG[removeCat]] = false;
      const next = setGuildConfig(guildId, patch);
      const state = addCat ? '✅' : '❌';
      return reply(interaction, `${t(lang, 'setup.types.ok', { types: describeTypes(next, lang) })} · rotation **${addCat || removeCat}** ${state}`);
    }

    if (!add && !remove) return reply(interaction, t(lang, 'setup.badTypes'));

    // Ajout / retrait d'un type d'événement.
    let list = cfg.enabledTypes;
    if (add) {
      if (list === null) return reply(interaction, t(lang, 'setup.types.ok', { types: t(lang, 'generic.all') }));
      if (!list.includes(add)) list = [...list, add];
    }
    if (remove) {
      if (list === null) {
        // On passe d'« tous » à une liste explicite sans le type retiré.
        const { allTypes } = await import('../eventTypes.js');
        list = allTypes().filter((x) => x !== remove);
      } else {
        list = list.filter((x) => x !== remove);
      }
    }

    const next = setGuildConfig(guildId, { enabledTypes: list });
    return reply(interaction, next.enabledTypes?.length
      ? t(lang, 'setup.types.ok', { types: next.enabledTypes.map((x) => typeLabel(lang, x)).join(', ') })
      : t(lang, 'setup.types.none'));
  }

  /* ---------- délai de rappel ---------- */
  if (sub === 'reminder') {
    const delay = interaction.options.getInteger('delai');
    const in24h = interaction.options.getBoolean('en_24h');
    const patch = { reminderMinutes: delay };
    if (in24h !== null && in24h !== undefined) patch.reminder24h = in24h;
    const next = setGuildConfig(guildId, patch);
    return reply(interaction,
      `${next.reminderMinutes > 0 ? t(lang, 'setup.reminder.ok', { delay: formatDelay(next.reminderMinutes, lang) }) : t(lang, 'setup.reminder.off')}\n`
      + t(lang, 'setup.reminder24.ok', { state: next.reminder24h ? '✅' : '❌' }));
  }

  /* ---------- langue ---------- */
  if (sub === 'lang') {
    const value = interaction.options.getString('langue');
    setGuildConfig(guildId, { lang: value });
    return reply(interaction, t(value, 'setup.lang.ok', { lang: LANGS[value] || value }));
  }

  /* ---------- consultation ---------- */
  if (sub === 'view') {
    const next = getGuildConfig(guildId);
    const embed = new EmbedBuilder()
      .setColor(COLORS.new)
      .setTitle(`⚙️ ${t(lang, 'setup.help')}`)
      .addFields(
        { name: '📢 Salon', value: next.channelId ? `<#${next.channelId}>` : '—', inline: true },
        { name: '🔔 Rôle', value: next.roleId ? `<@&${next.roleId}>` : '—', inline: true },
        { name: '🔄 Rotations', value: next.rotationsChannelId ? `<#${next.rotationsChannelId}>` : '—', inline: true },
        { name: '⏱️ Rappel', value: `${formatDelay(next.reminderMinutes, lang)}${next.reminder24h ? ' + 24 h' : ''}`, inline: true },
        { name: '🌐 Langue', value: LANGS[next.lang] || next.lang, inline: true },
        { name: '🏷️ Types', value: describeTypes(next, lang) },
        { name: '⚔️ Rotation raids', value: next.rotationRaids ? '✅' : '❌', inline: true },
        { name: '🥚 Rotation œufs', value: next.rotationEggs ? '✅' : '❌', inline: true },
        { name: '⭐ Rotation vedettes', value: next.rotationVedettes ? '✅' : '❌', inline: true },
      );
    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  return reply(interaction, t(lang, 'generic.error'));
}
