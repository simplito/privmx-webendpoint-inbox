import * as RootLogger from "simplito-logger";
const Logger = RootLogger.get("privmx-rpc.Scheduler");

export class Scheduler {
    
    private timeoutId: NodeJS.Timer;
    
    constructor(private timeout: number, private callback: Function) {
    }
    
    isScheduled(): boolean {
        return this.timeoutId != null;
    }
    
    schedule(): void {
        if (this.isScheduled()) {
            return;
        }
        this.timeoutId = setTimeout(() => {
            this.timeoutId = null;
            try {
                this.callback();
            }
            catch (e) {
                Logger.error("Error during running schedule callback", e);
            }
        }, this.timeout);
    }
    
    clear() {
        if (this.isScheduled()) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }
}
