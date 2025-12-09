import * as vscode from 'vscode';
import express, { Request, Response } from 'express';
import { Server } from 'http';

let server: Server | undefined;

export function activate(context: vscode.ExtensionContext) {
    console.log('LSP POC extension is now active!');

    // Get port from configuration
    const config = vscode.workspace.getConfiguration('lspPoc');
    const port = config.get<number>('port', 3000);

    // Start HTTP server
    startServer(port);

    // Clean up on deactivation
    context.subscriptions.push({
        dispose: () => {
            if (server) {
                server.close();
                console.log('LSP API server stopped');
            }
        }
    });
}

function startServer(port: number) {
    const app = express();
    app.use(express.json());

    // Health check endpoint
    app.get('/api/health', (_req: Request, res: Response) => {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspace = workspaceFolders ? workspaceFolders[0].uri.fsPath : 'No workspace';

        res.json({
            status: 'ok',
            workspace: workspace,
            timestamp: new Date().toISOString()
        });
    });

    // Find references by symbol name
    app.post('/api/findReferences', async (req: Request, res: Response) => {
        try {
            const { symbolName } = req.body;

            if (!symbolName) {
                return res.status(400).json({
                    error: 'Missing required field: symbolName',
                    example: { symbolName: 'CustomeFormField' }
                });
            }

            // STEP 1: Find the symbol in the workspace
            const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
                'vscode.executeWorkspaceSymbolProvider',
                symbolName
            );

            if (!symbols || symbols.length === 0) {
                return res.status(404).json({
                    error: 'Symbol not found',
                    symbolName: symbolName,
                    message: `No symbol named "${symbolName}" found in the workspace`
                });
            }

            // Use the first matching symbol
            const symbol = symbols[0];

            // STEP 2: Get all references for this symbol
            const references = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeReferenceProvider',
                symbol.location.uri,
                symbol.location.range.start
            );

            if (!references || references.length === 0) {
                return res.json({
                    symbol: {
                        name: symbol.name,
                        kind: vscode.SymbolKind[symbol.kind],
                        uri: symbol.location.uri.toString(),
                        range: {
                            start: {
                                line: symbol.location.range.start.line,
                                character: symbol.location.range.start.character
                            },
                            end: {
                                line: symbol.location.range.end.line,
                                character: symbol.location.range.end.character
                            }
                        }
                    },
                    references: [],
                    message: 'Symbol found but no references'
                });
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

            res.json({
                symbol: {
                    name: symbol.name,
                    kind: vscode.SymbolKind[symbol.kind],
                    uri: symbol.location.uri.toString(),
                    range: {
                        start: {
                            line: symbol.location.range.start.line,
                            character: symbol.location.range.start.character
                        },
                        end: {
                            line: symbol.location.range.end.line,
                            character: symbol.location.range.end.character
                        }
                    }
                },
                references: referencesData,
                totalReferences: referencesData.length
            });

        } catch (error) {
            console.error('Error finding references by symbol:', error);
            res.status(500).json({
                error: 'Failed to find references',
                message: error instanceof Error ? error.message : String(error)
            });
        }
    });

    // Start server
    server = app.listen(port, () => {
        console.log(`LSP API server running on http://localhost:${port}`);
        vscode.window.showInformationMessage(
            `Forge LSP API running on port ${port}`
        );
    });

    // Handle server errors
    server?.on('error', (error: any) => {
        if (error.code === 'EADDRINUSE') {
            vscode.window.showErrorMessage(
                `Port ${port} is already in use. Please change the port in settings.`
            );
        } else {
            vscode.window.showErrorMessage(
                `Failed to start LSP API server: ${error.message}`
            );
        }
    });
}

export function deactivate() {
    if (server) {
        server.close();
    }
}

