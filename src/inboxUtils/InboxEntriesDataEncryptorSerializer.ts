import { PrivateKey, PublicKey, ECIES } from "../crypto/ecc";

export interface InboxEntryPublicData {
    userPubKey: string;
    keyPreset: boolean;
    usedInboxKeyId: string;
};

export interface InboxEntryPrivateData {
    filesMetaKey: Buffer;
    text: Buffer;
};

export interface InboxEntrySendModel {
    publicData: InboxEntryPublicData;
    privateData: InboxEntryPrivateData;
};

export interface InboxEntryPublicDataResult extends InboxEntryPublicData {
    statusCode: number;
};

export interface InboxEntryDataResult {
    publicData: InboxEntryPublicData;
    privateData: InboxEntryPrivateData;
    statusCode: number;
};

export interface InboxEntryResult extends InboxEntryDataResult {
    storeId: string;
    filesIds: string[];                
};

export class InboxEntriesDataEncryptorSerializer {
    private static int8ToBuf(num: number) {
        const buf = Buffer.allocUnsafe(1);
        buf.writeUInt8(num, 0);
        return buf;
    }

    private static boolToBuf(value: boolean) {
        const buf = Buffer.allocUnsafe(1);
        buf.writeUInt8(value === true? 1 : 0, 0);
        return buf;
    }


    private static serializeString(text: string): Buffer {
        return Buffer.concat([
            // Buffer.from(this.numToUint8Array(text.length)),
            this.int8ToBuf(text.length),
            Buffer.from(text)
        ]);
    }
    private static serializeBool(value: boolean) {
        // return Buffer.from(this.numToUint8Array(value === true ? 1 : 0));
        return this.boolToBuf(value);
    }

    static async packMessage(data: InboxEntrySendModel, userPriv: PrivateKey, inboxPub: PublicKey) {
        const sendDataBuffer = Buffer.concat([
            this.serializeString(data.publicData.userPubKey),
            this.serializeBool(data.publicData.keyPreset),
            this.serializeString(data.publicData.usedInboxKeyId)
        ]);
        const filesMetaKeyBase64 = data.privateData.filesMetaKey.toString("base64");
        const dataSecuredBuffer = Buffer.concat([
            this.serializeString(filesMetaKeyBase64),
            data.privateData.text
        ]);

        // encrypt secured part with ecies
        const ecies = new ECIES(userPriv, inboxPub, {shortTag: true, noKey: true});
        const cipher = await ecies.encrypt(dataSecuredBuffer);
        const cipherWithKey = Buffer.concat([
           Buffer.from("e"),
           userPriv.getPublicKey().toDER(),
           inboxPub.toDER(),
           cipher
        ]);
    
        const concatBuffer = Buffer.concat([
            this.serializeString(sendDataBuffer.toString()),
            cipherWithKey
        ]);
        return concatBuffer.toString("base64");
    }
    

};
