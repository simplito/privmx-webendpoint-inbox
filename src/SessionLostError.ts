export class SessionLostError extends Error {
    
    constructor(message: string) {
        super("[SessionLostError] " + message);
        Object.setPrototypeOf(this, SessionLostError.prototype);
    }
}
