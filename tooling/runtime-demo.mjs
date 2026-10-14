import { createServer } from 'vite';
const server = await createServer({ server: { middlewareMode: true }, appType: 'custom' });
try {
  const { RuntimeSession } = await server.ssrLoadModule('/src/application/runtime-session.ts');
  const { generateCharacterWithParams } = await server.ssrLoadModule('/src/modules/characters/index.ts');
  const player = generateCharacterWithParams({ seed: 'runtime-demo-player', control: 'player', name: '旅人' });
  const enemy = generateCharacterWithParams({ seed: 'runtime-demo-enemy', name: '守路人' });
  let run = 0, sequence = 0;
  // Explicit test map, not the map generator's output.
  const session = new RuntimeSession({ seed: 'runtime-demo/1', visionRadius: 5,
    map: { id: 'demo-grid', width: 7, height: 5, spawn: { x: 1, y: 2 }, blocked: [{ x: 2, y: 1 }], locations: [{ id: 'gate', cells: [{ x: 2, y: 2 }, { x: 3, y: 2 }] }] },
    actors: [{ source: player }, { source: enemy, position: { x: 4, y: 2 }, options: { teamId: 'enemy', maxHp: 8 } }],
  }, () => `demo-run-${++run}`);
  const execute = (action, actorId = player.actorId) => {
    const view = session.query(); const result = session.dispatch({ commandId: `demo-${++sequence}`, runId: view.runId, actorId, expectedRevision: view.revision, action });
    if (!result.ok) throw Error(result.code + ': ' + result.message);
    return result;
  };
  const entered = execute({ type: 'world.move', destination: { x: 2, y: 2 } });
  execute({ type: 'world.move', destination: { x: 3, y: 2 } });
  const interaction = execute({ type: 'world.interact', targetId: enemy.actorId });
  const check = execute({ type: 'rules.check', attribute: 'wisdom', difficulty: 12 });
  execute({ type: 'combat.start', combatId: 'gate-fight', actorIds: [player.actorId, enemy.actorId] });
  const attacks = [];
  for (let i = 0; i < 200 && session.query().combat.status === 'active'; i++) {
    const battle = session.query().combat; const actorId = battle.order[battle.turnIndex];
    if (battle.actionAvailable) attacks.push(execute({ type: 'combat.attack', targetId: actorId === player.actorId ? enemy.actorId : player.actorId }, actorId).report);
    if (session.query().combat.status === 'active') execute({ type: 'combat.end-turn' }, actorId);
  }
  if (session.query().combat.status !== 'ended') throw Error('战斗未在示例上限内结束');
  console.log(JSON.stringify({ entered: entered.signals, interaction: interaction.signals, check: check.report,
    attacks, final: { combat: session.query().combat, hp: session.query().characters.actors.map(a => ({ actorId: a.actorId, hp: a.hp })) } }, null, 2));
} finally { await server.close(); }
