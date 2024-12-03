import { ChunkBufferedStream } from "./ChunkBufferedStream";
import { ChunksSentInfo, ChunkStreamer, FileSizeResult } from "./ChunkStreamer";
import { HandleManager } from "./HandleManager";
import { RequestApi } from "./RequestApi";

// export interface FileReadHandleOptions {
//     fileId: string;
//     fileSize: number;
//     serverFileSize: number;
//     chunkSize: number;
//     serverChunkSize: number;
//     fileVersion: number;
//     fileKey: Buffer;
//     fileHmac: Buffer;
//     server: ServerApi;
// }

export interface FileWriteHandleOptions {
    storeId: string;
    fileId: string;
    size: number;
    publicMeta: Buffer;
    privateMeta: Buffer;
    chunkSize: number;
    serverRequestChunkSize: number;
    requestApi: RequestApi;
}

export class FileHandle {
    protected _storeId: string;
    protected _fileId: string;
    protected _size: number;

    isReadHandle(): boolean {
        return false;
    }
    isWriteHandle(): boolean {
        return false;
    };

    getStoreId(): string {
        return this._storeId;
    }
    getFileId(): string {
        return this._fileId;
    }
    getSize(): number {
        return this._size;
    }
}

// export class FileReadHandle extends FileHandle {
//     private serverFileSize: number;
//     private chunkSize: number;
//     private serverChunkSize: number;
//     private fileVersion: number;
//     private fileKey: Buffer;
//     private fileHmac: Buffer;
//     // std::shared_ptr<ServerApi> server
    
//     constructor FileReadHandle


//     isReadHandle(): boolean {
//         return true;
//     } 
// }

export class FileWriteHandle extends FileHandle {
    private _publicMeta: Buffer;
    private _privateMeta: Buffer;
    private _stream: ChunkBufferedStream;
    private _streamer: ChunkStreamer;

    constructor(options: FileWriteHandleOptions) {
        super();
        this._stream = new ChunkBufferedStream(options.chunkSize, options.size);
        this._streamer = new ChunkStreamer(
            options.requestApi,
            options.chunkSize,
            options.size,
            options.serverRequestChunkSize
        )
    }

    async write(data: Buffer): Promise<void> {
        console.log(1);
        this._stream.write(data);
        for(let i = 0; i < this._stream.getNumberOfFullChunks(); i++) {
            console.log(2);
            this._streamer.sendChunk(this._stream.getFullChunk(i));
        }
        console.log(3);
        this._stream.freeFullChunks();
    }
    
    async finalize(): Promise<ChunksSentInfo> {
        if(!this._stream.isFullyFilled()) {
            throw new Error("Data different than declared");
        }
        console.log("before finalize");
        const result = await this._streamer.finalize(this._stream.readChunk());
        console.log("after finalize");
        this._size = this._streamer.getUploadedFileSize();
        return result;
    }
    
    isReadyToFinalize() {
        return this._stream.isFullyFilled();
    }
    
    getPublicMeta() {
        return this._publicMeta;
    }
    getPrivateMeta() {
        return this._privateMeta;
    }
    
    getEncryptedFileSize(): FileSizeResult {
        return this._streamer.getFileSize();
    }
    
    async createRequestData(): Promise<void> {
        return this._streamer.createRequest();
    }
    
    setRequestData(requestId: string, key: Buffer, fileIndex: number) {
        return this._streamer.setRequestData(requestId, key, fileIndex);
    }

    isReadHandle(): boolean {
        return false;
    }
    isWriteHandle(): boolean {
        return true;
    };
    
}

export class FileHandleManager {
    private _map: {[id: string]: FileHandle} = {};
    constructor(private _handleManager: HandleManager, private _labelPrefix: string = "") {}

    // std::tuple<int64_t, std::shared_ptr<FileReadHandle>> FileHandleManager::createFileReadHandle(
    //     const std::string& fileId,
    //     uint64_t fileSize,
    //     uint64_t serverFileSize,
    //     size_t chunkSize,
    //     size_t serverChunkSize,
    //     int64_t fileVersion,
    //     const std::string& fileKey,
    //     const std::string& fileHmac,
    //     std::shared_ptr<ServerApi> server
    // ) {
    //     int64_t id = _handleManager->createHandle((_labelPrefix.empty() ? "" : _labelPrefix + ":") + "FileRead");
    //     std::shared_ptr<FileReadHandle> result = std::make_shared<FileReadHandle>(fileId, fileSize, serverFileSize, chunkSize, serverChunkSize, fileVersion, fileKey, fileHmac, server);
    //     _map.set(id, result);
    //     return std::make_tuple(id, result);
    // }
    
    async createFileWriteHandle(options: FileWriteHandleOptions): Promise<{id: number, handle: FileWriteHandle}> {
        const id = HandleManager.get().createHandle((!this._labelPrefix || this._labelPrefix.length === 0 ? "" : this._labelPrefix + ":") + "FileWrite");
        const result = new FileWriteHandle(options);
        this._map[id] = result;
        return {id: id, handle: result};
    }
    
    // std::shared_ptr<FileReadHandle> FileHandleManager::getFileReadHandle(int64_t id) {
    //     std::shared_ptr<FileHandle> handle = getFileHandle(id);
    //     if (!handle->isReadHandle()) {
    //         throw InvalidFileReadHandleException();
    //     }
    //     return std::dynamic_pointer_cast<FileReadHandle>(handle);
    // }
    
    getFileWriteHandle(id: number): FileWriteHandle {
        const handle = this.getFileHandle(id);
        if (!handle.isWriteHandle()) {
            throw new Error("getFileWriteHandle: InvalidFileWriteHandleException");
        }
        return handle as FileWriteHandle;
    }
    
    getFileHandle(id: number): FileHandle {
        if (!(id in this._map)) {
            throw new Error("getFileHandle: no handle by given id");
        }
        return this._map[id];
    }
    
    removeHandle(id: number) {
        if (!(id in this._map)) {
            throw new Error("removeHandle: no handle by given id");
        }
        delete this._map[id];
        this._handleManager.removeHandle(id);
    }
    

}