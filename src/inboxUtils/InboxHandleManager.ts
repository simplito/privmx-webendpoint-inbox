import { ChunksSentInfo, FileSizeResult } from "./ChunkStreamer";
import { FileHandleManager, FileWriteHandle, FileWriteHandleOptions } from "./FileHandle";
import { HandleManager } from "./HandleManager";

export interface CommitFileInfo {
    fileSize: FileSizeResult;
    fileSendResult: ChunksSentInfo;
    size: number;
    publicMeta: Buffer;
    privateMeta: Buffer;
};

export interface CommitSendInfo {
    filesInfo: CommitFileInfo[];
};

export interface InboxHandle {
    inboxId: string;
    data: Buffer;
    inboxFileHandles: number[];
    userPrivKey?: string;
    id: number;
};



export class InboxHandleManager {
    private _fileHandleManager: FileHandleManager;
    private _map: {[id: string]: InboxHandle | undefined} = {};
    private _fileHandlesUsedByInboxHandles: number[] = [];

    constructor(private _handleManager: HandleManager) {
        this._fileHandleManager = new FileHandleManager(HandleManager.get(), "Inbox");
    }
// InboxHandleManager::InboxHandleManager(std::shared_ptr<core::HandleManager> handleManager) :
//    _handleManager(handleManager), _fileHandleManager(store::FileHandleManager(handleManager, "Inbox")) {}


    async createInboxHandle(    
        inboxId: string,
        data: Buffer,
        inboxFileHandles: number[],
        userPrivKey?: string
    ): Promise<InboxHandle> {
        const fileHandles: FileWriteHandle[] = [];
        for (const inboxFileHandle of inboxFileHandles) {
            fileHandles.push(this._fileHandleManager.getFileWriteHandle(inboxFileHandle));
            this._fileHandlesUsedByInboxHandles.push(inboxFileHandle);
        }
        const id = this._handleManager.createHandle("Inbox:FilesWrite");
        const result = {
            inboxId, data, inboxFileHandles, userPrivKey, id
        };
        this._map[id] = result;
        return result;

    }

    async getInboxHandle(id: number) {
        if (!(id in this._map)){
            throw new Error("getInboxHandle: No handle with given id");
        }
        if (!this._map[id]) {
            throw new Error("getInboxHandle: no InboxHandle value");
        }
        const inboxHandle = this._map[id];
        return inboxHandle;
    }

    hasInboxHandle(id: number): boolean {
        if (!(id in this._map)){
            throw new Error("hasInboxHandle: No handle with given id");
        }
        return this._map[id] !== null;
    }

    async commitInboxHandle(id: number): Promise<CommitSendInfo> {
        if (!this.hasInboxHandle(id)) {
            throw new Error("commitInboxHandle: BufferInboxHandle");
        }
        const inboxHandle = this._map[id];
        const result: CommitSendInfo = {
            filesInfo: []
        };

        if (inboxHandle.inboxFileHandles.length !== 0) {
            for (const file_handle of inboxHandle.inboxFileHandles) {
                const handle = this._fileHandleManager.getFileWriteHandle(file_handle);
                if (!handle.isReadyToFinalize()) {
                    throw new Error("DataDifferentThanDeclared");
                }
            }

            for(const file_handle of inboxHandle.inboxFileHandles) {
                const handle = this._fileHandleManager.getFileWriteHandle(file_handle);
                const file_info: CommitFileInfo = {
                    fileSendResult: await handle.finalize(),
                    fileSize: handle.getEncryptedFileSize(),
                    size: handle.getSize(),
                    publicMeta: handle.getPublicMeta(),
                    privateMeta: handle.getPrivateMeta()    
                };
                result.filesInfo.push(file_info);
            }
        }
        delete this._map[id];
        return result;
    }

    async createFileWriteHandle(options: FileWriteHandleOptions): Promise<{id: number, handle: FileWriteHandle}> {
        return this._fileHandleManager.createFileWriteHandle(options);
    }

    getFileWriteHandle(fileHandleId: number) {
        return this._fileHandleManager.getFileWriteHandle(fileHandleId);
    }

    createFileReadHandle(_options: any): Promise<void> {
        throw new Error("Not implemented");
    }

    removeFileReadHandle(_fileHandleId: number) {
        throw new Error("Not implemented");
    }

} 

