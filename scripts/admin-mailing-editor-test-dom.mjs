/**
 * Small DOM used only by the mailing-editor recipient test.
 * React 19 client rendering needs real nodes and bubbling events; this stays
 * inside the existing Node test runner and does not add a dependency.
 */

const ELEMENT_NODE = 1;
const TEXT_NODE = 3;
const COMMENT_NODE = 8;
const DOCUMENT_NODE = 9;
const DOCUMENT_FRAGMENT_NODE = 11;

function createChildList() {
  const list = [];
  list.item = (index) => list[index] ?? null;
  return list;
}

class Node {
  constructor(nodeType) {
    this.nodeType = nodeType;
    this.nodeName = "#node";
    this.childNodes = createChildList();
    this.parentNode = null;
    this.ownerDocument = null;
    this.nodeValue = null;
    this._listeners = new Map();
  }

  _bucket(type) {
    let bucket = this._listeners.get(type);
    if (!bucket) {
      bucket = { capture: new Set(), bubble: new Set() };
      this._listeners.set(type, bucket);
    }
    return bucket;
  }

  addEventListener(type, listener, options) {
    const capture = options === true || Boolean(options && options.capture);
    const bucket = this._bucket(type);
    bucket[capture ? "capture" : "bubble"].add(listener);
  }

  removeEventListener(type, listener, options) {
    const capture = options === true || Boolean(options && options.capture);
    const bucket = this._listeners.get(type);
    if (!bucket) return;
    bucket[capture ? "capture" : "bubble"].delete(listener);
  }

  _invoke(event, capture) {
    const bucket = this._listeners.get(event.type);
    if (!bucket) return;
    event.currentTarget = this;
    event.eventPhase = this === event.target ? 2 : capture ? 1 : 3;
    for (const listener of [...bucket[capture ? "capture" : "bubble"]]) {
      listener.call(this, event);
      if (event._immediateStopped) return;
    }
  }

  dispatchEvent(event) {
    event.target = this;
    event.srcElement = this;
    const ancestors = [];
    let parent = this.parentNode;
    while (parent) {
      ancestors.push(parent);
      parent = parent.parentNode;
    }
    event.composedPath = () => [this, ...ancestors];
    for (let index = ancestors.length - 1; index >= 0; index -= 1) {
      ancestors[index]._invoke(event, true);
      if (event._stopped) return !event.defaultPrevented;
    }
    this._invoke(event, true);
    if (event._immediateStopped) return !event.defaultPrevented;
    this._invoke(event, false);
    if (!event.bubbles || event._stopped) return !event.defaultPrevented;
    for (const ancestor of ancestors) {
      ancestor._invoke(event, false);
      if (event._stopped) break;
    }
    return !event.defaultPrevented;
  }

  get nextSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return this.parentNode.childNodes[index + 1] ?? null;
  }

  get previousSibling() {
    if (!this.parentNode) return null;
    const index = this.parentNode.childNodes.indexOf(this);
    return index > 0 ? this.parentNode.childNodes[index - 1] : null;
  }

  get parentElement() {
    return this.parentNode && this.parentNode.nodeType === ELEMENT_NODE ? this.parentNode : null;
  }

  get firstChild() {
    return this.childNodes[0] ?? null;
  }

  get lastChild() {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get textContent() {
    if (this.nodeType === TEXT_NODE || this.nodeType === COMMENT_NODE) {
      return this.nodeValue ?? "";
    }
    return this.childNodes.map((child) => child.textContent ?? "").join("");
  }

  set textContent(value) {
    if (this.nodeType === TEXT_NODE || this.nodeType === COMMENT_NODE) {
      this.nodeValue = value == null ? "" : String(value);
      return;
    }
    this.childNodes.splice(0, this.childNodes.length);
    const text = value == null ? "" : String(value);
    if (!text) return;
    const documentNode = this.nodeType === DOCUMENT_NODE ? this : this.ownerDocument;
    const textNode = documentNode.createTextNode(text);
    textNode.parentNode = this;
    this.childNodes.push(textNode);
  }

  get isConnected() {
    if (this.nodeType === DOCUMENT_NODE) return true;
    return Boolean(this.parentNode && this.parentNode.isConnected);
  }

  getRootNode() {
    return this.isConnected ? this.ownerDocument ?? this : this;
  }

  contains(node) {
    let current = node;
    while (current) {
      if (current === this) return true;
      current = current.parentNode;
    }
    return false;
  }

  appendChild(node) {
    return this.insertBefore(node, null);
  }

  insertBefore(node, reference) {
    const incoming = node.nodeType === DOCUMENT_FRAGMENT_NODE ? [...node.childNodes] : [node];
    if (node.nodeType === DOCUMENT_FRAGMENT_NODE) {
      node.childNodes.splice(0, node.childNodes.length);
    }
    for (const child of incoming) {
      if (child.parentNode) child.parentNode.removeChild(child);
      child.parentNode = this;
      if (!reference) {
        this.childNodes.push(child);
      } else {
        const index = this.childNodes.indexOf(reference);
        if (index < 0) throw new Error("NotFoundError");
        this.childNodes.splice(index, 0, child);
      }
    }
    return node;
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node);
    if (index < 0) throw new Error("NotFoundError");
    this.childNodes.splice(index, 1);
    node.parentNode = null;
    return node;
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this);
  }
}

