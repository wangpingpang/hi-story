export const create=()=>({luyanTrust:0});
export function acknowledgeHelp(s:ReturnType<typeof create>){return {luyanTrust:s.luyanTrust+1};}
