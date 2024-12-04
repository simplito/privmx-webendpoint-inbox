/*!
PrivMX Web Endpoint.
Copyright © 2024 Simplito sp. z o.o.

This file is part of the PrivMX Platform (https://privmx.dev).
This software is Licensed under the PrivMX Free License.

See the License for the specific language governing permissions and
limitations under the License.
*/

import { CryptoService } from "./crypto/Crypto";
import { PrivateKey, PublicKey } from "./crypto/ecc";
import { InboxPublicView } from "./InboxTypes";
import { CHUNK_SIZE } from "./inboxUtils/ChunkStreamer";
import { FileWriteHandle } from "./inboxUtils/FileHandle";
import { InboxDataProcessor } from "./inboxUtils/InboxDataProcessor";
import { InboxEntriesDataEncryptorSerializer, InboxEntrySendModel } from "./inboxUtils/InboxEntriesDataEncryptorSerializer";
import { CommitFileInfo, InboxHandleManager } from "./inboxUtils/InboxHandleManager";
import { RequestApi } from "./inboxUtils/RequestApi";
import { FileDefinition } from "./inboxUtils/ServerTypes";
import { Connection } from "./Types";
import * as ServerTypes from "./inboxUtils/ServerTypes";
import { FileMetaEncryptorV4 } from "./inboxUtils/FileMetaEncryptorV4";
import { HandleManager } from "./inboxUtils/HandleManager";

export class InboxApi {
    private _inboxHandleManager: InboxHandleManager;

    constructor (private connection: Connection) {
        this._inboxHandleManager = new InboxHandleManager(HandleManager.get());
    }

    /**
     * Gets public data of given Inbox.
     * You do not have to be logged in to call this function.
     *
     * @param {string} inboxId ID of the Inbox to get
     * @returns {InboxPublicView} struct containing public accessible information about the Inbox
     */
    async getInboxPublicView(inboxId: string): Promise<InboxPublicView> {
        const conn = this.connection.connectionNative;
        const publicView = await conn.call("inbox.inboxGetPublicView", {id: inboxId});
        const inboxDataProcessor = new InboxDataProcessor();
        const publicData = await inboxDataProcessor.unpackPublic(publicView.publicData);

        const result: InboxPublicView = {
            inboxId: inboxId,
            version: publicView.version,
            publicMeta: publicData.publicMeta,
        };
        return result;
    }

    /**
     * Prepares a request to send data to an Inbox.
     * You do not have to be logged in to call this function.
     *
     * @param {string} inboxId ID of the Inbox to which the request applies
     * @param {Uint8Array} data entry data to send
     * @param {number[]} [inboxFileHandles] optional list of file handles that will be sent with the request
     * @param {string} [userPrivKey] optional sender's private key which can be used later to encrypt data for that sender
     * @returns {number} Inbox handle
     */
    async prepareEntry(
        inboxId: string,
        data: Uint8Array,
        inboxFileHandles: number[],
        userPrivKeyWIF?: string
    ): Promise<number> {
        const conn = this.connection.connectionNative;
        const publicView = await conn.call("inbox.inboxGetPublicView", {id: inboxId});
        const inboxDataProcessor = new InboxDataProcessor();
        const requestApi = new RequestApi(this.connection.connectionNative);

        //check if inbox exist
        try {
            await inboxDataProcessor.unpackPublic(publicView.publicData);
        }
        catch (_e) {
            throw new Error("prepareEntry: Inbox with given id does not exists.");
        }

        const fileHandles: FileWriteHandle[]  = [];

        if (inboxFileHandles.length > 0) {
            const filesList: FileDefinition[] = [];
            
            for(const inboxFileHandle of inboxFileHandles) {
                const handle = this._inboxHandleManager.getFileWriteHandle(inboxFileHandle);
                fileHandles.push(handle);

                const fileSizeInfo = handle.getEncryptedFileSize();
                console.log("fileSizeInfo", fileSizeInfo);
                filesList.push({
                    size: fileSizeInfo.size,
                    checksumSize: fileSizeInfo.checksumSize
                });
            }

            const requestResult = await requestApi.createRequest({files: filesList});

            for(let i = 0; i < fileHandles.length; i++) {
                const key = CryptoService.randomBytes(32);
                fileHandles[i].setRequestData(requestResult.id, key, i);
            }
        }
        const handle = await this._inboxHandleManager.createInboxHandle(inboxId, Buffer.from(data), inboxFileHandles, userPrivKeyWIF);
        return handle.id;
    }

