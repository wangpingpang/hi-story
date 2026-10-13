import type { Stage } from '../contracts';
export function scene(stage:Stage,morning:boolean){return `<svg class="landscape" viewBox="0 0 800 300" role="img" aria-label="${stage==='bridge'?'薄雾里的木桥与暖灯':stage==='river'?'旧渡口的木箱与旅人':'河岸驿站的灯火'}" shape-rendering="crispEdges">
<defs><linearGradient id="sky" x2="0" y2="1"><stop stop-color="${morning?'#596d76':'#182e3e'}"/><stop offset="1" stop-color="#527177"/></linearGradient><linearGradient id="water" x2="0" y2="1"><stop stop-color="#385960"/><stop offset="1" stop-color="#152f3b"/></linearGradient></defs>
<path fill="url(#sky)" d="M0 0h800v300H0z"/><path fill="#e6cd94" d="M637 32h28v28h-28z"/><path fill="#2c454e" d="M0 115h40V90h40V65h40v30h50v30h40V88h60V60h45v30h40v50h40V80h40V50h45v30h40v40h40V90h45V65h45v30h40v40h65v-35h45V65h30v70h60v165H0z"/>
<path fill="url(#water)" d="M0 176h800v124H0z"/><path stroke="#64838a" stroke-width="3" opacity=".6" d="M20 221h96m40 48h73m65-63h108m65 73h124m-9-48h96m49 36h60M15 294h64m238-43h77"/>
<path fill="#273d3c" d="M0 180h150v25h80v26H0zm570 0h230v72H668v-21h-98z"/>
<path fill="#5a5547" d="M90 172h615v16H90z"/><path fill="#b49c6b" d="M90 168h615v6H90z"/><path fill="#343e39" d="M120 185h12v81h-12zm155 0h12v52h-12zm180 0h12v80h-12zm195 0h12v56h-12z"/>
<path stroke="#8c8268" stroke-width="6" fill="none" d="M103 170v-35h40v20h120v-20h28v20h150v-20h28v20h154v-20h30v35"/>
${stage==='bridge'?'<path fill="#1d3033" d="M205 85h9v84h-9z"/><path fill="#d9a45f" d="M195 98h28v26h-28z"/><path fill="#ffe3a2" d="M201 101h16v19h-16z"/>':'<path fill="#815f44" d="M537 149h28v22h-28zm30-24h26v46h-26z"/><path stroke="#c29a64" stroke-width="3" d="M538 153h26m-13-3v20m18-40h22m-12-3v41"/>'}
${stage==='post'||stage==='ended'?'<path fill="#313f3c" d="M624 81h119v94H624z"/><path fill="#172c2d" d="m605 86 78-48 81 48z"/><path fill="#dcba77" d="M637 107h25v28h-25zm56 0h25v28h-25z"/><path fill="#13272b" d="M672 125h18v50h-18z"/>':''}
<g fill="#c9b68e"><path d="M379 124h14v14h-14z"/></g><path fill="#bf7454" d="M374 138h24v23h-24z"/><path fill="#172a30" d="M375 122h20v6h-20zm2 39h7v12h-7zm13 0h7v12h-7z"/><path fill="#ead4a5" d="M393 142h12v10h-12z"/>
${stage==='river'?'<path fill="#ccbc9b" d="M500 128h14v13h-14z"/><path fill="#70978c" d="M495 141h24v23h-24z"/><path fill="#172a30" d="M498 164h7v10h-7zm10 0h7v10h-7z"/>':''}
<g fill="#bfced0" opacity=".12"><path d="M0 130h270v12H0zm380-14h420v16H380zM30 193h340v10H30zm435 11h365v13H435z"/></g></svg>`;}
