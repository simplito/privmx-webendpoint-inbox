import { BaseChannel } from "./BaseChannel";
import * as RootLogger from "simplito-logger";
import * as WebSocket from "./ws/ws";
import { RpcUtils } from "./RpcUtils";
import { Deferred, DisconnectEvent, WebSocketOptions } from "./Types";
const Logger = RootLogger.get("privmx-rpc.WebsocketPrivmxChannel");

export class WebSocketChannel extends BaseChannel {
    
    private wsUrl: string;
    private pinger: NodeJS.Timer;
    private heartBeatChecker: NodeJS.Timer;
    private lastHeartBeat: number = 0;
    private webSocket: WebSocket;
    private callbacks: {[id: string]: {timeoutId: NodeJS.Timeout, deferred: Deferred<Buffer>}};
    private id: number;
    
    constructor(url: string, private options: WebSocketOptions, public notifyCallback?: (data: Buffer) => Promise<void>|void) {
        super();
        this.wsUrl = options.url || this.getWsUrl(url);
        this.callbacks = {};
        this.id = 1;
    }
    
    async send(data: Buffer, _messagePriority: number, timeout: number): Promise<Buffer> {
        if (!this.webSocket) {
            throw {type: "disconnected"};
        }
        const defer = RpcUtils.defer<Buffer>();
        const id = this.id++;
        if (Logger.getLevel() == Logger.DEBUG) {
            Logger.debug("Sending data: ", id, data.toString("hex"));
        }
        const idBuf = Buffer.alloc(4);
        idBuf.writeUInt32BE(id, 0);
        const fullData = RpcUtils.concat2Buffers(idBuf, data)
        this.webSocket.send(fullData);
        this.callbacks[id] = {
            timeoutId: setTimeout(() => {
                defer.reject({type: "timeout", value: timeout});
                delete this.callbacks[id];
            }, timeout),
            deferred: defer
        };
        return defer.promise;
    }
    
    private getWsUrl(url: string) {
        const u = new URL(url);
        u.protocol = this.getWsProtocol(u.protocol);
        return u.href;
    }
    
    private getWsProtocol(protocol: string) {
        if (protocol == "http:") {
            return "ws:";
        }
        if (protocol == "https:") {
            return "wss:";
        }
        throw new Error("Unsupported protocol " + protocol);
    }
    
    async connect() {
        if (this.webSocket) {
            return;
        }
        let connectDefer = RpcUtils.defer<void>();
        let connectionTimeoutId = setTimeout(() => {
            if (connectDefer) {
                const errorMessage = "WebsocketChannel connection timeout: " + this.options.connectTimeout;
                Logger.warn(errorMessage);
                connectDefer.reject({message: errorMessage});
                connectDefer = null;
                this.disconnectCore(errorMessage);
            }
        }, this.options.connectTimeout);
        this.webSocket = new WebSocket(this.wsUrl);
        this.webSocket.binaryType = "arraybuffer";
        this.webSocket.addEventListener("open", _event => {
            connectDefer.resolve();
            connectDefer = null;
            clearTimeout(connectionTimeoutId);
            this.lastHeartBeat = Date.now();
            this.setupHeartBeatChecker();
            this.setupPinger();
        });
        this.webSocket.addEventListener("message", event => {
            Logger.debug("increase lastHeartBeat after " + (Date.now() - this.lastHeartBeat) + " (message)");
            this.lastHeartBeat = Date.now();
            const buf = Buffer.from(event.data);
            const id = buf.readUInt32BE(0);
            const resData = buf.slice(4);
            if (Logger.getLevel() == Logger.DEBUG) {
                Logger.debug("Received: ", id, resData.toString("hex"));
            }
            if (id in this.callbacks) {
                this.callbacks[id].deferred.resolve(resData);
                clearTimeout(this.callbacks[id].timeoutId);
                delete this.callbacks[id];
            }
            else if (id == 0) {
                if (this.notifyCallback) {
                    (async () => {
                        try {
                            await this.notifyCallback(resData);
                        }
                        catch (e) {
                            Logger.error("WebsocketChannel error during call notify callback:", e);
                        }
                    })();
                }
                else {
                    Logger.warn("There is no notify callback");
                }
            }
            else {
                Logger.warn("There is no callback with id", id);
            }
        });
        this.webSocket.addEventListener("close", event => {
            const errorMessage = "WebsocketChannel closed: " + this.formatEvent(event);
            Logger.warn(errorMessage);
            if (connectDefer) {
                connectDefer.reject({message: errorMessage});
                connectDefer = null;
                clearTimeout(connectionTimeoutId);
            }
            this.disconnectCore("WebsocketChannel closed");
        });
        this.webSocket.addEventListener("error", event => {
            const errorMessage = "WebsocketChannel error: " + this.formatEvent(event);
            Logger.warn(errorMessage);
            if (connectDefer) {
                connectDefer.reject({message: errorMessage});
                connectDefer = null;
                clearTimeout(connectionTimeoutId);
            }
            this.disconnectCore(errorMessage);
        });
        return connectDefer.promise;
    }
    
