import { EcdheOptions, SrpOptions, KeyOptions, ProxyConnectionOptions, ConnectionOptionsFull, ConnectionInfo, Ticket, SessionRestoreOptionsEx, ApplicationCredentials } from "./Types";
import { CryptoService } from "./crypto/Crypto";
import { AdditionalLoginStepHandler } from "./AdditionalLoginStepHandler";
import { LoginService } from "./LoginService";
import { SenderFactory } from "./SenderFactory";
import { AuthorizedConnection } from "./AuthorizedConnection";
import { AppHandler } from "./AppHandler";
import { Channel } from "./BaseChannel";
import { RpcUtils } from "./RpcUtils";

export class ProxyConnectionManager {
    
    constructor(
        private loginService: LoginService,
        private senderFactory: SenderFactory,
        private additionalLoginStepHandler: AdditionalLoginStepHandler
    ) {
    }
    
    async createEcdheConnection(baseConnection: AuthorizedConnection, auth: EcdheOptions, options: ProxyConnectionOptions): Promise<AuthorizedConnection> {
        const fullOptions = this.fillOptions(baseConnection.getOptions(), options);
        const key = auth.key || CryptoService.eccPrivRandom();
        const channel = this.createChannel(baseConnection, fullOptions.host);
        const result = await this.loginService.ecdheLogin(channel, key, {
            agent: fullOptions.agent,
            requestTimeout: fullOptions.connectionRequestTimeout,
            ticketsCount: fullOptions.tickets.ticketsCount,
            serverAgentValidator: fullOptions.serverAgentValidator,
            appCredentials: fullOptions.appCredentials,
        });
        return this.createAuthorizedConnection(channel, fullOptions, {
            type: "ecdhe",
            key: key.getPublicKey()
        }, result.tickets);
    }
    
    async createSrpConnection(baseConnection: AuthorizedConnection, auth: SrpOptions, options: ProxyConnectionOptions): Promise<AuthorizedConnection> {
        const fullOptions = this.fillOptions(baseConnection.getOptions(), options);
        const channel = this.createChannel(baseConnection, fullOptions.host);
        const result = await this.loginService.srpLogin(channel, auth, {
            overEcdhe: fullOptions.overEcdhe,
            restorableSession: fullOptions.restorableSession,
            host: fullOptions.host,
            agent: fullOptions.agent,
            requestTimeout: fullOptions.connectionRequestTimeout,
            ticketsCount: fullOptions.tickets.ticketsCount,
            serverAgentValidator: fullOptions.serverAgentValidator,
            appCredentials: fullOptions.appCredentials,
        });
        if (result.additionalLoginStep) {
            await this.additionalLoginStepHandler.onAdditionalLoginStep(channel, fullOptions.appCredentials, fullOptions.host, fullOptions.connectionRequestTimeout,
                result.additionalLoginStep, result.tickets, auth.onAdditionalLoginStep);
        }
        return this.createAuthorizedConnection(channel, fullOptions, {
            type: "srp",
            sessionId: result.sessionId,
            sessionKey: result.sessionKey,
            username: auth.username,
            mixed: result.mixed,
            properties: auth.properties
        }, result.tickets);
    }
    
    async createKeyConnection(baseConnection: AuthorizedConnection, auth: KeyOptions, options: ProxyConnectionOptions): Promise<AuthorizedConnection> {
        const fullOptions = this.fillOptions(baseConnection.getOptions(), options);
        const channel = this.createChannel(baseConnection, fullOptions.host);
        const result = await this.loginService.keyLogin(channel, auth, {
            overEcdhe: fullOptions.overEcdhe,
            restorableSession: fullOptions.restorableSession,
            agent: fullOptions.agent,
            requestTimeout: fullOptions.connectionRequestTimeout,
            ticketsCount: fullOptions.tickets.ticketsCount,
            serverAgentValidator: fullOptions.serverAgentValidator,
            appCredentials: fullOptions.appCredentials,
        });
        if (result.additionalLoginStep) {
            await this.additionalLoginStepHandler.onAdditionalLoginStep(channel, fullOptions.appCredentials, fullOptions.host, fullOptions.connectionRequestTimeout,
                result.additionalLoginStep, result.tickets, auth.onAdditionalLoginStep);
        }
        return this.createAuthorizedConnection(channel, fullOptions, {
            type: "key",
            sessionId: result.sessionId,
            sessionKey: result.sessionKey,
            key: auth.key.getPublicKey(),
            username: result.username,
            properties: auth.properties
        }, result.tickets);
    }
    
