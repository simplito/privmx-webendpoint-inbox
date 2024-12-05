import { CryptoService } from "../crypto/Crypto";
import { ChunkBufferedStream } from "./ChunkBufferedStream";
import { RequestApi } from "./RequestApi";
import { CommitFileModel, CreateRequestModel, ChunkModel } from "./ServerTypes";

export const IV_SIZE = 16;
export const HMAC_SIZE = 32;
export const CHUNK_PADDING = 16;
export const CHUNK_SIZE = 128 * 1024;

export interface FileSizeResult {
    size: number;
    checksumSize: number;
};

export interface ChunksSentInfo {
    cipherType: number;
    key: Buffer;
    hmac: Buffer;
    chunkSize: number;
    requestId: string;
};

interface PreparedChunk {
    data: Buffer;
    hmac: Buffer;
}

export class ChunkStreamer {
    private _chunkBufferedStream: ChunkBufferedStream;
    private _key: Buffer;
    private _requestId: string;
    private _uploadedFileSize: number = 0;
    private _seq: number = 0;
    private _dataProcessed: number = 0;
    private _checksums: Buffer;
    private _fileIndex: number = 0;
    private _serverSeq: number = 0;

    constructor(private _requestApi: RequestApi, private _chunkSize: number, private _fileSize: number, serverRequestChunkSize: number) {
        // init buffers
        this._key = Buffer.from("");
        this._checksums = Buffer.from("");
        this._chunkBufferedStream = new ChunkBufferedStream(serverRequestChunkSize);
    }

    async createRequest(): Promise<void> {
        this._key = CryptoService.randomBytes(32);
        const size = this.getFileSize();
        
        const createRequestModel: CreateRequestModel = {
            files: [{
                size: size.size,
                checksumSize: size.checksumSize,
            }]
        };
        this._fileIndex = 0;
        const createRequestResult = await this._requestApi.createRequest(createRequestModel);
        this._requestId = createRequestResult.id;
    }
    
    setRequestData(requestId: string, key: Buffer, fileIndex: number) {
        this._requestId = requestId;
        this._key = key;
        this._fileIndex = fileIndex;
    }
    
    async sendChunk(data: Buffer): Promise<void> {
        if (data.length != this._chunkSize) {
            throw new Error("sendChunk: invalidFileChunkSize");
        }
        this._uploadedFileSize += data.length;
        return this.prepareAndSendChunk(data);
    }
    
    async finalize(data: Buffer): Promise<ChunksSentInfo> {
        this._uploadedFileSize += data.length;
        if (data.length > 0) {
            await this.prepareAndSendChunk(data);
        }
        if(this._uploadedFileSize + data.length < this._fileSize) {
            throw new Error("finalize: Data smaller than declared");
        }
        await this.commitFile();
        return {
            cipherType: 1,
            key: this._key,
            hmac: await CryptoService.hmacSha256(this._key, this._checksums),
            chunkSize: this._chunkSize,
            requestId: this._requestId
        };
    }
    
    async prepareAndSendChunk(data: Buffer): Promise<void> {
        if (this._dataProcessed + data.length > this._fileSize) {
            throw new Error("preapareAndSendChunk: InvalidFileChunkSize");
        }
        const encrypted = await this.prepareChunk(data);
        this._checksums = Buffer.concat([this._checksums, encrypted.hmac]);
        this._chunkBufferedStream.write(encrypted.data);
        await this.sendFullChunksWhileCollected();
        this._dataProcessed += data.length;
        ++this._seq;
    }
    
    getFileSize(): FileSizeResult {
        if (this._fileSize == 0) {
            return {
                size: 0,
                checksumSize: 0
            };
        }
        const parts = Math.ceil(this._fileSize / this._chunkSize);
        let lastChunkSize = this._fileSize % this._chunkSize;
        if (lastChunkSize === 0) {
            lastChunkSize = this._chunkSize;
        }
        const fullChunkPaddingSize = CHUNK_PADDING - (this._chunkSize % CHUNK_PADDING);
        const lastChunkPaddingSize = CHUNK_PADDING - (lastChunkSize % CHUNK_PADDING);
        const serverFileSize = (parts - 1) * (this._chunkSize + HMAC_SIZE + IV_SIZE + fullChunkPaddingSize) + lastChunkSize + HMAC_SIZE + IV_SIZE + lastChunkPaddingSize;   
        return {
            size: serverFileSize,
            checksumSize: parts * HMAC_SIZE
        };
    }

    private async prepareChunkKey() {
        const seqBuffer = Buffer.alloc(4);
        seqBuffer.writeUInt32BE(this._seq, 0);
        return CryptoService.sha256(Buffer.concat([this._key, seqBuffer]));
    }

    async prepareChunk(data: Buffer): Promise<PreparedChunk> {
        const chunkKey = await this.prepareChunkKey();
        const iv = CryptoService.randomBytes(IV_SIZE);
        const cipher = await CryptoService.aes256CbcPkcs7Encrypt(data, chunkKey, iv);
        const ivWithCipher = Buffer.concat([iv, cipher]);
        const hmac = await CryptoService.hmacSha256(chunkKey, ivWithCipher);
        return {
            data: Buffer.concat([hmac, ivWithCipher]),
            hmac: hmac
        };
    }
    
    async commitFile() {
        await this.sendFullChunksWhileCollected();
        await this.sendLastChunkIfNonEmpty();
        // server::CommitFileModel commitFileModel = utils::TypedObjectFactory::createNewObject<server::CommitFileModel>();
        const commitFileModel: CommitFileModel = {
            requestId: this._requestId,
            fileIndex: this._fileIndex,
            seq: this._serverSeq,
            checksum: this._checksums
    
        };
        return this._requestApi.commitFile(commitFileModel);
    }
    
    async sendFullChunksWhileCollected(): Promise<void> {
        const n = this._chunkBufferedStream.getNumberOfFullChunks();
        for(let i = 0; i < n; i++) {
            await this.sendChunkToServer(this._chunkBufferedStream.getFullChunk(i));
        }
        if(n > 0) {
            this._chunkBufferedStream.freeFullChunks();
        }
    }
    
    async sendLastChunkIfNonEmpty(): Promise<void> {
        if (!this._chunkBufferedStream.isEmpty()) {
            await this.sendChunkToServer(this._chunkBufferedStream.readChunk());
        }
    }
    
    async sendChunkToServer(data: Buffer): Promise<void> {
        const chunkModel: ChunkModel = {
            requestId: this._requestId,
            fileIndex: this._fileIndex,
            seq: this._serverSeq,
            data: data
    
        }
        await this._requestApi.sendChunk(chunkModel);
        ++this._serverSeq;
    }
    
    getUploadedFileSize() {
        return this._uploadedFileSize;
    }
}

