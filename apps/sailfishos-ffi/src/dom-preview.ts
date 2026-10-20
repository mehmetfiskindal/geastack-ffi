type PreviewApp = {
  template(): Node
  refresh(): void
}

export function mount(Component: new () => PreviewApp): void {
  const root = document.getElementById('app')
  if (!root) throw new Error('missing #app')
  const app = new Component()
  const paint = () => {
    root.replaceChildren(app.template())
  }
  const refresh = app.refresh.bind(app)
  app.refresh = () => {
    refresh()
    paint()
  }
  paint()
}

export function h(
  tag: string,
  props: Record<string, unknown> | null,
  ...children: unknown[]
): HTMLElement {
  const el = document.createElement(tag)
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (key === 'class' && typeof value === 'string') el.className = value
      else if (key === 'onClick' && typeof value === 'function') el.addEventListener('click', value as EventListener)
      else if (value != null && value !== false) el.setAttribute(key, String(value))
    }
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue
    if (typeof child === 'string' || typeof child === 'number') el.append(document.createTextNode(String(child)))
    else el.append(child as Node)
  }
  return el
}
