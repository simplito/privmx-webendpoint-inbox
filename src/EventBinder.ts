export interface EventTarget {
    addEventListener(type: string, eventListener: Function): void;
    removeEventListener(type: string, eventListener: Function): void;
}

export class EventBinder {
    
    private list: {eventTarget: EventTarget, type: string, eventListener: Function}[] = [];
    
    with<T extends EventTarget>(eventTarget: T, func: (eventTarget: T) => void) {
        func(<T><EventTarget>{
            addEventListener: (type: string, eventListener: Function): void => {
                this.list.push({eventTarget: eventTarget, type: type, eventListener: eventListener});
                eventTarget.addEventListener(type, eventListener);
            }
        });
    }
    
    clearFor(eventTarget: EventTarget) {
        this.list.filter(entry => {
            if (entry.eventTarget == eventTarget) {
                entry.eventTarget.removeEventListener(entry.type, entry.eventListener);
                return false;
            }
            return true;
        });
    }
    
    clear() {
        for (const entry of this.list) {
            entry.eventTarget.removeEventListener(entry.type, entry.eventListener);
        }
        this.list = [];
    }
}
