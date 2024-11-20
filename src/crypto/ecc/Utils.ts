export function fillWithZeroesTo32(buffer: Buffer) {
    return buffer.length < 32 ? Buffer.concat([Buffer.alloc(32 - buffer.length).fill(0), buffer]) : buffer;
}
