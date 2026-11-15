import { DEFAULTS, entries, FIELDS, needsRestart, parseTuning, RESTART_SECTIONS, SECTIONS, tuningDocument } from './tuning';
import type { Tuning } from './tuning';

export function mountTuningPanel(read: () => Tuning, apply: (next: Tuning, restart: boolean) => void, clearInput: () => void, focusAfterClose: () => void) {
  const panel = document.getElementById('tuning-panel')!;
  const toggle = document.getElementById('tuning-toggle')!;
  const status = document.getElementById('tuning-status')!;
  const controls = document.getElementById('tuning-sections')!;
  const commit = document.getElementById('tuning-apply') as HTMLButtonElement;
  const inputs = new Map<string, HTMLInputElement[]>();
  const crtStatus = document.createElement('p');
  crtStatus.id = 'crt-status'; crtStatus.className = 'tuning-note'; crtStatus.setAttribute('role', 'status');
  const parents: Partial<Record<keyof Tuning['crt'], keyof Tuning['crt']>> = {
    opticalDesktop: 'opticalEnabled', opticalMobile: 'opticalEnabled',
    scanlineStrength: 'scanlinesEnabled', scanlinePeriod: 'scanlinesEnabled',
    glowStrength: 'glowEnabled', glowRadius: 'glowEnabled', glowThreshold: 'glowEnabled',
    curvature: 'curvatureEnabled',
  };
  let draft = structuredClone(read());
  let fileRequest = 0;
  const report = (message: string, error = false): void => {
    status.textContent = message; status.dataset.error = String(error);
  };
  function refresh(): void {
    for (const [section, values] of entries(draft)) for (const [key, value] of Object.entries(values)) {
      for (const input of inputs.get(`${section}.${key}`) ?? []) {
        if (input.type === 'checkbox') input.checked = Boolean(value);
        else input.value = String(value);
      }
    }
    for (const [key] of entries(draft.crt)) for (const input of inputs.get(`crt.${key}`) ?? []) {
      const parent = parents[key];
      input.disabled = key !== 'enabled' && (!draft.crt.enabled || !!parent && !draft.crt[parent]);
      input.closest('.tuning-field')?.toggleAttribute('data-inactive', input.disabled);
    }
  }
  function accept(next: Tuning): void {
    draft = next;
    const unsafe = needsRestart(read(), next);
    commit.hidden = !unsafe;
    if (unsafe) report('Pending: geometry/projectile edits need a new run. Export still saves the current effective values.');
    else { apply(next, false); report('Applied live. Export saves all effective values.'); }
    refresh();
  }
  function tryEdit(edit: () => Tuning): void {
    try { accept(edit()); }
    catch (error) { report(error instanceof Error ? error.message : 'Invalid tuning values.', true); }
  }
  for (const [section, fields] of entries(FIELDS)) {
    const details = document.createElement('details');
    const summary = document.createElement('summary'); summary.textContent = SECTIONS[section];
    summary.tabIndex = 0;
    details.append(summary);
    if (section === 'crt') {
      details.append(crtStatus);
      const note = document.createElement('p'); note.className = 'tuning-note';
      note.textContent = 'Enable each effect before adjusting its amounts. Disabled values are kept. Threshold 1 removes glow. DOM menus and controls stay unfiltered for readability.';
      details.append(note);
    }
    if (RESTART_SECTIONS.includes(section)) {
      const note = document.createElement('p'); note.className = 'tuning-note';
      note.textContent = 'Changes apply together with a new run to preserve terrain and shot history.';
      details.append(note);
    }
    for (const [key, field] of Object.entries(fields)) {
      const row = document.createElement('div'); row.className = 'tuning-field';
      const label = document.createElement('label'); label.textContent = `${field.label}${field.unit ? ` (${field.unit})` : ''}`;
      const number = document.createElement('input'); number.type = field.toggle ? 'checkbox' : 'number'; number.id = `tune-${section}-${key}`;
      number.step = 'any'; label.htmlFor = number.id;
      const range = document.createElement('input'); range.type = 'range'; range.step = String(field.step);
      range.setAttribute('aria-label', `${field.label} slider`);
      const pair = field.toggle ? [number] : [number, range];
      for (const input of pair) {
        input.tabIndex = 0;
        input.min = String(field.min); input.max = String(field.max);
        input.addEventListener(input === range ? 'input' : 'change', () => {
          fileRequest++;
          tryEdit(() => {
            const values = structuredClone(draft);
            const group: Record<string, number> = values[section];
            group[key] = field.toggle ? Number(input.checked) : input.value === '' ? NaN : Number(input.value);
            return parseTuning(tuningDocument(values));
          });
        });
      }
      inputs.set(`${section}.${key}`, pair);
      row.append(label, ...pair); details.append(row);
    }
    controls.append(details);
  }
  function setOpen(open: boolean, restoreFocus = true): void {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(!panel.hidden));
    document.body.dataset.tuning = panel.hidden ? 'closed' : 'open';
    clearInput();
    if (open) panel.querySelector<HTMLElement>('summary')?.focus();
    else if (restoreFocus) focusAfterClose();
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  document.getElementById('tuning-close')!.addEventListener('click', () => setOpen(false));
  panel.addEventListener('focusin', clearInput);
  commit.addEventListener('click', () => {
    fileRequest++;
    try {
      const next = parseTuning(tuningDocument(draft));
      apply(next, true); commit.hidden = true; report('Applied to a fresh run. Click the graph or use touch controls to play.');
    } catch (error) {
      report(error instanceof Error ? error.message : 'Could not apply a new run.', true);
    }
  });
  document.getElementById('tuning-reset')!.addEventListener('click', () => {
    fileRequest++; accept(structuredClone(DEFAULTS));
  });
  document.getElementById('tuning-export')!.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(tuningDocument(read()), null, 2) + '\n'], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = 'forking-hell-tuning-v3.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    report('Exported complete effective settings. Unapplied edits are not included.');
  });
  const file = document.getElementById('tuning-file') as HTMLInputElement;
  document.getElementById('tuning-import')!.addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const selected = file.files?.[0]; file.value = '';
    if (!selected) return;
    const request = ++fileRequest;
    try {
      if (selected.size > 64 * 1024) throw new Error('Tuning JSON must be smaller than 64 KB.');
      const document = JSON.parse(await selected.text());
      const parsed = parseTuning(document);
      if (request === fileRequest) {
        accept(parsed);
        if (document.version === 1) report(`Migrated version 1: shared timing became equal lift/collapse durations; CRT and motion are off; jump effects use defaults. ${commit.hidden ? 'Applied live.' : 'Apply the pending new run.'}`);
        else if (document.version === 2) report(`Migrated version 2: added first-jump, double-jump and trail defaults; existing values are unchanged. ${commit.hidden ? 'Applied live.' : 'Apply the pending new run.'}`);
      }
    } catch (error) {
      if (request === fileRequest) report(error instanceof Error ? error.message : 'Could not read tuning JSON.', true);
    }
  });
  refresh();
  return {
    close: (restoreFocus = true): void => setOpen(false, restoreFocus),
    updateCrtStatus(view: { active: boolean; budgetBlocked: boolean; reduced: boolean; mobile: boolean; started: boolean }): void {
      const config = read().crt;
      const state = !config.enabled ? 'CRT is off.' : view.budgetBlocked ? 'CRT is bypassed: this canvas exceeds the GPU budget.' :
        view.active ? 'CRT is active.' : 'CRT has no active effect at these settings.';
      const reduced = view.reduced ? ' Reduced effects caps optical split at 0.25 CSS px, glow at 0.08 / 3 CSS px, scanline depth at 0.125, and disables curvature.' : '';
      const message = `${state} This viewport uses the ${view.mobile ? 'mobile' : 'desktop'} optical amount.${reduced}${view.started ? '' : ` Intro treatment uses the HUD / splash amount (${Math.round(config.hudStrength * 100)}%).`}`;
      if (crtStatus.textContent !== message) crtStatus.textContent = message;
    },
  };
}
