import { ECUtils } from "./ECUtils";
import { ec as EC } from "elliptic";
import { Sender } from "./Sender";
import * as Ecc from "./crypto/ecc";
import { ServerAgentValidator, EcdheHandshakeResult, EcdhexHandshakeResult } from "./Types";
import { KeyUtils } from "./KeyUtils";

export class EcdheService {
    
    async ecdheHandshake(sender: Sender, key: Ecc.PrivateKey, agent: string, requestTimeout: number, ticketCount: number, serverAgentValidator: ServerAgentValidator, solution: string|undefined) {
        return sender.send({
            messagePriority: 2,
            timeout: requestTimeout,
            requestBuilder: async request => {
                await request.addEcdheHandshakeMessage(key.key, agent, solution);
                await request.addNewTicketsRequestMessage(ticketCount);
            },
            onResponse: async (reader, request) => {
                const frame = await reader.readEcdheHandshakeFrame();
                if (serverAgentValidator) {
                    serverAgentValidator(frame.data.agent);
                }
                const derived = this.deriveKey(key.key, frame.data.key);
                const tickets = await reader.switchToPreMasterAndReadTickets(derived, request);
                const result: EcdheHandshakeResult = {
                    tickets: tickets,
                    config: (frame.data as any).config
                };
                return result;
            }
        });
    }
    async ecdhexHandshake(sender: Sender, key: Ecc.PrivateKey, agent: string, requestTimeout: number, ticketCount: number, serverAgentValidator: ServerAgentValidator, solution: string|undefined, plain: boolean) {
        return sender.send({
            messagePriority: 2,
            timeout: requestTimeout,
            requestBuilder: async request => {
                const info = await KeyUtils.prepareEcdhexLoginSignature(key);
                await request.addEcdhexHandshakeMessage(key.key, info.nonce, info.timestamp, info.signature, agent, solution, plain);
                await request.addNewTicketsRequestMessage(ticketCount);
            },
            onResponse: async (reader, request) => {
                const frame = await reader.readEcdhexHandshakeFrame();
                if (serverAgentValidator) {
                    serverAgentValidator(frame.data.agent);
                }
                const derived = this.deriveKey(key.key, frame.data.key);
                const tickets = await reader.switchToPreMasterAndReadTickets(derived, request, plain);
                const result: EcdhexHandshakeResult = {
                    tickets: tickets,
                    host: frame.data.host,
                };
                return result;
            }
        });
    }
    
    private deriveKey(priv: EC.KeyPair, pub: Buffer) {
        return ECUtils.deriveKey(priv, ECUtils.decodePublicKey(pub));
    }
}
