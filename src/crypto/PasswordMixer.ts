import { CryptoService } from "./Crypto";

export interface PasswordMixerData {
    algorithm: string;
    hash: string;
    length: number;
    rounds: number;
    salt: Buffer;
    version: number;
}

export interface LoginData {
    mixed: Buffer;
    data: PasswordMixerData;
}

export class PasswordMixerBase {
    
    static serializeData(data: PasswordMixerData): string {
        return JSON.stringify({
            algorithm: data.algorithm,
            hash: data.hash,
            length: data.length,
            rounds: data.rounds,
            salt: data.salt.toString("base64"),
            version: data.version
        });
    }
    
    static deserializeData(raw: string): PasswordMixerData {
        const data = JSON.parse(raw);
        data.salt = Buffer.from(data.salt, "base64");
        return data;
    }
    
    static async generatePbkdf2(password: Buffer): Promise<LoginData> {
        const data: PasswordMixerData = {
            algorithm: "PBKDF2",
            hash: "SHA512",
            length: 16,
            rounds: 4000 + Math.floor(Math.random() * 1000),
            salt: CryptoService.randomBytes(16),
            version: 1
        };
        const mixed = await PasswordMixerBase.perform(password, data);
        return {
            mixed: mixed,
            data: data
        };
    }
    
    static async perform(password: Buffer, data: PasswordMixerData): Promise<Buffer> {
        if (data.algorithm == "PBKDF2") {
            if (data.hash != "SHA512") {
                throw new Error("Not supported hash algorithm '" + data.hash + "'");
            }
            if (data.version != 1) {
                throw new Error("Not supported version '" + data.version + "'");
            }
            if (data.salt.length != 16 || data.length != 16) {
                throw new Error("Invalid parameters");
            }
            return CryptoService.pbkdf2(password, data.salt, data.rounds, data.length, data.hash.toLowerCase());
        }
        throw new Error("Not supported algorithm '" + data.algorithm + "'");
    }
}

export class PasswordMixer {
    
    serializeData(data: PasswordMixerData): string {
        return PasswordMixerBase.serializeData(data);
    }
    
    deserializeData(raw: string): PasswordMixerData {
        return PasswordMixerBase.deserializeData(raw);
    }
    
    generatePbkdf2(password: Buffer): Promise<LoginData> {
        return PasswordMixerBase.generatePbkdf2(password);
    }
    
    perform(password: Buffer, data: PasswordMixerData): Promise<Buffer> {
        return PasswordMixerBase.perform(password, data);
    }
}
