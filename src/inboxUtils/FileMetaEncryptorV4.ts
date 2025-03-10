import { PrivateKey } from "../crypto/ecc"
import { DataEncryptorV4 } from "./DataEncryptorV4";
import { FileMetaToEncrypt } from "./ServerTypes"

export interface EncryptedFileMetaV4 {
    version: number;
    publicMeta: string; // base64 from dataEncryptor.signAndEncode
    publicMetaObject: Buffer;
    privateMeta: string; // base64 from dataEncryptor.signAndEncryptAndEncode
    fileSize: string;
    internalMeta: string; // base64 from dataEncryptor.signAndEncryptAndEncode
    authorPubKey: string;
}

export class FileMetaEncryptorV4 {
    static async encrypt(fileMeta: FileMetaToEncrypt, authorPrivateKey: PrivateKey, encryptionKey: Buffer): Promise<EncryptedFileMetaV4> {
        let publicMetaObject: any = null;
        try {
            publicMetaObject = JSON.parse(
                // new TextDecoder().decode(fileMeta.publicMeta)
                fileMeta.publicMeta.toString()
            );
        } catch (_e) {}
        const result: EncryptedFileMetaV4 = {
            version: 4,
            publicMeta: await DataEncryptorV4.signAndEncode(fileMeta.publicMeta, authorPrivateKey),
            publicMetaObject: publicMetaObject,
            privateMeta: await DataEncryptorV4.signAndEncryptAndEncode(fileMeta.privateMeta, authorPrivateKey, encryptionKey),
            fileSize: await DataEncryptorV4.signAndEncryptAndEncode(this.serializeNumber(fileMeta.fileSize), authorPrivateKey, encryptionKey),
            internalMeta: await DataEncryptorV4.signAndEncryptAndEncode(fileMeta.internalMeta, authorPrivateKey, encryptionKey),
            authorPubKey: await authorPrivateKey.getPublicKey().toBase58DER()
        };
        return result;
    }

    static serializeNumber(value: number) {
        return Buffer.from(value.toString());
    }
}

