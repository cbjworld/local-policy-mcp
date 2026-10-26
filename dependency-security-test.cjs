const assert=require('node:assert/strict'),{z}=require('zod');
const limited=z.array(z.string()).max(10);
assert(limited.safeParse(['valid']).success);
const rejected=limited.safeParse(Array(10000).fill(null));
assert.equal(rejected.success,false);
assert.equal(rejected.error.issues.length,1,'Oversized constrained arrays must fail before collecting per-element errors');
for(const name of ['parseHwp','parseHwp3','parseHwpx'])assert.equal(typeof require('kordoc')[name],'function');
console.log('PASS: bounded collection validation and Korean document parser entry points with patched Zod');
