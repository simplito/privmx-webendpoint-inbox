import { Sender, SenderEx, SendOptions } from "./Sender";
import { AjaxChannel } from "./AjaxChannel";
import { CryptoService } from "./crypto/Crypto";
import * as PSON from "pson";
import { WebSocketChannel } from "./WebSocketChannel";
import { EventDispatcher } from "./EventDispatcher";
import { TicketsManager } from "./TicketsManager";
import { AppHandler } from "./AppHandler";
import { IdGenerator } from "./IdGenerator";
import { MessageSendOptionsEx, DisconnectEvent, NotificationEvent, NotificationData, SessionLostEvent, ConnectedEvent, ConnectionOptionsFull, ConnectionInfo, ChannelType, Ticket, Notification2Event } from "./Types";
import { SenderFactory } from "./SenderFactory";
import { AlertError } from "./AlertError";
import { ConnectionError } from "./ConnectionError";
import * as RootLogger from "simplito-logger";
import { EventBinder } from "./EventBinder";
import { RpcRequest } from "./RpcRequest";
import { Channel } from "./BaseChannel";
import { SessionLostError } from "./SessionLostError";
import { LoginService } from "./LoginService";
const Logger = RootLogger.get("privmx-rpc.Connection");

export class AuthorizedConnection {
    
    private eventDispatcher: EventDispatcher;
    private eventBinder: EventBinder;
    private ticketsManager: TicketsManager;
    private idGenerator: IdGenerator;
    private sender: SenderEx;
    private appHandler: AppHandler;
    private ticketsCheckerId: NodeJS.Timer;
    
    private destroyed: boolean;
    private channelsConnected: boolean;
    private sessionChecked: boolean;
    private sessionEstablished: boolean;
    
    private codec: PSON.StaticPair;
    private executions: {[name: string]: Promise<void>} = {};
    private proxyManager: ProxyManager;
    private webSocketNotificationKeysMap: {[wsChannelId: string]: Buffer} = {};
    
    private get mainChannel() {
        if (this.options.mainChannel == "ajax") {
            return this.ajaxChannel;
        }
        if (this.options.mainChannel == "websocket") {
            return this.webSocketChannel;
        }
        throw new Error("Unsupported main channel type " + this.options.mainChannel);
    }
    
    private constructor(
        private ajaxChannel: Channel,
        private webSocketChannel: WebSocketChannel,
        private senderFactory: SenderFactory,
        private loginService: LoginService,
        private options: ConnectionOptionsFull,
        private info: ConnectionInfo,
        tickets: Ticket[]
    ) {
        this.eventBinder = new EventBinder();
        this.eventDispatcher = new EventDispatcher();
        this.ticketsManager = new TicketsManager(tickets, this.options.tickets);
        this.idGenerator = new IdGenerator();
        this.codec = new PSON.StaticPair([]);
        this.sender = {
            send: async (options) => {
                this.checkState();
                await this.checkConnectionAndSessionAndRepairIfNeeded();
                const ticket = await this.popTicket();
                const sender = this.senderFactory.createTicketSender(this.getChannelByType(options.channelType), ticket, this.options.appCredentials, this.options.plain);
                return this.sendSafe(sender, options);
            },
            serializeApplicationMessage: msg => this.senderFactory.serializeApplicationMessage(msg)
        };
        this.proxyManager = new ProxyManager(this.loginService, this.senderFactory, this.options, {
            create: host => {
                return {
                    send: async (buffer, priority) => {
                        return this.call<Buffer>("proxy", {
                            destination: host,
                            encrypt: false,
                            data: buffer
                        }, {
                            channelType: "ajax",
                            priority: priority,
                            sendAlone: true
                        });
                    }
                };
            }
        });
        this.appHandler = new AppHandler(this.sender, this.idGenerator, this.options.appHandler);
        if (this.options.tickets.checkerEnabled) {
            this.ticketsCheckerId = setInterval(async () => {
                if (!this.isConnected()) {
                    return;
                }
                if (this.needNewTickets()) {
                    try {
                        Logger.info("Fetching new tickets from interval");
                        await this.fetchNewTickets();
                    }
                    catch (e) {
                        Logger.error("Error during fetching new tickets", e);
                    }
                }
            }, this.options.tickets.checkerInterval);
        }
    }
    
