import * as vscode from 'vscode';
import * as net from 'net';
import * as crypto from 'crypto';
import {
    createMessageConnection,
    StreamMessageReader,
    StreamMessageWriter
} from 'vscode-jsonrpc/node';

let pipeServer: net.Server | undefined;
let pipeName: string | undefined;

export function activate(context: vscode.ExtensionContext) {
    // Start Named Pipe server
    startNamedPipeServer();

    // Clean up on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (pipeServer) {
                pipeServer.close();
            }
        }
    });
}

function generatePipeName(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;

    if (workspaceFolders && workspaceFolders.length > 0) {
        // Generate workspace-specific pipe name
        // Normalize path: lowercase and use backslashes on Windows
        let workspacePath = workspaceFolders[0].uri.fsPath;

        // Normalize to lowercase for consistent hashing on Windows
        if (process.platform === 'win32') {
            workspacePath = workspacePath.toLowerCase();
        }

        const hash = crypto.createHash('md5').update(workspacePath).digest('hex').substring(0, 8);

        return process.platform === 'win32'
            ? `\\\\.\\pipe\\forge-lsp-${hash}`
            : `/tmp/forge-lsp-${hash}.sock`;
    } else {
        // Fallback to random pipe name
        const random = crypto.randomBytes(4).toString('hex');
        return process.platform === 'win32'
            ? `\\\\.\\pipe\\forge-lsp-${random}`
            : `/tmp/forge-lsp-${random}.sock`;
    }
}

function startNamedPipeServer() {
    pipeName = generatePipeName();

    pipeServer = net.createServer((socket) => {

        // Create JSON-RPC connection
        const connection = createMessageConnection(
            new StreamMessageReader(socket),
            new StreamMessageWriter(socket)
        );

        // Register JSON-RPC methods
        connection.onRequest('findReferences', async (params: { symbolName: string }) => {
            return await handleFindReferences(params.symbolName);
        });

        connection.onRequest('health', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const workspace = workspaceFolders ? workspaceFolders[0].uri.fsPath : 'No workspace';

            return {
                status: 'ok',
                workspace: workspace,
                pipeName: pipeName,
                timestamp: new Date().toISOString()
            };
        });

        // Start listening
        connection.listen();

        socket.on('close', () => {
            connection.dispose();
        });
    });

    pipeServer.listen(pipeName, () => {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || 'No workspace';
        console.log(`[Pipe] Named Pipe server listening on: ${pipeName}`);
        console.log(`[Pipe] Workspace: ${workspacePath}`);
        vscode.window.showInformationMessage(
            `Forge LSP API: ${pipeName?.split('\\').pop() || pipeName}`
        );
    });

    pipeServer.on('error', (error: any) => {
        vscode.window.showErrorMessage(
            `Failed to start Named Pipe server: ${error.message}`
        );
    });
}

async function handleFindReferences(symbolName: string): Promise<any> {
    if (!symbolName) {
        throw new Error('Missing required field: symbolName');
    }

    // STEP 1: Find the symbol location
    const symbolLocation = await findSymbolLocation(symbolName);

    if (!symbolLocation) {
        throw new Error(`No symbol named "${symbolName}" found in the workspace`);
    }

    // STEP 2: Get all references using VS Code's LSP
    const references = await vscode.commands.executeCommand<vscode.Location[]>(
        'vscode.executeReferenceProvider',
        symbolLocation.uri,
        symbolLocation.position
    );

    // STEP 3: Return the results
    return {
        symbol: {
            name: symbolName,
            uri: symbolLocation.uri.toString(),
            position: {
                line: symbolLocation.position.line,
                character: symbolLocation.position.character
            }
        },
        references: (references || []).map(loc => ({
            uri: loc.uri.toString(),
            range: {
                start: { line: loc.range.start.line, character: loc.range.start.character },
                end: { line: loc.range.end.line, character: loc.range.end.character }
            }
        })),
        totalReferences: references?.length || 0
    };
}

/**
 * Find the location of a symbol in the workspace
 * Tries workspace symbols first, then searches open documents
 */
async function findSymbolLocation(symbolName: string): Promise<{ uri: vscode.Uri; position: vscode.Position } | null> {
    // Try workspace symbols first (fast path for workspace-defined symbols)
    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeWorkspaceSymbolProvider',
        symbolName
    );

    const exactMatch = symbols?.find(s => s.name === symbolName);
    if (exactMatch) {
        return {
            uri: exactMatch.location.uri,
            position: exactMatch.location.range.start
        };
    }

    // Fallback: Search in open workspace documents only
    for (const document of vscode.workspace.textDocuments) {
        // Skip non-file schemes
        if (document.uri.scheme !== 'file') continue;

        // Only process files within workspace folders (automatically excludes node_modules, etc.)
        const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
        if (!workspaceFolder) continue;

        const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        const found = findSymbolInTree(documentSymbols || [], symbolName);
        if (found) {
            return { uri: document.uri, position: found.range.start };
        }

        // Search text for imports (only in workspace files)
        const text = document.getText();
        const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`);
        const match = regex.exec(text);

        if (match) {
            const position = document.positionAt(match.index);
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                document.uri,
                position
            );

            if (hovers && hovers.length > 0) {
                return { uri: document.uri, position };
            }
        }
    }

    return null;
}

/**
 * Recursively search for a symbol in a document symbol tree
 */
function findSymbolInTree(symbols: vscode.DocumentSymbol[], symbolName: string): vscode.DocumentSymbol | null {
    for (const symbol of symbols) {
        if (symbol.name === symbolName) {
            return symbol;
        }
        if (symbol.children && symbol.children.length > 0) {
            const found = findSymbolInTree(symbol.children, symbolName);
            if (found) {
                return found;
            }
        }
    }
    return null;
}

/**
 * Escape special regex characters
 */
function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function deactivate() {
    if (pipeServer) {
        pipeServer.close();
    }
}

