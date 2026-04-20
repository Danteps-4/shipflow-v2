import { ANDREANI_SUCURSALES, ANDREANI_PROV_LOC_CP } from "./andreaniData";
import { slugify } from "./normalizers";

// ----------------------------------------------------------------
// Build lookup structures once at module load (fast O(1) matching)
// ----------------------------------------------------------------

// slug -> original value
const sucursalMap = new Map<string, string>();
for (const s of ANDREANI_SUCURSALES) {
  sucursalMap.set(slugify(s), s);
}

// slug of full "PROV / LOC / CP" -> original value
const provLocCpExact = new Map<string, string>();
// slug of "PROV / LOC" -> first matching full value
const provLocPartial = new Map<string, string>();
// slug of "PROV / CP" -> first matching full value (fallback when locality is wrong)
const provCpMap = new Map<string, string>();

for (const v of ANDREANI_PROV_LOC_CP) {
  provLocCpExact.set(slugify(v), v);
  const parts = v.split(" / ");
  if (parts.length === 3) {
    const [prov, , cp] = parts;
    const provLoc = `${prov} / ${parts[1]}`;
    const keyPartial = slugify(provLoc);
    if (!provLocPartial.has(keyPartial)) {
      provLocPartial.set(keyPartial, v);
    }
    const keyProvCp = slugify(`${prov} / ${cp}`);
    if (!provCpMap.has(keyProvCp)) {
      provCpMap.set(keyProvCp, v);
    }
  }
}

// slug(city) -> list of full sucursal names
// "city" = sucursal name without the parenthesized street, e.g. "LA PLATA (AV 13)" → "LA PLATA"
const cityToSucursales = new Map<string, string[]>();
for (const s of ANDREANI_SUCURSALES) {
  const city = s.replace(/\s*\(.*\)$/, "").trim();
  const key = slugify(city);
  const list = cityToSucursales.get(key) ?? [];
  list.push(s);
  cityToSucursales.set(key, list);
}

// slug of parenthetical street content -> sucursal name
// e.g. "FLORES (AV JUAN B ALBERDI)" → "av-juan-b-alberdi" → sucursal name
// Used for matching customer street address against sucursal street names
const sucursalByParen = new Map<string, string>();
for (const s of ANDREANI_SUCURSALES) {
  const m = s.match(/\(([^)]+)\)/);
  if (m) {
    sucursalByParen.set(slugify(m[1]), s);
  }
}

// CP -> set of locality names (from provLocCp data)
const cpToLocalities = new Map<string, string[]>();
for (const v of ANDREANI_PROV_LOC_CP) {
  const parts = v.split(" / ");
  if (parts.length === 3) {
    const cp  = parts[2].trim();
    const loc = parts[1].trim();
    const list = cpToLocalities.get(cp) ?? [];
    list.push(loc);
    cpToLocalities.set(cp, list);
  }
}

// ----------------------------------------------------------------
// Match a sucursal name against official Andreani values.
// Returns the exact Andreani name if found, original otherwise.
// ----------------------------------------------------------------
export function matchSucursal(value: string): string {
  if (!value) return value;
  const matched = sucursalMap.get(slugify(value));
  return matched ?? value;
}

// ----------------------------------------------------------------
// Word-level Levenshtein distance (for fuzzy spelling tolerance).
// Handles "THOMAS" ↔ "TOMAS" (edit distance 1), etc.
// ----------------------------------------------------------------
function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  const dp: number[] = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= n; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1] ? prev : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[n];
}

function wordsMatch(q: string, t: string): boolean {
  if (q === t) return true;
  if (q.includes(t) || t.includes(q)) return true;
  // Allow 1 edit for words ≥ 4 chars (handles "thomas" ↔ "tomas", "yrigoyen" ↔ "irigoyen", etc.)
  if (q.length >= 4 && t.length >= 4 && editDistance(q, t) <= 1) return true;
  return false;
}

const STREET_STOP = new Set(["av", "avenida", "calle", "bv", "blvd", "de", "del", "la", "el", "las", "los", "y", "san", "gral"]);

