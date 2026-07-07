/**
 * LLP Token Sync — the "publish" direction of the git ↔ Figma bridge.
 *
 * The UI fetches the DTCG contract files from the GitHub repo (git is the
 * single source of truth) and posts them here. This side owns all Figma
 * mutations: one Variable Collection ("LLP Tokens") with Light/Dark modes,
 * primitives as raw values, semantic/usage as variable aliases so the
 * reference chain stays visible inside Figma.
 *
 * Sync is idempotent: existing variables are matched by name and updated.
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
    dark = await makeTarget(lightCollection, darkModeId);
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

figma.ui.onmessage = function (msg) {
  if (msg.type !== 'sync') return;
  sync(msg.files)
    .then(function (count) {
      log('✅ sync complete: ' + count + ' variables in "' + COLLECTION_NAME + '"');
      figma.notify('LLP Tokens synced (' + count + ' variables)');
    })
    .catch(function (err) {
      log('❌ ' + err.message);
    });
};
