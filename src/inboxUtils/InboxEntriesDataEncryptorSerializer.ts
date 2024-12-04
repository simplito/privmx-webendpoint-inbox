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
    private static serializeString(text: string): Buffer {
        return Buffer.from(text.length.toString() + text);
    }
    private static serializeBool(value: boolean) {
        return Buffer.from(value ? "1" : "0");
    }

    static async packMessage(data: InboxEntrySendModel, userPriv: PrivateKey, inboxPub: PublicKey) {
        const sendDataBuffer = Buffer.concat([
            this.serializeString(data.publicData.userPubKey),
            this.serializeBool(data.publicData.keyPreset),
            this.serializeString(data.publicData.usedInboxKeyId)
        ]);
        console.log("userPubKey", data.publicData.userPubKey, "\nserialized: ", this.serializeString(data.publicData.userPubKey).toString(), "length: ", data.publicData.userPubKey.length, this.serializeString(data.publicData.userPubKey).toString().length);
        console.log("inboxKeyId", data.publicData.usedInboxKeyId, "\nserialized: ", this.serializeString(data.publicData.usedInboxKeyId).toString());
        console.log("sendDataBuffer", sendDataBuffer.toString(), "\nserialized:", this.serializeString(sendDataBuffer.toString()).toString());
        console.log("packMessage debug", data.privateData.text.toString());
        const filesMetaKeyBase64 = Buffer.from(data.privateData.filesMetaKey).toString("base64");
        const dataSecuredBuffer = Buffer.concat([
            this.serializeString(filesMetaKeyBase64),
            data.privateData.text
        ]);

        // encrypt secured part with ecies
        const ecies = new ECIES(userPriv, inboxPub, {});
        const cipher = await ecies.encrypt(dataSecuredBuffer);
        const cipherWithKey = Buffer.from(
            "e" + userPriv.getPublicKey().toDER() + inboxPub.toDER() + cipher.toString()
        );
    
        const concatBuffer = Buffer.concat([
            this.serializeString(sendDataBuffer.toString()),
            cipherWithKey
        ]);
        return concatBuffer.toString("base64");
    }
    

};