// Match customer address against sucursal parenthetical street names.
// e.g. "Av. Juan B. Alberdi 3138" → "FLORES (AV JUAN B ALBERDI)"
// e.g. "Av. Álvarez Thomas 2621" → "VILLA URQUIZA (AV ALVAREZ TOMAS)"
//
// Two-tier city filter to handle ambiguous street/city names:
//
//   STRICT mode (paren has 1 distinctive word, e.g. "BELGRANO" or "MARTIN"):
//     These words are also used as city/barrio names, so a city hint is required.
//     If the sucursal's city prefix does NOT match the order's ciudad/localidad → skip.
//     This prevents "Belgrano 452, General Pedernera" from matching MONSERRAT (AV BELGRANO).
//
//   FLEXIBLE mode (paren has ≥ 2 distinctive words, e.g. "ALVAREZ TOMAS", "JUAN B ALBERDI"):
//     Long specific street names are unlikely to collide with city names.
//     City filter is applied as a preference; if it fails but score ≥ 0.6, still allow.
//     This ensures "Av. Álvarez Thomas 2621" matches even when the order's city hint
//     is generic ("Buenos Aires", "CABA") and doesn't spell out the barrio.
export function inferSucursalByStreet(
  direccion: string,
  ciudad    = "",
  localidad = "",
): string {
  if (!direccion) return "";

  // Strip trailing house number and normalize
  const streetOnly = direccion
    .replace(/\s+\d+\s*$/, "")   // remove trailing number
    .replace(/\s+s\/n\s*$/i, "") // remove S/N
    .trim();

  const qWords = slugify(streetOnly)
    .split(/[-\s]+/)
    .filter(w => w.length > 1 && !STREET_STOP.has(w));

  if (qWords.length === 0) return "";

  const ciudadSlug    = slugify(ciudad);
  const localidadSlug = slugify(localidad);
  const hasCityHint   = ciudadSlug.length > 0 || localidadSlug.length > 0;

  function sucursalMatchesCity(name: string): boolean {
    if (!hasCityHint) return true;
    const sucCity = slugify(name.replace(/\s*\(.*\)$/, "").trim());
    if (!sucCity) return true;
    return (
      (ciudadSlug.length    > 0 && (ciudadSlug.includes(sucCity)    || sucCity.includes(ciudadSlug)))    ||
      (localidadSlug.length > 0 && (localidadSlug.includes(sucCity) || sucCity.includes(localidadSlug)))
    );
  }

  let bestName  = "";
  let bestScore = 0;

  for (const [tSlug, name] of sucursalByParen) {
    const tWords = tSlug.split(/[-\s]+/).filter(w => w.length > 1 && !STREET_STOP.has(w));
    if (tWords.length === 0) continue;

    const matched = qWords.filter(q => tWords.some(t => wordsMatch(q, t)));
    const score   = matched.length / Math.max(qWords.length, tWords.length);

    if (score < 0.5 || matched.length < 1) continue;

    const cityOk     = sucursalMatchesCity(name);
    // STRICT: paren has 1 distinctive word → city hint MUST match (avoids city-name collisions)
    // FLEXIBLE: paren has ≥ 2 distinctive words → allow if city ok OR score is high (≥ 0.6)
    const isFlexible = tWords.length >= 2;
    if (!cityOk && (!isFlexible || score < 0.6)) continue;

    if (score > bestScore) {
      bestScore = score;
      bestName  = name;
    }
  }

  return bestName;
}

// ----------------------------------------------------------------
// Infer the Andreani sucursal from the HOP delivery address.
// Tienda Nube stores the HOP point address in the Calle field.
// Andreani names them "PUNTO ANDREANI HOP {ADDRESS}".
// ----------------------------------------------------------------
export function inferHopSucursal(direccion: string, numero: string): string {
  if (!direccion) return "";

  function tryHop(addr: string): string {
    return sucursalMap.get(slugify(`PUNTO ANDREANI HOP ${addr}`)) ?? "";
  }

  // 1. Full address as-is (most common when TN sends "CALLE 123")
  const m1 = tryHop(direccion);
  if (m1) return m1;

  // 2. Address + separate number field
  if (numero) {
    const m2 = tryHop(`${direccion} ${numero}`);
    if (m2) return m2;
  }

  // 3. TN sometimes appends extra text after the number:
  //    "Carlos Pellegrini 755 Local 5. - Entre Córdoba y Viamonte."
  //    "LAPRIDA 437 entre Yrigoyen y Manuel Castro"
  //    Strip everything after the first street number → "Carlos Pellegrini 755"
  const streetNum = direccion.match(/^([^0-9]*\d+)/)?.[1]?.trim();
  if (streetNum && streetNum !== direccion.trim()) {
    const m3 = tryHop(streetNum);
    if (m3) return m3;

    if (numero) {
      const m4 = tryHop(`${streetNum} ${numero}`);
      if (m4) return m4;
    }
  }

  return "";
}

// ----------------------------------------------------------------
// Direct city → sucursal overrides.
//
// Use this when:
//  (a) Tienda Nube uses the official city name but Andreani uses a different one
//      e.g. "SAN MIGUEL DE TUCUMAN" → Andreani calls it "TUCUMAN (CENTRO)"
//  (b) A city has multiple Andreani branches and the order's CP or locality
//      still leaves it ambiguous, but in practice one branch handles all
//      residential orders.
//
// Key: slugify(TN city name or locality)
// Value: exact Andreani sucursal name (as it appears in ANDREANI_SUCURSALES)
//
// Add entries here whenever a new TN↔Andreani mismatch is found.
// ----------------------------------------------------------------
const CITY_TO_SUCURSAL: Record<string, string> = {
  "san-miguel-de-tucuman": "TUCUMAN (CENTRO)",
  "general-pedernera":     "VILLA MERCEDES (CENTRO)",
  // Add more here:
  // "nombre-en-tiendanube": "NOMBRE ANDREANI (ZONA)",
};

