# Testing Guide for LSP POC

## Quick Start

### 1. Run the Extension

1. Open this folder in VS Code
2. Press `F5` to launch the Extension Development Host
3. A new VS Code window will open with the extension running
4. You should see a notification: **"Forge LSP API running on port 3000"**

### 2. Open the Test File

In the Extension Development Host window:
1. Open the `test-sample.ts` file
2. Wait for TypeScript language server to activate (you should see IntelliSense working)

### 3. Test the API

Open a terminal in the **original** VS Code window (not the Extension Development Host) and run:

#### PowerShell:
```powershell
.\test-api.ps1
```

#### Git Bash:
```bash
chmod +x test-api.sh
./test-api.sh
```

#### Manual curl (PowerShell):
```powershell
# Health check
curl http://localhost:3000/api/health

# Find references (update the path to match your workspace)
$body = '{"uri":"file:///d:/Company/Company/Tailcall/vscode/lsp-poc/test-sample.ts","position":{"line":3,"character":9}}'
curl -X POST http://localhost:3000/api/textDocument/references -H "Content-Type: application/json" -Body $body
```

## Expected Results

### Health Check Response:
```json
{
  "status": "ok",
  "workspace": "d:\\Company\\Company\\Tailcall\\vscode\\lsp-poc",
  "timestamp": "2025-12-08T10:30:00.000Z"
}
```

### Find References Response:
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
    // ... more references (should find ~7 references total)
  ]
}
```

## Troubleshooting

### Port Already in Use
If you see "Port 3000 is already in use":
1. Change the port in settings: `Ctrl+,` → Search "lspPoc.port" → Change to 3001
2. Reload the Extension Development Host window

### No References Found
If the API returns empty references:
1. Make sure `test-sample.ts` is open in the Extension Development Host window
2. Wait for TypeScript to fully activate (check bottom-right status bar)
3. Try clicking on `greetUser` and pressing `F12` to verify language server works
4. Check the Extension Development Host console for errors

### Connection Refused
If curl fails to connect:
1. Check the Extension Development Host console for startup errors
2. Verify the notification appeared
3. Try accessing http://localhost:3000/api/health in a browser

## Demo Flow for Team Lead

1. **Show the setup:**
   - Open VS Code with this workspace
   - Show `package.json` - minimal dependencies (just Express)
   - Show `src/extension.ts` - ~120 lines of code

2. **Run the extension:**
   - Press `F5`
   - Show the notification "Forge LSP API running on port 3000"

3. **Test health endpoint:**
   ```powershell
   curl http://localhost:3000/api/health
   ```
   - Show it returns workspace info

4. **Test references endpoint:**
   - Open `test-sample.ts` in Extension Development Host
   - Show the `greetUser` function (line 4)
   - Run the PowerShell test script:
   ```powershell
   .\test-api.ps1
   ```
   - Show it finds all 7+ references to `greetUser`

5. **Explain the architecture:**
   - VS Code extension starts HTTP server
   - Server proxies to VS Code's language features
   - Works with ANY language that has a language server
   - Forge can connect via simple HTTP requests

6. **Show what Forge team needs to do:**
   - Open `README.md` → Scroll to "For Forge Team" section
   - Show the Rust example code
   - Explain: Just HTTP client + JSON parsing

## Next Steps After POC Approval

1. Add more LSP features:
   - `textDocument/definition`
   - `workspace/symbol`
   - `textDocument/hover`
   - `textDocument/diagnostics`

2. Add authentication (API key)

3. Add CORS for remote access

4. Move to actual forge-vscode repository

5. Coordinate with Forge team for Rust integration

