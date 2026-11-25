'use strict';

/**
 * Lightweight zero-dependency DOM mock supporting selectors, attributes,
 * classList, closest, querySelectorAll, and simulated MutationObserver records
 * for deterministic Node.js testing of YouTube Blocker content scripts.
 */

function parseSimpleSelector(part) {
  var s = part.trim();
  if (!s) return null;

  var negations = [];
  s = s.replace(/:not\(([^)]+)\)/g, function (_m, inner) {
    negations.push(inner.trim());
    return '';
  });

  var tag = null;
  var id = null;
  var classes = [];
  var attrs = [];

  s = s.replace(/\[([^\]]+)\]/g, function (_m, expr) {
    var eqIdx = expr.indexOf('=');
    if (eqIdx === -1) {
      attrs.push({ name: expr.trim(), op: 'exists', val: '' });
    } else {
      var op = '=';
      var nameEnd = eqIdx;
      var ch = expr.charAt(eqIdx - 1);
      if (ch === '^' || ch === '*' || ch === '$') {
        op = ch + '=';
        nameEnd = eqIdx - 1;
      }
      var name = expr.slice(0, nameEnd).trim();
      var rawVal = expr.slice(eqIdx + 1).trim();
      var caseInsensitive = false;
      if (/\s+i$/i.test(rawVal)) {
        caseInsensitive = true;
        rawVal = rawVal.replace(/\s+i$/i, '').trim();
      }
      rawVal = rawVal.replace(/^["']|["']$/g, '');
      attrs.push({ name: name, op: op, val: rawVal, i: caseInsensitive });
    }
    return '';
  });

  s = s.replace(/#([a-zA-Z0-9_-]+)/g, function (_m, idVal) {
    id = idVal;
    return '';
  });

  s = s.replace(/\.([a-zA-Z0-9_-]+)/g, function (_m, cls) {
    classes.push(cls);
    return '';
  });

  var tagMatch = s.trim();
  if (tagMatch && tagMatch !== '*') {
    tag = tagMatch.toLowerCase();
  }

  return { tag: tag, id: id, classes: classes, attrs: attrs, negations: negations };
}

function matchSimple(el, parsed) {
  if (!el || el.nodeType !== 1 || !parsed) return false;
  if (parsed.tag && el.tagName.toLowerCase() !== parsed.tag) return false;
  if (parsed.id && el.id !== parsed.id) return false;

  for (var i = 0; i < parsed.classes.length; i++) {
    if (!el.classList.contains(parsed.classes[i])) return false;
  }

  for (var j = 0; j < parsed.attrs.length; j++) {
    var a = parsed.attrs[j];
    if (!el.hasAttribute(a.name)) return false;
    if (a.op !== 'exists') {
      var actual = String(el.getAttribute(a.name) || '');
      var expected = a.val;
      if (a.i) {
        actual = actual.toLowerCase();
        expected = expected.toLowerCase();
      }
      if (a.op === '=' && actual !== expected) return false;
      if (a.op === '^=' && actual.indexOf(expected) !== 0) return false;
      if (a.op === '*=' && actual.indexOf(expected) === -1) return false;
      if (a.op === '$=' && actual.slice(-expected.length) !== expected) return false;
    }
  }

  for (var k = 0; k < parsed.negations.length; k++) {
    if (matchesSingleCompound(el, parsed.negations[k])) return false;
  }

  return true;
}

function splitTopLevelCommas(selector) {
  var result = [];
  var depth = 0;
  var inBracket = false;
  var start = 0;
  for (var i = 0; i < selector.length; i++) {
    var c = selector.charAt(i);
    if (c === '[') inBracket = true;
    else if (c === ']') inBracket = false;
    else if (!inBracket && c === '(') depth++;
    else if (!inBracket && c === ')') depth--;
    else if (!inBracket && depth === 0 && c === ',') {
      result.push(selector.slice(start, i).trim());
      start = i + 1;
    }
  }
  result.push(selector.slice(start).trim());
  return result.filter(Boolean);
}

function splitCompoundTokens(sel) {
  var tokens = [];
  var inBracket = false;
  var cur = '';
  for (var i = 0; i < sel.length; i++) {
    var c = sel.charAt(i);
    if (c === '[') inBracket = true;
    else if (c === ']') inBracket = false;
    if (!inBracket && /\s/.test(c)) {
      if (cur) {
        tokens.push(cur);
        cur = '';
      }
    } else {
      cur += c;
    }
  }
  if (cur) tokens.push(cur);
  return tokens;
}

function matchesSingleCompound(el, sel) {
  var tokens = splitCompoundTokens(sel.trim());
  if (tokens.length === 1) {
    return matchSimple(el, parseSimpleSelector(tokens[0]));
  }
  var last = tokens[tokens.length - 1];
  if (!matchSimple(el, parseSimpleSelector(last))) return false;

  var idx = tokens.length - 2;
  var cur = el.parentNode;
  while (idx >= 0 && cur && cur.nodeType === 1) {
    if (tokens[idx] === '>') {
      idx--;
      if (!matchSimple(cur, parseSimpleSelector(tokens[idx]))) return false;
      idx--;
      cur = cur.parentNode;
    } else {
      if (matchSimple(cur, parseSimpleSelector(tokens[idx]))) {
        idx--;
      }
      cur = cur.parentNode;
    }
  }
  return idx < 0;
}

function matchesSelector(el, selector) {
  var parts = splitTopLevelCommas(selector);
  for (var i = 0; i < parts.length; i++) {
    if (matchesSingleCompound(el, parts[i])) return true;
  }
  return false;
}

