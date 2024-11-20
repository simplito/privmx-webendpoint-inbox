import { RpcRequest } from "./RpcRequest";
import { RpcUtils } from "./RpcUtils";
import * as RootLogger from "simplito-logger";
import { RwState } from "./RwState";
import { FrameSerializer } from "./FrameSerializer";
import * as PSON from "pson";
import { CipherState, Ticket, ApplicationMessage, ApplicationCredentials } from "./Types";
const Logger = RootLogger.get("privmx-rpc.TicketsManager");

export class RpcRequestBuilder {
    
    constructor(
        private codec: PSON.StaticPair,
        private frameSerializer: FrameSerializer,
    ) {
    }
    
    async createTicketHandshakeRequest(ticket: Ticket, appCredentials: ApplicationCredentials, priority: number, timeout: number, plain: boolean): Promise<RpcRequest> {
        const clientRandom = RpcUtils.generateClientRandom();
        
        if (Logger.getLevel() == Logger.DEBUG) {
            Logger.debug("ticketHandshake - clientRandom", clientRandom.toString("hex"));
            Logger.info("ticketHandshake with ticket: ", ticket.id.toString("hex"));
        }
        
        const state = await this.getCipherStateFromTicket(ticket, clientRandom);
        const request = await this.createPlainRpcRequest(appCredentials, priority, timeout);
        await request.addTicketHandshakeMessage(ticket, clientRandom, plain);
        if (!plain) {
            await request.addChangeCipherSpecMessage();
            request.setCipherState(state);
        }
        return request;
    }
    
    private async getCipherStateFromTicket(ticket: Ticket, clientRandom: Buffer): Promise<CipherState> {
        const {masterSecret, serverRandom} = this.unpackTicket(ticket);
        const rwStates = await RwState.getRWStates(masterSecret, clientRandom, serverRandom);
        return {masterSecret, clientRandom, serverRandom, rwStates};
    }
    
    private unpackTicket(ticket: Ticket) {
        return {
            masterSecret: ticket.data.masterSecret,
            serverRandom: ticket.id
        };
    }
    
    async createPlainRpcRequest(appCredentials: ApplicationCredentials, priority: number, timeout: number) {
        const request = new RpcRequest(priority, timeout, this.codec, this.frameSerializer);
        if (appCredentials) {
            await request.addHelloMessage(appCredentials);
        }
        return request;
    }
    
    serializeApplicationMessage(msg: ApplicationMessage): Buffer {
        return RpcUtils.createBufferFromBytesLike(this.codec.encode(msg));
    }
}
