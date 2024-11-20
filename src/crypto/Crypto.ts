import BN = require("bn.js");

export interface Bip39 {
    extKey: Ecc.ExtKey
    entropy: Buffer
    mnemonic: string
}

export interface KEM {
    kE: Buffer;
    kM: Buffer;
}

export interface KdfParams {
    label?: string;
    seed?: Buffer;
    counters?: boolean;
    feedback?: boolean;
    context?: string|Buffer;
    iv?: string|Buffer;
}

export interface LoginStep1Result {
    A: Buffer;
    K: Buffer;
    M1: Buffer;
    M2: Buffer;
}

export class Crypto {
    
    static HASH_ALGORITHM_MAP: {[name: string]: string} = {
        sha1: "SHA-1",
        sha256: "SHA-256",
        sha512: "SHA-512"
    };
    static ECB_IV = Buffer.from("00000000000000000000000000000000", "hex");
    static ECB_PAD = Buffer.from("10101010101010101010101010101010", "hex");
    
    eccPrivRandom(): Ecc.PrivateKey {
        return Ecc.PrivateKey.generateRandom();
    }
    
    async bip39FromMnemonic(mnemonic: string, password?: string): Promise<Bip39> {
        const entropy = Buffer.from(await bip39.mnemonicToEntropy(mnemonic), "hex");
        const extKey = await this.bip39GetExtKey(mnemonic, password);
        return {
            entropy: entropy,
            mnemonic: mnemonic,
            extKey: extKey
        };
    }
    
    async bip39GetExtKey(mnemonic: string, password?: string): Promise<Ecc.ExtKey> {
        const seed = await bip39.mnemonicToSeed(mnemonic, password);
        return Ecc.ExtKey.fromSeed(seed);
    }
    
    randomBytes(length: number): Buffer {
        const result = Buffer.alloc(length);
        crypto.getRandomValues(result);
        return result;
    }
    
    async aes256CbcHmac256Encrypt(data: Buffer, key32: Buffer, iv?: Buffer, tagLen?: number): Promise<Buffer> {
        let kem: KEM, cipher: Buffer;
        return Promise.resolve().then(() => {
            if (!tagLen && tagLen !== 0) {
                tagLen = 16;
            }
            return this.getKEM("sha256", key32);
        })
        .then(k => {
            kem = k;
            return iv == null ? this.hmacSha256(key32, data) : iv;
        })
        .then(iv => {
            iv = iv.slice(0, 16);
            const prefix = Buffer.alloc(16);
            prefix.fill(0);
            data = Buffer.concat([prefix, data]);
            return this.aes256CbcPkcs7Encrypt(data, kem.kE, iv);
        })
        .then(c => {
            cipher = c;
            return this.hmacSha256(kem.kM, cipher);
        })
        .then(tag => {
            tag = tag.slice(0, tagLen);
            return Buffer.concat([cipher, tag]);
        });
    }
    
    async aes256CbcHmac256Decrypt(data: Buffer, key32: Buffer, tagLen?: number): Promise<Buffer> {
        let kem: KEM, tag: Buffer;
        return Promise.resolve().then(() => {
            if (!tagLen && tagLen !== 0) {
                tagLen = 16;
            }
            return this.getKEM("sha256", key32);
        })
        .then(k => {
            kem = k;
            tag = data.slice(data.length - tagLen);
            data = data.slice(0, data.length - tagLen);
            return this.hmacSha256(kem.kM, data);
        })
        .then(rTag => {
            rTag = rTag.slice(0, tagLen);
            if (!tag.equals(rTag)) {
                throw new Error("Wrong message security tag");
            }
            const iv = data.slice(0, 16);
            data = data.slice(16);
            return this.aes256CbcPkcs7Decrypt(data, kem.kE, iv);
        });
    }
    
    async getKEM(algo: string, key: Buffer, keLen?: number, kmLen?: number): Promise<KEM> {
        return Promise.resolve().then(() => {
            if (!keLen && keLen !== 0) {
                keLen = 32;
            }
            if (!kmLen && kmLen !== 0) {
                kmLen = 32;
            }
            return this.kdf(algo, keLen + kmLen, key, "key expansion");
        })
        .then(kEM => {
            return {
                kE: kEM.slice(0, keLen),
                kM: kEM.slice(keLen)
            };
        });
    }
    
