#!/usr/bin/env node

// Super simple test to see if Node.js event loop works
console.log('Simple test - type something and press Enter:');

process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => {
  console.log('Got input:', chunk.trim());
  if (chunk.trim() === 'exit') {
    process.exit(0);
  }
});

// Keep process alive
setInterval(() => {}, 1000);

console.log('Waiting for input...');