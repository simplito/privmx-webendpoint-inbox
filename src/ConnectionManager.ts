import { AjaxChannel } from "./AjaxChannel";
import { CryptoService } from "./crypto/Crypto";
import { WebSocketChannel } from "./WebSocketChannel";
import { EcdheOptions, ConnectionOptions, SrpOptions, KeyOptions, ChannelType, ConnectionOptionsFull, ConnectionInfo, Ticket, SessionRestoreOptionsEx, WebSocketOptions, ApplicationCredentials, EcdhexOptions } from "./Types";
import { SenderFactory } from "./SenderFactory";
import { Channel } from "./BaseChannel";
import { LoginService } from "./LoginService";
import { AuthorizedConnection } from "./AuthorizedConnection";
import { AppHandler } from "./AppHandler";
import { AdditionalLoginStepHandler } from "./AdditionalLoginStepHandler";
import { PlainConnection } from "./PlainConnection";
import { SenderEx } from "./Sender";
import { RpcUtils } from "./RpcUtils";

export class ConnectionManager {
    
    constructor(
        private loginService: LoginService,
        private senderFactory: SenderFactory,
        private additionalLoginStepHandler: AdditionalLoginStepHandler
    ) {
    }
    
    async createEcdheConnection(auth: EcdheOptions, options: ConnectionOptions): Promise<AuthorizedConnection> {
        const fullOptions = this.fillOptions(options);
        const key = auth.key || CryptoService.eccPrivRandom();
        const channel = await this.createChannel(fullOptions.mainChannel, fullOptions.url, fullOptions.websocketOptions);
        const result = await this.loginService.ecdheLogin(channel, key, {
            agent: fullOptions.agent,
            requestTimeout: fullOptions.connectionRequestTimeout,
            ticketsCount: fullOptions.tickets.ticketsCount,
            serverAgentValidator: fullOptions.serverAgentValidator,
            appCredentials: fullOptions.appCredentials,
            solution: auth.solution,
        });
        return this.createAuthorizedConnection(channel, fullOptions, {
            type: "ecdhe",
            key: key.getPublicKey()
        }, result.tickets);
    }
    
    async createEcdhexConnection(auth: EcdhexOptions, options: ConnectionOptions): Promise<AuthorizedConnection> {
        const fullOptions = this.fillOptions(options);
        const channel = await this.createChannel(fullOptions.mainChannel, fullOptions.url, fullOptions.websocketOptions);
        const result = await this.loginService.ecdhexLogin(channel, auth.key, {
            agent: fullOptions.agent,
            requestTimeout: fullOptions.connectionRequestTimeout,
            ticketsCount: fullOptions.tickets.ticketsCount,
            serverAgentValidator: fullOptions.serverAgentValidator,
            appCredentials: fullOptions.appCredentials,
            plain: fullOptions.plain,
            solution: auth.solution,
        });
        return this.createAuthorizedConnection(channel, fullOptions, {
            type: "ecdhex",
            key: auth.key.getPublicKey(),
            host: result.host,
        }, result.tickets);
    }
    
    async createSrpConnection(auth: SrpOptions, options: ConnectionOptions): Promise<AuthorizedConnection> {
        const fullOptions = this.fillOptions(options);
        const channel = await this.createChannel(fullOptions.mainChannel, fullOptions.url, fullOptions.websocketOptions);
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
    
    async createKeyConnection(auth: KeyOptions, options: ConnectionOptions): Promise<AuthorizedConnection> {
        const fullOptions = this.fillOptions(options);
        const channel = await this.createChannel(fullOptions.mainChannel, fullOptions.url, fullOptions.websocketOptions);
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
    
    async createSessionConnection(auth: SessionRestoreOptionsEx, options: ConnectionOptions) {
        const fullOptions = this.fillOptions(options);
        const channel = await this.createChannel(fullOptions.mainChannel, fullOptions.url, fullOptions.websocketOptions);
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
    
    createPlainConnection(options: ConnectionOptions) {
        const fullOptions = this.fillOptions(options);
        const channel = new AjaxChannel(fullOptions.url);
        const sender = this.senderFactory.createPlainSender(channel, options.appCredentials);
        const senderEx: SenderEx = {
            send: options => sender.send(options),
            serializeApplicationMessage: msg => this.senderFactory.serializeApplicationMessage(msg)
        };
        return new PlainConnection(senderEx, fullOptions);
    }
    
    async probe(url: string, appCredentials: ApplicationCredentials, timeout?: number) {
        const channel = new AjaxChannel(url);
        const sender = this.senderFactory.createPlainSender(channel, appCredentials);
        await AppHandler.sendApplicationFrame(sender, 2, timeout || 10000, 1, "ping", {});
    }
    
    // =========================
    
    private async createChannel(channelType: ChannelType, url: string, options: WebSocketOptions): Promise<Channel> {
        if (channelType == "ajax") {
            return new AjaxChannel(url);
        }
        else if (channelType == "websocket") {
            const channel = new WebSocketChannel(url, options);
            await channel.connect();
            return channel;
        }
        throw new Error("Unsupported channel type " + channelType);
    }
    
    private async createAuthorizedConnection(channel: Channel, options: ConnectionOptionsFull, info: ConnectionInfo, tickets: Ticket[]) {
        const ajaxChannel = channel instanceof AjaxChannel ? channel : null;
        const webSocketChannel = channel instanceof WebSocketChannel ? channel : null;
        return AuthorizedConnection.create(this.senderFactory, this.loginService, ajaxChannel, webSocketChannel, options, info, tickets);
    }
    
    private fillOptions(options: ConnectionOptions) {
        const res: ConnectionOptionsFull = {
            agent: "privmx-rpc",
            mainChannel: "ajax",
            websocket: true,
            notifications: true,
            overEcdhe: true,
            restorableSession: true,
            serverAgentValidator: null,
            connectionRequestTimeout: 15000,
            plain: false,
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
                ...(options.tickets ? options.tickets : {})
            },
            appHandler: {
                timeoutTimerValue: 500,
                defaultTimeout: 40000,
                defaultMessagePriority: 2,
                maxMessagesCount: 4,
                maxMessagesSize: 1024 * 1024,
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
        if (res.mainChannel == "websocket" && !res.websocket) {
            throw new Error("Websocket cannot be main channel when it is disabled");
        }
        return res;
    }
}
