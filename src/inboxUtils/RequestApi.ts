import { AuthorizedConnection } from "../AuthorizedConnection";
import { ChunkModel, CommitFileModel, CreateRequestModel, CreateRequestResult } from "./ServerTypes";

export class RequestApi {
    constructor(private connection: AuthorizedConnection) {}

    async createRequest(requestModel: CreateRequestModel): Promise<CreateRequestResult> {
        return this.connection.call("request.createRequest", requestModel);
    }

    async sendChunk(chunkModel: ChunkModel): Promise<void> {
        return this.connection.call("request.sendChunk", chunkModel);
    }
    
    async commitFile(commitFileModel: CommitFileModel): Promise<void> {
        return this.connection.call("request.commitFile", commitFileModel);
    }

}