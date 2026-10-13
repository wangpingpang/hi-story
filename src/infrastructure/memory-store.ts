/** In-memory atomic persistence. No authoritative references escape. No cross-refresh save in v1. */
export class MemoryStore<T> {
 #value:T;
 constructor(initial:T){this.#value=structuredClone(initial);}
 read():T{return structuredClone(this.#value);}
 commit(value:T):void{const candidate=structuredClone(value);this.#value=candidate;}
}
