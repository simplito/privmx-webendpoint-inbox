import { BaseChannel } from "./BaseChannel";
import { AjaxRequester } from "./ajax/AjaxRequester";
import { Deferred } from "./Types";
import { RpcUtils } from "./RpcUtils";

export class AjaxChannel extends BaseChannel {
    
    private requestMap = new Set<Deferred<Buffer>>();
    
    constructor(private url: string) {
        super();
    }
    
    async send(buffer: Buffer, messagePriority: number, timeout: number): Promise<Buffer> {
        const defer = RpcUtils.executeInDefer(async () => {
            const response = await AjaxRequester.INSTANCE.send({
                method: "POST",
                url: this.url,
                contentType: "application/octet-stream",
                data: buffer,
                timeout: timeout,
                priority: messagePriority
            });
            if (response.statusCode != 200) {
                throw new Error("Wrong response status: " + response.statusCode);
            }
            return Buffer.from(response.data);
        });
        this.requestMap.add(defer);
        return defer.promise;
    }
    
    stopAll() {
        for (const request of this.requestMap) {
            request.reject({type: "disconnected"});
        }
        this.requestMap.clear();
    }
}
