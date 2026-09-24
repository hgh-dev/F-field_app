import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const sourceDirectory = path.resolve(process.cwd(), 'src');

function listJavaScriptFiles(directory, prefix = '') {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const relativeName = path.posix.join(prefix, entry.name);
        if (entry.isDirectory()) {
            return listJavaScriptFiles(path.join(directory, entry.name), relativeName);
        }
        return entry.isFile() && entry.name.endsWith('.js') ? [relativeName] : [];
    });
}

const sourceFiles = listJavaScriptFiles(sourceDirectory).sort();
const sourceFileSet = new Set(sourceFiles);
const importPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"](\.{1,2}\/[^'"]+)['"]/g;
const dependencyGraph = new Map(sourceFiles.map(fileName => [fileName, []]));

for (const fileName of sourceFiles) {
    const source = fs.readFileSync(path.join(sourceDirectory, fileName), 'utf8');
    for (const match of source.matchAll(importPattern)) {
        const importPath = match[1].endsWith('.js') ? match[1] : `${match[1]}.js`;
        const dependencyName = path.posix.normalize(path.posix.join(path.posix.dirname(fileName), importPath));
        if (sourceFileSet.has(dependencyName)) dependencyGraph.get(fileName).push(dependencyName);
    }
}

let nextIndex = 0;
const stack = [];
const onStack = new Set();
const indexes = new Map();
const lowLinks = new Map();
const cycles = [];

function visit(fileName) {
    indexes.set(fileName, nextIndex);
    lowLinks.set(fileName, nextIndex);
    nextIndex += 1;
    stack.push(fileName);
    onStack.add(fileName);

    for (const dependencyName of dependencyGraph.get(fileName)) {
        if (!indexes.has(dependencyName)) {
            visit(dependencyName);
            lowLinks.set(fileName, Math.min(lowLinks.get(fileName), lowLinks.get(dependencyName)));
        } else if (onStack.has(dependencyName)) {
            lowLinks.set(fileName, Math.min(lowLinks.get(fileName), indexes.get(dependencyName)));
        }
    }

    if (lowLinks.get(fileName) !== indexes.get(fileName)) return;

    const component = [];
    let dependencyName;
    do {
        dependencyName = stack.pop();
        onStack.delete(dependencyName);
        component.push(dependencyName);
    } while (dependencyName !== fileName);

    const hasSelfImport = component.length === 1 && dependencyGraph.get(fileName).includes(fileName);
    if (component.length > 1 || hasSelfImport) cycles.push(component.sort());
}

for (const fileName of sourceFiles) {
    if (!indexes.has(fileName)) visit(fileName);
}

if (cycles.length > 0) {
    console.error('Circular imports detected:');
    for (const cycle of cycles) console.error(`- ${cycle.join(', ')}`);
    process.exitCode = 1;
} else {
    console.log(`Import cycle check passed: ${sourceFiles.length} source modules.`);
}
