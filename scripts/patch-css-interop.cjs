/**
 * NativeWind(react-native-css-interop) printUpgradeWarning → stringify() 가
 * Object.entries로 props를 깊게 순회하며 React Navigation 상태 getter를 건드려
 * "Couldn't find a navigation context" 가 날 수 있음. 설치 후 이 스크립트로 교정.
 * @see node_modules/react-native-css-interop/dist/runtime/native/render-component.js
 */
const fs = require('fs');
const path = require('path');

const target = path.join(
  __dirname,
  '..',
  'node_modules',
  'react-native-css-interop',
  'dist',
  'runtime',
  'native',
  'render-component.js'
);

if (!fs.existsSync(target)) {
  process.exit(0);
}

let s = fs.readFileSync(target, 'utf8');
if (s.includes('[stringify error:') && s.includes('[GetterThrew]')) {
  process.exit(0);
}

const oldStringify = `function stringify(object) {
    const seen = new WeakSet();
    return JSON.stringify(object, function replace(_, value) {
        if (!(value !== null && typeof value === "object")) {
            return value;
        }
        if (seen.has(value)) {
            return "[Circular]";
        }
        seen.add(value);
        const newValue = Array.isArray(value) ? [] : {};
        for (const entry of Object.entries(value)) {
            newValue[entry[0]] = replace(entry[0], entry[1]);
        }
        seen.delete(value);
        return newValue;
    }, 2);
}`;

const newStringify = `function stringify(object) {
    try {
        const seen = new WeakSet();
        return JSON.stringify(object, function replace(_key, value) {
            if (typeof value === "function") {
                return value.name ? \`[Function \${value.name}]\` : "[Function]";
            }
            if (value === null || typeof value !== "object") {
                return value;
            }
            if (seen.has(value)) {
                return "[Circular]";
            }
            if (typeof value === "object" && "$$typeof" in value) {
                return "[ReactElement]";
            }
            seen.add(value);
            return value;
        }, 2);
    }
    catch (e) {
        return \`[stringify error: \${String(e?.message ?? e)}]\`;
    }
}`;

const oldGet = `            if ("get" in value && typeof value.get === "function") {
                return value.get();
            }`;

const newGet = `            if ("get" in value && typeof value.get === "function") {
                try {
                    return value.get();
                }
                catch {
                    return "[GetterThrew]";
                }
            }`;

if (!s.includes(oldStringify)) {
  console.warn('[patch-css-interop] stringify block not found; skip (already patched or different version?)');
  process.exit(0);
}

s = s.replace(oldStringify, newStringify);
if (!s.includes(oldGet)) {
  console.warn('[patch-css-interop] getDebugReplacer block not found; skip');
  process.exit(0);
}
s = s.replace(oldGet, newGet);
fs.writeFileSync(target, s, 'utf8');
console.log('[patch-css-interop] applied safe stringify + getDebugReplacer guard');
