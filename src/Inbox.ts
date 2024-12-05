import { ConnectionManager } from "./ConnectionManager";
import { CryptoService } from "./crypto/Crypto";
import * as Ecc from "./crypto/ecc";
import { InboxApi } from "./InboxApi";

export class Inbox {
    constructor(private connectionManager: ConnectionManager) {}
    
    async connectPublic(bridgeUrl: string, solutionId: string, userPrivKeyWIF?: string): Promise<InboxApi> {
        const privKey = userPrivKeyWIF ? await Ecc.PrivateKey.fromWIF(userPrivKeyWIF) : CryptoService.eccPrivRandom();
        const connection = await this.connectionManager.createEcdheConnection(
            {key: privKey, solution: solutionId},
            {url: bridgeUrl, host: "_", websocket: false}
        );
        return new InboxApi({connectionNative: connection, userPrivKey: privKey, connectionManager: this.connectionManager});
    }
}
