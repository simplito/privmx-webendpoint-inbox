import { SrpUtils } from "./SrpUtils";
import { Sender } from "./Sender";
import { ServerAgentValidator, GatewayProperties, SrpHandshakeResult } from "./Types";
import { CryptoService } from "./crypto/Crypto";

export class SrpService {
    
    async srpHandshake(sender: Sender, host: string, username: string, password: string, properties: GatewayProperties,
        agent: string, requestTimeout: number, ticketCount: number, serverAgentValidator: ServerAgentValidator, restorableSession: boolean) {
        
        const step1 = await sender.send({
            messagePriority: 2,
            timeout: requestTimeout,
            requestBuilder: async request => {
                await request.addSrpInitMessage(username, host, agent, properties);
            },
            onResponse: async reader => {
                const frame = await reader.readSrpInitFrame();
                if (serverAgentValidator) {
                    serverAgentValidator(frame.data.agent);
                }
                const step1 = await SrpUtils.prepareSrpLoginStep1(username, password, frame.data);
                return {...step1, sessionId: frame.data.sessionId};
            }
        });
        const sessionKey = restorableSession ? CryptoService.eccPrivRandom() : null;
        return sender.send({
            messagePriority: 2,
            timeout: requestTimeout,
            requestBuilder: async request => {
                const publicSessionKey = sessionKey ? sessionKey.getPublicKey() : null;
                await request.addSrpExchangeMessage(step1.A, step1.M1, step1.sessionId, 0, publicSessionKey);
                await request.addNewTicketsRequestMessage(ticketCount);
            },
            onResponse: async (reader, request) => {
                const frame = await reader.readSrpExchangeFrame();
                SrpUtils.verifyM2(step1.M2, frame.data.M2);
                const tickets = await reader.switchToPreMasterAndReadTickets(step1.K, request);
                const result: SrpHandshakeResult = {
                    tickets: tickets,
                    sessionId: step1.sessionId,
                    sessionKey: sessionKey,
                    mixed: step1.mixed,
                    additionalLoginStep: frame.data.additionalLoginStep
                };
                return result;
            }
        });
    }
}
