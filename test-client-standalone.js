#!/usr/bin/env node

/**
 * Standalone Test Client for Named Pipe JSON-RPC Communication
 * This works in ANY workspace without requiring vscode-jsonrpc dependency
 * Just copy this file to any project and run: node test-client-standalone.js
 */

const net = require('net');
const crypto = require('crypto');

// Simple JSON-RPC message handler (no dependencies!)
class SimpleJsonRpcClient {
    constructor(socket) {
        this.socket = socket;
        this.messageId = 0;
        this.pendingRequests = new Map();
        this.buffer = '';

        socket.on('data', (data) => {
            this.buffer += data.toString();
            this.processBuffer();
        });
    }

    processBuffer() {
        while (true) {
            const headerEnd = this.buffer.indexOf('\r\n\r\n');
            if (headerEnd === -1) break;

            const headers = this.buffer.substring(0, headerEnd);
            const contentLengthMatch = headers.match(/Content-Length: (\d+)/i);

            if (!contentLengthMatch) {
                this.buffer = this.buffer.substring(headerEnd + 4);
                continue;
            }

            const contentLength = parseInt(contentLengthMatch[1]);
            const messageStart = headerEnd + 4;
            const messageEnd = messageStart + contentLength;

            if (this.buffer.length < messageEnd) break;

            const messageStr = this.buffer.substring(messageStart, messageEnd);
            this.buffer = this.buffer.substring(messageEnd);

            try {
                const message = JSON.parse(messageStr);
                if (message.id && this.pendingRequests.has(message.id)) {
                    const { resolve, reject } = this.pendingRequests.get(message.id);
                    this.pendingRequests.delete(message.id);

                    if (message.error) {
                        reject(new Error(message.error.message || JSON.stringify(message.error)));
                    } else {
                        resolve(message.result);
                    }
                }
            } catch (error) {
                console.error('Failed to parse message:', error);
            }
        }
    }

    sendRequest(method, params) {
        return new Promise((resolve, reject) => {
            const id = ++this.messageId;
            const request = {
                jsonrpc: '2.0',
                id: id,
                method: method,
                params: params
            };

            const content = JSON.stringify(request);
            const header = `Content-Length: ${Buffer.byteLength(content)}\r\n\r\n`;
            const message = header + content;

            this.pendingRequests.set(id, { resolve, reject });
            this.socket.write(message);

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.pendingRequests.has(id)) {
                    this.pendingRequests.delete(id);
                    reject(new Error('Request timeout'));
                }
            }, 10000);
        });
    }

    dispose() {
        this.socket.end();
    }
}

// Generate pipe name based on current workspace
function generatePipeName() {
    let workspacePath = process.cwd();

    // Normalize to lowercase for consistent hashing on Windows
    if (process.platform === 'win32') {
        workspacePath = workspacePath.toLowerCase();
    }

    const hash = crypto.createHash('md5').update(workspacePath).digest('hex').substring(0, 8);

    return process.platform === 'win32'
        ? `\\\\.\\pipe\\forge-lsp-${hash}`
        : `/tmp/forge-lsp-${hash}.sock`;
}

async function testConnection() {
    const pipeName = generatePipeName();

    console.log('\n🔍 Forge LSP Client - Standalone Test Script');
    console.log('=============================================\n');
    console.log(`📂 Workspace: ${process.cwd()}`);
    console.log(`🔌 Connecting to: ${pipeName}\n`);

    try {
        // Connect to named pipe
        const socket = net.connect(pipeName);

        await new Promise((resolve, reject) => {
            socket.on('connect', () => {
                console.log('✅ Connected to VS Code extension!\n');
                resolve();
            });

            socket.on('error', (error) => {
                reject(error);
            });
        });

        // Create JSON-RPC client
        const client = new SimpleJsonRpcClient(socket);

        // Test 1: Health Check
        console.log('📋 Test 1: Health Check');
        console.log('─────────────────────────');
        const healthResult = await client.sendRequest('health', {});
        console.log('Response:', JSON.stringify(healthResult, null, 2));
        console.log('✅ Health check passed!\n');

        // Get symbol name from command line or use default
        const symbolName = process.argv[2] || 'CustomeFormField';

        // Test 2: Find References
        console.log(`📋 Test 2: Find References - ${symbolName}`);
        console.log('─────────────────────────────────────────────');
        try {
            const refsResult = await client.sendRequest('findReferences', {
                symbolName: symbolName
            });

            // Write JSON to file
            const fs = require('fs');
            const outputFile = `references-${symbolName}.json`;
            fs.writeFileSync(outputFile, JSON.stringify(refsResult, null, 2));

            console.log('Symbol:', refsResult.symbol.name);
            console.log('Kind:', refsResult.symbol.kind || 'undefined');
            console.log('Total References:', refsResult.totalReferences);
            console.log('\nReferences:');
            refsResult.references.forEach((ref, index) => {
                const uri = ref.uri.replace('file:///', '');
                console.log(`  ${index + 1}. ${uri}:${ref.range.start.line}:${ref.range.start.character}`);
            });
            console.log(`\n📄 Full JSON saved to: ${outputFile}`);
            console.log('✅ Find references passed!\n');
        } catch (error) {
            console.error('❌ Error:', error.message);
        }

        console.log('🎉 Tests completed!');
        console.log('=============================================\n');

        // Close connection
        client.dispose();

    } catch (error) {
        console.error('❌ Connection error:', error.message);
        console.error('\n💡 Make sure VS Code extension is running!');
        console.error('   Press F5 in VS Code to start the Extension Development Host\n');
        process.exit(1);
    }
}

// Run tests
testConnection().catch(console.error);

