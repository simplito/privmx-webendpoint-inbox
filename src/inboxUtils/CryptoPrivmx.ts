import { CryptoService } from "../crypto/Crypto";

export type OptionsAlgorithm = "AES_256_CBC" | "XTEA_ECB";
export type OptionsHmac = "NO_HMAC" | "SHA_256";
export enum CipherType {
    AES_256_CBC_PKCS7_NO_IV = 1,
    AES_256_CBC_PKCS7_WITH_IV = 2,
    XTEA_ECB_PKCS7 = 3,
    AES_256_CBC_PKCS7_WITH_IV_AND_HMAC_SHA256 = 4
};
export interface PrivmxEncryptOptions {
    algorithm: OptionsAlgorithm;
    attachIv: boolean;
    hmac: "NO_HMAC" | "SHA_256";
    deterministic: boolean;
    taglen: number;
};


export class CryptoPrivmx {
    static async ctAes256CbcPkcs7NoIv(data: Buffer, key: Buffer, iv: Buffer): Promise<Buffer> {
        const cipher = await CryptoService.aes256CbcPkcs7Encrypt(data, key, iv);
        return Buffer.concat([Buffer.from([CipherType.AES_256_CBC_PKCS7_NO_IV]), cipher]);
    }

    static async ctAes256CbcPkcs7WithIv(data: Buffer, key: Buffer, iv: Buffer): Promise<Buffer> {
        const cipher = await CryptoService.aes256CbcPkcs7Encrypt(data, key, iv);
        return Buffer.concat([Buffer.from([CipherType.AES_256_CBC_PKCS7_WITH_IV]), iv, cipher]);
    }

    static async ctAes256CbcPkcs7WithIvAndHmacSha256(data: Buffer, key: Buffer, iv?: Buffer, tagLen?: number): Promise<Buffer> {
        const cipher = await CryptoService.aes256CbcHmac256Encrypt(data, key, iv, tagLen);
        return Buffer.concat([Buffer.from([CipherType.AES_256_CBC_PKCS7_WITH_IV_AND_HMAC_SHA256]), cipher]);
    }

    static async ctAes256CbcPkcs7WithRandomIv(data: Buffer, key: Buffer): Promise<Buffer> {
        return this.ctAes256CbcPkcs7WithIv(data, key, CryptoService.randomBytes(16));
    }

    static async ctDecrypt(data: Buffer, key32: Buffer, iv16?: Buffer, tagLen?: number, _key16?: Buffer): Promise<Buffer> {
        if (key32.length !== 32) {
            throw new Error("Decrypt invalid key length, required: 32, have: " + key32.length + " " + key32.toString("hex"));
        }
        const type = data.readUInt8(0);
        if (type == CipherType.AES_256_CBC_PKCS7_NO_IV) {
            if (iv16 == null) {
                throw new Error("Missing IV");
            }
            return CryptoService.aes256CbcPkcs7Decrypt(data.slice(1), key32, iv16);
        }
        if (type == CipherType.AES_256_CBC_PKCS7_WITH_IV) {
            return CryptoService.aes256CbcPkcs7Decrypt(data.slice(17), key32, data.slice(1, 17));
        }
        if (type == CipherType.XTEA_ECB_PKCS7) {
            // return key16 ? CryptoService.xteaEcbPkcs7Decrypt(data.slice(1), key16) : crypto.xteaEcbPkcs7Key32Decrypt(data.slice(1), key32);
            throw new Error("Not implemented");
        }
        if (type == CipherType.AES_256_CBC_PKCS7_WITH_IV_AND_HMAC_SHA256) {
            return CryptoService.aes256CbcHmac256Decrypt(data.slice(1), key32, tagLen);
        }
        throw new Error("Unknown decryption type " + type);

    }

