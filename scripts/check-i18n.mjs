// Vérification : clés i18n présentes en fr et en en, et utilisées existantes.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { STRINGS, t } from '../src/i18n.js';

const fr = Object.keys(STRINGS.fr);
const en = Object.keys(STRINGS.en);
const problems = [];

for (const k of fr) if (!(k in STRINGS.en)) problems.push(`clé manquante en : ${k}`);
for (const k of en) if (!(k in STRINGS.fr)) problems.push(`clé manquante fr : ${k}`);

const walk = (dir) => readdirSync(dir).flatMap((f) => {
  const p = join(dir, f);
  if (statSync(p).isDirectory()) return walk(p);
  return p.endsWith('.js') ? [p] : [];
});

const used = new Set();
for (const file of walk('src')) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/\bt\(\s*\w+\s*,\s*'([^']+)'/g)) used.add(m[1]);
  for (const m of text.matchAll(/\bt\(\s*\w+\s*,\s*`([^`$]+)`/g)) used.add(m[1]);
}
for (const key of used) {
  if (!(key in STRINGS.fr)) problems.push(`clé utilisée mais absente : ${key}`);
}

// Les sous-clés dynamiques type.* et rot.* sont construites à la volée.
const dynamic = [...used].filter((k) => k.startsWith('type.') || k.startsWith('rot.'));
console.log(`Clés fr : ${fr.length} · en : ${en.length} · utilisées : ${used.size}`);
console.log(`Problèmes : ${problems.length ? problems.join(' | ') : 'aucun'}`);

// Contrôle : fr et en doivent exposer les mêmes variables d'exemple.
const placeholders = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
for (const k of fr) {
  if (!(k in STRINGS.en)) continue;
  if (placeholders(STRINGS.fr[k]) !== placeholders(STRINGS.en[k])) {
    console.log(`⚠️ variables différentes pour ${k} : fr=[${placeholders(STRINGS.fr[k])}] en=[${placeholders(STRINGS.en[k])}]`);
  }
}
process.exit(problems.length ? 1 : 0);
