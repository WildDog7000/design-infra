/**
 * LLP Token Sync — the git ↔ Figma bridge.
 *
 * Publish direction: the UI fetches the DTCG contract files from the GitHub
 * repo (git is the single source of truth) and posts them here. This side
 * owns all Figma mutations: one Variable Collection ("LLP Tokens") with
 * Light/Dark modes, primitives as raw values, semantic/usage as variable
 * aliases so the reference chain stays visible inside Figma.
 * Sync is idempotent: existing variables are matched by name and updated.
 *
 * Proposal direction: `diff` walks the same contract, reads the current
 * Figma variable values back, and reports every divergence. The UI turns
 * selected divergences into a GitHub pull request — Figma never writes to
 * git directly; designers propose, review + CI decide.
 */

figma.showUI(__html__, { width: 400, height: 460 });

var COLLECTION_NAME = 'LLP Tokens';

var TYPE_MAP = {
  color: 'COLOR',
  dimension: 'FLOAT',
  fontWeight: 'FLOAT',
  number: 'FLOAT',
  fontFamily: 'STRING',
};

function log(msg) {
  figma.ui.postMessage({ type: 'log', msg: msg });
}

function hexToFigmaColor(hex) {
  var h = hex.replace('#', '');
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
  var r = parseInt(h.slice(0, 2), 16) / 255;
  var g = parseInt(h.slice(2, 4), 16) / 255;
  var b = parseInt(h.slice(4, 6), 16) / 255;
  var a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
  return { r: r, g: g, b: b, a: a };
}

function toFigmaValue(resolvedType, value) {
  if (resolvedType === 'COLOR') return hexToFigmaColor(value);
  if (resolvedType === 'FLOAT') return parseFloat(value);
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

// DTCG tree → flat list of { name: 'color/gray/100', type, value }
// $type inherits from the nearest ancestor group, per the DTCG spec.
function flatten(node, path, inheritedType, out) {
  var type = node.$type || inheritedType;
  for (var key in node) {
    if (key.charAt(0) === '$') continue;
    var child = node[key];
    if (child && typeof child === 'object') {
      if ('$value' in child) {
        out.push({
          name: path.concat(key).join('/'),
          type: child.$type || type,
          value: child.$value,
        });
      } else {
        flatten(child, path.concat(key), type, out);
      }
    }
  }
  return out;
}

function refToName(value) {
  // '{color.blue.800}' → 'color/blue/800'
  return value.slice(1, -1).split('.').join('/');
}

async function getCollectionByName(name) {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === name) return collections[i];
  }
  return figma.variables.createVariableCollection(name);
}

// A "target" is one theme's destination: a collection + mode to write into,
// plus a name index so re-runs update variables instead of duplicating them.
async function makeTarget(collection, modeId) {
  var byName = {};
  for (var v = 0; v < collection.variableIds.length; v++) {
    var existing = await figma.variables.getVariableByIdAsync(collection.variableIds[v]);
    if (existing) byName[existing.name] = existing;
  }
  return { collection: collection, modeId: modeId, byName: byName };
}

function setToken(target, token) {
  var resolvedType = TYPE_MAP[token.type];
  if (!resolvedType) return 0;
  var variable = target.byName[token.name];
  if (!variable) {
    variable = figma.variables.createVariable(token.name, target.collection, resolvedType);
    target.byName[token.name] = variable;
  }
  if (typeof token.value === 'string' && token.value.charAt(0) === '{') {
    var aliasTarget = target.byName[refToName(token.value)];
    if (!aliasTarget) {
      log('⚠ unresolved reference ' + token.value + ' for ' + token.name);
      return 0;
    }
    variable.setValueForMode(target.modeId, figma.variables.createVariableAlias(aliasTarget));
  } else {
    variable.setValueForMode(target.modeId, toFigmaValue(resolvedType, token.value));
  }
  return 1;
}

