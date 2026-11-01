/**
 * Commande `/events` (CDC 4.3) : liste des événements en cours et à venir,
 * avec filtre du jour et filtre par type.
 */

import { EmbedBuilder } from 'discord.js';
import { getGuildConfig, getUpcomingEvents } from '../store.js';
import { t, typeLabel } from '../i18n.js';
import { startValue, endValue, COLORS } from '../notifier.js';
import config from '../config.js';

/** Clé de date ISO dans un fuseau donné (« 2026-11-01 »). */
function dateKey(date, timeZone = config.defaultTimezone) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

const MAX_TOTAL_FIELDS = 20; // limite Discord : 25 champs par embed

/** Ajoute les champs d'une liste d'événements (🟢 en cours / 🔵 à venir). */
function addEventFields(embed, list, lang, ongoing) {
  let shown = 0;
  for (const ev of list) {
    if ((embed.data.fields?.length ?? 0) >= MAX_TOTAL_FIELDS) break;
    const flag = ongoing ? '🟢' : '🔵';
    const name = `${flag} ${ev.title}`.slice(0, 256);
    const value = `🏷️ ${typeLabel(lang, ev.type)}\n🏁 ${startValue(ev, lang)}\n🏁 ${endValue(ev, lang)}`.slice(0, 1024);
    embed.addFields({ name, value });
    shown += 1;
  }
  const hidden = list.length - shown;
  if (hidden > 0) {
    embed.addFields({ name: '…', value: t(lang, 'events.more', { n: hidden }) });
  }
}

export async function handleEvents(interaction) {
  const lang = getGuildConfig(interaction.guildId).lang;
  const today = interaction.options.getBoolean('today') ?? false;
  const type = interaction.options.getString('type');

  await interaction.deferReply({ ephemeral: true });

  const now = new Date();
  let events = getUpcomingEvents({ includePastDays: 0 });

  if (type) events = events.filter((e) => e.type === type);
  if (today) {
    const key = dateKey(now);
    events = events.filter((e) => e.startUtc && dateKey(e.startUtc) === key);
  }

  const ongoing = events.filter((e) => e.startUtc && e.startUtc <= now);
  const upcoming = events.filter((e) => !e.startUtc || e.startUtc > now);

  const embed = new EmbedBuilder()
    .setColor(COLORS.new)
    .setTitle(`📅 ${t(lang, 'events.title')}`)
    .setFooter({
      text: today ? t(lang, 'events.today')
        : type ? t(lang, 'events.filter', { type: typeLabel(lang, type) })
          : t(lang, 'events.title'),
    });

  if (type) embed.setDescription(t(lang, 'events.filter', { type: typeLabel(lang, type) }));

  if (!events.length) {
    embed.addFields({ name: '🚫', value: t(lang, 'events.empty') });
    return interaction.editReply({ embeds: [embed] });
  }

  if (ongoing.length) addEventFields(embed, ongoing, lang, true);
  if (upcoming.length) addEventFields(embed, upcoming, lang, false);

  embed.addFields({ name: 'ℹ️', value: t(lang, 'events.localNote', { local: t(lang, 'field.localTime') }) });

  return interaction.editReply({ embeds: [embed] });
}