    static async create(senderFactory: SenderFactory, loginService: LoginService, channel: Channel, webSocketChannel: WebSocketChannel, options: ConnectionOptionsFull, info: ConnectionInfo, tickets: Ticket[]) {
        const ajaxChannel = channel || new AjaxChannel(options.url);
        if (options.websocket && webSocketChannel == null) {
            webSocketChannel = new WebSocketChannel(options.url, options.websocketOptions);
            await webSocketChannel.connect();
        }
        const conn = new AuthorizedConnection(ajaxChannel, webSocketChannel, senderFactory, loginService, options, info, tickets);
        if (options.websocket) {
            conn.eventBinder.with(webSocketChannel, x => x.addEventListener("disconnected", event => conn.onConnectionLost(event.cause)));
            if (options.notifications) {
                await conn.authorizeWebSocket();
            }
        }
        conn.channelsConnected = true;
        conn.sessionChecked = true;
        conn.sessionEstablished = true;
        return conn;
    }
    
    // ===================
    //     WEB SOCKET
    // ===================
    
    private async reconnectWebSocket() {
        this.clearWebSocket();
        const webSocketChannel = new WebSocketChannel(this.options.url, this.options.websocketOptions);
        try {
            await webSocketChannel.connect();
        }
        catch (e) {
            throw new ConnectionError(e);
        }
        await this.performPlainTestPing(webSocketChannel);
        if (!webSocketChannel.isConnected()) { // When disconnect occurs right after ping and before adding event listener
            throw new ConnectionError({type: "disconnected"});
        }
        this.webSocketChannel = webSocketChannel;
        this.eventBinder.with(webSocketChannel, x => x.addEventListener("disconnected", event => this.onConnectionLost(event.cause)));
    }
    
    private clearWebSocket() {
        if (this.webSocketChannel) {
            this.eventBinder.clearFor(this.webSocketChannel);
            this.webSocketChannel.notifyCallback = null;
            this.webSocketChannel.disconnect();
            this.webSocketChannel = null;
            this.webSocketNotificationKeysMap = {};
        }
    }
    
    private clearAjaxChannel() {
        if (this.ajaxChannel && this.ajaxChannel instanceof AjaxChannel) {
            this.ajaxChannel.stopAll();
        }
    }
    
    private async authorizeWebSocket() {
        const key = CryptoService.randomBytes(32);
        const ticket = this.popFirstTicketForHandshake();
        const sender = this.senderFactory.createTicketSender(this.webSocketChannel, ticket, this.options.appCredentials, this.options.plain);
        const res = await this.sendApplicationFrameAndFetchTicketsIfNeeded<{wsChannelId: string}>(sender, "authorizeWebSocket", {key: key.toString("base64"), addWsChannelId: true}, this.options.connectionRequestTimeout);
        this.webSocketNotificationKeysMap[res.wsChannelId] = key;
        this.webSocketChannel.notifyCallback = async cipher => {
            const wsChannelId = cipher.readUInt32BE(0);
            const key = this.webSocketNotificationKeysMap[wsChannelId];
            if (!key) {
                throw new Error("Unknown wsChannelId");
            }
            const msgData = cipher.slice(4);
            const data = await CryptoService.aes256CbcHmac256Decrypt(msgData, key);
            const notification = <NotificationData>this.codec.decode(data);
            this.eventDispatcher.dispatchEvent<NotificationEvent>({type: "notification", notificationType: notification.type, data: notification.data});
            this.eventDispatcher.dispatchEvent<Notification2Event>({type: "notification2", data: notification});
        };
    }
    
    // ===================
    //       UTILS
    // ===================
    
    private async sendApplicationFrame<T = any>(sender: Sender, method: string, params: any, timeout: number) {
        return this.sendSafe(sender, {
            messagePriority: 2,
            timeout: timeout || this.options.appHandler.defaultTimeout,
            requestBuilder: async request => {
                await this.addApplicationMessageToRequest(request, method, params);
            },
            onResponse: async reader => {
                return reader.readAndProcessApplicationFrame<T>();
            }
        });
    }
    
    private async sendApplicationFrameAndFetchTicketsIfNeeded<T>(sender: Sender, method: string, params: any, timeout: number) {
        if (this.needNewTickets()) {
            return this.sendSafe(sender, {
                messagePriority: 2,
                timeout: this.options.tickets.fetchTicketsTimeout,
                requestBuilder: async request => {
                    await request.addNewTicketsRequestMessage(this.options.tickets.ticketsCount);
                    await this.addApplicationMessageToRequest(request, method, params);
                },
                onResponse: async (reader, request) => {
                    const tickets = await reader.readTicketsResponse(request.getCipherState().masterSecret);
                    this.addTickets(tickets);
                    return reader.readAndProcessApplicationFrame<T>();
                }
            });
        }
        return this.sendApplicationFrame<T>(sender, method, params, timeout);
    }
    
