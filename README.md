# LSP POC - Forge API

A proof-of-concept VS Code extension that exposes LSP features via HTTP REST API for Forge to consume.

## What This Does

This extension:
- Starts an HTTP server on port 3000 when VS Code activates
- Exposes VS Code's language server features via REST API
- Allows external tools (like Forge) to query code intelligence features

## Features Implemented

### 1. Health Check
```bash
GET http://localhost:3000/api/health
```

### 2. Find References
```bash
POST http://localhost:3000/api/textDocument/references
Content-Type: application/json

{
  "uri": "file:///path/to/file.ts",
  "position": { "line": 10, "character": 5 }
}
```

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Compile TypeScript
```bash
npm run compile
```

### 3. Run the Extension
1. Press `F5` in VS Code to open Extension Development Host
2. The extension will activate automatically
3. You should see a notification: "Forge LSP API running on port 3000"

### 4. Test the API

#### Option A: Using curl (PowerShell)
```powershell
# Health check
curl http://localhost:3000/api/health

# Find references
curl -X POST http://localhost:3000/api/textDocument/references `
  -H "Content-Type: application/json" `
  -d '{\"uri\":\"file:///d:/Company/Company/Tailcall/vscode/lsp-poc/test-sample.ts\",\"position\":{\"line\":3,\"character\":9}}'
```

#### Option B: Using the test script (Git Bash)
```bash
chmod +x test-api.sh
./test-api.sh
```

#### Option C: Using Postman/Insomnia
Import the following request:
- **URL:** `http://localhost:3000/api/textDocument/references`
- **Method:** POST
- **Headers:** `Content-Type: application/json`
- **Body:**
```json
{
  "uri": "file:///d:/Company/Company/Tailcall/vscode/lsp-poc/test-sample.ts",
  "position": { "line": 3, "character": 9 }
}
```

## Testing with test-sample.ts

The `test-sample.ts` file contains a function `greetUser` that is used in multiple places.

To find all references to `greetUser`:
- Function definition is at line 3 (0-indexed: line 3, character 9)
- The API should return all locations where `greetUser` is used

## Expected Response

```json
{
  "references": [
    {
      "uri": "file:///d:/Company/Company/Tailcall/vscode/lsp-poc/test-sample.ts",
      "range": {
        "start": { "line": 3, "character": 9 },
        "end": { "line": 3, "character": 18 }
      }
    },
    {
      "uri": "file:///d:/Company/Company/Tailcall/vscode/lsp-poc/test-sample.ts",
      "range": {
        "start": { "line": 8, "character": 18 },
        "end": { "line": 8, "character": 27 }
      }
    }
    // ... more references
  ]
}
```

## Configuration

You can change the port in VS Code settings:
```json
{
  "lspPoc.port": 3000
}
```

## Architecture

```
┌─────────────────────────────────────┐
│      VS Code Extension              │
│  ┌───────────────────────────────┐  │
│  │  HTTP Server (Express)        │  │
│  │  Port: 3000                   │  │
│  └───────────────────────────────┘  │
│              ▲                       │
│              │ Proxies to            │
│              ▼                       │
│  ┌───────────────────────────────┐  │
│  │  VS Code Language Features    │  │
│  │  (TypeScript, Python, etc.)   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              ▲
              │ HTTP Requests
              │
┌─────────────┴───────────────────────┐
│         Forge CLI                    │
│  (or any HTTP client)                │
└──────────────────────────────────────┘
```

## Next Steps for Full Implementation

1. Add more LSP features:
   - `textDocument/definition` - Go to definition
   - `workspace/symbol` - Find symbols
   - `textDocument/hover` - Hover information
   - `textDocument/diagnostics` - Errors/warnings

2. Add authentication (API key/token)

3. Add CORS support for remote access

4. Add request logging and error handling

5. Support multiple workspaces

## For Forge Team

To integrate this into Forge (Rust), you'll need to:

1. Add HTTP client (using `reqwest` crate)
2. Detect VS Code server:
```rust
async fn detect_vscode() -> Option<String> {
    let client = reqwest::Client::new();
    let response = client.get("http://localhost:3000/api/health").send().await.ok()?;
    if response.status().is_success() {
        Some("http://localhost:3000".to_string())
    } else {
        None
    }
}
```

3. Call the API:
```rust
async fn find_references(uri: &str, line: u32, character: u32) -> Vec<Reference> {
    let client = reqwest::Client::new();
    let response = client.post("http://localhost:3000/api/textDocument/references")
        .json(&json!({
            "uri": uri,
            "position": { "line": line, "character": character }
        }))
        .send()
        .await?;
    response.json().await?
}
```

