import * as PSON from "pson";
import { FrameSerializer } from "./FrameSerializer";
import { RpcRequestBuilder } from "./RpcRequestBuilder";
import { ResponseReaderFactory } from "./ResponseReader";
import { ConnectionManager } from "./ConnectionManager";
import { EcdheService } from "./EcdheService";
import { SrpService } from "./SrpService";
import { KeyService } from "./KeyService";
import { SenderFactory } from "./SenderFactory";
import { LoginService } from "./LoginService";
import { AdditionalLoginStepHandler } from "./AdditionalLoginStepHandler";
import { ProxyConnectionManager } from "./ProxyConnectionManager";
import { SessionRestoreService } from "./SessionRestoreService";
import { Inbox } from "./Inbox";

export class IOC {
    
    private codec: PSON.StaticPair;
    private frameSerializer: FrameSerializer;
    private rpcRequestBuilder: RpcRequestBuilder;
    private responseReaderFactory: ResponseReaderFactory;
    private senderFactory: SenderFactory;
    private connectionManager: ConnectionManager;
    private loginService: LoginService;
    private additionalLoginStepHandler: AdditionalLoginStepHandler;
    private proxyConnectionManager: ProxyConnectionManager;
    private inbox: Inbox;
    
    getCodec(): PSON.StaticPair {
        if (this.codec == null) {
            this.codec = new PSON.StaticPair(["type", "ticket", "tickets", "ticket_id", "ticket_request", "ticket_response", "ecdhe", "ecdh", "key", "count", "client_random"]);
        }
        return this.codec;
    }
    
    getFrameSerializer(): FrameSerializer {
        if (this.frameSerializer == null) {
            this.frameSerializer = new FrameSerializer();
        }
        return this.frameSerializer;
    }
    
    getRpcRequestBuilder(): RpcRequestBuilder {
        if (this.rpcRequestBuilder == null) {
            this.rpcRequestBuilder = new RpcRequestBuilder(
                this.getCodec(),
                this.getFrameSerializer()
            );
        }
        return this.rpcRequestBuilder;
    }
    
    getResponseReaderFactory(): ResponseReaderFactory {
        if (this.responseReaderFactory == null) {
            this.responseReaderFactory = new ResponseReaderFactory(
                this.getCodec(),
                this.getFrameSerializer()
            );
        }
        return this.responseReaderFactory;
    }
    
    getSenderFactory(): SenderFactory {
        if (this.senderFactory == null) {
            this.senderFactory = new SenderFactory(
                this.getRpcRequestBuilder(),
                this.getResponseReaderFactory(),
            );
        }
        return this.senderFactory;
    }
    
    getAdditionalLoginStepHandler(): AdditionalLoginStepHandler {
        if (this.additionalLoginStepHandler == null) {
            this.additionalLoginStepHandler = new AdditionalLoginStepHandler(
                this.getSenderFactory()
            );
        }
        return this.additionalLoginStepHandler;
    }
    
    getConnectionManager(): ConnectionManager {
        if (this.connectionManager == null) {
            this.connectionManager = new ConnectionManager(
                this.getLoginService(),
                this.getSenderFactory(),
                this.getAdditionalLoginStepHandler()
            );
        }
        return this.connectionManager;
    }
    
    getProxyConnectionManager(): ProxyConnectionManager {
        if (this.proxyConnectionManager == null) {
            this.proxyConnectionManager = new ProxyConnectionManager(
                this.getLoginService(),
                this.getSenderFactory(),
                this.getAdditionalLoginStepHandler()
            );
        }
        return this.proxyConnectionManager;
    }
    
    getLoginService(): LoginService {
        if (this.loginService == null) {
            this.loginService = new LoginService(
                new EcdheService(),
                new SrpService(),
                new KeyService(),
                new SessionRestoreService(),
                this.getSenderFactory()
            );
        }
        return this.loginService;
    }
    
    getInbox() {
        if (this.inbox == null) {
            this.inbox = new Inbox(
                this.getConnectionManager(),
            );
        }
        return this.inbox;
    }
}
