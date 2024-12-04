import { PrivateKey, PublicKey } from "../crypto/ecc";
import { DataEncryptorV4 } from "./DataEncryptorV4";
import * as ServerTypes from "./ServerTypes";

export interface InboxPublicDataAsResult extends InboxPublicData {
    authorPubKey?: string;
    statusCode: number;
};

export interface InboxPublicData {
    publicMeta?: Uint8Array;
    inboxEntriesPubKeyBase58DER?: string;
    inboxEntriesKeyId?: string;
};

export interface InboxPrivateData {
    privateMeta?: Buffer;
    internalMeta?: Buffer;
};

export interface InboxPrivateDataAsResult extends InboxPrivateData {
    authorPubKey?: string;
    statusCode: number;
};

export interface InboxPublicDataV4 {
    version: number;
    publicMeta: string; // base64-encoded
    publicMetaObject: unknown;
    authorPubKey: string;
    inboxPubKey: string;
    inboxKeyId: string;
}

export interface InboxPrivateDataV4 {
    version: number;
    privateMeta: string; // base64-encoded
    internalMeta: string; // base64-encoded
    authorPubKey: string;
}

export interface InboxDataProcessorModel {
    storeId: string;
    threadId: string;
    filesConfig: ServerTypes.FilesConfig;
    privateData: InboxPrivateData;
    publicData: InboxPublicData;
};


export interface InboxPublicViewAsResult extends InboxPublicDataAsResult {
    inboxId: string;
    version: number;
};

export class InboxDataProcessor {
    async packForServer(plainData: InboxDataProcessorModel, authorPrivateKey: PrivateKey, inboxKey: string): Promise<ServerTypes.InboxData> {
        let publicMetaObject: any = null;
        try {
            publicMetaObject = JSON.parse(
                new TextDecoder().decode(plainData.publicData.publicMeta)
            );
        } catch (_e) {}
        
        const authorPubKeyECC = await authorPrivateKey.getPublicKey().toBase58DER();
        
        const serverPublicData: InboxPublicDataV4 = {
            version: 4,
            publicMeta: plainData.publicData.publicMeta ? await DataEncryptorV4.signAndEncode(Buffer.from(plainData.publicData.publicMeta), authorPrivateKey): null,
            publicMetaObject: publicMetaObject,
            authorPubKey: authorPubKeyECC,
            inboxPubKey: plainData.publicData.inboxEntriesPubKeyBase58DER,
            inboxKeyId: plainData.publicData.inboxEntriesKeyId
        }

        const serverPrivateData: InboxPrivateDataV4 = {
            version: 4,
            privateMeta: await DataEncryptorV4.signAndEncryptAndEncode(Buffer.from(plainData.privateData.privateMeta), authorPrivateKey, Buffer.from(inboxKey)),
            internalMeta: plainData.privateData.internalMeta ? await DataEncryptorV4.signAndEncryptAndEncode(plainData.privateData.internalMeta, authorPrivateKey, Buffer.from(inboxKey)): null,
            authorPubKey: authorPubKeyECC
        };

        return <ServerTypes.InboxData> {
            threadId: plainData.threadId,
            storeId: plainData.storeId,
            fileConfig: plainData.filesConfig,
            meta: serverPrivateData,
            publicData: serverPublicData
        };
    }


    async unpackPublic(publicRawData: any): Promise<InboxPublicDataAsResult> {
        const result: InboxPublicDataAsResult = {statusCode: 0};

        try {
            this.validateVersion(publicRawData);
            const publicDataV4 = publicRawData as InboxPublicDataV4;
    
            const authorPublicKeyECC = await PublicKey.fromBase58DER(publicDataV4.authorPubKey);

            result.publicMeta = await DataEncryptorV4.decodeAndVerify(publicDataV4.publicMeta, authorPublicKeyECC);

            if (publicDataV4.publicMetaObject) {
                const tmp1 = JSON.stringify(JSON.parse(publicDataV4.publicMeta.toString()));
                const tmp2 = JSON.stringify(publicDataV4.publicMetaObject);
                if (tmp1 !== tmp2) {
                    result.statusCode = 0x0013;
                    throw new Error("Inbox public data mismatch");
                }
            }
            result.inboxEntriesPubKeyBase58DER = publicDataV4.inboxPubKey;
            result.inboxEntriesKeyId = publicDataV4.inboxKeyId;
            result.authorPubKey = publicDataV4.authorPubKey;
        } finally {
            return result;
        }
    }


    async unpackPrivate(encryptedData: ServerTypes.InboxData, inboxKey: string) {
        const result: InboxPrivateDataAsResult = {statusCode: 0};
        try {
            this.validateVersion(encryptedData.meta);
            const privateDataV4 = encryptedData.meta;
            const authorPublicKeyECC = await PublicKey.fromBase58DER(privateDataV4.authorPubKey);

            result.privateMeta = await DataEncryptorV4.decodeAndDecryptAndVerify(privateDataV4.privateMeta, authorPublicKeyECC, Buffer.from(inboxKey));
            result.internalMeta = privateDataV4.internalMeta 
                ? await DataEncryptorV4.decodeAndDecryptAndVerify(privateDataV4.internalMeta, authorPublicKeyECC, Buffer.from(inboxKey))
                : null;
                result.authorPubKey = privateDataV4.authorPubKey;
    
        } catch (e) {
            result.statusCode = 0x00010000;
        }
        return result;
    }



    private validateVersion(inboxRawData: any) {
        if (!("version" in inboxRawData) || inboxRawData.version !== 4) {
            throw new Error("Invalid inbox public data version/format.");
        }
    }


}