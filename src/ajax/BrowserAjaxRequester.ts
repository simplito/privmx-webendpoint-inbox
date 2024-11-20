import { AjaxOptions, AjaxResponse } from "./AjaxRequester";

export class AjaxRequester {
    
    static INSTANCE = new AjaxRequester();
    
    send(options: AjaxOptions): Promise<AjaxResponse> {
        return new Promise<AjaxResponse>((resolve, reject) => {
            const req = new XMLHttpRequest();
            req.open(options.method, options.url, true);
            req.responseType = "arraybuffer";
            if (options.contentType) {
                req.setRequestHeader("Content-Type", options.contentType);
            }
            if (options.timeout) {
                req.timeout = options.timeout;
                req.ontimeout = (err) => {
                    reject(err);
                };
            }
            req.onload = (evt) => {
                const status = (<XMLHttpRequest>evt.currentTarget).status;
                resolve({
                    statusCode: status,
                    data: <ArrayBuffer>req.response
                });
            }
            req.onerror = (err) => {
                reject(err);
            };
            req.send(options.data);
        });
    }
}
