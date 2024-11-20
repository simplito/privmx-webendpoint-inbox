import { RwState } from "./RwState";
import { FrameSerializer } from "./FrameSerializer";
import { Frame, ChangeCipherSpecFrame, HandshakeFrame, ApplicationFrame, ContentType, EcdheHandshakePacket, SrpInitPacket, SrpExchangePacket, KeyInitPacket, KeyExchangePacket, TicketsPacket, Ticket, SessionHandshakePacket, EcdhexHandshakePacket  } from "./Types";
import * as PSON from "pson";
import { AlertError } from "./AlertError";
import ByteBuffer = require("bytebuffer");
import { RpcRequest } from "./RpcRequest";
import { RpcUtils } from "./RpcUtils";

export class ResponseReaderFactory {
    
    constructor(
        private codec: PSON.StaticPair,
        private frameSerializer: FrameSerializer,) {
    }
    
    create(buffer: Buffer) {
        return new ResponseReader(this.codec, this.frameSerializer, buffer);
    }
}

export class ResponseReader {
    
    private readState: RwState;
    
    constructor(private codec: PSON.StaticPair, private frameSerializer: FrameSerializer, private buffer: Buffer) {
        this.readState = new RwState()
    }
    
    async readChangeCipherSpecFrame(readState: RwState) {
        const frame = await this.readFrame();
        if (frame.type != ContentType.CHANGE_CIPHER_SPEC) {
            throw new Error("Expected CHANGE_CIPHER_SPEC frame");
        }
        this.readState = readState;
    }
    
    readEcdheHandshakeFrame() {
        return this.readHandshakeFrame<EcdheHandshakePacket>("ecdhe");
    }
    
    readEcdhexHandshakeFrame() {
        return this.readHandshakeFrame<EcdhexHandshakePacket>("ecdhex");
    }
    
    readSessionHandshakeFrame() {
        return this.readHandshakeFrame<SessionHandshakePacket>("session");
    }
    
    readSrpInitFrame() {
        return this.readHandshakeFrame<SrpInitPacket>("srp_init");
    }
    
    readSrpExchangeFrame() {
        return this.readHandshakeFrame<SrpExchangePacket>("srp_exchange");
    }
    
    readKeyInitFrame() {
        return this.readHandshakeFrame<KeyInitPacket>("key_init");
    }
    
    readKeyExchangeFrame() {
        return this.readHandshakeFrame<KeyExchangePacket>("key_exchange");
    }
    
    readTicketResponseFrame() {
        return this.readHandshakeFrame<TicketsPacket>("ticket_response");
    }
    
    async readHandshakeFrame<T = any>(type: string): Promise<HandshakeFrame<T>> {
        const frame = await this.readFrame();
        if (frame.type != ContentType.HANDSHAKE || frame.data.type != type) {
            throw new Error("Expected " + type + " handshake frame");
        }
        return frame;
    }
    
    async readApplicationFrame<T = any>(): Promise<ApplicationFrame<T>> {
        const frame = await this.readFrame();
        if (frame.type != ContentType.APPLICATION_DATA) {
            throw new Error("Expected application frame, get " + frame.type);
        }
        return frame;
    }
    
    async readAndProcessApplicationFrame<T = any>(): Promise<T> {
        const frame = await this.readApplicationFrame<T>();
        if (frame.data.error) {
            throw frame.data.error;
        }
        return frame.data.result;
    }
    
    async readFrame(): Promise<Frame> {
        if (!this.hasFrame()) {
            throw new Error("End of response");
        }
        const headerInfo = await this.frameSerializer.parseHeader(this.buffer, this.readState);
        const packLength = headerInfo.headerLength + headerInfo.frameLength + headerInfo.macLength;
        if (this.buffer.length < packLength) {
            throw new Error("Frame is longer than buffer");
        }
        const pack = this.slice(packLength);
        if (this.readState.initialized) {
            this.readState.sequenceNumber += 1;
        }
        const frameType = headerInfo.frameContentType;
        const frameData = await this.frameSerializer.readFrameData(headerInfo, this.readState, pack);
        return this.decodeFrameData(frameType, frameData);
    }
    
    private decodeFrameData(frameType: ContentType, frameData: Buffer): Frame {
        if (frameType == ContentType.ALERT) {
            const alertMessage = frameData.toString();
            throw new AlertError(alertMessage);
        }
        if (frameType == ContentType.CHANGE_CIPHER_SPEC) {
            const frame: ChangeCipherSpecFrame = {
                type: ContentType.CHANGE_CIPHER_SPEC
            };
            return frame;
        }
        if (frameType == ContentType.HANDSHAKE) {
            const frame: HandshakeFrame = {
                type: ContentType.HANDSHAKE,
                data: this.codec.decode(frameData)
            };
            return frame;
        }
        if (frameType == ContentType.APPLICATION_DATA) {
            const frame: ApplicationFrame = {
                type: ContentType.APPLICATION_DATA,
                data: frameData.length > 0 ? this.clearBuffers(this.codec.decode(frameData)) : null
            };
            return frame;
        }
        throw new Error("Unsupported frame type " + frameType)
    }
    
    private slice(size: number) {
        const result = this.buffer.slice(0, size)
        this.buffer = this.buffer.slice(size, this.buffer.length);
        return result;
    }
    
    private clearBuffers(packet: any): any {
        for (const key in packet) {
            if (packet[key] instanceof ByteBuffer) {
                packet[key] = Buffer.from(packet[key].toArrayBuffer());
            }
        }
        return packet;
    }
    
    hasFrame() {
        return this.buffer.length > 0;
    }
    
    checkEof() {
        if (this.hasFrame()) {
            throw new Error("Response has unexpected frame");
        }
    }
    
    async switchToPreMasterAndReadTickets(key: Buffer, request: RpcRequest, plain?: boolean): Promise<Ticket[]> {
        const {masterSecret, rwStates} = await request.getPreMasterCipherState(key);
        if (!plain) {
            await this.readChangeCipherSpecFrame(rwStates.readState);
        }
        return this.readTicketsResponse(masterSecret);
    }
    
    async readTicketsResponse(masterSecret: Buffer): Promise<Ticket[]> {
        const ticketsFrame = await this.readTicketResponseFrame();
        return this.readTicketsPacket(ticketsFrame.data, masterSecret);
    }
    
    readTicketsPacket(ticketsPacket: TicketsPacket, masterSecret: Buffer): Ticket[] {
        const ttl = RpcUtils.getTTLDate(ticketsPacket);
        const tickets = ticketsPacket.tickets.map(x => {
            const ticket: Ticket = {
                id: RpcUtils.createBufferFromBytesLike(x),
                data: {
                    masterSecret: masterSecret
                },
                ttl: ttl
            };
            return ticket;
        });
        return tickets;
    }
}