// ----------------------------------------------------------------
// Infer the Andreani sucursal from the customer's localidad + CP.
// Used when Tienda Nube only says "Punto de retiro" without specifying which branch.
//
// Returns:
//   { sucursal: string, confident: true }  — exactly one match found
//   { sucursal: "",     confident: false } — multiple or no matches; leave for manual edit
// ----------------------------------------------------------------
export function inferSucursal(
  localidad: string,
  cp: string
): { sucursal: string; confident: boolean } {
  const localidadSlug = slugify(localidad);

  // Helper: look up city (by slug) in cityToSucursales, also checking CITY_TO_SUCURSAL.
  function lookupCity(slug: string): string[] {
    const direct = cityToSucursales.get(slug) ?? [];
    if (direct.length) return direct;
    const override = CITY_TO_SUCURSAL[slug];
    if (override) return [override];
    return [];
  }

  // 0. Direct override: e.g. "san-miguel-de-tucuman" → "TUCUMAN (CENTRO)"
  const override = CITY_TO_SUCURSAL[localidadSlug];
  if (override) return { sucursal: override, confident: true };

  // 1. Try direct city match from localidad
  const directMatches = lookupCity(localidadSlug);
  if (directMatches.length === 1) {
    return { sucursal: directMatches[0], confident: true };
  }
  if (directMatches.length > 1) {
    // Multiple branches in this city — can't choose
    return { sucursal: "", confident: false };
  }

  // 2. Try localities that share the same CP, then look for their sucursal (with overrides)
  const locForCp = cpToLocalities.get(cp) ?? [];
  const cpMatchSet = new Set<string>();
  for (const loc of locForCp) {
    const found = lookupCity(slugify(loc));
    for (const s of found) cpMatchSet.add(s);
  }
  const cpMatches = Array.from(cpMatchSet);
  if (cpMatches.length === 1) {
    return { sucursal: cpMatches[0], confident: true };
  }
  if (cpMatches.length > 1) {
    return { sucursal: "", confident: false };
  }

  // 3. No match
  return { sucursal: "", confident: false };
}

// ----------------------------------------------------------------
// Match provincia + localidad + cp against official Andreani values.
// Strategy:
//   1. Exact slug match on full "PROV / LOC / CP" string
//   2. Partial match on "PROV / LOC"
//   3. Trim trailing words from localidad one by one — handles cases
//      where Tienda Nube appends the province name to the locality,
//      e.g. "LUJAN DE CUYO MENDOZA" → try "LUJAN DE CUYO" → match
//           "PILAR PCIA DE BUENOS AIRES" → try "PILAR" → match
//   4. Fallback: return the generated string as-is
// ----------------------------------------------------------------
export function matchProvLocCp(
  provincia: string,
  localidad: string,
  cp: string
): string {
  const parts = [provincia, localidad, cp].filter(Boolean);
  const candidate = parts.join(" / ");
  if (!candidate) return candidate;

  // 1. Exact
  const exact = provLocCpExact.get(slugify(candidate));
  if (exact) return exact;

  // 2. Partial (by PROV / LOC)
  if (provincia && localidad) {
    const partial = provLocPartial.get(slugify(`${provincia} / ${localidad}`));
    if (partial) return partial;
  }

  // 3. CABA special: Andreani stores barrios as "CABA - {barrio}"
  //    e.g. localidad "PALERMO" → try "CABA - PALERMO"
  if (provincia === "CAPITAL FEDERAL" && localidad) {
    const cabaBarrio = provLocPartial.get(slugify(`CAPITAL FEDERAL / CABA - ${localidad}`));
    if (cabaBarrio) return cabaBarrio;
    // Also try with truncation on the barrio name
    const words = localidad.trim().split(/\s+/);
    for (let n = words.length - 1; n >= 1; n--) {
      const shorter = words.slice(0, n).join(" ");
      const m = provLocPartial.get(slugify(`CAPITAL FEDERAL / CABA - ${shorter}`));
      if (m) return m;
    }
    // Fallback to C.A.B.A. generic with CP if available
    if (cp) {
      const generic = provLocCpExact.get(slugify(`CAPITAL FEDERAL / C.A.B.A. / ${cp}`));
      if (generic) return generic;
    }
    const genericFirst = provLocPartial.get(slugify("CAPITAL FEDERAL / C.A.B.A."));
    if (genericFirst) return genericFirst;
  }

  // 4. Truncate trailing words from localidad
  if (provincia && localidad) {
    const words = localidad.trim().split(/\s+/);
    for (let n = words.length - 1; n >= 1; n--) {
      const shorter = words.slice(0, n).join(" ");
      const match = provLocPartial.get(slugify(`${provincia} / ${shorter}`));
      if (match) return match;
    }
  }

  // 5. Match by PROV + CP (ignores wrong/generic locality like "BUENOS AIRES" or "BS AS")
  if (provincia && cp) {
    const byProvCp = provCpMap.get(slugify(`${provincia} / ${cp}`));
    if (byProvCp) return byProvCp;
  }

  // 6. Fallback
  return candidate;
}