    /**
     * Sends data to an Inbox.
     * You do not have to be logged in to call this function.
     *
     * @param {string} inboxHandle ID of the Inbox to which the request applies
     */
    async sendEntry(inboxHandle: number): Promise<void> {
        const conn = this.connection.connectionNative;
        const handle = await this._inboxHandleManager.getInboxHandle(inboxHandle);
        const publicView = await conn.call("inbox.inboxGetPublicView", {id: handle.inboxId});
        console.log("inboxHandle on send", {handle, publicView});

        const inboxDataProcessor = new InboxDataProcessor();

        const publicData = await inboxDataProcessor.unpackPublic(publicView.publicData);

        const inboxPubKeyECC = await PublicKey.fromBase58DER(publicData.inboxEntriesPubKeyBase58DER);// keys to encrypt message (generated or taken from param)
        const _userPrivKeyECC = handle.userPrivKey ? await PrivateKey.fromWIF(handle.userPrivKey) : CryptoService.eccPrivRandom();
        const _userPubKeyECC = _userPrivKeyECC.getPublicKey();
    
        const hasFiles = handle.inboxFileHandles.length > 0;
        const filesMetaKey = hasFiles ? CryptoService.randomBytes(32) : Buffer.from("");
    

        const modelForSerializer: InboxEntrySendModel = {
            publicData: {
                userPubKey: await _userPubKeyECC.toBase58DER(),
                keyPreset: handle.userPrivKey && handle.userPrivKey.length > 0,
                usedInboxKeyId: publicData.inboxEntriesKeyId
            },
            privateData: {
                filesMetaKey: filesMetaKey,
                text: handle.data
            }
        };
    
        const inboxFiles: ServerTypes.InboxFile[] = [];
        let requestId: string;
        if (hasFiles) {
            let fileIndex = -1;
            const commitSentInfo = await this._inboxHandleManager.commitInboxHandle(inboxHandle);
            console.log(17);
            for (const fileInfo of commitSentInfo.filesInfo) {
                fileIndex++;
                const encryptedFileMeta = await FileMetaEncryptorV4.encrypt(await this.prepareMeta(fileInfo), _userPrivKeyECC, filesMetaKey);
                console.log(18);
                inboxFiles.push({fileIndex: fileIndex, meta: encryptedFileMeta})
            }
            requestId = commitSentInfo.filesInfo[0].fileSendResult.requestId;
        }
        const serializedMessage = await InboxEntriesDataEncryptorSerializer.packMessage(modelForSerializer, _userPrivKeyECC, inboxPubKeyECC);
        console.log(19, {serializedMessage, deserialized: Buffer.from(serializedMessage, "base64").toString()});
        // prepare server model
        const model: ServerTypes.InboxSendModel = {
            inboxId: handle.inboxId,
            files: inboxFiles,
            message: serializedMessage,
            version: 1,
            requestId: requestId
        }
        console.log(20, {model})
        await conn.call("inbox.inboxSend", model);
        console.log(21);
    }

    private async prepareMeta(commitFileInfo: CommitFileInfo) {
        console.log(17.1);
        const internalFileMeta: ServerTypes.InternalStoreFileMeta = {
            version: 4,
            size: commitFileInfo.size,
            cipherType: commitFileInfo.fileSendResult.cipherType,
            chunkSize: commitFileInfo.fileSendResult.chunkSize,
            key: commitFileInfo.fileSendResult.key.toString("base64"),
            hmac: commitFileInfo.fileSendResult.hmac.toString("base64")
        };
        console.log(17.2);
        const metaToEncrypt: ServerTypes.FileMetaToEncrypt = {
            publicMeta: commitFileInfo.publicMeta,
            privateMeta: commitFileInfo.privateMeta,
            fileSize: commitFileInfo.size,
            internalMeta: Buffer.from(JSON.stringify(internalFileMeta))
        };
        console.log(17.3);
        return metaToEncrypt;
    }

    /**
     * Creates a file handle to send a file to an Inbox.
     * You do not have to be logged in to call this function.
     *
     * @param {Uint8Array} publicMeta public file metadata
     * @param {Uint8Array} privateMeta private file metadata
     * @param {number} fileSize size of the file to send
     * @returns {number} file handle
     */
    async createFileHandle(
        publicMeta: Uint8Array,
        privateMeta: Uint8Array,
        fileSize: number
    ): Promise<number> {
        const requestApi = new RequestApi(this.connection.connectionNative);
        const result = await this._inboxHandleManager.createFileWriteHandle({
            storeId: "",
            fileId: "",
            size: fileSize,
            publicMeta: Buffer.from(publicMeta),
            privateMeta: Buffer.from(privateMeta),
            chunkSize: CHUNK_SIZE,
            serverRequestChunkSize: this.connection.connectionManager.getRequestChunkSize(),
            requestApi: requestApi
        });
        return result.id;
    }

    /**
     * Sends a file's data chunk to an Inbox.
     * (note: To send the entire file - divide it into pieces of the desired size and call the function for each fragment.)
     * You do not have to be logged in to call this function.
     *
     * @param {number} inboxHandle ID of the Inbox to which the request applies
     * @param {number} inboxFileHandle handle to the file where the uploaded chunk belongs
     * @param {Uint8Array} dataChunk - file chunk to send
     */
    async writeToFile(
        inboxHandle: number,
        inboxFileHandle: number,
        dataChunk: Uint8Array
    ): Promise<void> {
        const handle = await this._inboxHandleManager.getInboxHandle(inboxHandle);
        if(handle.inboxFileHandles.length === 0) {
            throw new Error("writeToFile: InboxHandleIsNotTiedToInboxFileHandle");
        }
        console.log({inboxHandle, inboxFileHandle, dataChunk});
        const fileWriteHandle = this._inboxHandleManager.getFileWriteHandle(inboxFileHandle);
        return fileWriteHandle.write(Buffer.from(dataChunk));
    }

}