    private async addApplicationMessageToRequest(request: RpcRequest, method: string, params: any) {
        return request.addApplicationMessage({
            id: this.idGenerator.generateNewId(),
            method: method,
            params: params
        });
    }
    
    private async sendSafe<T>(sender: Sender, options: SendOptions<T>) {
        try {
            return await sender.send(options);
        }
        catch (e) {
            if (e instanceof ConnectionError) {
                this.onConnectionLost(e.cause);
            }
            if (e instanceof AlertError && e.isError("Invalid ticket")) {
                this.onSessionLost("Invalid ticket");
                throw new SessionLostError("Invalid ticket");
            }
            throw e;
        }
    }
    
    private async singleExecution(name: string, func: () => Promise<void>) {
        if (this.executions[name]) {
            return this.executions[name];
        }
        return this.executions[name] = (async () => {
            try {
                await func();
            }
            finally {
                this.executions[name] = null;
            }
        })();
    }
    
    private getChannelByType(type: ChannelType) {
        if (type == "ajax") {
            return this.ajaxChannel;
        }
        if (type == "websocket") {
            return this.webSocketChannel;
        }
        throw new Error("Unsupported channel type " + type);
    }
    
    // ===================
    //       TICKETS
    // ===================
    
    private async popTicket(): Promise<Ticket> {
        while (this.needNewTickets()) {
            await this.fetchNewTickets();
        }
        return this.popFirstTicketForHandshake();
    }
    
    private async fetchNewTickets() {
        return this.singleExecution("fetchingTickets", async () => {
            const ticket = this.popFirstTicketForHandshake();
            const sender = this.senderFactory.createTicketSender(this.mainChannel, ticket, this.options.appCredentials, this.options.plain);
            const tickets = await this.fetchNewTicketsCore(sender);
            this.addTickets(tickets);
        });
    }
    
    private async fetchNewTicketsCore(sender: Sender) {
        return this.sendSafe(sender, {
            messagePriority: 2,
            timeout: this.options.tickets.fetchTicketsTimeout,
            requestBuilder: async request => {
                await request.addNewTicketsRequestMessage(this.options.tickets.ticketsCount);
            },
            onResponse: async (reader, request) => {
                return reader.readTicketsResponse(request.getCipherState().masterSecret);
            }
        });
    }
    
    private needNewTickets() {
        return this.options.tickets.checkTickets && this.ticketsManager.needNewTickets();
    }
    
    private checkTicketsPresent() {
        if (!this.ticketsManager.hasTickets()) {
            this.onSessionLost("No tickets");
            throw new SessionLostError("No tickets");
        }
    }
    
    private popFirstTicketForHandshake() {
        this.checkTicketsPresent();
        return this.ticketsManager.popFirstTicketForHandshake().ticket;
    }
    
    private addTickets(tickets: Ticket[]) {
        if (tickets.length > 0) {
            this.ticketsManager.addTickets(tickets);
            this.sessionEstablished = true;
        }
    }
    
    private onSessionLost(cause: any) {
        if (!this.sessionEstablished) {
            return;
        }
        this.channelsConnected = false;
        this.sessionChecked = false;
        this.sessionEstablished = false;
        this.ticketsManager.clear();
        this.clearWebSocket();
        this.eventDispatcher.dispatchEvent<SessionLostEvent>({type: "sessionLost", cause: cause});
    }
    
    // ===================
    //     PING TEST
    // ===================
    
    private async performPlainTestPing(channel: Channel) {
        return this.performTestPing(this.senderFactory.createPlainSender(channel, this.options.appCredentials), "plain");
    }
    
    private async performTicketTest(channel: Channel) {
        const ticket = this.popFirstTicketForHandshake();
        const sender = this.senderFactory.createTicketSender(channel, ticket, this.options.appCredentials, this.options.plain);
        if (this.needNewTickets()) {
            const tickets = await this.fetchNewTicketsCore(sender);
            this.addTickets(tickets);
        }
        else {
            await this.performTestPing(sender, "ticket");
        }
    }
    
    private async performTestPing(sender: Sender, pingType: string) {
        const result = await this.sendApplicationFrame(sender, "ping", {}, this.options.connectionRequestTimeout);
        if (result != "pong") {
            throw new Error("Recovery " + pingType + " + ping failed");
        }
    }
    
    // ===================
    //       STATE
    // ===================
    
    private checkState() {
        this.checkDestroyed();
        this.checkSessionEstablished();
    }
    
    private checkDestroyed() {
        if (this.destroyed) {
            throw new Error("Connection destroyed");
        }
    }
    
    private checkSessionEstablished() {
        if (!this.sessionEstablished) {
            throw new SessionLostError("Session lost");
        }
    }
    
