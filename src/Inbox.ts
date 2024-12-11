import { ConnectionManager } from "./ConnectionManager";
import { CryptoService } from "./crypto/Crypto";
import { InboxApi } from "./InboxApi";

export class Inbox {
    constructor(private connectionManager: ConnectionManager) {}
    
    async connectPublic(solutionId: string, bridgeUrl: string): Promise<InboxApi> {
        const privKey = CryptoService.eccPrivRandom();
        const connection = await this.connectionManager.createEcdheConnection(
            {key: privKey, solution: solutionId},
            {url: bridgeUrl, host: "_", websocket: false}
        );
        return new InboxApi({connectionNative: connection, userPrivKey: privKey, connectionManager: this.connectionManager});
    }
}
