#!/bin/bash
# Test multiple interactions in REPL

{
    echo "/models"
    sleep 2
    echo "Hallo, wie heißt du?"
    sleep 4
    echo "Kannst du mir helfen?"
    sleep 4
    echo "/model llama3.1:8b"
    sleep 2
    echo "Verstehst du Deutsch?"
    sleep 4
    echo "/exit"
} | timeout 25 ollama-code 2>&1 | tail -50