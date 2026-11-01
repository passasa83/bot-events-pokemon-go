/**
 * Petits utilitaires communs (aucune dépendance externe).
 */

import { createHash } from 'node:crypto';

/** Empreinte de titre insensible à la casse, aux accents et à la ponctuation. */
export function slugKey(title) {
  return String(title || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Clé de déduplication d'un événement : titre + date de début.
 * La date est indispensable : deux raids identiques peuvent se suivre dans le
 * mois (ex. « Shadow Tornadus … » le 4 puis le 16 novembre) et ne doivent pas
 * être fusionnés. La clé reste stable d'une source à l'autre, car les deux
 * sources dérivent de LeekDuck et publient les mêmes horaires.
 */
export function dedupeKeyFor(title, startRaw) {
  const s = String(startRaw ?? '').trim();
  let stamp = null;
  if (/^\d{10}$/.test(s)) {
    // Horizon Unix (secondes) : certaines sources l'utilisent.
    const iso = new Date(Number(s) * 1000).toISOString();
    stamp = `${iso.slice(0, 10)}T${iso.slice(11, 16)}`;
  } else {
    const m = s.match(/(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
    if (m) stamp = `${m[1]}T${m[2]}:${m[3]}`;
  }
  return stamp ? `${slugKey(title)}@${stamp}` : slugKey(title);
}

/** Empreinte stable d'un objet (détecte les changements de contenu). */
export function contentHash(value) {
  const json = typeof value === 'string' ? value : JSON.stringify(value);
  return createHash('sha1').update(json).digest('hex').slice(0, 20);
}

/** Tronque proprement un texte à `max` caractères (limites Discord). */
export function truncate(text, max = 300) {
  const s = String(text ?? '').replace(/\s+/g, ' ').trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1).trimEnd()}…`;
}

/** Limite stricte à 1024 caractères (valeur de champ d'embed Discord). */
export function clampField(value, max = 1024) {
  const s = String(value ?? '');
  return s.length <= max ? s : `${s.slice(0, max - 3)}...`;
}
