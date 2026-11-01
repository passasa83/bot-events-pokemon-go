/**
 * Commande `/rotations` (CDC 4.7) : état actuel des rotations.
 */

import { rotationEmbed } from '../notifier.js';
import { getGuildConfig, getRotationItems } from '../store.js';
import { t } from '../i18n.js';

const CATEGORY_KEY = { raids: 'rot.raids', eggs: 'rot.eggs', vedettes: 'rot.vedettes' };

export async function handleRotations(interaction) {
  const category = interaction.options.getString('categorie');
  const cfg = getGuildConfig(interaction.guildId);
  const lang = cfg.lang;

  const items = getRotationItems(category);
  const embed = rotationEmbed(category, items, { lang });

  if (!items.length) {
    embed.addFields({ name: 'ℹ️', value: t(lang, 'rot.empty') });
  } else {
    embed.addFields({ name: `📋 ${t(lang, CATEGORY_KEY[category])}`, value: `${items.length} élément(s) en base.` });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