class TextNode extends Node {
  constructor(value) {
    super(TEXT_NODE);
    this.nodeName = "#text";
    this.nodeValue = value;
  }
}

class CommentNode extends Node {
  constructor(value) {
    super(COMMENT_NODE);
    this.nodeName = "#comment";
    this.nodeValue = value;
  }
}

class Attr {
  constructor(name, value, ownerElement) {
    this.name = name;
    this.value = value;
    this.ownerElement = ownerElement;
  }
}

class Element extends Node {
  constructor(tag) {
    super(ELEMENT_NODE);
    this.tagName = String(tag).toUpperCase();
    this.nodeName = this.tagName;
    this.namespaceURI = "http://www.w3.org/1999/xhtml";
    this._attributes = [];
    this.style = new Proxy(
      {},
      {
        get: () => "",
        set: () => true,
      },
    );
    this._value = "";
    this._checked = false;
  }

  get attributes() {
    return this._attributes;
  }

  setAttribute(name, value) {
    const existing = this._attributes.find((attribute) => attribute.name === name);
    const next = String(value);
    if (existing) {
      existing.value = next;
      return;
    }
    this._attributes.push(new Attr(name, next, this));
  }

  setAttributeNS(_namespace, name, value) {
    this.setAttribute(name, value);
  }

  getAttribute(name) {
    const existing = this._attributes.find((attribute) => attribute.name === name);
    return existing ? existing.value : null;
  }

  hasAttribute(name) {
    return this._attributes.some((attribute) => attribute.name === name);
  }

  removeAttribute(name) {
    const index = this._attributes.findIndex((attribute) => attribute.name === name);
    if (index >= 0) this._attributes.splice(index, 1);
  }

  removeAttributeNode(attribute) {
    this.removeAttribute(attribute.name);
    return attribute;
  }

  click() {
    this.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
  }

  focus() {}

  blur() {}

  get id() {
    return this.getAttribute("id") ?? "";
  }

  set id(value) {
    this.setAttribute("id", value);
  }

  get className() {
    return this.getAttribute("class") ?? "";
  }

  set className(value) {
    this.setAttribute("class", value);
  }

  get type() {
    if (this.tagName === "INPUT") return this.getAttribute("type") || "text";
    return this.getAttribute("type") ?? "";
  }

  set type(value) {
    this.setAttribute("type", value);
  }

  get name() {
    return this.getAttribute("name") ?? "";
  }

  set name(value) {
    this.setAttribute("name", value);
  }
}

function defineTrackedField(prototype, field, storage) {
  Object.defineProperty(prototype, field, {
    configurable: true,
    enumerable: true,
    get() {
      return this[storage];
    },
    set(value) {
      this[storage] = field === "checked" ? Boolean(value) : String(value);
    },
  });
}

class HTMLElement extends Element {}

class HTMLInputElement extends HTMLElement {
  constructor() {
    super("input");
  }
}

class HTMLTextAreaElement extends HTMLElement {
  constructor() {
    super("textarea");
  }
}

class HTMLSelectElement extends HTMLElement {
  constructor() {
    super("select");
  }

  get options() {
    return this.childNodes.filter((child) => child.tagName === "OPTION");
  }
}

class HTMLOptionElement extends HTMLElement {
  constructor() {
    super("option");
  }
}

class HTMLButtonElement extends HTMLElement {
  constructor() {
    super("button");
  }
}

class HTMLIFrameElement extends HTMLElement {
  constructor() {
    super("iframe");
  }
}

class HTMLFormElement extends HTMLElement {
  constructor() {
    super("form");
  }
}

defineTrackedField(HTMLInputElement.prototype, "value", "_value");
defineTrackedField(HTMLInputElement.prototype, "checked", "_checked");
defineTrackedField(HTMLTextAreaElement.prototype, "value", "_value");
defineTrackedField(HTMLSelectElement.prototype, "value", "_value");
defineTrackedField(HTMLOptionElement.prototype, "value", "_value");
Object.defineProperty(HTMLOptionElement.prototype, "selected", {
  configurable: true,
  enumerable: true,
  get() {
    return this._selected === true;
  },
  set(value) {
    this._selected = Boolean(value);
  },
});

