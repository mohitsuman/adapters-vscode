
// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import * as sinon from 'sinon';
import { RSPClient, Protocol } from 'rsp-client';
import * as server from '../src/server';
import { activate, deactivate } from '../src/extension';
import { CommandHandler } from '../src/extensionApi';

const expect = chai.expect;
chai.use(sinonChai);

// Defines a Mocha test suite to group tests of similar kind together
suite('Extension Tests', function() {
    let sandbox: sinon.SinonSandbox;
    let startStub;

    class DummyMemento implements vscode.Memento {
        get<T>(key: string): Promise<T|undefined> {
          return Promise.resolve(undefined);
        }

        update(key: string, value: any): Promise<void> {
          return Promise.resolve();
        }
    }

    const context: vscode.ExtensionContext = {
        extensionPath: 'path',
        storagePath: 'string',
        subscriptions: [],
        workspaceState: new DummyMemento(),
        globalState: new DummyMemento(),
        asAbsolutePath(relativePath: string): string {
            return '';
          }
    };

    const serverdata = {
        port: '27511',
        host: 'localhost',
        process: {
            stdout: {
                on: (event: string, callback: Function) => {
                    return callback('some output');
                }
            },
            stderr: {
                on: (event: string, callback: Function) => {
                    return callback('some error');
                }
            }
        }
    };

    setup(() => {
        sandbox = sinon.createSandbox();
        const capab: Protocol.ServerCapabilitiesResponse = {
            serverCapabilities: {
            },
            clientRegistrationStatus: undefined
        };

        startStub = sandbox.stub(server, 'start').resolves(serverdata);
        sandbox.stub(RSPClient.prototype, 'connect').resolves();
        sandbox.stub(RSPClient.prototype, 'getServerHandles').resolves([]);
        sandbox.stub(RSPClient.prototype, 'registerClientCapabilities').resolves(capab);
        sandbox.stub(RSPClient.prototype, 'onStringPrompt').resolves();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('redhat.vscode-server-connector'));
    });

    test('Server is started at extension activation time', async () => {
        sandbox.stub(CommandHandler.prototype, 'activate').resolves();
        const registerTreeDataProviderStub = sandbox.stub(vscode.window, 'registerTreeDataProvider');
        const result = await activate(context);
        expect(startStub).calledOnce;
        expect(result).deep.equals({serverInfo: serverdata});
        expect(registerTreeDataProviderStub).calledOnce;
    });

    test('should register all server commands', async () => {
        return await vscode.commands.getCommands(true).then(commands => {
            const SERVER_COMMANDS = [
                'server.start',
                'server.debug',
                'server.stop',
                'server.remove',
                'server.output',
                'server.createServer',
                'server.addLocation',
                'servers.downloadRuntime',
                'server.restart',
                `server.addDeployment`,
                `server.removeDeployment`,
                'server.publishFull'
            ];
            const foundServerCommands = commands.filter(value => {
                return SERVER_COMMANDS.indexOf(value) >= 0 || value.startsWith('server.');
            });
            const t1 = foundServerCommands.length;
            const t2 = SERVER_COMMANDS.length;
            assert.equal(t1, t2, 'Some server commands are not registered properly or a new command is not added to the test');
        });
    });

    test('server has been stopped on deactivation', () => {
        const shutdownServerStub = sandbox.stub(RSPClient.prototype, 'shutdownServer');
        deactivate();
        expect(shutdownServerStub).calledOnce;
    });
});
