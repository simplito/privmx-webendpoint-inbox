import { ec as EC } from "elliptic";
import * as BN from "bn.js";
import { RpcUtils } from "./RpcUtils";

export class ECUtils {
    
    static generateEcdheKey() {
        const ec = new EC("secp256k1")
        return ec.genKeyPair();
    }
    
    static decodePublicKey(publicKey: Buffer) {
        const ec = new EC("secp256k1")
        return ec.keyFromPublic(RpcUtils.createBufferFromBytesLike(publicKey));
    }
    
    static deriveKey(priv: EC.KeyPair, pub: EC.KeyPair) {
        const derived = priv.derive(pub.getPublic());
        return RpcUtils.fillTo32(ECUtils.convertBnToBuffer(derived));
    }
    
    static convertBnToBuffer(bn: BN) {
        return Buffer.from(bn.toString("hex", 2).trim(), "hex");
    }
}
