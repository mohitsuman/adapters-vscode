import {
    TreeDataProvider,
    Event,
    TreeItem,
    window,
    OpenDialogOptions,
    InputBoxOptions,
    EventEmitter,
    OutputChannel,
    workspace
} from 'vscode';
import { MessageConnection } from 'vscode-jsonrpc';
import { FindServerBeansRequest, CreateServerRequest, ServerAttributes, ServerHandle, ServerStateChange, ServerProcessOutput } from './protocol';

export class ServersViewTreeDataProvider implements TreeDataProvider<ServerHandle> {

    private _onDidChangeTreeData: EventEmitter<ServerHandle | undefined> = new EventEmitter<ServerHandle | undefined>();
    readonly onDidChangeTreeData: Event<ServerHandle | undefined> = this._onDidChangeTreeData.event;
    private connection: MessageConnection;
    private servers: ServerHandle[] = new Array<ServerHandle>();
    private serverStatus: Map<string, number> = new Map<string, number>();
    private serverOutputChannels: Map<string, OutputChannel> = new Map<string, OutputChannel>();
    private serverStatusEnum: Map<number, string> = new Map<number, string>();

    constructor(connection: MessageConnection) {
        this.connection = connection;
        this.serverStatusEnum.set(0, 'Unknown');
        this.serverStatusEnum.set(1, 'Starting');
        this.serverStatusEnum.set(2, 'Started');
        this.serverStatusEnum.set(3, 'Stopping');
        this.serverStatusEnum.set(4, 'Stopped');
    }

    insertServer(handle) {
        this.servers.push(handle);
        this.serverStatus.set(handle.id, 4);
        this.refresh();
    }

    updateServer(event: ServerStateChange) {
        this.servers.forEach(value => {
            if (value.id === event.server.id) {
                this.serverStatus.set(value.id, event.state);
                this.refresh(value);
                const channel: OutputChannel = this.serverOutputChannels.get(value.id);
                if (event.state === 1 && channel) {
                    channel.clear();
                }
            }
        });
    }

    removeServer(handle: ServerHandle): any {
        this.servers.forEach((value, index) => {
            if (value.id === handle.id) {
                this.servers.splice(index, 1);
                this.serverStatus.delete(handle.id);
                this.refresh();
                const channel: OutputChannel = this.serverOutputChannels.get(handle.id);
                this.serverOutputChannels.delete(handle.id);
                channel.clear();
                channel.dispose();
            }
        });
    }

    addServerOutput(output: ServerProcessOutput): any {
        let channel: OutputChannel = this.serverOutputChannels.get(output.server.id);
        if (channel === undefined) {
            channel = window.createOutputChannel(`Server: ${output.server.id}`);
            this.serverOutputChannels.set(output.server.id, channel);
        }
        channel.append(output.text);
        if (workspace.getConfiguration('vscodeAdapters').get<boolean>('showChannelOnServerOutput')) {
            channel.show();
        }
    }

    showOutput(server: ServerHandle): any {
        const channel: OutputChannel = this.serverOutputChannels.get(server.id);
        if (channel) {
            channel.show();
        }
    }

    refresh(data?): void {
        this._onDidChangeTreeData.fire(data);
    }

    addLocation(): any {
        window.showOpenDialog(<OpenDialogOptions>{
            canSelectFiles: false,
            canSelectMany: false,
            canSelectFolders: true,
            openLabel: 'Select server location'
        }).then(folders => {
            if (folders && folders.length === 1) {
                return this.connection.sendRequest(FindServerBeansRequest.type, { filepath: folders[0].fsPath });
            }
        }).then(serverBeans => {
            if (serverBeans && serverBeans.length > 0) {
                // Prompt for server name
                const options: InputBoxOptions = {
                    prompt: `Please provide the server name`,
                    placeHolder: `Server name`,
                    validateInput: (value: string) => {
                        if (!value || value.trim().length === 0) {
                            return 'Cannot set empty server name';
                        }
                        if (this.servers.some(server => server.id === value)) {
                            return 'Cannot set duplicate server name';
                        }
                        return null;
                    }
                };

                return window.showInputBox(options).then(value => {
                    return { name: value, bean: serverBeans[0] };
                });
            }
        }).then(data => {
            if (data && data.name) {
                const serverAttributes: ServerAttributes = {
                    id: data.name,
                    serverType: data.bean.serverAdapterTypeId,
                    attributes: {
                        'server.home.dir': data.bean.location
                    }
                };
                return this.connection.sendRequest(CreateServerRequest.type, serverAttributes);
            }
        }).then(status => {
            if (status) {
                console.log(status);
            }
        });
    }

    getTreeItem(server: ServerHandle): TreeItem | Thenable<TreeItem> {
        const status: number = this.serverStatus.get(server.id);
        const item: TreeItem = new TreeItem(`${server.id}:${server.type.visibleName}(${this.serverStatusEnum.get(status)})`);
        item.contextValue =  this.serverStatusEnum.get(status);
        return item;
    }

    getChildren(element?: ServerHandle | undefined): ServerHandle[] | Thenable<ServerHandle[] | null | undefined> | null | undefined {
        if (element === undefined) {
            return this.servers;
        }
    }
}