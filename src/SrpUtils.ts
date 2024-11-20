import { RpcUtils } from "./RpcUtils";
import { CryptoService } from "./crypto/Crypto";
import { SrpInitPacket } from "./Types";

export class SrpUtils {
    
    static async prepareSrpLoginStep1(username: string, password: string, packet: SrpInitPacket) {
        const mixed = await SrpUtils.mixPassword(password, packet.loginData);
        const decoded = {
            g: RpcUtils.bufferFromHex(packet.g),
            N: RpcUtils.bufferFromHex(packet.N),
            s: RpcUtils.bufferFromHex(packet.s),
            B: RpcUtils.bufferFromHex(packet.B)
        };
        const step1 = await CryptoService.srpLoginStep1(decoded.N, decoded.g, decoded.s, decoded.B, username, mixed.toString("base64"));
        return {...step1, mixed, K: RpcUtils.fillTo32(step1.K)};
    }
    
    static async mixPassword(password: string, loginData: string) {
        const passwordMixer = CryptoService.getPasswordMixer();
        const deserializedLoginData = passwordMixer.deserializeData(loginData);
        return passwordMixer.perform(Buffer.from(password, "utf8"), deserializedLoginData);
    }
    
    static verifyM2(myM2: Buffer, serverM2: string) {
        const bigM2Hex = myM2.toString("hex");
        if (bigM2Hex != serverM2) {
            throw new Error(`Invalid M2 ${bigM2Hex} != ${serverM2}`);
        }
    }
}
