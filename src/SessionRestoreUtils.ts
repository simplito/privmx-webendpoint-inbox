import * as Ecc from "./crypto/ecc";
import { CryptoService } from "./crypto/Crypto";

export class SessionRestoreUtils {
    
    static async prepareSignature(priv: Ecc.PrivateKey, sessionId: string) {
        const nonce = CryptoService.randomBytes(32).toString("base64");
        const timestamp = Date.now().toString();
        const signatureData = "restore_" + sessionId + " " + nonce + " " + timestamp;
        const signature = await CryptoService.signToCompactSignatureWithHash(priv, Buffer.from(signatureData, "utf8"));
        return {nonce, timestamp, signature};
    }
}
