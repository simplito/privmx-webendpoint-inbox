export class AlertError extends Error {
    
    constructor(message: string) {
        super("[AlertError] " + message);
        Object.setPrototypeOf(this, AlertError.prototype);
    }
    
    isError(message: string) {
        return this.message == "[AlertError] " + message;
    }
}
