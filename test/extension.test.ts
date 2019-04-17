/*-----------------------------------------------------------------------------------------------
 *  Copyright (c) Red Hat, Inc. All rights reserved.
 *  Licensed under the EPL v2.0 License. See LICENSE file in the project root for license information.
 *-----------------------------------------------------------------------------------------------*/

// The module 'assert' provides assertion methods from node
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as chai from 'chai';
import * as sinonChai from 'sinon-chai';
import * as sinon from 'sinon';
import { Protocol } from 'rsp-client';
import * as server from '../src/server';
import { activate, deactivate } from '../src/extension';
import { CommandHandler } from '../src/extensionApi';
import { Stubs } from './stubs';

const expect = chai.expect;
chai.use(sinonChai);

// Defines a Mocha test suite to group tests of similar kind together
suite('Extension Tests', function() {
    let sandbox: sinon.SinonSandbox;
    let startStub;
    let stubs: Stubs;

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

        stubs = new Stubs(sandbox);

        startStub = sandbox.stub(server, 'start').resolves(serverdata);

        stubs.outgoing.getServerHandles.resolves([]);
        const capab: Protocol.ServerCapabilitiesResponse = {
          serverCapabilities: {
          },
          clientRegistrationStatus: undefined
        };
        stubs.outgoing.registerClientCapabilities.resolves(capab);
        stubs.incoming.onPromptString.resolves();
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
                'server.restart',
                'server.debug',
                'server.stop',
                'server.remove',
                'server.output',
                `server.addDeployment`,
                'server.removeDeployment',
                'server.publishFull',
                'server.createServer',
                'server.addLocation',
                'server.downloadRuntime',
                'server.infoServer'
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
      deactivate();

      expect(stubs.clientStub.shutdownServer).calledOnce;
    });
});
