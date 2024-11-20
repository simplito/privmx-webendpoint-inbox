import { AuthorizedConnection } from "./AuthorizedConnection";
import { ConnectionManager } from "./ConnectionManager";
import { CryptoService } from "./crypto/Crypto";
import * as Ecc from "./crypto/ecc";

export class Inbox {
    
    constructor(
        private connectionManager: ConnectionManager,
    ) {
    }
    
    async privFromWIF(privWif: string) {
        return Ecc.PrivateKey.fromWIF(privWif);
    }
    
    async getPublicView(options: {key?: Ecc.PrivateKey, url: string, solutionId?: string, inboxId: string}) {
        return this.withConnection(options, async (connection, _priv) => {
            const inbox = await connection.call("inbox.inboxGetPublicView", {id: options.inboxId});
            return inbox; // TODO decode inbox data
        });
    }
    
    async send(options: {key?: Ecc.PrivateKey, url: string, solutionId: string, inboxId: string, inboxVersion: number, files: {data: Uint8Array, meta: string}[], message: string}) {
        return this.withConnection(options, async (connection, _priv) => {
            const checksumSize = 16;
            const reqFiles = options.files.map(x => ({size: x.data.length, checksumSize: checksumSize}));
            const request = reqFiles.length > 0 ? await connection.call("request.createRequest", {
                files: reqFiles
            }) : null;
            for (const [i, file] of options.files.entries()) {
                await connection.call("request.sendChunk", {
                    requestId: request.id,
                    fileIndex: i,
                    seq: 0,
                    data: file.data, // TODO encrypt file content
                });
                await connection.call("request.commitFile", {
                    requestId: request.id,
                    fileIndex: i,
                    seq: 1,
                    checksum: new Uint8Array(checksumSize), // TODO calculate file checksum
                });
            }
            await connection.call("inbox.inboxSend", {
                inboxId: options.inboxId,
                message: options.message, // TODO encrypt message
                requestId: request ? request.id : undefined,
                files: options.files.map((file, i) => ({fileIndex: i, meta: file.meta})), // TODO encrypt file meta
                version: options.inboxVersion,
            });
        });
    }
    
    async test(options: {key?: Ecc.PrivateKey, url: string, solutionId: string, inboxId: string}) {
        const inbox = await this.getPublicView(options);
        await this.send({
            ...options,
            inboxVersion: inbox.version,
            message: "aaaa",
            files: [
                {data: new Uint8Array(100), meta: "bbbb"},
                {data: new Uint8Array(200), meta: "cccc"},
                {data: new Uint8Array(300), meta: "dddd"},
            ]
        });
    }
    
    private async withConnection<T>(options: {key?: Ecc.PrivateKey, url: string, solutionId?: string}, func: (connection: AuthorizedConnection, priv: Ecc.PrivateKey) => Promise<T>|T) {
        const priv = options.key || CryptoService.eccPrivRandom();
        const connection = await this.connectionManager.createEcdheConnection(
            {key: priv, solution: options.solutionId},
            {url: options.url, host: "_", websocket: false}
        );
        try {
            return await func(connection, priv);
        }
        finally {
            connection.destroy();
        }
    }
}
