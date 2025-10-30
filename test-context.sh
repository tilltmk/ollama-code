#!/bin/bash
# Test script to verify context is maintained and model switching works

echo "=== Testing Context Preservation ==="
{
    echo "Hi, remember the number 42"
    sleep 2
    echo "What number did I ask you to remember?"
    sleep 2
    echo "/model granite3.3:8b"
    sleep 2
    echo "Do you still remember the number?"
    sleep 2
    echo "/clear"
    sleep 1
    echo "What number did I mention?"
    sleep 2
    echo "/exit"
} | timeout 30 ollama-code 2>&1 | grep -E "(remember|42|Model:|Context:|Switched|Clear)" | tail -20

echo -e "\n=== Testing Model Switch ==="
ollama-code --model granite3.3:8b "Tell me your model name briefly" 2>&1 | tail -5