    async createSessionConnection(baseConnection: AuthorizedConnection, auth: SessionRestoreOptionsEx, options: ProxyConnectionOptions) {
        const fullOptions = this.fillOptions(baseConnection.getOptions(), options);
        const channel = this.createChannel(baseConnection, fullOptions.host);
        const result = await this.loginService.sessionRestore(channel, auth, {
            overEcdhe: fullOptions.overEcdhe,
            agent: fullOptions.agent,
            requestTimeout: fullOptions.connectionRequestTimeout,
            ticketsCount: fullOptions.tickets.ticketsCount,
            serverAgentValidator: fullOptions.serverAgentValidator,
            appCredentials: fullOptions.appCredentials,
        });
        return this.createAuthorizedConnection(channel, fullOptions, {
            type: "session",
            sessionId: auth.sessionId,
            sessionKey: auth.sessionKey,
            username: auth.username,
            properties: auth.properties
        }, result.tickets);
    }
    
    async probe(baseConnection: AuthorizedConnection, host: string, appCredentials: ApplicationCredentials, timeout?: number) {
        const channel = this.createChannel(baseConnection, host);
        const sender = this.senderFactory.createPlainSender(channel, appCredentials);
        await AppHandler.sendApplicationFrame(sender, 2, timeout || 10000, 1, "ping", {});
    }
    
    // =========================
    
    private createChannel(baseConnection: AuthorizedConnection, host: string): Channel {
        return {
            send: (buffer: Buffer, messagePriority: number): Promise<Buffer> => {
                return baseConnection.call<Buffer>("proxy", {
                    destination: host,
                    encrypt: false,
                    data: buffer
                }, {
                    channelType: "ajax",
                    priority: messagePriority,
                    sendAlone: true
                });
            }
        };
    }
    
    private async createAuthorizedConnection(channel: Channel, options: ConnectionOptionsFull, info: ConnectionInfo, tickets: Ticket[]) {
        return AuthorizedConnection.create(this.senderFactory, this.loginService, channel, null, options, info, tickets);
    }
    
    private fillOptions(connectionOptions: ConnectionOptionsFull, options: ProxyConnectionOptions) {
        const res: ConnectionOptionsFull = {
            agent: "privmx-rpc",
            serverAgentValidator: null,
            ...connectionOptions,
            mainChannel: "ajax",
            websocket: false,
            notifications: false,
            overEcdhe: true,
            restorableSession: true,
            connectionRequestTimeout: 15000,
            ...options,
            tickets: {
                ticketsCount: 50,
                checkTickets: true,
                checkerEnabled: true,
                checkerInterval: 10000,
                minTicketsCount: 10,
                ttlThreshold: 60 * 1000,
                minTicketTTL: 5 * 1000,
                fetchTicketsTimeout: 10000,
                ...connectionOptions.tickets,
                ...(options.tickets ? options.tickets : {})
            },
            appHandler: {
                timeoutTimerValue: 500,
                defaultTimeout: 40000,
                defaultMessagePriority: 2,
                maxMessagesCount: 4,
                maxMessagesSize: 1024 * 1024,
                ...connectionOptions.appHandler,
                ...(options.appHandler ? options.appHandler : {})
            },
            websocketOptions: {
                connectTimeout: 5000,
                disconnectOnHeartBeatTimeout: true,
                heartBeatTimeout: 5000,
                pingTimeout: 5000,
                onHeartBeatCallback: () => {},
                ...(options.websocketOptions ? options.websocketOptions : {})
            }
        };
        if (!RpcUtils.isValidHostname(options.host)) {
            throw new Error("Invalid host");
        }
        if (res.mainChannel != "ajax") {
            throw new Error("Unsupported mainChannel value");
        }
        if (res.websocket || res.notifications) {
            throw new Error("Websocket in proxy connection is not supported");
        }
        return res;
    }
}
