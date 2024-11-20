import {HeaderInfo, ContentType} from "./Types";
import { CryptoService } from "./crypto/Crypto";
import * as RootLogger from "simplito-logger";
import {RwState} from "./RwState";
import { RpcUtils } from "./RpcUtils";

let Logger = RootLogger.get("privmx-rpc.RpcUtils")

export class FrameSerializer {
    
    version: number = 1
    maxDataLengthForSyncHmac: number = 256
    
    async parseHeader(input: Buffer, readState: RwState): Promise<HeaderInfo> {
        const result: HeaderInfo = {
            headerLength: 0,
            macLength: 0,
            iv: null,
            frameSeed: null,
            frameLength: 0,
            frameContentType: ContentType.ALERT,
        };
        let rawHeader: Buffer;
        if (!readState.initialized) {
            result.headerLength = 8;
            rawHeader = input.slice(0, 8);
        }
        else {
            const encryptedHeader = input.slice(0, 16);
            result.macLength = 16;
            result.headerLength = 16;
            result.iv = Buffer.from(encryptedHeader);
            
            const decryptedHeader = await CryptoService.aes256EcbDecrypt(encryptedHeader, readState.key);
            if (Logger.getLevel() == Logger.DEBUG) {
                Logger.debug("parseHeader: readState.key", readState.key.toString("hex"));
                Logger.debug("parseHeader: decrypted header", decryptedHeader.toString("hex"));
            }
            
            rawHeader = decryptedHeader.slice(0, 8);
            const frameHeaderTag = decryptedHeader.slice(8, 16);
            
            const seq = Buffer.alloc(8)
            seq.writeUInt32BE(readState.sequenceNumber >> 8, 0);
            seq.writeUInt32BE(readState.sequenceNumber & 0x00ff, 4);
            
            result.frameSeed = RpcUtils.concat2Buffers(seq, rawHeader);
            const hmac = await CryptoService.hmacSha256(readState.macKey, result.frameSeed);
            const expectedTag = hmac.slice(0, 8);
            if (!frameHeaderTag.equals(expectedTag)) {
                throw new Error("Invalid frame TAG in: " + rawHeader.toString("hex"));
            }
        }
        const frameVersion = rawHeader.readUInt8(0);
        if (frameVersion != this.version) {
            throw new Error("Unsupported version");
        }
        result.frameContentType = <ContentType>rawHeader.readUInt8(1);
        result.frameLength = rawHeader.readUInt32BE(2);
        if (result.frameLength == 0) {
            result.macLength = 0;
        }
        return result;
    }
    
    async readFrameData(headerInfo: HeaderInfo, readState: RwState, input: Buffer): Promise<Buffer> {
        if (headerInfo.frameLength == 0) {
            return Buffer.alloc(0);
        }
        const cipher = input.slice(headerInfo.headerLength, headerInfo.headerLength + headerInfo.frameLength);
        if (!readState.initialized) {
            return cipher;
        }
        const macData = RpcUtils.concat3Buffers(headerInfo.frameSeed, headerInfo.iv, cipher)
        const data = await CryptoService.hmacSha256(readState.macKey, macData);
        const expectedMac = data.slice(0, 16);
        const frameMac = input.slice(headerInfo.headerLength + headerInfo.frameLength, headerInfo.headerLength + headerInfo.frameLength + 16);
        if (!frameMac.equals(expectedMac)) {
            throw new Error("Invalid frame MAC")
        }
        return CryptoService.aes256CbcPkcs7Decrypt(cipher, readState.key, headerInfo.iv);
    }
    
    buildHeader(contentType: ContentType, frameLength: number): Buffer {
        const header = Buffer.alloc(8);
        header.writeUInt8(this.version, 0);
        header.writeUInt8(contentType, 1);
        header.writeUInt32BE(frameLength, 2);
        header.writeUInt8(0, 6);
        header.writeUInt8(0, 7);
        return header;
    }
    
    async buildFrame(packet: Buffer, writeState: RwState, contentType: ContentType = ContentType.APPLICATION_DATA): Promise<Buffer> {
        if (!writeState.initialized) {
            const header = this.buildHeader(contentType, packet.length);
            const result = RpcUtils.concat2Buffers(header, packet)
            if (Logger.getLevel() == Logger.DEBUG) {
                Logger.debug("sending plain - message:", result.toString("hex"));
            }
            return result;
        }
        Logger.debug("Creating encrypted message");
        let frameLength = packet.length;
        if (frameLength > 0) {
            frameLength = ((frameLength + 16) >> 4) << 4;
        }
        const rawHeader = this.buildHeader(contentType, frameLength);
        
        let seq = Buffer.alloc(8);
        seq.writeUInt32BE(writeState.sequenceNumber >> 8, 0);
        seq.writeUInt32BE(writeState.sequenceNumber & 0x00ff, 4);
        
        const frameSeed = RpcUtils.concat2Buffers(seq, rawHeader);
        
        const data = await CryptoService.hmacSha256(writeState.macKey, frameSeed);
        const frameHeaderTag = data.slice(0, 8);
        const headerToEncrypt = RpcUtils.concat2Buffers(rawHeader, frameHeaderTag);
        if (Logger.getLevel() == Logger.DEBUG) {
            Logger.debug("source header:", headerToEncrypt.toString("hex"));
        }
        const encryptedHeader = await CryptoService.aes256EcbEncrypt(headerToEncrypt, writeState.key);
        if (Logger.getLevel() == Logger.DEBUG) {
            Logger.debug("encrypted header: ", encryptedHeader.toString("hex"));
        }
        writeState.sequenceNumber += 1;
        let result: Buffer;
        if (frameLength == 0) {
            result = encryptedHeader;
        }
        else {
            const iv = Buffer.from(encryptedHeader);
            const encryptedFrameData = await CryptoService.aes256CbcPkcs7Encrypt(packet, writeState.key, iv);
            const allData = RpcUtils.concat3Buffers(frameSeed, iv, encryptedFrameData);
            const res = await CryptoService.hmacSha256(writeState.macKey, allData);
            const frameMac = res.slice(0, 16);
            result = RpcUtils.concat3Buffers(encryptedHeader, encryptedFrameData, frameMac);
        }
        if (Logger.getLevel() == Logger.DEBUG) {
            Logger.debug("sending encrypted - key:", writeState.key.toString("hex"));
            Logger.debug("sending encrypted - macKey:", writeState.macKey.toString("hex"));
            Logger.debug("sending encrypted - message:", result.toString("hex"));
        }
        return result;
    }
}
