/**
 * Catalogue des types d'événements (CDC 4.2 – filtrage par type).
 * Les types observés dans les données sont ajoutés dynamiquement, afin que
 * `/setup types` reste à jour si la source fait évoluer ses catégories.
 */

import { distinctTypes } from './store.js';

/** Types connus de la source LeekDuck (constatés le 01/11/2026). */
export const KNOWN_TYPES = [
  'community-day',
  'raid-hour',
  'pokemon-spotlight-hour',
  'raid-day',
  'raid-battles',
  'max-battles',
  'max-mondays',
  'go-battle-league',
  'go-pass',
  'wild-area',
  'pokemon-go-tour',
  'season',
  'research',
  'event',
];

/** Catégories de rotation (CDC 4.7), activables avec /setup types. */
export const ROTATION_CATEGORIES = ['raids', 'eggs', 'vedettes'];

/** Ensemble complet proposé à la configuration : catalogue + types présents en base. */
export function allTypes() {
  const set = new Set(KNOWN_TYPES);
  try {
    for (const t of distinctTypes()) if (t) set.add(t);
  } catch { /* base non ouverte (tests unitaires) */ }
  return [...set];
}