async function sync(files) {
  var lightCollection = await getCollectionByName(COLLECTION_NAME);
  try {
    lightCollection.renameMode(lightCollection.modes[0].modeId, 'Light');
  } catch (e) {
    /* mode renaming is cosmetic; ignore plan restrictions */
  }
  var light = await makeTarget(lightCollection, lightCollection.modes[0].modeId);

  // Preferred: Light/Dark as modes of one collection. Multi-mode is gated to
  // paid Figma plans, so fall back to a second single-mode collection.
  var dark;
  var darkModeId = null;
  for (var i = 0; i < lightCollection.modes.length; i++) {
    if (lightCollection.modes[i].name === 'Dark') darkModeId = lightCollection.modes[i].modeId;
  }
  if (darkModeId === null) {
    try {
      darkModeId = lightCollection.addMode('Dark');
    } catch (e) {
      log('ℹ plan limits collections to 1 mode — using a separate Dark collection');
    }
  }
  if (darkModeId !== null) {
    // same collection, different mode: share the name index, otherwise the
    // two targets each create their own copy of every variable
    dark = { collection: lightCollection, modeId: darkModeId, byName: light.byName };
  } else {
    dark = await makeTarget(await getCollectionByName(COLLECTION_NAME + ' · Dark'), null);
    dark.modeId = dark.collection.modes[0].modeId;
  }

  var count = 0;

  // pass 1 — primitives: raw values per theme; dimensions/typography don't
  // vary by theme, so mirror them into the dark target too
  var themeInvariant = flatten(files['primitives/dimension.json'], [], null, [])
    .concat(flatten(files['primitives/typography.json'], [], null, []));
  var lightColors = flatten(files['primitives/color.light.json'], [], null, []);
  var darkColors = flatten(files['primitives/color.dark.json'], [], null, []);

  for (var a = 0; a < lightColors.length; a++) count += setToken(light, lightColors[a]);
  for (var b = 0; b < darkColors.length; b++) setToken(dark, darkColors[b]);
  for (var t = 0; t < themeInvariant.length; t++) {
    count += setToken(light, themeInvariant[t]);
    setToken(dark, themeInvariant[t]);
  }
  log('primitives done (' + (lightColors.length + themeInvariant.length) + ' variables)');

  // pass 2 — semantic: theme-invariant aliases, written into both targets
  var semantic = flatten(files['semantic/color.json'], [], null, []);
  for (var c = 0; c < semantic.length; c++) {
    count += setToken(light, semantic[c]);
    setToken(dark, semantic[c]);
  }
  log('semantic done (' + semantic.length + ' variables)');

  // pass 3 — usage: may point at different targets per theme
  var usageLight = flatten(files['usage/color.light.json'], [], null, []);
  var usageDark = flatten(files['usage/color.dark.json'], [], null, []);
  for (var d = 0; d < usageLight.length; d++) count += setToken(light, usageLight[d]);
  for (var e = 0; e < usageDark.length; e++) setToken(dark, usageDark[e]);
  log('usage done (' + usageLight.length + ' variables)');

  return count;
}

/* ---------- proposal direction: read back + diff ---------- */

// Which target each contract file was published into. Theme-invariant files
// (dimension/typography/semantic) are mirrored into dark on publish; we treat
// the light copy as the one designers edit, so drift is detected there.
var FILE_TARGETS = {
  'primitives/color.light.json': 'light',
  'primitives/color.dark.json': 'dark',
  'primitives/dimension.json': 'light',
  'primitives/typography.json': 'light',
  'semantic/color.json': 'light',
  'usage/color.light.json': 'light',
  'usage/color.dark.json': 'dark',
};

function figmaColorToHex(c) {
  function h(x) {
    var s = Math.round(x * 255).toString(16);
    return s.length === 1 ? '0' + s : s;
  }
  var hex = '#' + h(c.r) + h(c.g) + h(c.b);
  if (typeof c.a === 'number' && c.a < 1) hex += h(c.a);
  return hex;
}

function normalizeHex(hex) {
  var s = String(hex).replace('#', '').toLowerCase();
  if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
  if (s.length === 8 && s.slice(6) === 'ff') s = s.slice(0, 6);
  return '#' + s;
}

// Both sides of the comparison are reduced to one canonical string:
// refs as '{a.b.c}', colors as lowercase hex, floats via String(parseFloat).
function canonicalContractValue(token) {
  if (typeof token.value === 'string' && token.value.charAt(0) === '{') return token.value;
  var resolvedType = TYPE_MAP[token.type];
  if (resolvedType === 'COLOR') return normalizeHex(token.value);
  if (resolvedType === 'FLOAT') return String(parseFloat(token.value));
  if (Array.isArray(token.value)) return token.value.join(', ');
  return String(token.value);
}

async function canonicalFigmaValue(variable, modeId, tokenType) {
  var value = variable.valuesByMode[modeId];
  if (value === undefined) return undefined;
  if (value && typeof value === 'object' && value.type === 'VARIABLE_ALIAS') {
    var aliased = await figma.variables.getVariableByIdAsync(value.id);
    if (!aliased) return undefined;
    return '{' + aliased.name.split('/').join('.') + '}';
  }
  var resolvedType = TYPE_MAP[tokenType];
  if (resolvedType === 'COLOR') return normalizeHex(figmaColorToHex(value));
  return String(value);
}