    async kdf(algo: string, length: number, key: Buffer, options?: string|KdfParams): Promise<Buffer> {
        let result: Buffer;
        return Promise.resolve().then(() => {
            if (!options) {
                options = {};
            }
            if (typeof(options) === "string") {
                options = {label: options};
            }
            const counters = options.counters === false ? false : true;
            const feedback = options.feedback === false ? false : true;
            let seed = Buffer.alloc(0);
            const opt2buffer = (opt: Buffer|string) => {
                if (typeof(opt) === "string") {
                    return Buffer.from(opt);
                }
                if (opt instanceof Buffer) {
                    return opt;
                }
                return Buffer.alloc(0);
            };
            if (options.seed instanceof Buffer) {
                seed = options.seed;
            }
            else {
                const label = opt2buffer(options.label);
                const context = opt2buffer(options.context);
                seed = Buffer.alloc(label.length + context.length + 5);
                label.copy(seed);
                seed.writeUInt8(0, label.length);
                context.copy(seed, label.length + 1);
                seed.writeUInt32BE(length, label.length + context.length + 1);
            }
            let k = opt2buffer(options.iv);
            result = Buffer.alloc(0);
            let i = 1;
            const next = (): Promise<void>|void => {
                if (result.length >= length) {
                    return;
                }
                let input = Buffer.alloc(0);
                if (feedback) {
                    input = k;
                }
                if (counters) {
                    const count = Buffer.alloc(4);
                    count.writeUInt32BE(i++, 0);
                    input = Buffer.concat([input, count]);
                }
                input = Buffer.concat([input, seed]);
                return Promise.resolve().then(() => {
                    return this.hmac(algo, key, input);
                })
                .then(hmac => {
                    k = hmac;
                    result = Buffer.concat([result, k]);
                    return next();
                });
            };
            return next();
        })
        .then(() => {
            return result.slice(0, length);
        });
    }
    
    async hash(algorithm: string, data: Buffer): Promise<Buffer> {
        if (!BrowserBuffer.isBuffer(data)) {
            throw new Error("IllegalArgumentException data");
        }
        const myAlgorithm = Crypto.HASH_ALGORITHM_MAP[algorithm];
        const result = await window.crypto.subtle.digest({name: myAlgorithm}, BrowserBuffer.bufferToArray(data));
        return BrowserBuffer.arrayToBuffer(result);
    }
    
    async sha1(data: Buffer): Promise<Buffer> {
        return this.hash("sha1", data);
    }
    
    async sha256(data: Buffer): Promise<Buffer> {
        return this.hash("sha256", data);
    }
    
    async sha512(data: Buffer): Promise<Buffer> {
        return this.hash("sha512", data);
    }
    
    async hmac(digest: string, key: Buffer, data: Buffer): Promise<Buffer> {
        const algorithm = {
            name: "HMAC",
            hash: {name: Crypto.HASH_ALGORITHM_MAP[digest]}
        };
        const symmetric = await window.crypto.subtle.importKey("raw", BrowserBuffer.bufferToArray(key), algorithm, false, ["sign"]);
        const result = await window.crypto.subtle.sign(algorithm, symmetric, BrowserBuffer.bufferToArray(data));
        return BrowserBuffer.arrayToBuffer(result);
    }
    
    async hmacSha1(key: Buffer, data: Buffer): Promise<Buffer> {
        return this.hmac("sha1", key, data);
    }
    
    async hmacSha256(key: Buffer, data: Buffer): Promise<Buffer> {
        return this.hmac("sha256", key, data);
    }
    
    async hmacSha512(key: Buffer, data: Buffer): Promise<Buffer> {
        return this.hmac("sha512", key, data);
    }
    
