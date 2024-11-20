import { ECUtils } from "./ECUtils";
import { ec as EC } from "elliptic";
import { Sender } from "./Sender";
import * as Ecc from "./crypto/ecc";
import { SessionRestoreUtils } from "./SessionRestoreUtils";
import { ServerAgentValidator, SessionHandshakeResult } from "./Types";

export class SessionRestoreService {
    
    async sessionHandshake(sender: Sender, sessionId: string, key: Ecc.PrivateKey, requestTimeout: number, ticketCount: number, serverAgentValidator: ServerAgentValidator) {
        return sender.send({
            messagePriority: 2,
            timeout: requestTimeout,
            requestBuilder: async request => {
                const info = await SessionRestoreUtils.prepareSignature(key, sessionId);
                await request.addSessionRestoreHandshakeMessage(sessionId, key.getPublicKey(), info.nonce, info.timestamp, info.signature);
                await request.addNewTicketsRequestMessage(ticketCount);
            },
            onResponse: async (reader, request) => {
                const frame = await reader.readSessionHandshakeFrame();
                if (serverAgentValidator) {
                    serverAgentValidator(frame.data.agent);
                }
                const derived = this.deriveKey(key.key, frame.data.key);
                const tickets = await reader.switchToPreMasterAndReadTickets(derived, request);
                const result: SessionHandshakeResult = {
                    tickets: tickets
                };
                return result;
            }
        });
    }
    
    private deriveKey(priv: EC.KeyPair, pub: Buffer) {
        return ECUtils.deriveKey(priv, ECUtils.decodePublicKey(pub));
    }
}
