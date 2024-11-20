import {TicketsPacket, PromiseStatus, PromisePendingStatus} from "./Types";
import { CryptoService } from "./crypto/Crypto";
import { Deferred } from "./Types";

export class RpcUtils {
    
    private static readonly HOSTNAME_REGEX = /^(([a-zA-Z0-9_]|[a-zA-Z0-9_][a-zA-Z0-9\-_]*[a-zA-Z0-9_])\.)*([A-Za-z0-9_]|[A-Za-z0-9_][A-Za-z0-9\-_]*[A-Za-z0-9_])$/;
    static fillTo(buff: Buffer, length: number): Buffer {
        if (buff.length < length) {
            let zeros = Buffer.alloc(length - buff.length);
            zeros.fill(0);
            return RpcUtils.concat2Buffers(zeros, buff);
        }
        if (buff.length > length) {
            return buff.slice(0, length);
        }
        return buff;
    }
    
    static fillTo32(buff: Buffer): Buffer {
        return RpcUtils.fillTo(buff, 32);
    }
    
    static getTTLDate(packet: TicketsPacket) {
        let ttl = new Date();
        ttl.setSeconds(ttl.getSeconds() + packet["ttl"]);
        return ttl;
    }
    
    static generateId(): string {
        return new Date().getTime().toString() + Math.random().toString();
    }
    
    static generateClientRandom(): Buffer {
        let b1 = Buffer.from(CryptoService.randomBytes(6));
        let b2 = Buffer.from(CryptoService.randomBytes(10));
        
        return RpcUtils.concat2Buffers(b1, b2);
    }
    
    static simpleDeepCopy<T>(x: T): T {
        return <T>JSON.parse(JSON.stringify(x));
    }
    
    static getMsgFromError(e: any) {
        if (typeof(e) == "string") {
            return e;
        }
        return e && typeof(e.message) == "string" ? e.message : "" + e;
    }
    
    static bufferFromHex(hex: string): Buffer {
        return Buffer.from(RpcUtils.padHex(hex), "hex")
    }
    
    static padHex(hex: string) {
        return hex.length % 2 == 1 ? "0" + hex : hex;
    }
    
    static createBufferFromBytesLike(buffer: {toString(encoding: string): string, toArrayBuffer?: () => ArrayBuffer}) {
        if (typeof(buffer.toArrayBuffer) === "function") {
            return Buffer.from(buffer.toArrayBuffer());
        }
        return Buffer.from(buffer.toString("binary"), "binary");
    }
    
    static defer<T = any>(): Deferred<T> {
        let defer: Deferred<T> = {
            resolve: null,
            reject: null,
            promise: null
        };
        defer.promise = new Promise((resolve, reject) => {
            defer.resolve = resolve;
            defer.reject = reject;
        });
        return defer;
    }
    
    static executeInDefer<T>(func: () => Promise<T>) {
        const defer = RpcUtils.defer<T>();
        func().then(defer.resolve, defer.reject);
        return defer;
    }
    
    static watchPromise<T>(promise: Promise<T>): PromiseStatus<T> {
        const result: PromisePendingStatus<T> = {
            promise: promise,
            status: "pending"
        };
        promise.then(v => {
            const r = <PromiseFulfilledResult<T>><PromiseStatus<T>>result;
            r.status = "fulfilled";
            r.value = v;
        }, e => {
            const r = <PromiseRejectedResult><PromiseStatus<T>>result;
            r.status = "rejected";
            r.reason = e;
        });
        return result;
    }
    
    static isValidHostname(hostname: string) {
        return typeof(hostname) == "string" && RpcUtils.HOSTNAME_REGEX.test(hostname);
    }
    
    static getMax<T>(array: T[], func: (e: T) => number, defaultValue: number) {
        let max: number|null = null;
        for (const e of array) {
            const v = func(e);
            if (max == null || v > max) {
                max = v
            }
        }
        return max == null ? defaultValue : max;
    }
    
    static concat2Buffers(a: Buffer, b: Buffer) {
        const res = Buffer.alloc(a.length + b.length);
        res.set(a);
        res.set(b, a.length);
        return res;
    }
    
    static concat3Buffers(a: Buffer, b: Buffer, c: Buffer) {
        const res = Buffer.alloc(a.length + b.length + c.length);
        res.set(a);
        res.set(b, a.length);
        res.set(c, a.length + b.length);
        return res;
    }
    
    static concat4Buffers(a: Buffer, b: Buffer, c: Buffer, d: Buffer) {
        const res = Buffer.alloc(a.length + b.length + c.length + d.length);
        res.set(a);
        res.set(b, a.length);
        res.set(c, a.length + b.length);
        res.set(d, a.length + b.length + c.length);
        return res;
    }
    
    static concatBuffers(buffers: Buffer[]) {
        let size = 0;
        for (const buffer of buffers) {
            size += buffer.length;
        }
        const res = Buffer.alloc(size);
        let pos = 0;
        for (const buffer of buffers) {
            res.set(buffer, pos);
            pos += buffer.length;
        }
        return res;
    }
    
    static printBuffer(buffer: Buffer) {
        let result = "";
        let pos = 0;
        while (true) {
            const chunk = buffer.slice(pos, pos + 16);
            let printable = "";
            for (let i = 0; i < 16; i++) {
                if (i < chunk.length) {
                    const code = chunk[i];
                    result += (code < 16 ? "0" : "") + code.toString(16) + " ";
                    printable += code >= 32 && code <= 126 ? String.fromCharCode(code) : "\u2588";
                }
                else {
                    result += "   ";
                }
            }
            result += printable + "\n";
            pos += 16;
            if (chunk.length !== 16) {
                break;
            }
        }
        return result;
    }
}
