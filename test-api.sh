#!/bin/bash

# Test script for LSP API

echo "=== Testing LSP API ==="
echo ""

# Test 1: Health check
echo "1. Health Check:"
curl -s http://localhost:3000/api/health | json_pp
echo ""
echo ""

# Test 2: Find references to 'greetUser' function
# Note: Update the file path to match your actual workspace path
echo "2. Find References to 'greetUser' (line 4, character 9):"
curl -s -X POST http://localhost:3000/api/textDocument/references \
  -H "Content-Type: application/json" \
  -d '{
    "uri": "file:///d:/Company/Company/Tailcall/vscode/lsp-poc/test-sample.ts",
    "position": { "line": 4, "character": 9 }
  }' | json_pp
echo ""

