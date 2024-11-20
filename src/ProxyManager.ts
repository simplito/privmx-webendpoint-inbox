import { Deferred, ConnectionOptionsFull } from "./Types";
import { RpcUtils } from "./RpcUtils";
import { LoginService } from "./LoginService";
import { CryptoService } from "./crypto/Crypto";
import { SenderFactory } from "./SenderFactory";
import { Channel } from "./BaseChannel";

export class ProxyManager {
    
    private map: Map<string, Deferred<AuthorizedConnection>>;
    
    constructor(
        private loginService: LoginService,
        private senderFactory: SenderFactory,
        private options: ConnectionOptionsFull,
        private channelFactory: {create: (host: string) => Channel}
    ) {
        this.map = new Map();
    }
    
    async getProxyConnection(host: string): Promise<AuthorizedConnection> {
        if (this.map.has(host)) {
            return this.map.get(host).promise;
        }
        const defer = RpcUtils.defer();
        this.map.set(host, defer);
        (async () => {
            try {
                const options = this.getOptionsForHost(host);
                const channel = this.channelFactory.create(host);
                const key = CryptoService.eccPrivRandom();
                const result = await this.loginService.ecdheLogin(channel, key, {agent: options.agent, requestTimeout: options.connectionRequestTimeout, ticketsCount: options.tickets.ticketsCount, serverAgentValidator: options.serverAgentValidator, appCredentials: options.appCredentials});
                const connection = await AuthorizedConnection.create(this.senderFactory, this.loginService, channel, null, options, {type: "ecdhe", key: key.getPublicKey()}, result.tickets);
                connection.addEventListener("sessionLost", () => {
                    connection.destroy();
                    this.map.delete(host);
                });
                defer.resolve(connection);
            }
            catch (e) {
                defer.reject(e);
                this.map.delete(host);
            }
        })();
        return defer.promise;
    }
    
    private getOptionsForHost(host: string) {
        const opt: ConnectionOptionsFull = {
            ...this.options,
            url: "",
            host: host,
            websocket: false,
            mainChannel: "ajax",
            notifications: false
        };
        return opt;
    }
}

import { AuthorizedConnection } from "./AuthorizedConnection";