/**
 * Définitions des commandes slash (CDC 4.3).
 * Le JSON produit est envoyé à l'API Discord au démarrage.
 */

import {
  SlashCommandBuilder,
  ChannelType,
  PermissionFlagsBits,
} from 'discord.js';
import { allTypes, ROTATION_CATEGORIES } from '../eventTypes.js';
import { LANGS } from '../i18n.js';

/** Choix « types d'événements » ; `withRotations` ajoute les catégories de rotation (CDC 4.7). */
function typeChoices(withRotations = true) {
  const choices = allTypes().map((v) => ({ name: v, value: v }));
  if (withRotations) for (const c of ROTATION_CATEGORIES) choices.push({ name: `rotation: ${c}`, value: `rot:${c}` });
  return choices.slice(0, 25);
}

/** Choix des langues. */
const langChoices = Object.entries(LANGS).map(([value, name]) => ({ name, value }));

/** Délais de rappel proposés (minutes). */
const DELAYS = [
  { label: 'Désactivé', value: 0 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 h (par défaut)', value: 60 },
  { label: '2 h', value: 120 },
  { label: '3 h', value: 180 },
  { label: '6 h', value: 360 },
  { label: '12 h', value: 720 },
  { label: '24 h', value: 1440 },
];

/** Construit la liste complète des commandes à enregistrer. */
export function commandDefinitions() {
  const defs = [];

  /* ---------- /events ---------- */
  const events = new SlashCommandBuilder()
    .setName('events')
    .setDescription('Liste des événements Pokémon GO en cours et à venir')
    .setDMPermission(false)
    .addBooleanOption((o) => o.setName('today').setDescription('Uniquement les événements du jour'))
    .addStringOption((o) => {
      o.setName('type').setDescription('Filtrer par type d’événement');
      for (const c of typeChoices(false)) o.addChoices(c);
      return o;
    });
  defs.push(events);

  /* ---------- /setup ---------- */
  const setup = new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Configuration du bot pour ce serveur')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((s) => s
      .setName('channel')
      .setDescription('Définit le salon des notifications d’événements')
      .addChannelOption((o) => o.setName('salon').setDescription('Salon de destination').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((s) => s
      .setName('role')
      .setDescription('Définit le rôle à mentionner (sans option : aucun rôle)')
      .addRoleOption((o) => o.setName('role').setDescription('Rôle à mentionner')))
    .addSubcommand((s) => s
      .setName('rotations-channel')
      .setDescription('Définit le salon des rotations (raids, œufs, vedettes)')
      .addChannelOption((o) => o.setName('salon').setDescription('Salon des rotations').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)))
    .addSubcommand((s) => {
      s.setName('types').setDescription('Choisit les types d’événements et rotations notifiés');
      s.addBooleanOption((o) => o.setName('reset').setDescription('Réinitialiser (tous les types)'));
      s.addStringOption((o) => {
        o.setName('add').setDescription('Ajouter un type');
        for (const c of typeChoices()) o.addChoices(c);
        return o;
      });
      s.addStringOption((o) => {
        o.setName('remove').setDescription('Retirer un type');
        for (const c of typeChoices()) o.addChoices(c);
        return o;
      });
      return s;
    })
    .addSubcommand((s) => {
      s.setName('reminder').setDescription('Règle le délai de rappel avant le début d’un événement');
      s.addIntegerOption((o) => {
        o.setName('delai').setDescription('Délai avant le début').setRequired(true);
        for (const d of DELAYS) o.addChoices({ name: d.label, value: d.value });
        return o;
      });
      s.addBooleanOption((o) => o.setName('en_24h').setDescription('Ajouter aussi un rappel 24 h avant'));
      return s;
    })
    .addSubcommand((s) => s
      .setName('lang')
      .setDescription('Langue des messages du bot')
      .addStringOption((o) => {
        o.setName('langue').setDescription('Langue').setRequired(true);
        for (const c of langChoices) o.addChoices(c);
        return o;
      }))
    .addSubcommand((s) => s.setName('view').setDescription('Affiche la configuration actuelle'));
  defs.push(setup);

  /* ---------- /rotations ---------- */
  const rotations = new SlashCommandBuilder()
    .setName('rotations')
    .setDescription('Consulte les rotations en cours (raids, œufs, vedettes)')
    .setDMPermission(false)
    .addStringOption((o) => {
      o.setName('categorie').setDescription('Catégorie à consulter').setRequired(true);
      o.addChoices(
        { name: 'Raids', value: 'raids' },
        { name: 'Œufs', value: 'eggs' },
        { name: 'Vedettes', value: 'vedettes' },
      );
      return o;
    });
  defs.push(rotations);

  /* ---------- /help et /ping ---------- */
  defs.push(new SlashCommandBuilder().setName('help').setDescription('Aide et liste des commandes du bot').setDMPermission(false));
  defs.push(new SlashCommandBuilder().setName('ping').setDescription('Vérifie l’état du bot').setDMPermission(false));

  /* ---------- /admin (propriétaire du bot) ---------- */
  const admin = new SlashCommandBuilder()
    .setName('admin')
    .setDescription('Commandes réservées au propriétaire du bot')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) => {
      s.setName('location')
        .setDescription('Corrige le lieu / les coordonnées GPS d’un événement')
        .addStringOption((o) => o.setName('evenement').setDescription('Nom ou identifiant de l’événement').setRequired(true))
        .addStringOption((o) => o.setName('lieu').setDescription('Nom du lieu (géocodé si pas de coordonnées)'))
        .addNumberOption((o) => o.setName('latitude').setDescription('Latitude en degrés décimaux').setMinValue(-90).setMaxValue(90))
        .addNumberOption((o) => o.setName('longitude').setDescription('Longitude en degrés décimaux').setMinValue(-180).setMaxValue(180))
        .addStringOption((o) => o.setName('fuseau').setDescription('Fuseau IANA, ex. Europe/Paris ou America/New_York'));
      return s;
    })
    .addSubcommand((s) => {
      s.setName('rotation-reset')
        .setDescription('Force la notification de la prochaine rotation')
        .addStringOption((o) => {
          o.setName('categorie').setDescription('Catégorie').setRequired(true);
          o.addChoices(
            { name: 'Raids', value: 'raids' },
            { name: 'Œufs', value: 'eggs' },
            { name: 'Vedettes', value: 'vedettes' },
          );
          return o;
        });
      return s;
    })
    .addSubcommand((s) => s.setName('refresh').setDescription('Relance immédiatement la collecte des événements'))
    .addSubcommand((s) => s.setName('stats').setDescription('Affiche les statistiques du bot'));
  defs.push(admin);

  return defs.map((d) => d.toJSON());
}

export { DELAYS };
