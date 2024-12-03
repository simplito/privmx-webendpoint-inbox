import { CryptoService } from "../crypto/Crypto";
import { PrivateKey, PublicKey } from "../crypto/ecc";
import { CryptoPrivmx } from "./CryptoPrivmx";

export interface DataWithSignature {
    signature: Buffer;
    data: Buffer;
}

export class DataInnerEncryptorV4 {
    static encode(data: Buffer): string {
        return data.toString("base64"); 
    }

    static decode(dataAsBase64: string): Buffer {
        return Buffer.from(dataAsBase64, "base64");
    }

    static async encrypt(data: Buffer, encryptionKey: Buffer) {
        return CryptoPrivmx.privmxEncrypt(CryptoPrivmx.privmxOptAesWithSignature(), data, encryptionKey);
    }

static async decrypt(privateData: Buffer, encryptionKey: Buffer) {
    return CryptoPrivmx.privmxDecrypt(true, privateData, encryptionKey);
}

static async signAndPackDataWithSignature(data: Buffer, authorPrivateKey: PrivateKey) {
    const dataWithSignature = await this.sign(data, authorPrivateKey);
    return this.packDataWithSignature(dataWithSignature);
}

static async verifyAndExtractData(signedData: Buffer, authorPublicKey: PublicKey) {
    const dataWithSignature = this.extractDataWithSignature(signedData);
    if (!this.verifySignature(dataWithSignature, authorPublicKey)) {
        throw new Error ("Invalid Data Signature");
    }
    return dataWithSignature.data;
}

static async sign(data: Buffer, authorPrivateKey: PrivateKey) {
    const signature = await CryptoService.signToCompactSignatureWithHash(authorPrivateKey, data);
    return {signature, data};
}

static packDataWithSignature(dataWithSignature: DataWithSignature) {
    const header = new Uint8Array([1, dataWithSignature.signature.length]);
    return Buffer.concat([header, dataWithSignature.signature, dataWithSignature.data]);
}

static extractDataWithSignature(signedData: Buffer): DataWithSignature {
    if (signedData.readUInt8(0) === 1) {
        const signatureLength = signedData.readUInt8(1);
        console.log("signatureLength", signatureLength);
        const signature = signedData.slice(2, 2 + signatureLength);
        const data = signedData.slice(2 + signatureLength);
        return {signature, data};
    }
    throw new Error("extractDataWithSignature: unsupported type");
}

static async verifySignature(dataWithSignature: DataWithSignature, authorPublicKey: PublicKey) {
    console.log(1, dataWithSignature, authorPublicKey);
    return authorPublicKey.verifyCompactSignatureWithHash(dataWithSignature.data, dataWithSignature.signature);
}
}