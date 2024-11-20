import { EventDispatcher } from "./EventDispatcher";
import { DisconnectEvent } from "./Types";

export interface Channel {
    send(buffer: Buffer, messagePriority: number, timeout: number): Promise<Buffer>;
}

export abstract class BaseChannel implements Channel {
    
    protected eventDispatcher: EventDispatcher;
    protected disconnected: boolean;
    
    constructor() {
        this.eventDispatcher = new EventDispatcher();
    }
    
    abstract send(buffer: Buffer, messagePriority: number, timeout: number): Promise<Buffer>;
    
    disconnect(): void {
        if (this.disconnected) {
            return;
        }
        this.disconnected = true;
        this.eventDispatcher.dispatchEvent<DisconnectEvent>({type: "disconnected", cause: "Manual disconnect"});
    }
    
    addEventListener(type: "disconnected", eventListener: (event: DisconnectEvent) => void): void {
        this.eventDispatcher.addEventListener(type, eventListener);
    }
    
    removeEventListener(type: "disconnected", eventListener: (event: DisconnectEvent) => void): void {
        this.eventDispatcher.removeEventListener(type, eventListener);
    }
}
