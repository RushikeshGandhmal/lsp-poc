# LSP POC - Forge API

A proof-of-concept VS Code extension that exposes LSP features via Named Pipes for Forge to consume.

## What This Does

This extension:
- Starts a Named Pipe server when VS Code activates
- Exposes VS Code's language server features via JSON-RPC over Named Pipes
- Allows external tools (like Forge CLI) to query code intelligence features
- Uses workspace-specific pipe names for multi-workspace support

## Features Implemented

### 1. Health Check
Returns workspace information and server status.

### 2. Find References
Finds all references to a symbol by name across the workspace.

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
3. You should see a notification with the pipe name (e.g., "Forge LSP API: forge-lsp-9d93fdde")

### 4. Test the API

Run the test client from the workspace directory:

```bash
node test-client-standalone.js <symbolName>
```

**Examples:**
```bash
# Find references to a symbol in your workspace
node test-client-standalone.js FormControl
node test-client-standalone.js MyComponent
node test-client-standalone.js useState
```

The test client will:
1. Generate the pipe name based on the current workspace
2. Connect to the VS Code extension via Named Pipe
3. Send a health check request
4. Send a find references request for the specified symbol
5. Display the results

## Architecture

```
┌─────────────────────────────────────┐
│      VS Code Extension              │
│  ┌───────────────────────────────┐  │
│  │  Named Pipe Server            │  │
│  │  \\.\pipe\forge-lsp-{hash}    │  │
│  └───────────────────────────────┘  │
│              ▲                       │
│              │ JSON-RPC              │
│              ▼                       │
│  ┌───────────────────────────────┐  │
│  │  VS Code Language Features    │  │
│  │  (TypeScript, Python, etc.)   │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
              ▲
              │ Named Pipe (IPC)
              │
┌─────────────┴───────────────────────┐
│         Forge CLI (Rust)             │
│  Connects to workspace-specific pipe │
└──────────────────────────────────────┘
```

## How It Works

### Workspace-Specific Pipe Names

Each workspace gets a unique pipe name based on its path:

1. **Extension generates pipe name:**
   - Takes workspace path: `D:\Projects\my-app`
   - Normalizes to lowercase (Windows): `d:\projects\my-app`
   - Generates MD5 hash: `a1b2c3d4...`
   - Creates pipe: `\\.\pipe\forge-lsp-a1b2c3d4`

2. **Forge CLI generates same pipe name:**
   - Detects current directory: `D:\Projects\my-app`
   - Normalizes to lowercase: `d:\projects\my-app`
   - Generates same MD5 hash: `a1b2c3d4...`
   - Connects to: `\\.\pipe\forge-lsp-a1b2c3d4`

3. **Communication:**
   - Both processes connect to the same pipe
   - JSON-RPC messages flow through the pipe
   - Multiple workspaces can run simultaneously without conflicts

## Next Steps for Full Implementation

1. Add more LSP features:
   - `textDocument/definition` - Go to definition
   - `workspace/symbol` - Find symbols
   - `textDocument/hover` - Hover information
   - `textDocument/diagnostics` - Errors/warnings
   - `textDocument/completion` - Code completion

2. Add error handling and validation

3. Add request logging (optional)

4. Performance optimization for large workspaces

## For Forge Team

To integrate this into Forge (Rust), you'll need to:

### 1. Add Named Pipe Client

Use a Rust crate for named pipes (e.g., `named-pipe` or `tokio-named-pipes`):

```rust
use std::env;
use md5;

fn generate_pipe_name() -> String {
    let workspace_path = env::current_dir()
        .unwrap()
        .to_string_lossy()
        .to_lowercase();

    let hash = format!("{:x}", md5::compute(workspace_path));
    let hash_short = &hash[..8];

    #[cfg(windows)]
    return format!(r"\\.\pipe\forge-lsp-{}", hash_short);

    #[cfg(unix)]
    return format!("/tmp/forge-lsp-{}.sock", hash_short);
}
```

### 2. Connect to Named Pipe

```rust
use std::io::{Read, Write};

fn connect_to_vscode() -> Result<NamedPipeClient> {
    let pipe_name = generate_pipe_name();
    let client = NamedPipeClient::connect(&pipe_name)?;
    Ok(client)
}
```

### 3. Send JSON-RPC Requests

```rust
use serde_json::json;

fn find_references(symbol_name: &str) -> Result<Vec<Reference>> {
    let mut client = connect_to_vscode()?;

    let request = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "findReferences",
        "params": {
            "symbolName": symbol_name
        }
    });

    let request_str = serde_json::to_string(&request)?;
    let message = format!(
        "Content-Length: {}\r\n\r\n{}",
        request_str.len(),
        request_str
    );

    client.write_all(message.as_bytes())?;

    // Read response (parse Content-Length header, then JSON)
    let response = read_jsonrpc_response(&mut client)?;

    Ok(response.result.references)
}
```

### 4. Example Usage in Forge CLI

```rust
// In your Forge CLI command
fn main() {
    let symbol_name = "MyComponent";

    match find_references(symbol_name) {
        Ok(refs) => {
            println!("Found {} references:", refs.len());
            for ref in refs {
                println!("  {}:{}:{}", ref.uri, ref.range.start.line, ref.range.start.character);
            }
        }
        Err(e) => {
            eprintln!("Error: {}", e);
            eprintln!("Make sure VS Code is open with the Forge LSP extension running.");
        }
    }
}
```

