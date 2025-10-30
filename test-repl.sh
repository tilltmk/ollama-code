#!/bin/bash
# Test script to check if REPL responds to commands

echo "Testing /models command..."
echo "/models" | timeout 5 ollama-code 2>&1 | tail -20

echo -e "\n\nTesting /help command..."
echo "/help" | timeout 5 ollama-code 2>&1 | tail -20

echo -e "\n\nTesting with multiple commands..."
{ echo "/models"; sleep 1; echo "/exit"; } | timeout 5 ollama-code 2>&1 | tail -30