class DocumentFragment extends Node {
  constructor() {
    super(DOCUMENT_FRAGMENT_NODE);
    this.nodeName = "#document-fragment";
  }
}

class DocumentNode extends Node {
  constructor() {
    super(DOCUMENT_NODE);
    this.nodeName = "#document";
    this.defaultView = null;
    this.activeElement = null;
    this.oninput = null;
    this.onchange = null;
    this.onclick = null;
  }

  createElement(tag) {
    const name = String(tag).toLowerCase();
    let element;
    if (name === "input") element = new HTMLInputElement();
    else if (name === "textarea") element = new HTMLTextAreaElement();
    else if (name === "select") element = new HTMLSelectElement();
    else if (name === "option") element = new HTMLOptionElement();
    else if (name === "button") element = new HTMLButtonElement();
    else if (name === "iframe") element = new HTMLIFrameElement();
    else if (name === "form") element = new HTMLFormElement();
    else element = new HTMLElement(name);
    element.ownerDocument = this;
    return element;
  }

  createElementNS(_namespace, tag) {
    return this.createElement(tag);
  }

  createTextNode(text) {
    const node = new TextNode(String(text));
    node.ownerDocument = this;
    return node;
  }

  createComment(text) {
    const node = new CommentNode(String(text));
    node.ownerDocument = this;
    return node;
  }

  createDocumentFragment() {
    const fragment = new DocumentFragment();
    fragment.ownerDocument = this;
    return fragment;
  }

  get documentElement() {
    return this._documentElement ?? null;
  }

  get head() {
    return this._head ?? null;
  }

  get body() {
    return this._body ?? null;
  }

  querySelector() {
    return null;
  }

  querySelectorAll() {
    return [];
  }

  getElementById() {
    return null;
  }
}

class DOMEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.bubbles = Boolean(init.bubbles);
    this.cancelable = Boolean(init.cancelable);
    this.defaultPrevented = false;
    this.target = null;
    this.currentTarget = null;
    this.srcElement = null;
    this.eventPhase = 0;
    this.timeStamp = Date.now();
    this.isTrusted = false;
    this.button = 0;
    this.detail = 0;
    this.clientX = 0;
    this.clientY = 0;
    this.ctrlKey = false;
    this.metaKey = false;
    this.shiftKey = false;
    this.altKey = false;
    this._stopped = false;
    this._immediateStopped = false;
  }

  preventDefault() {
    if (this.cancelable) this.defaultPrevented = true;
  }

  stopPropagation() {
    this._stopped = true;
  }

  stopImmediatePropagation() {
    this._stopped = true;
    this._immediateStopped = true;
  }

  composedPath() {
    return [];
  }
}

let installed = false;

export function installMailingEditorTestDom() {
  if (installed) return;
  installed = true;

  const documentNode = new DocumentNode();
  const html = documentNode.createElement("html");
  const head = documentNode.createElement("head");
  const body = documentNode.createElement("body");
  documentNode.appendChild(html);
  html.appendChild(head);
  html.appendChild(body);
  documentNode._documentElement = html;
  documentNode._head = head;
  documentNode._body = body;

  const windowObject = globalThis;
  documentNode.defaultView = windowObject;
  windowObject.window = windowObject;
  windowObject.document = documentNode;
  windowObject.Node = Node;
  windowObject.Element = Element;
  windowObject.HTMLElement = HTMLElement;
  windowObject.HTMLInputElement = HTMLInputElement;
  windowObject.HTMLTextAreaElement = HTMLTextAreaElement;
  windowObject.HTMLSelectElement = HTMLSelectElement;
  windowObject.HTMLButtonElement = HTMLButtonElement;
  windowObject.HTMLIFrameElement = HTMLIFrameElement;
  windowObject.Document = DocumentNode;
  windowObject.Event = DOMEvent;
  windowObject.InputEvent = DOMEvent;
  windowObject.MouseEvent = DOMEvent;
  windowObject.IS_REACT_ACT_ENVIRONMENT = true;
  windowObject.confirm = () => false;
  windowObject.getSelection = () => null;
  Node.ELEMENT_NODE = ELEMENT_NODE;
  Node.TEXT_NODE = TEXT_NODE;
  Node.COMMENT_NODE = COMMENT_NODE;
  Node.DOCUMENT_NODE = DOCUMENT_NODE;
  Node.DOCUMENT_FRAGMENT_NODE = DOCUMENT_FRAGMENT_NODE;
}