class MockElement {
  constructor(tagName, ownerDocument) {
    this.nodeType = 1;
    this.tagName = String(tagName).toUpperCase();
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
    this._attrs = Object.create(null);
    this._listeners = Object.create(null);
    this._text = '';
    this.inert = false;

    var self = this;
    this.classList = {
      add: function () {
        var cur = self._getClasses();
        for (var i = 0; i < arguments.length; i++) {
          if (cur.indexOf(arguments[i]) === -1) cur.push(arguments[i]);
        }
        self.setAttribute('class', cur.join(' '));
      },
      remove: function () {
        var rem = Array.prototype.slice.call(arguments);
        var next = self._getClasses().filter(function (c) { return rem.indexOf(c) === -1; });
        self.setAttribute('class', next.join(' '));
      },
      contains: function (c) {
        return self._getClasses().indexOf(c) !== -1;
      }
    };
  }

  _getClasses() {
    var cls = this._attrs['class'] || '';
    return cls ? cls.trim().split(/\s+/) : [];
  }

  get id() {
    return this._attrs['id'] || '';
  }

  set id(v) {
    this.setAttribute('id', v);
  }

  get className() {
    return this._attrs['class'] || '';
  }

  set className(v) {
    this.setAttribute('class', v);
  }

  get isConnected() {
    var p = this;
    while (p) {
      if (p === this.ownerDocument.documentElement) return true;
      p = p.parentNode;
    }
    return false;
  }

  get textContent() {
    if (this.childNodes.length === 0) return this._text;
    var out = this._text;
    for (var i = 0; i < this.childNodes.length; i++) {
      out += this.childNodes[i].textContent;
    }
    return out;
  }

  set textContent(v) {
    this.childNodes = [];
    this._text = String(v == null ? '' : v);
  }

  setAttribute(name, value) {
    this._attrs[name] = String(value);
  }

  getAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name) ? this._attrs[name] : null;
  }

  hasAttribute(name) {
    return Object.prototype.hasOwnProperty.call(this._attrs, name);
  }

  removeAttribute(name) {
    delete this._attrs[name];
  }

  appendChild(child) {
    if (child.parentNode) {
      child.parentNode.removeChild(child);
    }
    child.parentNode = this;
    this.childNodes.push(child);
    this.ownerDocument._notifyAdded(this, child);
    return child;
  }

  removeChild(child) {
    var idx = this.childNodes.indexOf(child);
    if (idx !== -1) {
      this.childNodes.splice(idx, 1);
      child.parentNode = null;
    }
    return child;
  }

  remove() {
    if (this.parentNode) {
      this.parentNode.removeChild(this);
    }
  }

  matches(selector) {
    return matchesSelector(this, selector);
  }

  closest(selector) {
    var cur = this;
    while (cur && cur.nodeType === 1) {
      if (cur.matches(selector)) return cur;
      cur = cur.parentNode;
    }
    return null;
  }

  querySelectorAll(selector) {
    var results = [];
    function walk(node) {
      for (var i = 0; i < node.childNodes.length; i++) {
        var child = node.childNodes[i];
        if (child.nodeType === 1) {
          if (child.matches(selector)) results.push(child);
          walk(child);
        }
      }
    }
    walk(this);
    return results;
  }

  querySelector(selector) {
    var list = this.querySelectorAll(selector);
    return list.length > 0 ? list[0] : null;
  }

  addEventListener(type, fn) {
    if (!this._listeners[type]) this._listeners[type] = [];
    this._listeners[type].push(fn);
  }

  click() {
    this.clickedCount = (this.clickedCount || 0) + 1;
    var fns = this._listeners['click'] || [];
    for (var i = 0; i < fns.length; i++) {
      fns[i]({ target: this, preventDefault: function () {} });
    }
  }

  scrollIntoView() {
    this.scrolledIntoView = true;
  }
}

class MockDocument {
  constructor() {
    this.readyState = 'complete';
    this._observers = [];
    this.documentElement = new MockElement('html', this);
    this.head = new MockElement('head', this);
    this.body = new MockElement('body', this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
  }

  createElement(tag) {
    return new MockElement(tag, this);
  }

  getElementById(id) {
    return this.documentElement.querySelector('#' + id);
  }

  querySelector(selector) {
    return this.documentElement.querySelector(selector);
  }

  querySelectorAll(selector) {
    return this.documentElement.querySelectorAll(selector);
  }

  addEventListener() {}
  removeEventListener() {}

  _notifyAdded(target, addedNode) {
    for (var i = 0; i < this._observers.length; i++) {
      var obs = this._observers[i];
      if (!obs._active) continue;
      obs._callback([{ type: 'childList', target: target, addedNodes: [addedNode] }]);
    }
  }
}

class MockMutationObserver {
  constructor(callback) {
    this._callback = callback;
    this._active = false;
    this._doc = null;
  }

  observe(target) {
    this._doc = target.ownerDocument;
    this._active = true;
    if (this._doc._observers.indexOf(this) === -1) {
      this._doc._observers.push(this);
    }
  }

  disconnect() {
    this._active = false;
  }
}

function el(doc, tag, attrs, children, text) {
  var node = doc.createElement(tag);
  if (attrs) {
    var keys = Object.keys(attrs);
    for (var i = 0; i < keys.length; i++) {
      node.setAttribute(keys[i], attrs[keys[i]]);
    }
  }
  if (text != null) node.textContent = text;
  if (children) {
    for (var j = 0; j < children.length; j++) {
      node.appendChild(children[j]);
    }
  }
  return node;
}

module.exports = {
  MockDocument: MockDocument,
  MockMutationObserver: MockMutationObserver,
  el: el
};
