export class HandleManager {
    private _map: {[id: string]: string} = {};
    private static id: number = 0;
    private static instance: HandleManager;
    public static get() {
        if (!this.instance) {
            this.instance = new HandleManager();
        }
        return this.instance;
    }
    private constructor() {}

    createHandle(label: string): number {
        const newId = ++HandleManager.id;
        this._map[newId] = label;
        return newId;
    }

    getHandleLabel(id: number) {
        if (!(id in this._map)){
            throw new Error("getHandleLabel: No handle with given id");
        }
        return this._map[id];
    }

    removeHandle(id: number) {
        if (!(id in this._map)){
            throw new Error("removeHandle: No handle with given id");
        }
        delete this._map[id];
    }
}