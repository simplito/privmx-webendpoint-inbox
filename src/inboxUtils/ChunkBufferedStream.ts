export class ChunkBufferedStream {
    private _chunkSize: number;
    private _buf: Buffer;
    private _sizeControl: boolean;
    private _maxTotalDataSize: number;
    private _totalDataSize: number = 0;
    private _bufSize: number = 0;

    constructor(chunkSize: number, maxStreamLength?: number) {
        this._chunkSize = chunkSize;
        this._sizeControl = maxStreamLength !== undefined;
        this._maxTotalDataSize = maxStreamLength || 0;
        this._buf = Buffer.from("");
    }

    isEmpty() {
        return this._bufSize == 0;
    }
    
    hasFullChunk() {
        return this._bufSize > this._chunkSize;
    }
    
    getNumberOfFullChunks() {
        return Math.floor(this._bufSize / this._chunkSize);
    }
    
    isFullyFilled() {
        return this._sizeControl ? this._totalDataSize === this._maxTotalDataSize : false;
    }

    readChunk(): Buffer {
        const chunkSize = Math.min(this._bufSize, this._chunkSize);
        const res = this._buf.slice(0, this._chunkSize);
        this._buf = this._buf.slice(chunkSize);
        this._bufSize -= chunkSize;
        return res;
    }
    
    write(data: Buffer) {
        if(this._sizeControl && this._totalDataSize + data.length > this._maxTotalDataSize) {
            throw new Error("write: DataBiggerThanDeclared");
        }
        this._buf = Buffer.concat([this._buf, data]);
        this._bufSize += data.length;
        this._totalDataSize += data.length;
    }
    
    getFullChunk(pos: number): Buffer {
        const from = this._chunkSize * pos;
        return this._buf.slice(from, from + this._chunkSize);
    }

    freeFullChunks() {
        this._buf = this._buf.slice(this._chunkSize * this.getNumberOfFullChunks());
        this._bufSize = this._bufSize - (this._chunkSize * this.getNumberOfFullChunks());
    }
};
