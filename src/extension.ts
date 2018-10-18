'use strict';
import * as vscode from 'vscode';
import { ServersViewTreeDataProvider } from './serverExplorer';
import * as server from './server';
import { RSPClient } from 'rsp-client';
import { ExtensionAPI, CommandHandler } from './extensionApi';

let client;

export function activate(context: vscode.ExtensionContext): Promise<ExtensionAPI> {
    let serversData: ServersViewTreeDataProvider;
    let commandHandler: CommandHandler;

    return server.start().then(async serverInfo => {
        client = new RSPClient('localhost', serverInfo.port);
        const rspserverstdout = vscode.window.createOutputChannel('RSP Server (stdout)');
        const rspserverstderr = vscode.window.createOutputChannel('RSP Server (stderr)');

        serverInfo.process.stdout.on('data', data => {
            displayLog(rspserverstdout, data.toString());
        });

        serverInfo.process.stderr.on('data', data => {
            displayLog(rspserverstderr, data.toString());
        });

        serversData = new ServersViewTreeDataProvider(client);
        vscode.window.registerTreeDataProvider('servers', serversData);

        commandHandler = new CommandHandler(serversData, client);
        await commandHandler.activate();

        const subscriptions = [
            vscode.commands.registerCommand('server.start', context => executeCommand(commandHandler.startServer, commandHandler, 'run', context)),
            vscode.commands.registerCommand('server.debug', context => executeCommand(commandHandler.startServer, commandHandler, 'debug', context)),
            vscode.commands.registerCommand('server.stop', context => executeCommand(commandHandler.stopServer, commandHandler, context)),
            vscode.commands.registerCommand('server.remove', context => executeCommand(commandHandler.removeServer, commandHandler, context)),
            vscode.commands.registerCommand('server.output', context => executeCommand(commandHandler.showServerOutput, commandHandler, context)),
            vscode.commands.registerCommand('servers.addLocation', () => executeCommand(commandHandler.addLocation, commandHandler)),
            vscode.commands.registerCommand('server.restart', context => executeCommand(commandHandler.restartServer, commandHandler, context)),
            rspserverstdout,
            rspserverstderr
        ];

        subscriptions.forEach(element => {
            context.subscriptions.push(element);
        }, this);

        return { serverInfo };
    });
}

export function deactivate() {
    client.shutdownServer();
}

function displayLog(outputPanel: vscode.OutputChannel, message: string, show: boolean = true) {
    if (show) outputPanel.show();
    outputPanel.appendLine(message);
}

function executeCommand(command: (...args: any[]) => Promise<any>, thisArg: any, ...params: any[]) {
    return command.call(thisArg, ...params).catch(err => {
        vscode.window.showErrorMessage(err);
    });
}