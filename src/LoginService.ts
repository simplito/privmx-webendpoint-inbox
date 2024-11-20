import { EcdheService } from "./EcdheService";
import { SrpService } from "./SrpService";
import { KeyService } from "./KeyService";
import { SenderFactory } from "./SenderFactory";
import { Channel } from "./BaseChannel";
import { SrpOptions, KeyOptions, SessionRestoreOptions, ServerAgentValidator, EcdheHandshakeResult, SrpHandshakeResult, KeyHandshakeResult, SessionHandshakeResult, ApplicationCredentials, EcdhexHandshakeResult } from "./Types";
import * as Ecc from "./crypto/ecc";
import { CryptoService } from "./crypto/Crypto";
import { SessionRestoreService } from "./SessionRestoreService";

export class LoginService {
    
    constructor(
        private ecdheService: EcdheService,
        private srpService: SrpService,
        private keyService: KeyService,
        private sessionRestoreService: SessionRestoreService,
        private senderFactory: SenderFactory
    ) {
    }
    
    async ecdheLogin(channel: Channel, key: Ecc.PrivateKey, options: {agent: string, requestTimeout: number, ticketsCount: number, serverAgentValidator: ServerAgentValidator, appCredentials: ApplicationCredentials, solution?: string}): Promise<EcdheHandshakeResult> {
        const sender = this.senderFactory.createPlainSender(channel, options.appCredentials);
        return this.ecdheService.ecdheHandshake(sender, key, options.agent, options.requestTimeout, options.ticketsCount, options.serverAgentValidator, options.solution);
    }
    
    async ecdhexLogin(channel: Channel, key: Ecc.PrivateKey, options: {agent: string, requestTimeout: number, ticketsCount: number, serverAgentValidator: ServerAgentValidator, appCredentials: ApplicationCredentials, plain: boolean, solution?: string}): Promise<EcdhexHandshakeResult> {
        const sender = this.senderFactory.createPlainSender(channel, options.appCredentials);
        return this.ecdheService.ecdhexHandshake(sender, key, options.agent, options.requestTimeout, options.ticketsCount, options.serverAgentValidator, options.solution, options.plain);
    }
    
    async srpLogin(channel: Channel, auth: SrpOptions, options: {host: string, agent: string, requestTimeout: number, ticketsCount: number, restorableSession: boolean, overEcdhe: boolean, serverAgentValidator: ServerAgentValidator, appCredentials: ApplicationCredentials}): Promise<SrpHandshakeResult> {
        const sender = options.overEcdhe ? await this.createEcdheSender(channel, options.agent, options.requestTimeout, 2, options.serverAgentValidator, options.appCredentials) : this.senderFactory.createPlainSender(channel, options.appCredentials);
        return this.srpService.srpHandshake(sender, options.host, auth.username, auth.password, auth.properties, options.agent, options.requestTimeout, options.ticketsCount, options.serverAgentValidator, options.restorableSession);
    }
    
    async keyLogin(channel: Channel, auth: KeyOptions, options: {agent: string, requestTimeout: number, ticketsCount: number, restorableSession: boolean, overEcdhe: boolean, serverAgentValidator: ServerAgentValidator, appCredentials: ApplicationCredentials}): Promise<KeyHandshakeResult> {
        const sender = options.overEcdhe ? await this.createEcdheSender(channel, options.agent, options.requestTimeout, 2, options.serverAgentValidator, options.appCredentials) : this.senderFactory.createPlainSender(channel, options.appCredentials);
        return this.keyService.keyHandshake(sender, auth.key, auth.properties, options.agent, options.requestTimeout, options.ticketsCount, options.serverAgentValidator, options.restorableSession);
    }
    
    async sessionRestore(channel: Channel, auth: SessionRestoreOptions, options: {agent: string, requestTimeout: number, ticketsCount: number, overEcdhe: boolean, serverAgentValidator: ServerAgentValidator, appCredentials: ApplicationCredentials}): Promise<SessionHandshakeResult> {
        const sender = options.overEcdhe ? await this.createEcdheSender(channel, options.agent, options.requestTimeout, 1, options.serverAgentValidator, options.appCredentials) : this.senderFactory.createPlainSender(channel, options.appCredentials);
        return this.sessionRestoreService.sessionHandshake(sender, auth.sessionId, auth.sessionKey, options.requestTimeout, options.ticketsCount, options.serverAgentValidator);
    }
    
    private async createEcdheSender(channel: Channel, agent: string, requestTimeout: number, ticketsCount: number, serverAgentValidator: ServerAgentValidator, appCredentials: ApplicationCredentials) {
        const key = CryptoService.eccPrivRandom();
        const sender = this.senderFactory.createPlainSender(channel, appCredentials);
        const {tickets} = await this.ecdheService.ecdheHandshake(sender, key, agent, requestTimeout, ticketsCount, serverAgentValidator, undefined);
        return this.senderFactory.createTicketsSender(channel, tickets, appCredentials, false);
    }
}