    async aes256CbcPkcs7Decrypt(data: Buffer, key: Buffer, iv: Buffer): Promise<Buffer> {
        if (!BrowserBuffer.isBuffer(data) || data.length == 0) {
            throw new Error("IllegalArgumentException data");
        }
        if (!BrowserBuffer.isBuffer(key) || key.length != 32) {
            throw Error("IllegalArgumentException key");
        }
        if (!BrowserBuffer.isBuffer(iv) || iv.length != 16) {
            throw Error("IllegalArgumentException iv");
        }
        const aesKey = await window.crypto.subtle.importKey("raw", BrowserBuffer.bufferToArray(key), "AES-CBC", true, ["decrypt"]);
        const result = await window.crypto.subtle.decrypt({
            name: "AES-CBC",
            iv: BrowserBuffer.bufferToArray(iv)
        }, aesKey, BrowserBuffer.bufferToArray(data));
        return BrowserBuffer.arrayToBuffer(result);
    }
    
    async aes256CbcPkcs7Encrypt(data: Buffer, key: Buffer, iv: Buffer): Promise<Buffer> {
        if (!BrowserBuffer.isBuffer(data) || data.length == 0) {
            throw new Error("IllegalArgumentException data");
        }
        if (!BrowserBuffer.isBuffer(key) || key.length != 32) {
            throw new Error("IllegalArgumentException key");
        }
        if (!BrowserBuffer.isBuffer(iv) || iv.length != 16) {
            throw new Error("IllegalArgumentException iv");
        }
        const aesKey = await window.crypto.subtle.importKey("raw", BrowserBuffer.bufferToArray(key), "AES-CBC", true, ["encrypt"]);
        const result = await window.crypto.subtle.encrypt({
            name: "AES-CBC",
            iv: BrowserBuffer.bufferToArray(iv)
        }, aesKey, BrowserBuffer.bufferToArray(data));
        return BrowserBuffer.arrayToBuffer(result);
    }
    
    async signToCompactSignatureWithHash(priv: Ecc.PrivateKey, message: Buffer): Promise<Buffer> {
        const hash = await this.sha256(message);
        return this.signToCompactSignature(priv, hash);
    }
    
    async signToCompactSignature(priv: Ecc.PrivateKey, hash: Buffer): Promise<Buffer> {
        // TODO: send it to worker ???
        return priv.signToCompactSignature(hash);
    }
    
    async verifyCompactSignatureWithHash(pub: Ecc.PublicKey, message: Buffer, signature: Buffer): Promise<boolean> {
        const hash = await this.sha256(message);
        return this.verifyCompactSignature(pub, hash, signature);
    }
    
    async verifyCompactSignature(pub: Ecc.PublicKey, hash: Buffer, signature: Buffer): Promise<boolean> {
        // TODO: send it to worker ???
        return pub.verifyCompactSignature(hash, signature);
    }
    
    async eciesEncrypt(priv: Ecc.PrivateKey, pub: Ecc.PublicKey, data: Buffer): Promise<Buffer> {
        return priv.eciesEncrypt(pub, data);
    }
    
    async eciesDecrypt(priv: Ecc.PrivateKey, pub: Ecc.PublicKey, data: Buffer): Promise<Buffer> {
        return priv.eciesDecrypt(pub, data);
    }
    
    async prf_tls12(key: Buffer, seed: Buffer, length: number): Promise<Buffer> {
        let result: Buffer;
        return Promise.resolve().then(() => {
            let a = seed;
            result = Buffer.alloc(0);
            const next = (): Promise<void>|void => {
                if (result.length >= length) {
                    return;
                }
                return Promise.resolve().then(() => {
                    return this.hmacSha256(key, a);
                })
                .then(newA => {
                    a = newA;
                    return this.hmacSha256(key, Buffer.concat([a, seed]))
                })
                .then(d => {
                    result = Buffer.concat([result, d]);
                    return next();
                });
            };
            return next();
        })
        .then(() => {
            return result.slice(0, length);
        });
    }
    
    async srpLoginStep1(N: Buffer, g: Buffer, s: Buffer, B: Buffer, I: string, P: string): Promise<LoginStep1Result> {
        return this.srpLoginStep1A(N, g, s, B, I, P, this.randomBytes(64));
    }
    
