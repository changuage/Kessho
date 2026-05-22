import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';

const root = process.cwd();

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

export function sourceFile(path) {
  return ts.createSourceFile(path, read(path), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

const isSatisfiesExpression =
  typeof ts.isSatisfiesExpression === 'function' ? ts.isSatisfiesExpression : () => false;

export function unwrapExpression(expression) {
  let current = expression;
  while (ts.isAsExpression(current) || isSatisfiesExpression(current) || ts.isParenthesizedExpression(current)) {
    current = current.expression;
  }
  return current;
}

export function propertyNameText(name) {
  return ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name) ? name.text : null;
}

export function numericLiteralValue(expression) {
  const current = unwrapExpression(expression);
  if (ts.isNumericLiteral(current)) {
    return Number(current.text);
  }
  if (ts.isPrefixUnaryExpression(current) && ts.isNumericLiteral(current.operand)) {
    const value = Number(current.operand.text);
    return current.operator === ts.SyntaxKind.MinusToken ? -value : value;
  }
  return null;
}

export function stringLiteralValue(expression) {
  const current = unwrapExpression(expression);
  if (ts.isStringLiteral(current) || ts.isNoSubstitutionTemplateLiteral(current)) {
    return current.text;
  }
  return null;
}

export function objectLiteralConst(path, declarationName) {
  const file = sourceFile(path);
  let objectLiteral = null;
  function visit(node) {
    if (
      objectLiteral === null &&
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === declarationName &&
      node.initializer
    ) {
      const initializer = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        objectLiteral = initializer;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return objectLiteral;
}

export function collectSliderStateKeys() {
  const keys = new Set();
  const state = sourceFile('src/ui/state.ts');
  function visit(node) {
    if (ts.isInterfaceDeclaration(node) && node.name.text === 'SliderState') {
      for (const member of node.members) {
        if (ts.isPropertySignature(member) && ts.isIdentifier(member.name)) {
          keys.add(member.name.text);
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(state);
  return keys;
}

export function objectKeysInConst(path, declarationName) {
  const keys = new Set();
  const objectLiteral = objectLiteralConst(path, declarationName);
  if (objectLiteral) {
    for (const property of objectLiteral.properties) {
      if (ts.isPropertyAssignment(property) || ts.isShorthandPropertyAssignment(property) || ts.isMethodDeclaration(property)) {
        const name = propertyNameText(property.name);
        if (name) {
          keys.add(name);
        }
      }
    }
  }
  return keys;
}

export function sourcePosition(file, node) {
  const position = file.getLineAndCharacterOfPosition(node.getStart(file));
  return {
    line: position.line + 1,
    column: position.character + 1,
  };
}

export function walkSourceFiles(relativeDir, files = []) {
  for (const entry of readdirSync(resolve(root, relativeDir), { withFileTypes: true })) {
    const path = `${relativeDir}/${entry.name}`;
    if (entry.isDirectory()) {
      walkSourceFiles(path, files);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name) || entry.name.endsWith('.d.ts')) {
      continue;
    }
    files.push(path);
  }
  return files;
}

function namedObjectLiteralConsts(file) {
  const objects = new Map();
  function visit(node) {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.initializer
    ) {
      const initializer = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(initializer)) {
        objects.set(node.name.text, initializer);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return objects;
}

function collectObjectLiteralKeys(objectLiteral, localObjects, file, visited = new Set()) {
  const keys = new Map();
  function add(key, node) {
    if (!keys.has(key)) {
      const line = file.getLineAndCharacterOfPosition(node.getStart(file)).line + 1;
      keys.set(key, { key, line });
    }
  }

  for (const property of objectLiteral.properties) {
    if (
      ts.isPropertyAssignment(property) ||
      ts.isShorthandPropertyAssignment(property) ||
      ts.isMethodDeclaration(property)
    ) {
      const name = propertyNameText(property.name);
      if (name) {
        add(name, property.name);
      }
      continue;
    }

    if (ts.isSpreadAssignment(property)) {
      const expression = unwrapExpression(property.expression);
      if (ts.isIdentifier(expression) && localObjects.has(expression.text) && !visited.has(expression.text)) {
        visited.add(expression.text);
        for (const [key, entry] of collectObjectLiteralKeys(localObjects.get(expression.text), localObjects, file, visited)) {
          if (!keys.has(key)) {
            keys.set(key, entry);
          }
        }
        visited.delete(expression.text);
      }
    }
  }

  return keys;
}

export function collectPresetPayloadKeys(path, declarationName) {
  const file = sourceFile(path);
  const localObjects = namedObjectLiteralConsts(file);
  const declaration = objectLiteralConst(path, declarationName);
  const keys = new Map();
  if (!declaration) {
    return keys;
  }

  function visit(node) {
    if (
      ts.isPropertyAssignment(node) &&
      propertyNameText(node.name) === 'params'
    ) {
      const params = unwrapExpression(node.initializer);
      if (ts.isObjectLiteralExpression(params)) {
        for (const [key, entry] of collectObjectLiteralKeys(params, localObjects, file)) {
          if (!keys.has(key)) {
            keys.set(key, entry);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(declaration);
  return keys;
}

export function collectParamRegistryEntries() {
  const entries = new Map();
  const registry = objectLiteralConst('src/presets/ParamRegistry.ts', 'PARAM_REGISTRY');
  if (!registry) {
    return entries;
  }

  for (const property of registry.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const key = propertyNameText(property.name);
    const initializer = unwrapExpression(property.initializer);
    if (!key || !ts.isObjectLiteralExpression(initializer)) {
      continue;
    }

    let level = null;
    let scope = null;
    for (const entry of initializer.properties) {
      if (!ts.isPropertyAssignment(entry)) {
        continue;
      }
      const name = propertyNameText(entry.name);
      if (name === 'level') {
        level = numericLiteralValue(entry.initializer);
      } else if (name === 'scope') {
        scope = stringLiteralValue(entry.initializer);
      }
    }
    if (level !== null && scope) {
      entries.set(key, { level, scope });
    }
  }

  return entries;
}

export function collectCascadeChildren() {
  const children = new Map();
  const cascade = objectLiteralConst('src/presets/codec.ts', 'CASCADE_CHILDREN');
  if (!cascade) {
    return children;
  }

  for (const property of cascade.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const scope = propertyNameText(property.name);
    const initializer = unwrapExpression(property.initializer);
    if (!scope || !ts.isArrayLiteralExpression(initializer)) {
      continue;
    }

    const entries = [];
    for (const element of initializer.elements) {
      const child = unwrapExpression(element);
      if (!ts.isObjectLiteralExpression(child)) {
        continue;
      }
      let level = null;
      let childScope = null;
      for (const childProperty of child.properties) {
        if (!ts.isPropertyAssignment(childProperty)) {
          continue;
        }
        const name = propertyNameText(childProperty.name);
        if (name === 'level') {
          level = numericLiteralValue(childProperty.initializer);
        } else if (name === 'scope') {
          childScope = stringLiteralValue(childProperty.initializer);
        }
      }
      if (level !== null && childScope) {
        entries.push({ level, scope: childScope });
      }
    }
    children.set(scope, entries);
  }

  return children;
}

export function collectSourceExtraKeys() {
  const extras = new Map();
  const extraKeys = objectLiteralConst('src/presets/codec.ts', 'SOURCE_EXTRA_KEYS');
  if (!extraKeys) {
    return extras;
  }

  for (const property of extraKeys.properties) {
    if (!ts.isPropertyAssignment(property)) {
      continue;
    }
    const scope = propertyNameText(property.name);
    const initializer = unwrapExpression(property.initializer);
    if (!scope || !ts.isArrayLiteralExpression(initializer)) {
      continue;
    }
    extras.set(scope, initializer.elements
      .map((element) => stringLiteralValue(element))
      .filter(Boolean));
  }

  return extras;
}

export function cascadeKeysForScope(paramRegistryEntries, cascadeChildren, sourceExtraKeys, level, scope) {
  if (level === 4) {
    return new Set(paramRegistryEntries.keys());
  }

  const keys = new Set();
  const visited = new Set();

  function collect(childLevel, childScope) {
    const visitKey = `${childLevel}:${childScope ?? ''}`;
    if (visited.has(visitKey)) {
      return;
    }
    visited.add(visitKey);

    for (const [key, info] of paramRegistryEntries) {
      if (info.level === childLevel && (!childScope || info.scope === childScope)) {
        keys.add(key);
      }
    }

    for (const child of cascadeChildren.get(childScope ?? '') ?? []) {
      collect(child.level, child.scope);
    }

    for (const key of sourceExtraKeys.get(childScope ?? '') ?? []) {
      keys.add(key);
    }
  }

  collect(level, scope);
  return keys;
}

export function collectPresetPayloadScopeGaps(checks, paramRegistryEntries, expectedRegistryOmissions) {
  const cascadeChildren = collectCascadeChildren();
  const sourceExtraKeys = collectSourceExtraKeys();
  const expectedOmissionMap = new Map(expectedRegistryOmissions.map((entry) => [entry.key, entry]));
  const failures = [];
  const explicitOmissions = [];

  for (const check of checks) {
    const allowedKeys = cascadeKeysForScope(paramRegistryEntries, cascadeChildren, sourceExtraKeys, check.level, check.scope);
    for (const [key, entry] of collectPresetPayloadKeys(check.path, check.declarationName)) {
      if (allowedKeys.has(key)) {
        continue;
      }

      const registryEntry = paramRegistryEntries.get(key) ?? null;
      const expectedOmission = expectedOmissionMap.get(key) ?? null;
      const gap = {
        path: check.path,
        declarationName: check.declarationName,
        key,
        line: entry.line,
        expectedLevel: check.level,
        expectedScope: check.scope,
        registeredLevel: registryEntry?.level ?? null,
        registeredScope: registryEntry?.scope ?? null,
        reason: registryEntry
          ? 'preset key is registry-owned by a different scope and is not reachable through this preset cascade'
          : expectedOmission
            ? expectedOmission.reason
            : 'preset key is not registered in ParamRegistry',
      };

      if (expectedOmission && !registryEntry) {
        explicitOmissions.push(gap);
      } else {
        failures.push(gap);
      }
    }
  }

  return { failures, explicitOmissions };
}
