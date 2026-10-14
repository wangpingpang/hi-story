export interface Inventory {coins:number; rope:number; sketch:boolean}
export const create=():Inventory=>({coins:3,rope:1,sketch:false});
export function consume(s:Inventory,cost:{coins:number;rope:number},sketch:boolean):Inventory {if(cost.coins<0||cost.rope<0||s.coins<cost.coins||s.rope<cost.rope) throw Error('物资不足'); return {coins:s.coins-cost.coins,rope:s.rope-cost.rope,sketch:s.sketch||sketch};}

export { createHoldings, quantity, setQuantity, adjustQuantity, setClue, validateHoldings, validateItemId, itemName } from './holdings';
export type { Holdings } from './holdings';
