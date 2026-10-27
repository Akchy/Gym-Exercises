/**
 * Tiny DOM builder. All text goes through textContent / attributes (never innerHTML),
 * which removes the main XSS vector for user-entered text.
 */
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, string | number | boolean | null | undefined | EventListener>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, attrs: Attrs = {}, ...children: (Child | Child[])[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'value' && 'value' in el) {
      (el as HTMLInputElement).value = String(v);
    } else if (k === 'checked' && 'checked' in el) {
      (el as HTMLInputElement).checked = Boolean(v);
    } else {
      if (/^on/i.test(k)) throw new Error('Inline event handler strings are not allowed');
      el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

export function append(parent: Node, children: (Child | Child[])[]): void {
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    parent.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

const SVG_NS = 'http://www.w3.org/2000/svg';

export function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}, ...children: SVGElement[]): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  for (const c of children) el.appendChild(c);
  return el;
}

export function clear(el: Element): void {
  while (el.firstChild) el.removeChild(el.firstChild);
}

/** Labelled form field helper. */
let fieldCounter = 0;
export function field(label: string, control: HTMLElement, hint?: string): HTMLElement {
  const id = control.id || `f${++fieldCounter}`;
  control.id = id;
  return h('div', { class: 'field' }, h('label', { for: id }, label), control, hint ? h('small', { class: 'hint' }, hint) : null);
}

export function select<T extends string>(options: readonly (readonly [T, string])[], value: T, attrs: Attrs = {}): HTMLSelectElement {
  return h('select', attrs, ...options.map(([v, label]) => h('option', { value: v, selected: v === value }, label)));
}

export function titleCase(s: string): string {
  return s.replace(/(^|[-\s])(\w)/g, (_, sep: string, c: string) => (sep === '-' ? ' ' : sep) + c.toUpperCase());
}
