import { RwState } from "./RwState";
import * as PSON from "pson";
import { FrameSerializer } from "./FrameSerializer";
import { MessagesBuffer } from "./MessagesBuffer";
import { ApplicationMessage, CipherState, ContentType, Ticket, GatewayProperties, ApplicationCredentials } from "./Types";
import { ec as EC } from "elliptic";
import { RpcUtils } from "./RpcUtils";
import * as Ecc from "./crypto/ecc";
import { CryptoService } from "./crypto/Crypto";

export class RpcRequest {
    
    private cipherState: CipherState;
    private messagesBuffer: MessagesBuffer;
    
    constructor(
        private priority: number,
        private timeout: number,
        private codec: PSON.StaticPair,
        private frameSerializer: FrameSerializer
    ) {
        this.cipherState = {
            masterSecret: null,
            clientRandom: Buffer.alloc(0),
            serverRandom: Buffer.alloc(0),
            rwStates: {
                readState: new RwState(),
                writeState: new RwState()
            }
        };
        this.messagesBuffer = new MessagesBuffer();
    }
    
    addChangeCipherSpecMessage() {
        return this.addMessage({}, ContentType.CHANGE_CIPHER_SPEC);
    }
    
    async addHelloMessage(appCredentials: ApplicationCredentials) {
        const msg = await this.createHelloMessage(appCredentials);
        return this.addMessage(msg, ContentType.HELLO);
    }
    
    private async createHelloMessage(appCredentials: ApplicationCredentials) {
        const salt = CryptoService.randomBytes(8).toString("hex");
        const base = `${appCredentials.id};${Date.now()};${salt}`;
        const toSign = `${base};${appCredentials.secret}`;
        const hash = await CryptoService.sha256(Buffer.from(toSign, "utf8"));
        const appAuth = `${base};${hash.toString("hex").substring(0, 32)}`;
        return appAuth;
    }
    
