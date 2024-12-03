export interface InboxData {
    threadId: string;
    storeId: string;
    fileConfig: FilesConfig;
    meta: Buffer;
    publicData: Buffer;
}

export interface FilesConfig {
    minCount: number;
    maxCount: number;
    maxFileSize: number;
    maxWholeUploadSize: number;
};


export interface CreateRequestModel {
    files: FileDefinition[];
}

export interface FileDefinition {
    size: number;
    checksumSize: number;
}

export interface CommitFileModel {
    requestId: string;
    fileIndex: number;
    seq: number;
    checksum: Buffer;    
}

export interface ChunkModel {
    requestId: string;
    fileIndex: number;
    seq: number;
    data: Buffer;
}

export interface CreateRequestResult {
    id: string;
}

export interface InboxFile {
    fileIndex: number;
    thumbIndex?: number;
    meta: Buffer;
}

export interface InternalStoreFileMeta {
    version: number;
    size: number;
    cipherType: number;
    chunkSize: number;
    key: string;
    hmac: string;    
}

export interface FileMetaToEncrypt {
    publicMeta: Buffer;
    privateMeta: Buffer;
    fileSize: number;
    internalMeta: Buffer;
};

export interface InboxSendModel {
    inboxId: string;
    files: InboxFile[];
    message: Buffer;
    requestId?: string;
    version: number;
}