    static getEncryptOptions(algorithm: OptionsAlgorithm, hmac: OptionsHmac = "NO_HMAC", attachIv: boolean = false, deterministic: boolean = false): PrivmxEncryptOptions {
        return {
            algorithm, attachIv, hmac, deterministic, taglen: 16
        } 
    }

    static privmxGetBlockSize(options: PrivmxEncryptOptions, block_size: number): number {
        let size = block_size - 1;
        if (options.attachIv) {
            size -= 16;
        }
        if (options.hmac != "NO_HMAC") {
            size -= options.taglen;
        }
        return size - (size % 16) - 1;
    }
    
    static async privmxEncrypt(options: PrivmxEncryptOptions, data: Buffer, key: Buffer, iv?: Buffer): Promise<Buffer> {
        if (key.length !== 32) {
            throw new Error("privmxEncrypt: key length required: 32");
        }
        if (options.algorithm === "AES_256_CBC") {
            if (options.hmac !== "NO_HMAC") {
                if (options.hmac != "SHA_256" || !options.attachIv) {
                    throw new Error("privmxEncrypt: Only Hmac SHA256 With Iv Is Supported For AES256CBC")
                }
                if (options.deterministic) {
                    if (options.attachIv) {
                        throw new Error("privmxEncrypt: Cannot Pass Iv To Deterministic AES256CBCHmacSHA256");
                    }
                } else {
                    if (!iv) {
                        iv = CryptoService.randomBytes(16);
                    }
                    // return CipherType::AES_256_CBC_PKCS7_WITH_IV_AND_HMAC_SHA256 + aes256CbcHmac256Encrypt(data, key, iv, taglen);
                    return this.ctAes256CbcPkcs7WithIvAndHmacSha256(data, key, iv, options.taglen);
                }
            }
            if (!iv) {
                iv = CryptoService.randomBytes(16);
            }
            if (options.attachIv) {
                return  this.ctAes256CbcPkcs7WithIv(data, key, iv);
            }
            return this.ctAes256CbcPkcs7NoIv(data, key, iv);
        } else if (options.algorithm === "XTEA_ECB") {
            if (options.hmac !== "NO_HMAC" || iv.length > 0 || options.attachIv) {
                throw new Error("privmxEncrypt: XTEA ECB Encryption Doesnt Support Hmac And Iv");
            }
            throw new Error("Not implemented encryption case");
        }
        throw new Error("Unsupported Encryption Algorithm");
    }
    
    static async privmxDecrypt(is_signed: boolean, data: Buffer, key32: Buffer, iv16?: Buffer, taglen: number = 16): Promise<Buffer> {
        if (is_signed && data.readUInt8(0) != CipherType.AES_256_CBC_PKCS7_WITH_IV_AND_HMAC_SHA256) {
            throw new Error("privmxDecrypt: Missing Required Signature");
        }
        return this.ctDecrypt(data, key32, iv16, taglen);
    }
    
    static async privmxDecryptNoSig(data: Buffer, key32: Buffer, iv16: Buffer, taglen: number) {
        return this.privmxDecrypt(false, data, key32, iv16, taglen);
    }


    // options helpers
    static privmxOptAesWithSignature(): PrivmxEncryptOptions {
        // static const PrivmxEncryptOptions options{PrivmxEncryptOptions::AES_256_CBC, true, PrivmxEncryptOptions::SHA_256};
        return this.getEncryptOptions("AES_256_CBC", "SHA_256", true);
    }
    
    static privmxOptAesWithDettachedIv(): PrivmxEncryptOptions {
        // static const PrivmxEncryptOptions options{PrivmxEncryptOptions::AES_256_CBC};
        return this.getEncryptOptions("AES_256_CBC");
    }
    
    static privmxOptAesWithAttachedIv(): PrivmxEncryptOptions {
        // static const PrivmxEncryptOptions options{PrivmxEncryptOptions::AES_256_CBC, true};
        return this.getEncryptOptions("AES_256_CBC", null, true);
    }

}