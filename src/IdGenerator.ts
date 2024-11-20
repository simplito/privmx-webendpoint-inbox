export class IdGenerator {
    
    private id: number = 0;
    
    generateNewId() {
        return this.id++;
    }
}
