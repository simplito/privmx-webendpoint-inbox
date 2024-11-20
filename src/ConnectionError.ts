export class ConnectionError extends Error {
    
    constructor(public cause: any) {
        super("[ConnectionError]" + (cause && cause.message ? " " + cause.message : (cause && cause.type ? " type=" + cause.type : "")));
        Object.setPrototypeOf(this, ConnectionError.prototype);
    }
}