    async srpLoginStep1A(N: Buffer, g: Buffer, s: Buffer, B: Buffer, I: string, P: string, a: Buffer): Promise<LoginStep1Result> {
        const srp = new SrpLogic();
        const result = await srp.login_step1(new BN(N), new BN(g), s, new BN(B), I, P, new BN(a));
        return {
            A: result.A.toArrayLike(Buffer),
            K: result.K.toArrayLike(Buffer, "be", 32),
            M1: result.M1.toArrayLike(Buffer),
            M2: result.M2.toArrayLike(Buffer)
        };
    }
    
    async pbkdf2(password: Buffer, salt: Buffer, rounds: number, length: number, algorithm: string): Promise<Buffer> {
        const key = await window.crypto.subtle.importKey("raw", BrowserBuffer.bufferToArray(password), "PBKDF2", false, ["deriveBits"]);
        const result = await window.crypto.subtle.deriveBits({
            name: "PBKDF2",
            salt: BrowserBuffer.bufferToArray(salt),
            iterations: rounds,
            hash: {name: Crypto.HASH_ALGORITHM_MAP[algorithm]}
        }, key, length * 8);
        return BrowserBuffer.arrayToBuffer(result);
    }
    
    getPasswordMixer(): PasswordMixer {
        return new PasswordMixer();
    }
    
    async ripemd160(data: Buffer): Promise<Buffer> {
        const hash = new Ripemd160();
        return hash.update(data).digest();
    }
    
    async hash160(data: Buffer): Promise<Buffer> {
        const x = await this.sha256(data);
        return this.ripemd160(x);
    }
    
    async aes256EcbEncrypt(data: Buffer, key: Buffer): Promise<Buffer> {
        if (data.length === 0 || data.length % 16 !== 0) {
            throw new Error("IllegalArgumentException data");
        }
        if (data.length !== 16) {
            throw new Error("Not implemented yet");
        }
        // Simulate ECB using CBC with IV set to 0, trim block with PKCS7 padding at the end
        const cipher = await this.aes256CbcPkcs7Encrypt(data, key, Crypto.ECB_IV);
        return cipher.slice(0, 16);
    }
    
    async aes256EcbDecrypt(data: Buffer, key: Buffer): Promise<Buffer> {
        if (data.length === 0 || data.length % 16 !== 0) {
            throw new Error("IllegalArgumentException data");
        }
        if (data.length !== 16) {
            throw new Error("Not implemented yet");
        }
        // Simulate ECB using CBS with IV set to 0
        // reconstruct missing block with PKCS7 padding
        const padding = await this.aes256CbcPkcs7Encrypt(Crypto.ECB_PAD, key, data);
        // and concat it with original buffer
        const cipher = Buffer.concat([data, padding.slice(0, 16)]);
        return this.aes256CbcPkcs7Decrypt(cipher, key, Crypto.ECB_IV);
    }
}

export interface WithToArrayBuffer {
    toArrayBuffer(): ArrayBuffer;
}

export type ConvertibleToArrayBuffer = Buffer|Uint8Array

export class BrowserBuffer {
    
    static bufferToArray(buffer: ConvertibleToArrayBuffer|WithToArrayBuffer): ArrayBuffer {
        if (typeof((<WithToArrayBuffer>buffer).toArrayBuffer) == "function") {
            return (<WithToArrayBuffer>buffer).toArrayBuffer();
        }
        const buf = <ConvertibleToArrayBuffer>buffer;
        const ab = new ArrayBuffer(buf.length);
        const view = new Uint8Array(ab);
        for (let i = 0; i < buf.length; ++i) {
            view[i] = buf[i];
        }
        return ab;
    }
    
    static arrayToBuffer(ab: ArrayBuffer): Buffer {
        return Buffer.from(ab).slice(0);
    }
    
    static isBuffer(arg: any): boolean {
        return Buffer.isBuffer(arg) || arg instanceof Uint8Array;
    }
    
    static createBlob(buffer: Buffer, mimetype: string): Blob {
        return new Blob([BrowserBuffer.bufferToArray(buffer)], {type: mimetype});
    }
}

export const CryptoService = new Crypto();

import * as Ecc from "./ecc";
import * as bip39 from "./Bip39";
import { SrpLogic } from "./SRP";
import { PasswordMixer } from "./PasswordMixer";
import { Ripemd160 } from "./Ripemd160";
