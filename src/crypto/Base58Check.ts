/*
 * Fork of https://github.com/bitcoinjs/bs58check
 */

import base58 from "bs58";
import { CryptoService } from "./Crypto";

export class Base58Check {
    
    // Encode a buffer as a base58-check encoded string
    static async encode(payload: Buffer): Promise<string> {
        const checksum = await Base58Check.sha256x2(payload)
        const length = payload.length + 4
        const both = new Uint8Array(length)
        both.set(payload, 0)
        both.set(checksum.subarray(0, 4), payload.length)
        return base58.encode(both)
    }
    
    static async decode(str: string): Promise<Buffer> {
        const buffer = base58.decode(str)
        const payload = await Base58Check.decodeRaw(Buffer.from(buffer));
        if (!payload) {
            throw new Error("Invalid checksum");
        }
        return payload;
    }
    
    // Decode a base58-check encoded string to a buffer, no result if checksum is wrong
    static async decodeUnsafe(str: string): Promise<Buffer|undefined> {
        const buffer = base58.decodeUnsafe(str)
        if (!buffer) {
            return undefined;
        }
        return Base58Check.decodeRaw(Buffer.from(buffer));
    }
    
    private static async decodeRaw(buffer: Buffer): Promise<Buffer|undefined> {
        const payload = buffer.slice(0, -4)
        const checksum = buffer.slice(-4)
        const newChecksum = await Base58Check.sha256x2(payload);
        // eslint-disable-next-line
        if (checksum[0] ^ newChecksum[0] |
            checksum[1] ^ newChecksum[1] |
            checksum[2] ^ newChecksum[2] |
            checksum[3] ^ newChecksum[3]) {
            return undefined;
        }
        return payload
    }
    
    // SHA256(SHA256(buffer))
    private static async sha256x2(buffer: Buffer): Promise<Buffer> {
        return CryptoService.sha256(await CryptoService.sha256(buffer));
    }
}
