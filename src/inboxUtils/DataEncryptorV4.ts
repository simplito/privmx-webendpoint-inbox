import { PrivateKey, PublicKey } from "../crypto/ecc";
import { DataInnerEncryptorV4 } from "./DataInnerEncryptorV4";

export class DataEncryptorV4 {
    static async signAndEncode(data: Buffer, authorPrivateKey: PrivateKey) {
        const signedData = await DataInnerEncryptorV4.signAndPackDataWithSignature(data, authorPrivateKey);
        return DataInnerEncryptorV4.encode(signedData);
    }
    
    static async signAndEncryptAndEncode(data: Buffer, authorPrivateKey: PrivateKey, encryptionKey: Buffer) {
        const signedData = await DataInnerEncryptorV4.signAndPackDataWithSignature(data, authorPrivateKey);
        const encrypted = await DataInnerEncryptorV4.encrypt(signedData, encryptionKey);
        return DataInnerEncryptorV4.encode(encrypted);
    }
    
    static async decodeAndVerify(publicDataAsBase64: string, authorPublicKey: PublicKey) {
        const decoded = DataInnerEncryptorV4.decode(publicDataAsBase64);
        return DataInnerEncryptorV4.verifyAndExtractData(decoded, authorPublicKey);
    }
    
    static async decodeAndDecryptAndVerify(privateDataAsBase64: string, authorPublicKey: PublicKey, encryptionKey: Buffer) {
        const decoded = DataInnerEncryptorV4.decode(privateDataAsBase64);
        const decrypted = await DataInnerEncryptorV4.decrypt(decoded, encryptionKey);
        return DataInnerEncryptorV4.verifyAndExtractData(decrypted, authorPublicKey);
    }
}