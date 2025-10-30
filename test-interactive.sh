#!/bin/bash
# Script to test interactive REPL with pty

script -qec "ollama-code" /dev/null | tee test-output.log &
PID=$!
sleep 2

# Send /models command
echo -e "/models" > /proc/$PID/fd/0 2>/dev/null || true
sleep 1

# Send /exit command
echo -e "/exit" > /proc/$PID/fd/0 2>/dev/null || true
sleep 1

kill $PID 2>/dev/null || true

echo "Test complete. Check test-output.log for results."