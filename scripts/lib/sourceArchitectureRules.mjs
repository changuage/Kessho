import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const SOURCE_FILE_PATTERN = /\.(ts|tsx)$/;

export function collectSourceFiles(root) {
  const files = [];
  const visit = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.git') continue;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath);
      else if (SOURCE_FILE_PATTERN.test(entry.name)) files.push(fullPath);
    }
  };
  visit(root);
  return files;
}

export function parseTypeScriptSource(fileName, sourceText) {
  return ts.createSourceFile(
    fileName,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
}

export function collectImportSpecifiers(fileName, sourceText = fs.readFileSync(fileName, 'utf8')) {
  const source = parseTypeScriptSource(fileName, sourceText);
  const specifiers = [];
  const visit = (node) => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      specifiers.push({
        specifier: node.moduleSpecifier.text,
        isTypeOnly: Boolean(node.importClause?.isTypeOnly),
        kind: 'static',
      });
    }
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteral(argument)) {
        specifiers.push({ specifier: argument.text, isTypeOnly: false, kind: 'dynamic' });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return specifiers;
}

export function findForbiddenImports(fileName, sourceText, matcher) {
  return collectImportSpecifiers(fileName, sourceText)
    .filter((entry) => !entry.isTypeOnly && matcher(entry.specifier, entry.kind));
}

export function relativeSourcePath(root, fileName) {
  return path.relative(root, fileName).split(path.sep).join('/');
}
