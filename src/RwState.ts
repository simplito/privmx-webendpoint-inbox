import { CryptoService } from "./crypto/Crypto";
import { CipherState, RWStates } from "./Types";
import { RpcUtils } from "./RpcUtils";

export class RwState {
    
    initialized: boolean;
    sequenceNumber: number = 0;
    key: any;
    macKey: any;
    
    constructor(key?: any, macKey?: any) {
        if (key && macKey) {
            this.initialized = true;
            this.key = key;
            this.macKey = macKey;
        }
        else {
            this.initialized = false;
        }
    }
    
    static async getRWStates(masterSecret: Buffer, clientRandom: Buffer, serverRandom: Buffer): Promise<RWStates> {
        const seed = RpcUtils.concat3Buffers(
            Buffer.from("key expansion"),
            serverRandom,
            clientRandom
        );
        const keyBlock = await CryptoService.prf_tls12(masterSecret, seed, 4 * 32);
        const clientMacKey = keyBlock.slice(0, 32);
        const serverMacKey = keyBlock.slice(32, 64);
        const clientKey = keyBlock.slice(64, 96);
        const serverKey = keyBlock.slice(96, 128);
        const result: RWStates = {
            readState: new RwState(serverKey, serverMacKey),
            writeState: new RwState(clientKey, clientMacKey)
        };
        return result;
    }
    
    static async fromPreMasterSecret(preMasterSecret: Buffer, clientRandom: Buffer, serverRandom: Buffer): Promise<CipherState> {
        const masterSecret = await CryptoService.prf_tls12(preMasterSecret, RpcUtils.concat3Buffers(Buffer.from("master secret"), clientRandom, serverRandom), 48);
        return {masterSecret, clientRandom, serverRandom, rwStates: await RwState.getRWStates(masterSecret, clientRandom, serverRandom)};
    }
}