// Canonical figma value → contract form, preserving the shape of the value
// it replaces: unit suffix for dimensions ('16px'), number vs string, array
// for fontFamily lists.
function proposedValue(canonical, oldRaw, resolvedType) {
  if (canonical.charAt(0) === '{') return canonical;
  if (resolvedType === 'FLOAT') {
    if (typeof oldRaw === 'number') return parseFloat(canonical);
    var suffix = String(oldRaw).replace(/^-?[0-9.]+/, '');
    return canonical + suffix;
  }
  if (Array.isArray(oldRaw)) return canonical.split(/,\s*/);
  return canonical;
}

async function findCollectionByName(name) {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === name) return collections[i];
  }
  return null;
}

// Read-only counterpart of the target setup in sync(): never creates
// collections or modes, so Verify can run safely on any file.
async function getReadTargets() {
  var lightCollection = await findCollectionByName(COLLECTION_NAME);
  if (!lightCollection) return null;
  var light = await makeTarget(lightCollection, lightCollection.modes[0].modeId);
  var dark = null;
  for (var i = 0; i < lightCollection.modes.length; i++) {
    if (lightCollection.modes[i].name === 'Dark') {
      dark = { collection: lightCollection, modeId: lightCollection.modes[i].modeId, byName: light.byName };
    }
  }
  if (!dark) {
    var darkCollection = await findCollectionByName(COLLECTION_NAME + ' · Dark');
    if (darkCollection) dark = await makeTarget(darkCollection, darkCollection.modes[0].modeId);
  }
  return { light: light, dark: dark };
}

async function diff(files) {
  var targets = await getReadTargets();
  if (!targets) {
    throw new Error('collection "' + COLLECTION_NAME + '" not found — run Sync first');
  }
  var changes = [];
  var missing = [];
  var seen = {};
  var checked = 0;

  for (var file in FILE_TARGETS) {
    var target = FILE_TARGETS[file] === 'dark' ? targets.dark : targets.light;
    if (!target) {
      log('⚠ no dark target found — skipping ' + file);
      continue;
    }
    var tokens = flatten(files[file], [], null, []);
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var resolvedType = TYPE_MAP[token.type];
      if (!resolvedType) continue;
      seen[token.name] = true;
      var variable = target.byName[token.name];
      if (!variable) {
        missing.push(token.name + ' (' + file + ')');
        continue;
      }
      var figmaCanonical = await canonicalFigmaValue(variable, target.modeId, token.type);
      if (figmaCanonical === undefined) {
        missing.push(token.name + ' (' + file + ': no value for mode)');
        continue;
      }
      checked++;
      var contractCanonical = canonicalContractValue(token);
      if (figmaCanonical !== contractCanonical) {
        changes.push({
          file: file,
          name: token.name,
          type: token.type,
          oldCanonical: contractCanonical,
          newCanonical: figmaCanonical,
          newValue: proposedValue(figmaCanonical, token.value, resolvedType),
        });
      }
    }
  }

  // Variables in Figma with no counterpart in the contract: reported, not
  // proposed — naming and placement of new tokens is a decision for git.
  var extra = [];
  for (var name in targets.light.byName) {
    if (!seen[name]) extra.push(name);
  }

  return { changes: changes, missing: missing, extra: extra, checked: checked };
}

figma.ui.onmessage = function (msg) {
  if (msg.type === 'sync') {
    sync(msg.files)
      .then(function (count) {
        log('✅ sync complete: ' + count + ' variables in "' + COLLECTION_NAME + '"');
        figma.notify('LLP Tokens synced (' + count + ' variables)');
      })
      .catch(function (err) {
        log('❌ ' + err.message);
      });
  } else if (msg.type === 'diff') {
    diff(msg.files)
      .then(function (result) {
        figma.ui.postMessage({ type: 'diff-result', result: result });
      })
      .catch(function (err) {
        log('❌ ' + err.message);
        figma.ui.postMessage({ type: 'diff-result', error: err.message });
      });
  } else if (msg.type === 'get-pat') {
    figma.clientStorage.getAsync('github-pat').then(function (value) {
      figma.ui.postMessage({ type: 'pat', value: value || '' });
    });
  } else if (msg.type === 'set-pat') {
    figma.clientStorage.setAsync('github-pat', msg.value || '');
  }
};
