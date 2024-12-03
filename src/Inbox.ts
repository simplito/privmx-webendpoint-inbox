import { ConnectionManager } from "./ConnectionManager";
import { CryptoService } from "./crypto/Crypto";
import * as Ecc from "./crypto/ecc";
import { InboxApi } from "./InboxApi";

export class Inbox {
    constructor(private connectionManager: ConnectionManager) {}
    
    async privFromWIF(privWif: string) {
        return Ecc.PrivateKey.fromWIF(privWif);
    }
    
    // async getPublicView(options: {key?: Ecc.PrivateKey, url: string, solutionId?: string, inboxId: string}) {
    //     return this.withConnection(options, async (connection, _priv) => {
    //         const publicView = await connection.call("inbox.inboxGetPublicView", {id: options.inboxId});
    //         const inboxDataProcessor = new InboxDataProcessor();
    //         const publicData = await inboxDataProcessor.unpackPublic(publicView.publicData);

    //         const result: InboxPublicViewAsResult = {
    //             inboxId: options.inboxId,
    //             version: publicView.version,
    //             authorPubKey: publicData.authorPubKey,
    //             inboxEntriesPubKeyBase58DER: publicData.inboxEntriesPubKeyBase58DER,
    //             inboxEntriesKeyId: publicData.inboxEntriesKeyId,
    //             publicMeta: publicData.publicMeta,
    //             statusCode: publicData.statusCode
    //         };
    //         return result;
    //     });
    // }
    
    // async send(options: {key?: Ecc.PrivateKey, url: string, solutionId: string, inboxId: string, inboxVersion: number, files: {data: Uint8Array, meta: string}[], message: string}) {
    //     return this.withConnection(options, async (connection, _priv) => {
    //         const checksumSize = 16; // zle zle - parts * HMAC_SIZE
    //         const reqFiles = options.files.map(x => ({size: x.data.length, checksumSize: checksumSize}));
    //         const request = reqFiles.length > 0 ? await connection.call("request.createRequest", {
    //             files: reqFiles
    //         }) : null;
    //         for (const [i, file] of options.files.entries()) {
    //             await connection.call("request.sendChunk", {
    //                 requestId: request.id,
    //                 fileIndex: i,
    //                 seq: 0,
    //                 data: file.data, // TODO encrypt file content
    //             });
    //             await connection.call("request.commitFile", {
    //                 requestId: request.id,
    //                 fileIndex: i,
    //                 seq: 1,
    //                 checksum: new Uint8Array(checksumSize), // TODO calculate file checksum
    //             });
    //         }
    //         await connection.call("inbox.inboxSend", {
    //             inboxId: options.inboxId,
    //             message: options.message, // TODO encrypt message
    //             requestId: request ? request.id : undefined,
    //             files: options.files.map((file, i) => ({fileIndex: i, meta: file.meta})), // TODO encrypt file meta
    //             version: options.inboxVersion,
    //         });
    //     });
    // }
    


    // official api
    async connectPublic(bridgeUrl: string, solutionId: string, userPrivKeyWIF?: string): Promise<InboxApi> {
        const privKey = userPrivKeyWIF ? await Ecc.PrivateKey.fromWIF(userPrivKeyWIF) : CryptoService.eccPrivRandom();
        const connection = await this.connectionManager.createEcdheConnection(
            {key: privKey, solution: solutionId},
            {url: bridgeUrl, host: "_", websocket: false}
        );
        
        return new InboxApi({connectionNative: connection, userPrivKey: privKey, connectionManager: this.connectionManager});
    }
    
    // private async withConnection<T>(options: {key?: Ecc.PrivateKey, url: string, solutionId?: string}, func: (requestApi: RequestApi, connection: AuthorizedConnection, priv: Ecc.PrivateKey) => Promise<T>|T) {
    //     const priv = options.key || CryptoService.eccPrivRandom();
    //     const connection = await this.connectionManager.createEcdheConnection(
    //         {key: priv, solution: options.solutionId},
    //         {url: options.url, host: "_", websocket: false}
    //     );
    //     const requestApi = new RequestApi(connection);
    //     try {
    //         return await func(requestApi, connection, priv);
    //     }
    //     finally {
    //         connection.destroy();
    //     }
    // }
}