    addEcdheHandshakeMessage(key: EC.KeyPair, clientAgent: string, solution: string|undefined) {
        const msg = this.createEcdheHandshakeMessage(key, clientAgent, solution);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createEcdheHandshakeMessage(key: EC.KeyPair, clientAgent: string, solution: string|undefined) {
        const res: any = {
            type: "ecdhe",
            agent: clientAgent,
            key: Buffer.from(key.getPublic(true, "binary"))
        };
        if (solution) {
            res.solution = solution;
        }
        return res;
    }
    
    addEcdhexHandshakeMessage(key: EC.KeyPair, nonce: string, timestamp: string, signature: Buffer, clientAgent: string, solution: string|undefined, plain: boolean) {
        const msg = this.createEcdhexHandshakeMessage(key, nonce, timestamp, signature, clientAgent, solution, plain);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createEcdhexHandshakeMessage(key: EC.KeyPair, nonce: string, timestamp: string, signature: Buffer, clientAgent: string, solution: string|undefined, plain: boolean) {
        const res: any = {
            type: "ecdhex",
            agent: clientAgent,
            key: Buffer.from(key.getPublic(true, "binary")),
            nonce: nonce,
            timestamp: timestamp,
            signature: signature.toString("base64"),
            plain: plain,
        };
        if (solution) {
            res.solution = solution;
        }
        return res;
    }
    
    addSessionRestoreHandshakeMessage(sessionId: string, sessionKey: Ecc.PublicKey, nonce: string, timestamp: string, signature: Buffer) {
        const msg = this.createSessionRestoreHandshakeMessage(sessionId, sessionKey, nonce, timestamp, signature);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createSessionRestoreHandshakeMessage(sessionId: string, sessionKey: Ecc.PublicKey, nonce: string, timestamp: string, signature: Buffer) {
        return {
            type: "session",
            sessionId: sessionId,
            sessionKey: sessionKey.toBase58DER(),
            nonce: nonce,
            timestamp: timestamp,
            signature: signature.toString("base64")
        };
    }
    
    addSrpInitMessage(username: string, host: string, clientAgent: string, properties: GatewayProperties) {
        const msg = this.createSrpInitMessage(username, host, clientAgent, properties);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createSrpInitMessage(username: string, host: string, clientAgent: string, properties: GatewayProperties) {
        return {
            type: "srp_init",
            agent: clientAgent,
            I: username,
            host: host,
            properties: properties
        };
    }
    
    addSrpExchangeMessage(bigA: Buffer, bigM1: Buffer, sessionId: string, ticketsCount: number, sessionKey: Ecc.PublicKey) {
        const msg = this.createSrpExchangeMessage(bigA, bigM1, sessionId, ticketsCount, sessionKey);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createSrpExchangeMessage(bigA: Buffer, bigM1: Buffer, sessionId: string, ticketsCount: number, sessionKey: Ecc.PublicKey) {
        return {
            type: "srp_exchange",
            A: bigA.toString("hex"),
            M1: bigM1.toString("hex"),
            sessionId: sessionId,
            sessionKey: sessionKey ? sessionKey.toBase58DER() : null,
            tickets: ticketsCount
        };
    }
    
    addKeyInitMessage(pubKey: Ecc.PublicKey, clientAgent: string, properties: GatewayProperties) {
        const msg = this.createKeyInitMessage(pubKey, clientAgent, properties);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createKeyInitMessage(pubKey: Ecc.PublicKey, clientAgent: string, properties: GatewayProperties) {
        return {
            type: "key_init",
            agent: clientAgent,
            pub: pubKey.toBase58DER(),
            properties: properties
        };
    }
    
    addKeyExchangeMessage(sessionId: string, nonce: string, timestamp: string, K: string, signature: Buffer, ticketsCount: number, sessionKey: Ecc.PublicKey) {
        const msg = this.createKeyExchangeMessage(sessionId, nonce, timestamp, K, signature, ticketsCount, sessionKey);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createKeyExchangeMessage(sessionId: string, nonce: string, timestamp: string, K: string, signature: Buffer, ticketsCount: number, sessionKey: Ecc.PublicKey) {
        return {
            type: "key_exchange",
            sessionId: sessionId,
            sessionKey: sessionKey ? sessionKey.toBase58DER() : null,
            nonce: nonce,
            timestamp: timestamp,
            K: K,
            signature: signature.toString("base64"),
            tickets: ticketsCount
        };
    }
    
    addNewTicketsRequestMessage(ticketsCount: number) {
        const msg = this.createNewTicketsRequestMessage(ticketsCount);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createNewTicketsRequestMessage(ticketsCount: number) {
        return {
            type: "ticket_request",
            count: ticketsCount
        };
    }
    
    addTicketHandshakeMessage(ticket: Ticket, clientRandom: Buffer, plain: boolean) {
        const msg = this.createTicketHandshakeMessage(ticket, clientRandom, plain);
        return this.addMessage(msg, ContentType.HANDSHAKE);
    }
    
    private createTicketHandshakeMessage(ticket: Ticket, clientRandom: Buffer, plain: boolean) {
        return {
            type: "ticket",
            ticket_id: ticket.id,
            client_random: clientRandom,
            plain: plain
        };
    }
    
    addApplicationMessage(msg: ApplicationMessage) {
        return this.addMessage(msg, ContentType.APPLICATION_DATA);
    }
    
    addSerializedApplicationMessage(msg: Buffer) {
        return this.addSerializedMessage(msg, ContentType.APPLICATION_DATA);
    }
    
    private async addMessage(message: any, type: ContentType): Promise<void> {
        const serialized = this.serializeMessage(message);
        return this.addSerializedMessage(serialized, type);
    }
    
    private async addSerializedMessage(serialized: Buffer, type: ContentType): Promise<void> {
        const encoded = await this.buildFrame(serialized, type);
        this.messagesBuffer.addMessage(encoded);
    }
    
    serializeMessage(message: any): Buffer {
        return RpcUtils.createBufferFromBytesLike(this.codec.encode(message));
    }
    
    private async buildFrame(data: Buffer, contentType: ContentType): Promise<Buffer> {
        return this.frameSerializer.buildFrame(data, this.cipherState.rwStates.writeState, contentType);
    }
    
    getCipherState(): CipherState {
        return this.cipherState;
    }
    
    setCipherState(rwStates: CipherState): void {
        this.cipherState = rwStates;
    }
    
    getBuffer() {
        return this.messagesBuffer.getBuffer();
    }
    
    getPreMasterCipherState(preMasterSecret: Buffer): Promise<CipherState> {
        return RwState.fromPreMasterSecret(preMasterSecret, this.cipherState.clientRandom, this.cipherState.serverRandom);
    }
    
    getPriority(): number {
        return this.priority;
    }
    
    getTimeout(): number {
        return this.timeout;
    }
}
