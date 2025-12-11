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
    try {
        if (!symbolName) {
            throw new Error('Missing required field: symbolName');
        }

        // STEP 1: Try to find the symbol in the workspace first
        const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeWorkspaceSymbolProvider',
            symbolName
        );

        let symbolLocation: { uri: vscode.Uri; position: vscode.Position } | null = null;

        // Find exact match only (strict case-sensitive matching)
        if (symbols && symbols.length > 0) {
            const symbol = symbols.find(s => s.name === symbolName);
            if (symbol) {
                symbolLocation = {
                    uri: symbol.location.uri,
                    position: symbol.location.range.start
                };
            }
        }

        // STEP 2: If not found in workspace, search in all text documents (including imports from node_modules)
        if (!symbolLocation) {
            symbolLocation = await findSymbolInDocuments(symbolName);
        }

        if (!symbolLocation) {
            throw new Error(`No symbol named "${symbolName}" found in the workspace or open documents`);
        }

        // STEP 3: Get all references for this symbol
        const references = await vscode.commands.executeCommand<vscode.Location[]>(
            'vscode.executeReferenceProvider',
            symbolLocation.uri,
            symbolLocation.position
        );

        if (!references || references.length === 0) {
            return {
                symbol: {
                    name: symbolName,
                    uri: symbolLocation.uri.toString(),
                    position: {
                        line: symbolLocation.position.line,
                        character: symbolLocation.position.character
                    }
                },
                references: [],
                message: 'Symbol found but no references'
            };
        }

        // Convert locations to JSON-serializable format
        const referencesData = references.map(loc => ({
            uri: loc.uri.toString(),
            range: {
                start: {
                    line: loc.range.start.line,
                    character: loc.range.start.character
                },
                end: {
                    line: loc.range.end.line,
                    character: loc.range.end.character
                }
            }
        }));

        return {
            symbol: {
                name: symbolName,
                uri: symbolLocation.uri.toString(),
                position: {
                    line: symbolLocation.position.line,
                    character: symbolLocation.position.character
                }
            },
            references: referencesData,
            totalReferences: referencesData.length
        };

    } catch (error) {
        throw error;
    }
}

/**
 * Search for a symbol in all text documents (including imports from node_modules)
 */
async function findSymbolInDocuments(symbolName: string): Promise<{ uri: vscode.Uri; position: vscode.Position } | null> {
    // Get all text documents (including visible and recently opened)
    const documents = vscode.workspace.textDocuments;

    for (const document of documents) {
        // Skip non-file schemes (like output, debug console, etc.)
        if (document.uri.scheme !== 'file') {
            continue;
        }

        // Get all symbols in this document
        const documentSymbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        );

        if (documentSymbols) {
            const found = findSymbolInTree(documentSymbols, symbolName);
            if (found) {
                return {
                    uri: document.uri,
                    position: found.range.start
                };
            }
        }

        // Also search in the text directly (for imports and other references)
        const text = document.getText();
        const regex = new RegExp(`\\b${escapeRegExp(symbolName)}\\b`, 'g');
        let match;

        while ((match = regex.exec(text)) !== null) {
            const position = document.positionAt(match.index);

            // Verify this is actually the symbol we're looking for by checking hover info
            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                document.uri,
                position
            );

            if (hovers && hovers.length > 0) {
                // Found a valid symbol at this position
                return {
                    uri: document.uri,
                    position: position
                };
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

