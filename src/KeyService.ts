import { KeyBigK, ServerAgentValidator, GatewayProperties, KeyHandshakeResult } from "./Types";
import { KeyUtils } from "./KeyUtils";
import * as Ecc from "./crypto/ecc";
import { CryptoService } from "./crypto/Crypto";
import { Sender } from "./Sender";

export class KeyService {
    
    async keyHandshake(sender: Sender, priv: Ecc.PrivateKey, properties: GatewayProperties, agent: string, requestTimeout: number, ticketCount: number,
        serverAgentValidator: ServerAgentValidator, restorableSession: boolean) {
        
        const step1 = await sender.send({
            messagePriority: 2,
            timeout: requestTimeout,
            requestBuilder: async request => {
                await request.addKeyInitMessage(priv.getPublicKey(), agent, properties);
            },
            onResponse: async reader => {
                const frame = await reader.readKeyInitFrame();
                if (serverAgentValidator) {
                    serverAgentValidator(frame.data.agent);
                }
                const K = await this.prepareBigKFromBase58Pub(priv, frame.data.pub);
                const signatureInfo = await KeyUtils.prepareLoginSignature(priv, K.encrypted);
                return {K, ...signatureInfo, sessionId: frame.data.sessionId, username: frame.data.I};
            }
        });
        const sessionKey = restorableSession ? CryptoService.eccPrivRandom() : null;
        return sender.send({
            messagePriority: 2,
            timeout: requestTimeout,
            requestBuilder: async request => {
                const publicSessionKey = sessionKey ? sessionKey.getPublicKey() : null;
                await request.addKeyExchangeMessage(step1.sessionId, step1.nonce, step1.timestamp, step1.K.encrypted,
                    step1.signature, 0, publicSessionKey);
                await request.addNewTicketsRequestMessage(ticketCount);
            },
            onResponse: async (reader, request) => {
                const frame = await reader.readKeyExchangeFrame();
                const tickets = await reader.switchToPreMasterAndReadTickets(step1.K.raw, request);
                const result: KeyHandshakeResult = {
                    username: step1.username,
                    tickets: tickets,
                    sessionId: step1.sessionId,
                    sessionKey: sessionKey,
                    additionalLoginStep: frame.data.additionalLoginStep
                };
                return result;
            }
        });
    }
    
    private async prepareBigKFromBase58Pub(priv: Ecc.PrivateKey, pub58: string): Promise<KeyBigK> {
        const pub = await Ecc.PublicKey.fromBase58DER(pub58);
        return KeyUtils.prepareBigK(priv, pub);
    }
}
