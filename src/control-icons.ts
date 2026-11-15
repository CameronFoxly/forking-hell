const paths: Record<string, string> = {
  left: 'M6 2h2v2H6v2H4v4h2v2h2v2H6v-2H4v-2H2V6h2V4h2z M6 7h8v2H6z',
  right: 'M8 2h2v2h2v2h2v4h-2v2h-2v2H8v-2h2v-2h2V6h-2V4H8z M2 7h8v2H2z',
  branch: 'M2 1h4v4H2z M10 1h4v4h-4z M3 5h2v3h2v2h2V8h2V5h2v4h-2v2H9v4H7v-4H5V9H3z',
  merge: 'M2 1h4v4H2z M10 1h4v4h-4z M3 5h2v2h2v2h2V7h2V5h2v3h-2v2H9v1h3v2h-2v2H6v-2H4v-2h3v-1H5V8H3z',
  jump: 'M7 1h2v2h2v2h2v2h-2V5H9v7H7V5H5v2H3V5h2V3h2z M2 13h12v2H2z',
};

export function installControlIcons(): void {
  for (const host of document.querySelectorAll<HTMLElement>('[data-icon]')) {
    const path = paths[host.dataset.icon!];
    if (!path) throw new Error(`Unknown control icon: ${host.dataset.icon}`);
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    svg.setAttribute('shape-rendering', 'crispEdges');
    const shape = document.createElementNS(svg.namespaceURI, 'path');
    shape.setAttribute('d', path);
    shape.setAttribute('fill', 'currentColor');
    svg.append(shape); host.append(svg);
  }
}
