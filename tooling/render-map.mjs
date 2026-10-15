const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

/** A collision/position diagram, not generated artwork or biome assets. */
export function renderMapSvg(map) {
  const tile = 16, margin = 24, top = 60, width = map.bounds.width * tile + margin * 2, height = map.bounds.height * tile + top + 64;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    '<rect width="100%" height="100%" fill="#111827"/>',
    `<text x="24" y="26" fill="#f9fafb" font-family="sans-serif" font-size="18">hi-story · bounded map ${map.bounds.width} × ${map.bounds.height}</text>`,
    `<text x="24" y="46" fill="#9ca3af" font-family="sans-serif" font-size="12">seed: ${escape(map.seed)} · ${escape(map.generatorVersion)}</text>`];
  for (let y = 0; y < map.bounds.height; y++) for (let x = 0; x < map.bounds.width; x++) {
    const cell = map.cells[y][x];
    let fill = cell.walkable ? '#b4cfbf' : '#263244';
    if (cell.connectionIds.length && cell.regionId === null && cell.walkable) fill = '#e5d7ac';
    if (cell.terrainId !== null) fill = cell.walkable ? '#90c7c7' : '#567b92';
    if (cell.placementIds.length) fill = cell.walkable ? '#e9c26b' : '#b37caa';
    parts.push(`<rect x="${margin + x * tile}" y="${top + y * tile}" width="${tile}" height="${tile}" fill="${fill}" stroke="#111827" stroke-width="0.5"/>`);
  }
  for (const anchor of map.anchors) {
    const x = margin + (anchor.position.x + 0.5) * tile, y = top + (anchor.position.y + 0.5) * tile;
    parts.push(`<circle cx="${x}" cy="${y}" r="5" fill="#e94e57" stroke="#ffffff"/>`,
      `<text x="${x + 8}" y="${y - 6}" fill="#ffffff" stroke="#111827" stroke-width="3" paint-order="stroke" font-family="sans-serif" font-size="11">${escape(anchor.id)}</text>`);
  }
  parts.push(`<text x="24" y="${height - 38}" fill="#d1d5db" font-family="sans-serif" font-size="12">Green: walkable · Sand: corridor · Blue: terrain · Purple: blocking object</text>`,
    `<text x="24" y="${height - 18}" fill="#d1d5db" font-family="sans-serif" font-size="12">Gold: non-blocking object · Red: anchor · Dark: blocked / outside regions</text>`, '</svg>');
  return parts.join('\n');
}
