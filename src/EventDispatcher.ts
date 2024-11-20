import * as RootLogger from "simplito-logger";
const Logger = RootLogger.get("privmx-rpc.EventDispatcher");

export class EventDispatcher {
    
    private eventListeners: {[type: string]: Function[]};
    
    constructor() {
        this.eventListeners = {};
    }
    
    addEventListener(type: string, eventListener: Function): void {
        if (!(type in this.eventListeners)) {
            this.eventListeners[type] = [];
        }
        this.eventListeners[type].push(eventListener);
    }
    
    removeEventListener(type: string, eventListener: Function): void {
        if (!(type in this.eventListeners)) {
            return;
        }
        let index = this.eventListeners[type].indexOf(eventListener);
        if (index != -1) {
            this.eventListeners[type].splice(index, 1);
        }
    }
    
    dispatchEvent<T extends {type: string}>(event: T): void {
        if (event.type in this.eventListeners) {
            this.eventListeners[event.type].forEach(eventListener => {
                try {
                    eventListener(event);
                }
                catch (e) {
                    Logger.error({
                        message: "Uncaught exception during dispatching event",
                        eventListener: eventListener,
                        event: event,
                        cause: e
                    });
                }
            });
        }
    }
    
    clear() {
        this.eventListeners = {};
    }
}