    // ===================
    // CONNECTION STATUS
    // ===================
    
    private onConnectionLost(cause: any) {
        if (!this.channelsConnected) {
            return;
        }
        this.channelsConnected = false;
        this.sessionChecked = false;
        this.clearWebSocket();
        this.eventDispatcher.dispatchEvent<DisconnectEvent>({type: "disconnected", cause: cause});
    }
    
    private async checkConnectionAndSessionAndRepairIfNeeded() {
        await this.checkConnectionAndRepairIfNeeded();
        await this.checkSessionAndRepairIfNeeded();
    }
    
    private async checkConnectionAndRepairIfNeeded() {
        if (this.channelsConnected) {
            return;
        }
        return this.singleExecution("repairingConnection", async () => {
            if (this.options.websocket) {
                await this.reconnectWebSocket();
            }
            else {
                await this.performPlainTestPing(this.ajaxChannel);
            }
            this.channelsConnected = true;
        });
    }
    
    private async checkSessionAndRepairIfNeeded() {
        if (this.sessionChecked) {
            return;
        }
        return this.singleExecution("repairingSession", async () => {
            if (this.options.websocket) {
                if (this.options.notifications && this.webSocketChannel.notifyCallback == null) {
                    await this.authorizeWebSocket();
                }
                else {
                    await this.performTicketTest(this.webSocketChannel);
                }
            }
            else {
                await this.performTicketTest(this.ajaxChannel);
            }
            this.sessionChecked = true;
            this.eventDispatcher.dispatchEvent<ConnectedEvent>({type: "connected"});
        });
    }
    
    // ===================
    //      PUBLIC
    // ===================
    
    isConnected() {
        return !this.destroyed && this.channelsConnected && this.sessionChecked && this.sessionEstablished;
    }
    
    isSessionEstablished() {
        return this.sessionEstablished;
    }
    
    getInfo() {
        return this.info;
    }
    
    getHost() {
        return this.options.host;
    }
    
    getOptions() {
        return this.options;
    }
    
    async call<T = any>(method: string, params: any, options?: MessageSendOptionsEx): Promise<T> {
        this.checkState();
        const opts: MessageSendOptionsEx = {channelType: this.options.mainChannel, ...(options || {})};
        return this.appHandler.call(method, params, opts);
    }
    
    async proxy<T = any>(host: string, method: string, params: any, options?: MessageSendOptionsEx): Promise<T> {
        if (host == this.options.host) {
            return this.call(method, params, options);
        }
        this.checkState();
        const connection = await this.proxyManager.getProxyConnection(host);
        return connection.call(method, params, options);
    }
    
    async verifyConnection() {
        this.checkState();
        await this.checkConnectionAndSessionAndRepairIfNeeded();
    }
    
    destroy() {
        if (this.destroyed) {
            return;
        }
        this.destroyed = true;
        this.channelsConnected = false;
        this.sessionChecked = false;
        this.sessionEstablished = false;
        this.ticketsManager.clear();
        this.eventBinder.clear();
        this.eventDispatcher.clear();
        if (this.ticketsCheckerId) {
            clearInterval(this.ticketsCheckerId);
            this.ticketsCheckerId = null;
        }
        this.clearWebSocket();
        this.clearAjaxChannel();
        this.ajaxChannel = null;
    }
    
    addEventListener(type: "notification2", eventListener: (event: Notification2Event) => void): void
    addEventListener(type: "notification", eventListener: (event: NotificationEvent) => void): void
    addEventListener(type: "sessionLost", eventListener: (event: SessionLostEvent) => void): void
    addEventListener(type: "connected", eventListener: (event: ConnectedEvent) => void): void
    addEventListener(type: "disconnected", eventListener: (event: DisconnectEvent) => void): void
    addEventListener(type: string, eventListener: (event: any) => void): void {
        this.eventDispatcher.addEventListener(type, eventListener);
    }
    
    removeEventListener(type: "notification2", eventListener: (event: Notification2Event) => void): void
    removeEventListener(type: "notification", eventListener: (event: NotificationEvent) => void): void
    removeEventListener(type: "sessionLost", eventListener: (event: SessionLostEvent) => void): void
    removeEventListener(type: "connected", eventListener: (event: ConnectedEvent) => void): void
    removeEventListener(type: "disconnected", eventListener: (event: DisconnectEvent) => void): void
    removeEventListener(type: string, eventListener: (event: any) => void): void {
        this.eventDispatcher.removeEventListener(type, eventListener);
    }
}

import { ProxyManager } from "./ProxyManager";
