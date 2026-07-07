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

async function getCollection() {
  var collections = await figma.variables.getLocalVariableCollectionsAsync();
  for (var i = 0; i < collections.length; i++) {
    if (collections[i].name === COLLECTION_NAME) return collections[i];
  }
  return figma.variables.createVariableCollection(COLLECTION_NAME);
}

async function sync(files) {
  var collection = await getCollection();

  // mode 0 → Light, ensure a second mode → Dark
  collection.renameMode(collection.modes[0].modeId, 'Light');
  var darkModeId = null;
  for (var i = 0; i < collection.modes.length; i++) {
    if (collection.modes[i].name === 'Dark') darkModeId = collection.modes[i].modeId;
  }
  if (!darkModeId) darkModeId = collection.addMode('Dark');
  var lightModeId = collection.modes[0].modeId;

  // index existing variables by name so re-runs update instead of duplicate
  var byName = {};
  for (var v = 0; v < collection.variableIds.length; v++) {
    var existing = await figma.variables.getVariableByIdAsync(collection.variableIds[v]);
    if (existing) byName[existing.name] = existing;
  }

  function ensureVariable(name, resolvedType) {
    if (byName[name]) return byName[name];
    var created = figma.variables.createVariable(name, collection, resolvedType);
    byName[name] = created;
    return created;
  }

  function setToken(token, modeId) {
    var resolvedType = TYPE_MAP[token.type];
    if (!resolvedType) return 0;
    var variable = ensureVariable(token.name, resolvedType);
    if (typeof token.value === 'string' && token.value.charAt(0) === '{') {
      var target = byName[refToName(token.value)];
      if (!target) {
        log('⚠ unresolved reference ' + token.value + ' for ' + token.name);
        return 0;
      }
      variable.setValueForMode(modeId, figma.variables.createVariableAlias(target));
    } else {
      variable.setValueForMode(modeId, toFigmaValue(resolvedType, token.value));
    }
    return 1;
  }

  var count = 0;

  // pass 1 — primitives: raw values, one tree per mode
  var lightPrimitives = flatten(files['primitives/color.light.json'], [], null, [])
    .concat(flatten(files['primitives/dimension.json'], [], null, []))
    .concat(flatten(files['primitives/typography.json'], [], null, []));
  var darkPrimitives = flatten(files['primitives/color.dark.json'], [], null, []);

  for (var a = 0; a < lightPrimitives.length; a++) {
    count += setToken(lightPrimitives[a], lightModeId);
    // dimensions/typography don't vary by theme: mirror light into dark
    setToken(lightPrimitives[a], darkModeId);
  }
  for (var b = 0; b < darkPrimitives.length; b++) {
    setToken(darkPrimitives[b], darkModeId);
  }
  log('primitives done (' + lightPrimitives.length + ' variables)');

  // pass 2 — semantic: theme-invariant aliases, same in both modes
  var semantic = flatten(files['semantic/color.json'], [], null, []);
  for (var c = 0; c < semantic.length; c++) {
    count += setToken(semantic[c], lightModeId);
    setToken(semantic[c], darkModeId);
  }
  log('semantic done (' + semantic.length + ' variables)');

  // pass 3 — usage: may point at different targets per mode
  var usageLight = flatten(files['usage/color.light.json'], [], null, []);
  var usageDark = flatten(files['usage/color.dark.json'], [], null, []);
  for (var d = 0; d < usageLight.length; d++) count += setToken(usageLight[d], lightModeId);
  for (var e = 0; e < usageDark.length; e++) setToken(usageDark[e], darkModeId);
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
