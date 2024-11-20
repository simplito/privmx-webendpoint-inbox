import * as Ecc from "./crypto/ecc";
import { CryptoService } from "./crypto/Crypto";
import { KeyBigK } from "./Types";

export class KeyUtils {
    
    static async prepareBigK(priv: Ecc.PrivateKey, pub: Ecc.PublicKey): Promise<KeyBigK> {
        const K = CryptoService.randomBytes(32);
        const encryptedK = await CryptoService.eciesEncrypt(priv, pub, K);
        const encodedK = encryptedK.toString("base64");
        return {raw: K, encrypted: encodedK};
    }
    
    static async prepareLoginSignature(priv: Ecc.PrivateKey, encryptedK: string) {
        const nonce = CryptoService.randomBytes(32).toString("base64");
        const timestamp = Date.now().toString();
        const signatureData = "login" + encryptedK + " " + nonce + " " + timestamp;
        const signature = await CryptoService.signToCompactSignatureWithHash(priv, Buffer.from(signatureData, "utf8"));
        return {nonce, timestamp, signature};
    }
    
    static async prepareEcdhexLoginSignature(priv: Ecc.PrivateKey) {
        const nonce = CryptoService.randomBytes(32).toString("base64");
        const timestamp = Date.now().toString();
        const signatureData = "ecdhexlogin " + nonce + " " + timestamp;
        const signature = await CryptoService.signToCompactSignatureWithHash(priv, Buffer.from(signatureData, "utf8"));
        return {nonce, timestamp, signature};
    }
}
