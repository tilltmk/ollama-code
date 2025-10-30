#!/usr/bin/env node

const readline = require('readline');

console.log('Starting readline test...');
console.log('Process stdin TTY:', process.stdin.isTTY);
console.log('Process stdout TTY:', process.stdout.isTTY);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: '> ',
  terminal: true
});

console.log('Readline created');
console.log('Terminal mode:', rl.terminal);

rl.prompt();

rl.on('line', (line) => {
  console.log('Received:', line);
  if (line === 'exit') {
    rl.close();
  } else {
    rl.prompt();
  }
});

rl.on('close', () => {
  console.log('Goodbye!');
  process.exit(0);
});

console.log('Event listeners attached');