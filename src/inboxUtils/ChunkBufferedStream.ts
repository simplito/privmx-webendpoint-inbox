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
        console.log({sizeControl: this._sizeControl, totalDataSize: this._totalDataSize, maxTotalDataSize: this._maxTotalDataSize})
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
        console.log(4, {currBuf: this._buf, data});

        this._buf = Buffer.concat([this._buf, data]);
        console.log(5);
        this._bufSize += data.length;
        console.log(1);
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
