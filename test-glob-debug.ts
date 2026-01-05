/**
 * Debug glob pattern matching - step by step with placeholders
 */

const fromPattern = 'rules/**/*.md';

console.log('Original pattern:', fromPattern);
console.log();

let step1 = fromPattern.replace(/\./g, '\\.');
console.log('After escape dots:', step1);

let step2 = step1.replace(/\*\*\//g, '___DOUBLESTAR_SLASH___');
console.log('After replace **/:',step2);

let step3 = step2.replace(/\/\*\*/g, '___SLASH_DOUBLESTAR___');
console.log('After replace /**:', step3);

let step4 = step3.replace(/\*\*/g, '___DOUBLESTAR___');
console.log('After replace **:', step4);

let step5 = step4.replace(/\*/g, '[^/]+');
console.log('After replace *:', step5);

let step6 = step5.replace(/___DOUBLESTAR_SLASH___/g, '(?:.*/)?' );
console.log('After replace placeholder 1:', step6);

let step7 = step6.replace(/___SLASH_DOUBLESTAR___/g, '(?:/.*)?');
console.log('After replace placeholder 2:', step7);

let step8 = step7.replace(/___DOUBLESTAR___/g, '.*');
console.log('After replace placeholder 3:', step8);

console.log();
console.log('Final regex:', new RegExp(`^${step8}$`));

// Test it
const regex = new RegExp(`^${step8}$`);
console.log();
console.log('Test rules/tech-rules.md:', regex.test('rules/tech-rules.md'));
console.log('Test rules/tech/advanced-rules.md:', regex.test('rules/tech/advanced-rules.md'));