    private setupHeartBeatChecker() {
        this.heartBeatChecker = setInterval(() => {
            const latency = Date.now() - this.lastHeartBeat;
            if (typeof(this.options.onHeartBeatCallback) === "function") {
                try {
                    this.options.onHeartBeatCallback({
                        type: "heartBeat",
                        latency: latency,
                        websocket: this
                    });
                }
                catch (e) {
                    Logger.error("WebsocketChannel error during call heartBeat callback:", e);
                }
            }
            if (this.options.disconnectOnHeartBeatTimeout && latency > this.options.heartBeatTimeout) {
                this.onWebsocketTimeout();
            }
        }, 1000);
    }
    
    private setupPinger() {
        if (typeof(this.webSocket.ping) == "function") {
            this.webSocket.addEventListener("pong", () => {
                Logger.debug("increase lastHeartBeat after " + (Date.now() - this.lastHeartBeat) + " (pong)");
                this.lastHeartBeat = Date.now();
            });
            this.pinger = setInterval(() => {
                if (!this.webSocket) {
                    return;
                }
                this.webSocket.ping();
            }, 1000);
        }
        else {
            const pingPacket = Buffer.from("ping", "utf8");
            const pongPacket = Buffer.from("pong", "utf8");
            this.pinger = setInterval(async () => {
                if (!this.webSocket) {
                    return;
                }
                const start = Date.now();
                try {
                    // lastHeartBeat will be increased when the response appears (inside on message callback)
                    const res = await this.send(pingPacket, 0, this.options.pingTimeout);
                    if (res.equals(pongPacket)) {
                        Logger.debug("ping-pong with latency=" + (Date.now() - start) + ")");
                    }
                }
                catch (e) {
                    Logger.warn("WebsocketChannel ping error (latency: " + (Date.now() - start) + ", heartBeat: " + (Date.now() - this.lastHeartBeat) + ")", e);
                }
            }, 1000);
        }
    }
    
    private formatEvent(e: any) {
        try {
            if (!e || typeof(e) != "object") {
                return e;
            }
            const copy = {...e};
            if (e.target instanceof WebSocket) {
                copy.target = "<WebSocket>";
            }
            if (e.error && e.message == e.error.message) {
                copy.error = "<Error>";
            }
            return e.constructor.name + " " + JSON.stringify(copy);
        }
        catch (e) {
            return "<UnserializableData>";
        }
    }
    
    private onWebsocketTimeout(): void {
        Logger.debug("On websocket timeout - disconnecting...")
        this.disconnectCore("Websocket timeout");
    }
    
    isConnected() {
        return !this.disconnected;
    }
    
    disconnect() {
        this.disconnectCore("Manual disconnect");
    }
    
    private disconnectCore(cause: any) {
        if (this.disconnected) {
            return;
        }
        this.disconnected = true;
        if (this.heartBeatChecker) {
            clearInterval(this.heartBeatChecker);
            this.heartBeatChecker = null
        }
        if (this.pinger) {
            clearInterval(this.pinger);
            this.pinger = null
        }
        if (this.webSocket) {
            this.webSocket.close();
            this.webSocket = null;
        }
        for (const requestId in this.callbacks) {
            this.callbacks[requestId].deferred.reject({type: "disconnected"});
            clearTimeout(this.callbacks[requestId].timeoutId);
        }
        this.callbacks = {};
        this.eventDispatcher.dispatchEvent<DisconnectEvent>({type: "disconnected", cause: cause});
    }
}
