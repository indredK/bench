var e = Object.create,
  t = Object.defineProperty,
  n = Object.getOwnPropertyDescriptor,
  r = Object.getOwnPropertyNames,
  i = Object.getPrototypeOf,
  a = Object.prototype.hasOwnProperty,
  o = (e, t) => () => (t || (e((t = { exports: {} }).exports, t), (e = null)), t.exports),
  s = (e, i, o, s) => {
    if ((i && typeof i == `object`) || typeof i == `function`)
      for (var c = r(i), l = 0, u = c.length, d; l < u; l++)
        ((d = c[l]),
          !a.call(e, d) &&
            d !== o &&
            t(e, d, {
              get: ((e) => i[e]).bind(null, d),
              enumerable: !(s = n(i, d)) || s.enumerable,
            }))
    return e
  },
  c = (n, r, o) => (
    (o = n == null ? {} : e(i(n))),
    s(
      r || !n || !n.__esModule || !a.call(n, `default`)
        ? t(o, `default`, { value: n, enumerable: !0 })
        : o,
      n,
    )
  )
;(function () {
  let e = document.createElement(`link`).relList
  if (e && e.supports && e.supports(`modulepreload`)) return
  for (let e of document.querySelectorAll(`link[rel="modulepreload"]`)) n(e)
  new MutationObserver((e) => {
    for (let t of e)
      if (t.type === `childList`)
        for (let e of t.addedNodes) e.tagName === `LINK` && e.rel === `modulepreload` && n(e)
  }).observe(document, { childList: !0, subtree: !0 })
  function t(e) {
    let t = {}
    return (
      e.integrity && (t.integrity = e.integrity),
      e.referrerPolicy && (t.referrerPolicy = e.referrerPolicy),
      (t.credentials =
        e.crossOrigin === `use-credentials`
          ? `include`
          : e.crossOrigin === `anonymous`
            ? `omit`
            : `same-origin`),
      t
    )
  }
  function n(e) {
    if (e.ep) return
    e.ep = !0
    let n = t(e)
    fetch(e.href, n)
  }
})()
var l = o((e) => {
    var t = Symbol.for(`react.transitional.element`),
      n = Symbol.for(`react.portal`),
      r = Symbol.for(`react.fragment`),
      i = Symbol.for(`react.strict_mode`),
      a = Symbol.for(`react.profiler`),
      o = Symbol.for(`react.consumer`),
      s = Symbol.for(`react.context`),
      c = Symbol.for(`react.forward_ref`),
      l = Symbol.for(`react.suspense`),
      u = Symbol.for(`react.memo`),
      d = Symbol.for(`react.lazy`),
      f = Symbol.for(`react.activity`),
      p = Symbol.iterator
    function m(e) {
      return typeof e != `object` || !e
        ? null
        : ((e = (p && e[p]) || e[`@@iterator`]), typeof e == `function` ? e : null)
    }
    var h = {
        isMounted: function () {
          return !1
        },
        enqueueForceUpdate: function () {},
        enqueueReplaceState: function () {},
        enqueueSetState: function () {},
      },
      g = Object.assign,
      _ = {}
    function v(e, t, n) {
      ;((this.props = e), (this.context = t), (this.refs = _), (this.updater = n || h))
    }
    ;((v.prototype.isReactComponent = {}),
      (v.prototype.setState = function (e, t) {
        if (typeof e != `object` && typeof e != `function` && e != null)
          throw Error(
            `takes an object of state variables to update or a function which returns an object of state variables.`,
          )
        this.updater.enqueueSetState(this, e, t, `setState`)
      }),
      (v.prototype.forceUpdate = function (e) {
        this.updater.enqueueForceUpdate(this, e, `forceUpdate`)
      }))
    function y() {}
    y.prototype = v.prototype
    function b(e, t, n) {
      ;((this.props = e), (this.context = t), (this.refs = _), (this.updater = n || h))
    }
    var x = (b.prototype = new y())
    ;((x.constructor = b), g(x, v.prototype), (x.isPureReactComponent = !0))
    var S = Array.isArray
    function C() {}
    var w = { H: null, A: null, T: null, S: null },
      T = Object.prototype.hasOwnProperty
    function E(e, n, r) {
      var i = r.ref
      return { $$typeof: t, type: e, key: n, ref: i === void 0 ? null : i, props: r }
    }
    function ee(e, t) {
      return E(e.type, t, e.props)
    }
    function te(e) {
      return typeof e == `object` && !!e && e.$$typeof === t
    }
    function ne(e) {
      var t = { "=": `=0`, ":": `=2` }
      return (
        `$` +
        e.replace(/[=:]/g, function (e) {
          return t[e]
        })
      )
    }
    var re = /\/+/g
    function D(e, t) {
      return typeof e == `object` && e && e.key != null ? ne(`` + e.key) : t.toString(36)
    }
    function O(e) {
      switch (e.status) {
        case `fulfilled`:
          return e.value
        case `rejected`:
          throw e.reason
        default:
          switch (
            (typeof e.status == `string`
              ? e.then(C, C)
              : ((e.status = `pending`),
                e.then(
                  function (t) {
                    e.status === `pending` && ((e.status = `fulfilled`), (e.value = t))
                  },
                  function (t) {
                    e.status === `pending` && ((e.status = `rejected`), (e.reason = t))
                  },
                )),
            e.status)
          ) {
            case `fulfilled`:
              return e.value
            case `rejected`:
              throw e.reason
          }
      }
      throw e
    }
    function ie(e, r, i, a, o) {
      var s = typeof e
      ;(s === `undefined` || s === `boolean`) && (e = null)
      var c = !1
      if (e === null) c = !0
      else
        switch (s) {
          case `bigint`:
          case `string`:
          case `number`:
            c = !0
            break
          case `object`:
            switch (e.$$typeof) {
              case t:
              case n:
                c = !0
                break
              case d:
                return ((c = e._init), ie(c(e._payload), r, i, a, o))
            }
        }
      if (c)
        return (
          (o = o(e)),
          (c = a === `` ? `.` + D(e, 0) : a),
          S(o)
            ? ((i = ``),
              c != null && (i = c.replace(re, `$&/`) + `/`),
              ie(o, r, i, ``, function (e) {
                return e
              }))
            : o != null &&
              (te(o) &&
                (o = ee(
                  o,
                  i +
                    (o.key == null || (e && e.key === o.key)
                      ? ``
                      : (`` + o.key).replace(re, `$&/`) + `/`) +
                    c,
                )),
              r.push(o)),
          1
        )
      c = 0
      var l = a === `` ? `.` : a + `:`
      if (S(e))
        for (var u = 0; u < e.length; u++) ((a = e[u]), (s = l + D(a, u)), (c += ie(a, r, i, s, o)))
      else if (((u = m(e)), typeof u == `function`))
        for (e = u.call(e), u = 0; !(a = e.next()).done;)
          ((a = a.value), (s = l + D(a, u++)), (c += ie(a, r, i, s, o)))
      else if (s === `object`) {
        if (typeof e.then == `function`) return ie(O(e), r, i, a, o)
        throw (
          (r = String(e)),
          Error(
            `Objects are not valid as a React child (found: ` +
              (r === `[object Object]`
                ? `object with keys {` + Object.keys(e).join(`, `) + `}`
                : r) +
              `). If you meant to render a collection of children, use an array instead.`,
          )
        )
      }
      return c
    }
    function ae(e, t, n) {
      if (e == null) return e
      var r = [],
        i = 0
      return (
        ie(e, r, ``, ``, function (e) {
          return t.call(n, e, i++)
        }),
        r
      )
    }
    function k(e) {
      if (e._status === -1) {
        var t = e._result
        ;((t = t()),
          t.then(
            function (t) {
              ;(e._status === 0 || e._status === -1) && ((e._status = 1), (e._result = t))
            },
            function (t) {
              ;(e._status === 0 || e._status === -1) && ((e._status = 2), (e._result = t))
            },
          ),
          e._status === -1 && ((e._status = 0), (e._result = t)))
      }
      if (e._status === 1) return e._result.default
      throw e._result
    }
    var A =
        typeof reportError == `function`
          ? reportError
          : function (e) {
              if (typeof window == `object` && typeof window.ErrorEvent == `function`) {
                var t = new window.ErrorEvent(`error`, {
                  bubbles: !0,
                  cancelable: !0,
                  message:
                    typeof e == `object` && e && typeof e.message == `string`
                      ? String(e.message)
                      : String(e),
                  error: e,
                })
                if (!window.dispatchEvent(t)) return
              } else if (typeof process == `object` && typeof process.emit == `function`) {
                process.emit(`uncaughtException`, e)
                return
              }
              console.error(e)
            },
      j = {
        map: ae,
        forEach: function (e, t, n) {
          ae(
            e,
            function () {
              t.apply(this, arguments)
            },
            n,
          )
        },
        count: function (e) {
          var t = 0
          return (
            ae(e, function () {
              t++
            }),
            t
          )
        },
        toArray: function (e) {
          return (
            ae(e, function (e) {
              return e
            }) || []
          )
        },
        only: function (e) {
          if (!te(e))
            throw Error(`React.Children.only expected to receive a single React element child.`)
          return e
        },
      }
    ;((e.Activity = f),
      (e.Children = j),
      (e.Component = v),
      (e.Fragment = r),
      (e.Profiler = a),
      (e.PureComponent = b),
      (e.StrictMode = i),
      (e.Suspense = l),
      (e.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = w),
      (e.__COMPILER_RUNTIME = {
        __proto__: null,
        c: function (e) {
          return w.H.useMemoCache(e)
        },
      }),
      (e.cache = function (e) {
        return function () {
          return e.apply(null, arguments)
        }
      }),
      (e.cacheSignal = function () {
        return null
      }),
      (e.cloneElement = function (e, t, n) {
        if (e == null)
          throw Error(`The argument must be a React element, but you passed ` + e + `.`)
        var r = g({}, e.props),
          i = e.key
        if (t != null)
          for (a in (t.key !== void 0 && (i = `` + t.key), t))
            !T.call(t, a) ||
              a === `key` ||
              a === `__self` ||
              a === `__source` ||
              (a === `ref` && t.ref === void 0) ||
              (r[a] = t[a])
        var a = arguments.length - 2
        if (a === 1) r.children = n
        else if (1 < a) {
          for (var o = Array(a), s = 0; s < a; s++) o[s] = arguments[s + 2]
          r.children = o
        }
        return E(e.type, i, r)
      }),
      (e.createContext = function (e) {
        return (
          (e = {
            $$typeof: s,
            _currentValue: e,
            _currentValue2: e,
            _threadCount: 0,
            Provider: null,
            Consumer: null,
          }),
          (e.Provider = e),
          (e.Consumer = { $$typeof: o, _context: e }),
          e
        )
      }),
      (e.createElement = function (e, t, n) {
        var r,
          i = {},
          a = null
        if (t != null)
          for (r in (t.key !== void 0 && (a = `` + t.key), t))
            T.call(t, r) && r !== `key` && r !== `__self` && r !== `__source` && (i[r] = t[r])
        var o = arguments.length - 2
        if (o === 1) i.children = n
        else if (1 < o) {
          for (var s = Array(o), c = 0; c < o; c++) s[c] = arguments[c + 2]
          i.children = s
        }
        if (e && e.defaultProps)
          for (r in ((o = e.defaultProps), o)) i[r] === void 0 && (i[r] = o[r])
        return E(e, a, i)
      }),
      (e.createRef = function () {
        return { current: null }
      }),
      (e.forwardRef = function (e) {
        return { $$typeof: c, render: e }
      }),
      (e.isValidElement = te),
      (e.lazy = function (e) {
        return { $$typeof: d, _payload: { _status: -1, _result: e }, _init: k }
      }),
      (e.memo = function (e, t) {
        return { $$typeof: u, type: e, compare: t === void 0 ? null : t }
      }),
      (e.startTransition = function (e) {
        var t = w.T,
          n = {}
        w.T = n
        try {
          var r = e(),
            i = w.S
          ;(i !== null && i(n, r),
            typeof r == `object` && r && typeof r.then == `function` && r.then(C, A))
        } catch (e) {
          A(e)
        } finally {
          ;(t !== null && n.types !== null && (t.types = n.types), (w.T = t))
        }
      }),
      (e.unstable_useCacheRefresh = function () {
        return w.H.useCacheRefresh()
      }),
      (e.use = function (e) {
        return w.H.use(e)
      }),
      (e.useActionState = function (e, t, n) {
        return w.H.useActionState(e, t, n)
      }),
      (e.useCallback = function (e, t) {
        return w.H.useCallback(e, t)
      }),
      (e.useContext = function (e) {
        return w.H.useContext(e)
      }),
      (e.useDebugValue = function () {}),
      (e.useDeferredValue = function (e, t) {
        return w.H.useDeferredValue(e, t)
      }),
      (e.useEffect = function (e, t) {
        return w.H.useEffect(e, t)
      }),
      (e.useEffectEvent = function (e) {
        return w.H.useEffectEvent(e)
      }),
      (e.useId = function () {
        return w.H.useId()
      }),
      (e.useImperativeHandle = function (e, t, n) {
        return w.H.useImperativeHandle(e, t, n)
      }),
      (e.useInsertionEffect = function (e, t) {
        return w.H.useInsertionEffect(e, t)
      }),
      (e.useLayoutEffect = function (e, t) {
        return w.H.useLayoutEffect(e, t)
      }),
      (e.useMemo = function (e, t) {
        return w.H.useMemo(e, t)
      }),
      (e.useOptimistic = function (e, t) {
        return w.H.useOptimistic(e, t)
      }),
      (e.useReducer = function (e, t, n) {
        return w.H.useReducer(e, t, n)
      }),
      (e.useRef = function (e) {
        return w.H.useRef(e)
      }),
      (e.useState = function (e) {
        return w.H.useState(e)
      }),
      (e.useSyncExternalStore = function (e, t, n) {
        return w.H.useSyncExternalStore(e, t, n)
      }),
      (e.useTransition = function () {
        return w.H.useTransition()
      }),
      (e.version = `19.2.8`))
  }),
  u = o((e, t) => {
    t.exports = l()
  }),
  d = o((e) => {
    function t(e, t) {
      var n = e.length
      e.push(t)
      a: for (; 0 < n;) {
        var r = (n - 1) >>> 1,
          a = e[r]
        if (0 < i(a, t)) ((e[r] = t), (e[n] = a), (n = r))
        else break a
      }
    }
    function n(e) {
      return e.length === 0 ? null : e[0]
    }
    function r(e) {
      if (e.length === 0) return null
      var t = e[0],
        n = e.pop()
      if (n !== t) {
        e[0] = n
        a: for (var r = 0, a = e.length, o = a >>> 1; r < o;) {
          var s = 2 * (r + 1) - 1,
            c = e[s],
            l = s + 1,
            u = e[l]
          if (0 > i(c, n))
            l < a && 0 > i(u, c)
              ? ((e[r] = u), (e[l] = n), (r = l))
              : ((e[r] = c), (e[s] = n), (r = s))
          else if (l < a && 0 > i(u, n)) ((e[r] = u), (e[l] = n), (r = l))
          else break a
        }
      }
      return t
    }
    function i(e, t) {
      var n = e.sortIndex - t.sortIndex
      return n === 0 ? e.id - t.id : n
    }
    if (
      ((e.unstable_now = void 0),
      typeof performance == `object` && typeof performance.now == `function`)
    ) {
      var a = performance
      e.unstable_now = function () {
        return a.now()
      }
    } else {
      var o = Date,
        s = o.now()
      e.unstable_now = function () {
        return o.now() - s
      }
    }
    var c = [],
      l = [],
      u = 1,
      d = null,
      f = 3,
      p = !1,
      m = !1,
      h = !1,
      g = !1,
      _ = typeof setTimeout == `function` ? setTimeout : null,
      v = typeof clearTimeout == `function` ? clearTimeout : null,
      y = typeof setImmediate < `u` ? setImmediate : null
    function b(e) {
      for (var i = n(l); i !== null;) {
        if (i.callback === null) r(l)
        else if (i.startTime <= e) (r(l), (i.sortIndex = i.expirationTime), t(c, i))
        else break
        i = n(l)
      }
    }
    function x(e) {
      if (((h = !1), b(e), !m)) {
        if (n(c) !== null) ((m = !0), S || ((S = !0), te()))
        else {
          var t = n(l)
          t !== null && D(x, t.startTime - e)
        }
      }
    }
    var S = !1,
      C = -1,
      w = 5,
      T = -1
    function E() {
      return g ? !0 : !(e.unstable_now() - T < w)
    }
    function ee() {
      if (((g = !1), S)) {
        var t = e.unstable_now()
        T = t
        var i = !0
        try {
          a: {
            ;((m = !1), h && ((h = !1), v(C), (C = -1)), (p = !0))
            var a = f
            try {
              b: {
                for (b(t), d = n(c); d !== null && !(d.expirationTime > t && E());) {
                  var o = d.callback
                  if (typeof o == `function`) {
                    ;((d.callback = null), (f = d.priorityLevel))
                    var s = o(d.expirationTime <= t)
                    if (((t = e.unstable_now()), typeof s == `function`)) {
                      ;((d.callback = s), b(t), (i = !0))
                      break b
                    }
                    ;(d === n(c) && r(c), b(t))
                  } else r(c)
                  d = n(c)
                }
                if (d !== null) i = !0
                else {
                  var u = n(l)
                  ;(u !== null && D(x, u.startTime - t), (i = !1))
                }
              }
              break a
            } finally {
              ;((d = null), (f = a), (p = !1))
            }
            i = void 0
          }
        } finally {
          i ? te() : (S = !1)
        }
      }
    }
    var te
    if (typeof y == `function`)
      te = function () {
        y(ee)
      }
    else if (typeof MessageChannel < `u`) {
      var ne = new MessageChannel(),
        re = ne.port2
      ;((ne.port1.onmessage = ee),
        (te = function () {
          re.postMessage(null)
        }))
    } else
      te = function () {
        _(ee, 0)
      }
    function D(t, n) {
      C = _(function () {
        t(e.unstable_now())
      }, n)
    }
    ;((e.unstable_IdlePriority = 5),
      (e.unstable_ImmediatePriority = 1),
      (e.unstable_LowPriority = 4),
      (e.unstable_NormalPriority = 3),
      (e.unstable_Profiling = null),
      (e.unstable_UserBlockingPriority = 2),
      (e.unstable_cancelCallback = function (e) {
        e.callback = null
      }),
      (e.unstable_forceFrameRate = function (e) {
        0 > e || 125 < e
          ? console.error(
              `forceFrameRate takes a positive int between 0 and 125, forcing frame rates higher than 125 fps is not supported`,
            )
          : (w = 0 < e ? Math.floor(1e3 / e) : 5)
      }),
      (e.unstable_getCurrentPriorityLevel = function () {
        return f
      }),
      (e.unstable_next = function (e) {
        switch (f) {
          case 1:
          case 2:
          case 3:
            var t = 3
            break
          default:
            t = f
        }
        var n = f
        f = t
        try {
          return e()
        } finally {
          f = n
        }
      }),
      (e.unstable_requestPaint = function () {
        g = !0
      }),
      (e.unstable_runWithPriority = function (e, t) {
        switch (e) {
          case 1:
          case 2:
          case 3:
          case 4:
          case 5:
            break
          default:
            e = 3
        }
        var n = f
        f = e
        try {
          return t()
        } finally {
          f = n
        }
      }),
      (e.unstable_scheduleCallback = function (r, i, a) {
        var o = e.unstable_now()
        switch (
          (typeof a == `object` && a
            ? ((a = a.delay), (a = typeof a == `number` && 0 < a ? o + a : o))
            : (a = o),
          r)
        ) {
          case 1:
            var s = -1
            break
          case 2:
            s = 250
            break
          case 5:
            s = 1073741823
            break
          case 4:
            s = 1e4
            break
          default:
            s = 5e3
        }
        return (
          (s = a + s),
          (r = {
            id: u++,
            callback: i,
            priorityLevel: r,
            startTime: a,
            expirationTime: s,
            sortIndex: -1,
          }),
          a > o
            ? ((r.sortIndex = a),
              t(l, r),
              n(c) === null && r === n(l) && (h ? (v(C), (C = -1)) : (h = !0), D(x, a - o)))
            : ((r.sortIndex = s), t(c, r), m || p || ((m = !0), S || ((S = !0), te()))),
          r
        )
      }),
      (e.unstable_shouldYield = E),
      (e.unstable_wrapCallback = function (e) {
        var t = f
        return function () {
          var n = f
          f = t
          try {
            return e.apply(this, arguments)
          } finally {
            f = n
          }
        }
      }))
  }),
  f = o((e, t) => {
    t.exports = d()
  }),
  p = o((e) => {
    var t = u()
    function n(e) {
      var t = `https://react.dev/errors/` + e
      if (1 < arguments.length) {
        t += `?args[]=` + encodeURIComponent(arguments[1])
        for (var n = 2; n < arguments.length; n++)
          t += `&args[]=` + encodeURIComponent(arguments[n])
      }
      return (
        `Minified React error #` +
        e +
        `; visit ` +
        t +
        ` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`
      )
    }
    function r() {}
    var i = {
        d: {
          f: r,
          r: function () {
            throw Error(n(522))
          },
          D: r,
          C: r,
          L: r,
          m: r,
          X: r,
          S: r,
          M: r,
        },
        p: 0,
        findDOMNode: null,
      },
      a = Symbol.for(`react.portal`)
    function o(e, t, n) {
      var r = 3 < arguments.length && arguments[3] !== void 0 ? arguments[3] : null
      return {
        $$typeof: a,
        key: r == null ? null : `` + r,
        children: e,
        containerInfo: t,
        implementation: n,
      }
    }
    var s = t.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
    function c(e, t) {
      if (e === `font`) return ``
      if (typeof t == `string`) return t === `use-credentials` ? t : ``
    }
    ;((e.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE = i),
      (e.createPortal = function (e, t) {
        var r = 2 < arguments.length && arguments[2] !== void 0 ? arguments[2] : null
        if (!t || (t.nodeType !== 1 && t.nodeType !== 9 && t.nodeType !== 11)) throw Error(n(299))
        return o(e, t, null, r)
      }),
      (e.flushSync = function (e) {
        var t = s.T,
          n = i.p
        try {
          if (((s.T = null), (i.p = 2), e)) return e()
        } finally {
          ;((s.T = t), (i.p = n), i.d.f())
        }
      }),
      (e.preconnect = function (e, t) {
        typeof e == `string` &&
          (t
            ? ((t = t.crossOrigin),
              (t = typeof t == `string` ? (t === `use-credentials` ? t : ``) : void 0))
            : (t = null),
          i.d.C(e, t))
      }),
      (e.prefetchDNS = function (e) {
        typeof e == `string` && i.d.D(e)
      }),
      (e.preinit = function (e, t) {
        if (typeof e == `string` && t && typeof t.as == `string`) {
          var n = t.as,
            r = c(n, t.crossOrigin),
            a = typeof t.integrity == `string` ? t.integrity : void 0,
            o = typeof t.fetchPriority == `string` ? t.fetchPriority : void 0
          n === `style`
            ? i.d.S(e, typeof t.precedence == `string` ? t.precedence : void 0, {
                crossOrigin: r,
                integrity: a,
                fetchPriority: o,
              })
            : n === `script` &&
              i.d.X(e, {
                crossOrigin: r,
                integrity: a,
                fetchPriority: o,
                nonce: typeof t.nonce == `string` ? t.nonce : void 0,
              })
        }
      }),
      (e.preinitModule = function (e, t) {
        if (typeof e == `string`) {
          if (typeof t == `object` && t) {
            if (t.as == null || t.as === `script`) {
              var n = c(t.as, t.crossOrigin)
              i.d.M(e, {
                crossOrigin: n,
                integrity: typeof t.integrity == `string` ? t.integrity : void 0,
                nonce: typeof t.nonce == `string` ? t.nonce : void 0,
              })
            }
          } else t ?? i.d.M(e)
        }
      }),
      (e.preload = function (e, t) {
        if (typeof e == `string` && typeof t == `object` && t && typeof t.as == `string`) {
          var n = t.as,
            r = c(n, t.crossOrigin)
          i.d.L(e, n, {
            crossOrigin: r,
            integrity: typeof t.integrity == `string` ? t.integrity : void 0,
            nonce: typeof t.nonce == `string` ? t.nonce : void 0,
            type: typeof t.type == `string` ? t.type : void 0,
            fetchPriority: typeof t.fetchPriority == `string` ? t.fetchPriority : void 0,
            referrerPolicy: typeof t.referrerPolicy == `string` ? t.referrerPolicy : void 0,
            imageSrcSet: typeof t.imageSrcSet == `string` ? t.imageSrcSet : void 0,
            imageSizes: typeof t.imageSizes == `string` ? t.imageSizes : void 0,
            media: typeof t.media == `string` ? t.media : void 0,
          })
        }
      }),
      (e.preloadModule = function (e, t) {
        if (typeof e == `string`) {
          if (t) {
            var n = c(t.as, t.crossOrigin)
            i.d.m(e, {
              as: typeof t.as == `string` && t.as !== `script` ? t.as : void 0,
              crossOrigin: n,
              integrity: typeof t.integrity == `string` ? t.integrity : void 0,
            })
          } else i.d.m(e)
        }
      }),
      (e.requestFormReset = function (e) {
        i.d.r(e)
      }),
      (e.unstable_batchedUpdates = function (e, t) {
        return e(t)
      }),
      (e.useFormState = function (e, t, n) {
        return s.H.useFormState(e, t, n)
      }),
      (e.useFormStatus = function () {
        return s.H.useHostTransitionStatus()
      }),
      (e.version = `19.2.8`))
  }),
  m = o((e, t) => {
    function n() {
      if (!(
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > `u` ||
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != `function`
      ))
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)
        } catch (e) {
          console.error(e)
        }
    }
    ;(n(), (t.exports = p()))
  }),
  h = o((e) => {
    var t = f(),
      n = u(),
      r = m()
    function i(e) {
      var t = `https://react.dev/errors/` + e
      if (1 < arguments.length) {
        t += `?args[]=` + encodeURIComponent(arguments[1])
        for (var n = 2; n < arguments.length; n++)
          t += `&args[]=` + encodeURIComponent(arguments[n])
      }
      return (
        `Minified React error #` +
        e +
        `; visit ` +
        t +
        ` for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`
      )
    }
    function a(e) {
      return !(!e || (e.nodeType !== 1 && e.nodeType !== 9 && e.nodeType !== 11))
    }
    function o(e) {
      var t = e,
        n = e
      if (e.alternate) for (; t.return;) t = t.return
      else {
        e = t
        do ((t = e), t.flags & 4098 && (n = t.return), (e = t.return))
        while (e)
      }
      return t.tag === 3 ? n : null
    }
    function s(e) {
      if (e.tag === 13) {
        var t = e.memoizedState
        if ((t === null && ((e = e.alternate), e !== null && (t = e.memoizedState)), t !== null))
          return t.dehydrated
      }
      return null
    }
    function c(e) {
      if (e.tag === 31) {
        var t = e.memoizedState
        if ((t === null && ((e = e.alternate), e !== null && (t = e.memoizedState)), t !== null))
          return t.dehydrated
      }
      return null
    }
    function l(e) {
      if (o(e) !== e) throw Error(i(188))
    }
    function d(e) {
      var t = e.alternate
      if (!t) {
        if (((t = o(e)), t === null)) throw Error(i(188))
        return t === e ? e : null
      }
      for (var n = e, r = t; ;) {
        var a = n.return
        if (a === null) break
        var s = a.alternate
        if (s === null) {
          if (((r = a.return), r !== null)) {
            n = r
            continue
          }
          break
        }
        if (a.child === s.child) {
          for (s = a.child; s;) {
            if (s === n) return (l(a), e)
            if (s === r) return (l(a), t)
            s = s.sibling
          }
          throw Error(i(188))
        }
        if (n.return !== r.return) ((n = a), (r = s))
        else {
          for (var c = !1, u = a.child; u;) {
            if (u === n) {
              ;((c = !0), (n = a), (r = s))
              break
            }
            if (u === r) {
              ;((c = !0), (r = a), (n = s))
              break
            }
            u = u.sibling
          }
          if (!c) {
            for (u = s.child; u;) {
              if (u === n) {
                ;((c = !0), (n = s), (r = a))
                break
              }
              if (u === r) {
                ;((c = !0), (r = s), (n = a))
                break
              }
              u = u.sibling
            }
            if (!c) throw Error(i(189))
          }
        }
        if (n.alternate !== r) throw Error(i(190))
      }
      if (n.tag !== 3) throw Error(i(188))
      return n.stateNode.current === n ? e : t
    }
    function p(e) {
      var t = e.tag
      if (t === 5 || t === 26 || t === 27 || t === 6) return e
      for (e = e.child; e !== null;) {
        if (((t = p(e)), t !== null)) return t
        e = e.sibling
      }
      return null
    }
    var h = Object.assign,
      g = Symbol.for(`react.element`),
      _ = Symbol.for(`react.transitional.element`),
      v = Symbol.for(`react.portal`),
      y = Symbol.for(`react.fragment`),
      b = Symbol.for(`react.strict_mode`),
      x = Symbol.for(`react.profiler`),
      S = Symbol.for(`react.consumer`),
      C = Symbol.for(`react.context`),
      w = Symbol.for(`react.forward_ref`),
      T = Symbol.for(`react.suspense`),
      E = Symbol.for(`react.suspense_list`),
      ee = Symbol.for(`react.memo`),
      te = Symbol.for(`react.lazy`),
      ne = Symbol.for(`react.activity`),
      re = Symbol.for(`react.memo_cache_sentinel`),
      D = Symbol.iterator
    function O(e) {
      return typeof e != `object` || !e
        ? null
        : ((e = (D && e[D]) || e[`@@iterator`]), typeof e == `function` ? e : null)
    }
    var ie = Symbol.for(`react.client.reference`)
    function ae(e) {
      if (e == null) return null
      if (typeof e == `function`) return e.$$typeof === ie ? null : e.displayName || e.name || null
      if (typeof e == `string`) return e
      switch (e) {
        case y:
          return `Fragment`
        case x:
          return `Profiler`
        case b:
          return `StrictMode`
        case T:
          return `Suspense`
        case E:
          return `SuspenseList`
        case ne:
          return `Activity`
      }
      if (typeof e == `object`)
        switch (e.$$typeof) {
          case v:
            return `Portal`
          case C:
            return e.displayName || `Context`
          case S:
            return (e._context.displayName || `Context`) + `.Consumer`
          case w:
            var t = e.render
            return (
              (e = e.displayName),
              (e ||=
                ((e = t.displayName || t.name || ``),
                e === `` ? `ForwardRef` : `ForwardRef(` + e + `)`)),
              e
            )
          case ee:
            return ((t = e.displayName || null), t === null ? ae(e.type) || `Memo` : t)
          case te:
            ;((t = e._payload), (e = e._init))
            try {
              return ae(e(t))
            } catch {}
        }
      return null
    }
    var k = Array.isArray,
      A = n.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      j = r.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      oe = { pending: !1, data: null, method: null, action: null },
      se = [],
      ce = -1
    function M(e) {
      return { current: e }
    }
    function N(e) {
      0 > ce || ((e.current = se[ce]), (se[ce] = null), ce--)
    }
    function P(e, t) {
      ;(ce++, (se[ce] = e.current), (e.current = t))
    }
    var le = M(null),
      F = M(null),
      ue = M(null),
      de = M(null)
    function fe(e, t) {
      switch ((P(ue, t), P(F, e), P(le, null), t.nodeType)) {
        case 9:
        case 11:
          e = (e = t.documentElement) && (e = e.namespaceURI) ? Vd(e) : 0
          break
        default:
          if (((e = t.tagName), (t = t.namespaceURI))) ((t = Vd(t)), (e = Hd(t, e)))
          else
            switch (e) {
              case `svg`:
                e = 1
                break
              case `math`:
                e = 2
                break
              default:
                e = 0
            }
      }
      ;(N(le), P(le, e))
    }
    function pe() {
      ;(N(le), N(F), N(ue))
    }
    function me(e) {
      e.memoizedState !== null && P(de, e)
      var t = le.current,
        n = Hd(t, e.type)
      t !== n && (P(F, e), P(le, n))
    }
    function I(e) {
      ;(F.current === e && (N(le), N(F)), de.current === e && (N(de), (Qf._currentValue = oe)))
    }
    var he, ge
    function _e(e) {
      if (he === void 0)
        try {
          throw Error()
        } catch (e) {
          var t = e.stack.trim().match(/\n( *(at )?)/)
          ;((he = (t && t[1]) || ``),
            (ge =
              -1 <
              e.stack.indexOf(`
    at`)
                ? ` (<anonymous>)`
                : -1 < e.stack.indexOf(`@`)
                  ? `@unknown:0:0`
                  : ``))
        }
      return (
        `
` +
        he +
        e +
        ge
      )
    }
    var ve = !1
    function ye(e, t) {
      if (!e || ve) return ``
      ve = !0
      var n = Error.prepareStackTrace
      Error.prepareStackTrace = void 0
      try {
        var r = {
          DetermineComponentFrameRoot: function () {
            try {
              if (t) {
                var n = function () {
                  throw Error()
                }
                if (
                  (Object.defineProperty(n.prototype, "props", {
                    set: function () {
                      throw Error()
                    },
                  }),
                  typeof Reflect == `object` && Reflect.construct)
                ) {
                  try {
                    Reflect.construct(n, [])
                  } catch (e) {
                    var r = e
                  }
                  Reflect.construct(e, [], n)
                } else {
                  try {
                    n.call()
                  } catch (e) {
                    r = e
                  }
                  e.call(n.prototype)
                }
              } else {
                try {
                  throw Error()
                } catch (e) {
                  r = e
                }
                ;(n = e()) && typeof n.catch == `function` && n.catch(function () {})
              }
            } catch (e) {
              if (e && r && typeof e.stack == `string`) return [e.stack, r.stack]
            }
            return [null, null]
          },
        }
        r.DetermineComponentFrameRoot.displayName = `DetermineComponentFrameRoot`
        var i = Object.getOwnPropertyDescriptor(r.DetermineComponentFrameRoot, `name`)
        i &&
          i.configurable &&
          Object.defineProperty(r.DetermineComponentFrameRoot, "name", {
            value: `DetermineComponentFrameRoot`,
          })
        var a = r.DetermineComponentFrameRoot(),
          o = a[0],
          s = a[1]
        if (o && s) {
          var c = o.split(`
`),
            l = s.split(`
`)
          for (i = r = 0; r < c.length && !c[r].includes(`DetermineComponentFrameRoot`);) r++
          for (; i < l.length && !l[i].includes(`DetermineComponentFrameRoot`);) i++
          if (r === c.length || i === l.length)
            for (r = c.length - 1, i = l.length - 1; 1 <= r && 0 <= i && c[r] !== l[i];) i--
          for (; 1 <= r && 0 <= i; r--, i--)
            if (c[r] !== l[i]) {
              if (r !== 1 || i !== 1)
                do
                  if ((r--, i--, 0 > i || c[r] !== l[i])) {
                    var u =
                      `
` + c[r].replace(` at new `, ` at `)
                    return (
                      e.displayName &&
                        u.includes(`<anonymous>`) &&
                        (u = u.replace(`<anonymous>`, e.displayName)),
                      u
                    )
                  }
                while (1 <= r && 0 <= i)
              break
            }
        }
      } finally {
        ;((ve = !1), (Error.prepareStackTrace = n))
      }
      return (n = e ? e.displayName || e.name : ``) ? _e(n) : ``
    }
    function be(e, t) {
      switch (e.tag) {
        case 26:
        case 27:
        case 5:
          return _e(e.type)
        case 16:
          return _e(`Lazy`)
        case 13:
          return e.child !== t && t !== null ? _e(`Suspense Fallback`) : _e(`Suspense`)
        case 19:
          return _e(`SuspenseList`)
        case 0:
        case 15:
          return ye(e.type, !1)
        case 11:
          return ye(e.type.render, !1)
        case 1:
          return ye(e.type, !0)
        case 31:
          return _e(`Activity`)
        default:
          return ``
      }
    }
    function xe(e) {
      try {
        var t = ``,
          n = null
        do ((t += be(e, n)), (n = e), (e = e.return))
        while (e)
        return t
      } catch (e) {
        return (
          `
Error generating stack: ` +
          e.message +
          `
` +
          e.stack
        )
      }
    }
    var Se = Object.prototype.hasOwnProperty,
      Ce = t.unstable_scheduleCallback,
      we = t.unstable_cancelCallback,
      Te = t.unstable_shouldYield,
      Ee = t.unstable_requestPaint,
      De = t.unstable_now,
      Oe = t.unstable_getCurrentPriorityLevel,
      ke = t.unstable_ImmediatePriority,
      Ae = t.unstable_UserBlockingPriority,
      je = t.unstable_NormalPriority,
      Me = t.unstable_LowPriority,
      Ne = t.unstable_IdlePriority,
      Pe = t.log,
      Fe = t.unstable_setDisableYieldValue,
      Ie = null,
      Le = null
    function Re(e) {
      if ((typeof Pe == `function` && Fe(e), Le && typeof Le.setStrictMode == `function`))
        try {
          Le.setStrictMode(Ie, e)
        } catch {}
    }
    var ze = Math.clz32 ? Math.clz32 : He,
      Be = Math.log,
      Ve = Math.LN2
    function He(e) {
      return ((e >>>= 0), e === 0 ? 32 : (31 - ((Be(e) / Ve) | 0)) | 0)
    }
    var Ue = 256,
      We = 262144,
      Ge = 4194304
    function Ke(e) {
      var t = e & 42
      if (t !== 0) return t
      switch (e & -e) {
        case 1:
          return 1
        case 2:
          return 2
        case 4:
          return 4
        case 8:
          return 8
        case 16:
          return 16
        case 32:
          return 32
        case 64:
          return 64
        case 128:
          return 128
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
          return e & 261888
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return e & 3932160
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return e & 62914560
        case 67108864:
          return 67108864
        case 134217728:
          return 134217728
        case 268435456:
          return 268435456
        case 536870912:
          return 536870912
        case 1073741824:
          return 0
        default:
          return e
      }
    }
    function qe(e, t, n) {
      var r = e.pendingLanes
      if (r === 0) return 0
      var i = 0,
        a = e.suspendedLanes,
        o = e.pingedLanes
      e = e.warmLanes
      var s = r & 134217727
      return (
        s === 0
          ? ((s = r & ~a),
            s === 0
              ? o === 0
                ? n || ((n = r & ~e), n !== 0 && (i = Ke(n)))
                : (i = Ke(o))
              : (i = Ke(s)))
          : ((r = s & ~a),
            r === 0
              ? ((o &= s), o === 0 ? n || ((n = s & ~e), n !== 0 && (i = Ke(n))) : (i = Ke(o)))
              : (i = Ke(r))),
        i === 0
          ? 0
          : t !== 0 &&
              t !== i &&
              (t & a) === 0 &&
              ((a = i & -i), (n = t & -t), a >= n || (a === 32 && n & 4194048))
            ? t
            : i
      )
    }
    function Je(e, t) {
      return (e.pendingLanes & ~(e.suspendedLanes & ~e.pingedLanes) & t) === 0
    }
    function Ye(e, t) {
      switch (e) {
        case 1:
        case 2:
        case 4:
        case 8:
        case 64:
          return t + 250
        case 16:
        case 32:
        case 128:
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
          return t + 5e3
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          return -1
        case 67108864:
        case 134217728:
        case 268435456:
        case 536870912:
        case 1073741824:
          return -1
        default:
          return -1
      }
    }
    function Xe() {
      var e = Ge
      return ((Ge <<= 1), !(Ge & 62914560) && (Ge = 4194304), e)
    }
    function Ze(e) {
      for (var t = [], n = 0; 31 > n; n++) t.push(e)
      return t
    }
    function Qe(e, t) {
      ;((e.pendingLanes |= t),
        t !== 268435456 && ((e.suspendedLanes = 0), (e.pingedLanes = 0), (e.warmLanes = 0)))
    }
    function $e(e, t, n, r, i, a) {
      var o = e.pendingLanes
      ;((e.pendingLanes = n),
        (e.suspendedLanes = 0),
        (e.pingedLanes = 0),
        (e.warmLanes = 0),
        (e.expiredLanes &= n),
        (e.entangledLanes &= n),
        (e.errorRecoveryDisabledLanes &= n),
        (e.shellSuspendCounter = 0))
      var s = e.entanglements,
        c = e.expirationTimes,
        l = e.hiddenUpdates
      for (n = o & ~n; 0 < n;) {
        var u = 31 - ze(n),
          d = 1 << u
        ;((s[u] = 0), (c[u] = -1))
        var f = l[u]
        if (f !== null)
          for (l[u] = null, u = 0; u < f.length; u++) {
            var p = f[u]
            p !== null && (p.lane &= -536870913)
          }
        n &= ~d
      }
      ;(r !== 0 && et(e, r, 0),
        a !== 0 && i === 0 && e.tag !== 0 && (e.suspendedLanes |= a & ~(o & ~t)))
    }
    function et(e, t, n) {
      ;((e.pendingLanes |= t), (e.suspendedLanes &= ~t))
      var r = 31 - ze(t)
      ;((e.entangledLanes |= t),
        (e.entanglements[r] = e.entanglements[r] | 1073741824 | (n & 261930)))
    }
    function tt(e, t) {
      var n = (e.entangledLanes |= t)
      for (e = e.entanglements; n;) {
        var r = 31 - ze(n),
          i = 1 << r
        ;((i & t) | (e[r] & t) && (e[r] |= t), (n &= ~i))
      }
    }
    function nt(e, t) {
      var n = t & -t
      return ((n = n & 42 ? 1 : rt(n)), (n & (e.suspendedLanes | t)) === 0 ? n : 0)
    }
    function rt(e) {
      switch (e) {
        case 2:
          e = 1
          break
        case 8:
          e = 4
          break
        case 32:
          e = 16
          break
        case 256:
        case 512:
        case 1024:
        case 2048:
        case 4096:
        case 8192:
        case 16384:
        case 32768:
        case 65536:
        case 131072:
        case 262144:
        case 524288:
        case 1048576:
        case 2097152:
        case 4194304:
        case 8388608:
        case 16777216:
        case 33554432:
          e = 128
          break
        case 268435456:
          e = 134217728
          break
        default:
          e = 0
      }
      return e
    }
    function it(e) {
      return ((e &= -e), 2 < e ? (8 < e ? (e & 134217727 ? 32 : 268435456) : 8) : 2)
    }
    function at() {
      var e = j.p
      return e === 0 ? ((e = window.event), e === void 0 ? 32 : mp(e.type)) : e
    }
    function ot(e, t) {
      var n = j.p
      try {
        return ((j.p = e), t())
      } finally {
        j.p = n
      }
    }
    var st = Math.random().toString(36).slice(2),
      ct = `__reactFiber$` + st,
      lt = `__reactProps$` + st,
      ut = `__reactContainer$` + st,
      dt = `__reactEvents$` + st,
      ft = `__reactListeners$` + st,
      pt = `__reactHandles$` + st,
      mt = `__reactResources$` + st,
      ht = `__reactMarker$` + st
    function gt(e) {
      ;(delete e[ct], delete e[lt], delete e[dt], delete e[ft], delete e[pt])
    }
    function _t(e) {
      var t = e[ct]
      if (t) return t
      for (var n = e.parentNode; n;) {
        if ((t = n[ut] || n[ct])) {
          if (((n = t.alternate), t.child !== null || (n !== null && n.child !== null)))
            for (e = df(e); e !== null;) {
              if ((n = e[ct])) return n
              e = df(e)
            }
          return t
        }
        ;((e = n), (n = e.parentNode))
      }
      return null
    }
    function vt(e) {
      if ((e = e[ct] || e[ut])) {
        var t = e.tag
        if (t === 5 || t === 6 || t === 13 || t === 31 || t === 26 || t === 27 || t === 3) return e
      }
      return null
    }
    function yt(e) {
      var t = e.tag
      if (t === 5 || t === 26 || t === 27 || t === 6) return e.stateNode
      throw Error(i(33))
    }
    function bt(e) {
      var t = e[mt]
      return ((t ||= e[mt] = { hoistableStyles: new Map(), hoistableScripts: new Map() }), t)
    }
    function xt(e) {
      e[ht] = !0
    }
    var St = new Set(),
      Ct = {}
    function wt(e, t) {
      ;(Tt(e, t), Tt(e + `Capture`, t))
    }
    function Tt(e, t) {
      for (Ct[e] = t, e = 0; e < t.length; e++) St.add(t[e])
    }
    var Et = RegExp(
        `^[:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD][:A-Z_a-z\\u00C0-\\u00D6\\u00D8-\\u00F6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\-.0-9\\u00B7\\u0300-\\u036F\\u203F-\\u2040]*$`,
      ),
      Dt = {},
      Ot = {}
    function kt(e) {
      return Se.call(Ot, e)
        ? !0
        : Se.call(Dt, e)
          ? !1
          : Et.test(e)
            ? (Ot[e] = !0)
            : ((Dt[e] = !0), !1)
    }
    function At(e, t, n) {
      if (kt(t)) {
        if (n === null) e.removeAttribute(t)
        else {
          switch (typeof n) {
            case `undefined`:
            case `function`:
            case `symbol`:
              e.removeAttribute(t)
              return
            case `boolean`:
              var r = t.toLowerCase().slice(0, 5)
              if (r !== `data-` && r !== `aria-`) {
                e.removeAttribute(t)
                return
              }
          }
          e.setAttribute(t, `` + n)
        }
      }
    }
    function jt(e, t, n) {
      if (n === null) e.removeAttribute(t)
      else {
        switch (typeof n) {
          case `undefined`:
          case `function`:
          case `symbol`:
          case `boolean`:
            e.removeAttribute(t)
            return
        }
        e.setAttribute(t, `` + n)
      }
    }
    function Mt(e, t, n, r) {
      if (r === null) e.removeAttribute(n)
      else {
        switch (typeof r) {
          case `undefined`:
          case `function`:
          case `symbol`:
          case `boolean`:
            e.removeAttribute(n)
            return
        }
        e.setAttributeNS(t, n, `` + r)
      }
    }
    function Nt(e) {
      switch (typeof e) {
        case `bigint`:
        case `boolean`:
        case `number`:
        case `string`:
        case `undefined`:
          return e
        case `object`:
          return e
        default:
          return ``
      }
    }
    function Pt(e) {
      var t = e.type
      return (e = e.nodeName) && e.toLowerCase() === `input` && (t === `checkbox` || t === `radio`)
    }
    function Ft(e, t, n) {
      var r = Object.getOwnPropertyDescriptor(e.constructor.prototype, t)
      if (
        !e.hasOwnProperty(t) &&
        r !== void 0 &&
        typeof r.get == `function` &&
        typeof r.set == `function`
      ) {
        var i = r.get,
          a = r.set
        return (
          Object.defineProperty(e, t, {
            configurable: !0,
            get: function () {
              return i.call(this)
            },
            set: function (e) {
              ;((n = `` + e), a.call(this, e))
            },
          }),
          Object.defineProperty(e, t, { enumerable: r.enumerable }),
          {
            getValue: function () {
              return n
            },
            setValue: function (e) {
              n = `` + e
            },
            stopTracking: function () {
              ;((e._valueTracker = null), delete e[t])
            },
          }
        )
      }
    }
    function It(e) {
      if (!e._valueTracker) {
        var t = Pt(e) ? `checked` : `value`
        e._valueTracker = Ft(e, t, `` + e[t])
      }
    }
    function Lt(e) {
      if (!e) return !1
      var t = e._valueTracker
      if (!t) return !0
      var n = t.getValue(),
        r = ``
      return (
        e && (r = Pt(e) ? (e.checked ? `true` : `false`) : e.value),
        (e = r),
        e !== n && (t.setValue(e), !0)
      )
    }
    function Rt(e) {
      if (((e ||= typeof document < `u` ? document : void 0), e === void 0)) return null
      try {
        return e.activeElement || e.body
      } catch {
        return e.body
      }
    }
    var zt = /[\n"\\]/g
    function Bt(e) {
      return e.replace(zt, function (e) {
        return `\\` + e.charCodeAt(0).toString(16) + ` `
      })
    }
    function Vt(e, t, n, r, i, a, o, s) {
      ;((e.name = ``),
        o != null && typeof o != `function` && typeof o != `symbol` && typeof o != `boolean`
          ? (e.type = o)
          : e.removeAttribute(`type`),
        t == null
          ? (o !== `submit` && o !== `reset`) || e.removeAttribute(`value`)
          : o === `number`
            ? ((t === 0 && e.value === ``) || e.value != t) && (e.value = `` + Nt(t))
            : e.value !== `` + Nt(t) && (e.value = `` + Nt(t)),
        t == null
          ? n == null
            ? r != null && e.removeAttribute(`value`)
            : Ut(e, o, Nt(n))
          : Ut(e, o, Nt(t)),
        i == null && a != null && (e.defaultChecked = !!a),
        i != null && (e.checked = i && typeof i != `function` && typeof i != `symbol`),
        s != null && typeof s != `function` && typeof s != `symbol` && typeof s != `boolean`
          ? (e.name = `` + Nt(s))
          : e.removeAttribute(`name`))
    }
    function Ht(e, t, n, r, i, a, o, s) {
      if (
        (a != null &&
          typeof a != `function` &&
          typeof a != `symbol` &&
          typeof a != `boolean` &&
          (e.type = a),
        t != null || n != null)
      ) {
        if (!((a !== `submit` && a !== `reset`) || t != null)) {
          It(e)
          return
        }
        ;((n = n == null ? `` : `` + Nt(n)),
          (t = t == null ? n : `` + Nt(t)),
          s || t === e.value || (e.value = t),
          (e.defaultValue = t))
      }
      ;((r ??= i),
        (r = typeof r != `function` && typeof r != `symbol` && !!r),
        (e.checked = s ? e.checked : !!r),
        (e.defaultChecked = !!r),
        o != null &&
          typeof o != `function` &&
          typeof o != `symbol` &&
          typeof o != `boolean` &&
          (e.name = o),
        It(e))
    }
    function Ut(e, t, n) {
      ;(t === `number` && Rt(e.ownerDocument) === e) ||
        e.defaultValue === `` + n ||
        (e.defaultValue = `` + n)
    }
    function Wt(e, t, n, r) {
      if (((e = e.options), t)) {
        t = {}
        for (var i = 0; i < n.length; i++) t[`$` + n[i]] = !0
        for (n = 0; n < e.length; n++)
          ((i = t.hasOwnProperty(`$` + e[n].value)),
            e[n].selected !== i && (e[n].selected = i),
            i && r && (e[n].defaultSelected = !0))
      } else {
        for (n = `` + Nt(n), t = null, i = 0; i < e.length; i++) {
          if (e[i].value === n) {
            ;((e[i].selected = !0), r && (e[i].defaultSelected = !0))
            return
          }
          t !== null || e[i].disabled || (t = e[i])
        }
        t !== null && (t.selected = !0)
      }
    }
    function Gt(e, t, n) {
      if (t != null && ((t = `` + Nt(t)), t !== e.value && (e.value = t), n == null)) {
        e.defaultValue !== t && (e.defaultValue = t)
        return
      }
      e.defaultValue = n == null ? `` : `` + Nt(n)
    }
    function Kt(e, t, n, r) {
      if (t == null) {
        if (r != null) {
          if (n != null) throw Error(i(92))
          if (k(r)) {
            if (1 < r.length) throw Error(i(93))
            r = r[0]
          }
          n = r
        }
        ;((n ??= ``), (t = n))
      }
      ;((n = Nt(t)),
        (e.defaultValue = n),
        (r = e.textContent),
        r === n && r !== `` && r !== null && (e.value = r),
        It(e))
    }
    function qt(e, t) {
      if (t) {
        var n = e.firstChild
        if (n && n === e.lastChild && n.nodeType === 3) {
          n.nodeValue = t
          return
        }
      }
      e.textContent = t
    }
    var Jt = new Set(
      `animationIterationCount aspectRatio borderImageOutset borderImageSlice borderImageWidth boxFlex boxFlexGroup boxOrdinalGroup columnCount columns flex flexGrow flexPositive flexShrink flexNegative flexOrder gridArea gridRow gridRowEnd gridRowSpan gridRowStart gridColumn gridColumnEnd gridColumnSpan gridColumnStart fontWeight lineClamp lineHeight opacity order orphans scale tabSize widows zIndex zoom fillOpacity floodOpacity stopOpacity strokeDasharray strokeDashoffset strokeMiterlimit strokeOpacity strokeWidth MozAnimationIterationCount MozBoxFlex MozBoxFlexGroup MozLineClamp msAnimationIterationCount msFlex msZoom msFlexGrow msFlexNegative msFlexOrder msFlexPositive msFlexShrink msGridColumn msGridColumnSpan msGridRow msGridRowSpan WebkitAnimationIterationCount WebkitBoxFlex WebKitBoxFlexGroup WebkitBoxOrdinalGroup WebkitColumnCount WebkitColumns WebkitFlex WebkitFlexGrow WebkitFlexPositive WebkitFlexShrink WebkitLineClamp`.split(
        ` `,
      ),
    )
    function Yt(e, t, n) {
      var r = t.indexOf(`--`) === 0
      n == null || typeof n == `boolean` || n === ``
        ? r
          ? e.setProperty(t, ``)
          : t === `float`
            ? (e.cssFloat = ``)
            : (e[t] = ``)
        : r
          ? e.setProperty(t, n)
          : typeof n != `number` || n === 0 || Jt.has(t)
            ? t === `float`
              ? (e.cssFloat = n)
              : (e[t] = (`` + n).trim())
            : (e[t] = n + `px`)
    }
    function Xt(e, t, n) {
      if (t != null && typeof t != `object`) throw Error(i(62))
      if (((e = e.style), n != null)) {
        for (var r in n)
          !n.hasOwnProperty(r) ||
            (t != null && t.hasOwnProperty(r)) ||
            (r.indexOf(`--`) === 0
              ? e.setProperty(r, ``)
              : r === `float`
                ? (e.cssFloat = ``)
                : (e[r] = ``))
        for (var a in t) ((r = t[a]), t.hasOwnProperty(a) && n[a] !== r && Yt(e, a, r))
      } else for (var o in t) t.hasOwnProperty(o) && Yt(e, o, t[o])
    }
    function Zt(e) {
      if (e.indexOf(`-`) === -1) return !1
      switch (e) {
        case `annotation-xml`:
        case `color-profile`:
        case `font-face`:
        case `font-face-src`:
        case `font-face-uri`:
        case `font-face-format`:
        case `font-face-name`:
        case `missing-glyph`:
          return !1
        default:
          return !0
      }
    }
    var Qt = new Map([
        [`acceptCharset`, `accept-charset`],
        [`htmlFor`, `for`],
        [`httpEquiv`, `http-equiv`],
        [`crossOrigin`, `crossorigin`],
        [`accentHeight`, `accent-height`],
        [`alignmentBaseline`, `alignment-baseline`],
        [`arabicForm`, `arabic-form`],
        [`baselineShift`, `baseline-shift`],
        [`capHeight`, `cap-height`],
        [`clipPath`, `clip-path`],
        [`clipRule`, `clip-rule`],
        [`colorInterpolation`, `color-interpolation`],
        [`colorInterpolationFilters`, `color-interpolation-filters`],
        [`colorProfile`, `color-profile`],
        [`colorRendering`, `color-rendering`],
        [`dominantBaseline`, `dominant-baseline`],
        [`enableBackground`, `enable-background`],
        [`fillOpacity`, `fill-opacity`],
        [`fillRule`, `fill-rule`],
        [`floodColor`, `flood-color`],
        [`floodOpacity`, `flood-opacity`],
        [`fontFamily`, `font-family`],
        [`fontSize`, `font-size`],
        [`fontSizeAdjust`, `font-size-adjust`],
        [`fontStretch`, `font-stretch`],
        [`fontStyle`, `font-style`],
        [`fontVariant`, `font-variant`],
        [`fontWeight`, `font-weight`],
        [`glyphName`, `glyph-name`],
        [`glyphOrientationHorizontal`, `glyph-orientation-horizontal`],
        [`glyphOrientationVertical`, `glyph-orientation-vertical`],
        [`horizAdvX`, `horiz-adv-x`],
        [`horizOriginX`, `horiz-origin-x`],
        [`imageRendering`, `image-rendering`],
        [`letterSpacing`, `letter-spacing`],
        [`lightingColor`, `lighting-color`],
        [`markerEnd`, `marker-end`],
        [`markerMid`, `marker-mid`],
        [`markerStart`, `marker-start`],
        [`overlinePosition`, `overline-position`],
        [`overlineThickness`, `overline-thickness`],
        [`paintOrder`, `paint-order`],
        [`panose-1`, `panose-1`],
        [`pointerEvents`, `pointer-events`],
        [`renderingIntent`, `rendering-intent`],
        [`shapeRendering`, `shape-rendering`],
        [`stopColor`, `stop-color`],
        [`stopOpacity`, `stop-opacity`],
        [`strikethroughPosition`, `strikethrough-position`],
        [`strikethroughThickness`, `strikethrough-thickness`],
        [`strokeDasharray`, `stroke-dasharray`],
        [`strokeDashoffset`, `stroke-dashoffset`],
        [`strokeLinecap`, `stroke-linecap`],
        [`strokeLinejoin`, `stroke-linejoin`],
        [`strokeMiterlimit`, `stroke-miterlimit`],
        [`strokeOpacity`, `stroke-opacity`],
        [`strokeWidth`, `stroke-width`],
        [`textAnchor`, `text-anchor`],
        [`textDecoration`, `text-decoration`],
        [`textRendering`, `text-rendering`],
        [`transformOrigin`, `transform-origin`],
        [`underlinePosition`, `underline-position`],
        [`underlineThickness`, `underline-thickness`],
        [`unicodeBidi`, `unicode-bidi`],
        [`unicodeRange`, `unicode-range`],
        [`unitsPerEm`, `units-per-em`],
        [`vAlphabetic`, `v-alphabetic`],
        [`vHanging`, `v-hanging`],
        [`vIdeographic`, `v-ideographic`],
        [`vMathematical`, `v-mathematical`],
        [`vectorEffect`, `vector-effect`],
        [`vertAdvY`, `vert-adv-y`],
        [`vertOriginX`, `vert-origin-x`],
        [`vertOriginY`, `vert-origin-y`],
        [`wordSpacing`, `word-spacing`],
        [`writingMode`, `writing-mode`],
        [`xmlnsXlink`, `xmlns:xlink`],
        [`xHeight`, `x-height`],
      ]),
      $t =
        /^[\u0000-\u001F ]*j[\r\n\t]*a[\r\n\t]*v[\r\n\t]*a[\r\n\t]*s[\r\n\t]*c[\r\n\t]*r[\r\n\t]*i[\r\n\t]*p[\r\n\t]*t[\r\n\t]*:/i
    function en(e) {
      return $t.test(`` + e)
        ? `javascript:throw new Error('React has blocked a javascript: URL as a security precaution.')`
        : e
    }
    function tn() {}
    var nn = null
    function rn(e) {
      return (
        (e = e.target || e.srcElement || window),
        e.correspondingUseElement && (e = e.correspondingUseElement),
        e.nodeType === 3 ? e.parentNode : e
      )
    }
    var an = null,
      on = null
    function sn(e) {
      var t = vt(e)
      if (t && (e = t.stateNode)) {
        var n = e[lt] || null
        a: switch (((e = t.stateNode), t.type)) {
          case `input`:
            if (
              (Vt(
                e,
                n.value,
                n.defaultValue,
                n.defaultValue,
                n.checked,
                n.defaultChecked,
                n.type,
                n.name,
              ),
              (t = n.name),
              n.type === `radio` && t != null)
            ) {
              for (n = e; n.parentNode;) n = n.parentNode
              for (
                n = n.querySelectorAll(`input[name="` + Bt(`` + t) + `"][type="radio"]`), t = 0;
                t < n.length;
                t++
              ) {
                var r = n[t]
                if (r !== e && r.form === e.form) {
                  var a = r[lt] || null
                  if (!a) throw Error(i(90))
                  Vt(
                    r,
                    a.value,
                    a.defaultValue,
                    a.defaultValue,
                    a.checked,
                    a.defaultChecked,
                    a.type,
                    a.name,
                  )
                }
              }
              for (t = 0; t < n.length; t++) ((r = n[t]), r.form === e.form && Lt(r))
            }
            break a
          case `textarea`:
            Gt(e, n.value, n.defaultValue)
            break a
          case `select`:
            ;((t = n.value), t != null && Wt(e, !!n.multiple, t, !1))
        }
      }
    }
    var cn = !1
    function ln(e, t, n) {
      if (cn) return e(t, n)
      cn = !0
      try {
        return e(t)
      } finally {
        if (
          ((cn = !1),
          (an !== null || on !== null) &&
            (vu(), an && ((t = an), (e = on), (on = an = null), sn(t), e)))
        )
          for (t = 0; t < e.length; t++) sn(e[t])
      }
    }
    function un(e, t) {
      var n = e.stateNode
      if (n === null) return null
      var r = n[lt] || null
      if (r === null) return null
      n = r[t]
      a: switch (t) {
        case `onClick`:
        case `onClickCapture`:
        case `onDoubleClick`:
        case `onDoubleClickCapture`:
        case `onMouseDown`:
        case `onMouseDownCapture`:
        case `onMouseMove`:
        case `onMouseMoveCapture`:
        case `onMouseUp`:
        case `onMouseUpCapture`:
        case `onMouseEnter`:
          ;((r = !r.disabled) ||
            ((e = e.type),
            (r = e !== `button` && e !== `input` && e !== `select` && e !== `textarea`)),
            (e = !r))
          break a
        default:
          e = !1
      }
      if (e) return null
      if (n && typeof n != `function`) throw Error(i(231, t, typeof n))
      return n
    }
    var dn = !(
        typeof window > `u` ||
        window.document === void 0 ||
        window.document.createElement === void 0
      ),
      fn = !1
    if (dn)
      try {
        var pn = {}
        ;(Object.defineProperty(pn, "passive", {
          get: function () {
            fn = !0
          },
        }),
          window.addEventListener(`test`, pn, pn),
          window.removeEventListener(`test`, pn, pn))
      } catch {
        fn = !1
      }
    var mn = null,
      hn = null,
      gn = null
    function _n() {
      if (gn) return gn
      var e,
        t = hn,
        n = t.length,
        r,
        i = `value` in mn ? mn.value : mn.textContent,
        a = i.length
      for (e = 0; e < n && t[e] === i[e]; e++);
      var o = n - e
      for (r = 1; r <= o && t[n - r] === i[a - r]; r++);
      return (gn = i.slice(e, 1 < r ? 1 - r : void 0))
    }
    function vn(e) {
      var t = e.keyCode
      return (
        `charCode` in e ? ((e = e.charCode), e === 0 && t === 13 && (e = 13)) : (e = t),
        e === 10 && (e = 13),
        32 <= e || e === 13 ? e : 0
      )
    }
    function yn() {
      return !0
    }
    function bn() {
      return !1
    }
    function xn(e) {
      function t(t, n, r, i, a) {
        for (var o in ((this._reactName = t),
        (this._targetInst = r),
        (this.type = n),
        (this.nativeEvent = i),
        (this.target = a),
        (this.currentTarget = null),
        e))
          e.hasOwnProperty(o) && ((t = e[o]), (this[o] = t ? t(i) : i[o]))
        return (
          (this.isDefaultPrevented = (
            i.defaultPrevented == null ? !1 === i.returnValue : i.defaultPrevented
          )
            ? yn
            : bn),
          (this.isPropagationStopped = bn),
          this
        )
      }
      return (
        h(t.prototype, {
          preventDefault: function () {
            this.defaultPrevented = !0
            var e = this.nativeEvent
            e &&
              (e.preventDefault
                ? e.preventDefault()
                : typeof e.returnValue != `unknown` && (e.returnValue = !1),
              (this.isDefaultPrevented = yn))
          },
          stopPropagation: function () {
            var e = this.nativeEvent
            e &&
              (e.stopPropagation
                ? e.stopPropagation()
                : typeof e.cancelBubble != `unknown` && (e.cancelBubble = !0),
              (this.isPropagationStopped = yn))
          },
          persist: function () {},
          isPersistent: yn,
        }),
        t
      )
    }
    var Sn = {
        eventPhase: 0,
        bubbles: 0,
        cancelable: 0,
        timeStamp: function (e) {
          return e.timeStamp || Date.now()
        },
        defaultPrevented: 0,
        isTrusted: 0,
      },
      Cn = xn(Sn),
      wn = h({}, Sn, { view: 0, detail: 0 }),
      Tn = xn(wn),
      En,
      Dn,
      On,
      kn = h({}, wn, {
        screenX: 0,
        screenY: 0,
        clientX: 0,
        clientY: 0,
        pageX: 0,
        pageY: 0,
        ctrlKey: 0,
        shiftKey: 0,
        altKey: 0,
        metaKey: 0,
        getModifierState: zn,
        button: 0,
        buttons: 0,
        relatedTarget: function (e) {
          return e.relatedTarget === void 0
            ? e.fromElement === e.srcElement
              ? e.toElement
              : e.fromElement
            : e.relatedTarget
        },
        movementX: function (e) {
          return `movementX` in e
            ? e.movementX
            : (e !== On &&
                (On && e.type === `mousemove`
                  ? ((En = e.screenX - On.screenX), (Dn = e.screenY - On.screenY))
                  : (Dn = En = 0),
                (On = e)),
              En)
        },
        movementY: function (e) {
          return `movementY` in e ? e.movementY : Dn
        },
      }),
      An = xn(kn),
      jn = xn(h({}, kn, { dataTransfer: 0 })),
      Mn = xn(h({}, wn, { relatedTarget: 0 })),
      Nn = xn(h({}, Sn, { animationName: 0, elapsedTime: 0, pseudoElement: 0 })),
      Pn = xn(
        h({}, Sn, {
          clipboardData: function (e) {
            return `clipboardData` in e ? e.clipboardData : window.clipboardData
          },
        }),
      ),
      Fn = xn(h({}, Sn, { data: 0 })),
      L = {
        Esc: `Escape`,
        Spacebar: ` `,
        Left: `ArrowLeft`,
        Up: `ArrowUp`,
        Right: `ArrowRight`,
        Down: `ArrowDown`,
        Del: `Delete`,
        Win: `OS`,
        Menu: `ContextMenu`,
        Apps: `ContextMenu`,
        Scroll: `ScrollLock`,
        MozPrintableKey: `Unidentified`,
      },
      In = {
        8: `Backspace`,
        9: `Tab`,
        12: `Clear`,
        13: `Enter`,
        16: `Shift`,
        17: `Control`,
        18: `Alt`,
        19: `Pause`,
        20: `CapsLock`,
        27: `Escape`,
        32: ` `,
        33: `PageUp`,
        34: `PageDown`,
        35: `End`,
        36: `Home`,
        37: `ArrowLeft`,
        38: `ArrowUp`,
        39: `ArrowRight`,
        40: `ArrowDown`,
        45: `Insert`,
        46: `Delete`,
        112: `F1`,
        113: `F2`,
        114: `F3`,
        115: `F4`,
        116: `F5`,
        117: `F6`,
        118: `F7`,
        119: `F8`,
        120: `F9`,
        121: `F10`,
        122: `F11`,
        123: `F12`,
        144: `NumLock`,
        145: `ScrollLock`,
        224: `Meta`,
      },
      Ln = { Alt: `altKey`, Control: `ctrlKey`, Meta: `metaKey`, Shift: `shiftKey` }
    function Rn(e) {
      var t = this.nativeEvent
      return t.getModifierState ? t.getModifierState(e) : (e = Ln[e]) ? !!t[e] : !1
    }
    function zn() {
      return Rn
    }
    var Bn = xn(
        h({}, wn, {
          key: function (e) {
            if (e.key) {
              var t = L[e.key] || e.key
              if (t !== `Unidentified`) return t
            }
            return e.type === `keypress`
              ? ((e = vn(e)), e === 13 ? `Enter` : String.fromCharCode(e))
              : e.type === `keydown` || e.type === `keyup`
                ? In[e.keyCode] || `Unidentified`
                : ``
          },
          code: 0,
          location: 0,
          ctrlKey: 0,
          shiftKey: 0,
          altKey: 0,
          metaKey: 0,
          repeat: 0,
          locale: 0,
          getModifierState: zn,
          charCode: function (e) {
            return e.type === `keypress` ? vn(e) : 0
          },
          keyCode: function (e) {
            return e.type === `keydown` || e.type === `keyup` ? e.keyCode : 0
          },
          which: function (e) {
            return e.type === `keypress`
              ? vn(e)
              : e.type === `keydown` || e.type === `keyup`
                ? e.keyCode
                : 0
          },
        }),
      ),
      Vn = xn(
        h({}, kn, {
          pointerId: 0,
          width: 0,
          height: 0,
          pressure: 0,
          tangentialPressure: 0,
          tiltX: 0,
          tiltY: 0,
          twist: 0,
          pointerType: 0,
          isPrimary: 0,
        }),
      ),
      Hn = xn(
        h({}, wn, {
          touches: 0,
          targetTouches: 0,
          changedTouches: 0,
          altKey: 0,
          metaKey: 0,
          ctrlKey: 0,
          shiftKey: 0,
          getModifierState: zn,
        }),
      ),
      Un = xn(h({}, Sn, { propertyName: 0, elapsedTime: 0, pseudoElement: 0 })),
      Wn = xn(
        h({}, kn, {
          deltaX: function (e) {
            return `deltaX` in e ? e.deltaX : `wheelDeltaX` in e ? -e.wheelDeltaX : 0
          },
          deltaY: function (e) {
            return `deltaY` in e
              ? e.deltaY
              : `wheelDeltaY` in e
                ? -e.wheelDeltaY
                : `wheelDelta` in e
                  ? -e.wheelDelta
                  : 0
          },
          deltaZ: 0,
          deltaMode: 0,
        }),
      ),
      Gn = xn(h({}, Sn, { newState: 0, oldState: 0 })),
      Kn = [9, 13, 27, 32],
      qn = dn && `CompositionEvent` in window,
      Jn = null
    dn && `documentMode` in document && (Jn = document.documentMode)
    var Yn = dn && `TextEvent` in window && !Jn,
      Xn = dn && (!qn || (Jn && 8 < Jn && 11 >= Jn)),
      Zn = ` `,
      Qn = !1
    function $n(e, t) {
      switch (e) {
        case `keyup`:
          return Kn.indexOf(t.keyCode) !== -1
        case `keydown`:
          return t.keyCode !== 229
        case `keypress`:
        case `mousedown`:
        case `focusout`:
          return !0
        default:
          return !1
      }
    }
    function er(e) {
      return ((e = e.detail), typeof e == `object` && `data` in e ? e.data : null)
    }
    var tr = !1
    function nr(e, t) {
      switch (e) {
        case `compositionend`:
          return er(t)
        case `keypress`:
          return t.which === 32 ? ((Qn = !0), Zn) : null
        case `textInput`:
          return ((e = t.data), e === Zn && Qn ? null : e)
        default:
          return null
      }
    }
    function rr(e, t) {
      if (tr)
        return e === `compositionend` || (!qn && $n(e, t))
          ? ((e = _n()), (gn = hn = mn = null), (tr = !1), e)
          : null
      switch (e) {
        case `paste`:
          return null
        case `keypress`:
          if (!(t.ctrlKey || t.altKey || t.metaKey) || (t.ctrlKey && t.altKey)) {
            if (t.char && 1 < t.char.length) return t.char
            if (t.which) return String.fromCharCode(t.which)
          }
          return null
        case `compositionend`:
          return Xn && t.locale !== `ko` ? null : t.data
        default:
          return null
      }
    }
    var ir = {
      color: !0,
      date: !0,
      datetime: !0,
      "datetime-local": !0,
      email: !0,
      month: !0,
      number: !0,
      password: !0,
      range: !0,
      search: !0,
      tel: !0,
      text: !0,
      time: !0,
      url: !0,
      week: !0,
    }
    function ar(e) {
      var t = e && e.nodeName && e.nodeName.toLowerCase()
      return t === `input` ? !!ir[e.type] : t === `textarea`
    }
    function or(e, t, n, r) {
      ;(an ? (on ? on.push(r) : (on = [r])) : (an = r),
        (t = Td(t, `onChange`)),
        0 < t.length &&
          ((n = new Cn(`onChange`, `change`, null, n, r)), e.push({ event: n, listeners: t })))
    }
    var sr = null,
      cr = null
    function lr(e) {
      vd(e, 0)
    }
    function ur(e) {
      if (Lt(yt(e))) return e
    }
    function dr(e, t) {
      if (e === `change`) return t
    }
    var fr = !1
    if (dn) {
      var pr
      if (dn) {
        var mr = `oninput` in document
        if (!mr) {
          var hr = document.createElement(`div`)
          ;(hr.setAttribute(`oninput`, `return;`), (mr = typeof hr.oninput == `function`))
        }
        pr = mr
      } else pr = !1
      fr = pr && (!document.documentMode || 9 < document.documentMode)
    }
    function gr() {
      sr && (sr.detachEvent(`onpropertychange`, _r), (cr = sr = null))
    }
    function _r(e) {
      if (e.propertyName === `value` && ur(cr)) {
        var t = []
        ;(or(t, cr, e, rn(e)), ln(lr, t))
      }
    }
    function vr(e, t, n) {
      e === `focusin`
        ? (gr(), (sr = t), (cr = n), sr.attachEvent(`onpropertychange`, _r))
        : e === `focusout` && gr()
    }
    function yr(e) {
      if (e === `selectionchange` || e === `keyup` || e === `keydown`) return ur(cr)
    }
    function br(e, t) {
      if (e === `click`) return ur(t)
    }
    function xr(e, t) {
      if (e === `input` || e === `change`) return ur(t)
    }
    function Sr(e, t) {
      return (e === t && (e !== 0 || 1 / e == 1 / t)) || (e !== e && t !== t)
    }
    var Cr = typeof Object.is == `function` ? Object.is : Sr
    function wr(e, t) {
      if (Cr(e, t)) return !0
      if (typeof e != `object` || !e || typeof t != `object` || !t) return !1
      var n = Object.keys(e),
        r = Object.keys(t)
      if (n.length !== r.length) return !1
      for (r = 0; r < n.length; r++) {
        var i = n[r]
        if (!Se.call(t, i) || !Cr(e[i], t[i])) return !1
      }
      return !0
    }
    function Tr(e) {
      for (; e && e.firstChild;) e = e.firstChild
      return e
    }
    function Er(e, t) {
      var n = Tr(e)
      e = 0
      for (var r; n;) {
        if (n.nodeType === 3) {
          if (((r = e + n.textContent.length), e <= t && r >= t)) return { node: n, offset: t - e }
          e = r
        }
        a: {
          for (; n;) {
            if (n.nextSibling) {
              n = n.nextSibling
              break a
            }
            n = n.parentNode
          }
          n = void 0
        }
        n = Tr(n)
      }
    }
    function Dr(e, t) {
      return e && t
        ? e === t
          ? !0
          : e && e.nodeType === 3
            ? !1
            : t && t.nodeType === 3
              ? Dr(e, t.parentNode)
              : `contains` in e
                ? e.contains(t)
                : e.compareDocumentPosition
                  ? !!(e.compareDocumentPosition(t) & 16)
                  : !1
        : !1
    }
    function Or(e) {
      e =
        e != null && e.ownerDocument != null && e.ownerDocument.defaultView != null
          ? e.ownerDocument.defaultView
          : window
      for (var t = Rt(e.document); t instanceof e.HTMLIFrameElement;) {
        try {
          var n = typeof t.contentWindow.location.href == `string`
        } catch {
          n = !1
        }
        if (n) e = t.contentWindow
        else break
        t = Rt(e.document)
      }
      return t
    }
    function kr(e) {
      var t = e && e.nodeName && e.nodeName.toLowerCase()
      return (
        t &&
        ((t === `input` &&
          (e.type === `text` ||
            e.type === `search` ||
            e.type === `tel` ||
            e.type === `url` ||
            e.type === `password`)) ||
          t === `textarea` ||
          e.contentEditable === `true`)
      )
    }
    var Ar = dn && `documentMode` in document && 11 >= document.documentMode,
      jr = null,
      Mr = null,
      Nr = null,
      Pr = !1
    function Fr(e, t, n) {
      var r = n.window === n ? n.document : n.nodeType === 9 ? n : n.ownerDocument
      Pr ||
        jr == null ||
        jr !== Rt(r) ||
        ((r = jr),
        `selectionStart` in r && kr(r)
          ? (r = { start: r.selectionStart, end: r.selectionEnd })
          : ((r = ((r.ownerDocument && r.ownerDocument.defaultView) || window).getSelection()),
            (r = {
              anchorNode: r.anchorNode,
              anchorOffset: r.anchorOffset,
              focusNode: r.focusNode,
              focusOffset: r.focusOffset,
            })),
        (Nr && wr(Nr, r)) ||
          ((Nr = r),
          (r = Td(Mr, `onSelect`)),
          0 < r.length &&
            ((t = new Cn(`onSelect`, `select`, null, t, n)),
            e.push({ event: t, listeners: r }),
            (t.target = jr))))
    }
    function Ir(e, t) {
      var n = {}
      return (
        (n[e.toLowerCase()] = t.toLowerCase()),
        (n[`Webkit` + e] = `webkit` + t),
        (n[`Moz` + e] = `moz` + t),
        n
      )
    }
    var Lr = {
        animationend: Ir(`Animation`, `AnimationEnd`),
        animationiteration: Ir(`Animation`, `AnimationIteration`),
        animationstart: Ir(`Animation`, `AnimationStart`),
        transitionrun: Ir(`Transition`, `TransitionRun`),
        transitionstart: Ir(`Transition`, `TransitionStart`),
        transitioncancel: Ir(`Transition`, `TransitionCancel`),
        transitionend: Ir(`Transition`, `TransitionEnd`),
      },
      Rr = {},
      zr = {}
    dn &&
      ((zr = document.createElement(`div`).style),
      `AnimationEvent` in window ||
        (delete Lr.animationend.animation,
        delete Lr.animationiteration.animation,
        delete Lr.animationstart.animation),
      `TransitionEvent` in window || delete Lr.transitionend.transition)
    function Br(e) {
      if (Rr[e]) return Rr[e]
      if (!Lr[e]) return e
      var t = Lr[e],
        n
      for (n in t) if (t.hasOwnProperty(n) && n in zr) return (Rr[e] = t[n])
      return e
    }
    var Vr = Br(`animationend`),
      Hr = Br(`animationiteration`),
      Ur = Br(`animationstart`),
      Wr = Br(`transitionrun`),
      Gr = Br(`transitionstart`),
      Kr = Br(`transitioncancel`),
      qr = Br(`transitionend`),
      Jr = new Map(),
      Yr =
        `abort auxClick beforeToggle cancel canPlay canPlayThrough click close contextMenu copy cut drag dragEnd dragEnter dragExit dragLeave dragOver dragStart drop durationChange emptied encrypted ended error gotPointerCapture input invalid keyDown keyPress keyUp load loadedData loadedMetadata loadStart lostPointerCapture mouseDown mouseMove mouseOut mouseOver mouseUp paste pause play playing pointerCancel pointerDown pointerMove pointerOut pointerOver pointerUp progress rateChange reset resize seeked seeking stalled submit suspend timeUpdate touchCancel touchEnd touchStart volumeChange scroll toggle touchMove waiting wheel`.split(
          ` `,
        )
    Yr.push(`scrollEnd`)
    function Xr(e, t) {
      ;(Jr.set(e, t), wt(t, [e]))
    }
    var Zr =
        typeof reportError == `function`
          ? reportError
          : function (e) {
              if (typeof window == `object` && typeof window.ErrorEvent == `function`) {
                var t = new window.ErrorEvent(`error`, {
                  bubbles: !0,
                  cancelable: !0,
                  message:
                    typeof e == `object` && e && typeof e.message == `string`
                      ? String(e.message)
                      : String(e),
                  error: e,
                })
                if (!window.dispatchEvent(t)) return
              } else if (typeof process == `object` && typeof process.emit == `function`) {
                process.emit(`uncaughtException`, e)
                return
              }
              console.error(e)
            },
      Qr = [],
      $r = 0,
      ei = 0
    function ti() {
      for (var e = $r, t = (ei = $r = 0); t < e;) {
        var n = Qr[t]
        Qr[t++] = null
        var r = Qr[t]
        Qr[t++] = null
        var i = Qr[t]
        Qr[t++] = null
        var a = Qr[t]
        if (((Qr[t++] = null), r !== null && i !== null)) {
          var o = r.pending
          ;(o === null ? (i.next = i) : ((i.next = o.next), (o.next = i)), (r.pending = i))
        }
        a !== 0 && ai(n, i, a)
      }
    }
    function ni(e, t, n, r) {
      ;((Qr[$r++] = e),
        (Qr[$r++] = t),
        (Qr[$r++] = n),
        (Qr[$r++] = r),
        (ei |= r),
        (e.lanes |= r),
        (e = e.alternate),
        e !== null && (e.lanes |= r))
    }
    function ri(e, t, n, r) {
      return (ni(e, t, n, r), oi(e))
    }
    function ii(e, t) {
      return (ni(e, null, null, t), oi(e))
    }
    function ai(e, t, n) {
      e.lanes |= n
      var r = e.alternate
      r !== null && (r.lanes |= n)
      for (var i = !1, a = e.return; a !== null;)
        ((a.childLanes |= n),
          (r = a.alternate),
          r !== null && (r.childLanes |= n),
          a.tag === 22 && ((e = a.stateNode), e === null || e._visibility & 1 || (i = !0)),
          (e = a),
          (a = a.return))
      return e.tag === 3
        ? ((a = e.stateNode),
          i &&
            t !== null &&
            ((i = 31 - ze(n)),
            (e = a.hiddenUpdates),
            (r = e[i]),
            r === null ? (e[i] = [t]) : r.push(t),
            (t.lane = n | 536870912)),
          a)
        : null
    }
    function oi(e) {
      if (50 < lu) throw ((lu = 0), (uu = null), Error(i(185)))
      for (var t = e.return; t !== null;) ((e = t), (t = e.return))
      return e.tag === 3 ? e.stateNode : null
    }
    var si = {}
    function ci(e, t, n, r) {
      ;((this.tag = e),
        (this.key = n),
        (this.sibling =
          this.child =
          this.return =
          this.stateNode =
          this.type =
          this.elementType =
            null),
        (this.index = 0),
        (this.refCleanup = this.ref = null),
        (this.pendingProps = t),
        (this.dependencies = this.memoizedState = this.updateQueue = this.memoizedProps = null),
        (this.mode = r),
        (this.subtreeFlags = this.flags = 0),
        (this.deletions = null),
        (this.childLanes = this.lanes = 0),
        (this.alternate = null))
    }
    function li(e, t, n, r) {
      return new ci(e, t, n, r)
    }
    function ui(e) {
      return ((e = e.prototype), !(!e || !e.isReactComponent))
    }
    function di(e, t) {
      var n = e.alternate
      return (
        n === null
          ? ((n = li(e.tag, t, e.key, e.mode)),
            (n.elementType = e.elementType),
            (n.type = e.type),
            (n.stateNode = e.stateNode),
            (n.alternate = e),
            (e.alternate = n))
          : ((n.pendingProps = t),
            (n.type = e.type),
            (n.flags = 0),
            (n.subtreeFlags = 0),
            (n.deletions = null)),
        (n.flags = e.flags & 65011712),
        (n.childLanes = e.childLanes),
        (n.lanes = e.lanes),
        (n.child = e.child),
        (n.memoizedProps = e.memoizedProps),
        (n.memoizedState = e.memoizedState),
        (n.updateQueue = e.updateQueue),
        (t = e.dependencies),
        (n.dependencies = t === null ? null : { lanes: t.lanes, firstContext: t.firstContext }),
        (n.sibling = e.sibling),
        (n.index = e.index),
        (n.ref = e.ref),
        (n.refCleanup = e.refCleanup),
        n
      )
    }
    function fi(e, t) {
      e.flags &= 65011714
      var n = e.alternate
      return (
        n === null
          ? ((e.childLanes = 0),
            (e.lanes = t),
            (e.child = null),
            (e.subtreeFlags = 0),
            (e.memoizedProps = null),
            (e.memoizedState = null),
            (e.updateQueue = null),
            (e.dependencies = null),
            (e.stateNode = null))
          : ((e.childLanes = n.childLanes),
            (e.lanes = n.lanes),
            (e.child = n.child),
            (e.subtreeFlags = 0),
            (e.deletions = null),
            (e.memoizedProps = n.memoizedProps),
            (e.memoizedState = n.memoizedState),
            (e.updateQueue = n.updateQueue),
            (e.type = n.type),
            (t = n.dependencies),
            (e.dependencies =
              t === null ? null : { lanes: t.lanes, firstContext: t.firstContext })),
        e
      )
    }
    function pi(e, t, n, r, a, o) {
      var s = 0
      if (((r = e), typeof e == `function`)) ui(e) && (s = 1)
      else if (typeof e == `string`)
        s = Uf(e, n, le.current) ? 26 : e === `html` || e === `head` || e === `body` ? 27 : 5
      else
        a: switch (e) {
          case ne:
            return ((e = li(31, n, t, a)), (e.elementType = ne), (e.lanes = o), e)
          case y:
            return mi(n.children, a, o, t)
          case b:
            ;((s = 8), (a |= 24))
            break
          case x:
            return ((e = li(12, n, t, a | 2)), (e.elementType = x), (e.lanes = o), e)
          case T:
            return ((e = li(13, n, t, a)), (e.elementType = T), (e.lanes = o), e)
          case E:
            return ((e = li(19, n, t, a)), (e.elementType = E), (e.lanes = o), e)
          default:
            if (typeof e == `object` && e)
              switch (e.$$typeof) {
                case C:
                  s = 10
                  break a
                case S:
                  s = 9
                  break a
                case w:
                  s = 11
                  break a
                case ee:
                  s = 14
                  break a
                case te:
                  ;((s = 16), (r = null))
                  break a
              }
            ;((s = 29), (n = Error(i(130, e === null ? `null` : typeof e, ``))), (r = null))
        }
      return ((t = li(s, n, t, a)), (t.elementType = e), (t.type = r), (t.lanes = o), t)
    }
    function mi(e, t, n, r) {
      return ((e = li(7, e, r, t)), (e.lanes = n), e)
    }
    function hi(e, t, n) {
      return ((e = li(6, e, null, t)), (e.lanes = n), e)
    }
    function gi(e) {
      var t = li(18, null, null, 0)
      return ((t.stateNode = e), t)
    }
    function _i(e, t, n) {
      return (
        (t = li(4, e.children === null ? [] : e.children, e.key, t)),
        (t.lanes = n),
        (t.stateNode = {
          containerInfo: e.containerInfo,
          pendingChildren: null,
          implementation: e.implementation,
        }),
        t
      )
    }
    var vi = new WeakMap()
    function yi(e, t) {
      if (typeof e == `object` && e) {
        var n = vi.get(e)
        return n === void 0 ? ((t = { value: e, source: t, stack: xe(t) }), vi.set(e, t), t) : n
      }
      return { value: e, source: t, stack: xe(t) }
    }
    var bi = [],
      xi = 0,
      Si = null,
      Ci = 0,
      wi = [],
      Ti = 0,
      Ei = null,
      Di = 1,
      Oi = ``
    function ki(e, t) {
      ;((bi[xi++] = Ci), (bi[xi++] = Si), (Si = e), (Ci = t))
    }
    function Ai(e, t, n) {
      ;((wi[Ti++] = Di), (wi[Ti++] = Oi), (wi[Ti++] = Ei), (Ei = e))
      var r = Di
      e = Oi
      var i = 32 - ze(r) - 1
      ;((r &= ~(1 << i)), (n += 1))
      var a = 32 - ze(t) + i
      if (30 < a) {
        var o = i - (i % 5)
        ;((a = (r & ((1 << o) - 1)).toString(32)),
          (r >>= o),
          (i -= o),
          (Di = (1 << (32 - ze(t) + i)) | (n << i) | r),
          (Oi = a + e))
      } else ((Di = (1 << a) | (n << i) | r), (Oi = e))
    }
    function ji(e) {
      e.return !== null && (ki(e, 1), Ai(e, 1, 0))
    }
    function Mi(e) {
      for (; e === Si;) ((Si = bi[--xi]), (bi[xi] = null), (Ci = bi[--xi]), (bi[xi] = null))
      for (; e === Ei;)
        ((Ei = wi[--Ti]),
          (wi[Ti] = null),
          (Oi = wi[--Ti]),
          (wi[Ti] = null),
          (Di = wi[--Ti]),
          (wi[Ti] = null))
    }
    function Ni(e, t) {
      ;((wi[Ti++] = Di), (wi[Ti++] = Oi), (wi[Ti++] = Ei), (Di = t.id), (Oi = t.overflow), (Ei = e))
    }
    var Pi = null,
      R = null,
      z = !1,
      Fi = null,
      Ii = !1,
      Li = Error(i(519))
    function Ri(e) {
      throw (
        Wi(
          yi(
            Error(
              i(
                418,
                1 < arguments.length && arguments[1] !== void 0 && arguments[1] ? `text` : `HTML`,
                ``,
              ),
            ),
            e,
          ),
        ),
        Li
      )
    }
    function zi(e) {
      var t = e.stateNode,
        n = e.type,
        r = e.memoizedProps
      switch (((t[ct] = e), (t[lt] = r), n)) {
        case `dialog`:
          ;($(`cancel`, t), $(`close`, t))
          break
        case `iframe`:
        case `object`:
        case `embed`:
          $(`load`, t)
          break
        case `video`:
        case `audio`:
          for (n = 0; n < gd.length; n++) $(gd[n], t)
          break
        case `source`:
          $(`error`, t)
          break
        case `img`:
        case `image`:
        case `link`:
          ;($(`error`, t), $(`load`, t))
          break
        case `details`:
          $(`toggle`, t)
          break
        case `input`:
          ;($(`invalid`, t),
            Ht(t, r.value, r.defaultValue, r.checked, r.defaultChecked, r.type, r.name, !0))
          break
        case `select`:
          $(`invalid`, t)
          break
        case `textarea`:
          ;($(`invalid`, t), Kt(t, r.value, r.defaultValue, r.children))
      }
      ;((n = r.children),
        (typeof n != `string` && typeof n != `number` && typeof n != `bigint`) ||
        t.textContent === `` + n ||
        !0 === r.suppressHydrationWarning ||
        jd(t.textContent, n)
          ? (r.popover != null && ($(`beforetoggle`, t), $(`toggle`, t)),
            r.onScroll != null && $(`scroll`, t),
            r.onScrollEnd != null && $(`scrollend`, t),
            r.onClick != null && (t.onclick = tn),
            (t = !0))
          : (t = !1),
        t || Ri(e, !0))
    }
    function Bi(e) {
      for (Pi = e.return; Pi;)
        switch (Pi.tag) {
          case 5:
          case 31:
          case 13:
            Ii = !1
            return
          case 27:
          case 3:
            Ii = !0
            return
          default:
            Pi = Pi.return
        }
    }
    function Vi(e) {
      if (e !== Pi) return !1
      if (!z) return (Bi(e), (z = !0), !1)
      var t = e.tag,
        n
      if (
        ((n = t !== 3 && t !== 27) &&
          ((n = t === 5) &&
            ((n = e.type), (n = n === `form` || n === `button` || Ud(e.type, e.memoizedProps))),
          (n = !n)),
        n && R && Ri(e),
        Bi(e),
        t === 13)
      ) {
        if (((e = e.memoizedState), (e = e === null ? null : e.dehydrated), !e)) throw Error(i(317))
        R = uf(e)
      } else if (t === 31) {
        if (((e = e.memoizedState), (e = e === null ? null : e.dehydrated), !e)) throw Error(i(317))
        R = uf(e)
      } else
        t === 27
          ? ((t = R), Zd(e.type) ? ((e = lf), (lf = null), (R = e)) : (R = t))
          : (R = Pi ? cf(e.stateNode.nextSibling) : null)
      return !0
    }
    function Hi() {
      ;((R = Pi = null), (z = !1))
    }
    function Ui() {
      var e = Fi
      return (e !== null && (Yl === null ? (Yl = e) : Yl.push.apply(Yl, e), (Fi = null)), e)
    }
    function Wi(e) {
      Fi === null ? (Fi = [e]) : Fi.push(e)
    }
    var Gi = M(null),
      Ki = null,
      qi = null
    function Ji(e, t, n) {
      ;(P(Gi, t._currentValue), (t._currentValue = n))
    }
    function Yi(e) {
      ;((e._currentValue = Gi.current), N(Gi))
    }
    function Xi(e, t, n) {
      for (; e !== null;) {
        var r = e.alternate
        if (
          ((e.childLanes & t) === t
            ? r !== null && (r.childLanes & t) !== t && (r.childLanes |= t)
            : ((e.childLanes |= t), r !== null && (r.childLanes |= t)),
          e === n)
        )
          break
        e = e.return
      }
    }
    function Zi(e, t, n, r) {
      var a = e.child
      for (a !== null && (a.return = e); a !== null;) {
        var o = a.dependencies
        if (o !== null) {
          var s = a.child
          o = o.firstContext
          a: for (; o !== null;) {
            var c = o
            o = a
            for (var l = 0; l < t.length; l++)
              if (c.context === t[l]) {
                ;((o.lanes |= n),
                  (c = o.alternate),
                  c !== null && (c.lanes |= n),
                  Xi(o.return, n, e),
                  r || (s = null))
                break a
              }
            o = c.next
          }
        } else if (a.tag === 18) {
          if (((s = a.return), s === null)) throw Error(i(341))
          ;((s.lanes |= n),
            (o = s.alternate),
            o !== null && (o.lanes |= n),
            Xi(s, n, e),
            (s = null))
        } else s = a.child
        if (s !== null) s.return = a
        else
          for (s = a; s !== null;) {
            if (s === e) {
              s = null
              break
            }
            if (((a = s.sibling), a !== null)) {
              ;((a.return = s.return), (s = a))
              break
            }
            s = s.return
          }
        a = s
      }
    }
    function Qi(e, t, n, r) {
      e = null
      for (var a = t, o = !1; a !== null;) {
        if (!o) {
          if (a.flags & 524288) o = !0
          else if (a.flags & 262144) break
        }
        if (a.tag === 10) {
          var s = a.alternate
          if (s === null) throw Error(i(387))
          if (((s = s.memoizedProps), s !== null)) {
            var c = a.type
            Cr(a.pendingProps.value, s.value) || (e === null ? (e = [c]) : e.push(c))
          }
        } else if (a === de.current) {
          if (((s = a.alternate), s === null)) throw Error(i(387))
          s.memoizedState.memoizedState !== a.memoizedState.memoizedState &&
            (e === null ? (e = [Qf]) : e.push(Qf))
        }
        a = a.return
      }
      ;(e !== null && Zi(t, e, n, r), (t.flags |= 262144))
    }
    function $i(e) {
      for (e = e.firstContext; e !== null;) {
        if (!Cr(e.context._currentValue, e.memoizedValue)) return !0
        e = e.next
      }
      return !1
    }
    function ea(e) {
      ;((Ki = e), (qi = null), (e = e.dependencies), e !== null && (e.firstContext = null))
    }
    function ta(e) {
      return ra(Ki, e)
    }
    function na(e, t) {
      return (Ki === null && ea(e), ra(e, t))
    }
    function ra(e, t) {
      var n = t._currentValue
      if (((t = { context: t, memoizedValue: n, next: null }), qi === null)) {
        if (e === null) throw Error(i(308))
        ;((qi = t), (e.dependencies = { lanes: 0, firstContext: t }), (e.flags |= 524288))
      } else qi = qi.next = t
      return n
    }
    var ia =
        typeof AbortController < `u`
          ? AbortController
          : function () {
              var e = [],
                t = (this.signal = {
                  aborted: !1,
                  addEventListener: function (t, n) {
                    e.push(n)
                  },
                })
              this.abort = function () {
                ;((t.aborted = !0),
                  e.forEach(function (e) {
                    return e()
                  }))
              }
            },
      aa = t.unstable_scheduleCallback,
      oa = t.unstable_NormalPriority,
      sa = {
        $$typeof: C,
        Consumer: null,
        Provider: null,
        _currentValue: null,
        _currentValue2: null,
        _threadCount: 0,
      }
    function ca() {
      return { controller: new ia(), data: new Map(), refCount: 0 }
    }
    function la(e) {
      ;(e.refCount--,
        e.refCount === 0 &&
          aa(oa, function () {
            e.controller.abort()
          }))
    }
    var ua = null,
      da = 0,
      fa = 0,
      pa = null
    function ma(e, t) {
      if (ua === null) {
        var n = (ua = [])
        ;((da = 0),
          (fa = ud()),
          (pa = {
            status: `pending`,
            value: void 0,
            then: function (e) {
              n.push(e)
            },
          }))
      }
      return (da++, t.then(ha, ha), t)
    }
    function ha() {
      if (--da === 0 && ua !== null) {
        pa !== null && (pa.status = `fulfilled`)
        var e = ua
        ;((ua = null), (fa = 0), (pa = null))
        for (var t = 0; t < e.length; t++) (0, e[t])()
      }
    }
    function ga(e, t) {
      var n = [],
        r = {
          status: `pending`,
          value: null,
          reason: null,
          then: function (e) {
            n.push(e)
          },
        }
      return (
        e.then(
          function () {
            ;((r.status = `fulfilled`), (r.value = t))
            for (var e = 0; e < n.length; e++) (0, n[e])(t)
          },
          function (e) {
            for (r.status = `rejected`, r.reason = e, e = 0; e < n.length; e++) (0, n[e])(void 0)
          },
        ),
        r
      )
    }
    var _a = A.S
    A.S = function (e, t) {
      ;((Ql = De()),
        typeof t == `object` && t && typeof t.then == `function` && ma(e, t),
        _a !== null && _a(e, t))
    }
    var va = M(null)
    function ya() {
      var e = va.current
      return e === null ? Il.pooledCache : e
    }
    function ba(e, t) {
      t === null ? P(va, va.current) : P(va, t.pool)
    }
    function xa() {
      var e = ya()
      return e === null ? null : { parent: sa._currentValue, pool: e }
    }
    var Sa = Error(i(460)),
      Ca = Error(i(474)),
      wa = Error(i(542)),
      Ta = { then: function () {} }
    function Ea(e) {
      return ((e = e.status), e === `fulfilled` || e === `rejected`)
    }
    function Da(e, t, n) {
      switch (
        ((n = e[n]), n === void 0 ? e.push(t) : n !== t && (t.then(tn, tn), (t = n)), t.status)
      ) {
        case `fulfilled`:
          return t.value
        case `rejected`:
          throw ((e = t.reason), ja(e), e)
        default:
          if (typeof t.status == `string`) t.then(tn, tn)
          else {
            if (((e = Il), e !== null && 100 < e.shellSuspendCounter)) throw Error(i(482))
            ;((e = t),
              (e.status = `pending`),
              e.then(
                function (e) {
                  if (t.status === `pending`) {
                    var n = t
                    ;((n.status = `fulfilled`), (n.value = e))
                  }
                },
                function (e) {
                  if (t.status === `pending`) {
                    var n = t
                    ;((n.status = `rejected`), (n.reason = e))
                  }
                },
              ))
          }
          switch (t.status) {
            case `fulfilled`:
              return t.value
            case `rejected`:
              throw ((e = t.reason), ja(e), e)
          }
          throw ((ka = t), Sa)
      }
    }
    function Oa(e) {
      try {
        var t = e._init
        return t(e._payload)
      } catch (e) {
        throw typeof e == `object` && e && typeof e.then == `function` ? ((ka = e), Sa) : e
      }
    }
    var ka = null
    function Aa() {
      if (ka === null) throw Error(i(459))
      var e = ka
      return ((ka = null), e)
    }
    function ja(e) {
      if (e === Sa || e === wa) throw Error(i(483))
    }
    var Ma = null,
      Na = 0
    function Pa(e) {
      var t = Na
      return ((Na += 1), Ma === null && (Ma = []), Da(Ma, e, t))
    }
    function Fa(e, t) {
      ;((t = t.props.ref), (e.ref = t === void 0 ? null : t))
    }
    function Ia(e, t) {
      throw t.$$typeof === g
        ? Error(i(525))
        : ((e = Object.prototype.toString.call(t)),
          Error(
            i(
              31,
              e === `[object Object]` ? `object with keys {` + Object.keys(t).join(`, `) + `}` : e,
            ),
          ))
    }
    function La(e) {
      function t(t, n) {
        if (e) {
          var r = t.deletions
          r === null ? ((t.deletions = [n]), (t.flags |= 16)) : r.push(n)
        }
      }
      function n(n, r) {
        if (!e) return null
        for (; r !== null;) (t(n, r), (r = r.sibling))
        return null
      }
      function r(e) {
        for (var t = new Map(); e !== null;)
          (e.key === null ? t.set(e.index, e) : t.set(e.key, e), (e = e.sibling))
        return t
      }
      function a(e, t) {
        return ((e = di(e, t)), (e.index = 0), (e.sibling = null), e)
      }
      function o(t, n, r) {
        return (
          (t.index = r),
          e
            ? ((r = t.alternate),
              r === null
                ? ((t.flags |= 67108866), n)
                : ((r = r.index), r < n ? ((t.flags |= 67108866), n) : r))
            : ((t.flags |= 1048576), n)
        )
      }
      function s(t) {
        return (e && t.alternate === null && (t.flags |= 67108866), t)
      }
      function c(e, t, n, r) {
        return t === null || t.tag !== 6
          ? ((t = hi(n, e.mode, r)), (t.return = e), t)
          : ((t = a(t, n)), (t.return = e), t)
      }
      function l(e, t, n, r) {
        var i = n.type
        return i === y
          ? d(e, t, n.props.children, r, n.key)
          : t !== null &&
              (t.elementType === i ||
                (typeof i == `object` && i && i.$$typeof === te && Oa(i) === t.type))
            ? ((t = a(t, n.props)), Fa(t, n), (t.return = e), t)
            : ((t = pi(n.type, n.key, n.props, null, e.mode, r)), Fa(t, n), (t.return = e), t)
      }
      function u(e, t, n, r) {
        return t === null ||
          t.tag !== 4 ||
          t.stateNode.containerInfo !== n.containerInfo ||
          t.stateNode.implementation !== n.implementation
          ? ((t = _i(n, e.mode, r)), (t.return = e), t)
          : ((t = a(t, n.children || [])), (t.return = e), t)
      }
      function d(e, t, n, r, i) {
        return t === null || t.tag !== 7
          ? ((t = mi(n, e.mode, r, i)), (t.return = e), t)
          : ((t = a(t, n)), (t.return = e), t)
      }
      function f(e, t, n) {
        if ((typeof t == `string` && t !== ``) || typeof t == `number` || typeof t == `bigint`)
          return ((t = hi(`` + t, e.mode, n)), (t.return = e), t)
        if (typeof t == `object` && t) {
          switch (t.$$typeof) {
            case _:
              return (
                (n = pi(t.type, t.key, t.props, null, e.mode, n)),
                Fa(n, t),
                (n.return = e),
                n
              )
            case v:
              return ((t = _i(t, e.mode, n)), (t.return = e), t)
            case te:
              return ((t = Oa(t)), f(e, t, n))
          }
          if (k(t) || O(t)) return ((t = mi(t, e.mode, n, null)), (t.return = e), t)
          if (typeof t.then == `function`) return f(e, Pa(t), n)
          if (t.$$typeof === C) return f(e, na(e, t), n)
          Ia(e, t)
        }
        return null
      }
      function p(e, t, n, r) {
        var i = t === null ? null : t.key
        if ((typeof n == `string` && n !== ``) || typeof n == `number` || typeof n == `bigint`)
          return i === null ? c(e, t, `` + n, r) : null
        if (typeof n == `object` && n) {
          switch (n.$$typeof) {
            case _:
              return n.key === i ? l(e, t, n, r) : null
            case v:
              return n.key === i ? u(e, t, n, r) : null
            case te:
              return ((n = Oa(n)), p(e, t, n, r))
          }
          if (k(n) || O(n)) return i === null ? d(e, t, n, r, null) : null
          if (typeof n.then == `function`) return p(e, t, Pa(n), r)
          if (n.$$typeof === C) return p(e, t, na(e, n), r)
          Ia(e, n)
        }
        return null
      }
      function m(e, t, n, r, i) {
        if ((typeof r == `string` && r !== ``) || typeof r == `number` || typeof r == `bigint`)
          return ((e = e.get(n) || null), c(t, e, `` + r, i))
        if (typeof r == `object` && r) {
          switch (r.$$typeof) {
            case _:
              return ((e = e.get(r.key === null ? n : r.key) || null), l(t, e, r, i))
            case v:
              return ((e = e.get(r.key === null ? n : r.key) || null), u(t, e, r, i))
            case te:
              return ((r = Oa(r)), m(e, t, n, r, i))
          }
          if (k(r) || O(r)) return ((e = e.get(n) || null), d(t, e, r, i, null))
          if (typeof r.then == `function`) return m(e, t, n, Pa(r), i)
          if (r.$$typeof === C) return m(e, t, n, na(t, r), i)
          Ia(t, r)
        }
        return null
      }
      function h(i, a, s, c) {
        for (
          var l = null, u = null, d = a, h = (a = 0), g = null;
          d !== null && h < s.length;
          h++
        ) {
          d.index > h ? ((g = d), (d = null)) : (g = d.sibling)
          var _ = p(i, d, s[h], c)
          if (_ === null) {
            d === null && (d = g)
            break
          }
          ;(e && d && _.alternate === null && t(i, d),
            (a = o(_, a, h)),
            u === null ? (l = _) : (u.sibling = _),
            (u = _),
            (d = g))
        }
        if (h === s.length) return (n(i, d), z && ki(i, h), l)
        if (d === null) {
          for (; h < s.length; h++)
            ((d = f(i, s[h], c)),
              d !== null && ((a = o(d, a, h)), u === null ? (l = d) : (u.sibling = d), (u = d)))
          return (z && ki(i, h), l)
        }
        for (d = r(d); h < s.length; h++)
          ((g = m(d, i, h, s[h], c)),
            g !== null &&
              (e && g.alternate !== null && d.delete(g.key === null ? h : g.key),
              (a = o(g, a, h)),
              u === null ? (l = g) : (u.sibling = g),
              (u = g)))
        return (
          e &&
            d.forEach(function (e) {
              return t(i, e)
            }),
          z && ki(i, h),
          l
        )
      }
      function g(a, s, c, l) {
        if (c == null) throw Error(i(151))
        for (
          var u = null, d = null, h = s, g = (s = 0), _ = null, v = c.next();
          h !== null && !v.done;
          g++, v = c.next()
        ) {
          h.index > g ? ((_ = h), (h = null)) : (_ = h.sibling)
          var y = p(a, h, v.value, l)
          if (y === null) {
            h === null && (h = _)
            break
          }
          ;(e && h && y.alternate === null && t(a, h),
            (s = o(y, s, g)),
            d === null ? (u = y) : (d.sibling = y),
            (d = y),
            (h = _))
        }
        if (v.done) return (n(a, h), z && ki(a, g), u)
        if (h === null) {
          for (; !v.done; g++, v = c.next())
            ((v = f(a, v.value, l)),
              v !== null && ((s = o(v, s, g)), d === null ? (u = v) : (d.sibling = v), (d = v)))
          return (z && ki(a, g), u)
        }
        for (h = r(h); !v.done; g++, v = c.next())
          ((v = m(h, a, g, v.value, l)),
            v !== null &&
              (e && v.alternate !== null && h.delete(v.key === null ? g : v.key),
              (s = o(v, s, g)),
              d === null ? (u = v) : (d.sibling = v),
              (d = v)))
        return (
          e &&
            h.forEach(function (e) {
              return t(a, e)
            }),
          z && ki(a, g),
          u
        )
      }
      function b(e, r, o, c) {
        if (
          (typeof o == `object` && o && o.type === y && o.key === null && (o = o.props.children),
          typeof o == `object` && o)
        ) {
          switch (o.$$typeof) {
            case _:
              a: {
                for (var l = o.key; r !== null;) {
                  if (r.key === l) {
                    if (((l = o.type), l === y)) {
                      if (r.tag === 7) {
                        ;(n(e, r.sibling), (c = a(r, o.props.children)), (c.return = e), (e = c))
                        break a
                      }
                    } else if (
                      r.elementType === l ||
                      (typeof l == `object` && l && l.$$typeof === te && Oa(l) === r.type)
                    ) {
                      ;(n(e, r.sibling), (c = a(r, o.props)), Fa(c, o), (c.return = e), (e = c))
                      break a
                    }
                    n(e, r)
                    break
                  }
                  ;(t(e, r), (r = r.sibling))
                }
                o.type === y
                  ? ((c = mi(o.props.children, e.mode, c, o.key)), (c.return = e), (e = c))
                  : ((c = pi(o.type, o.key, o.props, null, e.mode, c)),
                    Fa(c, o),
                    (c.return = e),
                    (e = c))
              }
              return s(e)
            case v:
              a: {
                for (l = o.key; r !== null;) {
                  if (r.key === l) {
                    if (
                      r.tag === 4 &&
                      r.stateNode.containerInfo === o.containerInfo &&
                      r.stateNode.implementation === o.implementation
                    ) {
                      ;(n(e, r.sibling), (c = a(r, o.children || [])), (c.return = e), (e = c))
                      break a
                    }
                    n(e, r)
                    break
                  }
                  ;(t(e, r), (r = r.sibling))
                }
                ;((c = _i(o, e.mode, c)), (c.return = e), (e = c))
              }
              return s(e)
            case te:
              return ((o = Oa(o)), b(e, r, o, c))
          }
          if (k(o)) return h(e, r, o, c)
          if (O(o)) {
            if (((l = O(o)), typeof l != `function`)) throw Error(i(150))
            return ((o = l.call(o)), g(e, r, o, c))
          }
          if (typeof o.then == `function`) return b(e, r, Pa(o), c)
          if (o.$$typeof === C) return b(e, r, na(e, o), c)
          Ia(e, o)
        }
        return (typeof o == `string` && o !== ``) || typeof o == `number` || typeof o == `bigint`
          ? ((o = `` + o),
            r !== null && r.tag === 6
              ? (n(e, r.sibling), (c = a(r, o)), (c.return = e), (e = c))
              : (n(e, r), (c = hi(o, e.mode, c)), (c.return = e), (e = c)),
            s(e))
          : n(e, r)
      }
      return function (e, t, n, r) {
        try {
          Na = 0
          var i = b(e, t, n, r)
          return ((Ma = null), i)
        } catch (t) {
          if (t === Sa || t === wa) throw t
          var a = li(29, t, null, e.mode)
          return ((a.lanes = r), (a.return = e), a)
        }
      }
    }
    var Ra = La(!0),
      za = La(!1),
      Ba = !1
    function Va(e) {
      e.updateQueue = {
        baseState: e.memoizedState,
        firstBaseUpdate: null,
        lastBaseUpdate: null,
        shared: { pending: null, lanes: 0, hiddenCallbacks: null },
        callbacks: null,
      }
    }
    function Ha(e, t) {
      ;((e = e.updateQueue),
        t.updateQueue === e &&
          (t.updateQueue = {
            baseState: e.baseState,
            firstBaseUpdate: e.firstBaseUpdate,
            lastBaseUpdate: e.lastBaseUpdate,
            shared: e.shared,
            callbacks: null,
          }))
    }
    function Ua(e) {
      return { lane: e, tag: 0, payload: null, callback: null, next: null }
    }
    function Wa(e, t, n) {
      var r = e.updateQueue
      if (r === null) return null
      if (((r = r.shared), Y & 2)) {
        var i = r.pending
        return (
          i === null ? (t.next = t) : ((t.next = i.next), (i.next = t)),
          (r.pending = t),
          (t = oi(e)),
          ai(e, null, n),
          t
        )
      }
      return (ni(e, r, t, n), oi(e))
    }
    function Ga(e, t, n) {
      if (((t = t.updateQueue), t !== null && ((t = t.shared), n & 4194048))) {
        var r = t.lanes
        ;((r &= e.pendingLanes), (n |= r), (t.lanes = n), tt(e, n))
      }
    }
    function Ka(e, t) {
      var n = e.updateQueue,
        r = e.alternate
      if (r !== null && ((r = r.updateQueue), n === r)) {
        var i = null,
          a = null
        if (((n = n.firstBaseUpdate), n !== null)) {
          do {
            var o = { lane: n.lane, tag: n.tag, payload: n.payload, callback: null, next: null }
            ;(a === null ? (i = a = o) : (a = a.next = o), (n = n.next))
          } while (n !== null)
          a === null ? (i = a = t) : (a = a.next = t)
        } else i = a = t
        ;((n = {
          baseState: r.baseState,
          firstBaseUpdate: i,
          lastBaseUpdate: a,
          shared: r.shared,
          callbacks: r.callbacks,
        }),
          (e.updateQueue = n))
        return
      }
      ;((e = n.lastBaseUpdate),
        e === null ? (n.firstBaseUpdate = t) : (e.next = t),
        (n.lastBaseUpdate = t))
    }
    var qa = !1
    function Ja() {
      if (qa) {
        var e = pa
        if (e !== null) throw e
      }
    }
    function Ya(e, t, n, r) {
      qa = !1
      var i = e.updateQueue
      Ba = !1
      var a = i.firstBaseUpdate,
        o = i.lastBaseUpdate,
        s = i.shared.pending
      if (s !== null) {
        i.shared.pending = null
        var c = s,
          l = c.next
        ;((c.next = null), o === null ? (a = l) : (o.next = l), (o = c))
        var u = e.alternate
        u !== null &&
          ((u = u.updateQueue),
          (s = u.lastBaseUpdate),
          s !== o && (s === null ? (u.firstBaseUpdate = l) : (s.next = l), (u.lastBaseUpdate = c)))
      }
      if (a !== null) {
        var d = i.baseState
        ;((o = 0), (u = l = c = null), (s = a))
        do {
          var f = s.lane & -536870913,
            p = f !== s.lane
          if (p ? (Z & f) === f : (r & f) === f) {
            ;(f !== 0 && f === fa && (qa = !0),
              u !== null &&
                (u = u.next =
                  { lane: 0, tag: s.tag, payload: s.payload, callback: null, next: null }))
            a: {
              var m = e,
                g = s
              f = t
              var _ = n
              switch (g.tag) {
                case 1:
                  if (((m = g.payload), typeof m == `function`)) {
                    d = m.call(_, d, f)
                    break a
                  }
                  d = m
                  break a
                case 3:
                  m.flags = (m.flags & -65537) | 128
                case 0:
                  if (
                    ((m = g.payload), (f = typeof m == `function` ? m.call(_, d, f) : m), f == null)
                  )
                    break a
                  d = h({}, d, f)
                  break a
                case 2:
                  Ba = !0
              }
            }
            ;((f = s.callback),
              f !== null &&
                ((e.flags |= 64),
                p && (e.flags |= 8192),
                (p = i.callbacks),
                p === null ? (i.callbacks = [f]) : p.push(f)))
          } else
            ((p = { lane: f, tag: s.tag, payload: s.payload, callback: s.callback, next: null }),
              u === null ? ((l = u = p), (c = d)) : (u = u.next = p),
              (o |= f))
          if (((s = s.next), s === null)) {
            if (((s = i.shared.pending), s === null)) break
            ;((p = s),
              (s = p.next),
              (p.next = null),
              (i.lastBaseUpdate = p),
              (i.shared.pending = null))
          }
        } while (1)
        ;(u === null && (c = d),
          (i.baseState = c),
          (i.firstBaseUpdate = l),
          (i.lastBaseUpdate = u),
          a === null && (i.shared.lanes = 0),
          (Ul |= o),
          (e.lanes = o),
          (e.memoizedState = d))
      }
    }
    function Xa(e, t) {
      if (typeof e != `function`) throw Error(i(191, e))
      e.call(t)
    }
    function Za(e, t) {
      var n = e.callbacks
      if (n !== null) for (e.callbacks = null, e = 0; e < n.length; e++) Xa(n[e], t)
    }
    var Qa = M(null),
      $a = M(0)
    function eo(e, t) {
      ;((e = Vl), P($a, e), P(Qa, t), (Vl = e | t.baseLanes))
    }
    function to() {
      ;(P($a, Vl), P(Qa, Qa.current))
    }
    function no() {
      ;((Vl = $a.current), N(Qa), N($a))
    }
    var ro = M(null),
      io = null
    function ao(e) {
      var t = e.alternate
      ;(P(uo, uo.current & 1),
        P(ro, e),
        io === null && (t === null || Qa.current !== null || t.memoizedState !== null) && (io = e))
    }
    function oo(e) {
      ;(P(uo, uo.current), P(ro, e), io === null && (io = e))
    }
    function so(e) {
      e.tag === 22 ? (P(uo, uo.current), P(ro, e), io === null && (io = e)) : co(e)
    }
    function co() {
      ;(P(uo, uo.current), P(ro, ro.current))
    }
    function lo(e) {
      ;(N(ro), io === e && (io = null), N(uo))
    }
    var uo = M(0)
    function fo(e) {
      for (var t = e; t !== null;) {
        if (t.tag === 13) {
          var n = t.memoizedState
          if (n !== null && ((n = n.dehydrated), n === null || af(n) || of(n))) return t
        } else if (
          t.tag === 19 &&
          (t.memoizedProps.revealOrder === `forwards` ||
            t.memoizedProps.revealOrder === `backwards` ||
            t.memoizedProps.revealOrder === `unstable_legacy-backwards` ||
            t.memoizedProps.revealOrder === `together`)
        ) {
          if (t.flags & 128) return t
        } else if (t.child !== null) {
          ;((t.child.return = t), (t = t.child))
          continue
        }
        if (t === e) break
        for (; t.sibling === null;) {
          if (t.return === null || t.return === e) return null
          t = t.return
        }
        ;((t.sibling.return = t.return), (t = t.sibling))
      }
      return null
    }
    var po = 0,
      B = null,
      V = null,
      mo = null,
      ho = !1,
      go = !1,
      _o = !1,
      vo = 0,
      yo = 0,
      bo = null,
      xo = 0
    function So() {
      throw Error(i(321))
    }
    function Co(e, t) {
      if (t === null) return !1
      for (var n = 0; n < t.length && n < e.length; n++) if (!Cr(e[n], t[n])) return !1
      return !0
    }
    function wo(e, t, n, r, i, a) {
      return (
        (po = a),
        (B = t),
        (t.memoizedState = null),
        (t.updateQueue = null),
        (t.lanes = 0),
        (A.H = e === null || e.memoizedState === null ? Ls : Rs),
        (_o = !1),
        (a = n(r, i)),
        (_o = !1),
        go && (a = Eo(t, n, r, i)),
        To(e),
        a
      )
    }
    function To(e) {
      A.H = Is
      var t = V !== null && V.next !== null
      if (((po = 0), (mo = V = B = null), (ho = !1), (yo = 0), (bo = null), t)) throw Error(i(300))
      e === null || q || ((e = e.dependencies), e !== null && $i(e) && (q = !0))
    }
    function Eo(e, t, n, r) {
      B = e
      var a = 0
      do {
        if ((go && (bo = null), (yo = 0), (go = !1), 25 <= a)) throw Error(i(301))
        if (((a += 1), (mo = V = null), e.updateQueue != null)) {
          var o = e.updateQueue
          ;((o.lastEffect = null),
            (o.events = null),
            (o.stores = null),
            o.memoCache != null && (o.memoCache.index = 0))
        }
        ;((A.H = zs), (o = t(n, r)))
      } while (go)
      return o
    }
    function Do() {
      var e = A.H,
        t = e.useState()[0]
      return (
        (t = typeof t.then == `function` ? Po(t) : t),
        (e = e.useState()[0]),
        (V === null ? null : V.memoizedState) !== e && (B.flags |= 1024),
        t
      )
    }
    function Oo() {
      var e = vo !== 0
      return ((vo = 0), e)
    }
    function ko(e, t, n) {
      ;((t.updateQueue = e.updateQueue), (t.flags &= -2053), (e.lanes &= ~n))
    }
    function Ao(e) {
      if (ho) {
        for (e = e.memoizedState; e !== null;) {
          var t = e.queue
          ;(t !== null && (t.pending = null), (e = e.next))
        }
        ho = !1
      }
      ;((po = 0), (mo = V = B = null), (go = !1), (yo = vo = 0), (bo = null))
    }
    function jo() {
      var e = { memoizedState: null, baseState: null, baseQueue: null, queue: null, next: null }
      return (mo === null ? (B.memoizedState = mo = e) : (mo = mo.next = e), mo)
    }
    function Mo() {
      if (V === null) {
        var e = B.alternate
        e = e === null ? null : e.memoizedState
      } else e = V.next
      var t = mo === null ? B.memoizedState : mo.next
      if (t !== null) ((mo = t), (V = e))
      else {
        if (e === null) throw B.alternate === null ? Error(i(467)) : Error(i(310))
        ;((V = e),
          (e = {
            memoizedState: V.memoizedState,
            baseState: V.baseState,
            baseQueue: V.baseQueue,
            queue: V.queue,
            next: null,
          }),
          mo === null ? (B.memoizedState = mo = e) : (mo = mo.next = e))
      }
      return mo
    }
    function No() {
      return { lastEffect: null, events: null, stores: null, memoCache: null }
    }
    function Po(e) {
      var t = yo
      return (
        (yo += 1),
        bo === null && (bo = []),
        (e = Da(bo, e, t)),
        (t = B),
        (mo === null ? t.memoizedState : mo.next) === null &&
          ((t = t.alternate), (A.H = t === null || t.memoizedState === null ? Ls : Rs)),
        e
      )
    }
    function Fo(e) {
      if (typeof e == `object` && e) {
        if (typeof e.then == `function`) return Po(e)
        if (e.$$typeof === C) return ta(e)
      }
      throw Error(i(438, String(e)))
    }
    function Io(e) {
      var t = null,
        n = B.updateQueue
      if ((n !== null && (t = n.memoCache), t == null)) {
        var r = B.alternate
        r !== null &&
          ((r = r.updateQueue),
          r !== null &&
            ((r = r.memoCache),
            r != null &&
              (t = {
                data: r.data.map(function (e) {
                  return e.slice()
                }),
                index: 0,
              })))
      }
      if (
        ((t ??= { data: [], index: 0 }),
        n === null && ((n = No()), (B.updateQueue = n)),
        (n.memoCache = t),
        (n = t.data[t.index]),
        n === void 0)
      )
        for (n = t.data[t.index] = Array(e), r = 0; r < e; r++) n[r] = re
      return (t.index++, n)
    }
    function Lo(e, t) {
      return typeof t == `function` ? t(e) : t
    }
    function Ro(e) {
      return zo(Mo(), V, e)
    }
    function zo(e, t, n) {
      var r = e.queue
      if (r === null) throw Error(i(311))
      r.lastRenderedReducer = n
      var a = e.baseQueue,
        o = r.pending
      if (o !== null) {
        if (a !== null) {
          var s = a.next
          ;((a.next = o.next), (o.next = s))
        }
        ;((t.baseQueue = a = o), (r.pending = null))
      }
      if (((o = e.baseState), a === null)) e.memoizedState = o
      else {
        t = a.next
        var c = (s = null),
          l = null,
          u = t,
          d = !1
        do {
          var f = u.lane & -536870913
          if (f === u.lane ? (po & f) === f : (Z & f) === f) {
            var p = u.revertLane
            if (p === 0)
              (l !== null &&
                (l = l.next =
                  {
                    lane: 0,
                    revertLane: 0,
                    gesture: null,
                    action: u.action,
                    hasEagerState: u.hasEagerState,
                    eagerState: u.eagerState,
                    next: null,
                  }),
                f === fa && (d = !0))
            else if ((po & p) === p) {
              ;((u = u.next), p === fa && (d = !0))
              continue
            } else
              ((f = {
                lane: 0,
                revertLane: u.revertLane,
                gesture: null,
                action: u.action,
                hasEagerState: u.hasEagerState,
                eagerState: u.eagerState,
                next: null,
              }),
                l === null ? ((c = l = f), (s = o)) : (l = l.next = f),
                (B.lanes |= p),
                (Ul |= p))
            ;((f = u.action), _o && n(o, f), (o = u.hasEagerState ? u.eagerState : n(o, f)))
          } else
            ((p = {
              lane: f,
              revertLane: u.revertLane,
              gesture: u.gesture,
              action: u.action,
              hasEagerState: u.hasEagerState,
              eagerState: u.eagerState,
              next: null,
            }),
              l === null ? ((c = l = p), (s = o)) : (l = l.next = p),
              (B.lanes |= f),
              (Ul |= f))
          u = u.next
        } while (u !== null && u !== t)
        if (
          (l === null ? (s = o) : (l.next = c),
          !Cr(o, e.memoizedState) && ((q = !0), d && ((n = pa), n !== null)))
        )
          throw n
        ;((e.memoizedState = o), (e.baseState = s), (e.baseQueue = l), (r.lastRenderedState = o))
      }
      return (a === null && (r.lanes = 0), [e.memoizedState, r.dispatch])
    }
    function Bo(e) {
      var t = Mo(),
        n = t.queue
      if (n === null) throw Error(i(311))
      n.lastRenderedReducer = e
      var r = n.dispatch,
        a = n.pending,
        o = t.memoizedState
      if (a !== null) {
        n.pending = null
        var s = (a = a.next)
        do ((o = e(o, s.action)), (s = s.next))
        while (s !== a)
        ;(Cr(o, t.memoizedState) || (q = !0),
          (t.memoizedState = o),
          t.baseQueue === null && (t.baseState = o),
          (n.lastRenderedState = o))
      }
      return [o, r]
    }
    function Vo(e, t, n) {
      var r = B,
        a = Mo(),
        o = z
      if (o) {
        if (n === void 0) throw Error(i(407))
        n = n()
      } else n = t()
      var s = !Cr((V || a).memoizedState, n)
      if (
        (s && ((a.memoizedState = n), (q = !0)),
        (a = a.queue),
        us(Wo.bind(null, r, a, e), [e]),
        a.getSnapshot !== t || s || (mo !== null && mo.memoizedState.tag & 1))
      ) {
        if (
          ((r.flags |= 2048),
          as(9, { destroy: void 0 }, Uo.bind(null, r, a, n, t), null),
          Il === null)
        )
          throw Error(i(349))
        o || po & 127 || Ho(r, t, n)
      }
      return n
    }
    function Ho(e, t, n) {
      ;((e.flags |= 16384),
        (e = { getSnapshot: t, value: n }),
        (t = B.updateQueue),
        t === null
          ? ((t = No()), (B.updateQueue = t), (t.stores = [e]))
          : ((n = t.stores), n === null ? (t.stores = [e]) : n.push(e)))
    }
    function Uo(e, t, n, r) {
      ;((t.value = n), (t.getSnapshot = r), Go(t) && Ko(e))
    }
    function Wo(e, t, n) {
      return n(function () {
        Go(t) && Ko(e)
      })
    }
    function Go(e) {
      var t = e.getSnapshot
      e = e.value
      try {
        var n = t()
        return !Cr(e, n)
      } catch {
        return !0
      }
    }
    function Ko(e) {
      var t = ii(e, 2)
      t !== null && pu(t, e, 2)
    }
    function H(e) {
      var t = jo()
      if (typeof e == `function`) {
        var n = e
        if (((e = n()), _o)) {
          Re(!0)
          try {
            n()
          } finally {
            Re(!1)
          }
        }
      }
      return (
        (t.memoizedState = t.baseState = e),
        (t.queue = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: Lo,
          lastRenderedState: e,
        }),
        t
      )
    }
    function qo(e, t, n, r) {
      return ((e.baseState = n), zo(e, V, typeof r == `function` ? r : Lo))
    }
    function Jo(e, t, n, r, a) {
      if (Ns(e)) throw Error(i(485))
      if (((e = t.action), e !== null)) {
        var o = {
          payload: a,
          action: e,
          next: null,
          isTransition: !0,
          status: `pending`,
          value: null,
          reason: null,
          listeners: [],
          then: function (e) {
            o.listeners.push(e)
          },
        }
        ;(A.T === null ? (o.isTransition = !1) : n(!0),
          r(o),
          (n = t.pending),
          n === null
            ? ((o.next = t.pending = o), Yo(t, o))
            : ((o.next = n.next), (t.pending = n.next = o)))
      }
    }
    function Yo(e, t) {
      var n = t.action,
        r = t.payload,
        i = e.state
      if (t.isTransition) {
        var a = A.T,
          o = {}
        A.T = o
        try {
          var s = n(i, r),
            c = A.S
          ;(c !== null && c(o, s), Xo(e, t, s))
        } catch (n) {
          Qo(e, t, n)
        } finally {
          ;(a !== null && o.types !== null && (a.types = o.types), (A.T = a))
        }
      } else
        try {
          ;((a = n(i, r)), Xo(e, t, a))
        } catch (n) {
          Qo(e, t, n)
        }
    }
    function Xo(e, t, n) {
      typeof n == `object` && n && typeof n.then == `function`
        ? n.then(
            function (n) {
              Zo(e, t, n)
            },
            function (n) {
              return Qo(e, t, n)
            },
          )
        : Zo(e, t, n)
    }
    function Zo(e, t, n) {
      ;((t.status = `fulfilled`),
        (t.value = n),
        $o(t),
        (e.state = n),
        (t = e.pending),
        t !== null &&
          ((n = t.next), n === t ? (e.pending = null) : ((n = n.next), (t.next = n), Yo(e, n))))
    }
    function Qo(e, t, n) {
      var r = e.pending
      if (((e.pending = null), r !== null)) {
        r = r.next
        do ((t.status = `rejected`), (t.reason = n), $o(t), (t = t.next))
        while (t !== r)
      }
      e.action = null
    }
    function $o(e) {
      e = e.listeners
      for (var t = 0; t < e.length; t++) (0, e[t])()
    }
    function es(e, t) {
      return t
    }
    function ts(e, t) {
      if (z) {
        var n = Il.formState
        if (n !== null) {
          a: {
            var r = B
            if (z) {
              if (R) {
                b: {
                  for (var i = R, a = Ii; i.nodeType !== 8;) {
                    if (!a) {
                      i = null
                      break b
                    }
                    if (((i = cf(i.nextSibling)), i === null)) {
                      i = null
                      break b
                    }
                  }
                  ;((a = i.data), (i = a === `F!` || a === `F` ? i : null))
                }
                if (i) {
                  ;((R = cf(i.nextSibling)), (r = i.data === `F!`))
                  break a
                }
              }
              Ri(r)
            }
            r = !1
          }
          r && (t = n[0])
        }
      }
      return (
        (n = jo()),
        (n.memoizedState = n.baseState = t),
        (r = {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: es,
          lastRenderedState: t,
        }),
        (n.queue = r),
        (n = G.bind(null, B, r)),
        (r.dispatch = n),
        (r = H(!1)),
        (a = Ms.bind(null, B, !1, r.queue)),
        (r = jo()),
        (i = { state: t, dispatch: null, action: e, pending: null }),
        (r.queue = i),
        (n = Jo.bind(null, B, i, a, n)),
        (i.dispatch = n),
        (r.memoizedState = e),
        [t, n, !1]
      )
    }
    function ns(e) {
      return rs(Mo(), V, e)
    }
    function rs(e, t, n) {
      if (
        ((t = zo(e, t, es)[0]),
        (e = Ro(Lo)[0]),
        typeof t == `object` && t && typeof t.then == `function`)
      )
        try {
          var r = Po(t)
        } catch (e) {
          throw e === Sa ? wa : e
        }
      else r = t
      t = Mo()
      var i = t.queue,
        a = i.dispatch
      return (
        n !== t.memoizedState &&
          ((B.flags |= 2048), as(9, { destroy: void 0 }, U.bind(null, i, n), null)),
        [r, a, e]
      )
    }
    function U(e, t) {
      e.action = t
    }
    function is(e) {
      var t = Mo(),
        n = V
      if (n !== null) return rs(t, n, e)
      ;(Mo(), (t = t.memoizedState), (n = Mo()))
      var r = n.queue.dispatch
      return ((n.memoizedState = e), [t, r, !1])
    }
    function as(e, t, n, r) {
      return (
        (e = { tag: e, create: n, deps: r, inst: t, next: null }),
        (t = B.updateQueue),
        t === null && ((t = No()), (B.updateQueue = t)),
        (n = t.lastEffect),
        n === null
          ? (t.lastEffect = e.next = e)
          : ((r = n.next), (n.next = e), (e.next = r), (t.lastEffect = e)),
        e
      )
    }
    function os() {
      return Mo().memoizedState
    }
    function ss(e, t, n, r) {
      var i = jo()
      ;((B.flags |= e),
        (i.memoizedState = as(1 | t, { destroy: void 0 }, n, r === void 0 ? null : r)))
    }
    function cs(e, t, n, r) {
      var i = Mo()
      r = r === void 0 ? null : r
      var a = i.memoizedState.inst
      V !== null && r !== null && Co(r, V.memoizedState.deps)
        ? (i.memoizedState = as(t, a, n, r))
        : ((B.flags |= e), (i.memoizedState = as(1 | t, a, n, r)))
    }
    function ls(e, t) {
      ss(8390656, 8, e, t)
    }
    function us(e, t) {
      cs(2048, 8, e, t)
    }
    function W(e) {
      B.flags |= 4
      var t = B.updateQueue
      if (t === null) ((t = No()), (B.updateQueue = t), (t.events = [e]))
      else {
        var n = t.events
        n === null ? (t.events = [e]) : n.push(e)
      }
    }
    function ds(e) {
      var t = Mo().memoizedState
      return (
        W({ ref: t, nextImpl: e }),
        function () {
          if (Y & 2) throw Error(i(440))
          return t.impl.apply(void 0, arguments)
        }
      )
    }
    function fs(e, t) {
      return cs(4, 2, e, t)
    }
    function ps(e, t) {
      return cs(4, 4, e, t)
    }
    function ms(e, t) {
      if (typeof t == `function`) {
        e = e()
        var n = t(e)
        return function () {
          typeof n == `function` ? n() : t(null)
        }
      }
      if (t != null)
        return (
          (e = e()),
          (t.current = e),
          function () {
            t.current = null
          }
        )
    }
    function hs(e, t, n) {
      ;((n = n == null ? null : n.concat([e])), cs(4, 4, ms.bind(null, t, e), n))
    }
    function gs() {}
    function _s(e, t) {
      var n = Mo()
      t = t === void 0 ? null : t
      var r = n.memoizedState
      return t !== null && Co(t, r[1]) ? r[0] : ((n.memoizedState = [e, t]), e)
    }
    function vs(e, t) {
      var n = Mo()
      t = t === void 0 ? null : t
      var r = n.memoizedState
      if (t !== null && Co(t, r[1])) return r[0]
      if (((r = e()), _o)) {
        Re(!0)
        try {
          e()
        } finally {
          Re(!1)
        }
      }
      return ((n.memoizedState = [r, t]), r)
    }
    function ys(e, t, n) {
      return n === void 0 || (po & 1073741824 && !(Z & 261930))
        ? (e.memoizedState = t)
        : ((e.memoizedState = n), (e = fu()), (B.lanes |= e), (Ul |= e), n)
    }
    function bs(e, t, n, r) {
      return Cr(n, t)
        ? n
        : Qa.current === null
          ? !(po & 42) || (po & 1073741824 && !(Z & 261930))
            ? ((q = !0), (e.memoizedState = n))
            : ((e = fu()), (B.lanes |= e), (Ul |= e), t)
          : ((e = ys(e, n, r)), Cr(e, t) || (q = !0), e)
    }
    function xs(e, t, n, r, i) {
      var a = j.p
      j.p = a !== 0 && 8 > a ? a : 8
      var o = A.T,
        s = {}
      ;((A.T = s), Ms(e, !1, t, n))
      try {
        var c = i(),
          l = A.S
        ;(l !== null && l(s, c),
          typeof c == `object` && c && typeof c.then == `function`
            ? js(e, t, ga(c, r), du(e))
            : js(e, t, r, du(e)))
      } catch (n) {
        js(e, t, { then: function () {}, status: `rejected`, reason: n }, du())
      } finally {
        ;((j.p = a), o !== null && s.types !== null && (o.types = s.types), (A.T = o))
      }
    }
    function Ss() {}
    function Cs(e, t, n, r) {
      if (e.tag !== 5) throw Error(i(476))
      var a = ws(e).queue
      xs(
        e,
        a,
        t,
        oe,
        n === null
          ? Ss
          : function () {
              return (Ts(e), n(r))
            },
      )
    }
    function ws(e) {
      var t = e.memoizedState
      if (t !== null) return t
      t = {
        memoizedState: oe,
        baseState: oe,
        baseQueue: null,
        queue: {
          pending: null,
          lanes: 0,
          dispatch: null,
          lastRenderedReducer: Lo,
          lastRenderedState: oe,
        },
        next: null,
      }
      var n = {}
      return (
        (t.next = {
          memoizedState: n,
          baseState: n,
          baseQueue: null,
          queue: {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: Lo,
            lastRenderedState: n,
          },
          next: null,
        }),
        (e.memoizedState = t),
        (e = e.alternate),
        e !== null && (e.memoizedState = t),
        t
      )
    }
    function Ts(e) {
      var t = ws(e)
      ;(t.next === null && (t = e.alternate.memoizedState), js(e, t.next.queue, {}, du()))
    }
    function Es() {
      return ta(Qf)
    }
    function Ds() {
      return Mo().memoizedState
    }
    function Os() {
      return Mo().memoizedState
    }
    function ks(e) {
      for (var t = e.return; t !== null;) {
        switch (t.tag) {
          case 24:
          case 3:
            var n = du()
            e = Ua(n)
            var r = Wa(t, e, n)
            ;(r !== null && (pu(r, t, n), Ga(r, t, n)), (t = { cache: ca() }), (e.payload = t))
            return
        }
        t = t.return
      }
    }
    function As(e, t, n) {
      var r = du()
      ;((n = {
        lane: r,
        revertLane: 0,
        gesture: null,
        action: n,
        hasEagerState: !1,
        eagerState: null,
        next: null,
      }),
        Ns(e) ? Ps(t, n) : ((n = ri(e, t, n, r)), n !== null && (pu(n, e, r), Fs(n, t, r))))
    }
    function G(e, t, n) {
      js(e, t, n, du())
    }
    function js(e, t, n, r) {
      var i = {
        lane: r,
        revertLane: 0,
        gesture: null,
        action: n,
        hasEagerState: !1,
        eagerState: null,
        next: null,
      }
      if (Ns(e)) Ps(t, i)
      else {
        var a = e.alternate
        if (
          e.lanes === 0 &&
          (a === null || a.lanes === 0) &&
          ((a = t.lastRenderedReducer), a !== null)
        )
          try {
            var o = t.lastRenderedState,
              s = a(o, n)
            if (((i.hasEagerState = !0), (i.eagerState = s), Cr(s, o)))
              return (ni(e, t, i, 0), Il === null && ti(), !1)
          } catch {}
        if (((n = ri(e, t, i, r)), n !== null)) return (pu(n, e, r), Fs(n, t, r), !0)
      }
      return !1
    }
    function Ms(e, t, n, r) {
      if (
        ((r = {
          lane: 2,
          revertLane: ud(),
          gesture: null,
          action: r,
          hasEagerState: !1,
          eagerState: null,
          next: null,
        }),
        Ns(e))
      ) {
        if (t) throw Error(i(479))
      } else ((t = ri(e, n, r, 2)), t !== null && pu(t, e, 2))
    }
    function Ns(e) {
      var t = e.alternate
      return e === B || (t !== null && t === B)
    }
    function Ps(e, t) {
      go = ho = !0
      var n = e.pending
      ;(n === null ? (t.next = t) : ((t.next = n.next), (n.next = t)), (e.pending = t))
    }
    function Fs(e, t, n) {
      if (n & 4194048) {
        var r = t.lanes
        ;((r &= e.pendingLanes), (n |= r), (t.lanes = n), tt(e, n))
      }
    }
    var Is = {
      readContext: ta,
      use: Fo,
      useCallback: So,
      useContext: So,
      useEffect: So,
      useImperativeHandle: So,
      useLayoutEffect: So,
      useInsertionEffect: So,
      useMemo: So,
      useReducer: So,
      useRef: So,
      useState: So,
      useDebugValue: So,
      useDeferredValue: So,
      useTransition: So,
      useSyncExternalStore: So,
      useId: So,
      useHostTransitionStatus: So,
      useFormState: So,
      useActionState: So,
      useOptimistic: So,
      useMemoCache: So,
      useCacheRefresh: So,
    }
    Is.useEffectEvent = So
    var Ls = {
        readContext: ta,
        use: Fo,
        useCallback: function (e, t) {
          return ((jo().memoizedState = [e, t === void 0 ? null : t]), e)
        },
        useContext: ta,
        useEffect: ls,
        useImperativeHandle: function (e, t, n) {
          ;((n = n == null ? null : n.concat([e])), ss(4194308, 4, ms.bind(null, t, e), n))
        },
        useLayoutEffect: function (e, t) {
          return ss(4194308, 4, e, t)
        },
        useInsertionEffect: function (e, t) {
          ss(4, 2, e, t)
        },
        useMemo: function (e, t) {
          var n = jo()
          t = t === void 0 ? null : t
          var r = e()
          if (_o) {
            Re(!0)
            try {
              e()
            } finally {
              Re(!1)
            }
          }
          return ((n.memoizedState = [r, t]), r)
        },
        useReducer: function (e, t, n) {
          var r = jo()
          if (n !== void 0) {
            var i = n(t)
            if (_o) {
              Re(!0)
              try {
                n(t)
              } finally {
                Re(!1)
              }
            }
          } else i = t
          return (
            (r.memoizedState = r.baseState = i),
            (e = {
              pending: null,
              lanes: 0,
              dispatch: null,
              lastRenderedReducer: e,
              lastRenderedState: i,
            }),
            (r.queue = e),
            (e = e.dispatch = As.bind(null, B, e)),
            [r.memoizedState, e]
          )
        },
        useRef: function (e) {
          var t = jo()
          return ((e = { current: e }), (t.memoizedState = e))
        },
        useState: function (e) {
          e = H(e)
          var t = e.queue,
            n = G.bind(null, B, t)
          return ((t.dispatch = n), [e.memoizedState, n])
        },
        useDebugValue: gs,
        useDeferredValue: function (e, t) {
          return ys(jo(), e, t)
        },
        useTransition: function () {
          var e = H(!1)
          return ((e = xs.bind(null, B, e.queue, !0, !1)), (jo().memoizedState = e), [!1, e])
        },
        useSyncExternalStore: function (e, t, n) {
          var r = B,
            a = jo()
          if (z) {
            if (n === void 0) throw Error(i(407))
            n = n()
          } else {
            if (((n = t()), Il === null)) throw Error(i(349))
            Z & 127 || Ho(r, t, n)
          }
          a.memoizedState = n
          var o = { value: n, getSnapshot: t }
          return (
            (a.queue = o),
            ls(Wo.bind(null, r, o, e), [e]),
            (r.flags |= 2048),
            as(9, { destroy: void 0 }, Uo.bind(null, r, o, n, t), null),
            n
          )
        },
        useId: function () {
          var e = jo(),
            t = Il.identifierPrefix
          if (z) {
            var n = Oi,
              r = Di
            ;((n = (r & ~(1 << (32 - ze(r) - 1))).toString(32) + n),
              (t = `_` + t + `R_` + n),
              (n = vo++),
              0 < n && (t += `H` + n.toString(32)),
              (t += `_`))
          } else ((n = xo++), (t = `_` + t + `r_` + n.toString(32) + `_`))
          return (e.memoizedState = t)
        },
        useHostTransitionStatus: Es,
        useFormState: ts,
        useActionState: ts,
        useOptimistic: function (e) {
          var t = jo()
          t.memoizedState = t.baseState = e
          var n = {
            pending: null,
            lanes: 0,
            dispatch: null,
            lastRenderedReducer: null,
            lastRenderedState: null,
          }
          return ((t.queue = n), (t = Ms.bind(null, B, !0, n)), (n.dispatch = t), [e, t])
        },
        useMemoCache: Io,
        useCacheRefresh: function () {
          return (jo().memoizedState = ks.bind(null, B))
        },
        useEffectEvent: function (e) {
          var t = jo(),
            n = { impl: e }
          return (
            (t.memoizedState = n),
            function () {
              if (Y & 2) throw Error(i(440))
              return n.impl.apply(void 0, arguments)
            }
          )
        },
      },
      Rs = {
        readContext: ta,
        use: Fo,
        useCallback: _s,
        useContext: ta,
        useEffect: us,
        useImperativeHandle: hs,
        useInsertionEffect: fs,
        useLayoutEffect: ps,
        useMemo: vs,
        useReducer: Ro,
        useRef: os,
        useState: function () {
          return Ro(Lo)
        },
        useDebugValue: gs,
        useDeferredValue: function (e, t) {
          return bs(Mo(), V.memoizedState, e, t)
        },
        useTransition: function () {
          var e = Ro(Lo)[0],
            t = Mo().memoizedState
          return [typeof e == `boolean` ? e : Po(e), t]
        },
        useSyncExternalStore: Vo,
        useId: Ds,
        useHostTransitionStatus: Es,
        useFormState: ns,
        useActionState: ns,
        useOptimistic: function (e, t) {
          return qo(Mo(), V, e, t)
        },
        useMemoCache: Io,
        useCacheRefresh: Os,
      }
    Rs.useEffectEvent = ds
    var zs = {
      readContext: ta,
      use: Fo,
      useCallback: _s,
      useContext: ta,
      useEffect: us,
      useImperativeHandle: hs,
      useInsertionEffect: fs,
      useLayoutEffect: ps,
      useMemo: vs,
      useReducer: Bo,
      useRef: os,
      useState: function () {
        return Bo(Lo)
      },
      useDebugValue: gs,
      useDeferredValue: function (e, t) {
        var n = Mo()
        return V === null ? ys(n, e, t) : bs(n, V.memoizedState, e, t)
      },
      useTransition: function () {
        var e = Bo(Lo)[0],
          t = Mo().memoizedState
        return [typeof e == `boolean` ? e : Po(e), t]
      },
      useSyncExternalStore: Vo,
      useId: Ds,
      useHostTransitionStatus: Es,
      useFormState: is,
      useActionState: is,
      useOptimistic: function (e, t) {
        var n = Mo()
        return V === null ? ((n.baseState = e), [e, n.queue.dispatch]) : qo(n, V, e, t)
      },
      useMemoCache: Io,
      useCacheRefresh: Os,
    }
    zs.useEffectEvent = ds
    function Bs(e, t, n, r) {
      ;((t = e.memoizedState),
        (n = n(r, t)),
        (n = n == null ? t : h({}, t, n)),
        (e.memoizedState = n),
        e.lanes === 0 && (e.updateQueue.baseState = n))
    }
    var Vs = {
      enqueueSetState: function (e, t, n) {
        e = e._reactInternals
        var r = du(),
          i = Ua(r)
        ;((i.payload = t),
          n != null && (i.callback = n),
          (t = Wa(e, i, r)),
          t !== null && (pu(t, e, r), Ga(t, e, r)))
      },
      enqueueReplaceState: function (e, t, n) {
        e = e._reactInternals
        var r = du(),
          i = Ua(r)
        ;((i.tag = 1),
          (i.payload = t),
          n != null && (i.callback = n),
          (t = Wa(e, i, r)),
          t !== null && (pu(t, e, r), Ga(t, e, r)))
      },
      enqueueForceUpdate: function (e, t) {
        e = e._reactInternals
        var n = du(),
          r = Ua(n)
        ;((r.tag = 2),
          t != null && (r.callback = t),
          (t = Wa(e, r, n)),
          t !== null && (pu(t, e, n), Ga(t, e, n)))
      },
    }
    function Hs(e, t, n, r, i, a, o) {
      return (
        (e = e.stateNode),
        typeof e.shouldComponentUpdate == `function`
          ? e.shouldComponentUpdate(r, a, o)
          : t.prototype && t.prototype.isPureReactComponent
            ? !wr(n, r) || !wr(i, a)
            : !0
      )
    }
    function Us(e, t, n, r) {
      ;((e = t.state),
        typeof t.componentWillReceiveProps == `function` && t.componentWillReceiveProps(n, r),
        typeof t.UNSAFE_componentWillReceiveProps == `function` &&
          t.UNSAFE_componentWillReceiveProps(n, r),
        t.state !== e && Vs.enqueueReplaceState(t, t.state, null))
    }
    function Ws(e, t) {
      var n = t
      if (`ref` in t) for (var r in ((n = {}), t)) r !== `ref` && (n[r] = t[r])
      if ((e = e.defaultProps))
        for (var i in (n === t && (n = h({}, n)), e)) n[i] === void 0 && (n[i] = e[i])
      return n
    }
    function Gs(e) {
      Zr(e)
    }
    function Ks(e) {
      console.error(e)
    }
    function qs(e) {
      Zr(e)
    }
    function K(e, t) {
      try {
        var n = e.onUncaughtError
        n(t.value, { componentStack: t.stack })
      } catch (e) {
        setTimeout(function () {
          throw e
        })
      }
    }
    function Js(e, t, n) {
      try {
        var r = e.onCaughtError
        r(n.value, { componentStack: n.stack, errorBoundary: t.tag === 1 ? t.stateNode : null })
      } catch (e) {
        setTimeout(function () {
          throw e
        })
      }
    }
    function Ys(e, t, n) {
      return (
        (n = Ua(n)),
        (n.tag = 3),
        (n.payload = { element: null }),
        (n.callback = function () {
          K(e, t)
        }),
        n
      )
    }
    function Xs(e) {
      return ((e = Ua(e)), (e.tag = 3), e)
    }
    function Zs(e, t, n, r) {
      var i = n.type.getDerivedStateFromError
      if (typeof i == `function`) {
        var a = r.value
        ;((e.payload = function () {
          return i(a)
        }),
          (e.callback = function () {
            Js(t, n, r)
          }))
      }
      var o = n.stateNode
      o !== null &&
        typeof o.componentDidCatch == `function` &&
        (e.callback = function () {
          ;(Js(t, n, r),
            typeof i != `function` && (tu === null ? (tu = new Set([this])) : tu.add(this)))
          var e = r.stack
          this.componentDidCatch(r.value, { componentStack: e === null ? `` : e })
        })
    }
    function Qs(e, t, n, r, a) {
      if (((n.flags |= 32768), typeof r == `object` && r && typeof r.then == `function`)) {
        if (((t = n.alternate), t !== null && Qi(t, n, a, !0), (n = ro.current), n !== null)) {
          switch (n.tag) {
            case 31:
            case 13:
              return (
                io === null ? Tu() : n.alternate === null && Hl === 0 && (Hl = 3),
                (n.flags &= -257),
                (n.flags |= 65536),
                (n.lanes = a),
                r === Ta
                  ? (n.flags |= 16384)
                  : ((t = n.updateQueue),
                    t === null ? (n.updateQueue = new Set([r])) : t.add(r),
                    Wu(e, r, a)),
                !1
              )
            case 22:
              return (
                (n.flags |= 65536),
                r === Ta
                  ? (n.flags |= 16384)
                  : ((t = n.updateQueue),
                    t === null
                      ? ((t = {
                          transitions: null,
                          markerInstances: null,
                          retryQueue: new Set([r]),
                        }),
                        (n.updateQueue = t))
                      : ((n = t.retryQueue), n === null ? (t.retryQueue = new Set([r])) : n.add(r)),
                    Wu(e, r, a)),
                !1
              )
          }
          throw Error(i(435, n.tag))
        }
        return (Wu(e, r, a), Tu(), !1)
      }
      if (z)
        return (
          (t = ro.current),
          t === null
            ? (r !== Li && ((t = Error(i(423), { cause: r })), Wi(yi(t, n))),
              (e = e.current.alternate),
              (e.flags |= 65536),
              (a &= -a),
              (e.lanes |= a),
              (r = yi(r, n)),
              (a = Ys(e.stateNode, r, a)),
              Ka(e, a),
              Hl !== 4 && (Hl = 2))
            : (!(t.flags & 65536) && (t.flags |= 256),
              (t.flags |= 65536),
              (t.lanes = a),
              r !== Li && ((e = Error(i(422), { cause: r })), Wi(yi(e, n)))),
          !1
        )
      var o = Error(i(520), { cause: r })
      if (((o = yi(o, n)), Jl === null ? (Jl = [o]) : Jl.push(o), Hl !== 4 && (Hl = 2), t === null))
        return !0
      ;((r = yi(r, n)), (n = t))
      do {
        switch (n.tag) {
          case 3:
            return (
              (n.flags |= 65536),
              (e = a & -a),
              (n.lanes |= e),
              (e = Ys(n.stateNode, r, e)),
              Ka(n, e),
              !1
            )
          case 1:
            if (
              ((t = n.type),
              (o = n.stateNode),
              !(n.flags & 128) &&
                (typeof t.getDerivedStateFromError == `function` ||
                  (o !== null &&
                    typeof o.componentDidCatch == `function` &&
                    (tu === null || !tu.has(o)))))
            )
              return (
                (n.flags |= 65536),
                (a &= -a),
                (n.lanes |= a),
                (a = Xs(a)),
                Zs(a, e, n, r),
                Ka(n, a),
                !1
              )
        }
        n = n.return
      } while (n !== null)
      return !1
    }
    var $s = Error(i(461)),
      q = !1
    function ec(e, t, n, r) {
      t.child = e === null ? za(t, null, n, r) : Ra(t, e.child, n, r)
    }
    function J(e, t, n, r, i) {
      n = n.render
      var a = t.ref
      if (`ref` in r) {
        var o = {}
        for (var s in r) s !== `ref` && (o[s] = r[s])
      } else o = r
      return (
        ea(t),
        (r = wo(e, t, n, o, a, i)),
        (s = Oo()),
        e !== null && !q
          ? (ko(e, t, i), wc(e, t, i))
          : (z && s && ji(t), (t.flags |= 1), ec(e, t, r, i), t.child)
      )
    }
    function tc(e, t, n, r, i) {
      if (e === null) {
        var a = n.type
        return typeof a == `function` && !ui(a) && a.defaultProps === void 0 && n.compare === null
          ? ((t.tag = 15), (t.type = a), nc(e, t, a, r, i))
          : ((e = pi(n.type, null, r, t, t.mode, i)),
            (e.ref = t.ref),
            (e.return = t),
            (t.child = e))
      }
      if (((a = e.child), !Tc(e, i))) {
        var o = a.memoizedProps
        if (((n = n.compare), (n = n === null ? wr : n), n(o, r) && e.ref === t.ref))
          return wc(e, t, i)
      }
      return ((t.flags |= 1), (e = di(a, r)), (e.ref = t.ref), (e.return = t), (t.child = e))
    }
    function nc(e, t, n, r, i) {
      if (e !== null) {
        var a = e.memoizedProps
        if (wr(a, r) && e.ref === t.ref) {
          if (((q = !1), (t.pendingProps = r = a), Tc(e, i))) e.flags & 131072 && (q = !0)
          else return ((t.lanes = e.lanes), wc(e, t, i))
        }
      }
      return uc(e, t, n, r, i)
    }
    function rc(e, t, n, r) {
      var i = r.children,
        a = e === null ? null : e.memoizedState
      if (
        (e === null &&
          t.stateNode === null &&
          (t.stateNode = {
            _visibility: 1,
            _pendingMarkers: null,
            _retryCache: null,
            _transitions: null,
          }),
        r.mode === `hidden`)
      ) {
        if (t.flags & 128) {
          if (((a = a === null ? n : a.baseLanes | n), e !== null)) {
            for (r = t.child = e.child, i = 0; r !== null;)
              ((i = i | r.lanes | r.childLanes), (r = r.sibling))
            r = i & ~a
          } else ((r = 0), (t.child = null))
          return ac(e, t, a, n, r)
        }
        if (n & 536870912)
          ((t.memoizedState = { baseLanes: 0, cachePool: null }),
            e !== null && ba(t, a === null ? null : a.cachePool),
            a === null ? to() : eo(t, a),
            so(t))
        else return ((r = t.lanes = 536870912), ac(e, t, a === null ? n : a.baseLanes | n, n, r))
      } else
        a === null
          ? (e !== null && ba(t, null), to(), co(t))
          : (ba(t, a.cachePool), eo(t, a), co(t), (t.memoizedState = null))
      return (ec(e, t, i, n), t.child)
    }
    function ic(e, t) {
      return (
        (e !== null && e.tag === 22) ||
          t.stateNode !== null ||
          (t.stateNode = {
            _visibility: 1,
            _pendingMarkers: null,
            _retryCache: null,
            _transitions: null,
          }),
        t.sibling
      )
    }
    function ac(e, t, n, r, i) {
      var a = ya()
      return (
        (a = a === null ? null : { parent: sa._currentValue, pool: a }),
        (t.memoizedState = { baseLanes: n, cachePool: a }),
        e !== null && ba(t, null),
        to(),
        so(t),
        e !== null && Qi(e, t, r, !0),
        (t.childLanes = i),
        null
      )
    }
    function oc(e, t) {
      return (
        (t = yc({ mode: t.mode, children: t.children }, e.mode)),
        (t.ref = e.ref),
        (e.child = t),
        (t.return = e),
        t
      )
    }
    function sc(e, t, n) {
      return (
        Ra(t, e.child, null, n),
        (e = oc(t, t.pendingProps)),
        (e.flags |= 2),
        lo(t),
        (t.memoizedState = null),
        e
      )
    }
    function cc(e, t, n) {
      var r = t.pendingProps,
        a = !!(t.flags & 128)
      if (((t.flags &= -129), e === null)) {
        if (z) {
          if (r.mode === `hidden`) return ((e = oc(t, r)), (t.lanes = 536870912), ic(null, e))
          if (
            (oo(t),
            (e = R)
              ? ((e = rf(e, Ii)),
                (e = e !== null && e.data === `&` ? e : null),
                e !== null &&
                  ((t.memoizedState = {
                    dehydrated: e,
                    treeContext: Ei === null ? null : { id: Di, overflow: Oi },
                    retryLane: 536870912,
                    hydrationErrors: null,
                  }),
                  (n = gi(e)),
                  (n.return = t),
                  (t.child = n),
                  (Pi = t),
                  (R = null)))
              : (e = null),
            e === null)
          )
            throw Ri(t)
          return ((t.lanes = 536870912), null)
        }
        return oc(t, r)
      }
      var o = e.memoizedState
      if (o !== null) {
        var s = o.dehydrated
        if ((oo(t), a)) {
          if (t.flags & 256) ((t.flags &= -257), (t = sc(e, t, n)))
          else if (t.memoizedState !== null) ((t.child = e.child), (t.flags |= 128), (t = null))
          else throw Error(i(558))
        } else if ((q || Qi(e, t, n, !1), (a = (n & e.childLanes) !== 0), q || a)) {
          if (((r = Il), r !== null && ((s = nt(r, n)), s !== 0 && s !== o.retryLane)))
            throw ((o.retryLane = s), ii(e, s), pu(r, e, s), $s)
          ;(Tu(), (t = sc(e, t, n)))
        } else
          ((e = o.treeContext),
            (R = cf(s.nextSibling)),
            (Pi = t),
            (z = !0),
            (Fi = null),
            (Ii = !1),
            e !== null && Ni(t, e),
            (t = oc(t, r)),
            (t.flags |= 4096))
        return t
      }
      return (
        (e = di(e.child, { mode: r.mode, children: r.children })),
        (e.ref = t.ref),
        (t.child = e),
        (e.return = t),
        e
      )
    }
    function lc(e, t) {
      var n = t.ref
      if (n === null) e !== null && e.ref !== null && (t.flags |= 4194816)
      else {
        if (typeof n != `function` && typeof n != `object`) throw Error(i(284))
        ;(e === null || e.ref !== n) && (t.flags |= 4194816)
      }
    }
    function uc(e, t, n, r, i) {
      return (
        ea(t),
        (n = wo(e, t, n, r, void 0, i)),
        (r = Oo()),
        e !== null && !q
          ? (ko(e, t, i), wc(e, t, i))
          : (z && r && ji(t), (t.flags |= 1), ec(e, t, n, i), t.child)
      )
    }
    function dc(e, t, n, r, i, a) {
      return (
        ea(t),
        (t.updateQueue = null),
        (n = Eo(t, r, n, i)),
        To(e),
        (r = Oo()),
        e !== null && !q
          ? (ko(e, t, a), wc(e, t, a))
          : (z && r && ji(t), (t.flags |= 1), ec(e, t, n, a), t.child)
      )
    }
    function fc(e, t, n, r, i) {
      if ((ea(t), t.stateNode === null)) {
        var a = si,
          o = n.contextType
        ;(typeof o == `object` && o && (a = ta(o)),
          (a = new n(r, a)),
          (t.memoizedState = a.state !== null && a.state !== void 0 ? a.state : null),
          (a.updater = Vs),
          (t.stateNode = a),
          (a._reactInternals = t),
          (a = t.stateNode),
          (a.props = r),
          (a.state = t.memoizedState),
          (a.refs = {}),
          Va(t),
          (o = n.contextType),
          (a.context = typeof o == `object` && o ? ta(o) : si),
          (a.state = t.memoizedState),
          (o = n.getDerivedStateFromProps),
          typeof o == `function` && (Bs(t, n, o, r), (a.state = t.memoizedState)),
          typeof n.getDerivedStateFromProps == `function` ||
            typeof a.getSnapshotBeforeUpdate == `function` ||
            (typeof a.UNSAFE_componentWillMount != `function` &&
              typeof a.componentWillMount != `function`) ||
            ((o = a.state),
            typeof a.componentWillMount == `function` && a.componentWillMount(),
            typeof a.UNSAFE_componentWillMount == `function` && a.UNSAFE_componentWillMount(),
            o !== a.state && Vs.enqueueReplaceState(a, a.state, null),
            Ya(t, r, a, i),
            Ja(),
            (a.state = t.memoizedState)),
          typeof a.componentDidMount == `function` && (t.flags |= 4194308),
          (r = !0))
      } else if (e === null) {
        a = t.stateNode
        var s = t.memoizedProps,
          c = Ws(n, s)
        a.props = c
        var l = a.context,
          u = n.contextType
        ;((o = si), typeof u == `object` && u && (o = ta(u)))
        var d = n.getDerivedStateFromProps
        ;((u = typeof d == `function` || typeof a.getSnapshotBeforeUpdate == `function`),
          (s = t.pendingProps !== s),
          u ||
            (typeof a.UNSAFE_componentWillReceiveProps != `function` &&
              typeof a.componentWillReceiveProps != `function`) ||
            ((s || l !== o) && Us(t, a, r, o)),
          (Ba = !1))
        var f = t.memoizedState
        ;((a.state = f),
          Ya(t, r, a, i),
          Ja(),
          (l = t.memoizedState),
          s || f !== l || Ba
            ? (typeof d == `function` && (Bs(t, n, d, r), (l = t.memoizedState)),
              (c = Ba || Hs(t, n, c, r, f, l, o))
                ? (u ||
                    (typeof a.UNSAFE_componentWillMount != `function` &&
                      typeof a.componentWillMount != `function`) ||
                    (typeof a.componentWillMount == `function` && a.componentWillMount(),
                    typeof a.UNSAFE_componentWillMount == `function` &&
                      a.UNSAFE_componentWillMount()),
                  typeof a.componentDidMount == `function` && (t.flags |= 4194308))
                : (typeof a.componentDidMount == `function` && (t.flags |= 4194308),
                  (t.memoizedProps = r),
                  (t.memoizedState = l)),
              (a.props = r),
              (a.state = l),
              (a.context = o),
              (r = c))
            : (typeof a.componentDidMount == `function` && (t.flags |= 4194308), (r = !1)))
      } else {
        ;((a = t.stateNode),
          Ha(e, t),
          (o = t.memoizedProps),
          (u = Ws(n, o)),
          (a.props = u),
          (d = t.pendingProps),
          (f = a.context),
          (l = n.contextType),
          (c = si),
          typeof l == `object` && l && (c = ta(l)),
          (s = n.getDerivedStateFromProps),
          (l = typeof s == `function` || typeof a.getSnapshotBeforeUpdate == `function`) ||
            (typeof a.UNSAFE_componentWillReceiveProps != `function` &&
              typeof a.componentWillReceiveProps != `function`) ||
            ((o !== d || f !== c) && Us(t, a, r, c)),
          (Ba = !1),
          (f = t.memoizedState),
          (a.state = f),
          Ya(t, r, a, i),
          Ja())
        var p = t.memoizedState
        o !== d || f !== p || Ba || (e !== null && e.dependencies !== null && $i(e.dependencies))
          ? (typeof s == `function` && (Bs(t, n, s, r), (p = t.memoizedState)),
            (u =
              Ba ||
              Hs(t, n, u, r, f, p, c) ||
              (e !== null && e.dependencies !== null && $i(e.dependencies)))
              ? (l ||
                  (typeof a.UNSAFE_componentWillUpdate != `function` &&
                    typeof a.componentWillUpdate != `function`) ||
                  (typeof a.componentWillUpdate == `function` && a.componentWillUpdate(r, p, c),
                  typeof a.UNSAFE_componentWillUpdate == `function` &&
                    a.UNSAFE_componentWillUpdate(r, p, c)),
                typeof a.componentDidUpdate == `function` && (t.flags |= 4),
                typeof a.getSnapshotBeforeUpdate == `function` && (t.flags |= 1024))
              : (typeof a.componentDidUpdate != `function` ||
                  (o === e.memoizedProps && f === e.memoizedState) ||
                  (t.flags |= 4),
                typeof a.getSnapshotBeforeUpdate != `function` ||
                  (o === e.memoizedProps && f === e.memoizedState) ||
                  (t.flags |= 1024),
                (t.memoizedProps = r),
                (t.memoizedState = p)),
            (a.props = r),
            (a.state = p),
            (a.context = c),
            (r = u))
          : (typeof a.componentDidUpdate != `function` ||
              (o === e.memoizedProps && f === e.memoizedState) ||
              (t.flags |= 4),
            typeof a.getSnapshotBeforeUpdate != `function` ||
              (o === e.memoizedProps && f === e.memoizedState) ||
              (t.flags |= 1024),
            (r = !1))
      }
      return (
        (a = r),
        lc(e, t),
        (r = !!(t.flags & 128)),
        a || r
          ? ((a = t.stateNode),
            (n = r && typeof n.getDerivedStateFromError != `function` ? null : a.render()),
            (t.flags |= 1),
            e !== null && r
              ? ((t.child = Ra(t, e.child, null, i)), (t.child = Ra(t, null, n, i)))
              : ec(e, t, n, i),
            (t.memoizedState = a.state),
            (e = t.child))
          : (e = wc(e, t, i)),
        e
      )
    }
    function pc(e, t, n, r) {
      return (Hi(), (t.flags |= 256), ec(e, t, n, r), t.child)
    }
    var mc = { dehydrated: null, treeContext: null, retryLane: 0, hydrationErrors: null }
    function hc(e) {
      return { baseLanes: e, cachePool: xa() }
    }
    function gc(e, t, n) {
      return ((e = e === null ? 0 : e.childLanes & ~n), t && (e |= Kl), e)
    }
    function _c(e, t, n) {
      var r = t.pendingProps,
        a = !1,
        o = !!(t.flags & 128),
        s
      if (
        ((s = o) || (s = e !== null && e.memoizedState === null ? !1 : !!(uo.current & 2)),
        s && ((a = !0), (t.flags &= -129)),
        (s = !!(t.flags & 32)),
        (t.flags &= -33),
        e === null)
      ) {
        if (z) {
          if (
            (a ? ao(t) : co(t),
            (e = R)
              ? ((e = rf(e, Ii)),
                (e = e !== null && e.data !== `&` ? e : null),
                e !== null &&
                  ((t.memoizedState = {
                    dehydrated: e,
                    treeContext: Ei === null ? null : { id: Di, overflow: Oi },
                    retryLane: 536870912,
                    hydrationErrors: null,
                  }),
                  (n = gi(e)),
                  (n.return = t),
                  (t.child = n),
                  (Pi = t),
                  (R = null)))
              : (e = null),
            e === null)
          )
            throw Ri(t)
          return (of(e) ? (t.lanes = 32) : (t.lanes = 536870912), null)
        }
        var c = r.children
        return (
          (r = r.fallback),
          a
            ? (co(t),
              (a = t.mode),
              (c = yc({ mode: `hidden`, children: c }, a)),
              (r = mi(r, a, n, null)),
              (c.return = t),
              (r.return = t),
              (c.sibling = r),
              (t.child = c),
              (r = t.child),
              (r.memoizedState = hc(n)),
              (r.childLanes = gc(e, s, n)),
              (t.memoizedState = mc),
              ic(null, r))
            : (ao(t), vc(t, c))
        )
      }
      var l = e.memoizedState
      if (l !== null && ((c = l.dehydrated), c !== null)) {
        if (o)
          t.flags & 256
            ? (ao(t), (t.flags &= -257), (t = bc(e, t, n)))
            : t.memoizedState === null
              ? (co(t),
                (c = r.fallback),
                (a = t.mode),
                (r = yc({ mode: `visible`, children: r.children }, a)),
                (c = mi(c, a, n, null)),
                (c.flags |= 2),
                (r.return = t),
                (c.return = t),
                (r.sibling = c),
                (t.child = r),
                Ra(t, e.child, null, n),
                (r = t.child),
                (r.memoizedState = hc(n)),
                (r.childLanes = gc(e, s, n)),
                (t.memoizedState = mc),
                (t = ic(null, r)))
              : (co(t), (t.child = e.child), (t.flags |= 128), (t = null))
        else if ((ao(t), of(c))) {
          if (((s = c.nextSibling && c.nextSibling.dataset), s)) var u = s.dgst
          ;((s = u),
            (r = Error(i(419))),
            (r.stack = ``),
            (r.digest = s),
            Wi({ value: r, source: null, stack: null }),
            (t = bc(e, t, n)))
        } else if ((q || Qi(e, t, n, !1), (s = (n & e.childLanes) !== 0), q || s)) {
          if (((s = Il), s !== null && ((r = nt(s, n)), r !== 0 && r !== l.retryLane)))
            throw ((l.retryLane = r), ii(e, r), pu(s, e, r), $s)
          ;(af(c) || Tu(), (t = bc(e, t, n)))
        } else
          af(c)
            ? ((t.flags |= 192), (t.child = e.child), (t = null))
            : ((e = l.treeContext),
              (R = cf(c.nextSibling)),
              (Pi = t),
              (z = !0),
              (Fi = null),
              (Ii = !1),
              e !== null && Ni(t, e),
              (t = vc(t, r.children)),
              (t.flags |= 4096))
        return t
      }
      return a
        ? (co(t),
          (c = r.fallback),
          (a = t.mode),
          (l = e.child),
          (u = l.sibling),
          (r = di(l, { mode: `hidden`, children: r.children })),
          (r.subtreeFlags = l.subtreeFlags & 65011712),
          u === null ? ((c = mi(c, a, n, null)), (c.flags |= 2)) : (c = di(u, c)),
          (c.return = t),
          (r.return = t),
          (r.sibling = c),
          (t.child = r),
          ic(null, r),
          (r = t.child),
          (c = e.child.memoizedState),
          c === null
            ? (c = hc(n))
            : ((a = c.cachePool),
              a === null
                ? (a = xa())
                : ((l = sa._currentValue), (a = a.parent === l ? a : { parent: l, pool: l })),
              (c = { baseLanes: c.baseLanes | n, cachePool: a })),
          (r.memoizedState = c),
          (r.childLanes = gc(e, s, n)),
          (t.memoizedState = mc),
          ic(e.child, r))
        : (ao(t),
          (n = e.child),
          (e = n.sibling),
          (n = di(n, { mode: `visible`, children: r.children })),
          (n.return = t),
          (n.sibling = null),
          e !== null &&
            ((s = t.deletions), s === null ? ((t.deletions = [e]), (t.flags |= 16)) : s.push(e)),
          (t.child = n),
          (t.memoizedState = null),
          n)
    }
    function vc(e, t) {
      return ((t = yc({ mode: `visible`, children: t }, e.mode)), (t.return = e), (e.child = t))
    }
    function yc(e, t) {
      return ((e = li(22, e, null, t)), (e.lanes = 0), e)
    }
    function bc(e, t, n) {
      return (
        Ra(t, e.child, null, n),
        (e = vc(t, t.pendingProps.children)),
        (e.flags |= 2),
        (t.memoizedState = null),
        e
      )
    }
    function xc(e, t, n) {
      e.lanes |= t
      var r = e.alternate
      ;(r !== null && (r.lanes |= t), Xi(e.return, t, n))
    }
    function Sc(e, t, n, r, i, a) {
      var o = e.memoizedState
      o === null
        ? (e.memoizedState = {
            isBackwards: t,
            rendering: null,
            renderingStartTime: 0,
            last: r,
            tail: n,
            tailMode: i,
            treeForkCount: a,
          })
        : ((o.isBackwards = t),
          (o.rendering = null),
          (o.renderingStartTime = 0),
          (o.last = r),
          (o.tail = n),
          (o.tailMode = i),
          (o.treeForkCount = a))
    }
    function Cc(e, t, n) {
      var r = t.pendingProps,
        i = r.revealOrder,
        a = r.tail
      r = r.children
      var o = uo.current,
        s = !!(o & 2)
      if (
        (s ? ((o = (o & 1) | 2), (t.flags |= 128)) : (o &= 1),
        P(uo, o),
        ec(e, t, r, n),
        (r = z ? Ci : 0),
        !s && e !== null && e.flags & 128)
      )
        a: for (e = t.child; e !== null;) {
          if (e.tag === 13) e.memoizedState !== null && xc(e, n, t)
          else if (e.tag === 19) xc(e, n, t)
          else if (e.child !== null) {
            ;((e.child.return = e), (e = e.child))
            continue
          }
          if (e === t) break a
          for (; e.sibling === null;) {
            if (e.return === null || e.return === t) break a
            e = e.return
          }
          ;((e.sibling.return = e.return), (e = e.sibling))
        }
      switch (i) {
        case `forwards`:
          for (n = t.child, i = null; n !== null;)
            ((e = n.alternate), e !== null && fo(e) === null && (i = n), (n = n.sibling))
          ;((n = i),
            n === null ? ((i = t.child), (t.child = null)) : ((i = n.sibling), (n.sibling = null)),
            Sc(t, !1, i, n, a, r))
          break
        case `backwards`:
        case `unstable_legacy-backwards`:
          for (n = null, i = t.child, t.child = null; i !== null;) {
            if (((e = i.alternate), e !== null && fo(e) === null)) {
              t.child = i
              break
            }
            ;((e = i.sibling), (i.sibling = n), (n = i), (i = e))
          }
          Sc(t, !0, n, null, a, r)
          break
        case `together`:
          Sc(t, !1, null, null, void 0, r)
          break
        default:
          t.memoizedState = null
      }
      return t.child
    }
    function wc(e, t, n) {
      if (
        (e !== null && (t.dependencies = e.dependencies), (Ul |= t.lanes), (n & t.childLanes) === 0)
      ) {
        if (e !== null) {
          if ((Qi(e, t, n, !1), (n & t.childLanes) === 0)) return null
        } else return null
      }
      if (e !== null && t.child !== e.child) throw Error(i(153))
      if (t.child !== null) {
        for (e = t.child, n = di(e, e.pendingProps), t.child = n, n.return = t; e.sibling !== null;)
          ((e = e.sibling), (n = n.sibling = di(e, e.pendingProps)), (n.return = t))
        n.sibling = null
      }
      return t.child
    }
    function Tc(e, t) {
      return (e.lanes & t) !== 0 || ((e = e.dependencies), !!(e !== null && $i(e)))
    }
    function Ec(e, t, n) {
      switch (t.tag) {
        case 3:
          ;(fe(t, t.stateNode.containerInfo), Ji(t, sa, e.memoizedState.cache), Hi())
          break
        case 27:
        case 5:
          me(t)
          break
        case 4:
          fe(t, t.stateNode.containerInfo)
          break
        case 10:
          Ji(t, t.type, t.memoizedProps.value)
          break
        case 31:
          if (t.memoizedState !== null) return ((t.flags |= 128), oo(t), null)
          break
        case 13:
          var r = t.memoizedState
          if (r !== null)
            return r.dehydrated === null
              ? (n & t.child.childLanes) === 0
                ? (ao(t), (e = wc(e, t, n)), e === null ? null : e.sibling)
                : _c(e, t, n)
              : (ao(t), (t.flags |= 128), null)
          ao(t)
          break
        case 19:
          var i = !!(e.flags & 128)
          if (
            ((r = (n & t.childLanes) !== 0), (r ||= (Qi(e, t, n, !1), (n & t.childLanes) !== 0)), i)
          ) {
            if (r) return Cc(e, t, n)
            t.flags |= 128
          }
          if (
            ((i = t.memoizedState),
            i !== null && ((i.rendering = null), (i.tail = null), (i.lastEffect = null)),
            P(uo, uo.current),
            r)
          )
            break
          return null
        case 22:
          return ((t.lanes = 0), rc(e, t, n, t.pendingProps))
        case 24:
          Ji(t, sa, e.memoizedState.cache)
      }
      return wc(e, t, n)
    }
    function Dc(e, t, n) {
      if (e !== null) {
        if (e.memoizedProps !== t.pendingProps) q = !0
        else {
          if (!Tc(e, n) && !(t.flags & 128)) return ((q = !1), Ec(e, t, n))
          q = !!(e.flags & 131072)
        }
      } else ((q = !1), z && t.flags & 1048576 && Ai(t, Ci, t.index))
      switch (((t.lanes = 0), t.tag)) {
        case 16:
          a: {
            var r = t.pendingProps
            if (((e = Oa(t.elementType)), (t.type = e), typeof e == `function`))
              ui(e)
                ? ((r = Ws(e, r)), (t.tag = 1), (t = fc(null, t, e, r, n)))
                : ((t.tag = 0), (t = uc(null, t, e, r, n)))
            else {
              if (e != null) {
                var a = e.$$typeof
                if (a === w) {
                  ;((t.tag = 11), (t = J(null, t, e, r, n)))
                  break a
                }
                if (a === ee) {
                  ;((t.tag = 14), (t = tc(null, t, e, r, n)))
                  break a
                }
              }
              throw ((t = ae(e) || e), Error(i(306, t, ``)))
            }
          }
          return t
        case 0:
          return uc(e, t, t.type, t.pendingProps, n)
        case 1:
          return ((r = t.type), (a = Ws(r, t.pendingProps)), fc(e, t, r, a, n))
        case 3:
          a: {
            if ((fe(t, t.stateNode.containerInfo), e === null)) throw Error(i(387))
            r = t.pendingProps
            var o = t.memoizedState
            ;((a = o.element), Ha(e, t), Ya(t, r, null, n))
            var s = t.memoizedState
            if (
              ((r = s.cache),
              Ji(t, sa, r),
              r !== o.cache && Zi(t, [sa], n, !0),
              Ja(),
              (r = s.element),
              o.isDehydrated)
            ) {
              if (
                ((o = { element: r, isDehydrated: !1, cache: s.cache }),
                (t.updateQueue.baseState = o),
                (t.memoizedState = o),
                t.flags & 256)
              ) {
                t = pc(e, t, r, n)
                break a
              }
              if (r !== a) {
                ;((a = yi(Error(i(424)), t)), Wi(a), (t = pc(e, t, r, n)))
                break a
              }
              switch (((e = t.stateNode.containerInfo), e.nodeType)) {
                case 9:
                  e = e.body
                  break
                default:
                  e = e.nodeName === `HTML` ? e.ownerDocument.body : e
              }
              for (
                R = cf(e.firstChild),
                  Pi = t,
                  z = !0,
                  Fi = null,
                  Ii = !0,
                  n = za(t, null, r, n),
                  t.child = n;
                n;
              )
                ((n.flags = (n.flags & -3) | 4096), (n = n.sibling))
            } else {
              if ((Hi(), r === a)) {
                t = wc(e, t, n)
                break a
              }
              ec(e, t, r, n)
            }
            t = t.child
          }
          return t
        case 26:
          return (
            lc(e, t),
            e === null
              ? (n = kf(t.type, null, t.pendingProps, null))
                ? (t.memoizedState = n)
                : z ||
                  ((n = t.type),
                  (e = t.pendingProps),
                  (r = Bd(ue.current).createElement(n)),
                  (r[ct] = t),
                  (r[lt] = e),
                  Pd(r, n, e),
                  xt(r),
                  (t.stateNode = r))
              : (t.memoizedState = kf(t.type, e.memoizedProps, t.pendingProps, e.memoizedState)),
            null
          )
        case 27:
          return (
            me(t),
            e === null &&
              z &&
              ((r = t.stateNode = ff(t.type, t.pendingProps, ue.current)),
              (Pi = t),
              (Ii = !0),
              (a = R),
              Zd(t.type) ? ((lf = a), (R = cf(r.firstChild))) : (R = a)),
            ec(e, t, t.pendingProps.children, n),
            lc(e, t),
            e === null && (t.flags |= 4194304),
            t.child
          )
        case 5:
          return (
            e === null &&
              z &&
              ((a = r = R) &&
                ((r = tf(r, t.type, t.pendingProps, Ii)),
                r === null
                  ? (a = !1)
                  : ((t.stateNode = r), (Pi = t), (R = cf(r.firstChild)), (Ii = !1), (a = !0))),
              a || Ri(t)),
            me(t),
            (a = t.type),
            (o = t.pendingProps),
            (s = e === null ? null : e.memoizedProps),
            (r = o.children),
            Ud(a, o) ? (r = null) : s !== null && Ud(a, s) && (t.flags |= 32),
            t.memoizedState !== null && ((a = wo(e, t, Do, null, null, n)), (Qf._currentValue = a)),
            lc(e, t),
            ec(e, t, r, n),
            t.child
          )
        case 6:
          return (
            e === null &&
              z &&
              ((e = n = R) &&
                ((n = nf(n, t.pendingProps, Ii)),
                n === null ? (e = !1) : ((t.stateNode = n), (Pi = t), (R = null), (e = !0))),
              e || Ri(t)),
            null
          )
        case 13:
          return _c(e, t, n)
        case 4:
          return (
            fe(t, t.stateNode.containerInfo),
            (r = t.pendingProps),
            e === null ? (t.child = Ra(t, null, r, n)) : ec(e, t, r, n),
            t.child
          )
        case 11:
          return J(e, t, t.type, t.pendingProps, n)
        case 7:
          return (ec(e, t, t.pendingProps, n), t.child)
        case 8:
          return (ec(e, t, t.pendingProps.children, n), t.child)
        case 12:
          return (ec(e, t, t.pendingProps.children, n), t.child)
        case 10:
          return ((r = t.pendingProps), Ji(t, t.type, r.value), ec(e, t, r.children, n), t.child)
        case 9:
          return (
            (a = t.type._context),
            (r = t.pendingProps.children),
            ea(t),
            (a = ta(a)),
            (r = r(a)),
            (t.flags |= 1),
            ec(e, t, r, n),
            t.child
          )
        case 14:
          return tc(e, t, t.type, t.pendingProps, n)
        case 15:
          return nc(e, t, t.type, t.pendingProps, n)
        case 19:
          return Cc(e, t, n)
        case 31:
          return cc(e, t, n)
        case 22:
          return rc(e, t, n, t.pendingProps)
        case 24:
          return (
            ea(t),
            (r = ta(sa)),
            e === null
              ? ((a = ya()),
                a === null &&
                  ((a = Il),
                  (o = ca()),
                  (a.pooledCache = o),
                  o.refCount++,
                  o !== null && (a.pooledCacheLanes |= n),
                  (a = o)),
                (t.memoizedState = { parent: r, cache: a }),
                Va(t),
                Ji(t, sa, a))
              : ((e.lanes & n) !== 0 && (Ha(e, t), Ya(t, null, null, n), Ja()),
                (a = e.memoizedState),
                (o = t.memoizedState),
                a.parent === r
                  ? ((r = o.cache), Ji(t, sa, r), r !== a.cache && Zi(t, [sa], n, !0))
                  : ((a = { parent: r, cache: r }),
                    (t.memoizedState = a),
                    t.lanes === 0 && (t.memoizedState = t.updateQueue.baseState = a),
                    Ji(t, sa, r))),
            ec(e, t, t.pendingProps.children, n),
            t.child
          )
        case 29:
          throw t.pendingProps
      }
      throw Error(i(156, t.tag))
    }
    function Oc(e) {
      e.flags |= 4
    }
    function kc(e, t, n, r, i) {
      if (((t = !!(e.mode & 32)) && (t = !1), t)) {
        if (((e.flags |= 16777216), (i & 335544128) === i)) {
          if (e.stateNode.complete) e.flags |= 8192
          else if (Su()) e.flags |= 8192
          else throw ((ka = Ta), Ca)
        }
      } else e.flags &= -16777217
    }
    function Ac(e, t) {
      if (t.type !== `stylesheet` || t.state.loading & 4) e.flags &= -16777217
      else if (((e.flags |= 16777216), !Wf(t))) {
        if (Su()) e.flags |= 8192
        else throw ((ka = Ta), Ca)
      }
    }
    function jc(e, t) {
      ;(t !== null && (e.flags |= 4),
        e.flags & 16384 && ((t = e.tag === 22 ? 536870912 : Xe()), (e.lanes |= t), (ql |= t)))
    }
    function Mc(e, t) {
      if (!z)
        switch (e.tailMode) {
          case `hidden`:
            t = e.tail
            for (var n = null; t !== null;) (t.alternate !== null && (n = t), (t = t.sibling))
            n === null ? (e.tail = null) : (n.sibling = null)
            break
          case `collapsed`:
            n = e.tail
            for (var r = null; n !== null;) (n.alternate !== null && (r = n), (n = n.sibling))
            r === null
              ? t || e.tail === null
                ? (e.tail = null)
                : (e.tail.sibling = null)
              : (r.sibling = null)
        }
    }
    function Nc(e) {
      var t = e.alternate !== null && e.alternate.child === e.child,
        n = 0,
        r = 0
      if (t)
        for (var i = e.child; i !== null;)
          ((n |= i.lanes | i.childLanes),
            (r |= i.subtreeFlags & 65011712),
            (r |= i.flags & 65011712),
            (i.return = e),
            (i = i.sibling))
      else
        for (i = e.child; i !== null;)
          ((n |= i.lanes | i.childLanes),
            (r |= i.subtreeFlags),
            (r |= i.flags),
            (i.return = e),
            (i = i.sibling))
      return ((e.subtreeFlags |= r), (e.childLanes = n), t)
    }
    function Pc(e, t, n) {
      var r = t.pendingProps
      switch ((Mi(t), t.tag)) {
        case 16:
        case 15:
        case 0:
        case 11:
        case 7:
        case 8:
        case 12:
        case 9:
        case 14:
          return (Nc(t), null)
        case 1:
          return (Nc(t), null)
        case 3:
          return (
            (n = t.stateNode),
            (r = null),
            e !== null && (r = e.memoizedState.cache),
            t.memoizedState.cache !== r && (t.flags |= 2048),
            Yi(sa),
            pe(),
            n.pendingContext && ((n.context = n.pendingContext), (n.pendingContext = null)),
            (e === null || e.child === null) &&
              (Vi(t)
                ? Oc(t)
                : e === null ||
                  (e.memoizedState.isDehydrated && !(t.flags & 256)) ||
                  ((t.flags |= 1024), Ui())),
            Nc(t),
            null
          )
        case 26:
          var a = t.type,
            o = t.memoizedState
          return (
            e === null
              ? (Oc(t), o === null ? (Nc(t), kc(t, a, null, r, n)) : (Nc(t), Ac(t, o)))
              : o
                ? o === e.memoizedState
                  ? (Nc(t), (t.flags &= -16777217))
                  : (Oc(t), Nc(t), Ac(t, o))
                : ((e = e.memoizedProps), e !== r && Oc(t), Nc(t), kc(t, a, e, r, n)),
            null
          )
        case 27:
          if ((I(t), (n = ue.current), (a = t.type), e !== null && t.stateNode != null))
            e.memoizedProps !== r && Oc(t)
          else {
            if (!r) {
              if (t.stateNode === null) throw Error(i(166))
              return (Nc(t), null)
            }
            ;((e = le.current), Vi(t) ? zi(t, e) : ((e = ff(a, r, n)), (t.stateNode = e), Oc(t)))
          }
          return (Nc(t), null)
        case 5:
          if ((I(t), (a = t.type), e !== null && t.stateNode != null))
            e.memoizedProps !== r && Oc(t)
          else {
            if (!r) {
              if (t.stateNode === null) throw Error(i(166))
              return (Nc(t), null)
            }
            if (((o = le.current), Vi(t))) zi(t, o)
            else {
              var s = Bd(ue.current)
              switch (o) {
                case 1:
                  o = s.createElementNS(`http://www.w3.org/2000/svg`, a)
                  break
                case 2:
                  o = s.createElementNS(`http://www.w3.org/1998/Math/MathML`, a)
                  break
                default:
                  switch (a) {
                    case `svg`:
                      o = s.createElementNS(`http://www.w3.org/2000/svg`, a)
                      break
                    case `math`:
                      o = s.createElementNS(`http://www.w3.org/1998/Math/MathML`, a)
                      break
                    case `script`:
                      ;((o = s.createElement(`div`)),
                        (o.innerHTML = `<script><\/script>`),
                        (o = o.removeChild(o.firstChild)))
                      break
                    case `select`:
                      ;((o =
                        typeof r.is == `string`
                          ? s.createElement(`select`, { is: r.is })
                          : s.createElement(`select`)),
                        r.multiple ? (o.multiple = !0) : r.size && (o.size = r.size))
                      break
                    default:
                      o =
                        typeof r.is == `string`
                          ? s.createElement(a, { is: r.is })
                          : s.createElement(a)
                  }
              }
              ;((o[ct] = t), (o[lt] = r))
              a: for (s = t.child; s !== null;) {
                if (s.tag === 5 || s.tag === 6) o.appendChild(s.stateNode)
                else if (s.tag !== 4 && s.tag !== 27 && s.child !== null) {
                  ;((s.child.return = s), (s = s.child))
                  continue
                }
                if (s === t) break a
                for (; s.sibling === null;) {
                  if (s.return === null || s.return === t) break a
                  s = s.return
                }
                ;((s.sibling.return = s.return), (s = s.sibling))
              }
              t.stateNode = o
              a: switch ((Pd(o, a, r), a)) {
                case `button`:
                case `input`:
                case `select`:
                case `textarea`:
                  r = !!r.autoFocus
                  break a
                case `img`:
                  r = !0
                  break a
                default:
                  r = !1
              }
              r && Oc(t)
            }
          }
          return (
            Nc(t),
            kc(t, t.type, e === null ? null : e.memoizedProps, t.pendingProps, n),
            null
          )
        case 6:
          if (e && t.stateNode != null) e.memoizedProps !== r && Oc(t)
          else {
            if (typeof r != `string` && t.stateNode === null) throw Error(i(166))
            if (((e = ue.current), Vi(t))) {
              if (((e = t.stateNode), (n = t.memoizedProps), (r = null), (a = Pi), a !== null))
                switch (a.tag) {
                  case 27:
                  case 5:
                    r = a.memoizedProps
                }
              ;((e[ct] = t),
                (e = !!(
                  e.nodeValue === n ||
                  (r !== null && !0 === r.suppressHydrationWarning) ||
                  jd(e.nodeValue, n)
                )),
                e || Ri(t, !0))
            } else ((e = Bd(e).createTextNode(r)), (e[ct] = t), (t.stateNode = e))
          }
          return (Nc(t), null)
        case 31:
          if (((n = t.memoizedState), e === null || e.memoizedState !== null)) {
            if (((r = Vi(t)), n !== null)) {
              if (e === null) {
                if (!r) throw Error(i(318))
                if (((e = t.memoizedState), (e = e === null ? null : e.dehydrated), !e))
                  throw Error(i(557))
                e[ct] = t
              } else (Hi(), !(t.flags & 128) && (t.memoizedState = null), (t.flags |= 4))
              ;(Nc(t), (e = !1))
            } else
              ((n = Ui()),
                e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = n),
                (e = !0))
            if (!e) return t.flags & 256 ? (lo(t), t) : (lo(t), null)
            if (t.flags & 128) throw Error(i(558))
          }
          return (Nc(t), null)
        case 13:
          if (
            ((r = t.memoizedState),
            e === null || (e.memoizedState !== null && e.memoizedState.dehydrated !== null))
          ) {
            if (((a = Vi(t)), r !== null && r.dehydrated !== null)) {
              if (e === null) {
                if (!a) throw Error(i(318))
                if (((a = t.memoizedState), (a = a === null ? null : a.dehydrated), !a))
                  throw Error(i(317))
                a[ct] = t
              } else (Hi(), !(t.flags & 128) && (t.memoizedState = null), (t.flags |= 4))
              ;(Nc(t), (a = !1))
            } else
              ((a = Ui()),
                e !== null && e.memoizedState !== null && (e.memoizedState.hydrationErrors = a),
                (a = !0))
            if (!a) return t.flags & 256 ? (lo(t), t) : (lo(t), null)
          }
          return (
            lo(t),
            t.flags & 128
              ? ((t.lanes = n), t)
              : ((n = r !== null),
                (e = e !== null && e.memoizedState !== null),
                n &&
                  ((r = t.child),
                  (a = null),
                  r.alternate !== null &&
                    r.alternate.memoizedState !== null &&
                    r.alternate.memoizedState.cachePool !== null &&
                    (a = r.alternate.memoizedState.cachePool.pool),
                  (o = null),
                  r.memoizedState !== null &&
                    r.memoizedState.cachePool !== null &&
                    (o = r.memoizedState.cachePool.pool),
                  o !== a && (r.flags |= 2048)),
                n !== e && n && (t.child.flags |= 8192),
                jc(t, t.updateQueue),
                Nc(t),
                null)
          )
        case 4:
          return (pe(), e === null && xd(t.stateNode.containerInfo), Nc(t), null)
        case 10:
          return (Yi(t.type), Nc(t), null)
        case 19:
          if ((N(uo), (r = t.memoizedState), r === null)) return (Nc(t), null)
          if (((a = !!(t.flags & 128)), (o = r.rendering), o === null)) {
            if (a) Mc(r, !1)
            else {
              if (Hl !== 0 || (e !== null && e.flags & 128))
                for (e = t.child; e !== null;) {
                  if (((o = fo(e)), o !== null)) {
                    for (
                      t.flags |= 128,
                        Mc(r, !1),
                        e = o.updateQueue,
                        t.updateQueue = e,
                        jc(t, e),
                        t.subtreeFlags = 0,
                        e = n,
                        n = t.child;
                      n !== null;
                    )
                      (fi(n, e), (n = n.sibling))
                    return (P(uo, (uo.current & 1) | 2), z && ki(t, r.treeForkCount), t.child)
                  }
                  e = e.sibling
                }
              r.tail !== null &&
                De() > $l &&
                ((t.flags |= 128), (a = !0), Mc(r, !1), (t.lanes = 4194304))
            }
          } else {
            if (!a) {
              if (((e = fo(o)), e !== null)) {
                if (
                  ((t.flags |= 128),
                  (a = !0),
                  (e = e.updateQueue),
                  (t.updateQueue = e),
                  jc(t, e),
                  Mc(r, !0),
                  r.tail === null && r.tailMode === `hidden` && !o.alternate && !z)
                )
                  return (Nc(t), null)
              } else
                2 * De() - r.renderingStartTime > $l &&
                  n !== 536870912 &&
                  ((t.flags |= 128), (a = !0), Mc(r, !1), (t.lanes = 4194304))
            }
            r.isBackwards
              ? ((o.sibling = t.child), (t.child = o))
              : ((e = r.last), e === null ? (t.child = o) : (e.sibling = o), (r.last = o))
          }
          return r.tail === null
            ? (Nc(t), null)
            : ((e = r.tail),
              (r.rendering = e),
              (r.tail = e.sibling),
              (r.renderingStartTime = De()),
              (e.sibling = null),
              (n = uo.current),
              P(uo, a ? (n & 1) | 2 : n & 1),
              z && ki(t, r.treeForkCount),
              e)
        case 22:
        case 23:
          return (
            lo(t),
            no(),
            (r = t.memoizedState !== null),
            e === null
              ? r && (t.flags |= 8192)
              : (e.memoizedState !== null) !== r && (t.flags |= 8192),
            r
              ? n & 536870912 &&
                !(t.flags & 128) &&
                (Nc(t), t.subtreeFlags & 6 && (t.flags |= 8192))
              : Nc(t),
            (n = t.updateQueue),
            n !== null && jc(t, n.retryQueue),
            (n = null),
            e !== null &&
              e.memoizedState !== null &&
              e.memoizedState.cachePool !== null &&
              (n = e.memoizedState.cachePool.pool),
            (r = null),
            t.memoizedState !== null &&
              t.memoizedState.cachePool !== null &&
              (r = t.memoizedState.cachePool.pool),
            r !== n && (t.flags |= 2048),
            e !== null && N(va),
            null
          )
        case 24:
          return (
            (n = null),
            e !== null && (n = e.memoizedState.cache),
            t.memoizedState.cache !== n && (t.flags |= 2048),
            Yi(sa),
            Nc(t),
            null
          )
        case 25:
          return null
        case 30:
          return null
      }
      throw Error(i(156, t.tag))
    }
    function Fc(e, t) {
      switch ((Mi(t), t.tag)) {
        case 1:
          return ((e = t.flags), e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null)
        case 3:
          return (
            Yi(sa),
            pe(),
            (e = t.flags),
            e & 65536 && !(e & 128) ? ((t.flags = (e & -65537) | 128), t) : null
          )
        case 26:
        case 27:
        case 5:
          return (I(t), null)
        case 31:
          if (t.memoizedState !== null) {
            if ((lo(t), t.alternate === null)) throw Error(i(340))
            Hi()
          }
          return ((e = t.flags), e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null)
        case 13:
          if ((lo(t), (e = t.memoizedState), e !== null && e.dehydrated !== null)) {
            if (t.alternate === null) throw Error(i(340))
            Hi()
          }
          return ((e = t.flags), e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null)
        case 19:
          return (N(uo), null)
        case 4:
          return (pe(), null)
        case 10:
          return (Yi(t.type), null)
        case 22:
        case 23:
          return (
            lo(t),
            no(),
            e !== null && N(va),
            (e = t.flags),
            e & 65536 ? ((t.flags = (e & -65537) | 128), t) : null
          )
        case 24:
          return (Yi(sa), null)
        case 25:
          return null
        default:
          return null
      }
    }
    function Ic(e, t) {
      switch ((Mi(t), t.tag)) {
        case 3:
          ;(Yi(sa), pe())
          break
        case 26:
        case 27:
        case 5:
          I(t)
          break
        case 4:
          pe()
          break
        case 31:
          t.memoizedState !== null && lo(t)
          break
        case 13:
          lo(t)
          break
        case 19:
          N(uo)
          break
        case 10:
          Yi(t.type)
          break
        case 22:
        case 23:
          ;(lo(t), no(), e !== null && N(va))
          break
        case 24:
          Yi(sa)
      }
    }
    function Lc(e, t) {
      try {
        var n = t.updateQueue,
          r = n === null ? null : n.lastEffect
        if (r !== null) {
          var i = r.next
          n = i
          do {
            if ((n.tag & e) === e) {
              r = void 0
              var a = n.create,
                o = n.inst
              ;((r = a()), (o.destroy = r))
            }
            n = n.next
          } while (n !== i)
        }
      } catch (e) {
        Uu(t, t.return, e)
      }
    }
    function Rc(e, t, n) {
      try {
        var r = t.updateQueue,
          i = r === null ? null : r.lastEffect
        if (i !== null) {
          var a = i.next
          r = a
          do {
            if ((r.tag & e) === e) {
              var o = r.inst,
                s = o.destroy
              if (s !== void 0) {
                ;((o.destroy = void 0), (i = t))
                var c = n,
                  l = s
                try {
                  l()
                } catch (e) {
                  Uu(i, c, e)
                }
              }
            }
            r = r.next
          } while (r !== a)
        }
      } catch (e) {
        Uu(t, t.return, e)
      }
    }
    function zc(e) {
      var t = e.updateQueue
      if (t !== null) {
        var n = e.stateNode
        try {
          Za(t, n)
        } catch (t) {
          Uu(e, e.return, t)
        }
      }
    }
    function Bc(e, t, n) {
      ;((n.props = Ws(e.type, e.memoizedProps)), (n.state = e.memoizedState))
      try {
        n.componentWillUnmount()
      } catch (n) {
        Uu(e, t, n)
      }
    }
    function Vc(e, t) {
      try {
        var n = e.ref
        if (n !== null) {
          switch (e.tag) {
            case 26:
            case 27:
            case 5:
              var r = e.stateNode
              break
            case 30:
              r = e.stateNode
              break
            default:
              r = e.stateNode
          }
          typeof n == `function` ? (e.refCleanup = n(r)) : (n.current = r)
        }
      } catch (n) {
        Uu(e, t, n)
      }
    }
    function Hc(e, t) {
      var n = e.ref,
        r = e.refCleanup
      if (n !== null) {
        if (typeof r == `function`)
          try {
            r()
          } catch (n) {
            Uu(e, t, n)
          } finally {
            ;((e.refCleanup = null), (e = e.alternate), e != null && (e.refCleanup = null))
          }
        else if (typeof n == `function`)
          try {
            n(null)
          } catch (n) {
            Uu(e, t, n)
          }
        else n.current = null
      }
    }
    function Uc(e) {
      var t = e.type,
        n = e.memoizedProps,
        r = e.stateNode
      try {
        a: switch (t) {
          case `button`:
          case `input`:
          case `select`:
          case `textarea`:
            n.autoFocus && r.focus()
            break a
          case `img`:
            n.src ? (r.src = n.src) : n.srcSet && (r.srcset = n.srcSet)
        }
      } catch (t) {
        Uu(e, e.return, t)
      }
    }
    function Wc(e, t, n) {
      try {
        var r = e.stateNode
        ;(Fd(r, e.type, n, t), (r[lt] = t))
      } catch (t) {
        Uu(e, e.return, t)
      }
    }
    function Gc(e) {
      return (
        e.tag === 5 || e.tag === 3 || e.tag === 26 || (e.tag === 27 && Zd(e.type)) || e.tag === 4
      )
    }
    function Kc(e) {
      a: for (;;) {
        for (; e.sibling === null;) {
          if (e.return === null || Gc(e.return)) return null
          e = e.return
        }
        for (
          e.sibling.return = e.return, e = e.sibling;
          e.tag !== 5 && e.tag !== 6 && e.tag !== 18;
        ) {
          if ((e.tag === 27 && Zd(e.type)) || e.flags & 2 || e.child === null || e.tag === 4)
            continue a
          ;((e.child.return = e), (e = e.child))
        }
        if (!(e.flags & 2)) return e.stateNode
      }
    }
    function qc(e, t, n) {
      var r = e.tag
      if (r === 5 || r === 6)
        ((e = e.stateNode),
          t
            ? (n.nodeType === 9
                ? n.body
                : n.nodeName === `HTML`
                  ? n.ownerDocument.body
                  : n
              ).insertBefore(e, t)
            : ((t = n.nodeType === 9 ? n.body : n.nodeName === `HTML` ? n.ownerDocument.body : n),
              t.appendChild(e),
              (n = n._reactRootContainer),
              n != null || t.onclick !== null || (t.onclick = tn)))
      else if (
        r !== 4 &&
        (r === 27 && Zd(e.type) && ((n = e.stateNode), (t = null)), (e = e.child), e !== null)
      )
        for (qc(e, t, n), e = e.sibling; e !== null;) (qc(e, t, n), (e = e.sibling))
    }
    function Jc(e, t, n) {
      var r = e.tag
      if (r === 5 || r === 6) ((e = e.stateNode), t ? n.insertBefore(e, t) : n.appendChild(e))
      else if (r !== 4 && (r === 27 && Zd(e.type) && (n = e.stateNode), (e = e.child), e !== null))
        for (Jc(e, t, n), e = e.sibling; e !== null;) (Jc(e, t, n), (e = e.sibling))
    }
    function Yc(e) {
      var t = e.stateNode,
        n = e.memoizedProps
      try {
        for (var r = e.type, i = t.attributes; i.length;) t.removeAttributeNode(i[0])
        ;(Pd(t, r, n), (t[ct] = e), (t[lt] = n))
      } catch (t) {
        Uu(e, e.return, t)
      }
    }
    var Xc = !1,
      Zc = !1,
      Qc = !1,
      $c = typeof WeakSet == `function` ? WeakSet : Set,
      el = null
    function tl(e, t) {
      if (((e = e.containerInfo), (Rd = sp), (e = Or(e)), kr(e))) {
        if (`selectionStart` in e) var n = { start: e.selectionStart, end: e.selectionEnd }
        else
          a: {
            n = ((n = e.ownerDocument) && n.defaultView) || window
            var r = n.getSelection && n.getSelection()
            if (r && r.rangeCount !== 0) {
              n = r.anchorNode
              var a = r.anchorOffset,
                o = r.focusNode
              r = r.focusOffset
              try {
                ;(n.nodeType, o.nodeType)
              } catch {
                n = null
                break a
              }
              var s = 0,
                c = -1,
                l = -1,
                u = 0,
                d = 0,
                f = e,
                p = null
              b: for (;;) {
                for (
                  var m;
                  f !== n || (a !== 0 && f.nodeType !== 3) || (c = s + a),
                    f !== o || (r !== 0 && f.nodeType !== 3) || (l = s + r),
                    f.nodeType === 3 && (s += f.nodeValue.length),
                    (m = f.firstChild) !== null;
                )
                  ((p = f), (f = m))
                for (;;) {
                  if (f === e) break b
                  if (
                    (p === n && ++u === a && (c = s),
                    p === o && ++d === r && (l = s),
                    (m = f.nextSibling) !== null)
                  )
                    break
                  ;((f = p), (p = f.parentNode))
                }
                f = m
              }
              n = c === -1 || l === -1 ? null : { start: c, end: l }
            } else n = null
          }
        n ||= { start: 0, end: 0 }
      } else n = null
      for (zd = { focusedElem: e, selectionRange: n }, sp = !1, el = t; el !== null;)
        if (((t = el), (e = t.child), t.subtreeFlags & 1028 && e !== null))
          ((e.return = t), (el = e))
        else
          for (; el !== null;) {
            switch (((t = el), (o = t.alternate), (e = t.flags), t.tag)) {
              case 0:
                if (e & 4 && ((e = t.updateQueue), (e = e === null ? null : e.events), e !== null))
                  for (n = 0; n < e.length; n++) ((a = e[n]), (a.ref.impl = a.nextImpl))
                break
              case 11:
              case 15:
                break
              case 1:
                if (e & 1024 && o !== null) {
                  ;((e = void 0),
                    (n = t),
                    (a = o.memoizedProps),
                    (o = o.memoizedState),
                    (r = n.stateNode))
                  try {
                    var h = Ws(n.type, a)
                    ;((e = r.getSnapshotBeforeUpdate(h, o)),
                      (r.__reactInternalSnapshotBeforeUpdate = e))
                  } catch (e) {
                    Uu(n, n.return, e)
                  }
                }
                break
              case 3:
                if (e & 1024) {
                  if (((e = t.stateNode.containerInfo), (n = e.nodeType), n === 9)) ef(e)
                  else if (n === 1)
                    switch (e.nodeName) {
                      case `HEAD`:
                      case `HTML`:
                      case `BODY`:
                        ef(e)
                        break
                      default:
                        e.textContent = ``
                    }
                }
                break
              case 5:
              case 26:
              case 27:
              case 6:
              case 4:
              case 17:
                break
              default:
                if (e & 1024) throw Error(i(163))
            }
            if (((e = t.sibling), e !== null)) {
              ;((e.return = t.return), (el = e))
              break
            }
            el = t.return
          }
    }
    function nl(e, t, n) {
      var r = n.flags
      switch (n.tag) {
        case 0:
        case 11:
        case 15:
          ;(_l(e, n), r & 4 && Lc(5, n))
          break
        case 1:
          if ((_l(e, n), r & 4)) {
            if (((e = n.stateNode), t === null))
              try {
                e.componentDidMount()
              } catch (e) {
                Uu(n, n.return, e)
              }
            else {
              var i = Ws(n.type, t.memoizedProps)
              t = t.memoizedState
              try {
                e.componentDidUpdate(i, t, e.__reactInternalSnapshotBeforeUpdate)
              } catch (e) {
                Uu(n, n.return, e)
              }
            }
          }
          ;(r & 64 && zc(n), r & 512 && Vc(n, n.return))
          break
        case 3:
          if ((_l(e, n), r & 64 && ((e = n.updateQueue), e !== null))) {
            if (((t = null), n.child !== null))
              switch (n.child.tag) {
                case 27:
                case 5:
                  t = n.child.stateNode
                  break
                case 1:
                  t = n.child.stateNode
              }
            try {
              Za(e, t)
            } catch (e) {
              Uu(n, n.return, e)
            }
          }
          break
        case 27:
          t === null && r & 4 && Yc(n)
        case 26:
        case 5:
          ;(_l(e, n), t === null && r & 4 && Uc(n), r & 512 && Vc(n, n.return))
          break
        case 12:
          _l(e, n)
          break
        case 31:
          ;(_l(e, n), r & 4 && cl(e, n))
          break
        case 13:
          ;(_l(e, n),
            r & 4 && ll(e, n),
            r & 64 &&
              ((e = n.memoizedState),
              e !== null && ((e = e.dehydrated), e !== null && ((n = qu.bind(null, n)), sf(e, n)))))
          break
        case 22:
          if (((r = n.memoizedState !== null || Xc), !r)) {
            ;((t = (t !== null && t.memoizedState !== null) || Zc), (i = Xc))
            var a = Zc
            ;((Xc = r),
              (Zc = t) && !a ? yl(e, n, !!(n.subtreeFlags & 8772)) : _l(e, n),
              (Xc = i),
              (Zc = a))
          }
          break
        case 30:
          break
        default:
          _l(e, n)
      }
    }
    function rl(e) {
      var t = e.alternate
      ;(t !== null && ((e.alternate = null), rl(t)),
        (e.child = null),
        (e.deletions = null),
        (e.sibling = null),
        e.tag === 5 && ((t = e.stateNode), t !== null && gt(t)),
        (e.stateNode = null),
        (e.return = null),
        (e.dependencies = null),
        (e.memoizedProps = null),
        (e.memoizedState = null),
        (e.pendingProps = null),
        (e.stateNode = null),
        (e.updateQueue = null))
    }
    var il = null,
      al = !1
    function ol(e, t, n) {
      for (n = n.child; n !== null;) (sl(e, t, n), (n = n.sibling))
    }
    function sl(e, t, n) {
      if (Le && typeof Le.onCommitFiberUnmount == `function`)
        try {
          Le.onCommitFiberUnmount(Ie, n)
        } catch {}
      switch (n.tag) {
        case 26:
          ;(Zc || Hc(n, t),
            ol(e, t, n),
            n.memoizedState
              ? n.memoizedState.count--
              : n.stateNode && ((n = n.stateNode), n.parentNode.removeChild(n)))
          break
        case 27:
          Zc || Hc(n, t)
          var r = il,
            i = al
          ;(Zd(n.type) && ((il = n.stateNode), (al = !1)),
            ol(e, t, n),
            pf(n.stateNode),
            (il = r),
            (al = i))
          break
        case 5:
          Zc || Hc(n, t)
        case 6:
          if (((r = il), (i = al), (il = null), ol(e, t, n), (il = r), (al = i), il !== null)) {
            if (al)
              try {
                ;(il.nodeType === 9
                  ? il.body
                  : il.nodeName === `HTML`
                    ? il.ownerDocument.body
                    : il
                ).removeChild(n.stateNode)
              } catch (e) {
                Uu(n, t, e)
              }
            else
              try {
                il.removeChild(n.stateNode)
              } catch (e) {
                Uu(n, t, e)
              }
          }
          break
        case 18:
          il !== null &&
            (al
              ? ((e = il),
                Qd(
                  e.nodeType === 9 ? e.body : e.nodeName === `HTML` ? e.ownerDocument.body : e,
                  n.stateNode,
                ),
                Np(e))
              : Qd(il, n.stateNode))
          break
        case 4:
          ;((r = il),
            (i = al),
            (il = n.stateNode.containerInfo),
            (al = !0),
            ol(e, t, n),
            (il = r),
            (al = i))
          break
        case 0:
        case 11:
        case 14:
        case 15:
          ;(Rc(2, n, t), Zc || Rc(4, n, t), ol(e, t, n))
          break
        case 1:
          ;(Zc ||
            (Hc(n, t),
            (r = n.stateNode),
            typeof r.componentWillUnmount == `function` && Bc(n, t, r)),
            ol(e, t, n))
          break
        case 21:
          ol(e, t, n)
          break
        case 22:
          ;((Zc = (r = Zc) || n.memoizedState !== null), ol(e, t, n), (Zc = r))
          break
        default:
          ol(e, t, n)
      }
    }
    function cl(e, t) {
      if (
        t.memoizedState === null &&
        ((e = t.alternate), e !== null && ((e = e.memoizedState), e !== null))
      ) {
        e = e.dehydrated
        try {
          Np(e)
        } catch (e) {
          Uu(t, t.return, e)
        }
      }
    }
    function ll(e, t) {
      if (
        t.memoizedState === null &&
        ((e = t.alternate),
        e !== null && ((e = e.memoizedState), e !== null && ((e = e.dehydrated), e !== null)))
      )
        try {
          Np(e)
        } catch (e) {
          Uu(t, t.return, e)
        }
    }
    function ul(e) {
      switch (e.tag) {
        case 31:
        case 13:
        case 19:
          var t = e.stateNode
          return (t === null && (t = e.stateNode = new $c()), t)
        case 22:
          return (
            (e = e.stateNode),
            (t = e._retryCache),
            t === null && (t = e._retryCache = new $c()),
            t
          )
        default:
          throw Error(i(435, e.tag))
      }
    }
    function dl(e, t) {
      var n = ul(e)
      t.forEach(function (t) {
        if (!n.has(t)) {
          n.add(t)
          var r = Ju.bind(null, e, t)
          t.then(r, r)
        }
      })
    }
    function fl(e, t) {
      var n = t.deletions
      if (n !== null)
        for (var r = 0; r < n.length; r++) {
          var a = n[r],
            o = e,
            s = t,
            c = s
          a: for (; c !== null;) {
            switch (c.tag) {
              case 27:
                if (Zd(c.type)) {
                  ;((il = c.stateNode), (al = !1))
                  break a
                }
                break
              case 5:
                ;((il = c.stateNode), (al = !1))
                break a
              case 3:
              case 4:
                ;((il = c.stateNode.containerInfo), (al = !0))
                break a
            }
            c = c.return
          }
          if (il === null) throw Error(i(160))
          ;(sl(o, s, a),
            (il = null),
            (al = !1),
            (o = a.alternate),
            o !== null && (o.return = null),
            (a.return = null))
        }
      if (t.subtreeFlags & 13886) for (t = t.child; t !== null;) (ml(t, e), (t = t.sibling))
    }
    var pl = null
    function ml(e, t) {
      var n = e.alternate,
        r = e.flags
      switch (e.tag) {
        case 0:
        case 11:
        case 14:
        case 15:
          ;(fl(t, e), hl(e), r & 4 && (Rc(3, e, e.return), Lc(3, e), Rc(5, e, e.return)))
          break
        case 1:
          ;(fl(t, e),
            hl(e),
            r & 512 && (Zc || n === null || Hc(n, n.return)),
            r & 64 &&
              Xc &&
              ((e = e.updateQueue),
              e !== null &&
                ((r = e.callbacks),
                r !== null &&
                  ((n = e.shared.hiddenCallbacks),
                  (e.shared.hiddenCallbacks = n === null ? r : n.concat(r))))))
          break
        case 26:
          var a = pl
          if ((fl(t, e), hl(e), r & 512 && (Zc || n === null || Hc(n, n.return)), r & 4)) {
            var o = n === null ? null : n.memoizedState
            if (((r = e.memoizedState), n === null)) {
              if (r === null) {
                if (e.stateNode === null) {
                  a: {
                    ;((r = e.type), (n = e.memoizedProps), (a = a.ownerDocument || a))
                    b: switch (r) {
                      case `title`:
                        ;((o = a.getElementsByTagName(`title`)[0]),
                          (!o ||
                            o[ht] ||
                            o[ct] ||
                            o.namespaceURI === `http://www.w3.org/2000/svg` ||
                            o.hasAttribute(`itemprop`)) &&
                            ((o = a.createElement(r)),
                            a.head.insertBefore(o, a.querySelector(`head > title`))),
                          Pd(o, r, n),
                          (o[ct] = e),
                          xt(o),
                          (r = o))
                        break a
                      case `link`:
                        var s = Vf(`link`, `href`, a).get(r + (n.href || ``))
                        if (s) {
                          for (var c = 0; c < s.length; c++)
                            if (
                              ((o = s[c]),
                              o.getAttribute(`href`) ===
                                (n.href == null || n.href === `` ? null : n.href) &&
                                o.getAttribute(`rel`) === (n.rel == null ? null : n.rel) &&
                                o.getAttribute(`title`) === (n.title == null ? null : n.title) &&
                                o.getAttribute(`crossorigin`) ===
                                  (n.crossOrigin == null ? null : n.crossOrigin))
                            ) {
                              s.splice(c, 1)
                              break b
                            }
                        }
                        ;((o = a.createElement(r)), Pd(o, r, n), a.head.appendChild(o))
                        break
                      case `meta`:
                        if ((s = Vf(`meta`, `content`, a).get(r + (n.content || ``)))) {
                          for (c = 0; c < s.length; c++)
                            if (
                              ((o = s[c]),
                              o.getAttribute(`content`) ===
                                (n.content == null ? null : `` + n.content) &&
                                o.getAttribute(`name`) === (n.name == null ? null : n.name) &&
                                o.getAttribute(`property`) ===
                                  (n.property == null ? null : n.property) &&
                                o.getAttribute(`http-equiv`) ===
                                  (n.httpEquiv == null ? null : n.httpEquiv) &&
                                o.getAttribute(`charset`) ===
                                  (n.charSet == null ? null : n.charSet))
                            ) {
                              s.splice(c, 1)
                              break b
                            }
                        }
                        ;((o = a.createElement(r)), Pd(o, r, n), a.head.appendChild(o))
                        break
                      default:
                        throw Error(i(468, r))
                    }
                    ;((o[ct] = e), xt(o), (r = o))
                  }
                  e.stateNode = r
                } else Hf(a, e.type, e.stateNode)
              } else e.stateNode = If(a, r, e.memoizedProps)
            } else
              o === r
                ? r === null && e.stateNode !== null && Wc(e, e.memoizedProps, n.memoizedProps)
                : (o === null
                    ? n.stateNode !== null && ((n = n.stateNode), n.parentNode.removeChild(n))
                    : o.count--,
                  r === null ? Hf(a, e.type, e.stateNode) : If(a, r, e.memoizedProps))
          }
          break
        case 27:
          ;(fl(t, e),
            hl(e),
            r & 512 && (Zc || n === null || Hc(n, n.return)),
            n !== null && r & 4 && Wc(e, e.memoizedProps, n.memoizedProps))
          break
        case 5:
          if ((fl(t, e), hl(e), r & 512 && (Zc || n === null || Hc(n, n.return)), e.flags & 32)) {
            a = e.stateNode
            try {
              qt(a, ``)
            } catch (t) {
              Uu(e, e.return, t)
            }
          }
          ;(r & 4 &&
            e.stateNode != null &&
            ((a = e.memoizedProps), Wc(e, a, n === null ? a : n.memoizedProps)),
            r & 1024 && (Qc = !0))
          break
        case 6:
          if ((fl(t, e), hl(e), r & 4)) {
            if (e.stateNode === null) throw Error(i(162))
            ;((r = e.memoizedProps), (n = e.stateNode))
            try {
              n.nodeValue = r
            } catch (t) {
              Uu(e, e.return, t)
            }
          }
          break
        case 3:
          if (
            ((Bf = null),
            (a = pl),
            (pl = gf(t.containerInfo)),
            fl(t, e),
            (pl = a),
            hl(e),
            r & 4 && n !== null && n.memoizedState.isDehydrated)
          )
            try {
              Np(t.containerInfo)
            } catch (t) {
              Uu(e, e.return, t)
            }
          Qc && ((Qc = !1), gl(e))
          break
        case 4:
          ;((r = pl), (pl = gf(e.stateNode.containerInfo)), fl(t, e), hl(e), (pl = r))
          break
        case 12:
          ;(fl(t, e), hl(e))
          break
        case 31:
          ;(fl(t, e),
            hl(e),
            r & 4 && ((r = e.updateQueue), r !== null && ((e.updateQueue = null), dl(e, r))))
          break
        case 13:
          ;(fl(t, e),
            hl(e),
            e.child.flags & 8192 &&
              (e.memoizedState !== null) != (n !== null && n.memoizedState !== null) &&
              (Zl = De()),
            r & 4 && ((r = e.updateQueue), r !== null && ((e.updateQueue = null), dl(e, r))))
          break
        case 22:
          a = e.memoizedState !== null
          var l = n !== null && n.memoizedState !== null,
            u = Xc,
            d = Zc
          if (((Xc = u || a), (Zc = d || l), fl(t, e), (Zc = d), (Xc = u), hl(e), r & 8192))
            a: for (
              t = e.stateNode,
                t._visibility = a ? t._visibility & -2 : t._visibility | 1,
                a && (n === null || l || Xc || Zc || vl(e)),
                n = null,
                t = e;
              ;
            ) {
              if (t.tag === 5 || t.tag === 26) {
                if (n === null) {
                  l = n = t
                  try {
                    if (((o = l.stateNode), a))
                      ((s = o.style),
                        typeof s.setProperty == `function`
                          ? s.setProperty(`display`, `none`, `important`)
                          : (s.display = `none`))
                    else {
                      c = l.stateNode
                      var f = l.memoizedProps.style,
                        p = f != null && f.hasOwnProperty(`display`) ? f.display : null
                      c.style.display = p == null || typeof p == `boolean` ? `` : (`` + p).trim()
                    }
                  } catch (e) {
                    Uu(l, l.return, e)
                  }
                }
              } else if (t.tag === 6) {
                if (n === null) {
                  l = t
                  try {
                    l.stateNode.nodeValue = a ? `` : l.memoizedProps
                  } catch (e) {
                    Uu(l, l.return, e)
                  }
                }
              } else if (t.tag === 18) {
                if (n === null) {
                  l = t
                  try {
                    var m = l.stateNode
                    a ? $d(m, !0) : $d(l.stateNode, !1)
                  } catch (e) {
                    Uu(l, l.return, e)
                  }
                }
              } else if (
                ((t.tag !== 22 && t.tag !== 23) || t.memoizedState === null || t === e) &&
                t.child !== null
              ) {
                ;((t.child.return = t), (t = t.child))
                continue
              }
              if (t === e) break a
              for (; t.sibling === null;) {
                if (t.return === null || t.return === e) break a
                ;(n === t && (n = null), (t = t.return))
              }
              ;(n === t && (n = null), (t.sibling.return = t.return), (t = t.sibling))
            }
          r & 4 &&
            ((r = e.updateQueue),
            r !== null && ((n = r.retryQueue), n !== null && ((r.retryQueue = null), dl(e, n))))
          break
        case 19:
          ;(fl(t, e),
            hl(e),
            r & 4 && ((r = e.updateQueue), r !== null && ((e.updateQueue = null), dl(e, r))))
          break
        case 30:
          break
        case 21:
          break
        default:
          ;(fl(t, e), hl(e))
      }
    }
    function hl(e) {
      var t = e.flags
      if (t & 2) {
        try {
          for (var n, r = e.return; r !== null;) {
            if (Gc(r)) {
              n = r
              break
            }
            r = r.return
          }
          if (n == null) throw Error(i(160))
          switch (n.tag) {
            case 27:
              var a = n.stateNode
              Jc(e, Kc(e), a)
              break
            case 5:
              var o = n.stateNode
              ;(n.flags & 32 && (qt(o, ``), (n.flags &= -33)), Jc(e, Kc(e), o))
              break
            case 3:
            case 4:
              var s = n.stateNode.containerInfo
              qc(e, Kc(e), s)
              break
            default:
              throw Error(i(161))
          }
        } catch (t) {
          Uu(e, e.return, t)
        }
        e.flags &= -3
      }
      t & 4096 && (e.flags &= -4097)
    }
    function gl(e) {
      if (e.subtreeFlags & 1024)
        for (e = e.child; e !== null;) {
          var t = e
          ;(gl(t), t.tag === 5 && t.flags & 1024 && t.stateNode.reset(), (e = e.sibling))
        }
    }
    function _l(e, t) {
      if (t.subtreeFlags & 8772)
        for (t = t.child; t !== null;) (nl(e, t.alternate, t), (t = t.sibling))
    }
    function vl(e) {
      for (e = e.child; e !== null;) {
        var t = e
        switch (t.tag) {
          case 0:
          case 11:
          case 14:
          case 15:
            ;(Rc(4, t, t.return), vl(t))
            break
          case 1:
            Hc(t, t.return)
            var n = t.stateNode
            ;(typeof n.componentWillUnmount == `function` && Bc(t, t.return, n), vl(t))
            break
          case 27:
            pf(t.stateNode)
          case 26:
          case 5:
            ;(Hc(t, t.return), vl(t))
            break
          case 22:
            t.memoizedState === null && vl(t)
            break
          case 30:
            vl(t)
            break
          default:
            vl(t)
        }
        e = e.sibling
      }
    }
    function yl(e, t, n) {
      for (n &&= !!(t.subtreeFlags & 8772), t = t.child; t !== null;) {
        var r = t.alternate,
          i = e,
          a = t,
          o = a.flags
        switch (a.tag) {
          case 0:
          case 11:
          case 15:
            ;(yl(i, a, n), Lc(4, a))
            break
          case 1:
            if ((yl(i, a, n), (r = a), (i = r.stateNode), typeof i.componentDidMount == `function`))
              try {
                i.componentDidMount()
              } catch (e) {
                Uu(r, r.return, e)
              }
            if (((r = a), (i = r.updateQueue), i !== null)) {
              var s = r.stateNode
              try {
                var c = i.shared.hiddenCallbacks
                if (c !== null)
                  for (i.shared.hiddenCallbacks = null, i = 0; i < c.length; i++) Xa(c[i], s)
              } catch (e) {
                Uu(r, r.return, e)
              }
            }
            ;(n && o & 64 && zc(a), Vc(a, a.return))
            break
          case 27:
            Yc(a)
          case 26:
          case 5:
            ;(yl(i, a, n), n && r === null && o & 4 && Uc(a), Vc(a, a.return))
            break
          case 12:
            yl(i, a, n)
            break
          case 31:
            ;(yl(i, a, n), n && o & 4 && cl(i, a))
            break
          case 13:
            ;(yl(i, a, n), n && o & 4 && ll(i, a))
            break
          case 22:
            ;(a.memoizedState === null && yl(i, a, n), Vc(a, a.return))
            break
          case 30:
            break
          default:
            yl(i, a, n)
        }
        t = t.sibling
      }
    }
    function bl(e, t) {
      var n = null
      ;(e !== null &&
        e.memoizedState !== null &&
        e.memoizedState.cachePool !== null &&
        (n = e.memoizedState.cachePool.pool),
        (e = null),
        t.memoizedState !== null &&
          t.memoizedState.cachePool !== null &&
          (e = t.memoizedState.cachePool.pool),
        e !== n && (e != null && e.refCount++, n != null && la(n)))
    }
    function xl(e, t) {
      ;((e = null),
        t.alternate !== null && (e = t.alternate.memoizedState.cache),
        (t = t.memoizedState.cache),
        t !== e && (t.refCount++, e != null && la(e)))
    }
    function Sl(e, t, n, r) {
      if (t.subtreeFlags & 10256) for (t = t.child; t !== null;) (Cl(e, t, n, r), (t = t.sibling))
    }
    function Cl(e, t, n, r) {
      var i = t.flags
      switch (t.tag) {
        case 0:
        case 11:
        case 15:
          ;(Sl(e, t, n, r), i & 2048 && Lc(9, t))
          break
        case 1:
          Sl(e, t, n, r)
          break
        case 3:
          ;(Sl(e, t, n, r),
            i & 2048 &&
              ((e = null),
              t.alternate !== null && (e = t.alternate.memoizedState.cache),
              (t = t.memoizedState.cache),
              t !== e && (t.refCount++, e != null && la(e))))
          break
        case 12:
          if (i & 2048) {
            ;(Sl(e, t, n, r), (e = t.stateNode))
            try {
              var a = t.memoizedProps,
                o = a.id,
                s = a.onPostCommit
              typeof s == `function` &&
                s(o, t.alternate === null ? `mount` : `update`, e.passiveEffectDuration, -0)
            } catch (e) {
              Uu(t, t.return, e)
            }
          } else Sl(e, t, n, r)
          break
        case 31:
          Sl(e, t, n, r)
          break
        case 13:
          Sl(e, t, n, r)
          break
        case 23:
          break
        case 22:
          ;((a = t.stateNode),
            (o = t.alternate),
            t.memoizedState === null
              ? a._visibility & 2
                ? Sl(e, t, n, r)
                : ((a._visibility |= 2), wl(e, t, n, r, !!(t.subtreeFlags & 10256) || !1))
              : a._visibility & 2
                ? Sl(e, t, n, r)
                : Tl(e, t),
            i & 2048 && bl(o, t))
          break
        case 24:
          ;(Sl(e, t, n, r), i & 2048 && xl(t.alternate, t))
          break
        default:
          Sl(e, t, n, r)
      }
    }
    function wl(e, t, n, r, i) {
      for (i &&= !!(t.subtreeFlags & 10256) || !1, t = t.child; t !== null;) {
        var a = e,
          o = t,
          s = n,
          c = r,
          l = o.flags
        switch (o.tag) {
          case 0:
          case 11:
          case 15:
            ;(wl(a, o, s, c, i), Lc(8, o))
            break
          case 23:
            break
          case 22:
            var u = o.stateNode
            ;(o.memoizedState === null
              ? ((u._visibility |= 2), wl(a, o, s, c, i))
              : u._visibility & 2
                ? wl(a, o, s, c, i)
                : Tl(a, o),
              i && l & 2048 && bl(o.alternate, o))
            break
          case 24:
            ;(wl(a, o, s, c, i), i && l & 2048 && xl(o.alternate, o))
            break
          default:
            wl(a, o, s, c, i)
        }
        t = t.sibling
      }
    }
    function Tl(e, t) {
      if (t.subtreeFlags & 10256)
        for (t = t.child; t !== null;) {
          var n = e,
            r = t,
            i = r.flags
          switch (r.tag) {
            case 22:
              ;(Tl(n, r), i & 2048 && bl(r.alternate, r))
              break
            case 24:
              ;(Tl(n, r), i & 2048 && xl(r.alternate, r))
              break
            default:
              Tl(n, r)
          }
          t = t.sibling
        }
    }
    var El = 8192
    function Dl(e, t, n) {
      if (e.subtreeFlags & El) for (e = e.child; e !== null;) (Ol(e, t, n), (e = e.sibling))
    }
    function Ol(e, t, n) {
      switch (e.tag) {
        case 26:
          ;(Dl(e, t, n),
            e.flags & El && e.memoizedState !== null && Gf(n, pl, e.memoizedState, e.memoizedProps))
          break
        case 5:
          Dl(e, t, n)
          break
        case 3:
        case 4:
          var r = pl
          ;((pl = gf(e.stateNode.containerInfo)), Dl(e, t, n), (pl = r))
          break
        case 22:
          e.memoizedState === null &&
            ((r = e.alternate),
            r !== null && r.memoizedState !== null
              ? ((r = El), (El = 16777216), Dl(e, t, n), (El = r))
              : Dl(e, t, n))
          break
        default:
          Dl(e, t, n)
      }
    }
    function kl(e) {
      var t = e.alternate
      if (t !== null && ((e = t.child), e !== null)) {
        t.child = null
        do ((t = e.sibling), (e.sibling = null), (e = t))
        while (e !== null)
      }
    }
    function Al(e) {
      var t = e.deletions
      if (e.flags & 16) {
        if (t !== null)
          for (var n = 0; n < t.length; n++) {
            var r = t[n]
            ;((el = r), Nl(r, e))
          }
        kl(e)
      }
      if (e.subtreeFlags & 10256) for (e = e.child; e !== null;) (jl(e), (e = e.sibling))
    }
    function jl(e) {
      switch (e.tag) {
        case 0:
        case 11:
        case 15:
          ;(Al(e), e.flags & 2048 && Rc(9, e, e.return))
          break
        case 3:
          Al(e)
          break
        case 12:
          Al(e)
          break
        case 22:
          var t = e.stateNode
          e.memoizedState !== null &&
          t._visibility & 2 &&
          (e.return === null || e.return.tag !== 13)
            ? ((t._visibility &= -3), Ml(e))
            : Al(e)
          break
        default:
          Al(e)
      }
    }
    function Ml(e) {
      var t = e.deletions
      if (e.flags & 16) {
        if (t !== null)
          for (var n = 0; n < t.length; n++) {
            var r = t[n]
            ;((el = r), Nl(r, e))
          }
        kl(e)
      }
      for (e = e.child; e !== null;) {
        switch (((t = e), t.tag)) {
          case 0:
          case 11:
          case 15:
            ;(Rc(8, t, t.return), Ml(t))
            break
          case 22:
            ;((n = t.stateNode), n._visibility & 2 && ((n._visibility &= -3), Ml(t)))
            break
          default:
            Ml(t)
        }
        e = e.sibling
      }
    }
    function Nl(e, t) {
      for (; el !== null;) {
        var n = el
        switch (n.tag) {
          case 0:
          case 11:
          case 15:
            Rc(8, n, t)
            break
          case 23:
          case 22:
            if (n.memoizedState !== null && n.memoizedState.cachePool !== null) {
              var r = n.memoizedState.cachePool.pool
              r != null && r.refCount++
            }
            break
          case 24:
            la(n.memoizedState.cache)
        }
        if (((r = n.child), r !== null)) ((r.return = n), (el = r))
        else
          a: for (n = e; el !== null;) {
            r = el
            var i = r.sibling,
              a = r.return
            if ((rl(r), r === n)) {
              el = null
              break a
            }
            if (i !== null) {
              ;((i.return = a), (el = i))
              break a
            }
            el = a
          }
      }
    }
    var Pl = {
        getCacheForType: function (e) {
          var t = ta(sa),
            n = t.data.get(e)
          return (n === void 0 && ((n = e()), t.data.set(e, n)), n)
        },
        cacheSignal: function () {
          return ta(sa).controller.signal
        },
      },
      Fl = typeof WeakMap == `function` ? WeakMap : Map,
      Y = 0,
      Il = null,
      X = null,
      Z = 0,
      Q = 0,
      Ll = null,
      Rl = !1,
      zl = !1,
      Bl = !1,
      Vl = 0,
      Hl = 0,
      Ul = 0,
      Wl = 0,
      Gl = 0,
      Kl = 0,
      ql = 0,
      Jl = null,
      Yl = null,
      Xl = !1,
      Zl = 0,
      Ql = 0,
      $l = 1 / 0,
      eu = null,
      tu = null,
      nu = 0,
      ru = null,
      iu = null,
      au = 0,
      ou = 0,
      su = null,
      cu = null,
      lu = 0,
      uu = null
    function du() {
      return Y & 2 && Z !== 0 ? Z & -Z : A.T === null ? at() : ud()
    }
    function fu() {
      if (Kl === 0) {
        if (!(Z & 536870912) || z) {
          var e = We
          ;((We <<= 1), !(We & 3932160) && (We = 262144), (Kl = e))
        } else Kl = 536870912
      }
      return ((e = ro.current), e !== null && (e.flags |= 32), Kl)
    }
    function pu(e, t, n) {
      ;(((e === Il && (Q === 2 || Q === 9)) || e.cancelPendingCommit !== null) &&
        (bu(e, 0), _u(e, Z, Kl, !1)),
        Qe(e, n),
        (!(Y & 2) || e !== Il) &&
          (e === Il && (!(Y & 2) && (Wl |= n), Hl === 4 && _u(e, Z, Kl, !1)), nd(e)))
    }
    function mu(e, t, n) {
      if (Y & 6) throw Error(i(327))
      var r = (!n && !(t & 127) && (t & e.expiredLanes) === 0) || Je(e, t),
        a = r ? Ou(e, t) : Eu(e, t, !0),
        o = r
      do {
        if (a === 0) {
          zl && !r && _u(e, t, 0, !1)
          break
        }
        if (((n = e.current.alternate), o && !gu(n))) {
          ;((a = Eu(e, t, !1)), (o = !1))
          continue
        }
        if (a === 2) {
          if (((o = t), e.errorRecoveryDisabledLanes & o)) var s = 0
          else
            ((s = e.pendingLanes & -536870913), (s = s === 0 ? (s & 536870912 ? 536870912 : 0) : s))
          if (s !== 0) {
            t = s
            a: {
              var c = e
              a = Jl
              var l = c.current.memoizedState.isDehydrated
              if ((l && (bu(c, s).flags |= 256), (s = Eu(c, s, !1)), s !== 2)) {
                if (Bl && !l) {
                  ;((c.errorRecoveryDisabledLanes |= o), (Wl |= o), (a = 4))
                  break a
                }
                ;((o = Yl), (Yl = a), o !== null && (Yl === null ? (Yl = o) : Yl.push.apply(Yl, o)))
              }
              a = s
            }
            if (((o = !1), a !== 2)) continue
          }
        }
        if (a === 1) {
          ;(bu(e, 0), _u(e, t, 0, !0))
          break
        }
        a: {
          switch (((r = e), (o = a), o)) {
            case 0:
            case 1:
              throw Error(i(345))
            case 4:
              if ((t & 4194048) !== t) break
            case 6:
              _u(r, t, Kl, !Rl)
              break a
            case 2:
              Yl = null
              break
            case 3:
            case 5:
              break
            default:
              throw Error(i(329))
          }
          if ((t & 62914560) === t && ((a = Zl + 300 - De()), 10 < a)) {
            if ((_u(r, t, Kl, !Rl), qe(r, 0, !0) !== 0)) break a
            ;((au = t),
              (r.timeoutHandle = Kd(
                hu.bind(null, r, n, Yl, eu, Xl, t, Kl, Wl, ql, Rl, o, `Throttled`, -0, 0),
                a,
              )))
            break a
          }
          hu(r, n, Yl, eu, Xl, t, Kl, Wl, ql, Rl, o, null, -0, 0)
        }
        break
      } while (1)
      nd(e)
    }
    function hu(e, t, n, r, i, a, o, s, c, l, u, d, f, p) {
      if (((e.timeoutHandle = -1), (d = t.subtreeFlags), d & 8192 || (d & 16785408) == 16785408)) {
        ;((d = {
          stylesheets: null,
          count: 0,
          imgCount: 0,
          imgBytes: 0,
          suspenseyImages: [],
          waitingForImages: !0,
          waitingForViewTransition: !1,
          unsuspend: tn,
        }),
          Ol(t, a, d))
        var m = (a & 62914560) === a ? Zl - De() : (a & 4194048) === a ? Ql - De() : 0
        if (((m = qf(d, m)), m !== null)) {
          ;((au = a),
            (e.cancelPendingCommit = m(Fu.bind(null, e, t, a, n, r, i, o, s, c, u, d, null, f, p))),
            _u(e, a, o, !l))
          return
        }
      }
      Fu(e, t, a, n, r, i, o, s, c)
    }
    function gu(e) {
      for (var t = e; ;) {
        var n = t.tag
        if (
          (n === 0 || n === 11 || n === 15) &&
          t.flags & 16384 &&
          ((n = t.updateQueue), n !== null && ((n = n.stores), n !== null))
        )
          for (var r = 0; r < n.length; r++) {
            var i = n[r],
              a = i.getSnapshot
            i = i.value
            try {
              if (!Cr(a(), i)) return !1
            } catch {
              return !1
            }
          }
        if (((n = t.child), t.subtreeFlags & 16384 && n !== null)) ((n.return = t), (t = n))
        else {
          if (t === e) break
          for (; t.sibling === null;) {
            if (t.return === null || t.return === e) return !0
            t = t.return
          }
          ;((t.sibling.return = t.return), (t = t.sibling))
        }
      }
      return !0
    }
    function _u(e, t, n, r) {
      ;((t &= ~Gl),
        (t &= ~Wl),
        (e.suspendedLanes |= t),
        (e.pingedLanes &= ~t),
        r && (e.warmLanes |= t),
        (r = e.expirationTimes))
      for (var i = t; 0 < i;) {
        var a = 31 - ze(i),
          o = 1 << a
        ;((r[a] = -1), (i &= ~o))
      }
      n !== 0 && et(e, n, t)
    }
    function vu() {
      return Y & 6 ? !0 : (rd(0, !1), !1)
    }
    function yu() {
      if (X !== null) {
        if (Q === 0) var e = X.return
        else ((e = X), (qi = Ki = null), Ao(e), (Ma = null), (Na = 0), (e = X))
        for (; e !== null;) (Ic(e.alternate, e), (e = e.return))
        X = null
      }
    }
    function bu(e, t) {
      var n = e.timeoutHandle
      ;(n !== -1 && ((e.timeoutHandle = -1), qd(n)),
        (n = e.cancelPendingCommit),
        n !== null && ((e.cancelPendingCommit = null), n()),
        (au = 0),
        yu(),
        (Il = e),
        (X = n = di(e.current, null)),
        (Z = t),
        (Q = 0),
        (Ll = null),
        (Rl = !1),
        (zl = Je(e, t)),
        (Bl = !1),
        (ql = Kl = Gl = Wl = Ul = Hl = 0),
        (Yl = Jl = null),
        (Xl = !1),
        t & 8 && (t |= t & 32))
      var r = e.entangledLanes
      if (r !== 0)
        for (e = e.entanglements, r &= t; 0 < r;) {
          var i = 31 - ze(r),
            a = 1 << i
          ;((t |= e[i]), (r &= ~a))
        }
      return ((Vl = t), ti(), n)
    }
    function xu(e, t) {
      ;((B = null),
        (A.H = Is),
        t === Sa || t === wa
          ? ((t = Aa()), (Q = 3))
          : t === Ca
            ? ((t = Aa()), (Q = 4))
            : (Q = t === $s ? 8 : typeof t == `object` && t && typeof t.then == `function` ? 6 : 1),
        (Ll = t),
        X === null && ((Hl = 1), K(e, yi(t, e.current))))
    }
    function Su() {
      var e = ro.current
      return e === null
        ? !0
        : (Z & 4194048) === Z
          ? io === null
          : (Z & 62914560) === Z || Z & 536870912
            ? e === io
            : !1
    }
    function Cu() {
      var e = A.H
      return ((A.H = Is), e === null ? Is : e)
    }
    function wu() {
      var e = A.A
      return ((A.A = Pl), e)
    }
    function Tu() {
      ;((Hl = 4),
        Rl || ((Z & 4194048) !== Z && ro.current !== null) || (zl = !0),
        (!(Ul & 134217727) && !(Wl & 134217727)) || Il === null || _u(Il, Z, Kl, !1))
    }
    function Eu(e, t, n) {
      var r = Y
      Y |= 2
      var i = Cu(),
        a = wu()
      ;((Il !== e || Z !== t) && ((eu = null), bu(e, t)), (t = !1))
      var o = Hl
      a: do
        try {
          if (Q !== 0 && X !== null) {
            var s = X,
              c = Ll
            switch (Q) {
              case 8:
                ;(yu(), (o = 6))
                break a
              case 3:
              case 2:
              case 9:
              case 6:
                ro.current === null && (t = !0)
                var l = Q
                if (((Q = 0), (Ll = null), Mu(e, s, c, l), n && zl)) {
                  o = 0
                  break a
                }
                break
              default:
                ;((l = Q), (Q = 0), (Ll = null), Mu(e, s, c, l))
            }
          }
          ;(Du(), (o = Hl))
          break
        } catch (t) {
          xu(e, t)
        }
      while (1)
      return (
        t && e.shellSuspendCounter++,
        (qi = Ki = null),
        (Y = r),
        (A.H = i),
        (A.A = a),
        X === null && ((Il = null), (Z = 0), ti()),
        o
      )
    }
    function Du() {
      for (; X !== null;) Au(X)
    }
    function Ou(e, t) {
      var n = Y
      Y |= 2
      var r = Cu(),
        a = wu()
      Il !== e || Z !== t ? ((eu = null), ($l = De() + 500), bu(e, t)) : (zl = Je(e, t))
      a: do
        try {
          if (Q !== 0 && X !== null) {
            t = X
            var o = Ll
            b: switch (Q) {
              case 1:
                ;((Q = 0), (Ll = null), Mu(e, t, o, 1))
                break
              case 2:
              case 9:
                if (Ea(o)) {
                  ;((Q = 0), (Ll = null), ju(t))
                  break
                }
                ;((t = function () {
                  ;((Q !== 2 && Q !== 9) || Il !== e || (Q = 7), nd(e))
                }),
                  o.then(t, t))
                break a
              case 3:
                Q = 7
                break a
              case 4:
                Q = 5
                break a
              case 7:
                Ea(o) ? ((Q = 0), (Ll = null), ju(t)) : ((Q = 0), (Ll = null), Mu(e, t, o, 7))
                break
              case 5:
                var s = null
                switch (X.tag) {
                  case 26:
                    s = X.memoizedState
                  case 5:
                  case 27:
                    var c = X
                    if (s ? Wf(s) : c.stateNode.complete) {
                      ;((Q = 0), (Ll = null))
                      var l = c.sibling
                      if (l !== null) X = l
                      else {
                        var u = c.return
                        u === null ? (X = null) : ((X = u), Nu(u))
                      }
                      break b
                    }
                }
                ;((Q = 0), (Ll = null), Mu(e, t, o, 5))
                break
              case 6:
                ;((Q = 0), (Ll = null), Mu(e, t, o, 6))
                break
              case 8:
                ;(yu(), (Hl = 6))
                break a
              default:
                throw Error(i(462))
            }
          }
          ku()
          break
        } catch (t) {
          xu(e, t)
        }
      while (1)
      return (
        (qi = Ki = null),
        (A.H = r),
        (A.A = a),
        (Y = n),
        X === null ? ((Il = null), (Z = 0), ti(), Hl) : 0
      )
    }
    function ku() {
      for (; X !== null && !Te();) Au(X)
    }
    function Au(e) {
      var t = Dc(e.alternate, e, Vl)
      ;((e.memoizedProps = e.pendingProps), t === null ? Nu(e) : (X = t))
    }
    function ju(e) {
      var t = e,
        n = t.alternate
      switch (t.tag) {
        case 15:
        case 0:
          t = dc(n, t, t.pendingProps, t.type, void 0, Z)
          break
        case 11:
          t = dc(n, t, t.pendingProps, t.type.render, t.ref, Z)
          break
        case 5:
          Ao(t)
        default:
          ;(Ic(n, t), (t = X = fi(t, Vl)), (t = Dc(n, t, Vl)))
      }
      ;((e.memoizedProps = e.pendingProps), t === null ? Nu(e) : (X = t))
    }
    function Mu(e, t, n, r) {
      ;((qi = Ki = null), Ao(t), (Ma = null), (Na = 0))
      var i = t.return
      try {
        if (Qs(e, i, t, n, Z)) {
          ;((Hl = 1), K(e, yi(n, e.current)), (X = null))
          return
        }
      } catch (t) {
        if (i !== null) throw ((X = i), t)
        ;((Hl = 1), K(e, yi(n, e.current)), (X = null))
        return
      }
      t.flags & 32768
        ? (z || r === 1
            ? (e = !0)
            : zl || Z & 536870912
              ? (e = !1)
              : ((Rl = e = !0),
                (r === 2 || r === 9 || r === 3 || r === 6) &&
                  ((r = ro.current), r !== null && r.tag === 13 && (r.flags |= 16384))),
          Pu(t, e))
        : Nu(t)
    }
    function Nu(e) {
      var t = e
      do {
        if (t.flags & 32768) {
          Pu(t, Rl)
          return
        }
        e = t.return
        var n = Pc(t.alternate, t, Vl)
        if (n !== null) {
          X = n
          return
        }
        if (((t = t.sibling), t !== null)) {
          X = t
          return
        }
        X = t = e
      } while (t !== null)
      Hl === 0 && (Hl = 5)
    }
    function Pu(e, t) {
      do {
        var n = Fc(e.alternate, e)
        if (n !== null) {
          ;((n.flags &= 32767), (X = n))
          return
        }
        if (
          ((n = e.return),
          n !== null && ((n.flags |= 32768), (n.subtreeFlags = 0), (n.deletions = null)),
          !t && ((e = e.sibling), e !== null))
        ) {
          X = e
          return
        }
        X = e = n
      } while (e !== null)
      ;((Hl = 6), (X = null))
    }
    function Fu(e, t, n, r, a, o, s, c, l) {
      e.cancelPendingCommit = null
      do Bu()
      while (nu !== 0)
      if (Y & 6) throw Error(i(327))
      if (t !== null) {
        if (t === e.current) throw Error(i(177))
        if (
          ((o = t.lanes | t.childLanes),
          (o |= ei),
          $e(e, n, o, s, c, l),
          e === Il && ((X = Il = null), (Z = 0)),
          (iu = t),
          (ru = e),
          (au = n),
          (ou = o),
          (su = a),
          (cu = r),
          t.subtreeFlags & 10256 || t.flags & 10256
            ? ((e.callbackNode = null),
              (e.callbackPriority = 0),
              Yu(je, function () {
                return (Vu(), null)
              }))
            : ((e.callbackNode = null), (e.callbackPriority = 0)),
          (r = !!(t.flags & 13878)),
          t.subtreeFlags & 13878 || r)
        ) {
          ;((r = A.T), (A.T = null), (a = j.p), (j.p = 2), (s = Y), (Y |= 4))
          try {
            tl(e, t, n)
          } finally {
            ;((Y = s), (j.p = a), (A.T = r))
          }
        }
        ;((nu = 1), Iu(), Lu(), Ru())
      }
    }
    function Iu() {
      if (nu === 1) {
        nu = 0
        var e = ru,
          t = iu,
          n = !!(t.flags & 13878)
        if (t.subtreeFlags & 13878 || n) {
          ;((n = A.T), (A.T = null))
          var r = j.p
          j.p = 2
          var i = Y
          Y |= 4
          try {
            ml(t, e)
            var a = zd,
              o = Or(e.containerInfo),
              s = a.focusedElem,
              c = a.selectionRange
            if (o !== s && s && s.ownerDocument && Dr(s.ownerDocument.documentElement, s)) {
              if (c !== null && kr(s)) {
                var l = c.start,
                  u = c.end
                if ((u === void 0 && (u = l), `selectionStart` in s))
                  ((s.selectionStart = l), (s.selectionEnd = Math.min(u, s.value.length)))
                else {
                  var d = s.ownerDocument || document,
                    f = (d && d.defaultView) || window
                  if (f.getSelection) {
                    var p = f.getSelection(),
                      m = s.textContent.length,
                      h = Math.min(c.start, m),
                      g = c.end === void 0 ? h : Math.min(c.end, m)
                    !p.extend && h > g && ((o = g), (g = h), (h = o))
                    var _ = Er(s, h),
                      v = Er(s, g)
                    if (
                      _ &&
                      v &&
                      (p.rangeCount !== 1 ||
                        p.anchorNode !== _.node ||
                        p.anchorOffset !== _.offset ||
                        p.focusNode !== v.node ||
                        p.focusOffset !== v.offset)
                    ) {
                      var y = d.createRange()
                      ;(y.setStart(_.node, _.offset),
                        p.removeAllRanges(),
                        h > g
                          ? (p.addRange(y), p.extend(v.node, v.offset))
                          : (y.setEnd(v.node, v.offset), p.addRange(y)))
                    }
                  }
                }
              }
              for (d = [], p = s; (p = p.parentNode);)
                p.nodeType === 1 && d.push({ element: p, left: p.scrollLeft, top: p.scrollTop })
              for (typeof s.focus == `function` && s.focus(), s = 0; s < d.length; s++) {
                var b = d[s]
                ;((b.element.scrollLeft = b.left), (b.element.scrollTop = b.top))
              }
            }
            ;((sp = !!Rd), (zd = Rd = null))
          } finally {
            ;((Y = i), (j.p = r), (A.T = n))
          }
        }
        ;((e.current = t), (nu = 2))
      }
    }
    function Lu() {
      if (nu === 2) {
        nu = 0
        var e = ru,
          t = iu,
          n = !!(t.flags & 8772)
        if (t.subtreeFlags & 8772 || n) {
          ;((n = A.T), (A.T = null))
          var r = j.p
          j.p = 2
          var i = Y
          Y |= 4
          try {
            nl(e, t.alternate, t)
          } finally {
            ;((Y = i), (j.p = r), (A.T = n))
          }
        }
        nu = 3
      }
    }
    function Ru() {
      if (nu === 4 || nu === 3) {
        ;((nu = 0), Ee())
        var e = ru,
          t = iu,
          n = au,
          r = cu
        t.subtreeFlags & 10256 || t.flags & 10256
          ? (nu = 5)
          : ((nu = 0), (iu = ru = null), zu(e, e.pendingLanes))
        var i = e.pendingLanes
        if (
          (i === 0 && (tu = null),
          it(n),
          (t = t.stateNode),
          Le && typeof Le.onCommitFiberRoot == `function`)
        )
          try {
            Le.onCommitFiberRoot(Ie, t, void 0, (t.current.flags & 128) == 128)
          } catch {}
        if (r !== null) {
          ;((t = A.T), (i = j.p), (j.p = 2), (A.T = null))
          try {
            for (var a = e.onRecoverableError, o = 0; o < r.length; o++) {
              var s = r[o]
              a(s.value, { componentStack: s.stack })
            }
          } finally {
            ;((A.T = t), (j.p = i))
          }
        }
        ;(au & 3 && Bu(),
          nd(e),
          (i = e.pendingLanes),
          n & 261930 && i & 42 ? (e === uu ? lu++ : ((lu = 0), (uu = e))) : (lu = 0),
          rd(0, !1))
      }
    }
    function zu(e, t) {
      ;(e.pooledCacheLanes &= t) === 0 &&
        ((t = e.pooledCache), t != null && ((e.pooledCache = null), la(t)))
    }
    function Bu() {
      return (Iu(), Lu(), Ru(), Vu())
    }
    function Vu() {
      if (nu !== 5) return !1
      var e = ru,
        t = ou
      ou = 0
      var n = it(au),
        r = A.T,
        a = j.p
      try {
        ;((j.p = 32 > n ? 32 : n), (A.T = null), (n = su), (su = null))
        var o = ru,
          s = au
        if (((nu = 0), (iu = ru = null), (au = 0), Y & 6)) throw Error(i(331))
        var c = Y
        if (
          ((Y |= 4),
          jl(o.current),
          Cl(o, o.current, s, n),
          (Y = c),
          rd(0, !1),
          Le && typeof Le.onPostCommitFiberRoot == `function`)
        )
          try {
            Le.onPostCommitFiberRoot(Ie, o)
          } catch {}
        return !0
      } finally {
        ;((j.p = a), (A.T = r), zu(e, t))
      }
    }
    function Hu(e, t, n) {
      ;((t = yi(n, t)),
        (t = Ys(e.stateNode, t, 2)),
        (e = Wa(e, t, 2)),
        e !== null && (Qe(e, 2), nd(e)))
    }
    function Uu(e, t, n) {
      if (e.tag === 3) Hu(e, e, n)
      else
        for (; t !== null;) {
          if (t.tag === 3) {
            Hu(t, e, n)
            break
          }
          if (t.tag === 1) {
            var r = t.stateNode
            if (
              typeof t.type.getDerivedStateFromError == `function` ||
              (typeof r.componentDidCatch == `function` && (tu === null || !tu.has(r)))
            ) {
              ;((e = yi(n, e)),
                (n = Xs(2)),
                (r = Wa(t, n, 2)),
                r !== null && (Zs(n, r, t, e), Qe(r, 2), nd(r)))
              break
            }
          }
          t = t.return
        }
    }
    function Wu(e, t, n) {
      var r = e.pingCache
      if (r === null) {
        r = e.pingCache = new Fl()
        var i = new Set()
        r.set(t, i)
      } else ((i = r.get(t)), i === void 0 && ((i = new Set()), r.set(t, i)))
      i.has(n) || ((Bl = !0), i.add(n), (e = Gu.bind(null, e, t, n)), t.then(e, e))
    }
    function Gu(e, t, n) {
      var r = e.pingCache
      ;(r !== null && r.delete(t),
        (e.pingedLanes |= e.suspendedLanes & n),
        (e.warmLanes &= ~n),
        Il === e &&
          (Z & n) === n &&
          (Hl === 4 || (Hl === 3 && (Z & 62914560) === Z && 300 > De() - Zl)
            ? !(Y & 2) && bu(e, 0)
            : (Gl |= n),
          ql === Z && (ql = 0)),
        nd(e))
    }
    function Ku(e, t) {
      ;(t === 0 && (t = Xe()), (e = ii(e, t)), e !== null && (Qe(e, t), nd(e)))
    }
    function qu(e) {
      var t = e.memoizedState,
        n = 0
      ;(t !== null && (n = t.retryLane), Ku(e, n))
    }
    function Ju(e, t) {
      var n = 0
      switch (e.tag) {
        case 31:
        case 13:
          var r = e.stateNode,
            a = e.memoizedState
          a !== null && (n = a.retryLane)
          break
        case 19:
          r = e.stateNode
          break
        case 22:
          r = e.stateNode._retryCache
          break
        default:
          throw Error(i(314))
      }
      ;(r !== null && r.delete(t), Ku(e, n))
    }
    function Yu(e, t) {
      return Ce(e, t)
    }
    var Xu = null,
      Zu = null,
      Qu = !1,
      $u = !1,
      ed = !1,
      td = 0
    function nd(e) {
      ;(e !== Zu && e.next === null && (Zu === null ? (Xu = Zu = e) : (Zu = Zu.next = e)),
        ($u = !0),
        Qu || ((Qu = !0), ld()))
    }
    function rd(e, t) {
      if (!ed && $u) {
        ed = !0
        do
          for (var n = !1, r = Xu; r !== null;) {
            if (!t) {
              if (e !== 0) {
                var i = r.pendingLanes
                if (i === 0) var a = 0
                else {
                  var o = r.suspendedLanes,
                    s = r.pingedLanes
                  ;((a = (1 << (31 - ze(42 | e) + 1)) - 1),
                    (a &= i & ~(o & ~s)),
                    (a = a & 201326741 ? (a & 201326741) | 1 : a ? a | 2 : 0))
                }
                a !== 0 && ((n = !0), cd(r, a))
              } else
                ((a = Z),
                  (a = qe(
                    r,
                    r === Il ? a : 0,
                    r.cancelPendingCommit !== null || r.timeoutHandle !== -1,
                  )),
                  !(a & 3) || Je(r, a) || ((n = !0), cd(r, a)))
            }
            r = r.next
          }
        while (n)
        ed = !1
      }
    }
    function id() {
      ad()
    }
    function ad() {
      $u = Qu = !1
      var e = 0
      td !== 0 && Gd() && (e = td)
      for (var t = De(), n = null, r = Xu; r !== null;) {
        var i = r.next,
          a = od(r, t)
        ;(a === 0
          ? ((r.next = null), n === null ? (Xu = i) : (n.next = i), i === null && (Zu = n))
          : ((n = r), (e !== 0 || a & 3) && ($u = !0)),
          (r = i))
      }
      ;((nu !== 0 && nu !== 5) || rd(e, !1), td !== 0 && (td = 0))
    }
    function od(e, t) {
      for (
        var n = e.suspendedLanes,
          r = e.pingedLanes,
          i = e.expirationTimes,
          a = e.pendingLanes & -62914561;
        0 < a;
      ) {
        var o = 31 - ze(a),
          s = 1 << o,
          c = i[o]
        ;(c === -1
          ? ((s & n) === 0 || (s & r) !== 0) && (i[o] = Ye(s, t))
          : c <= t && (e.expiredLanes |= s),
          (a &= ~s))
      }
      if (
        ((t = Il),
        (n = Z),
        (n = qe(e, e === t ? n : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1)),
        (r = e.callbackNode),
        n === 0 || (e === t && (Q === 2 || Q === 9)) || e.cancelPendingCommit !== null)
      )
        return (
          r !== null && r !== null && we(r),
          (e.callbackNode = null),
          (e.callbackPriority = 0)
        )
      if (!(n & 3) || Je(e, n)) {
        if (((t = n & -n), t === e.callbackPriority)) return t
        switch ((r !== null && we(r), it(n))) {
          case 2:
          case 8:
            n = Ae
            break
          case 32:
            n = je
            break
          case 268435456:
            n = Ne
            break
          default:
            n = je
        }
        return (
          (r = sd.bind(null, e)),
          (n = Ce(n, r)),
          (e.callbackPriority = t),
          (e.callbackNode = n),
          t
        )
      }
      return (
        r !== null && r !== null && we(r),
        (e.callbackPriority = 2),
        (e.callbackNode = null),
        2
      )
    }
    function sd(e, t) {
      if (nu !== 0 && nu !== 5) return ((e.callbackNode = null), (e.callbackPriority = 0), null)
      var n = e.callbackNode
      if (Bu() && e.callbackNode !== n) return null
      var r = Z
      return (
        (r = qe(e, e === Il ? r : 0, e.cancelPendingCommit !== null || e.timeoutHandle !== -1)),
        r === 0
          ? null
          : (mu(e, r, t),
            od(e, De()),
            e.callbackNode != null && e.callbackNode === n ? sd.bind(null, e) : null)
      )
    }
    function cd(e, t) {
      if (Bu()) return null
      mu(e, t, !0)
    }
    function ld() {
      Yd(function () {
        Y & 6 ? Ce(ke, id) : ad()
      })
    }
    function ud() {
      if (td === 0) {
        var e = fa
        ;(e === 0 && ((e = Ue), (Ue <<= 1), !(Ue & 261888) && (Ue = 256)), (td = e))
      }
      return td
    }
    function dd(e) {
      return e == null || typeof e == `symbol` || typeof e == `boolean`
        ? null
        : typeof e == `function`
          ? e
          : en(`` + e)
    }
    function fd(e, t) {
      var n = t.ownerDocument.createElement(`input`)
      return (
        (n.name = t.name),
        (n.value = t.value),
        e.id && n.setAttribute(`form`, e.id),
        t.parentNode.insertBefore(n, t),
        (e = new FormData(e)),
        n.parentNode.removeChild(n),
        e
      )
    }
    function pd(e, t, n, r, i) {
      if (t === `submit` && n && n.stateNode === i) {
        var a = dd((i[lt] || null).action),
          o = r.submitter
        o &&
          ((t = (t = o[lt] || null) ? dd(t.formAction) : o.getAttribute(`formAction`)),
          t !== null && ((a = t), (o = null)))
        var s = new Cn(`action`, `action`, null, r, i)
        e.push({
          event: s,
          listeners: [
            {
              instance: null,
              listener: function () {
                if (r.defaultPrevented) {
                  if (td !== 0) {
                    var e = o ? fd(i, o) : new FormData(i)
                    Cs(n, { pending: !0, data: e, method: i.method, action: a }, null, e)
                  }
                } else
                  typeof a == `function` &&
                    (s.preventDefault(),
                    (e = o ? fd(i, o) : new FormData(i)),
                    Cs(n, { pending: !0, data: e, method: i.method, action: a }, a, e))
              },
              currentTarget: i,
            },
          ],
        })
      }
    }
    for (var md = 0; md < Yr.length; md++) {
      var hd = Yr[md]
      Xr(hd.toLowerCase(), `on` + (hd[0].toUpperCase() + hd.slice(1)))
    }
    ;(Xr(Vr, `onAnimationEnd`),
      Xr(Hr, `onAnimationIteration`),
      Xr(Ur, `onAnimationStart`),
      Xr(`dblclick`, `onDoubleClick`),
      Xr(`focusin`, `onFocus`),
      Xr(`focusout`, `onBlur`),
      Xr(Wr, `onTransitionRun`),
      Xr(Gr, `onTransitionStart`),
      Xr(Kr, `onTransitionCancel`),
      Xr(qr, `onTransitionEnd`),
      Tt(`onMouseEnter`, [`mouseout`, `mouseover`]),
      Tt(`onMouseLeave`, [`mouseout`, `mouseover`]),
      Tt(`onPointerEnter`, [`pointerout`, `pointerover`]),
      Tt(`onPointerLeave`, [`pointerout`, `pointerover`]),
      wt(
        `onChange`,
        `change click focusin focusout input keydown keyup selectionchange`.split(` `),
      ),
      wt(
        `onSelect`,
        `focusout contextmenu dragend focusin keydown keyup mousedown mouseup selectionchange`.split(
          ` `,
        ),
      ),
      wt(`onBeforeInput`, [`compositionend`, `keypress`, `textInput`, `paste`]),
      wt(`onCompositionEnd`, `compositionend focusout keydown keypress keyup mousedown`.split(` `)),
      wt(
        `onCompositionStart`,
        `compositionstart focusout keydown keypress keyup mousedown`.split(` `),
      ),
      wt(
        `onCompositionUpdate`,
        `compositionupdate focusout keydown keypress keyup mousedown`.split(` `),
      ))
    var gd =
        `abort canplay canplaythrough durationchange emptied encrypted ended error loadeddata loadedmetadata loadstart pause play playing progress ratechange resize seeked seeking stalled suspend timeupdate volumechange waiting`.split(
          ` `,
        ),
      _d = new Set(
        `beforetoggle cancel close invalid load scroll scrollend toggle`.split(` `).concat(gd),
      )
    function vd(e, t) {
      t = !!(t & 4)
      for (var n = 0; n < e.length; n++) {
        var r = e[n],
          i = r.event
        r = r.listeners
        a: {
          var a = void 0
          if (t)
            for (var o = r.length - 1; 0 <= o; o--) {
              var s = r[o],
                c = s.instance,
                l = s.currentTarget
              if (((s = s.listener), c !== a && i.isPropagationStopped())) break a
              ;((a = s), (i.currentTarget = l))
              try {
                a(i)
              } catch (e) {
                Zr(e)
              }
              ;((i.currentTarget = null), (a = c))
            }
          else
            for (o = 0; o < r.length; o++) {
              if (
                ((s = r[o]),
                (c = s.instance),
                (l = s.currentTarget),
                (s = s.listener),
                c !== a && i.isPropagationStopped())
              )
                break a
              ;((a = s), (i.currentTarget = l))
              try {
                a(i)
              } catch (e) {
                Zr(e)
              }
              ;((i.currentTarget = null), (a = c))
            }
        }
      }
    }
    function $(e, t) {
      var n = t[dt]
      n === void 0 && (n = t[dt] = new Set())
      var r = e + `__bubble`
      n.has(r) || (Sd(t, e, 2, !1), n.add(r))
    }
    function yd(e, t, n) {
      var r = 0
      ;(t && (r |= 4), Sd(n, e, r, t))
    }
    var bd = `_reactListening` + Math.random().toString(36).slice(2)
    function xd(e) {
      if (!e[bd]) {
        ;((e[bd] = !0),
          St.forEach(function (t) {
            t !== `selectionchange` && (_d.has(t) || yd(t, !1, e), yd(t, !0, e))
          }))
        var t = e.nodeType === 9 ? e : e.ownerDocument
        t === null || t[bd] || ((t[bd] = !0), yd(`selectionchange`, !1, t))
      }
    }
    function Sd(e, t, n, r) {
      switch (mp(t)) {
        case 2:
          var i = cp
          break
        case 8:
          i = lp
          break
        default:
          i = up
      }
      ;((n = i.bind(null, t, n, e)),
        (i = void 0),
        !fn || (t !== `touchstart` && t !== `touchmove` && t !== `wheel`) || (i = !0),
        r
          ? i === void 0
            ? e.addEventListener(t, n, !0)
            : e.addEventListener(t, n, { capture: !0, passive: i })
          : i === void 0
            ? e.addEventListener(t, n, !1)
            : e.addEventListener(t, n, { passive: i }))
    }
    function Cd(e, t, n, r, i) {
      var a = r
      if (!(t & 1) && !(t & 2) && r !== null)
        a: for (;;) {
          if (r === null) return
          var s = r.tag
          if (s === 3 || s === 4) {
            var c = r.stateNode.containerInfo
            if (c === i) break
            if (s === 4)
              for (s = r.return; s !== null;) {
                var l = s.tag
                if ((l === 3 || l === 4) && s.stateNode.containerInfo === i) return
                s = s.return
              }
            for (; c !== null;) {
              if (((s = _t(c)), s === null)) return
              if (((l = s.tag), l === 5 || l === 6 || l === 26 || l === 27)) {
                r = a = s
                continue a
              }
              c = c.parentNode
            }
          }
          r = r.return
        }
      ln(function () {
        var r = a,
          i = rn(n),
          s = []
        a: {
          var c = Jr.get(e)
          if (c !== void 0) {
            var l = Cn,
              u = e
            switch (e) {
              case `keypress`:
                if (vn(n) === 0) break a
              case `keydown`:
              case `keyup`:
                l = Bn
                break
              case `focusin`:
                ;((u = `focus`), (l = Mn))
                break
              case `focusout`:
                ;((u = `blur`), (l = Mn))
                break
              case `beforeblur`:
              case `afterblur`:
                l = Mn
                break
              case `click`:
                if (n.button === 2) break a
              case `auxclick`:
              case `dblclick`:
              case `mousedown`:
              case `mousemove`:
              case `mouseup`:
              case `mouseout`:
              case `mouseover`:
              case `contextmenu`:
                l = An
                break
              case `drag`:
              case `dragend`:
              case `dragenter`:
              case `dragexit`:
              case `dragleave`:
              case `dragover`:
              case `dragstart`:
              case `drop`:
                l = jn
                break
              case `touchcancel`:
              case `touchend`:
              case `touchmove`:
              case `touchstart`:
                l = Hn
                break
              case Vr:
              case Hr:
              case Ur:
                l = Nn
                break
              case qr:
                l = Un
                break
              case `scroll`:
              case `scrollend`:
                l = Tn
                break
              case `wheel`:
                l = Wn
                break
              case `copy`:
              case `cut`:
              case `paste`:
                l = Pn
                break
              case `gotpointercapture`:
              case `lostpointercapture`:
              case `pointercancel`:
              case `pointerdown`:
              case `pointermove`:
              case `pointerout`:
              case `pointerover`:
              case `pointerup`:
                l = Vn
                break
              case `toggle`:
              case `beforetoggle`:
                l = Gn
            }
            var d = !!(t & 4),
              f = !d && (e === `scroll` || e === `scrollend`),
              p = d ? (c === null ? null : c + `Capture`) : c
            d = []
            for (var m = r, h; m !== null;) {
              var g = m
              if (
                ((h = g.stateNode),
                (g = g.tag),
                (g !== 5 && g !== 26 && g !== 27) ||
                  h === null ||
                  p === null ||
                  ((g = un(m, p)), g != null && d.push(wd(m, g, h))),
                f)
              )
                break
              m = m.return
            }
            0 < d.length && ((c = new l(c, u, null, n, i)), s.push({ event: c, listeners: d }))
          }
        }
        if (!(t & 7)) {
          a: {
            if (
              ((c = e === `mouseover` || e === `pointerover`),
              (l = e === `mouseout` || e === `pointerout`),
              c && n !== nn && (u = n.relatedTarget || n.fromElement) && (_t(u) || u[ut]))
            )
              break a
            if (
              (l || c) &&
              ((c =
                i.window === i
                  ? i
                  : (c = i.ownerDocument)
                    ? c.defaultView || c.parentWindow
                    : window),
              l
                ? ((u = n.relatedTarget || n.toElement),
                  (l = r),
                  (u = u ? _t(u) : null),
                  u !== null &&
                    ((f = o(u)), (d = u.tag), u !== f || (d !== 5 && d !== 27 && d !== 6)) &&
                    (u = null))
                : ((l = null), (u = r)),
              l !== u)
            ) {
              if (
                ((d = An),
                (g = `onMouseLeave`),
                (p = `onMouseEnter`),
                (m = `mouse`),
                (e === `pointerout` || e === `pointerover`) &&
                  ((d = Vn), (g = `onPointerLeave`), (p = `onPointerEnter`), (m = `pointer`)),
                (f = l == null ? c : yt(l)),
                (h = u == null ? c : yt(u)),
                (c = new d(g, m + `leave`, l, n, i)),
                (c.target = f),
                (c.relatedTarget = h),
                (g = null),
                _t(i) === r &&
                  ((d = new d(p, m + `enter`, u, n, i)),
                  (d.target = h),
                  (d.relatedTarget = f),
                  (g = d)),
                (f = g),
                l && u)
              )
                b: {
                  for (d = Ed, p = l, m = u, h = 0, g = p; g; g = d(g)) h++
                  g = 0
                  for (var _ = m; _; _ = d(_)) g++
                  for (; 0 < h - g;) ((p = d(p)), h--)
                  for (; 0 < g - h;) ((m = d(m)), g--)
                  for (; h--;) {
                    if (p === m || (m !== null && p === m.alternate)) {
                      d = p
                      break b
                    }
                    ;((p = d(p)), (m = d(m)))
                  }
                  d = null
                }
              else d = null
              ;(l !== null && Dd(s, c, l, d, !1), u !== null && f !== null && Dd(s, f, u, d, !0))
            }
          }
          a: {
            if (
              ((c = r ? yt(r) : window),
              (l = c.nodeName && c.nodeName.toLowerCase()),
              l === `select` || (l === `input` && c.type === `file`))
            )
              var v = dr
            else if (ar(c)) {
              if (fr) v = xr
              else {
                v = yr
                var y = vr
              }
            } else
              ((l = c.nodeName),
                !l || l.toLowerCase() !== `input` || (c.type !== `checkbox` && c.type !== `radio`)
                  ? r && Zt(r.elementType) && (v = dr)
                  : (v = br))
            if ((v &&= v(e, r))) {
              or(s, v, n, i)
              break a
            }
            ;(y && y(e, c, r),
              e === `focusout` &&
                r &&
                c.type === `number` &&
                r.memoizedProps.value != null &&
                Ut(c, `number`, c.value))
          }
          switch (((y = r ? yt(r) : window), e)) {
            case `focusin`:
              ;(ar(y) || y.contentEditable === `true`) && ((jr = y), (Mr = r), (Nr = null))
              break
            case `focusout`:
              Nr = Mr = jr = null
              break
            case `mousedown`:
              Pr = !0
              break
            case `contextmenu`:
            case `mouseup`:
            case `dragend`:
              ;((Pr = !1), Fr(s, n, i))
              break
            case `selectionchange`:
              if (Ar) break
            case `keydown`:
            case `keyup`:
              Fr(s, n, i)
          }
          var b
          if (qn)
            b: {
              switch (e) {
                case `compositionstart`:
                  var x = `onCompositionStart`
                  break b
                case `compositionend`:
                  x = `onCompositionEnd`
                  break b
                case `compositionupdate`:
                  x = `onCompositionUpdate`
                  break b
              }
              x = void 0
            }
          else
            tr
              ? $n(e, n) && (x = `onCompositionEnd`)
              : e === `keydown` && n.keyCode === 229 && (x = `onCompositionStart`)
          ;(x &&
            (Xn &&
              n.locale !== `ko` &&
              (tr || x !== `onCompositionStart`
                ? x === `onCompositionEnd` && tr && (b = _n())
                : ((mn = i), (hn = `value` in mn ? mn.value : mn.textContent), (tr = !0))),
            (y = Td(r, x)),
            0 < y.length &&
              ((x = new Fn(x, e, null, n, i)),
              s.push({ event: x, listeners: y }),
              b ? (x.data = b) : ((b = er(n)), b !== null && (x.data = b)))),
            (b = Yn ? nr(e, n) : rr(e, n)) &&
              ((x = Td(r, `onBeforeInput`)),
              0 < x.length &&
                ((y = new Fn(`onBeforeInput`, `beforeinput`, null, n, i)),
                s.push({ event: y, listeners: x }),
                (y.data = b))),
            pd(s, e, r, n, i))
        }
        vd(s, t)
      })
    }
    function wd(e, t, n) {
      return { instance: e, listener: t, currentTarget: n }
    }
    function Td(e, t) {
      for (var n = t + `Capture`, r = []; e !== null;) {
        var i = e,
          a = i.stateNode
        if (
          ((i = i.tag),
          (i !== 5 && i !== 26 && i !== 27) ||
            a === null ||
            ((i = un(e, n)),
            i != null && r.unshift(wd(e, i, a)),
            (i = un(e, t)),
            i != null && r.push(wd(e, i, a))),
          e.tag === 3)
        )
          return r
        e = e.return
      }
      return []
    }
    function Ed(e) {
      if (e === null) return null
      do e = e.return
      while (e && e.tag !== 5 && e.tag !== 27)
      return e || null
    }
    function Dd(e, t, n, r, i) {
      for (var a = t._reactName, o = []; n !== null && n !== r;) {
        var s = n,
          c = s.alternate,
          l = s.stateNode
        if (((s = s.tag), c !== null && c === r)) break
        ;((s !== 5 && s !== 26 && s !== 27) ||
          l === null ||
          ((c = l),
          i
            ? ((l = un(n, a)), l != null && o.unshift(wd(n, l, c)))
            : i || ((l = un(n, a)), l != null && o.push(wd(n, l, c)))),
          (n = n.return))
      }
      o.length !== 0 && e.push({ event: t, listeners: o })
    }
    var Od = /\r\n?/g,
      kd = /\u0000|\uFFFD/g
    function Ad(e) {
      return (typeof e == `string` ? e : `` + e)
        .replace(
          Od,
          `
`,
        )
        .replace(kd, ``)
    }
    function jd(e, t) {
      return ((t = Ad(t)), Ad(e) === t)
    }
    function Md(e, t, n, r, a, o) {
      switch (n) {
        case `children`:
          typeof r == `string`
            ? t === `body` || (t === `textarea` && r === ``) || qt(e, r)
            : (typeof r == `number` || typeof r == `bigint`) && t !== `body` && qt(e, `` + r)
          break
        case `className`:
          jt(e, `class`, r)
          break
        case `tabIndex`:
          jt(e, `tabindex`, r)
          break
        case `dir`:
        case `role`:
        case `viewBox`:
        case `width`:
        case `height`:
          jt(e, n, r)
          break
        case `style`:
          Xt(e, r, o)
          break
        case `data`:
          if (t !== `object`) {
            jt(e, `data`, r)
            break
          }
        case `src`:
        case `href`:
          if (r === `` && (t !== `a` || n !== `href`)) {
            e.removeAttribute(n)
            break
          }
          if (
            r == null ||
            typeof r == `function` ||
            typeof r == `symbol` ||
            typeof r == `boolean`
          ) {
            e.removeAttribute(n)
            break
          }
          ;((r = en(`` + r)), e.setAttribute(n, r))
          break
        case `action`:
        case `formAction`:
          if (typeof r == `function`) {
            e.setAttribute(
              n,
              `javascript:throw new Error('A React form was unexpectedly submitted. If you called form.submit() manually, consider using form.requestSubmit() instead. If you\\'re trying to use event.stopPropagation() in a submit event handler, consider also calling event.preventDefault().')`,
            )
            break
          }
          if (
            (typeof o == `function` &&
              (n === `formAction`
                ? (t !== `input` && Md(e, t, `name`, a.name, a, null),
                  Md(e, t, `formEncType`, a.formEncType, a, null),
                  Md(e, t, `formMethod`, a.formMethod, a, null),
                  Md(e, t, `formTarget`, a.formTarget, a, null))
                : (Md(e, t, `encType`, a.encType, a, null),
                  Md(e, t, `method`, a.method, a, null),
                  Md(e, t, `target`, a.target, a, null))),
            r == null || typeof r == `symbol` || typeof r == `boolean`)
          ) {
            e.removeAttribute(n)
            break
          }
          ;((r = en(`` + r)), e.setAttribute(n, r))
          break
        case `onClick`:
          r != null && (e.onclick = tn)
          break
        case `onScroll`:
          r != null && $(`scroll`, e)
          break
        case `onScrollEnd`:
          r != null && $(`scrollend`, e)
          break
        case `dangerouslySetInnerHTML`:
          if (r != null) {
            if (typeof r != `object` || !(`__html` in r)) throw Error(i(61))
            if (((n = r.__html), n != null)) {
              if (a.children != null) throw Error(i(60))
              e.innerHTML = n
            }
          }
          break
        case `multiple`:
          e.multiple = r && typeof r != `function` && typeof r != `symbol`
          break
        case `muted`:
          e.muted = r && typeof r != `function` && typeof r != `symbol`
          break
        case `suppressContentEditableWarning`:
        case `suppressHydrationWarning`:
        case `defaultValue`:
        case `defaultChecked`:
        case `innerHTML`:
        case `ref`:
          break
        case `autoFocus`:
          break
        case `xlinkHref`:
          if (
            r == null ||
            typeof r == `function` ||
            typeof r == `boolean` ||
            typeof r == `symbol`
          ) {
            e.removeAttribute(`xlink:href`)
            break
          }
          ;((n = en(`` + r)), e.setAttributeNS(`http://www.w3.org/1999/xlink`, `xlink:href`, n))
          break
        case `contentEditable`:
        case `spellCheck`:
        case `draggable`:
        case `value`:
        case `autoReverse`:
        case `externalResourcesRequired`:
        case `focusable`:
        case `preserveAlpha`:
          r != null && typeof r != `function` && typeof r != `symbol`
            ? e.setAttribute(n, `` + r)
            : e.removeAttribute(n)
          break
        case `inert`:
        case `allowFullScreen`:
        case `async`:
        case `autoPlay`:
        case `controls`:
        case `default`:
        case `defer`:
        case `disabled`:
        case `disablePictureInPicture`:
        case `disableRemotePlayback`:
        case `formNoValidate`:
        case `hidden`:
        case `loop`:
        case `noModule`:
        case `noValidate`:
        case `open`:
        case `playsInline`:
        case `readOnly`:
        case `required`:
        case `reversed`:
        case `scoped`:
        case `seamless`:
        case `itemScope`:
          r && typeof r != `function` && typeof r != `symbol`
            ? e.setAttribute(n, ``)
            : e.removeAttribute(n)
          break
        case `capture`:
        case `download`:
          !0 === r
            ? e.setAttribute(n, ``)
            : !1 !== r && r != null && typeof r != `function` && typeof r != `symbol`
              ? e.setAttribute(n, r)
              : e.removeAttribute(n)
          break
        case `cols`:
        case `rows`:
        case `size`:
        case `span`:
          r != null && typeof r != `function` && typeof r != `symbol` && !isNaN(r) && 1 <= r
            ? e.setAttribute(n, r)
            : e.removeAttribute(n)
          break
        case `rowSpan`:
        case `start`:
          r == null || typeof r == `function` || typeof r == `symbol` || isNaN(r)
            ? e.removeAttribute(n)
            : e.setAttribute(n, r)
          break
        case `popover`:
          ;($(`beforetoggle`, e), $(`toggle`, e), At(e, `popover`, r))
          break
        case `xlinkActuate`:
          Mt(e, `http://www.w3.org/1999/xlink`, `xlink:actuate`, r)
          break
        case `xlinkArcrole`:
          Mt(e, `http://www.w3.org/1999/xlink`, `xlink:arcrole`, r)
          break
        case `xlinkRole`:
          Mt(e, `http://www.w3.org/1999/xlink`, `xlink:role`, r)
          break
        case `xlinkShow`:
          Mt(e, `http://www.w3.org/1999/xlink`, `xlink:show`, r)
          break
        case `xlinkTitle`:
          Mt(e, `http://www.w3.org/1999/xlink`, `xlink:title`, r)
          break
        case `xlinkType`:
          Mt(e, `http://www.w3.org/1999/xlink`, `xlink:type`, r)
          break
        case `xmlBase`:
          Mt(e, `http://www.w3.org/XML/1998/namespace`, `xml:base`, r)
          break
        case `xmlLang`:
          Mt(e, `http://www.w3.org/XML/1998/namespace`, `xml:lang`, r)
          break
        case `xmlSpace`:
          Mt(e, `http://www.w3.org/XML/1998/namespace`, `xml:space`, r)
          break
        case `is`:
          At(e, `is`, r)
          break
        case `innerText`:
        case `textContent`:
          break
        default:
          ;(!(2 < n.length) || (n[0] !== `o` && n[0] !== `O`) || (n[1] !== `n` && n[1] !== `N`)) &&
            ((n = Qt.get(n) || n), At(e, n, r))
      }
    }
    function Nd(e, t, n, r, a, o) {
      switch (n) {
        case `style`:
          Xt(e, r, o)
          break
        case `dangerouslySetInnerHTML`:
          if (r != null) {
            if (typeof r != `object` || !(`__html` in r)) throw Error(i(61))
            if (((n = r.__html), n != null)) {
              if (a.children != null) throw Error(i(60))
              e.innerHTML = n
            }
          }
          break
        case `children`:
          typeof r == `string`
            ? qt(e, r)
            : (typeof r == `number` || typeof r == `bigint`) && qt(e, `` + r)
          break
        case `onScroll`:
          r != null && $(`scroll`, e)
          break
        case `onScrollEnd`:
          r != null && $(`scrollend`, e)
          break
        case `onClick`:
          r != null && (e.onclick = tn)
          break
        case `suppressContentEditableWarning`:
        case `suppressHydrationWarning`:
        case `innerHTML`:
        case `ref`:
          break
        case `innerText`:
        case `textContent`:
          break
        default:
          if (!Ct.hasOwnProperty(n))
            a: {
              if (
                n[0] === `o` &&
                n[1] === `n` &&
                ((a = n.endsWith(`Capture`)),
                (t = n.slice(2, a ? n.length - 7 : void 0)),
                (o = e[lt] || null),
                (o = o == null ? null : o[n]),
                typeof o == `function` && e.removeEventListener(t, o, a),
                typeof r == `function`)
              ) {
                ;(typeof o != `function` &&
                  o !== null &&
                  (n in e ? (e[n] = null) : e.hasAttribute(n) && e.removeAttribute(n)),
                  e.addEventListener(t, r, a))
                break a
              }
              n in e ? (e[n] = r) : !0 === r ? e.setAttribute(n, ``) : At(e, n, r)
            }
      }
    }
    function Pd(e, t, n) {
      switch (t) {
        case `div`:
        case `span`:
        case `svg`:
        case `path`:
        case `a`:
        case `g`:
        case `p`:
        case `li`:
          break
        case `img`:
          ;($(`error`, e), $(`load`, e))
          var r = !1,
            a = !1,
            o
          for (o in n)
            if (n.hasOwnProperty(o)) {
              var s = n[o]
              if (s != null)
                switch (o) {
                  case `src`:
                    r = !0
                    break
                  case `srcSet`:
                    a = !0
                    break
                  case `children`:
                  case `dangerouslySetInnerHTML`:
                    throw Error(i(137, t))
                  default:
                    Md(e, t, o, s, n, null)
                }
            }
          ;(a && Md(e, t, `srcSet`, n.srcSet, n, null), r && Md(e, t, `src`, n.src, n, null))
          return
        case `input`:
          $(`invalid`, e)
          var c = (o = s = a = null),
            l = null,
            u = null
          for (r in n)
            if (n.hasOwnProperty(r)) {
              var d = n[r]
              if (d != null)
                switch (r) {
                  case `name`:
                    a = d
                    break
                  case `type`:
                    s = d
                    break
                  case `checked`:
                    l = d
                    break
                  case `defaultChecked`:
                    u = d
                    break
                  case `value`:
                    o = d
                    break
                  case `defaultValue`:
                    c = d
                    break
                  case `children`:
                  case `dangerouslySetInnerHTML`:
                    if (d != null) throw Error(i(137, t))
                    break
                  default:
                    Md(e, t, r, d, n, null)
                }
            }
          Ht(e, o, c, l, u, s, a, !1)
          return
        case `select`:
          for (a in ($(`invalid`, e), (r = s = o = null), n))
            if (n.hasOwnProperty(a) && ((c = n[a]), c != null))
              switch (a) {
                case `value`:
                  o = c
                  break
                case `defaultValue`:
                  s = c
                  break
                case `multiple`:
                  r = c
                default:
                  Md(e, t, a, c, n, null)
              }
          ;((t = o),
            (n = s),
            (e.multiple = !!r),
            t == null ? n != null && Wt(e, !!r, n, !0) : Wt(e, !!r, t, !1))
          return
        case `textarea`:
          for (s in ($(`invalid`, e), (o = a = r = null), n))
            if (n.hasOwnProperty(s) && ((c = n[s]), c != null))
              switch (s) {
                case `value`:
                  r = c
                  break
                case `defaultValue`:
                  a = c
                  break
                case `children`:
                  o = c
                  break
                case `dangerouslySetInnerHTML`:
                  if (c != null) throw Error(i(91))
                  break
                default:
                  Md(e, t, s, c, n, null)
              }
          Kt(e, r, a, o)
          return
        case `option`:
          for (l in n)
            if (n.hasOwnProperty(l) && ((r = n[l]), r != null))
              switch (l) {
                case `selected`:
                  e.selected = r && typeof r != `function` && typeof r != `symbol`
                  break
                default:
                  Md(e, t, l, r, n, null)
              }
          return
        case `dialog`:
          ;($(`beforetoggle`, e), $(`toggle`, e), $(`cancel`, e), $(`close`, e))
          break
        case `iframe`:
        case `object`:
          $(`load`, e)
          break
        case `video`:
        case `audio`:
          for (r = 0; r < gd.length; r++) $(gd[r], e)
          break
        case `image`:
          ;($(`error`, e), $(`load`, e))
          break
        case `details`:
          $(`toggle`, e)
          break
        case `embed`:
        case `source`:
        case `link`:
          ;($(`error`, e), $(`load`, e))
        case `area`:
        case `base`:
        case `br`:
        case `col`:
        case `hr`:
        case `keygen`:
        case `meta`:
        case `param`:
        case `track`:
        case `wbr`:
        case `menuitem`:
          for (u in n)
            if (n.hasOwnProperty(u) && ((r = n[u]), r != null))
              switch (u) {
                case `children`:
                case `dangerouslySetInnerHTML`:
                  throw Error(i(137, t))
                default:
                  Md(e, t, u, r, n, null)
              }
          return
        default:
          if (Zt(t)) {
            for (d in n)
              n.hasOwnProperty(d) && ((r = n[d]), r !== void 0 && Nd(e, t, d, r, n, void 0))
            return
          }
      }
      for (c in n) n.hasOwnProperty(c) && ((r = n[c]), r != null && Md(e, t, c, r, n, null))
    }
    function Fd(e, t, n, r) {
      switch (t) {
        case `div`:
        case `span`:
        case `svg`:
        case `path`:
        case `a`:
        case `g`:
        case `p`:
        case `li`:
          break
        case `input`:
          var a = null,
            o = null,
            s = null,
            c = null,
            l = null,
            u = null,
            d = null
          for (m in n) {
            var f = n[m]
            if (n.hasOwnProperty(m) && f != null)
              switch (m) {
                case `checked`:
                  break
                case `value`:
                  break
                case `defaultValue`:
                  l = f
                default:
                  r.hasOwnProperty(m) || Md(e, t, m, null, r, f)
              }
          }
          for (var p in r) {
            var m = r[p]
            if (((f = n[p]), r.hasOwnProperty(p) && (m != null || f != null)))
              switch (p) {
                case `type`:
                  o = m
                  break
                case `name`:
                  a = m
                  break
                case `checked`:
                  u = m
                  break
                case `defaultChecked`:
                  d = m
                  break
                case `value`:
                  s = m
                  break
                case `defaultValue`:
                  c = m
                  break
                case `children`:
                case `dangerouslySetInnerHTML`:
                  if (m != null) throw Error(i(137, t))
                  break
                default:
                  m !== f && Md(e, t, p, m, r, f)
              }
          }
          Vt(e, s, c, l, u, d, o, a)
          return
        case `select`:
          for (o in ((m = s = c = p = null), n))
            if (((l = n[o]), n.hasOwnProperty(o) && l != null))
              switch (o) {
                case `value`:
                  break
                case `multiple`:
                  m = l
                default:
                  r.hasOwnProperty(o) || Md(e, t, o, null, r, l)
              }
          for (a in r)
            if (((o = r[a]), (l = n[a]), r.hasOwnProperty(a) && (o != null || l != null)))
              switch (a) {
                case `value`:
                  p = o
                  break
                case `defaultValue`:
                  c = o
                  break
                case `multiple`:
                  s = o
                default:
                  o !== l && Md(e, t, a, o, r, l)
              }
          ;((t = c),
            (n = s),
            (r = m),
            p == null
              ? !!r != !!n && (t == null ? Wt(e, !!n, n ? [] : ``, !1) : Wt(e, !!n, t, !0))
              : Wt(e, !!n, p, !1))
          return
        case `textarea`:
          for (c in ((m = p = null), n))
            if (((a = n[c]), n.hasOwnProperty(c) && a != null && !r.hasOwnProperty(c)))
              switch (c) {
                case `value`:
                  break
                case `children`:
                  break
                default:
                  Md(e, t, c, null, r, a)
              }
          for (s in r)
            if (((a = r[s]), (o = n[s]), r.hasOwnProperty(s) && (a != null || o != null)))
              switch (s) {
                case `value`:
                  p = a
                  break
                case `defaultValue`:
                  m = a
                  break
                case `children`:
                  break
                case `dangerouslySetInnerHTML`:
                  if (a != null) throw Error(i(91))
                  break
                default:
                  a !== o && Md(e, t, s, a, r, o)
              }
          Gt(e, p, m)
          return
        case `option`:
          for (var h in n)
            if (((p = n[h]), n.hasOwnProperty(h) && p != null && !r.hasOwnProperty(h)))
              switch (h) {
                case `selected`:
                  e.selected = !1
                  break
                default:
                  Md(e, t, h, null, r, p)
              }
          for (l in r)
            if (
              ((p = r[l]), (m = n[l]), r.hasOwnProperty(l) && p !== m && (p != null || m != null))
            )
              switch (l) {
                case `selected`:
                  e.selected = p && typeof p != `function` && typeof p != `symbol`
                  break
                default:
                  Md(e, t, l, p, r, m)
              }
          return
        case `img`:
        case `link`:
        case `area`:
        case `base`:
        case `br`:
        case `col`:
        case `embed`:
        case `hr`:
        case `keygen`:
        case `meta`:
        case `param`:
        case `source`:
        case `track`:
        case `wbr`:
        case `menuitem`:
          for (var g in n)
            ((p = n[g]),
              n.hasOwnProperty(g) && p != null && !r.hasOwnProperty(g) && Md(e, t, g, null, r, p))
          for (u in r)
            if (
              ((p = r[u]), (m = n[u]), r.hasOwnProperty(u) && p !== m && (p != null || m != null))
            )
              switch (u) {
                case `children`:
                case `dangerouslySetInnerHTML`:
                  if (p != null) throw Error(i(137, t))
                  break
                default:
                  Md(e, t, u, p, r, m)
              }
          return
        default:
          if (Zt(t)) {
            for (var _ in n)
              ((p = n[_]),
                n.hasOwnProperty(_) &&
                  p !== void 0 &&
                  !r.hasOwnProperty(_) &&
                  Nd(e, t, _, void 0, r, p))
            for (d in r)
              ((p = r[d]),
                (m = n[d]),
                !r.hasOwnProperty(d) ||
                  p === m ||
                  (p === void 0 && m === void 0) ||
                  Nd(e, t, d, p, r, m))
            return
          }
      }
      for (var v in n)
        ((p = n[v]),
          n.hasOwnProperty(v) && p != null && !r.hasOwnProperty(v) && Md(e, t, v, null, r, p))
      for (f in r)
        ((p = r[f]),
          (m = n[f]),
          !r.hasOwnProperty(f) || p === m || (p == null && m == null) || Md(e, t, f, p, r, m))
    }
    function Id(e) {
      switch (e) {
        case `css`:
        case `script`:
        case `font`:
        case `img`:
        case `image`:
        case `input`:
        case `link`:
          return !0
        default:
          return !1
      }
    }
    function Ld() {
      if (typeof performance.getEntriesByType == `function`) {
        for (
          var e = 0, t = 0, n = performance.getEntriesByType(`resource`), r = 0;
          r < n.length;
          r++
        ) {
          var i = n[r],
            a = i.transferSize,
            o = i.initiatorType,
            s = i.duration
          if (a && s && Id(o)) {
            for (o = 0, s = i.responseEnd, r += 1; r < n.length; r++) {
              var c = n[r],
                l = c.startTime
              if (l > s) break
              var u = c.transferSize,
                d = c.initiatorType
              u && Id(d) && ((c = c.responseEnd), (o += u * (c < s ? 1 : (s - l) / (c - l))))
            }
            if ((--r, (t += (8 * (a + o)) / (i.duration / 1e3)), e++, 10 < e)) break
          }
        }
        if (0 < e) return t / e / 1e6
      }
      return navigator.connection && ((e = navigator.connection.downlink), typeof e == `number`)
        ? e
        : 5
    }
    var Rd = null,
      zd = null
    function Bd(e) {
      return e.nodeType === 9 ? e : e.ownerDocument
    }
    function Vd(e) {
      switch (e) {
        case `http://www.w3.org/2000/svg`:
          return 1
        case `http://www.w3.org/1998/Math/MathML`:
          return 2
        default:
          return 0
      }
    }
    function Hd(e, t) {
      if (e === 0)
        switch (t) {
          case `svg`:
            return 1
          case `math`:
            return 2
          default:
            return 0
        }
      return e === 1 && t === `foreignObject` ? 0 : e
    }
    function Ud(e, t) {
      return (
        e === `textarea` ||
        e === `noscript` ||
        typeof t.children == `string` ||
        typeof t.children == `number` ||
        typeof t.children == `bigint` ||
        (typeof t.dangerouslySetInnerHTML == `object` &&
          t.dangerouslySetInnerHTML !== null &&
          t.dangerouslySetInnerHTML.__html != null)
      )
    }
    var Wd = null
    function Gd() {
      var e = window.event
      return e && e.type === `popstate` ? e !== Wd && ((Wd = e), !0) : ((Wd = null), !1)
    }
    var Kd = typeof setTimeout == `function` ? setTimeout : void 0,
      qd = typeof clearTimeout == `function` ? clearTimeout : void 0,
      Jd = typeof Promise == `function` ? Promise : void 0,
      Yd =
        typeof queueMicrotask == `function`
          ? queueMicrotask
          : Jd === void 0
            ? Kd
            : function (e) {
                return Jd.resolve(null).then(e).catch(Xd)
              }
    function Xd(e) {
      setTimeout(function () {
        throw e
      })
    }
    function Zd(e) {
      return e === `head`
    }
    function Qd(e, t) {
      var n = t,
        r = 0
      do {
        var i = n.nextSibling
        if ((e.removeChild(n), i && i.nodeType === 8)) {
          if (((n = i.data), n === `/$` || n === `/&`)) {
            if (r === 0) {
              ;(e.removeChild(i), Np(t))
              return
            }
            r--
          } else if (n === `$` || n === `$?` || n === `$~` || n === `$!` || n === `&`) r++
          else if (n === `html`) pf(e.ownerDocument.documentElement)
          else if (n === `head`) {
            ;((n = e.ownerDocument.head), pf(n))
            for (var a = n.firstChild; a;) {
              var o = a.nextSibling,
                s = a.nodeName
              ;(a[ht] ||
                s === `SCRIPT` ||
                s === `STYLE` ||
                (s === `LINK` && a.rel.toLowerCase() === `stylesheet`) ||
                n.removeChild(a),
                (a = o))
            }
          } else n === `body` && pf(e.ownerDocument.body)
        }
        n = i
      } while (n)
      Np(t)
    }
    function $d(e, t) {
      var n = e
      e = 0
      do {
        var r = n.nextSibling
        if (
          (n.nodeType === 1
            ? t
              ? ((n._stashedDisplay = n.style.display), (n.style.display = `none`))
              : ((n.style.display = n._stashedDisplay || ``),
                n.getAttribute(`style`) === `` && n.removeAttribute(`style`))
            : n.nodeType === 3 &&
              (t
                ? ((n._stashedText = n.nodeValue), (n.nodeValue = ``))
                : (n.nodeValue = n._stashedText || ``)),
          r && r.nodeType === 8)
        ) {
          if (((n = r.data), n === `/$`)) {
            if (e === 0) break
            e--
          } else (n !== `$` && n !== `$?` && n !== `$~` && n !== `$!`) || e++
        }
        n = r
      } while (n)
    }
    function ef(e) {
      var t = e.firstChild
      for (t && t.nodeType === 10 && (t = t.nextSibling); t;) {
        var n = t
        switch (((t = t.nextSibling), n.nodeName)) {
          case `HTML`:
          case `HEAD`:
          case `BODY`:
            ;(ef(n), gt(n))
            continue
          case `SCRIPT`:
          case `STYLE`:
            continue
          case `LINK`:
            if (n.rel.toLowerCase() === `stylesheet`) continue
        }
        e.removeChild(n)
      }
    }
    function tf(e, t, n, r) {
      for (; e.nodeType === 1;) {
        var i = n
        if (e.nodeName.toLowerCase() !== t.toLowerCase()) {
          if (!r && (e.nodeName !== `INPUT` || e.type !== `hidden`)) break
        } else if (!r) {
          if (t === `input` && e.type === `hidden`) {
            var a = i.name == null ? null : `` + i.name
            if (i.type === `hidden` && e.getAttribute(`name`) === a) return e
          } else return e
        } else if (!e[ht])
          switch (t) {
            case `meta`:
              if (!e.hasAttribute(`itemprop`)) break
              return e
            case `link`:
              if (
                ((a = e.getAttribute(`rel`)),
                (a === `stylesheet` && e.hasAttribute(`data-precedence`)) ||
                  a !== i.rel ||
                  e.getAttribute(`href`) !== (i.href == null || i.href === `` ? null : i.href) ||
                  e.getAttribute(`crossorigin`) !==
                    (i.crossOrigin == null ? null : i.crossOrigin) ||
                  e.getAttribute(`title`) !== (i.title == null ? null : i.title))
              )
                break
              return e
            case `style`:
              if (e.hasAttribute(`data-precedence`)) break
              return e
            case `script`:
              if (
                ((a = e.getAttribute(`src`)),
                (a !== (i.src == null ? null : i.src) ||
                  e.getAttribute(`type`) !== (i.type == null ? null : i.type) ||
                  e.getAttribute(`crossorigin`) !==
                    (i.crossOrigin == null ? null : i.crossOrigin)) &&
                  a &&
                  e.hasAttribute(`async`) &&
                  !e.hasAttribute(`itemprop`))
              )
                break
              return e
            default:
              return e
          }
        if (((e = cf(e.nextSibling)), e === null)) break
      }
      return null
    }
    function nf(e, t, n) {
      if (t === ``) return null
      for (; e.nodeType !== 3;)
        if (
          ((e.nodeType !== 1 || e.nodeName !== `INPUT` || e.type !== `hidden`) && !n) ||
          ((e = cf(e.nextSibling)), e === null)
        )
          return null
      return e
    }
    function rf(e, t) {
      for (; e.nodeType !== 8;)
        if (
          ((e.nodeType !== 1 || e.nodeName !== `INPUT` || e.type !== `hidden`) && !t) ||
          ((e = cf(e.nextSibling)), e === null)
        )
          return null
      return e
    }
    function af(e) {
      return e.data === `$?` || e.data === `$~`
    }
    function of(e) {
      return e.data === `$!` || (e.data === `$?` && e.ownerDocument.readyState !== `loading`)
    }
    function sf(e, t) {
      var n = e.ownerDocument
      if (e.data === `$~`) e._reactRetry = t
      else if (e.data !== `$?` || n.readyState !== `loading`) t()
      else {
        var r = function () {
          ;(t(), n.removeEventListener(`DOMContentLoaded`, r))
        }
        ;(n.addEventListener(`DOMContentLoaded`, r), (e._reactRetry = r))
      }
    }
    function cf(e) {
      for (; e != null; e = e.nextSibling) {
        var t = e.nodeType
        if (t === 1 || t === 3) break
        if (t === 8) {
          if (
            ((t = e.data),
            t === `$` ||
              t === `$!` ||
              t === `$?` ||
              t === `$~` ||
              t === `&` ||
              t === `F!` ||
              t === `F`)
          )
            break
          if (t === `/$` || t === `/&`) return null
        }
      }
      return e
    }
    var lf = null
    function uf(e) {
      e = e.nextSibling
      for (var t = 0; e;) {
        if (e.nodeType === 8) {
          var n = e.data
          if (n === `/$` || n === `/&`) {
            if (t === 0) return cf(e.nextSibling)
            t--
          } else (n !== `$` && n !== `$!` && n !== `$?` && n !== `$~` && n !== `&`) || t++
        }
        e = e.nextSibling
      }
      return null
    }
    function df(e) {
      e = e.previousSibling
      for (var t = 0; e;) {
        if (e.nodeType === 8) {
          var n = e.data
          if (n === `$` || n === `$!` || n === `$?` || n === `$~` || n === `&`) {
            if (t === 0) return e
            t--
          } else (n !== `/$` && n !== `/&`) || t++
        }
        e = e.previousSibling
      }
      return null
    }
    function ff(e, t, n) {
      switch (((t = Bd(n)), e)) {
        case `html`:
          if (((e = t.documentElement), !e)) throw Error(i(452))
          return e
        case `head`:
          if (((e = t.head), !e)) throw Error(i(453))
          return e
        case `body`:
          if (((e = t.body), !e)) throw Error(i(454))
          return e
        default:
          throw Error(i(451))
      }
    }
    function pf(e) {
      for (var t = e.attributes; t.length;) e.removeAttributeNode(t[0])
      gt(e)
    }
    var mf = new Map(),
      hf = new Set()
    function gf(e) {
      return typeof e.getRootNode == `function`
        ? e.getRootNode()
        : e.nodeType === 9
          ? e
          : e.ownerDocument
    }
    var _f = j.d
    j.d = { f: vf, r: yf, D: Sf, C: Cf, L: wf, m: Tf, X: Df, S: Ef, M: Of }
    function vf() {
      var e = _f.f(),
        t = vu()
      return e || t
    }
    function yf(e) {
      var t = vt(e)
      t !== null && t.tag === 5 && t.type === `form` ? Ts(t) : _f.r(e)
    }
    var bf = typeof document > `u` ? null : document
    function xf(e, t, n) {
      var r = bf
      if (r && typeof t == `string` && t) {
        var i = Bt(t)
        ;((i = `link[rel="` + e + `"][href="` + i + `"]`),
          typeof n == `string` && (i += `[crossorigin="` + n + `"]`),
          hf.has(i) ||
            (hf.add(i),
            (e = { rel: e, crossOrigin: n, href: t }),
            r.querySelector(i) === null &&
              ((t = r.createElement(`link`)), Pd(t, `link`, e), xt(t), r.head.appendChild(t))))
      }
    }
    function Sf(e) {
      ;(_f.D(e), xf(`dns-prefetch`, e, null))
    }
    function Cf(e, t) {
      ;(_f.C(e, t), xf(`preconnect`, e, t))
    }
    function wf(e, t, n) {
      _f.L(e, t, n)
      var r = bf
      if (r && e && t) {
        var i = `link[rel="preload"][as="` + Bt(t) + `"]`
        t === `image` && n && n.imageSrcSet
          ? ((i += `[imagesrcset="` + Bt(n.imageSrcSet) + `"]`),
            typeof n.imageSizes == `string` && (i += `[imagesizes="` + Bt(n.imageSizes) + `"]`))
          : (i += `[href="` + Bt(e) + `"]`)
        var a = i
        switch (t) {
          case `style`:
            a = Af(e)
            break
          case `script`:
            a = Pf(e)
        }
        mf.has(a) ||
          ((e = h(
            { rel: `preload`, href: t === `image` && n && n.imageSrcSet ? void 0 : e, as: t },
            n,
          )),
          mf.set(a, e),
          r.querySelector(i) !== null ||
            (t === `style` && r.querySelector(jf(a))) ||
            (t === `script` && r.querySelector(Ff(a))) ||
            ((t = r.createElement(`link`)), Pd(t, `link`, e), xt(t), r.head.appendChild(t)))
      }
    }
    function Tf(e, t) {
      _f.m(e, t)
      var n = bf
      if (n && e) {
        var r = t && typeof t.as == `string` ? t.as : `script`,
          i = `link[rel="modulepreload"][as="` + Bt(r) + `"][href="` + Bt(e) + `"]`,
          a = i
        switch (r) {
          case `audioworklet`:
          case `paintworklet`:
          case `serviceworker`:
          case `sharedworker`:
          case `worker`:
          case `script`:
            a = Pf(e)
        }
        if (
          !mf.has(a) &&
          ((e = h({ rel: `modulepreload`, href: e }, t)), mf.set(a, e), n.querySelector(i) === null)
        ) {
          switch (r) {
            case `audioworklet`:
            case `paintworklet`:
            case `serviceworker`:
            case `sharedworker`:
            case `worker`:
            case `script`:
              if (n.querySelector(Ff(a))) return
          }
          ;((r = n.createElement(`link`)), Pd(r, `link`, e), xt(r), n.head.appendChild(r))
        }
      }
    }
    function Ef(e, t, n) {
      _f.S(e, t, n)
      var r = bf
      if (r && e) {
        var i = bt(r).hoistableStyles,
          a = Af(e)
        t ||= `default`
        var o = i.get(a)
        if (!o) {
          var s = { loading: 0, preload: null }
          if ((o = r.querySelector(jf(a)))) s.loading = 5
          else {
            ;((e = h({ rel: `stylesheet`, href: e, "data-precedence": t }, n)),
              (n = mf.get(a)) && Rf(e, n))
            var c = (o = r.createElement(`link`))
            ;(xt(c),
              Pd(c, `link`, e),
              (c._p = new Promise(function (e, t) {
                ;((c.onload = e), (c.onerror = t))
              })),
              c.addEventListener(`load`, function () {
                s.loading |= 1
              }),
              c.addEventListener(`error`, function () {
                s.loading |= 2
              }),
              (s.loading |= 4),
              Lf(o, t, r))
          }
          ;((o = { type: `stylesheet`, instance: o, count: 1, state: s }), i.set(a, o))
        }
      }
    }
    function Df(e, t) {
      _f.X(e, t)
      var n = bf
      if (n && e) {
        var r = bt(n).hoistableScripts,
          i = Pf(e),
          a = r.get(i)
        a ||
          ((a = n.querySelector(Ff(i))),
          a ||
            ((e = h({ src: e, async: !0 }, t)),
            (t = mf.get(i)) && zf(e, t),
            (a = n.createElement(`script`)),
            xt(a),
            Pd(a, `link`, e),
            n.head.appendChild(a)),
          (a = { type: `script`, instance: a, count: 1, state: null }),
          r.set(i, a))
      }
    }
    function Of(e, t) {
      _f.M(e, t)
      var n = bf
      if (n && e) {
        var r = bt(n).hoistableScripts,
          i = Pf(e),
          a = r.get(i)
        a ||
          ((a = n.querySelector(Ff(i))),
          a ||
            ((e = h({ src: e, async: !0, type: `module` }, t)),
            (t = mf.get(i)) && zf(e, t),
            (a = n.createElement(`script`)),
            xt(a),
            Pd(a, `link`, e),
            n.head.appendChild(a)),
          (a = { type: `script`, instance: a, count: 1, state: null }),
          r.set(i, a))
      }
    }
    function kf(e, t, n, r) {
      var a = (a = ue.current) ? gf(a) : null
      if (!a) throw Error(i(446))
      switch (e) {
        case `meta`:
        case `title`:
          return null
        case `style`:
          return typeof n.precedence == `string` && typeof n.href == `string`
            ? ((t = Af(n.href)),
              (n = bt(a).hoistableStyles),
              (r = n.get(t)),
              r || ((r = { type: `style`, instance: null, count: 0, state: null }), n.set(t, r)),
              r)
            : { type: `void`, instance: null, count: 0, state: null }
        case `link`:
          if (
            n.rel === `stylesheet` &&
            typeof n.href == `string` &&
            typeof n.precedence == `string`
          ) {
            e = Af(n.href)
            var o = bt(a).hoistableStyles,
              s = o.get(e)
            if (
              (s ||
                ((a = a.ownerDocument || a),
                (s = {
                  type: `stylesheet`,
                  instance: null,
                  count: 0,
                  state: { loading: 0, preload: null },
                }),
                o.set(e, s),
                (o = a.querySelector(jf(e))) && !o._p && ((s.instance = o), (s.state.loading = 5)),
                mf.has(e) ||
                  ((n = {
                    rel: `preload`,
                    as: `style`,
                    href: n.href,
                    crossOrigin: n.crossOrigin,
                    integrity: n.integrity,
                    media: n.media,
                    hrefLang: n.hrefLang,
                    referrerPolicy: n.referrerPolicy,
                  }),
                  mf.set(e, n),
                  o || Nf(a, e, n, s.state))),
              t && r === null)
            )
              throw Error(i(528, ``))
            return s
          }
          if (t && r !== null) throw Error(i(529, ``))
          return null
        case `script`:
          return (
            (t = n.async),
            (n = n.src),
            typeof n == `string` && t && typeof t != `function` && typeof t != `symbol`
              ? ((t = Pf(n)),
                (n = bt(a).hoistableScripts),
                (r = n.get(t)),
                r || ((r = { type: `script`, instance: null, count: 0, state: null }), n.set(t, r)),
                r)
              : { type: `void`, instance: null, count: 0, state: null }
          )
        default:
          throw Error(i(444, e))
      }
    }
    function Af(e) {
      return `href="` + Bt(e) + `"`
    }
    function jf(e) {
      return `link[rel="stylesheet"][` + e + `]`
    }
    function Mf(e) {
      return h({}, e, { "data-precedence": e.precedence, precedence: null })
    }
    function Nf(e, t, n, r) {
      e.querySelector(`link[rel="preload"][as="style"][` + t + `]`)
        ? (r.loading = 1)
        : ((t = e.createElement(`link`)),
          (r.preload = t),
          t.addEventListener(`load`, function () {
            return (r.loading |= 1)
          }),
          t.addEventListener(`error`, function () {
            return (r.loading |= 2)
          }),
          Pd(t, `link`, n),
          xt(t),
          e.head.appendChild(t))
    }
    function Pf(e) {
      return `[src="` + Bt(e) + `"]`
    }
    function Ff(e) {
      return `script[async]` + e
    }
    function If(e, t, n) {
      if ((t.count++, t.instance === null))
        switch (t.type) {
          case `style`:
            var r = e.querySelector(`style[data-href~="` + Bt(n.href) + `"]`)
            if (r) return ((t.instance = r), xt(r), r)
            var a = h({}, n, {
              "data-href": n.href,
              "data-precedence": n.precedence,
              href: null,
              precedence: null,
            })
            return (
              (r = (e.ownerDocument || e).createElement(`style`)),
              xt(r),
              Pd(r, `style`, a),
              Lf(r, n.precedence, e),
              (t.instance = r)
            )
          case `stylesheet`:
            a = Af(n.href)
            var o = e.querySelector(jf(a))
            if (o) return ((t.state.loading |= 4), (t.instance = o), xt(o), o)
            ;((r = Mf(n)),
              (a = mf.get(a)) && Rf(r, a),
              (o = (e.ownerDocument || e).createElement(`link`)),
              xt(o))
            var s = o
            return (
              (s._p = new Promise(function (e, t) {
                ;((s.onload = e), (s.onerror = t))
              })),
              Pd(o, `link`, r),
              (t.state.loading |= 4),
              Lf(o, n.precedence, e),
              (t.instance = o)
            )
          case `script`:
            return (
              (o = Pf(n.src)),
              (a = e.querySelector(Ff(o)))
                ? ((t.instance = a), xt(a), a)
                : ((r = n),
                  (a = mf.get(o)) && ((r = h({}, n)), zf(r, a)),
                  (e = e.ownerDocument || e),
                  (a = e.createElement(`script`)),
                  xt(a),
                  Pd(a, `link`, r),
                  e.head.appendChild(a),
                  (t.instance = a))
            )
          case `void`:
            return null
          default:
            throw Error(i(443, t.type))
        }
      else
        t.type === `stylesheet` &&
          !(t.state.loading & 4) &&
          ((r = t.instance), (t.state.loading |= 4), Lf(r, n.precedence, e))
      return t.instance
    }
    function Lf(e, t, n) {
      for (
        var r = n.querySelectorAll(
            `link[rel="stylesheet"][data-precedence],style[data-precedence]`,
          ),
          i = r.length ? r[r.length - 1] : null,
          a = i,
          o = 0;
        o < r.length;
        o++
      ) {
        var s = r[o]
        if (s.dataset.precedence === t) a = s
        else if (a !== i) break
      }
      a
        ? a.parentNode.insertBefore(e, a.nextSibling)
        : ((t = n.nodeType === 9 ? n.head : n), t.insertBefore(e, t.firstChild))
    }
    function Rf(e, t) {
      ;((e.crossOrigin ??= t.crossOrigin),
        (e.referrerPolicy ??= t.referrerPolicy),
        (e.title ??= t.title))
    }
    function zf(e, t) {
      ;((e.crossOrigin ??= t.crossOrigin),
        (e.referrerPolicy ??= t.referrerPolicy),
        (e.integrity ??= t.integrity))
    }
    var Bf = null
    function Vf(e, t, n) {
      if (Bf === null) {
        var r = new Map(),
          i = (Bf = new Map())
        i.set(n, r)
      } else ((i = Bf), (r = i.get(n)), r || ((r = new Map()), i.set(n, r)))
      if (r.has(e)) return r
      for (r.set(e, null), n = n.getElementsByTagName(e), i = 0; i < n.length; i++) {
        var a = n[i]
        if (
          !(a[ht] || a[ct] || (e === `link` && a.getAttribute(`rel`) === `stylesheet`)) &&
          a.namespaceURI !== `http://www.w3.org/2000/svg`
        ) {
          var o = a.getAttribute(t) || ``
          o = e + o
          var s = r.get(o)
          s ? s.push(a) : r.set(o, [a])
        }
      }
      return r
    }
    function Hf(e, t, n) {
      ;((e = e.ownerDocument || e),
        e.head.insertBefore(n, t === `title` ? e.querySelector(`head > title`) : null))
    }
    function Uf(e, t, n) {
      if (n === 1 || t.itemProp != null) return !1
      switch (e) {
        case `meta`:
        case `title`:
          return !0
        case `style`:
          if (typeof t.precedence != `string` || typeof t.href != `string` || t.href === ``) break
          return !0
        case `link`:
          if (
            typeof t.rel != `string` ||
            typeof t.href != `string` ||
            t.href === `` ||
            t.onLoad ||
            t.onError
          )
            break
          switch (t.rel) {
            case `stylesheet`:
              return ((e = t.disabled), typeof t.precedence == `string` && e == null)
            default:
              return !0
          }
        case `script`:
          if (
            t.async &&
            typeof t.async != `function` &&
            typeof t.async != `symbol` &&
            !t.onLoad &&
            !t.onError &&
            t.src &&
            typeof t.src == `string`
          )
            return !0
      }
      return !1
    }
    function Wf(e) {
      return !(e.type === `stylesheet` && !(e.state.loading & 3))
    }
    function Gf(e, t, n, r) {
      if (
        n.type === `stylesheet` &&
        (typeof r.media != `string` || !1 !== matchMedia(r.media).matches) &&
        !(n.state.loading & 4)
      ) {
        if (n.instance === null) {
          var i = Af(r.href),
            a = t.querySelector(jf(i))
          if (a) {
            ;((t = a._p),
              typeof t == `object` &&
                t &&
                typeof t.then == `function` &&
                (e.count++, (e = Jf.bind(e)), t.then(e, e)),
              (n.state.loading |= 4),
              (n.instance = a),
              xt(a))
            return
          }
          ;((a = t.ownerDocument || t),
            (r = Mf(r)),
            (i = mf.get(i)) && Rf(r, i),
            (a = a.createElement(`link`)),
            xt(a))
          var o = a
          ;((o._p = new Promise(function (e, t) {
            ;((o.onload = e), (o.onerror = t))
          })),
            Pd(a, `link`, r),
            (n.instance = a))
        }
        ;(e.stylesheets === null && (e.stylesheets = new Map()),
          e.stylesheets.set(n, t),
          (t = n.state.preload) &&
            !(n.state.loading & 3) &&
            (e.count++,
            (n = Jf.bind(e)),
            t.addEventListener(`load`, n),
            t.addEventListener(`error`, n)))
      }
    }
    var Kf = 0
    function qf(e, t) {
      return (
        e.stylesheets && e.count === 0 && Xf(e, e.stylesheets),
        0 < e.count || 0 < e.imgCount
          ? function (n) {
              var r = setTimeout(function () {
                if ((e.stylesheets && Xf(e, e.stylesheets), e.unsuspend)) {
                  var t = e.unsuspend
                  ;((e.unsuspend = null), t())
                }
              }, 6e4 + t)
              0 < e.imgBytes && Kf === 0 && (Kf = 62500 * Ld())
              var i = setTimeout(
                function () {
                  if (
                    ((e.waitingForImages = !1),
                    e.count === 0 && (e.stylesheets && Xf(e, e.stylesheets), e.unsuspend))
                  ) {
                    var t = e.unsuspend
                    ;((e.unsuspend = null), t())
                  }
                },
                (e.imgBytes > Kf ? 50 : 800) + t,
              )
              return (
                (e.unsuspend = n),
                function () {
                  ;((e.unsuspend = null), clearTimeout(r), clearTimeout(i))
                }
              )
            }
          : null
      )
    }
    function Jf() {
      if ((this.count--, this.count === 0 && (this.imgCount === 0 || !this.waitingForImages))) {
        if (this.stylesheets) Xf(this, this.stylesheets)
        else if (this.unsuspend) {
          var e = this.unsuspend
          ;((this.unsuspend = null), e())
        }
      }
    }
    var Yf = null
    function Xf(e, t) {
      ;((e.stylesheets = null),
        e.unsuspend !== null &&
          (e.count++, (Yf = new Map()), t.forEach(Zf, e), (Yf = null), Jf.call(e)))
    }
    function Zf(e, t) {
      if (!(t.state.loading & 4)) {
        var n = Yf.get(e)
        if (n) var r = n.get(null)
        else {
          ;((n = new Map()), Yf.set(e, n))
          for (
            var i = e.querySelectorAll(`link[data-precedence],style[data-precedence]`), a = 0;
            a < i.length;
            a++
          ) {
            var o = i[a]
            ;(o.nodeName === `LINK` || o.getAttribute(`media`) !== `not all`) &&
              (n.set(o.dataset.precedence, o), (r = o))
          }
          r && n.set(null, r)
        }
        ;((i = t.instance),
          (o = i.getAttribute(`data-precedence`)),
          (a = n.get(o) || r),
          a === r && n.set(null, i),
          n.set(o, i),
          this.count++,
          (r = Jf.bind(this)),
          i.addEventListener(`load`, r),
          i.addEventListener(`error`, r),
          a
            ? a.parentNode.insertBefore(i, a.nextSibling)
            : ((e = e.nodeType === 9 ? e.head : e), e.insertBefore(i, e.firstChild)),
          (t.state.loading |= 4))
      }
    }
    var Qf = {
      $$typeof: C,
      Provider: null,
      Consumer: null,
      _currentValue: oe,
      _currentValue2: oe,
      _threadCount: 0,
    }
    function $f(e, t, n, r, i, a, o, s, c) {
      ;((this.tag = 1),
        (this.containerInfo = e),
        (this.pingCache = this.current = this.pendingChildren = null),
        (this.timeoutHandle = -1),
        (this.callbackNode =
          this.next =
          this.pendingContext =
          this.context =
          this.cancelPendingCommit =
            null),
        (this.callbackPriority = 0),
        (this.expirationTimes = Ze(-1)),
        (this.entangledLanes =
          this.shellSuspendCounter =
          this.errorRecoveryDisabledLanes =
          this.expiredLanes =
          this.warmLanes =
          this.pingedLanes =
          this.suspendedLanes =
          this.pendingLanes =
            0),
        (this.entanglements = Ze(0)),
        (this.hiddenUpdates = Ze(null)),
        (this.identifierPrefix = r),
        (this.onUncaughtError = i),
        (this.onCaughtError = a),
        (this.onRecoverableError = o),
        (this.pooledCache = null),
        (this.pooledCacheLanes = 0),
        (this.formState = c),
        (this.incompleteTransitions = new Map()))
    }
    function ep(e, t, n, r, i, a, o, s, c, l, u, d) {
      return (
        (e = new $f(e, t, n, o, c, l, u, d, s)),
        (t = 1),
        !0 === a && (t |= 24),
        (a = li(3, null, null, t)),
        (e.current = a),
        (a.stateNode = e),
        (t = ca()),
        t.refCount++,
        (e.pooledCache = t),
        t.refCount++,
        (a.memoizedState = { element: r, isDehydrated: n, cache: t }),
        Va(a),
        e
      )
    }
    function tp(e) {
      return e ? ((e = si), e) : si
    }
    function np(e, t, n, r, i, a) {
      ;((i = tp(i)),
        r.context === null ? (r.context = i) : (r.pendingContext = i),
        (r = Ua(t)),
        (r.payload = { element: n }),
        (a = a === void 0 ? null : a),
        a !== null && (r.callback = a),
        (n = Wa(e, r, t)),
        n !== null && (pu(n, e, t), Ga(n, e, t)))
    }
    function rp(e, t) {
      if (((e = e.memoizedState), e !== null && e.dehydrated !== null)) {
        var n = e.retryLane
        e.retryLane = n !== 0 && n < t ? n : t
      }
    }
    function ip(e, t) {
      ;(rp(e, t), (e = e.alternate) && rp(e, t))
    }
    function ap(e) {
      if (e.tag === 13 || e.tag === 31) {
        var t = ii(e, 67108864)
        ;(t !== null && pu(t, e, 67108864), ip(e, 67108864))
      }
    }
    function op(e) {
      if (e.tag === 13 || e.tag === 31) {
        var t = du()
        t = rt(t)
        var n = ii(e, t)
        ;(n !== null && pu(n, e, t), ip(e, t))
      }
    }
    var sp = !0
    function cp(e, t, n, r) {
      var i = A.T
      A.T = null
      var a = j.p
      try {
        ;((j.p = 2), up(e, t, n, r))
      } finally {
        ;((j.p = a), (A.T = i))
      }
    }
    function lp(e, t, n, r) {
      var i = A.T
      A.T = null
      var a = j.p
      try {
        ;((j.p = 8), up(e, t, n, r))
      } finally {
        ;((j.p = a), (A.T = i))
      }
    }
    function up(e, t, n, r) {
      if (sp) {
        var i = dp(r)
        if (i === null) (Cd(e, t, r, fp, n), Cp(e, r))
        else if (Tp(i, e, t, n, r)) r.stopPropagation()
        else if ((Cp(e, r), t & 4 && -1 < Sp.indexOf(e))) {
          for (; i !== null;) {
            var a = vt(i)
            if (a !== null)
              switch (a.tag) {
                case 3:
                  if (((a = a.stateNode), a.current.memoizedState.isDehydrated)) {
                    var o = Ke(a.pendingLanes)
                    if (o !== 0) {
                      var s = a
                      for (s.pendingLanes |= 2, s.entangledLanes |= 2; o;) {
                        var c = 1 << (31 - ze(o))
                        ;((s.entanglements[1] |= c), (o &= ~c))
                      }
                      ;(nd(a), !(Y & 6) && (($l = De() + 500), rd(0, !1)))
                    }
                  }
                  break
                case 31:
                case 13:
                  ;((s = ii(a, 2)), s !== null && pu(s, a, 2), vu(), ip(a, 2))
              }
            if (((a = dp(r)), a === null && Cd(e, t, r, fp, n), a === i)) break
            i = a
          }
          i !== null && r.stopPropagation()
        } else Cd(e, t, r, null, n)
      }
    }
    function dp(e) {
      return ((e = rn(e)), pp(e))
    }
    var fp = null
    function pp(e) {
      if (((fp = null), (e = _t(e)), e !== null)) {
        var t = o(e)
        if (t === null) e = null
        else {
          var n = t.tag
          if (n === 13) {
            if (((e = s(t)), e !== null)) return e
            e = null
          } else if (n === 31) {
            if (((e = c(t)), e !== null)) return e
            e = null
          } else if (n === 3) {
            if (t.stateNode.current.memoizedState.isDehydrated)
              return t.tag === 3 ? t.stateNode.containerInfo : null
            e = null
          } else t !== e && (e = null)
        }
      }
      return ((fp = e), null)
    }
    function mp(e) {
      switch (e) {
        case `beforetoggle`:
        case `cancel`:
        case `click`:
        case `close`:
        case `contextmenu`:
        case `copy`:
        case `cut`:
        case `auxclick`:
        case `dblclick`:
        case `dragend`:
        case `dragstart`:
        case `drop`:
        case `focusin`:
        case `focusout`:
        case `input`:
        case `invalid`:
        case `keydown`:
        case `keypress`:
        case `keyup`:
        case `mousedown`:
        case `mouseup`:
        case `paste`:
        case `pause`:
        case `play`:
        case `pointercancel`:
        case `pointerdown`:
        case `pointerup`:
        case `ratechange`:
        case `reset`:
        case `resize`:
        case `seeked`:
        case `submit`:
        case `toggle`:
        case `touchcancel`:
        case `touchend`:
        case `touchstart`:
        case `volumechange`:
        case `change`:
        case `selectionchange`:
        case `textInput`:
        case `compositionstart`:
        case `compositionend`:
        case `compositionupdate`:
        case `beforeblur`:
        case `afterblur`:
        case `beforeinput`:
        case `blur`:
        case `fullscreenchange`:
        case `focus`:
        case `hashchange`:
        case `popstate`:
        case `select`:
        case `selectstart`:
          return 2
        case `drag`:
        case `dragenter`:
        case `dragexit`:
        case `dragleave`:
        case `dragover`:
        case `mousemove`:
        case `mouseout`:
        case `mouseover`:
        case `pointermove`:
        case `pointerout`:
        case `pointerover`:
        case `scroll`:
        case `touchmove`:
        case `wheel`:
        case `mouseenter`:
        case `mouseleave`:
        case `pointerenter`:
        case `pointerleave`:
          return 8
        case `message`:
          switch (Oe()) {
            case ke:
              return 2
            case Ae:
              return 8
            case je:
            case Me:
              return 32
            case Ne:
              return 268435456
            default:
              return 32
          }
        default:
          return 32
      }
    }
    var hp = !1,
      gp = null,
      _p = null,
      vp = null,
      yp = new Map(),
      bp = new Map(),
      xp = [],
      Sp =
        `mousedown mouseup touchcancel touchend touchstart auxclick dblclick pointercancel pointerdown pointerup dragend dragstart drop compositionend compositionstart keydown keypress keyup input textInput copy cut paste click change contextmenu reset`.split(
          ` `,
        )
    function Cp(e, t) {
      switch (e) {
        case `focusin`:
        case `focusout`:
          gp = null
          break
        case `dragenter`:
        case `dragleave`:
          _p = null
          break
        case `mouseover`:
        case `mouseout`:
          vp = null
          break
        case `pointerover`:
        case `pointerout`:
          yp.delete(t.pointerId)
          break
        case `gotpointercapture`:
        case `lostpointercapture`:
          bp.delete(t.pointerId)
      }
    }
    function wp(e, t, n, r, i, a) {
      return e === null || e.nativeEvent !== a
        ? ((e = {
            blockedOn: t,
            domEventName: n,
            eventSystemFlags: r,
            nativeEvent: a,
            targetContainers: [i],
          }),
          t !== null && ((t = vt(t)), t !== null && ap(t)),
          e)
        : ((e.eventSystemFlags |= r),
          (t = e.targetContainers),
          i !== null && t.indexOf(i) === -1 && t.push(i),
          e)
    }
    function Tp(e, t, n, r, i) {
      switch (t) {
        case `focusin`:
          return ((gp = wp(gp, e, t, n, r, i)), !0)
        case `dragenter`:
          return ((_p = wp(_p, e, t, n, r, i)), !0)
        case `mouseover`:
          return ((vp = wp(vp, e, t, n, r, i)), !0)
        case `pointerover`:
          var a = i.pointerId
          return (yp.set(a, wp(yp.get(a) || null, e, t, n, r, i)), !0)
        case `gotpointercapture`:
          return ((a = i.pointerId), bp.set(a, wp(bp.get(a) || null, e, t, n, r, i)), !0)
      }
      return !1
    }
    function Ep(e) {
      var t = _t(e.target)
      if (t !== null) {
        var n = o(t)
        if (n !== null) {
          if (((t = n.tag), t === 13)) {
            if (((t = s(n)), t !== null)) {
              ;((e.blockedOn = t),
                ot(e.priority, function () {
                  op(n)
                }))
              return
            }
          } else if (t === 31) {
            if (((t = c(n)), t !== null)) {
              ;((e.blockedOn = t),
                ot(e.priority, function () {
                  op(n)
                }))
              return
            }
          } else if (t === 3 && n.stateNode.current.memoizedState.isDehydrated) {
            e.blockedOn = n.tag === 3 ? n.stateNode.containerInfo : null
            return
          }
        }
      }
      e.blockedOn = null
    }
    function Dp(e) {
      if (e.blockedOn !== null) return !1
      for (var t = e.targetContainers; 0 < t.length;) {
        var n = dp(e.nativeEvent)
        if (n === null) {
          n = e.nativeEvent
          var r = new n.constructor(n.type, n)
          ;((nn = r), n.target.dispatchEvent(r), (nn = null))
        } else return ((t = vt(n)), t !== null && ap(t), (e.blockedOn = n), !1)
        t.shift()
      }
      return !0
    }
    function Op(e, t, n) {
      Dp(e) && n.delete(t)
    }
    function kp() {
      ;((hp = !1),
        gp !== null && Dp(gp) && (gp = null),
        _p !== null && Dp(_p) && (_p = null),
        vp !== null && Dp(vp) && (vp = null),
        yp.forEach(Op),
        bp.forEach(Op))
    }
    function Ap(e, n) {
      e.blockedOn === n &&
        ((e.blockedOn = null),
        hp || ((hp = !0), t.unstable_scheduleCallback(t.unstable_NormalPriority, kp)))
    }
    var jp = null
    function Mp(e) {
      jp !== e &&
        ((jp = e),
        t.unstable_scheduleCallback(t.unstable_NormalPriority, function () {
          jp === e && (jp = null)
          for (var t = 0; t < e.length; t += 3) {
            var n = e[t],
              r = e[t + 1],
              i = e[t + 2]
            if (typeof r != `function`) {
              if (pp(r || n) === null) continue
              break
            }
            var a = vt(n)
            a !== null &&
              (e.splice(t, 3),
              (t -= 3),
              Cs(a, { pending: !0, data: i, method: n.method, action: r }, r, i))
          }
        }))
    }
    function Np(e) {
      function t(t) {
        return Ap(t, e)
      }
      ;(gp !== null && Ap(gp, e),
        _p !== null && Ap(_p, e),
        vp !== null && Ap(vp, e),
        yp.forEach(t),
        bp.forEach(t))
      for (var n = 0; n < xp.length; n++) {
        var r = xp[n]
        r.blockedOn === e && (r.blockedOn = null)
      }
      for (; 0 < xp.length && ((n = xp[0]), n.blockedOn === null);)
        (Ep(n), n.blockedOn === null && xp.shift())
      if (((n = (e.ownerDocument || e).$$reactFormReplay), n != null))
        for (r = 0; r < n.length; r += 3) {
          var i = n[r],
            a = n[r + 1],
            o = i[lt] || null
          if (typeof a == `function`) o || Mp(n)
          else if (o) {
            var s = null
            if (a && a.hasAttribute(`formAction`)) {
              if (((i = a), (o = a[lt] || null))) s = o.formAction
              else if (pp(i) !== null) continue
            } else s = o.action
            ;(typeof s == `function` ? (n[r + 1] = s) : (n.splice(r, 3), (r -= 3)), Mp(n))
          }
        }
    }
    function Pp() {
      function e(e) {
        e.canIntercept &&
          e.info === `react-transition` &&
          e.intercept({
            handler: function () {
              return new Promise(function (e) {
                return (i = e)
              })
            },
            focusReset: `manual`,
            scroll: `manual`,
          })
      }
      function t() {
        ;(i !== null && (i(), (i = null)), r || setTimeout(n, 20))
      }
      function n() {
        if (!r && !navigation.transition) {
          var e = navigation.currentEntry
          e &&
            e.url != null &&
            navigation.navigate(e.url, {
              state: e.getState(),
              info: `react-transition`,
              history: `replace`,
            })
        }
      }
      if (typeof navigation == `object`) {
        var r = !1,
          i = null
        return (
          navigation.addEventListener(`navigate`, e),
          navigation.addEventListener(`navigatesuccess`, t),
          navigation.addEventListener(`navigateerror`, t),
          setTimeout(n, 100),
          function () {
            ;((r = !0),
              navigation.removeEventListener(`navigate`, e),
              navigation.removeEventListener(`navigatesuccess`, t),
              navigation.removeEventListener(`navigateerror`, t),
              i !== null && (i(), (i = null)))
          }
        )
      }
    }
    function Fp(e) {
      this._internalRoot = e
    }
    ;((Ip.prototype.render = Fp.prototype.render =
      function (e) {
        var t = this._internalRoot
        if (t === null) throw Error(i(409))
        var n = t.current
        np(n, du(), e, t, null, null)
      }),
      (Ip.prototype.unmount = Fp.prototype.unmount =
        function () {
          var e = this._internalRoot
          if (e !== null) {
            this._internalRoot = null
            var t = e.containerInfo
            ;(np(e.current, 2, null, e, null, null), vu(), (t[ut] = null))
          }
        }))
    function Ip(e) {
      this._internalRoot = e
    }
    Ip.prototype.unstable_scheduleHydration = function (e) {
      if (e) {
        var t = at()
        e = { blockedOn: null, target: e, priority: t }
        for (var n = 0; n < xp.length && t !== 0 && t < xp[n].priority; n++);
        ;(xp.splice(n, 0, e), n === 0 && Ep(e))
      }
    }
    var Lp = n.version
    if (Lp !== `19.2.8`) throw Error(i(527, Lp, `19.2.8`))
    j.findDOMNode = function (e) {
      var t = e._reactInternals
      if (t === void 0)
        throw typeof e.render == `function`
          ? Error(i(188))
          : ((e = Object.keys(e).join(`,`)), Error(i(268, e)))
      return ((e = d(t)), (e = e === null ? null : p(e)), (e = e === null ? null : e.stateNode), e)
    }
    var Rp = {
      bundleType: 0,
      version: `19.2.8`,
      rendererPackageName: `react-dom`,
      currentDispatcherRef: A,
      reconcilerVersion: `19.2.8`,
    }
    if (typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ < `u`) {
      var zp = __REACT_DEVTOOLS_GLOBAL_HOOK__
      if (!zp.isDisabled && zp.supportsFiber)
        try {
          ;((Ie = zp.inject(Rp)), (Le = zp))
        } catch {}
    }
    e.createRoot = function (e, t) {
      if (!a(e)) throw Error(i(299))
      var n = !1,
        r = ``,
        o = Gs,
        s = Ks,
        c = qs
      return (
        t != null &&
          (!0 === t.unstable_strictMode && (n = !0),
          t.identifierPrefix !== void 0 && (r = t.identifierPrefix),
          t.onUncaughtError !== void 0 && (o = t.onUncaughtError),
          t.onCaughtError !== void 0 && (s = t.onCaughtError),
          t.onRecoverableError !== void 0 && (c = t.onRecoverableError)),
        (t = ep(e, 1, !1, null, null, n, r, null, o, s, c, Pp)),
        (e[ut] = t.current),
        xd(e),
        new Fp(t)
      )
    }
  }),
  g = o((e, t) => {
    function n() {
      if (!(
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ > `u` ||
        typeof __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE != `function`
      ))
        try {
          __REACT_DEVTOOLS_GLOBAL_HOOK__.checkDCE(n)
        } catch (e) {
          console.error(e)
        }
    }
    ;(n(), (t.exports = h()))
  })(),
  _ = c(u(), 1),
  v = c(m(), 1)
function y(e) {
  if (!e || typeof document > `u`) return
  let t = document.head || document.getElementsByTagName(`head`)[0],
    n = document.createElement(`style`)
  ;((n.type = `text/css`),
    t.appendChild(n),
    n.styleSheet ? (n.styleSheet.cssText = e) : n.appendChild(document.createTextNode(e)))
}
var b = (e) => {
    switch (e) {
      case `success`:
        return C
      case `info`:
        return T
      case `warning`:
        return w
      case `error`:
        return E
      default:
        return null
    }
  },
  x = Array(12).fill(0),
  S = ({ visible: e, className: t }) =>
    _.createElement(
      `div`,
      { className: [`sonner-loading-wrapper`, t].filter(Boolean).join(` `), "data-visible": e },
      _.createElement(
        `div`,
        { className: `sonner-spinner` },
        x.map((e, t) =>
          _.createElement(`div`, { className: `sonner-loading-bar`, key: `spinner-bar-${t}` }),
        ),
      ),
    ),
  C = _.createElement(
    `svg`,
    {
      xmlns: `http://www.w3.org/2000/svg`,
      viewBox: `0 0 20 20`,
      fill: `currentColor`,
      height: `20`,
      width: `20`,
      "aria-hidden": `true`,
    },
    _.createElement(`path`, {
      fillRule: `evenodd`,
      d: `M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z`,
      clipRule: `evenodd`,
    }),
  ),
  w = _.createElement(
    `svg`,
    {
      xmlns: `http://www.w3.org/2000/svg`,
      viewBox: `0 0 24 24`,
      fill: `currentColor`,
      height: `20`,
      width: `20`,
      "aria-hidden": `true`,
    },
    _.createElement(`path`, {
      fillRule: `evenodd`,
      d: `M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z`,
      clipRule: `evenodd`,
    }),
  ),
  T = _.createElement(
    `svg`,
    {
      xmlns: `http://www.w3.org/2000/svg`,
      viewBox: `0 0 20 20`,
      fill: `currentColor`,
      height: `20`,
      width: `20`,
      "aria-hidden": `true`,
    },
    _.createElement(`path`, {
      fillRule: `evenodd`,
      d: `M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a.75.75 0 000 1.5h.253a.25.25 0 01.244.304l-.459 2.066A1.75 1.75 0 0010.747 15H11a.75.75 0 000-1.5h-.253a.25.25 0 01-.244-.304l.459-2.066A1.75 1.75 0 009.253 9H9z`,
      clipRule: `evenodd`,
    }),
  ),
  E = _.createElement(
    `svg`,
    {
      xmlns: `http://www.w3.org/2000/svg`,
      viewBox: `0 0 20 20`,
      fill: `currentColor`,
      height: `20`,
      width: `20`,
      "aria-hidden": `true`,
    },
    _.createElement(`path`, {
      fillRule: `evenodd`,
      d: `M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-8-5a.75.75 0 01.75.75v4.5a.75.75 0 01-1.5 0v-4.5A.75.75 0 0110 5zm0 10a1 1 0 100-2 1 1 0 000 2z`,
      clipRule: `evenodd`,
    }),
  ),
  ee = _.createElement(
    `svg`,
    {
      xmlns: `http://www.w3.org/2000/svg`,
      width: `12`,
      height: `12`,
      viewBox: `0 0 24 24`,
      fill: `none`,
      stroke: `currentColor`,
      strokeWidth: `1.5`,
      strokeLinecap: `round`,
      strokeLinejoin: `round`,
      "aria-hidden": `true`,
    },
    _.createElement(`line`, { x1: `18`, y1: `6`, x2: `6`, y2: `18` }),
    _.createElement(`line`, { x1: `6`, y1: `6`, x2: `18`, y2: `18` }),
  ),
  te = () => {
    let [e, t] = _.useState(document.hidden)
    return (
      _.useEffect(() => {
        let e = () => {
          t(document.hidden)
        }
        return (
          document.addEventListener(`visibilitychange`, e),
          () => document.removeEventListener(`visibilitychange`, e)
        )
      }, []),
      e
    )
  },
  ne = 1,
  re = 100,
  D = (e) => (typeof e?.id == `number` || e?.id?.length > 0 ? e.id : ne++),
  O = new (class {
    constructor() {
      ;((this.subscribe = (e) => (
        this.subscribers.push(e),
        this.getActiveToasts().forEach((t) => e(t)),
        () => {
          let t = this.subscribers.indexOf(e)
          this.subscribers.splice(t, 1)
        }
      )),
        (this.publish = (e) => {
          this.subscribers.forEach((t) => t(e))
        }),
        (this.addToast = (e) => {
          ;(this.publish(e), (this.toasts = [...this.toasts, e]), this.trimHistory())
        }),
        (this.trimHistory = () => {
          let e = this.toasts.length - re
          e <= 0 ||
            (this.toasts = this.toasts.filter((t) =>
              e > 0 && this.dismissedToasts.has(t.id)
                ? (this.dismissedToasts.delete(t.id), e--, !1)
                : !0,
            ))
        }),
        (this.create = (e) => {
          let { message: t, ...n } = e,
            r = D(e),
            i = this.pendingDismissals.get(r)
          i !== void 0 &&
            (cancelAnimationFrame(i),
            this.pendingDismissals.delete(r),
            this.dismissedToasts.delete(r))
          let a = this.dismissedToasts.has(r),
            o = e.dismissible === void 0 || e.dismissible
          return (
            a &&
              (this.dismissedToasts.delete(r),
              (this.toasts = this.toasts.filter((e) => e.id !== r))),
            !a && this.toasts.find((e) => e.id === r)
              ? (this.toasts = this.toasts.map((n) =>
                  n.id === r
                    ? (this.publish({ ...n, ...e, id: r, title: t }),
                      { ...n, ...e, id: r, dismissible: o, title: t })
                    : n,
                ))
              : this.addToast({ title: t, ...n, dismissible: o, id: r }),
            r
          )
        }),
        (this.dismiss = (e) => {
          if (e == null)
            return (
              this.getActiveToasts().forEach((e) => {
                ;(this.dismissedToasts.add(e.id),
                  this.subscribers.forEach((t) => t({ id: e.id, dismiss: !0 })))
              }),
              e
            )
          this.dismissedToasts.add(e)
          let t = this.pendingDismissals.get(e)
          return (
            t !== void 0 && cancelAnimationFrame(t),
            this.pendingDismissals.set(
              e,
              requestAnimationFrame(() => {
                ;(this.pendingDismissals.delete(e),
                  this.subscribers.forEach((t) => t({ id: e, dismiss: !0 })))
              }),
            ),
            e
          )
        }),
        (this.message = (e, t) => this.create({ ...t, message: e, type: void 0 })),
        (this.error = (e, t) => this.create({ ...t, message: e, type: `error` })),
        (this.success = (e, t) => this.create({ ...t, type: `success`, message: e })),
        (this.info = (e, t) => this.create({ ...t, type: `info`, message: e })),
        (this.warning = (e, t) => this.create({ ...t, type: `warning`, message: e })),
        (this.loading = (e, t) => this.create({ ...t, type: `loading`, message: e })),
        (this.promise = (e, t) => {
          if (!t) return
          let n
          t.loading !== void 0 &&
            (n = this.create({
              ...t,
              promise: e,
              type: `loading`,
              message: t.loading,
              description: typeof t.description == `function` ? void 0 : t.description,
            }))
          let r = Promise.resolve(e instanceof Function ? e() : e),
            i = n !== void 0,
            a,
            o = r
              .then(async (e) => {
                if (((a = [`resolve`, e]), _.isValidElement(e)))
                  ((i = !1), this.create({ id: n, type: `default`, message: e }))
                else if (ae(e) && !e.ok) {
                  i = !1
                  let r =
                      typeof t.error == `function`
                        ? await t.error(`HTTP error! status: ${e.status}`)
                        : t.error,
                    a =
                      typeof t.description == `function`
                        ? await t.description(`HTTP error! status: ${e.status}`)
                        : t.description,
                    o = typeof r == `object` && !_.isValidElement(r) ? r : { message: r }
                  this.create({ id: n, type: `error`, description: a, ...o })
                } else if (e instanceof Error) {
                  i = !1
                  let r = typeof t.error == `function` ? await t.error(e) : t.error,
                    a = typeof t.description == `function` ? await t.description(e) : t.description,
                    o = typeof r == `object` && !_.isValidElement(r) ? r : { message: r }
                  this.create({ id: n, type: `error`, description: a, ...o })
                } else if (t.success !== void 0) {
                  i = !1
                  let r = typeof t.success == `function` ? await t.success(e) : t.success,
                    a = typeof t.description == `function` ? await t.description(e) : t.description,
                    o = typeof r == `object` && !_.isValidElement(r) ? r : { message: r }
                  this.create({ id: n, type: `success`, description: a, ...o })
                }
              })
              .catch(async (e) => {
                if (((a = [`reject`, e]), t.error !== void 0)) {
                  i = !1
                  let r = typeof t.error == `function` ? await t.error(e) : t.error,
                    a = typeof t.description == `function` ? await t.description(e) : t.description,
                    o = typeof r == `object` && !_.isValidElement(r) ? r : { message: r }
                  this.create({ id: n, type: `error`, description: a, ...o })
                }
              })
              .finally(() => {
                ;(i && (this.dismiss(n), (n = void 0)), t.finally == null || t.finally.call(t))
              }),
            s = () =>
              new Promise((e, t) => o.then(() => (a[0] === `reject` ? t(a[1]) : e(a[1]))).catch(t))
          return typeof n != `string` && typeof n != `number`
            ? { unwrap: s }
            : Object.assign(n, { unwrap: s })
        }),
        (this.custom = (e, t) => {
          let n = D(t)
          return (this.create({ ...t, jsx: e(n), id: n, type: void 0 }), n)
        }),
        (this.getActiveToasts = () => this.toasts.filter((e) => !this.dismissedToasts.has(e.id))),
        (this.subscribers = []),
        (this.toasts = []),
        (this.dismissedToasts = new Set()),
        (this.pendingDismissals = new Map()))
    }
  })(),
  ie = (e, t) => O.message(e, t),
  ae = (e) =>
    e &&
    typeof e == `object` &&
    `ok` in e &&
    typeof e.ok == `boolean` &&
    `status` in e &&
    typeof e.status == `number`,
  k = Object.assign(
    ie,
    {
      success: O.success,
      info: O.info,
      warning: O.warning,
      error: O.error,
      custom: O.custom,
      message: O.message,
      promise: O.promise,
      dismiss: O.dismiss,
      loading: O.loading,
    },
    { getHistory: () => O.toasts, getToasts: () => O.getActiveToasts() },
  )
y(
  `[data-sonner-toaster][dir=ltr],html[dir=ltr]{--toast-icon-margin-start:-3px;--toast-icon-margin-end:4px;--toast-svg-margin-start:-1px;--toast-svg-margin-end:0px;--toast-button-margin-start:auto;--toast-button-margin-end:0;--toast-close-button-start:0;--toast-close-button-end:unset;--toast-close-button-transform:translate(-35%, -35%)}[data-sonner-toaster][dir=rtl],html[dir=rtl]{--toast-icon-margin-start:4px;--toast-icon-margin-end:-3px;--toast-svg-margin-start:0px;--toast-svg-margin-end:-1px;--toast-button-margin-start:0;--toast-button-margin-end:auto;--toast-close-button-start:unset;--toast-close-button-end:0;--toast-close-button-transform:translate(35%, -35%)}[data-sonner-toaster]{position:fixed;width:var(--width);font-family:ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Helvetica Neue,Arial,Noto Sans,sans-serif,Apple Color Emoji,Segoe UI Emoji,Segoe UI Symbol,Noto Color Emoji;--gray1:hsl(0, 0%, 99%);--gray2:hsl(0, 0%, 97.3%);--gray3:hsl(0, 0%, 95.1%);--gray4:hsl(0, 0%, 93%);--gray5:hsl(0, 0%, 90.9%);--gray6:hsl(0, 0%, 88.7%);--gray7:hsl(0, 0%, 85.8%);--gray8:hsl(0, 0%, 78%);--gray9:hsl(0, 0%, 56.1%);--gray10:hsl(0, 0%, 52.3%);--gray11:hsl(0, 0%, 43.5%);--gray12:hsl(0, 0%, 9%);--border-radius:8px;box-sizing:border-box;padding:0;margin:0;list-style:none;outline:0;z-index:999999999;transition:transform .4s ease}@media (hover:none) and (pointer:coarse){[data-sonner-toaster][data-lifted=true]{transform:none}}[data-sonner-toaster][data-x-position=right]{right:var(--offset-right)}[data-sonner-toaster][data-x-position=left]{left:var(--offset-left)}[data-sonner-toaster][data-x-position=center]{left:50%;transform:translateX(-50%)}[data-sonner-toaster][data-y-position=top]{top:var(--offset-top)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--offset-bottom)}[data-sonner-toast]{--y:translateY(100%);--lift-amount:calc(var(--lift) * var(--gap));z-index:var(--z-index);position:absolute;opacity:0;transform:var(--y);touch-action:none;transition:transform .4s,opacity .4s,height .4s,box-shadow .2s;box-sizing:border-box;outline:0;overflow-wrap:anywhere}[data-sonner-toast][data-styled=true]{padding:16px;background:var(--normal-bg);border:1px solid var(--normal-border);color:var(--normal-text);border-radius:var(--border-radius);box-shadow:0 4px 12px rgba(0,0,0,.1);width:var(--width);font-size:13px;display:flex;align-items:center;gap:6px}[data-sonner-toast]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-y-position=top]{top:0;--y:translateY(-100%);--lift:1;--lift-amount:calc(1 * var(--gap))}[data-sonner-toast][data-y-position=bottom]{bottom:0;--y:translateY(100%);--lift:-1;--lift-amount:calc(var(--lift) * var(--gap))}[data-sonner-toast][data-styled=true] [data-description]{font-weight:400;line-height:1.4;color:#3f3f3f}[data-rich-colors=true][data-sonner-toast][data-styled=true] [data-description]{color:inherit}[data-sonner-toaster][data-sonner-theme=dark] [data-description]{color:#e8e8e8}[data-sonner-toast][data-styled=true] [data-title]{font-weight:500;line-height:1.5;color:inherit}[data-sonner-toast][data-styled=true] [data-icon]{display:flex;height:16px;width:16px;position:relative;justify-content:flex-start;align-items:center;flex-shrink:0;margin-left:var(--toast-icon-margin-start);margin-right:var(--toast-icon-margin-end)}[data-sonner-toast][data-promise=true] [data-icon]>svg{opacity:0;transform:scale(.8);transform-origin:center;animation:sonner-fade-in .3s ease forwards}[data-sonner-toast][data-styled=true] [data-icon]>*{flex-shrink:0}[data-sonner-toast][data-styled=true] [data-icon] svg{margin-left:var(--toast-svg-margin-start);margin-right:var(--toast-svg-margin-end)}[data-sonner-toast][data-styled=true] [data-content]{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}[data-sonner-toast][data-styled=true] [data-button]{border-radius:4px;padding-left:8px;padding-right:8px;height:24px;font-size:12px;color:var(--normal-bg);background:var(--normal-text);margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end);border:none;font-weight:500;cursor:pointer;outline:0;display:flex;align-items:center;flex-shrink:0;transition:opacity .4s,box-shadow .2s}[data-sonner-toast][data-styled=true] [data-button]:focus-visible{box-shadow:0 0 0 2px rgba(0,0,0,.4)}[data-sonner-toast][data-styled=true] [data-button]:first-of-type{margin-left:var(--toast-button-margin-start);margin-right:var(--toast-button-margin-end)}[data-sonner-toast][data-styled=true] [data-cancel]{color:var(--normal-text);background:rgba(0,0,0,.08)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-styled=true] [data-cancel]{background:rgba(255,255,255,.3)}[data-sonner-toast][data-styled=true] [data-close-button]{position:absolute;left:var(--toast-close-button-start);right:var(--toast-close-button-end);top:0;height:20px;width:20px;display:flex;justify-content:center;align-items:center;padding:0;color:var(--normal-text);background:var(--normal-bg);border:1px solid var(--normal-border);transform:var(--toast-close-button-transform);border-radius:50%;cursor:pointer;z-index:1;transition:opacity .1s,background .2s,border-color .2s}[data-sonner-toast][data-styled=true] [data-close-button]:focus-visible{box-shadow:0 4px 12px rgba(0,0,0,.1),0 0 0 2px rgba(0,0,0,.2)}[data-sonner-toast][data-styled=true] [data-disabled=true]{cursor:not-allowed}[data-sonner-toast][data-styled=true]:hover [data-close-button]:hover{background:var(--gray2);border-color:var(--gray5)}[data-sonner-toast][data-swiping=true]::before{content:'';position:absolute;left:-100%;right:-100%;height:100%;z-index:-1}[data-sonner-toast][data-y-position=top][data-swiping=true]::before{bottom:50%;transform:scaleY(3) translateY(50%)}[data-sonner-toast][data-y-position=bottom][data-swiping=true]::before{top:50%;transform:scaleY(3) translateY(-50%)}[data-sonner-toast][data-swiping=false][data-removed=true]::before{content:'';position:absolute;inset:0;transform:scaleY(2)}[data-sonner-toast][data-expanded=true]::after{content:'';position:absolute;left:0;height:calc(var(--gap) + 1px);bottom:100%;width:100%}[data-sonner-toast][data-mounted=true]{--y:translateY(0);opacity:1}[data-sonner-toast][data-expanded=false][data-front=false]{--scale:var(--toasts-before) * 0.05 + 1;--y:translateY(calc(var(--lift-amount) * var(--toasts-before))) scale(calc(-1 * var(--scale)));height:var(--front-toast-height)}[data-sonner-toast]>*{transition:opacity .4s}[data-sonner-toast][data-x-position=right]{right:0}[data-sonner-toast][data-x-position=left]{left:0}[data-sonner-toast][data-expanded=false][data-front=false][data-styled=true]>*{opacity:0}[data-sonner-toast][data-visible=false]{opacity:0;pointer-events:none}[data-sonner-toast][data-mounted=true][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset)));height:var(--initial-height)}[data-sonner-toast][data-removed=true][data-front=true][data-swipe-out=false]{--y:translateY(calc(var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=true]{--y:translateY(calc(var(--lift) * var(--offset) + var(--lift) * -100%));opacity:0}[data-sonner-toast][data-removed=true][data-front=false][data-swipe-out=false][data-expanded=false]{--y:translateY(40%);opacity:0;transition:transform .5s,opacity .2s}[data-sonner-toast][data-removed=true][data-front=false]::before{height:calc(var(--initial-height) + 20%)}[data-sonner-toast][data-swiping=true]{transform:var(--y) translateY(var(--swipe-amount-y,0)) translateX(var(--swipe-amount-x,0));transition:none}[data-sonner-toast][data-swiped=true]{-webkit-user-select:none;user-select:none}[data-sonner-toast][data-swipe-out=true][data-y-position=bottom],[data-sonner-toast][data-swipe-out=true][data-y-position=top]{animation-duration:.2s;animation-timing-function:ease-out;animation-fill-mode:forwards}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=left]{animation-name:swipe-out-left}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=right]{animation-name:swipe-out-right}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=up]{animation-name:swipe-out-up}[data-sonner-toast][data-swipe-out=true][data-swipe-direction=down]{animation-name:swipe-out-down}@keyframes swipe-out-left{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) - 100%));opacity:0}}@keyframes swipe-out-right{from{transform:var(--y) translateX(var(--swipe-amount-x));opacity:1}to{transform:var(--y) translateX(calc(var(--swipe-amount-x) + 100%));opacity:0}}@keyframes swipe-out-up{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) - 100%));opacity:0}}@keyframes swipe-out-down{from{transform:var(--y) translateY(var(--swipe-amount-y));opacity:1}to{transform:var(--y) translateY(calc(var(--swipe-amount-y) + 100%));opacity:0}}@media (max-width:600px){[data-sonner-toaster]{position:fixed;right:var(--mobile-offset-right);left:var(--mobile-offset-left);width:100%}[data-sonner-toaster][dir=rtl]{left:calc(var(--mobile-offset-left) * -1)}[data-sonner-toaster] [data-sonner-toast]{left:0;right:0;width:calc(100% - var(--mobile-offset-left) * 2)}[data-sonner-toaster][data-x-position=left]{left:var(--mobile-offset-left)}[data-sonner-toaster][data-y-position=bottom]{bottom:var(--mobile-offset-bottom)}[data-sonner-toaster][data-y-position=top]{top:var(--mobile-offset-top)}[data-sonner-toaster][data-x-position=center]{left:var(--mobile-offset-left);right:var(--mobile-offset-right);transform:none}}[data-sonner-toaster][data-sonner-theme=light]{--normal-bg:#fff;--normal-border:var(--gray4);--normal-text:var(--gray12);--success-bg:hsl(143, 85%, 96%);--success-border:hsl(145, 92%, 87%);--success-text:hsl(140, 100%, 27%);--info-bg:hsl(208, 100%, 97%);--info-border:hsl(221, 91%, 93%);--info-text:hsl(210, 92%, 45%);--warning-bg:hsl(49, 100%, 97%);--warning-border:hsl(49, 91%, 84%);--warning-text:hsl(31, 92%, 45%);--error-bg:hsl(359, 100%, 97%);--error-border:hsl(359, 100%, 94%);--error-text:hsl(360, 100%, 45%)}[data-sonner-toaster][data-sonner-theme=light] [data-sonner-toast][data-invert=true]{--normal-bg:#000;--normal-border:hsl(0, 0%, 20%);--normal-text:var(--gray1)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast][data-invert=true]{--normal-bg:#fff;--normal-border:var(--gray3);--normal-text:var(--gray12)}[data-sonner-toaster][data-sonner-theme=dark]{--normal-bg:#000;--normal-bg-hover:hsl(0, 0%, 12%);--normal-border:hsl(0, 0%, 20%);--normal-border-hover:hsl(0, 0%, 25%);--normal-text:var(--gray1);--success-bg:hsl(150, 100%, 6%);--success-border:hsl(147, 100%, 12%);--success-text:hsl(150, 86%, 65%);--info-bg:hsl(215, 100%, 6%);--info-border:hsl(223, 43%, 17%);--info-text:hsl(216, 87%, 65%);--warning-bg:hsl(64, 100%, 6%);--warning-border:hsl(60, 100%, 9%);--warning-text:hsl(46, 87%, 65%);--error-bg:hsl(358, 76%, 10%);--error-border:hsl(357, 89%, 16%);--error-text:hsl(358, 100%, 81%)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]{background:var(--normal-bg);border-color:var(--normal-border);color:var(--normal-text)}[data-sonner-toaster][data-sonner-theme=dark] [data-sonner-toast] [data-close-button]:hover{background:var(--normal-bg-hover);border-color:var(--normal-border-hover)}[data-rich-colors=true][data-sonner-toast][data-type=success]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=success] [data-close-button]{background:var(--success-bg);border-color:var(--success-border);color:var(--success-text)}[data-rich-colors=true][data-sonner-toast][data-type=info]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=info] [data-close-button]{background:var(--info-bg);border-color:var(--info-border);color:var(--info-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=warning] [data-close-button]{background:var(--warning-bg);border-color:var(--warning-border);color:var(--warning-text)}[data-rich-colors=true][data-sonner-toast][data-type=error]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}[data-rich-colors=true][data-sonner-toast][data-type=error] [data-close-button]{background:var(--error-bg);border-color:var(--error-border);color:var(--error-text)}.sonner-loading-wrapper{--size:16px;height:var(--size);width:var(--size);position:absolute;inset:0;z-index:10}.sonner-loading-wrapper[data-visible=false]{transform-origin:center;animation:sonner-fade-out .2s ease forwards}.sonner-spinner{position:relative;top:50%;left:50%;height:var(--size);width:var(--size)}.sonner-loading-bar{animation:sonner-spin 1.2s linear infinite;background:var(--gray11);border-radius:6px;height:8%;left:-10%;position:absolute;top:-3.9%;width:24%}.sonner-loading-bar:first-child{animation-delay:-1.2s;transform:rotate(.0001deg) translate(146%)}.sonner-loading-bar:nth-child(2){animation-delay:-1.1s;transform:rotate(30deg) translate(146%)}.sonner-loading-bar:nth-child(3){animation-delay:-1s;transform:rotate(60deg) translate(146%)}.sonner-loading-bar:nth-child(4){animation-delay:-.9s;transform:rotate(90deg) translate(146%)}.sonner-loading-bar:nth-child(5){animation-delay:-.8s;transform:rotate(120deg) translate(146%)}.sonner-loading-bar:nth-child(6){animation-delay:-.7s;transform:rotate(150deg) translate(146%)}.sonner-loading-bar:nth-child(7){animation-delay:-.6s;transform:rotate(180deg) translate(146%)}.sonner-loading-bar:nth-child(8){animation-delay:-.5s;transform:rotate(210deg) translate(146%)}.sonner-loading-bar:nth-child(9){animation-delay:-.4s;transform:rotate(240deg) translate(146%)}.sonner-loading-bar:nth-child(10){animation-delay:-.3s;transform:rotate(270deg) translate(146%)}.sonner-loading-bar:nth-child(11){animation-delay:-.2s;transform:rotate(300deg) translate(146%)}.sonner-loading-bar:nth-child(12){animation-delay:-.1s;transform:rotate(330deg) translate(146%)}@keyframes sonner-fade-in{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}@keyframes sonner-fade-out{0%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(.8)}}@keyframes sonner-spin{0%{opacity:1}100%{opacity:.15}}@media (prefers-reduced-motion){.sonner-loading-bar,[data-sonner-toast],[data-sonner-toast]>*{transition:none!important;animation:none!important}}.sonner-loader{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);transform-origin:center;transition:opacity .2s,transform .2s}.sonner-loader[data-visible=false]{opacity:0;transform:scale(.8) translate(-50%,-50%)}`,
)
function A(e) {
  return e.label !== void 0
}
var j = 3,
  oe = `24px`,
  se = `16px`,
  ce = 4e3,
  M = 356,
  N = 14,
  P = 45,
  le = 200
function F(...e) {
  return e.filter(Boolean).join(` `)
}
function ue(e) {
  let [t, n] = e.split(`-`),
    r = []
  return (t && r.push(t), n && r.push(n), r)
}
var de = (e) => {
  let {
      invert: t,
      toast: n,
      unstyled: r,
      interacting: i,
      setHeights: a,
      visibleToasts: o,
      heights: s,
      index: c,
      toasts: l,
      expanded: u,
      removeToast: d,
      defaultRichColors: f,
      closeButton: p,
      style: m,
      cancelButtonStyle: h,
      actionButtonStyle: g,
      className: v = ``,
      descriptionClassName: y = ``,
      duration: x,
      position: C,
      gap: w,
      expandByDefault: T,
      classNames: E,
      icons: ne,
      closeButtonAriaLabel: re = `Close toast`,
    } = e,
    [D, O] = _.useState(null),
    [ie, ae] = _.useState(null),
    [k, j] = _.useState(!1),
    [oe, se] = _.useState(!1),
    [M, N] = _.useState(!1),
    [de, fe] = _.useState(!1),
    [pe, me] = _.useState(!1),
    [I, he] = _.useState(0),
    [ge, _e] = _.useState(0),
    ve = _.useRef(n.duration || x || ce),
    ye = _.useRef(null),
    be = _.useRef(null),
    xe = c === 0,
    Se = c + 1 <= o,
    Ce = n.type,
    we = Ce ?? `default`,
    Te = n.dismissible !== !1,
    Ee = n.className || ``,
    De = n.descriptionClassName || ``,
    Oe = _.useMemo(() => s.findIndex((e) => e.toastId === n.id) || 0, [s, n.id]),
    ke = _.useMemo(() => n.closeButton ?? p, [n.closeButton, p]),
    Ae = _.useMemo(() => n.duration || x || ce, [n.duration, x]),
    je = _.useRef(0),
    Me = _.useRef(0),
    Ne = _.useRef(0),
    Pe = _.useRef(null),
    [Fe, Ie] = C.split(`-`),
    Le = _.useMemo(() => s.reduce((e, t, n) => (n >= Oe ? e : e + t.height), 0), [s, Oe]),
    Re = te(),
    ze = _.useMemo(() => e.swipeDirections ?? ue(C), [e.swipeDirections, C]),
    Be = n.invert || t,
    Ve = Ce === `loading`
  ;((Me.current = _.useMemo(() => Oe * w + Le, [Oe, Le])),
    _.useEffect(() => {
      ve.current = Ae
    }, [Ae]),
    _.useEffect(() => {
      j(!0)
    }, []),
    _.useEffect(() => {
      let e = be.current
      if (e) {
        let t = e.getBoundingClientRect().height
        return (
          _e(t),
          a((e) => [{ toastId: n.id, height: t, position: n.position }, ...e]),
          () => a((e) => e.filter((e) => e.toastId !== n.id))
        )
      }
    }, [a, n.id]),
    _.useLayoutEffect(() => {
      if (!k) return
      let e = be.current,
        t = e.style.height
      e.style.height = `auto`
      let r = e.getBoundingClientRect().height
      ;((e.style.height = t),
        _e(r),
        a((e) =>
          e.find((e) => e.toastId === n.id)
            ? e.map((e) => (e.toastId === n.id ? { ...e, height: r } : e))
            : [{ toastId: n.id, height: r, position: n.position }, ...e],
        ))
    }, [k, n.title, n.description, a, n.id, n.jsx, n.action, n.cancel]))
  let He = _.useCallback(() => {
    ;(se(!0),
      he(Me.current),
      a((e) => e.filter((e) => e.toastId !== n.id)),
      setTimeout(() => {
        d(n)
      }, le))
  }, [n, d, a, Me])
  ;(_.useEffect(() => {
    if ((n.promise && Ce === `loading`) || n.duration === 1 / 0 || n.type === `loading`) return
    let e
    return (
      u || i || Re
        ? (() => {
            if (Ne.current < je.current) {
              let e = new Date().getTime() - je.current
              ve.current -= e
            }
            Ne.current = new Date().getTime()
          })()
        : ve.current !== 1 / 0 &&
          ((je.current = new Date().getTime()),
          (e = setTimeout(() => {
            ;(n.onAutoClose == null || n.onAutoClose.call(n, n), He())
          }, ve.current))),
      () => clearTimeout(e)
    )
  }, [u, i, n, Ce, Re, He]),
    _.useEffect(() => {
      n.delete && (He(), n.onDismiss == null || n.onDismiss.call(n, n))
    }, [He, n.delete]))
  function Ue() {
    return ne?.loading
      ? _.createElement(
          `div`,
          {
            className: F(E?.loader, n?.classNames?.loader, `sonner-loader`),
            "data-visible": Ce === `loading`,
          },
          ne.loading,
        )
      : _.createElement(S, {
          className: F(E?.loader, n?.classNames?.loader),
          visible: Ce === `loading`,
        })
  }
  let We = n.icon || ne?.[Ce] || b(Ce)
  return _.createElement(
    `li`,
    {
      tabIndex: 0,
      ref: be,
      className: F(v, Ee, E?.toast, n?.classNames?.toast, E?.[we], n?.classNames?.[we]),
      "data-sonner-toast": ``,
      "data-rich-colors": n.richColors ?? f,
      "data-styled": !(n.jsx || n.unstyled || r),
      "data-mounted": k,
      "data-promise": !!n.promise,
      "data-swiped": pe,
      "data-removed": oe,
      "data-visible": Se,
      "data-y-position": Fe,
      "data-x-position": Ie,
      "data-index": c,
      "data-front": xe,
      "data-swiping": M,
      "data-dismissible": Te,
      "data-type": Ce,
      "data-invert": Be,
      "data-swipe-out": de,
      "data-swipe-direction": ie,
      "data-expanded": !!(u || (T && k)),
      "data-testid": n.testId,
      style: {
        "--index": c,
        "--toasts-before": c,
        "--z-index": l.length - c,
        "--offset": `${oe ? I : Me.current}px`,
        "--initial-height": T ? `auto` : `${ge}px`,
        ...m,
        ...n.style,
      },
      onDragEnd: () => {
        ;(N(!1), O(null), (Pe.current = null))
      },
      onPointerDown: (e) => {
        e.button !== 2 &&
          !Ve &&
          Te &&
          ((ye.current = new Date()),
          he(Me.current),
          e.target.setPointerCapture(e.pointerId),
          e.target.tagName !== `BUTTON` && (N(!0), (Pe.current = { x: e.clientX, y: e.clientY })))
      },
      onPointerUp: () => {
        if (de || !Te) return
        Pe.current = null
        let e = Number(
            be.current?.style.getPropertyValue(`--swipe-amount-x`).replace(`px`, ``) || 0,
          ),
          t = Number(be.current?.style.getPropertyValue(`--swipe-amount-y`).replace(`px`, ``) || 0),
          r = new Date().getTime() - ye.current?.getTime(),
          i = D === `x` ? e : t,
          a = Math.abs(i) / r
        if (
          (D === `x`
            ? ze.includes(e > 0 ? `right` : `left`)
            : ze.includes(t > 0 ? `bottom` : `top`)) &&
          (Math.abs(i) >= P || a > 0.11)
        ) {
          ;(he(Me.current),
            n.onDismiss == null || n.onDismiss.call(n, n),
            ae(D === `x` ? (e > 0 ? `right` : `left`) : t > 0 ? `down` : `up`),
            He(),
            fe(!0))
          return
        }
        var o, s
        ;((o = be.current) == null || o.style.setProperty(`--swipe-amount-x`, `0px`),
          (s = be.current) == null || s.style.setProperty(`--swipe-amount-y`, `0px`),
          me(!1),
          N(!1),
          O(null))
      },
      onPointerMove: (e) => {
        var t, n
        if (!Pe.current || !Te || window.getSelection()?.toString().length > 0) return
        let r = e.clientY - Pe.current.y,
          i = e.clientX - Pe.current.x
        !D && (Math.abs(i) > 1 || Math.abs(r) > 1) && O(Math.abs(i) > Math.abs(r) ? `x` : `y`)
        let a = { x: 0, y: 0 },
          o = (e) => 1 / (1.5 + Math.abs(e) / 20)
        if (D === `y`) {
          if (ze.includes(`top`) || ze.includes(`bottom`)) {
            if ((ze.includes(`top`) && r < 0) || (ze.includes(`bottom`) && r > 0)) a.y = r
            else {
              let e = r * o(r)
              a.y = Math.abs(e) < Math.abs(r) ? e : r
            }
          }
        } else if (D === `x` && (ze.includes(`left`) || ze.includes(`right`))) {
          if ((ze.includes(`left`) && i < 0) || (ze.includes(`right`) && i > 0)) a.x = i
          else {
            let e = i * o(i)
            a.x = Math.abs(e) < Math.abs(i) ? e : i
          }
        }
        ;((Math.abs(a.x) > 0 || Math.abs(a.y) > 0) && me(!0),
          (t = be.current) == null || t.style.setProperty(`--swipe-amount-x`, `${a.x}px`),
          (n = be.current) == null || n.style.setProperty(`--swipe-amount-y`, `${a.y}px`))
      },
    },
    ke && !n.jsx && Ce !== `loading`
      ? _.createElement(
          `button`,
          {
            "aria-label": re,
            "data-disabled": Ve,
            "data-close-button": !0,
            onClick:
              Ve || !Te
                ? () => {}
                : () => {
                    ;(He(), n.onDismiss == null || n.onDismiss.call(n, n))
                  },
            className: F(E?.closeButton, n?.classNames?.closeButton),
          },
          ne?.close ?? ee,
        )
      : null,
    (Ce || n.icon || n.promise) && n.icon !== null && (ne?.[Ce] !== null || n.icon)
      ? _.createElement(
          `div`,
          { "data-icon": ``, className: F(E?.icon, n?.classNames?.icon) },
          Ce === `loading` ? n.icon || Ue() : n.promise ? Ue() : null,
          Ce === `loading` ? null : We,
        )
      : null,
    _.createElement(
      `div`,
      { "data-content": ``, className: F(E?.content, n?.classNames?.content) },
      _.createElement(
        `div`,
        { "data-title": ``, className: F(E?.title, n?.classNames?.title) },
        n.jsx ? n.jsx : typeof n.title == `function` ? n.title() : n.title,
      ),
      n.description
        ? _.createElement(
            `div`,
            {
              "data-description": ``,
              className: F(y, De, E?.description, n?.classNames?.description),
            },
            typeof n.description == `function` ? n.description() : n.description,
          )
        : null,
    ),
    _.isValidElement(n.cancel)
      ? n.cancel
      : n.cancel && A(n.cancel)
        ? _.createElement(
            `button`,
            {
              "data-button": !0,
              "data-cancel": !0,
              style: n.cancelButtonStyle || h,
              onClick: (e) => {
                A(n.cancel) &&
                  Te &&
                  (n.cancel.onClick == null || n.cancel.onClick.call(n.cancel, e), He())
              },
              className: F(E?.cancelButton, n?.classNames?.cancelButton),
            },
            n.cancel.label,
          )
        : null,
    _.isValidElement(n.action)
      ? n.action
      : n.action && A(n.action)
        ? _.createElement(
            `button`,
            {
              "data-button": !0,
              "data-action": !0,
              style: n.actionButtonStyle || g,
              onClick: (e) => {
                A(n.action) &&
                  (n.action.onClick == null || n.action.onClick.call(n.action, e),
                  !e.defaultPrevented && He())
              },
              className: F(E?.actionButton, n?.classNames?.actionButton),
            },
            n.action.label,
          )
        : null,
  )
}
function fe() {
  if (typeof window > `u` || typeof document > `u`) return `ltr`
  let e = document.documentElement.getAttribute(`dir`)
  return e === `auto` || !e ? window.getComputedStyle(document.documentElement).direction : e
}
function pe(e, t) {
  let n = {}
  return (
    [e, t].forEach((e, t) => {
      let r = t === 1,
        i = r ? `--mobile-offset` : `--offset`,
        a = r ? se : oe
      function o(e) {
        ;[`top`, `right`, `bottom`, `left`].forEach((t) => {
          n[`${i}-${t}`] = typeof e == `number` ? `${e}px` : e
        })
      }
      typeof e == `number` || typeof e == `string`
        ? o(e)
        : typeof e == `object`
          ? [`top`, `right`, `bottom`, `left`].forEach((t) => {
              e[t] === void 0
                ? (n[`${i}-${t}`] = a)
                : (n[`${i}-${t}`] = typeof e[t] == `number` ? `${e[t]}px` : e[t])
            })
          : o(a)
    }),
    n
  )
}
var me = _.forwardRef(function (e, t) {
    let {
        id: n,
        invert: r,
        position: i = `bottom-right`,
        hotkey: a = [`altKey`, `KeyT`],
        expand: o,
        closeButton: s,
        className: c,
        offset: l,
        mobileOffset: u,
        theme: d = `light`,
        richColors: f,
        duration: p,
        style: m,
        visibleToasts: h = j,
        toastOptions: g,
        dir: y = fe(),
        gap: b = N,
        icons: x,
        customAriaLabel: S,
        containerAriaLabel: C = `Notifications`,
      } = e,
      [w, T] = _.useState([]),
      E = _.useMemo(
        () => (n ? w.filter((e) => e.toasterId === n) : w.filter((e) => !e.toasterId)),
        [w, n],
      ),
      ee = _.useMemo(
        () => Array.from(new Set([i].concat(E.filter((e) => e.position).map((e) => e.position)))),
        [E, i],
      ),
      [te, ne] = _.useState([]),
      [re, D] = _.useState(!1),
      [ie, ae] = _.useState(!1),
      [k, A] = _.useState(
        d === `system`
          ? typeof window < `u` &&
            window.matchMedia &&
            window.matchMedia(`(prefers-color-scheme: dark)`).matches
            ? `dark`
            : `light`
          : d,
      ),
      oe = _.useRef(null),
      se = a.join(`+`).replace(/Key/g, ``).replace(/Digit/g, ``),
      ce = _.useRef(null),
      P = _.useRef(!1),
      le = _.useCallback((e) => {
        T(
          (t) => (
            t.find((t) => t.id === e.id)?.delete || O.dismiss(e.id),
            t.filter(({ id: t }) => t !== e.id)
          ),
        )
      }, [])
    return (
      _.useEffect(
        () =>
          O.subscribe((e) => {
            if (e.dismiss) {
              requestAnimationFrame(() => {
                T((t) => t.map((t) => (t.id === e.id ? { ...t, delete: !0 } : t)))
              })
              return
            }
            setTimeout(() => {
              v.flushSync(() => {
                T((t) => {
                  let n = t.findIndex((t) => t.id === e.id)
                  return n === -1
                    ? [e, ...t]
                    : [...t.slice(0, n), { ...t[n], ...e }, ...t.slice(n + 1)]
                })
              })
            })
          }),
        [],
      ),
      _.useEffect(() => {
        if (d !== `system`) {
          A(d)
          return
        }
        if (
          (d === `system` &&
            (window.matchMedia && window.matchMedia(`(prefers-color-scheme: dark)`).matches
              ? A(`dark`)
              : A(`light`)),
          typeof window > `u`)
        )
          return
        let e = window.matchMedia(`(prefers-color-scheme: dark)`)
        try {
          e.addEventListener(`change`, ({ matches: e }) => {
            A(e ? `dark` : `light`)
          })
        } catch {
          e.addListener(({ matches: e }) => {
            try {
              A(e ? `dark` : `light`)
            } catch (e) {
              console.error(e)
            }
          })
        }
      }, [d]),
      _.useEffect(() => {
        w.length <= 1 && D(!1)
      }, [w]),
      _.useEffect(() => {
        let e = (e) => {
          if (a.length > 0 && a.every((t) => e[t] || e.code === t)) {
            var t
            ;(D(!0), (t = oe.current) == null || t.focus())
          }
          e.code === `Escape` &&
            (document.activeElement === oe.current ||
              oe.current?.contains(document.activeElement)) &&
            D(!1)
        }
        return (
          document.addEventListener(`keydown`, e),
          () => document.removeEventListener(`keydown`, e)
        )
      }, [a]),
      _.useEffect(() => {
        if (oe.current)
          return () => {
            ce.current &&
              (ce.current.focus({ preventScroll: !0 }), (ce.current = null), (P.current = !1))
          }
      }, [oe.current]),
      _.createElement(
        `section`,
        {
          ref: t,
          "aria-label": S ?? `${C} ${se}`,
          tabIndex: -1,
          "aria-live": `polite`,
          "aria-relevant": `additions text`,
          "aria-atomic": `false`,
          suppressHydrationWarning: !0,
          "data-react-aria-top-layer": !0,
        },
        ee.map((t, n) => {
          let [i, a] = t.split(`-`)
          return E.length
            ? _.createElement(
                `ol`,
                {
                  key: t,
                  dir: y === `auto` ? fe() : y,
                  tabIndex: -1,
                  ref: oe,
                  className: c,
                  "data-sonner-toaster": !0,
                  "data-sonner-theme": k,
                  "data-y-position": i,
                  "data-x-position": a,
                  style: {
                    "--front-toast-height": `${te[0]?.height || 0}px`,
                    "--width": `${M}px`,
                    "--gap": `${b}px`,
                    ...m,
                    ...pe(l, u),
                  },
                  onBlur: (e) => {
                    P.current &&
                      !e.currentTarget.contains(e.relatedTarget) &&
                      ((P.current = !1),
                      (ce.current &&= (ce.current.focus({ preventScroll: !0 }), null)))
                  },
                  onFocus: (e) => {
                    ;(e.target instanceof HTMLElement &&
                      e.target.dataset.dismissible === `false`) ||
                      P.current ||
                      ((P.current = !0), (ce.current = e.relatedTarget))
                  },
                  onMouseEnter: () => D(!0),
                  onMouseMove: () => D(!0),
                  onMouseLeave: () => {
                    ie || D(!1)
                  },
                  onDragEnd: () => D(!1),
                  onPointerDown: (e) => {
                    ;(e.target instanceof HTMLElement &&
                      e.target.dataset.dismissible === `false`) ||
                      ae(!0)
                  },
                  onPointerUp: () => ae(!1),
                },
                E.filter((e) => (!e.position && n === 0) || e.position === t).map((n, i) =>
                  _.createElement(de, {
                    key: n.id,
                    icons: x,
                    index: i,
                    toast: n,
                    defaultRichColors: f,
                    duration: g?.duration ?? p,
                    className: g?.className,
                    descriptionClassName: g?.descriptionClassName,
                    invert: r,
                    visibleToasts: h,
                    closeButton: g?.closeButton ?? s,
                    interacting: ie,
                    position: t,
                    style: g?.style,
                    unstyled: g?.unstyled,
                    classNames: g?.classNames,
                    cancelButtonStyle: g?.cancelButtonStyle,
                    actionButtonStyle: g?.actionButtonStyle,
                    closeButtonAriaLabel: g?.closeButtonAriaLabel,
                    removeToast: le,
                    toasts: E.filter((e) => e.position == n.position),
                    heights: te.filter((e) => e.position == n.position),
                    setHeights: ne,
                    expandByDefault: o,
                    gap: b,
                    expanded: re,
                    swipeDirections: e.swipeDirections,
                  }),
                ),
              )
            : null
        }),
      )
    )
  }),
  I = (e) => typeof e == `string`,
  he = () => {
    let e,
      t,
      n = new Promise((n, r) => {
        ;((e = n), (t = r))
      })
    return ((n.resolve = e), (n.reject = t), n)
  },
  ge = (e) => (e == null ? `` : String(e)),
  _e = (e, t, n) => {
    e.forEach((e) => {
      t[e] && (n[e] = t[e])
    })
  },
  ve = /###/g,
  ye = (e) => (e && e.includes(`###`) ? e.replace(ve, `.`) : e),
  be = (e) => !e || I(e),
  xe = (e, t, n) => {
    let r = I(t) ? t.split(`.`) : t,
      i = 0
    for (; i < r.length - 1;) {
      if (be(e)) return {}
      let t = ye(r[i])
      ;(!e[t] && n && (e[t] = new n()),
        (e = Object.prototype.hasOwnProperty.call(e, t) ? e[t] : {}),
        ++i)
    }
    return be(e) ? {} : { obj: e, k: ye(r[i]) }
  },
  Se = (e, t, n) => {
    let { obj: r, k: i } = xe(e, t, Object)
    if (r !== void 0 || t.length === 1) {
      r[i] = n
      return
    }
    let a = t[t.length - 1],
      o = t.slice(0, t.length - 1),
      s = xe(e, o, Object)
    for (; s.obj === void 0 && o.length;)
      ((a = `${o[o.length - 1]}.${a}`),
        (o = o.slice(0, o.length - 1)),
        (s = xe(e, o, Object)),
        s?.obj && s.obj[`${s.k}.${a}`] !== void 0 && (s.obj = void 0))
    s.obj[`${s.k}.${a}`] = n
  },
  Ce = (e, t, n, r) => {
    let { obj: i, k: a } = xe(e, t, Object)
    ;((i[a] = i[a] || []), i[a].push(n))
  },
  we = (e, t) => {
    let { obj: n, k: r } = xe(e, t)
    if (n && Object.prototype.hasOwnProperty.call(n, r)) return n[r]
  },
  Te = (e, t, n) => {
    let r = we(e, n)
    return r === void 0 ? we(t, n) : r
  },
  Ee = (e, t, n) => {
    for (let r in t)
      r !== `__proto__` &&
        r !== `constructor` &&
        (Object.prototype.hasOwnProperty.call(e, r)
          ? I(e[r]) || e[r] instanceof String || I(t[r]) || t[r] instanceof String
            ? n && (e[r] = t[r])
            : Ee(e[r], t[r], n)
          : (e[r] = t[r]))
    return e
  },
  De = (e) => e.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, `\\$&`),
  Oe = { "&": `&amp;`, "<": `&lt;`, ">": `&gt;`, '"': `&quot;`, "'": `&#39;`, "/": `&#x2F;` },
  ke = (e) => (I(e) ? e.replace(/[&<>"'\/]/g, (e) => Oe[e]) : e),
  Ae = class {
    constructor(e) {
      ;((this.capacity = e), (this.regExpMap = new Map()), (this.regExpQueue = []))
    }
    getRegExp(e) {
      let t = this.regExpMap.get(e)
      if (t !== void 0) return t
      let n = new RegExp(e)
      return (
        this.regExpQueue.length === this.capacity &&
          this.regExpMap.delete(this.regExpQueue.shift()),
        this.regExpMap.set(e, n),
        this.regExpQueue.push(e),
        n
      )
    }
  },
  je = [` `, `,`, `?`, `!`, `;`],
  Me = new Ae(20),
  Ne = (e, t, n) => {
    ;((t ||= ``), (n ||= ``))
    let r = je.filter((e) => !t.includes(e) && !n.includes(e))
    if (r.length === 0) return !0
    let i = Me.getRegExp(`(${r.map((e) => (e === `?` ? `\\?` : e)).join(`|`)})`),
      a = !i.test(e)
    if (!a) {
      let t = e.indexOf(n)
      t > 0 && !i.test(e.substring(0, t)) && (a = !0)
    }
    return a
  },
  Pe = (e, t, n = `.`) => {
    if (!e) return
    if (e[t]) return Object.prototype.hasOwnProperty.call(e, t) ? e[t] : void 0
    let r = t.split(n),
      i = e
    for (let e = 0; e < r.length;) {
      if (!i || typeof i != `object`) return
      let t,
        a = ``
      for (let o = e; o < r.length; ++o)
        if ((o !== e && (a += n), (a += r[o]), (t = i[a]), t !== void 0)) {
          if ([`string`, `number`, `boolean`].includes(typeof t) && o < r.length - 1) continue
          e += o - e + 1
          break
        }
      i = t
    }
    return i
  },
  Fe = (e) => e?.replace(/_/g, `-`),
  Ie = {
    type: `logger`,
    log(e) {
      this.output(`log`, e)
    },
    warn(e) {
      this.output(`warn`, e)
    },
    error(e) {
      this.output(`error`, e)
    },
    output(e, t) {
      console?.[e]?.apply?.(console, t)
    },
  },
  Le = new (class e {
    constructor(e, t = {}) {
      this.init(e, t)
    }
    init(e, t = {}) {
      ;((this.prefix = t.prefix || `i18next:`),
        (this.logger = e || Ie),
        (this.options = t),
        (this.debug = t.debug))
    }
    log(...e) {
      return this.forward(e, `log`, ``, !0)
    }
    warn(...e) {
      return this.forward(e, `warn`, ``, !0)
    }
    error(...e) {
      return this.forward(e, `error`, ``)
    }
    deprecate(...e) {
      return this.forward(e, `warn`, `WARNING DEPRECATED: `, !0)
    }
    forward(e, t, n, r) {
      return r && !this.debug
        ? null
        : ((e = e.map((e) => (I(e) ? e.replace(/[\r\n\x00-\x1F\x7F]/g, ` `) : e))),
          I(e[0]) && (e[0] = `${n}${this.prefix} ${e[0]}`),
          this.logger[t](e))
    }
    create(t) {
      return new e(this.logger, { prefix: `${this.prefix}:${t}:`, ...this.options })
    }
    clone(t) {
      return ((t ||= this.options), (t.prefix = t.prefix || this.prefix), new e(this.logger, t))
    }
  })(),
  Re = class {
    constructor() {
      this.observers = {}
    }
    on(e, t) {
      return (
        e.split(` `).forEach((e) => {
          this.observers[e] || (this.observers[e] = new Map())
          let n = this.observers[e].get(t) || 0
          this.observers[e].set(t, n + 1)
        }),
        this
      )
    }
    off(e, t) {
      if (this.observers[e]) {
        if (!t) {
          delete this.observers[e]
          return
        }
        this.observers[e].delete(t)
      }
    }
    once(e, t) {
      let n = (...r) => {
        ;(t(...r), this.off(e, n))
      }
      return (this.on(e, n), this)
    }
    emit(e, ...t) {
      ;(this.observers[e] &&
        Array.from(this.observers[e].entries()).forEach(([e, n]) => {
          for (let r = 0; r < n; r++) e(...t)
        }),
        this.observers[`*`] &&
          Array.from(this.observers[`*`].entries()).forEach(([n, r]) => {
            for (let i = 0; i < r; i++) n(e, ...t)
          }))
    }
  },
  ze = class extends Re {
    constructor(e, t = { ns: [`translation`], defaultNS: `translation` }) {
      ;(super(),
        (this.data = e || {}),
        (this.options = t),
        this.options.keySeparator === void 0 && (this.options.keySeparator = `.`),
        this.options.ignoreJSONStructure === void 0 && (this.options.ignoreJSONStructure = !0))
    }
    addNamespaces(e) {
      this.options.ns.includes(e) || this.options.ns.push(e)
    }
    removeNamespaces(e) {
      let t = this.options.ns.indexOf(e)
      t > -1 && this.options.ns.splice(t, 1)
    }
    getResource(e, t, n, r = {}) {
      let i = r.keySeparator === void 0 ? this.options.keySeparator : r.keySeparator,
        a =
          r.ignoreJSONStructure === void 0
            ? this.options.ignoreJSONStructure
            : r.ignoreJSONStructure,
        o
      e.includes(`.`)
        ? (o = e.split(`.`))
        : ((o = [e, t]),
          n && (Array.isArray(n) ? o.push(...n) : I(n) && i ? o.push(...n.split(i)) : o.push(n)))
      let s = we(this.data, o)
      return (
        !s && !t && !n && e.includes(`.`) && ((e = o[0]), (t = o[1]), (n = o.slice(2).join(`.`))),
        s || !a || !I(n) ? s : Pe(this.data?.[e]?.[t], n, i)
      )
    }
    addResource(e, t, n, r, i = { silent: !1 }) {
      let a = i.keySeparator === void 0 ? this.options.keySeparator : i.keySeparator,
        o = [e, t]
      ;(n && (o = o.concat(a ? n.split(a) : n)),
        e.includes(`.`) && ((o = e.split(`.`)), (r = t), (t = o[1])),
        this.addNamespaces(t),
        Se(this.data, o, r),
        i.silent || this.emit(`added`, e, t, n, r))
    }
    addResources(e, t, n, r = { silent: !1 }) {
      for (let r in n)
        (I(n[r]) || Array.isArray(n[r])) && this.addResource(e, t, r, n[r], { silent: !0 })
      r.silent || this.emit(`added`, e, t, n)
    }
    addResourceBundle(e, t, n, r, i, a = { silent: !1, skipCopy: !1 }) {
      let o = [e, t]
      ;(e.includes(`.`) && ((o = e.split(`.`)), (r = n), (n = t), (t = o[1])),
        this.addNamespaces(t))
      let s = we(this.data, o) || {}
      ;(a.skipCopy || (n = JSON.parse(JSON.stringify(n))),
        r ? Ee(s, n, i) : (s = { ...s, ...n }),
        Se(this.data, o, s),
        a.silent || this.emit(`added`, e, t, n))
    }
    removeResourceBundle(e, t) {
      ;(this.hasResourceBundle(e, t) && delete this.data[e][t],
        this.removeNamespaces(t),
        this.emit(`removed`, e, t))
    }
    hasResourceBundle(e, t) {
      return this.getResource(e, t) !== void 0
    }
    getResourceBundle(e, t) {
      return ((t ||= this.options.defaultNS), this.getResource(e, t))
    }
    getDataByLanguage(e) {
      return this.data[e]
    }
    hasLanguageSomeTranslations(e) {
      let t = this.getDataByLanguage(e)
      return !!((t && Object.keys(t)) || []).find((e) => t[e] && Object.keys(t[e]).length > 0)
    }
    toJSON() {
      return this.data
    }
  },
  Be = {
    processors: {},
    addPostProcessor(e) {
      this.processors[e.name] = e
    },
    handle(e, t, n, r, i) {
      return (
        e.forEach((e) => {
          t = this.processors[e]?.process(t, n, r, i) ?? t
        }),
        t
      )
    },
  },
  Ve = Symbol(`i18next/PATH_KEY`)
function He() {
  let e = [],
    t = Object.create(null),
    n
  return (
    (t.get = (r, i) => (
      n?.revoke?.(),
      i === Ve ? e : (e.push(i), (n = Proxy.revocable(r, t)), n.proxy)
    )),
    Proxy.revocable(Object.create(null), t).proxy
  )
}
function Ue(e, t) {
  let { [Ve]: n } = e(He()),
    r = t?.keySeparator ?? `.`,
    i = t?.nsSeparator ?? `:`,
    a = t?.enableSelector === `strict`
  if (n.length > 1 && i) {
    let e = t?.ns,
      o = a ? (Array.isArray(e) ? e : e ? [e] : null) : Array.isArray(e) ? e : null
    if (o && (a ? o : o.length > 1 ? o.slice(1) : []).includes(n[0]))
      return `${n[0]}${i}${n.slice(1).join(r)}`
  }
  return n.join(r)
}
var We = (e) => !I(e) && typeof e != `boolean` && typeof e != `number`,
  Ge = class e extends Re {
    constructor(e, t = {}) {
      ;(super(),
        _e(
          [
            `resourceStore`,
            `languageUtils`,
            `pluralResolver`,
            `interpolator`,
            `backendConnector`,
            `i18nFormat`,
            `utils`,
          ],
          e,
          this,
        ),
        (this.options = t),
        this.options.keySeparator === void 0 && (this.options.keySeparator = `.`),
        (this.logger = Le.create(`translator`)),
        (this.checkedLoadedFor = {}))
    }
    changeLanguage(e) {
      e && (this.language = e)
    }
    exists(e, t = { interpolation: {} }) {
      let n = { ...t }
      if (e == null) return !1
      let r = this.resolve(e, n)
      if (r?.res === void 0) return !1
      let i = We(r.res)
      return !(n.returnObjects === !1 && i)
    }
    extractFromKey(e, t) {
      let n = t.nsSeparator === void 0 ? this.options.nsSeparator : t.nsSeparator
      n === void 0 && (n = `:`)
      let r = t.keySeparator === void 0 ? this.options.keySeparator : t.keySeparator,
        i = t.ns || this.options.defaultNS || [],
        a = n && e.includes(n),
        o =
          !this.options.userDefinedKeySeparator &&
          !t.keySeparator &&
          !this.options.userDefinedNsSeparator &&
          !t.nsSeparator &&
          !Ne(e, n, r)
      if (a && !o) {
        let t = e.match(this.interpolator.nestingRegexp)
        if (t && t.length > 0) return { key: e, namespaces: I(i) ? [i] : i }
        let a = e.split(n)
        ;((n !== r || (n === r && this.options.ns.includes(a[0]))) && (i = a.shift()),
          (e = a.join(r)))
      }
      return { key: e, namespaces: I(i) ? [i] : i }
    }
    translate(t, n, r) {
      let i = typeof n == `object` ? { ...n } : n
      if (
        (typeof i != `object` &&
          this.options.overloadTranslationOptionHandler &&
          (i = this.options.overloadTranslationOptionHandler(arguments)),
        typeof i == `object` && (i = { ...i }),
        (i ||= {}),
        t == null)
      )
        return ``
      ;(typeof t == `function` && (t = Ue(t, { ...this.options, ...i })),
        Array.isArray(t) || (t = [String(t)]),
        (t = t.map((e) => (typeof e == `function` ? Ue(e, { ...this.options, ...i }) : String(e)))))
      let a = i.returnDetails === void 0 ? this.options.returnDetails : i.returnDetails,
        o = i.keySeparator === void 0 ? this.options.keySeparator : i.keySeparator,
        { key: s, namespaces: c } = this.extractFromKey(t[t.length - 1], i),
        l = c[c.length - 1],
        u = i.nsSeparator === void 0 ? this.options.nsSeparator : i.nsSeparator
      u === void 0 && (u = `:`)
      let d = i.lng || this.language,
        f = i.appendNamespaceToCIMode || this.options.appendNamespaceToCIMode
      if (d?.toLowerCase() === `cimode`)
        return f
          ? a
            ? {
                res: `${l}${u}${s}`,
                usedKey: s,
                exactUsedKey: s,
                usedLng: d,
                usedNS: l,
                usedParams: this.getUsedParamsDetails(i),
              }
            : `${l}${u}${s}`
          : a
            ? {
                res: s,
                usedKey: s,
                exactUsedKey: s,
                usedLng: d,
                usedNS: l,
                usedParams: this.getUsedParamsDetails(i),
              }
            : s
      let p = this.resolve(t, i),
        m = p?.res,
        h = p?.usedKey || s,
        g = p?.exactUsedKey || s,
        _ = [`[object Number]`, `[object Function]`, `[object RegExp]`],
        v = i.joinArrays === void 0 ? this.options.joinArrays : i.joinArrays,
        y = !this.i18nFormat || this.i18nFormat.handleAsObject,
        b = i.count !== void 0 && !I(i.count),
        x = e.hasDefaultValue(i),
        S = b ? this.pluralResolver.getSuffix(d, i.count, i) : ``,
        C = i.ordinal && b ? this.pluralResolver.getSuffix(d, i.count, { ordinal: !1 }) : ``,
        w = b && !i.ordinal && i.count === 0,
        T =
          (w && i[`defaultValue${this.options.pluralSeparator}zero`]) ||
          i[`defaultValue${S}`] ||
          i[`defaultValue${C}`] ||
          i.defaultValue,
        E = m
      y && !m && x && (E = T)
      let ee = We(E),
        te = Object.prototype.toString.apply(E)
      if (y && E && ee && !_.includes(te) && !(I(v) && Array.isArray(E))) {
        if (!i.returnObjects && !this.options.returnObjects) {
          this.options.returnedObjectHandler ||
            this.logger.warn(`accessing an object - but returnObjects options is not enabled!`)
          let e = this.options.returnedObjectHandler
            ? this.options.returnedObjectHandler(h, E, { ...i, ns: c })
            : `key '${s} (${this.language})' returned an object instead of string.`
          return a ? ((p.res = e), (p.usedParams = this.getUsedParamsDetails(i)), p) : e
        }
        if (o) {
          let e = Array.isArray(E),
            t = e ? [] : {},
            n = e ? g : h
          for (let e in E)
            if (Object.prototype.hasOwnProperty.call(E, e)) {
              let r = `${n}${o}${e}`
              ;((t[e] =
                x && !m
                  ? this.translate(r, {
                      ...i,
                      defaultValue: We(T) ? T[e] : void 0,
                      joinArrays: !1,
                      ns: c,
                    })
                  : this.translate(r, { ...i, joinArrays: !1, ns: c })),
                t[e] === r && (t[e] = E[e]))
            }
          m = t
        }
      } else if (y && I(v) && Array.isArray(m))
        ((m = m.join(v)), (m &&= this.extendTranslation(m, t, i, r)))
      else {
        let e = !1,
          n = !1
        ;(!this.isValidLookup(m) && x && ((e = !0), (m = T)),
          this.isValidLookup(m) || ((n = !0), (m = s)))
        let a =
            (i.missingKeyNoValueFallbackToKey || this.options.missingKeyNoValueFallbackToKey) && n
              ? void 0
              : m,
          c = x && T !== m && this.options.updateMissing
        if (n || e || c) {
          if (
            (this.logger.log(
              c ? `updateKey` : `missingKey`,
              d,
              l,
              b && !c ? `${s}${this.pluralResolver.getSuffix(d, i.count, i)}` : s,
              c ? T : m,
            ),
            o)
          ) {
            let e = this.resolve(s, { ...i, keySeparator: !1 })
            e &&
              e.res &&
              this.logger.warn(
                `Seems the loaded translations were in flat JSON format instead of nested. Either set keySeparator: false on init or make sure your translations are published in nested format.`,
              )
          }
          let e = [],
            t = this.languageUtils.getFallbackCodes(
              this.options.fallbackLng,
              i.lng || this.language,
            )
          if (this.options.saveMissingTo === `fallback` && t && t[0])
            for (let n = 0; n < t.length; n++) e.push(t[n])
          else
            this.options.saveMissingTo === `all`
              ? (e = this.languageUtils.toResolveHierarchy(i.lng || this.language))
              : e.push(i.lng || this.language)
          let n = (e, t, n) => {
            let r = x && n !== m ? n : a
            ;(this.options.missingKeyHandler
              ? this.options.missingKeyHandler(e, l, t, r, c, i)
              : this.backendConnector?.saveMissing &&
                this.backendConnector.saveMissing(e, l, t, r, c, i),
              this.emit(`missingKey`, e, l, t, m))
          }
          this.options.saveMissing &&
            (this.options.saveMissingPlurals && b
              ? e.forEach((e) => {
                  let t = this.pluralResolver.getSuffixes(e, i)
                  ;(w &&
                    i[`defaultValue${this.options.pluralSeparator}zero`] &&
                    !t.includes(`${this.options.pluralSeparator}zero`) &&
                    t.push(`${this.options.pluralSeparator}zero`),
                    t.forEach((t) => {
                      n([e], s + t, i[`defaultValue${t}`] || T)
                    }))
                })
              : n(e, s, T))
        }
        ;((m = this.extendTranslation(m, t, i, p, r)),
          n && m === s && this.options.appendNamespaceToMissingKey && (m = `${l}${u}${s}`),
          (n || e) &&
            this.options.parseMissingKeyHandler &&
            (m = this.options.parseMissingKeyHandler(
              this.options.appendNamespaceToMissingKey ? `${l}${u}${s}` : s,
              e ? m : void 0,
              i,
            )))
      }
      return a ? ((p.res = m), (p.usedParams = this.getUsedParamsDetails(i)), p) : m
    }
    extendTranslation(e, t, n, r, i) {
      if (this.i18nFormat?.parse)
        e = this.i18nFormat.parse(
          e,
          { ...this.options.interpolation.defaultVariables, ...n },
          n.lng || this.language || r.usedLng,
          r.usedNS,
          r.usedKey,
          { resolved: r },
        )
      else if (!n.skipInterpolation) {
        n.interpolation &&
          this.interpolator.init({
            ...n,
            interpolation: { ...this.options.interpolation, ...n.interpolation },
          })
        let a =
            I(e) &&
            (n?.interpolation?.skipOnVariables === void 0
              ? this.options.interpolation.skipOnVariables
              : n.interpolation.skipOnVariables),
          o
        if (a) {
          let t = e.match(this.interpolator.nestingRegexp)
          o = t && t.length
        }
        let s = n.replace && !I(n.replace) ? n.replace : n
        if (
          (this.options.interpolation.defaultVariables &&
            (s = { ...this.options.interpolation.defaultVariables, ...s }),
          (e = this.interpolator.interpolate(e, s, n.lng || this.language || r.usedLng, n)),
          a)
        ) {
          let t = e.match(this.interpolator.nestingRegexp),
            r = t && t.length
          o < r && (n.nest = !1)
        }
        ;(!n.lng && r && r.res && (n.lng = this.language || r.usedLng),
          n.nest !== !1 &&
            (e = this.interpolator.nest(
              e,
              (...e) =>
                i?.[0] === e[0] && !n.context
                  ? (this.logger.warn(
                      `It seems you are nesting recursively key: ${e[0]} in key: ${t[0]}`,
                    ),
                    null)
                  : this.translate(...e, t),
              n,
            )),
          n.interpolation && this.interpolator.reset())
      }
      let a = n.postProcess || this.options.postProcess,
        o = I(a) ? [a] : a
      return (
        e != null &&
          o?.length &&
          n.applyPostProcessor !== !1 &&
          (e = Be.handle(
            o,
            e,
            t,
            this.options && this.options.postProcessPassResolved
              ? { i18nResolved: { ...r, usedParams: this.getUsedParamsDetails(n) }, ...n }
              : n,
            this,
          )),
        e
      )
    }
    resolve(e, t = {}) {
      let n, r, i, a, o
      return (
        I(e) && (e = [e]),
        Array.isArray(e) &&
          (e = e.map((e) => (typeof e == `function` ? Ue(e, { ...this.options, ...t }) : e))),
        e.forEach((e) => {
          if (this.isValidLookup(n)) return
          let s = this.extractFromKey(e, t),
            c = s.key
          r = c
          let l = s.namespaces
          this.options.fallbackNS && (l = l.concat(this.options.fallbackNS))
          let u = t.count !== void 0 && !I(t.count),
            d = u && !t.ordinal && t.count === 0,
            f =
              t.context !== void 0 &&
              (I(t.context) || typeof t.context == `number`) &&
              t.context !== ``,
            p = t.lngs
              ? t.lngs
              : this.languageUtils.toResolveHierarchy(t.lng || this.language, t.fallbackLng)
          l.forEach((e) => {
            this.isValidLookup(n) ||
              ((o = e),
              !this.checkedLoadedFor[`${p[0]}-${e}`] &&
                this.utils?.hasLoadedNamespace &&
                !this.utils?.hasLoadedNamespace(o) &&
                ((this.checkedLoadedFor[`${p[0]}-${e}`] = !0),
                this.logger.warn(
                  `key "${r}" for languages "${p.join(`, `)}" won't get resolved as namespace "${o}" was not yet loaded`,
                  `This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!`,
                )),
              p.forEach((r) => {
                if (this.isValidLookup(n)) return
                a = r
                let o = [c]
                if (this.i18nFormat?.addLookupKeys) this.i18nFormat.addLookupKeys(o, c, r, e, t)
                else {
                  let e
                  u && (e = this.pluralResolver.getSuffix(r, t.count, t))
                  let n = `${this.options.pluralSeparator}zero`,
                    i = `${this.options.pluralSeparator}ordinal${this.options.pluralSeparator}`
                  if (
                    (u &&
                      (t.ordinal &&
                        e.startsWith(i) &&
                        o.push(c + e.replace(i, this.options.pluralSeparator)),
                      o.push(c + e),
                      d && o.push(c + n)),
                    f)
                  ) {
                    let r = `${c}${this.options.contextSeparator || `_`}${t.context}`
                    ;(o.push(r),
                      u &&
                        (t.ordinal &&
                          e.startsWith(i) &&
                          o.push(r + e.replace(i, this.options.pluralSeparator)),
                        o.push(r + e),
                        d && o.push(r + n)))
                  }
                }
                let s
                for (; (s = o.pop());)
                  this.isValidLookup(n) || ((i = s), (n = this.getResource(r, e, s, t)))
              }))
          })
        }),
        { res: n, usedKey: r, exactUsedKey: i, usedLng: a, usedNS: o }
      )
    }
    isValidLookup(e) {
      return (
        e !== void 0 &&
        !(!this.options.returnNull && e === null) &&
        !(!this.options.returnEmptyString && e === ``)
      )
    }
    getResource(e, t, n, r = {}) {
      return this.i18nFormat?.getResource
        ? this.i18nFormat.getResource(e, t, n, r)
        : this.resourceStore.getResource(e, t, n, r)
    }
    getUsedParamsDetails(e = {}) {
      let t = [
          `defaultValue`,
          `ordinal`,
          `context`,
          `replace`,
          `lng`,
          `lngs`,
          `fallbackLng`,
          `ns`,
          `keySeparator`,
          `nsSeparator`,
          `returnObjects`,
          `returnDetails`,
          `joinArrays`,
          `postProcess`,
          `interpolation`,
        ],
        n = e.replace && !I(e.replace),
        r = n ? e.replace : e
      if (
        (n && e.count !== void 0 && (r = { ...r, count: e.count }),
        this.options.interpolation.defaultVariables &&
          (r = { ...this.options.interpolation.defaultVariables, ...r }),
        !n)
      ) {
        r = { ...r }
        for (let e of t) delete r[e]
      }
      return r
    }
    static hasDefaultValue(e) {
      for (let t in e)
        if (
          Object.prototype.hasOwnProperty.call(e, t) &&
          t.startsWith(`defaultValue`) &&
          e[t] !== void 0
        )
          return !0
      return !1
    }
  },
  Ke = class {
    constructor(e) {
      ;((this.options = e),
        (this.supportedLngs = this.options.supportedLngs || !1),
        (this.logger = Le.create(`languageUtils`)),
        (this.resolveHierarchyCache = {}))
    }
    clearCache() {
      this.resolveHierarchyCache = {}
    }
    getScriptPartFromCode(e) {
      if (((e = Fe(e)), !e || !e.includes(`-`))) return null
      let t = e.split(`-`)
      return t.length === 2 || (t.pop(), t[t.length - 1].toLowerCase() === `x`)
        ? null
        : this.formatLanguageCode(t.join(`-`))
    }
    getLanguagePartFromCode(e) {
      if (((e = Fe(e)), !e || !e.includes(`-`))) return e
      let t = e.split(`-`)
      return this.formatLanguageCode(t[0])
    }
    formatLanguageCode(e) {
      if (I(e) && e.includes(`-`)) {
        let t
        try {
          t = Intl.getCanonicalLocales(e)[0]
        } catch {}
        return (
          t && this.options.lowerCaseLng && (t = t.toLowerCase()),
          t || (this.options.lowerCaseLng ? e.toLowerCase() : e)
        )
      }
      return this.options.cleanCode || this.options.lowerCaseLng ? e.toLowerCase() : e
    }
    isSupportedCode(e) {
      return (
        (this.options.load === `languageOnly` || this.options.nonExplicitSupportedLngs) &&
          (e = this.getLanguagePartFromCode(e)),
        !this.supportedLngs || !this.supportedLngs.length || this.supportedLngs.includes(e)
      )
    }
    getBestMatchFromCodes(e) {
      if (!e) return null
      let t
      return (
        e.forEach((e) => {
          if (t) return
          let n = this.formatLanguageCode(e)
          ;(!this.options.supportedLngs || this.isSupportedCode(n)) && (t = n)
        }),
        !t &&
          this.options.supportedLngs &&
          e.forEach((e) => {
            if (t) return
            let n = this.getScriptPartFromCode(e)
            if (this.isSupportedCode(n)) return (t = n)
            let r = this.getLanguagePartFromCode(e)
            if (this.isSupportedCode(r)) return (t = r)
            t = this.options.supportedLngs.find((e) =>
              e === r
                ? !0
                : !e.includes(`-`) && !r.includes(`-`)
                  ? !1
                  : !!(
                      (e.includes(`-`) && !r.includes(`-`) && e.slice(0, e.indexOf(`-`)) === r) ||
                      (e.startsWith(r) && r.length > 1)
                    ),
            )
          }),
        (t ||= this.getFallbackCodes(this.options.fallbackLng)[0]),
        t
      )
    }
    getFallbackCodes(e, t) {
      if (!e) return []
      if ((typeof e == `function` && (e = e(t)), I(e) && (e = [e]), Array.isArray(e))) return e
      if (!t) return e.default || []
      let n = e[t]
      return (
        (n ||= e[this.getScriptPartFromCode(t)]),
        (n ||= e[this.formatLanguageCode(t)]),
        (n ||= e[this.getLanguagePartFromCode(t)]),
        (n ||= e.default),
        n || []
      )
    }
    toResolveHierarchy(e, t) {
      let n = this.options.fallbackLng,
        r = Array.isArray(n) ? n.join(`|`) : n
      r !== this._cachedFallbackLng &&
        ((this.resolveHierarchyCache = {}), (this._cachedFallbackLng = r))
      let i = t === void 0 || t === !1 || I(t),
        a = t === void 0 && typeof this.options.fallbackLng == `function`,
        o = I(e) && i && !a,
        s = null
      if (o) {
        let n
        ;((n = t === void 0 ? `undefined` : t === !1 ? `boolean:false` : `string:${t}`),
          (s = `${e.length}:${e}|${n}`))
      }
      if (s !== null) {
        let e = this.resolveHierarchyCache[s]
        if (e !== void 0) return e.slice()
      }
      let c = this.getFallbackCodes((t === !1 ? [] : t) || this.options.fallbackLng || [], e),
        l = [],
        u = (e) => {
          e &&
            (this.isSupportedCode(e)
              ? l.push(e)
              : this.logger.warn(`rejecting language code not found in supportedLngs: ${e}`))
        }
      return (
        I(e) && (e.includes(`-`) || e.includes(`_`))
          ? (this.options.load !== `languageOnly` && u(this.formatLanguageCode(e)),
            this.options.load !== `languageOnly` &&
              this.options.load !== `currentOnly` &&
              u(this.getScriptPartFromCode(e)),
            this.options.load !== `currentOnly` && u(this.getLanguagePartFromCode(e)))
          : I(e) && u(this.formatLanguageCode(e)),
        c.forEach((e) => {
          l.includes(e) || u(this.formatLanguageCode(e))
        }),
        s === null ? l : ((this.resolveHierarchyCache[s] = l), l.slice())
      )
    }
  },
  qe = { zero: 0, one: 1, two: 2, few: 3, many: 4, other: 5 },
  Je = {
    select: (e) => (e === 1 ? `one` : `other`),
    resolvedOptions: () => ({ pluralCategories: [`one`, `other`] }),
  },
  Ye = class {
    constructor(e, t = {}) {
      ;((this.languageUtils = e),
        (this.options = t),
        (this.logger = Le.create(`pluralResolver`)),
        (this.pluralRulesCache = {}))
    }
    clearCache() {
      this.pluralRulesCache = {}
    }
    getRule(e, t = {}) {
      let n = Fe(e === `dev` ? `en` : e),
        r = t.ordinal ? `ordinal` : `cardinal`,
        i = JSON.stringify({ cleanedCode: n, type: r })
      if (i in this.pluralRulesCache) return this.pluralRulesCache[i]
      let a
      try {
        a = new Intl.PluralRules(n, { type: r })
      } catch {
        if (typeof Intl > `u`)
          return (this.logger.error(`No Intl support, please use an Intl polyfill!`), Je)
        if (!e.match(/-|_/)) return Je
        let n = this.languageUtils.getLanguagePartFromCode(e)
        a = this.getRule(n, t)
      }
      return ((this.pluralRulesCache[i] = a), a)
    }
    needsPlural(e, t = {}) {
      let n = this.getRule(e, t)
      return ((n ||= this.getRule(`dev`, t)), n?.resolvedOptions().pluralCategories.length > 1)
    }
    getPluralFormsOfKey(e, t, n = {}) {
      return this.getSuffixes(e, n).map((e) => `${t}${e}`)
    }
    getSuffixes(e, t = {}) {
      let n = this.getRule(e, t)
      return (
        (n ||= this.getRule(`dev`, t)),
        n
          ? n
              .resolvedOptions()
              .pluralCategories.sort((e, t) => qe[e] - qe[t])
              .map(
                (e) =>
                  `${this.options.prepend}${t.ordinal ? `ordinal${this.options.prepend}` : ``}${e}`,
              )
          : []
      )
    }
    getSuffix(e, t, n = {}) {
      let r = this.getRule(e, n)
      return r
        ? `${this.options.prepend}${n.ordinal ? `ordinal${this.options.prepend}` : ``}${r.select(t)}`
        : (this.logger.warn(`no plural rule found for: ${e}`), this.getSuffix(`dev`, t, n))
    }
  },
  Xe = (e, t, n, r = `.`, i = !0) => {
    let a = Te(e, t, n)
    return (!a && i && I(n) && ((a = Pe(e, n, r)), a === void 0 && (a = Pe(t, n, r))), a)
  },
  Ze = (e) => e.replace(/\$/g, `$$$$`),
  Qe = class {
    constructor(e = {}) {
      ;((this.logger = Le.create(`interpolator`)),
        (this.options = e),
        (this.format = e?.interpolation?.format || ((e) => e)),
        this.init(e))
    }
    init(e = {}) {
      e.interpolation ||= { escapeValue: !0 }
      let {
        escape: t,
        escapeValue: n,
        useRawValueToEscape: r,
        prefix: i,
        prefixEscaped: a,
        suffix: o,
        suffixEscaped: s,
        formatSeparator: c,
        unescapeSuffix: l,
        unescapePrefix: u,
        nestingPrefix: d,
        nestingPrefixEscaped: f,
        nestingSuffix: p,
        nestingSuffixEscaped: m,
        nestingOptionsSeparator: h,
        maxReplaces: g,
        alwaysFormat: _,
      } = e.interpolation
      ;((this.escape = t === void 0 ? ke : t),
        (this.escapeValue = n === void 0 || n),
        (this.useRawValueToEscape = r !== void 0 && r),
        (this.prefix = i ? De(i) : a || `{{`),
        (this.suffix = o ? De(o) : s || `}}`),
        (this.formatSeparator = c || `,`),
        (this.unescapePrefix = l ? `` : u ? De(u) : `-`),
        (this.unescapeSuffix = this.unescapePrefix ? `` : l ? De(l) : ``),
        (this.nestingPrefix = d ? De(d) : f || De(`$t(`)),
        (this.nestingSuffix = p ? De(p) : m || De(`)`)),
        (this.nestingOptionsSeparator = h || `,`),
        (this.maxReplaces = g || 1e3),
        (this.alwaysFormat = _ !== void 0 && _),
        this.resetRegExp())
    }
    reset() {
      this.options && this.init(this.options)
    }
    resetRegExp() {
      let e = (e, t) => (e?.source === t ? ((e.lastIndex = 0), e) : new RegExp(t, `g`))
      ;((this.regexp = e(this.regexp, `${this.prefix}(.+?)${this.suffix}`)),
        (this.regexpUnescape = e(
          this.regexpUnescape,
          `${this.prefix}${this.unescapePrefix}(.+?)${this.unescapeSuffix}${this.suffix}`,
        )),
        (this.nestingRegexp = e(
          this.nestingRegexp,
          `${this.nestingPrefix}((?:[^()"']+|"[^"]*"|'[^']*'|\\((?:[^()]|"[^"]*"|'[^']*')*\\))*?)${this.nestingSuffix}`,
        )))
    }
    interpolate(e, t, n, r) {
      let i,
        a,
        o,
        s =
          (this.options &&
            this.options.interpolation &&
            this.options.interpolation.defaultVariables) ||
          {},
        c = (e) => {
          if (!e.includes(this.formatSeparator)) {
            let i = Xe(t, s, e, this.options.keySeparator, this.options.ignoreJSONStructure)
            return this.alwaysFormat
              ? this.format(i, void 0, n, { ...r, ...t, interpolationkey: e })
              : i
          }
          let i = e.split(this.formatSeparator),
            a = i.shift().trim(),
            o = i.join(this.formatSeparator).trim()
          return this.format(
            Xe(t, s, a, this.options.keySeparator, this.options.ignoreJSONStructure),
            o,
            n,
            { ...r, ...t, interpolationkey: a },
          )
        }
      ;(this.resetRegExp(),
        !this.escapeValue &&
          typeof e == `string` &&
          /\$t\([^)]*\{[^}]*\{\{/.test(e) &&
          this.logger.warn(
            `nesting options string contains interpolated variables with escapeValue: false — if any of those values are attacker-controlled they can inject additional nesting options (e.g. redirect lng/ns). Sanitise untrusted input before passing it to t(), or keep escapeValue: true.`,
          ))
      let l = r?.missingInterpolationHandler || this.options.missingInterpolationHandler,
        u =
          r?.interpolation?.skipOnVariables === void 0
            ? this.options.interpolation.skipOnVariables
            : r.interpolation.skipOnVariables
      return (
        [
          { regex: this.regexpUnescape, safeValue: (e) => e },
          { regex: this.regexp, safeValue: (e) => (this.escapeValue ? this.escape(e) : e) },
        ].forEach((t) => {
          for (o = 0; (i = t.regex.exec(e));) {
            let n = i[1].trim()
            if (((a = c(n)), a === void 0)) {
              if (typeof l == `function`) {
                let t = l(e, i, r)
                a = I(t) ? t : ``
              } else if (r && Object.prototype.hasOwnProperty.call(r, n)) a = ``
              else if (u) {
                a = i[0]
                continue
              } else
                (this.logger.warn(`missed to pass in variable ${n} for interpolating ${e}`),
                  (a = ``))
            } else !I(a) && !this.useRawValueToEscape && (a = ge(a))
            let s = t.safeValue(a)
            if (
              ((e = e.replace(i[0], Ze(s))),
              u
                ? ((t.regex.lastIndex += s.length), (t.regex.lastIndex -= i[0].length))
                : (t.regex.lastIndex = 0),
              o++,
              o >= this.maxReplaces)
            )
              break
          }
        }),
        e
      )
    }
    nest(e, t, n = {}) {
      let r,
        i,
        a,
        o = (e, t) => {
          let n = this.nestingOptionsSeparator
          if (!e.includes(n)) return e
          let r = e.split(RegExp(`${De(n)}[ ]*{`)),
            i = `{${r[1]}`
          ;((e = r[0]), (i = this.interpolate(i, a)))
          let o = i.match(/'/g),
            s = i.match(/"/g)
          ;(((o?.length ?? 0) % 2 == 0 && !s) || (s?.length ?? 0) % 2 != 0) &&
            (i = i.replace(/'/g, `"`))
          try {
            ;((a = JSON.parse(i)), t && (a = { ...t, ...a }))
          } catch (t) {
            return (
              this.logger.warn(`failed parsing options string in nesting for key ${e}`, t),
              `${e}${n}${i}`
            )
          }
          return (
            a.defaultValue && a.defaultValue.includes(this.prefix) && delete a.defaultValue,
            e
          )
        }
      for (; (r = this.nestingRegexp.exec(e));) {
        let s = []
        ;((a = { ...n }),
          (a = a.replace && !I(a.replace) ? a.replace : a),
          (a.applyPostProcessor = !1),
          delete a.defaultValue)
        let c = /{.*}/s.test(r[1]) ? r[1].lastIndexOf(`}`) + 1 : r[1].indexOf(this.formatSeparator)
        if (
          (c !== -1 &&
            ((s = r[1]
              .slice(c)
              .split(this.formatSeparator)
              .map((e) => e.trim())
              .filter(Boolean)),
            (r[1] = r[1].slice(0, c))),
          (i = t(o.call(this, r[1].trim(), a), a)),
          i && r[0] === e && !I(i))
        )
          return i
        ;(I(i) || (i = ge(i)),
          (i ||= (this.logger.warn(`missed to resolve ${r[1]} for nesting ${e}`), ``)),
          s.length &&
            (i = s.reduce(
              (e, t) => this.format(e, t, n.lng, { ...n, interpolationkey: r[1].trim() }),
              i.trim(),
            )),
          (e = e.replace(r[0], Ze(ge(i)))),
          (this.regexp.lastIndex = 0))
      }
      return e
    }
  },
  $e = (e) => {
    let t = e.toLowerCase().trim(),
      n = {}
    if (e.includes(`(`)) {
      let r = e.split(`(`)
      t = r[0].toLowerCase().trim()
      let i = r[1].slice(0, -1)
      t === `currency` && !i.includes(`:`)
        ? (n.currency ||= i.trim())
        : t === `relativetime` && !i.includes(`:`)
          ? (n.range ||= i.trim())
          : i.split(`;`).forEach((e) => {
              if (e) {
                let [t, ...r] = e.split(`:`),
                  i = r
                    .join(`:`)
                    .trim()
                    .replace(/^'+|'+$/g, ``),
                  a = t.trim()
                ;(n[a] || (n[a] = i),
                  i === `false` && (n[a] = !1),
                  i === `true` && (n[a] = !0),
                  isNaN(i) || (n[a] = parseInt(i, 10)))
              }
            })
    }
    return { formatName: t, formatOptions: n }
  },
  et = (e) => {
    let t = {}
    return (n, r, i) => {
      let a = i
      i &&
        i.interpolationkey &&
        i.formatParams &&
        i.formatParams[i.interpolationkey] &&
        i[i.interpolationkey] &&
        (a = { ...a, [i.interpolationkey]: void 0 })
      let o = r + JSON.stringify(a),
        s = t[o]
      return (s || ((s = e(Fe(r), i)), (t[o] = s)), s(n))
    }
  },
  tt = (e) => (t, n, r) => e(Fe(n), r)(t),
  nt = class {
    constructor(e = {}) {
      ;((this.logger = Le.create(`formatter`)), (this.options = e), this.init(e))
    }
    init(e, t = { interpolation: {} }) {
      this.formatSeparator = t.interpolation.formatSeparator || `,`
      let n = t.cacheInBuiltFormats ? et : tt
      this.formats = {
        number: n((e, t) => {
          let n = new Intl.NumberFormat(e, { ...t })
          return (e) => n.format(e)
        }),
        currency: n((e, t) => {
          let n = new Intl.NumberFormat(e, { ...t, style: `currency` })
          return (e) => n.format(e)
        }),
        datetime: n((e, t) => {
          let n = new Intl.DateTimeFormat(e, { ...t })
          return (e) => n.format(e)
        }),
        relativetime: n((e, t) => {
          let n = new Intl.RelativeTimeFormat(e, { ...t })
          return (e) => n.format(e, t.range || `day`)
        }),
        list: n((e, t) => {
          let n = new Intl.ListFormat(e, { ...t })
          return (e) => n.format(e)
        }),
      }
    }
    add(e, t) {
      this.formats[e.toLowerCase().trim()] = t
    }
    addCached(e, t) {
      this.formats[e.toLowerCase().trim()] = et(t)
    }
    format(e, t, n, r = {}) {
      if (!t || e == null) return e
      let i = t.split(this.formatSeparator),
        a = []
      for (let e = 0; e < i.length; e++) {
        let t = i[e]
        for (; t.indexOf(`(`) > -1 && !t.includes(`)`) && e + 1 < i.length;)
          t = `${t}${this.formatSeparator}${i[++e]}`
        a.push(t)
      }
      return a.reduce((e, t) => {
        let { formatName: i, formatOptions: a } = $e(t)
        if (this.formats[i]) {
          let t = e
          try {
            let o = r?.formatParams?.[r.interpolationkey] || {},
              s = o.locale || o.lng || r.locale || r.lng || n
            t = this.formats[i](e, s, { ...a, ...r, ...o })
          } catch (e) {
            this.logger.warn(e)
          }
          return t
        }
        return (this.logger.warn(`there was no format function for ${i}`), e)
      }, e)
    }
  },
  rt = (e, t) => {
    e.pending[t] !== void 0 && (delete e.pending[t], e.pendingCount--)
  },
  it = class extends Re {
    constructor(e, t, n, r = {}) {
      ;(super(),
        (this.backend = e),
        (this.store = t),
        (this.services = n),
        (this.languageUtils = n.languageUtils),
        (this.options = r),
        (this.logger = Le.create(`backendConnector`)),
        (this.waitingReads = []),
        (this.maxParallelReads = r.maxParallelReads || 10),
        (this.readingCalls = 0),
        (this.maxRetries = r.maxRetries >= 0 ? r.maxRetries : 5),
        (this.retryTimeout = r.retryTimeout >= 1 ? r.retryTimeout : 350),
        (this.state = {}),
        (this.queue = []),
        this.backend?.init?.(n, r.backend, r))
    }
    queueLoad(e, t, n, r) {
      let i = {},
        a = {},
        o = {},
        s = {}
      return (
        e.forEach((e) => {
          let r = !0
          ;(t.forEach((t) => {
            let o = `${e}|${t}`
            !n.reload && this.store.hasResourceBundle(e, t)
              ? (this.state[o] = 2)
              : this.state[o] < 0 ||
                (this.state[o] === 1
                  ? a[o] === void 0 && (a[o] = !0)
                  : ((this.state[o] = 1),
                    (r = !1),
                    a[o] === void 0 && (a[o] = !0),
                    i[o] === void 0 && (i[o] = !0),
                    s[t] === void 0 && (s[t] = !0)))
          }),
            r || (o[e] = !0))
        }),
        (Object.keys(i).length || Object.keys(a).length) &&
          this.queue.push({
            pending: a,
            pendingCount: Object.keys(a).length,
            loaded: {},
            errors: [],
            callback: r,
          }),
        {
          toLoad: Object.keys(i),
          pending: Object.keys(a),
          toLoadLanguages: Object.keys(o),
          toLoadNamespaces: Object.keys(s),
        }
      )
    }
    loaded(e, t, n) {
      let r = e.split(`|`),
        i = r[0],
        a = r[1]
      ;(t && this.emit(`failedLoading`, i, a, t),
        !t && n && this.store.addResourceBundle(i, a, n, void 0, void 0, { skipCopy: !0 }),
        (this.state[e] = t ? -1 : 2),
        t && n && (this.state[e] = 0))
      let o = {}
      ;(this.queue.forEach((n) => {
        ;(Ce(n.loaded, [i], a),
          rt(n, e),
          t && n.errors.push(t),
          n.pendingCount === 0 &&
            !n.done &&
            (Object.keys(n.loaded).forEach((e) => {
              o[e] || (o[e] = {})
              let t = n.loaded[e]
              t.length &&
                t.forEach((t) => {
                  o[e][t] === void 0 && (o[e][t] = !0)
                })
            }),
            (n.done = !0),
            n.errors.length ? n.callback(n.errors) : n.callback()))
      }),
        this.emit(`loaded`, o),
        (this.queue = this.queue.filter((e) => !e.done)))
    }
    read(e, t, n, r = 0, i = this.retryTimeout, a) {
      if (!e.length) return a(null, {})
      if (this.readingCalls >= this.maxParallelReads) {
        this.waitingReads.push({ lng: e, ns: t, fcName: n, tried: r, wait: i, callback: a })
        return
      }
      this.readingCalls++
      let o = (o, s) => {
          if ((this.readingCalls--, this.waitingReads.length > 0)) {
            let e = this.waitingReads.shift()
            this.read(e.lng, e.ns, e.fcName, e.tried, e.wait, e.callback)
          }
          if (o && s && r < this.maxRetries) {
            setTimeout(() => {
              this.read(e, t, n, r + 1, i * 2, a)
            }, i)
            return
          }
          a(o, s)
        },
        s = this.backend[n].bind(this.backend)
      if (s.length === 2) {
        try {
          let n = s(e, t)
          n && typeof n.then == `function` ? n.then((e) => o(null, e)).catch(o) : o(null, n)
        } catch (e) {
          o(e)
        }
        return
      }
      return s(e, t, o)
    }
    prepareLoading(e, t, n = {}, r) {
      if (!this.backend)
        return (
          this.logger.warn(`No backend was added via i18next.use. Will not load resources.`),
          r && r()
        )
      ;(I(e) && (e = this.languageUtils.toResolveHierarchy(e)), I(t) && (t = [t]))
      let i = this.queueLoad(e, t, n, r)
      if (!i.toLoad.length) return (i.pending.length || r(), null)
      i.toLoad.forEach((e) => {
        this.loadOne(e)
      })
    }
    load(e, t, n) {
      this.prepareLoading(e, t, {}, n)
    }
    reload(e, t, n) {
      this.prepareLoading(e, t, { reload: !0 }, n)
    }
    loadOne(e, t = ``) {
      let n = e.split(`|`),
        r = n[0],
        i = n[1]
      this.read(r, i, `read`, void 0, void 0, (n, a) => {
        ;(n && this.logger.warn(`${t}loading namespace ${i} for language ${r} failed`, n),
          !n && a && this.logger.log(`${t}loaded namespace ${i} for language ${r}`, a),
          this.loaded(e, n, a))
      })
    }
    saveMissing(e, t, n, r, i, a = {}, o = () => {}) {
      if (
        this.services?.utils?.hasLoadedNamespace &&
        !this.services?.utils?.hasLoadedNamespace(t)
      ) {
        this.logger.warn(
          `did not save key "${n}" as the namespace "${t}" was not yet loaded`,
          `This means something IS WRONG in your setup. You access the t function before i18next.init / i18next.loadNamespace / i18next.changeLanguage was done. Wait for the callback or Promise to resolve before accessing it!!!`,
        )
        return
      }
      if (n != null && n !== ``) {
        if (this.backend?.create) {
          let s = { ...a, isUpdate: i },
            c = this.backend.create.bind(this.backend)
          if (c.length < 6)
            try {
              let i
              ;((i = c.length === 5 ? c(e, t, n, r, s) : c(e, t, n, r)),
                i && typeof i.then == `function` ? i.then((e) => o(null, e)).catch(o) : o(null, i))
            } catch (e) {
              o(e)
            }
          else c(e, t, n, r, o, s)
        }
        e && e[0] && this.store.addResource(e[0], t, n, r)
      }
    }
  },
  at = () => ({
    debug: !1,
    initAsync: !0,
    ns: [`translation`],
    defaultNS: [`translation`],
    fallbackLng: [`dev`],
    fallbackNS: !1,
    supportedLngs: !1,
    nonExplicitSupportedLngs: !1,
    load: `all`,
    preload: !1,
    keySeparator: `.`,
    nsSeparator: `:`,
    pluralSeparator: `_`,
    contextSeparator: `_`,
    enableSelector: !1,
    partialBundledLanguages: !1,
    saveMissing: !1,
    updateMissing: !1,
    saveMissingTo: `fallback`,
    saveMissingPlurals: !0,
    missingKeyHandler: !1,
    missingInterpolationHandler: !1,
    postProcess: !1,
    postProcessPassResolved: !1,
    returnNull: !1,
    returnEmptyString: !0,
    returnObjects: !1,
    joinArrays: !1,
    returnedObjectHandler: !1,
    parseMissingKeyHandler: !1,
    appendNamespaceToMissingKey: !1,
    appendNamespaceToCIMode: !1,
    overloadTranslationOptionHandler: (e) => {
      let t = {}
      if (
        (typeof e[1] == `object` && (t = e[1]),
        I(e[1]) && (t.defaultValue = e[1]),
        I(e[2]) && (t.tDescription = e[2]),
        typeof e[2] == `object` || typeof e[3] == `object`)
      ) {
        let n = e[3] || e[2]
        Object.keys(n).forEach((e) => {
          t[e] = n[e]
        })
      }
      return t
    },
    interpolation: {
      escapeValue: !0,
      prefix: `{{`,
      suffix: `}}`,
      formatSeparator: `,`,
      unescapePrefix: `-`,
      nestingPrefix: `$t(`,
      nestingSuffix: `)`,
      nestingOptionsSeparator: `,`,
      maxReplaces: 1e3,
      skipOnVariables: !0,
    },
    cacheInBuiltFormats: !0,
  }),
  ot = (e) => (
    I(e.ns) && (e.ns = [e.ns]),
    I(e.fallbackLng) && (e.fallbackLng = [e.fallbackLng]),
    I(e.fallbackNS) && (e.fallbackNS = [e.fallbackNS]),
    e.supportedLngs &&
      !e.supportedLngs.includes(`cimode`) &&
      (e.supportedLngs = e.supportedLngs.concat([`cimode`])),
    e
  ),
  st = () => {},
  ct = (e) => {
    Object.getOwnPropertyNames(Object.getPrototypeOf(e)).forEach((t) => {
      typeof e[t] == `function` && (e[t] = e[t].bind(e))
    })
  },
  lt = class e extends Re {
    constructor(e = {}, t) {
      if (
        (super(),
        (this.options = ot(e)),
        (this.services = {}),
        (this.logger = Le),
        (this.modules = { external: [] }),
        ct(this),
        t && !this.isInitialized && !e.isClone)
      ) {
        if (!this.options.initAsync) return (this.init(e, t), this)
        setTimeout(() => {
          this.init(e, t)
        }, 0)
      }
    }
    init(e = {}, t) {
      ;((this.isInitializing = !0),
        typeof e == `function` && ((t = e), (e = {})),
        e.defaultNS == null &&
          e.ns &&
          (I(e.ns)
            ? (e.defaultNS = e.ns)
            : e.ns.includes(`translation`) || (e.defaultNS = e.ns[0])))
      let n = at()
      ;((this.options = { ...n, ...this.options, ...ot(e) }),
        (this.options.interpolation = { ...n.interpolation, ...this.options.interpolation }),
        e.keySeparator !== void 0 && (this.options.userDefinedKeySeparator = e.keySeparator),
        e.nsSeparator !== void 0 && (this.options.userDefinedNsSeparator = e.nsSeparator),
        typeof this.options.overloadTranslationOptionHandler != `function` &&
          (this.options.overloadTranslationOptionHandler = n.overloadTranslationOptionHandler))
      let r = (e) => (e ? (typeof e == `function` ? new e() : e) : null)
      if (!this.options.isClone) {
        this.modules.logger
          ? Le.init(r(this.modules.logger), this.options)
          : Le.init(null, this.options)
        let e
        e = this.modules.formatter ? this.modules.formatter : nt
        let t = new Ke(this.options)
        this.store = new ze(this.options.resources, this.options)
        let n = this.services
        ;((n.logger = Le),
          (n.resourceStore = this.store),
          (n.languageUtils = t),
          (n.pluralResolver = new Ye(t, { prepend: this.options.pluralSeparator })),
          e &&
            ((n.formatter = r(e)),
            n.formatter.init && n.formatter.init(n, this.options),
            (this.options.interpolation.format = n.formatter.format.bind(n.formatter))),
          (n.interpolator = new Qe(this.options)),
          (n.utils = { hasLoadedNamespace: this.hasLoadedNamespace.bind(this) }),
          (n.backendConnector = new it(r(this.modules.backend), n.resourceStore, n, this.options)),
          n.backendConnector.on(`*`, (e, ...t) => {
            this.emit(e, ...t)
          }),
          this.modules.languageDetector &&
            ((n.languageDetector = r(this.modules.languageDetector)),
            n.languageDetector.init &&
              n.languageDetector.init(n, this.options.detection, this.options)),
          this.modules.i18nFormat &&
            ((n.i18nFormat = r(this.modules.i18nFormat)),
            n.i18nFormat.init && n.i18nFormat.init(this)),
          (this.translator = new Ge(this.services, this.options)),
          this.translator.on(`*`, (e, ...t) => {
            this.emit(e, ...t)
          }),
          this.modules.external.forEach((e) => {
            e.init && e.init(this)
          }))
      }
      if (
        ((this.format = this.options.interpolation.format),
        (t ||= st),
        this.options.fallbackLng && !this.services.languageDetector && !this.options.lng)
      ) {
        let e = this.services.languageUtils.getFallbackCodes(this.options.fallbackLng)
        e.length > 0 && e[0] !== `dev` && (this.options.lng = e[0])
      }
      ;(!this.services.languageDetector &&
        !this.options.lng &&
        this.logger.warn(`init: no languageDetector is used and no lng is defined`),
        [`getResource`, `hasResourceBundle`, `getResourceBundle`, `getDataByLanguage`].forEach(
          (e) => {
            this[e] = (...t) => this.store[e](...t)
          },
        ),
        [`addResource`, `addResources`, `addResourceBundle`, `removeResourceBundle`].forEach(
          (e) => {
            this[e] = (...t) => (this.store[e](...t), this)
          },
        ))
      let i = he(),
        a = () => {
          let e = (e, n) => {
            ;((this.isInitializing = !1),
              this.isInitialized &&
                !this.initializedStoreOnce &&
                this.logger.warn(
                  `init: i18next is already initialized. You should call init just once!`,
                ),
              (this.isInitialized = !0),
              this.options.isClone || this.logger.log(`initialized`, this.options),
              this.emit(`initialized`, this.options),
              i.resolve(n),
              t(e, n))
          }
          if ((this.languages || this.isLanguageChangingTo) && !this.isInitialized)
            return e(null, this.t.bind(this))
          this.changeLanguage(this.options.lng, e)
        }
      return (this.options.resources || !this.options.initAsync ? a() : setTimeout(a, 0), i)
    }
    loadResources(e, t = st) {
      let n = t,
        r = I(e) ? e : this.language
      if (
        (typeof e == `function` && (n = e),
        !this.options.resources || this.options.partialBundledLanguages)
      ) {
        if (
          r?.toLowerCase() === `cimode` &&
          (!this.options.preload || this.options.preload.length === 0)
        )
          return n()
        let e = [],
          t = (t) => {
            t &&
              t !== `cimode` &&
              this.services.languageUtils.toResolveHierarchy(t).forEach((t) => {
                t !== `cimode` && (e.includes(t) || e.push(t))
              })
          }
        ;(r
          ? t(r)
          : this.services.languageUtils
              .getFallbackCodes(this.options.fallbackLng)
              .forEach((e) => t(e)),
          this.options.preload?.forEach?.((e) => t(e)),
          this.services.backendConnector.load(e, this.options.ns, (e) => {
            ;(!e &&
              !this.resolvedLanguage &&
              this.language &&
              this.setResolvedLanguage(this.language),
              n(e))
          }))
      } else n(null)
    }
    reloadResources(e, t, n) {
      let r = he()
      return (
        typeof e == `function` && ((n = e), (e = void 0)),
        typeof t == `function` && ((n = t), (t = void 0)),
        (e ||= this.languages),
        (t ||= this.options.ns),
        (n ||= st),
        this.services.backendConnector.reload(e, t, (e) => {
          ;(r.resolve(), n(e))
        }),
        r
      )
    }
    use(e) {
      if (!e)
        throw Error(
          `You are passing an undefined module! Please check the object you are passing to i18next.use()`,
        )
      if (!e.type)
        throw Error(
          `You are passing a wrong module! Please check the object you are passing to i18next.use()`,
        )
      return (
        e.type === `backend` && (this.modules.backend = e),
        (e.type === `logger` || (e.log && e.warn && e.error)) && (this.modules.logger = e),
        e.type === `languageDetector` && (this.modules.languageDetector = e),
        e.type === `i18nFormat` && (this.modules.i18nFormat = e),
        e.type === `postProcessor` && Be.addPostProcessor(e),
        e.type === `formatter` && (this.modules.formatter = e),
        e.type === `3rdParty` && this.modules.external.push(e),
        this
      )
    }
    setResolvedLanguage(e) {
      if (e && this.languages && ![`cimode`, `dev`].includes(e)) {
        for (let e = 0; e < this.languages.length; e++) {
          let t = this.languages[e]
          if (![`cimode`, `dev`].includes(t) && this.store.hasLanguageSomeTranslations(t)) {
            this.resolvedLanguage = t
            break
          }
        }
        !this.resolvedLanguage &&
          !this.languages.includes(e) &&
          this.store.hasLanguageSomeTranslations(e) &&
          ((this.resolvedLanguage = e), this.languages.unshift(e))
      }
    }
    changeLanguage(e, t) {
      this.isLanguageChangingTo = e
      let n = he()
      this.emit(`languageChanging`, e)
      let r = (e) => {
          ;((this.language = e),
            (this.languages = this.services.languageUtils.toResolveHierarchy(e)),
            (this.resolvedLanguage = void 0),
            this.setResolvedLanguage(e))
        },
        i = (i, a) => {
          ;(a
            ? this.isLanguageChangingTo === e &&
              (r(a),
              this.translator.changeLanguage(a),
              (this.isLanguageChangingTo = void 0),
              this.emit(`languageChanged`, a),
              this.logger.log(`languageChanged`, a))
            : (this.isLanguageChangingTo = void 0),
            n.resolve((...e) => this.t(...e)),
            t && t(i, (...e) => this.t(...e)))
        },
        a = (t) => {
          !e && !t && this.services.languageDetector && (t = [])
          let n = I(t) ? t : t && t[0],
            a = this.store.hasLanguageSomeTranslations(n)
              ? n
              : this.services.languageUtils.getBestMatchFromCodes(I(t) ? [t] : t)
          ;(a &&
            (this.language || r(a),
            this.translator.language || this.translator.changeLanguage(a),
            this.services.languageDetector?.cacheUserLanguage?.(a)),
            this.loadResources(a, (e) => {
              i(e, a)
            }))
        }
      return (
        !e && this.services.languageDetector && !this.services.languageDetector.async
          ? a(this.services.languageDetector.detect())
          : !e && this.services.languageDetector && this.services.languageDetector.async
            ? this.services.languageDetector.detect.length === 0
              ? this.services.languageDetector.detect().then(a)
              : this.services.languageDetector.detect(a)
            : a(e),
        n
      )
    }
    getFixedT(e, t, n, r) {
      let i = r?.scopeNs,
        a = (e, t, ...r) => {
          let o
          ;((o =
            typeof t == `object`
              ? { ...t }
              : this.options.overloadTranslationOptionHandler([e, t].concat(r))),
            (o.lng = o.lng || a.lng),
            (o.lngs = o.lngs || a.lngs))
          let s = o.ns !== void 0 && o.ns !== null
          ;((o.ns = o.ns || a.ns),
            o.keyPrefix !== `` && (o.keyPrefix = o.keyPrefix || n || a.keyPrefix))
          let c = { ...this.options, ...o }
          ;(Array.isArray(i) && !s && (c.ns = i),
            typeof o.keyPrefix == `function` && (o.keyPrefix = Ue(o.keyPrefix, c)))
          let l = this.options.keySeparator || `.`,
            u
          return (
            o.keyPrefix && Array.isArray(e)
              ? (u = e.map(
                  (e) => (typeof e == `function` && (e = Ue(e, c)), `${o.keyPrefix}${l}${e}`),
                ))
              : (typeof e == `function` && (e = Ue(e, c)),
                (u = o.keyPrefix ? `${o.keyPrefix}${l}${e}` : e)),
            this.t(u, o)
          )
        }
      return (I(e) ? (a.lng = e) : (a.lngs = e), (a.ns = t), (a.keyPrefix = n), a)
    }
    t(...e) {
      return this.translator?.translate(...e)
    }
    exists(...e) {
      return this.translator?.exists(...e)
    }
    setDefaultNamespace(e) {
      this.options.defaultNS = e
    }
    hasLoadedNamespace(e, t = {}) {
      if (!this.isInitialized)
        return (
          this.logger.warn(`hasLoadedNamespace: i18next was not initialized`, this.languages),
          !1
        )
      if (!this.languages || !this.languages.length)
        return (
          this.logger.warn(
            `hasLoadedNamespace: i18n.languages were undefined or empty`,
            this.languages,
          ),
          !1
        )
      let n = t.lng || this.resolvedLanguage || this.languages[0],
        r = this.options ? this.options.fallbackLng : !1,
        i = this.languages[this.languages.length - 1]
      if (n.toLowerCase() === `cimode`) return !0
      let a = (e, t) => {
        let n = this.services.backendConnector.state[`${e}|${t}`]
        return n === -1 || n === 0 || n === 2
      }
      if (t.precheck) {
        let e = t.precheck(this, a)
        if (e !== void 0) return e
      }
      return !!(
        this.hasResourceBundle(n, e) ||
        !this.services.backendConnector.backend ||
        (this.options.resources && !this.options.partialBundledLanguages) ||
        (a(n, e) && (!r || a(i, e)))
      )
    }
    loadNamespaces(e, t) {
      let n = he()
      return this.options.ns
        ? (I(e) && (e = [e]),
          e.forEach((e) => {
            this.options.ns.includes(e) || this.options.ns.push(e)
          }),
          this.loadResources((e) => {
            ;(n.resolve(), t && t(e))
          }),
          n)
        : (t && t(), Promise.resolve())
    }
    loadLanguages(e, t) {
      let n = he()
      I(e) && (e = [e])
      let r = this.options.preload || [],
        i = e.filter((e) => !r.includes(e) && this.services.languageUtils.isSupportedCode(e))
      return i.length
        ? ((this.options.preload = r.concat(i)),
          this.loadResources((e) => {
            ;(n.resolve(), t && t(e))
          }),
          n)
        : (t && t(), Promise.resolve())
    }
    dir(e) {
      if (
        ((e ||=
          this.resolvedLanguage ||
          (this.languages?.length > 0 ? this.languages[0] : this.language)),
        !e)
      )
        return `rtl`
      try {
        let t = new Intl.Locale(e)
        if (t && t.getTextInfo) {
          let e = t.getTextInfo()
          if (e && e.direction) return e.direction
        }
      } catch {}
      let t =
          `ar.shu.sqr.ssh.xaa.yhd.yud.aao.abh.abv.acm.acq.acw.acx.acy.adf.ads.aeb.aec.afb.ajp.apc.apd.arb.arq.ars.ary.arz.auz.avl.ayh.ayl.ayn.ayp.bbz.pga.he.iw.ps.pbt.pbu.pst.prp.prd.ug.ur.ydd.yds.yih.ji.yi.hbo.men.xmn.fa.jpr.peo.pes.prs.dv.sam.ckb`.split(
            `.`,
          ),
        n = this.services?.languageUtils || new Ke(at())
      return e.toLowerCase().indexOf(`-latn`) > 1
        ? `ltr`
        : t.includes(n.getLanguagePartFromCode(e)) || e.toLowerCase().indexOf(`-arab`) > 1
          ? `rtl`
          : `ltr`
    }
    static createInstance(t = {}, n) {
      let r = new e(t, n)
      return ((r.createInstance = e.createInstance), r)
    }
    cloneInstance(t = {}, n = st) {
      let r = t.forkResourceStore
      r && delete t.forkResourceStore
      let i = { ...this.options, ...t, isClone: !0 },
        a = new e(i)
      if (
        ((t.debug !== void 0 || t.prefix !== void 0) && (a.logger = a.logger.clone(t)),
        [`store`, `services`, `language`].forEach((e) => {
          a[e] = this[e]
        }),
        (a.services = { ...this.services }),
        (a.services.utils = { hasLoadedNamespace: a.hasLoadedNamespace.bind(a) }),
        r &&
          ((a.store = new ze(
            Object.keys(this.store.data).reduce(
              (e, t) => (
                (e[t] = { ...this.store.data[t] }),
                (e[t] = Object.keys(e[t]).reduce((n, r) => ((n[r] = { ...e[t][r] }), n), e[t])),
                e
              ),
              {},
            ),
            i,
          )),
          (a.services.resourceStore = a.store)),
        t.interpolation)
      ) {
        let e = { ...at().interpolation, ...this.options.interpolation, ...t.interpolation },
          n = { ...i, interpolation: e }
        a.services.interpolator = new Qe(n)
      }
      return (
        (a.translator = new Ge(a.services, i)),
        a.translator.on(`*`, (e, ...t) => {
          a.emit(e, ...t)
        }),
        a.init(i, n),
        (a.translator.options = i),
        (a.translator.backendConnector.services.utils = {
          hasLoadedNamespace: a.hasLoadedNamespace.bind(a),
        }),
        a
      )
    }
    toJSON() {
      return {
        options: this.options,
        store: this.store,
        language: this.language,
        languages: this.languages,
        resolvedLanguage: this.resolvedLanguage,
      }
    }
  }.createInstance()
;(lt.createInstance,
  lt.dir,
  lt.init,
  lt.loadResources,
  lt.reloadResources,
  lt.use,
  lt.changeLanguage,
  lt.getFixedT,
  lt.t,
  lt.exists,
  lt.setDefaultNamespace,
  lt.hasLoadedNamespace,
  lt.loadNamespaces,
  lt.loadLanguages)
var ut = (e, t, n, r) => {
    let i = [n, { code: t, ...(r || {}) }]
    if (e?.services?.logger?.forward)
      return e.services.logger.forward(i, `warn`, `react-i18next::`, !0)
    ;(_t(i[0]) && (i[0] = `react-i18next:: ${i[0]}`),
      e?.services?.logger?.warn
        ? e.services.logger.warn(...i)
        : console?.warn && console.warn(...i))
  },
  dt = {},
  ft = (e, t, n, r) => {
    ;(_t(n) && dt[n]) || (_t(n) && (dt[n] = new Date()), ut(e, t, n, r))
  },
  pt = (e, t) => () => {
    if (e.isInitialized) t()
    else {
      let n = () => {
        ;(setTimeout(() => {
          e.off(`initialized`, n)
        }, 0),
          t())
      }
      e.on(`initialized`, n)
    }
  },
  mt = (e, t, n) => {
    e.loadNamespaces(t, pt(e, n))
  },
  ht = (e, t, n, r) => {
    if ((_t(n) && (n = [n]), e.options.preload && e.options.preload.indexOf(t) > -1))
      return mt(e, n, r)
    ;(n.forEach((t) => {
      e.options.ns.indexOf(t) < 0 && e.options.ns.push(t)
    }),
      e.loadLanguages(t, pt(e, r)))
  },
  gt = (e, t, n = {}) =>
    !t.languages || !t.languages.length
      ? (ft(t, `NO_LANGUAGES`, `i18n.languages were undefined or empty`, {
          languages: t.languages,
        }),
        !0)
      : t.hasLoadedNamespace(e, {
          lng: n.lng,
          precheck: (t, r) => {
            if (
              n.bindI18n &&
              n.bindI18n.indexOf(`languageChanging`) > -1 &&
              t.services.backendConnector.backend &&
              t.isLanguageChangingTo &&
              !r(t.isLanguageChangingTo, e)
            )
              return !1
          },
        }),
  _t = (e) => typeof e == `string`,
  vt = (e) => typeof e == `object` && !!e,
  yt =
    /&(?:amp|#38|lt|#60|gt|#62|apos|#39|quot|#34|nbsp|#160|copy|#169|reg|#174|hellip|#8230|#x2F|#47);/g,
  bt = {
    "&amp;": `&`,
    "&#38;": `&`,
    "&lt;": `<`,
    "&#60;": `<`,
    "&gt;": `>`,
    "&#62;": `>`,
    "&apos;": `'`,
    "&#39;": `'`,
    "&quot;": `"`,
    "&#34;": `"`,
    "&nbsp;": ` `,
    "&#160;": ` `,
    "&copy;": `©`,
    "&#169;": `©`,
    "&reg;": `®`,
    "&#174;": `®`,
    "&hellip;": `…`,
    "&#8230;": `…`,
    "&#x2F;": `/`,
    "&#47;": `/`,
  },
  xt = (e) => bt[e],
  St = {
    bindI18n: `languageChanged`,
    bindI18nStore: ``,
    transEmptyNodeValue: ``,
    transSupportBasicHtmlNodes: !0,
    transWrapTextNodes: ``,
    transKeepBasicHtmlNodesFor: [`br`, `strong`, `i`, `p`],
    useSuspense: !0,
    unescape: (e) => e.replace(yt, xt),
    transDefaultProps: void 0,
  },
  Ct = (e = {}) => {
    St = { ...St, ...e }
  },
  wt = () => St,
  Tt,
  Et = (e) => {
    Tt = e
  },
  Dt = () => Tt,
  Ot = {
    type: `3rdParty`,
    init(e) {
      ;(Ct(e.options.react), Et(e))
    },
  },
  kt = (0, _.createContext)(),
  At = class {
    constructor() {
      this.usedNamespaces = {}
    }
    addUsedNamespaces(e) {
      e.forEach((e) => {
        this.usedNamespaces[e] || (this.usedNamespaces[e] = !0)
      })
    }
    getUsedNamespaces() {
      return Object.keys(this.usedNamespaces)
    }
  },
  jt = o((e) => {
    var t = u()
    function n(e, t) {
      return (e === t && (e !== 0 || 1 / e == 1 / t)) || (e !== e && t !== t)
    }
    var r = typeof Object.is == `function` ? Object.is : n,
      i = t.useState,
      a = t.useEffect,
      o = t.useLayoutEffect,
      s = t.useDebugValue
    function c(e, t) {
      var n = t(),
        r = i({ inst: { value: n, getSnapshot: t } }),
        c = r[0].inst,
        u = r[1]
      return (
        o(
          function () {
            ;((c.value = n), (c.getSnapshot = t), l(c) && u({ inst: c }))
          },
          [e, n, t],
        ),
        a(
          function () {
            return (
              l(c) && u({ inst: c }),
              e(function () {
                l(c) && u({ inst: c })
              })
            )
          },
          [e],
        ),
        s(n),
        n
      )
    }
    function l(e) {
      var t = e.getSnapshot
      e = e.value
      try {
        var n = t()
        return !r(e, n)
      } catch {
        return !0
      }
    }
    function d(e, t) {
      return t()
    }
    var f =
      typeof window > `u` || window.document === void 0 || window.document.createElement === void 0
        ? d
        : c
    e.useSyncExternalStore = t.useSyncExternalStore === void 0 ? f : t.useSyncExternalStore
  }),
  Mt = o((e, t) => {
    t.exports = jt()
  })(),
  Nt = {
    t: (e, t) => {
      if (_t(t)) return t
      if (vt(t) && _t(t.defaultValue)) return t.defaultValue
      if (typeof e == `function`) return ``
      if (Array.isArray(e)) {
        let t = e[e.length - 1]
        return typeof t == `function` ? `` : t
      }
      return e
    },
    ready: !1,
  },
  Pt = () => () => {},
  Ft = (e, t = {}) => {
    let { i18n: n } = t,
      { i18n: r, defaultNS: i } = (0, _.useContext)(kt) || {},
      a = n || r || Dt()
    ;(a && !a.reportNamespaces && (a.reportNamespaces = new At()),
      a ||
        ft(
          a,
          `NO_I18NEXT_INSTANCE`,
          `useTranslation: You will need to pass in an i18next instance by using initReactI18next or by passing it via props or context. In monorepo setups, make sure there is only one instance of react-i18next.`,
        ))
    let o = (0, _.useMemo)(() => ({ ...wt(), ...a?.options?.react, ...t }), [a, t]),
      { useSuspense: s, keyPrefix: c } = o,
      l = e || i || a?.options?.defaultNS,
      u = _t(l) ? [l] : l || [`translation`],
      d = (0, _.useMemo)(() => u, u)
    a?.reportNamespaces?.addUsedNamespaces?.(d)
    let f = (0, _.useRef)(0),
      p = (0, _.useCallback)(
        (e) => {
          if (!a) return Pt
          let { bindI18n: t, bindI18nStore: n } = o,
            r = () => {
              ;((f.current += 1), e())
            }
          return (
            t && a.on(t, r),
            n && a.store.on(n, r),
            () => {
              ;(t && t.split(` `).forEach((e) => a.off(e, r)),
                n && n.split(` `).forEach((e) => a.store.off(e, r)))
            }
          )
        },
        [a, o],
      ),
      m = (0, _.useRef)(),
      h = (0, _.useCallback)(() => {
        if (!a) return Nt
        let e = !!(a.isInitialized || a.initializedStoreOnce) && d.every((e) => gt(e, a, o)),
          n = t.lng || a.language,
          r = f.current,
          i = m.current
        if (i && i.ready === e && i.lng === n && i.keyPrefix === c && i.revision === r) return i
        let s = {
          t: a.getFixedT(n, o.nsMode === `fallback` ? d : d[0], c, { scopeNs: d }),
          ready: e,
          lng: n,
          keyPrefix: c,
          revision: r,
        }
        return ((m.current = s), s)
      }, [a, d, c, o, t.lng]),
      [g, v] = (0, _.useState)(0),
      { t: y, ready: b } = (0, Mt.useSyncExternalStore)(p, h, h)
    ;(0, _.useEffect)(() => {
      if (a && !b && !s) {
        let e = () => v((e) => e + 1)
        t.lng ? ht(a, t.lng, d, e) : mt(a, d, e)
      }
    }, [a, t.lng, d, b, s, g])
    let x = a || {},
      S = (0, _.useRef)(null),
      C = (0, _.useRef)(),
      w = (e) => {
        let t = Object.getOwnPropertyDescriptors(e)
        t.__original && delete t.__original
        let n = Object.create(Object.getPrototypeOf(e), t)
        if (!Object.prototype.hasOwnProperty.call(n, `__original`))
          try {
            Object.defineProperty(n, "__original", {
              value: e,
              writable: !1,
              enumerable: !1,
              configurable: !1,
            })
          } catch {}
        return n
      },
      T = (0, _.useMemo)(() => {
        let e = x,
          t = e?.language,
          n = e
        e &&
          (S.current && S.current.__original === e && C.current === t
            ? (n = S.current)
            : ((n = w(e)), (S.current = n), (C.current = t)))
        let r =
            !b && !s
              ? (...e) => (
                  ft(
                    a,
                    `USE_T_BEFORE_READY`,
                    `useTranslation: t was called before ready. When using useSuspense: false, make sure to check the ready flag before using t.`,
                  ),
                  y(...e)
                )
              : y,
          i = [r, n, b]
        return ((i.t = r), (i.i18n = n), (i.ready = b), i)
      }, [y, x, b, x.resolvedLanguage, x.language, x.languages])
    if (a && s && !b) {
      let e = !1
      try {
        e = !1
      } catch {}
      throw (
        e &&
          ft(
            a,
            `SUSPENDED_WHILE_LOADING`,
            `useTranslation: suspended while translations are loading (useSuspense is true by default). Add a <Suspense> boundary above this component, or set react.useSuspense: false in the i18next init options. https://react.i18next.com/latest/usetranslation-hook`,
          ),
        new Promise((e) => {
          let n = () => e()
          t.lng ? ht(a, t.lng, d, n) : mt(a, d, n)
        })
      )
    }
    return T
  },
  It = {
    translation: {
      photoTriage: {
        title: `Photo Triage`,
        subtitle: `Quick keep / drop triage of exported albums`,
        welcome: `Choose a photo folder`,
        welcomeHint: `Scan only walks the directory and pairs files — finishes in seconds; previews are generated on demand and cached.`,
        pickFolder: `Choose Photo Folder…`,
        pickFolderBusy: `Waiting for picker… (operate in the Finder window; cancel to go back)`,
        scanning: `Reading folder…`,
        scanGenerating: `Generating previews in background {{done}}/{{total}}, triage the ready part now`,
        scanDone: `Scan finished ({{count}} items)`,
        continueLast: `Continue Last Session`,
        noRecent: `No album has been scanned yet`,
        openAlbum: `Open`,
        openRecentFailed: `Failed to open this folder`,
        reselect: `Reselect`,
        reselectHint: `Back to the welcome screen to pick another photo folder (current progress is saved automatically)`,
        total: `Total`,
        keep: `Keep`,
        drop: `Drop`,
        todo: `Todo`,
        deleted: `Deleted`,
        filter: `Filter`,
        all: `All`,
        groupBy: `Group: {{state}}`,
        groupCount: `Group: {{count}}`,
        on: `On`,
        off: `Off`,
        autoNext: `Auto-advance after mark: {{state}}`,
        resetCache: `Reset cache`,
        pruneTitle: `Verify manifest: deleted items whose trash files are gone, or items with missing originals, are removed from the list`,
        pruneDone: `Reset done: removed {{removed}} stale items, kept {{kept}}`,
        emptyDirs: `Clean empty folders`,
        emptyDirsLoading: `Scanning…`,
        emptyDirsNone: `No empty folders found 🎉`,
        emptyDirsCount: `{{count}} found`,
        emptyDirsAll: `Select all`,
        emptyDirsDelete: `Delete selected folders`,
        emptyDirsArm: `⚠ Click again to confirm deleting {{count}} folders`,
        emptyDirsDeleted: `Deleted {{count}} empty folders`,
        album: `Album`,
        source: `Album: `,
        none: `—`,
        moveTo: `Move to: `,
        selectedCount: `{{count}} selected`,
        selectAll: `Select all`,
        unselectAll: `Unselect all`,
        addFolder: `＋ Folder`,
        addFolderHint: `Add a target folder: pick any folder on disk in Finder, or create a new one`,
        addFolderHeader: `Add target folder`,
        addFolderSub: `It will appear in the bar above the preview. Drag thumbnails or the preview onto a folder card to move items (photo+video paired) there. Any folder on disk works.`,
        pickExisting: `Pick an existing folder (anywhere on disk)`,
        pickExistingBtn: `📂 Pick in Finder…`,
        createNew: `Or create a new folder`,
        createNamePlaceholder: `Folder name, e.g. favorites`,
        createBtn: `📁 Pick location and create`,
        invalidName: `Enter a valid folder name (no /)`,
        alreadyInBar: `This folder is already in the bar`,
        addedFolder: `Added target folder 📁 {{path}}`,
        folderEmptyHint: `（click ＋ on the right to add any folder; drag photos onto it to move）`,
        moveInto: `Move into {{path}}`,
        movedItems: `Moved {{count}} items into 📁 {{path}}`,
        moveConfirmTitle: `Confirm move`,
        moveConfirmDesc: `Move {{count}} item(s) into 📁 {{path}}?`,
        revealInFinder: `Reveal in Finder`,
        removeFromBar: `Remove from bar`,
        movedCount: `+{{count}}`,
        pickFirst: `Select photos first (⌘/Ctrl+click thumbnails), or click one in the left column`,
        selectedAll: `Selected {{count}} items: click a folder card, press 1-9, or drag to move them`,
        noMoveItems: `No movable items`,
        alreadyTrashed: `Items already in Trash cannot be moved`,
        moveFailed: `Move failed`,
        preview: `Preview`,
        live: `Live`,
        livePair: `Live (photo+video)`,
        photo: `Photo`,
        video: `Video`,
        viewMotion: `▶ View motion (L)`,
        viewStatic: `▣ View still (L)`,
        noPreview: `Cannot generate preview (original may be corrupt or unsupported)`,
        prev: `← Prev`,
        next: `Next →`,
        keepShortcut: `Keep (K)`,
        dropShortcut: `Drop (D)`,
        restore: `↩ Restore from Trash (R)`,
        markAllKeep: `Keep all`,
        markAllDrop: `Drop all`,
        markAllKeepConfirm: `Mark all {{count}} items as Keep? Existing marks will be overwritten.`,
        markAllDropConfirm: `Mark all {{count}} items as Drop? Existing marks will be overwritten.`,
        export: `Export selection.json`,
        exportHint: `Export keep/drop marks (JSON); use the export command to copy original files`,
        exported: `Exported: {{keeps}} kept / {{drops}} dropped`,
        exportEmpty: `No marks yet (keep or drop are both exportable)`,
        trash: `Move to Trash…`,
        trashCount: `Move to Trash ({{count}} items)`,
        trashEmpty: `No items marked Drop yet (unprocessed ones stay untouched). Press D to mark, or use "Drop all".`,
        trashConfirmTitle: `Confirm: move to Trash`,
        trashConfirmSub: `{{count}} items / {{count2}} files will be moved to Trash (recoverable from Trash). They will no longer exist in their original folders. Review every file path carefully.`,
        trashConfirmOk: `Move to Trash`,
        trashProcessing: `Processing…`,
        trashMoved: `Moved {{count}} file(s) to Trash; recoverable from Trash`,
        trashMovedWarn: `Moved {{count}} file(s) to Trash; {{count2}} failed (see console)`,
        restored: `Restored {{count}} file(s) from Trash and marked as Keep`,
        restoredWarn: `Restored {{count}} file(s); {{count2}} failed (see console)`,
        noUndo: `Nothing to undo`,
        helpShortcuts: `? Shortcuts`,
        helpTitle: `Keyboard shortcuts`,
        helpOk: `Got it`,
        k1: `← / →`,
        k2: `K`,
        k3: `D`,
        k4: `U`,
        k5: `R`,
        k6: `0`,
        k7: `Space`,
        k8: `L`,
        k9: `F`,
        k10: `G`,
        k11: `Esc`,
        k12: `Click preview`,
        k13: `Multi-select / move`,
        k14: `Reset cache`,
        k15: `Clean empty folders`,
        v1: `Previous / next (in current list order)`,
        v2: `Mark Keep, auto-advance to next unprocessed`,
        v3: `Mark Drop, auto-advance to next unprocessed`,
        v4: `Undo last mark`,
        v5: `Restore current Deleted item from Trash`,
        v6: `Jump to next unprocessed item`,
        v7: `Play / pause video`,
        v8: `Live Photo: still ⇄ motion`,
        v9: `Cycle filter (All/Todo/Keep/Drop/Deleted)`,
        v10: `Group by folder on/off (when on, a group index bar appears along the left edge of the thumbnail area: click a tick to jump to that group; hovering turns it blue and shows the folder name, and ticks still loading also show loaded/total; ticks fill from both ends toward the center as loading progresses — orange = loading, green = fully loaded; the tick of the group at the top of the viewport stays highlighted)`,
        v11: `Close modal / lightbox`,
        v12: `Zoom preview (fit → 100% → 200%)`,
        v13: `⌘/Ctrl+click thumbnails to multi-select, Shift+click for range, ⌘/Ctrl+A selects all under current filter; drag onto folder card, click it, or press 1-9 to move paired items`,
        v14: `Verify every item: drop deleted items whose trash is gone and items with lost originals`,
        v15: `Find completely empty folders under the album (anything counts), check and confirm delete`,
        ffmpegMissing: `ffmpeg not installed — videos show a static poster only`,
        loading: `Loading…`,
        loadFailed: `Failed to load album`,
        errorEmptyFilter: `No items under this filter`,
        cancelScan: `Cancel scan`,
        scanCanceled: `Scan canceled`,
        root: `（Root）`,
        sizeFormat: `{{size}} MB`,
        keyboard: `Keyboard`,
        thumbnails: `Thumbnails`,
        deleteFailed: `Delete failed`,
        clearSelection: `Clear selection`,
        markAs: `Mark`,
        emptyDirsSelectFirst: `Select folders to delete first`,
        splitterHint: `Drag to resize thumbnails (double-click to reset)`,
        exportFailed: `Export failed, please retry`,
        emptyDirsLoadFailed: `Failed to load empty folders; showing the previous result`,
        closeLightbox: `Close preview`,
      },
      common: {
        yes: `Yes`,
        no: `No`,
        none: `None`,
        optional: `Optional`,
        included: `Included`,
        na: `—`,
        withParenthesis: `{{prefix}} ({{detail}})`,
        desktopOnly: `This feature is only available in the desktop version of Bench.`,
        platformUnsupported: `This feature is not available on {{platform}}.`,
        platformNames: { macos: `macOS`, windows: `Windows`, linux: `Linux` },
        appTitle: `Bench - DevTools`,
        close: `Close`,
        cancel: `Cancel`,
        remove: `Remove`,
        delete: `Delete`,
        confirm: `Confirm`,
        save: `Save`,
        enable: `Enable`,
        disable: `Disable`,
        add: `Add`,
        edit: `Edit`,
        persistence: {
          recovered: `Saved classifications were unreadable. A backup was kept and the defaults were restored.`,
          newerSchema: `Saved classifications were created by a newer Bench version. Editing is disabled to protect them.`,
          tooLarge: `Saved classifications exceed the safety limit. Editing is disabled until the data is reviewed.`,
        },
        search: `Search`,
        loading: `Loading...`,
        filters: `Filters`,
        failedToLoad: `Failed to load`,
        loadFailed: `Failed to load`,
        featureLoadFailed: `Failed to load {{feature}}`,
        retry: `Retry`,
        success: `Success`,
        error: `Error`,
        warning: `Warning`,
        details: `Details`,
        unknown: `Unknown`,
        actions: { close: `Close` },
        empty: { noData: `No items to display`, selectItem: `Select an item to view details` },
        refresh: `Refresh`,
        clear: `Clear`,
      },
    },
  },
  Lt = {
    translation: {
      photoTriage: {
        title: `照片筛选`,
        subtitle: `从导出相册中快速留 / 删筛选`,
        welcome: `选择照片目录`,
        welcomeHint: `扫描只做目录遍历与配对，秒级完成；预览按需生成并缓存。`,
        pickFolder: `选择照片目录…`,
        pickFolderBusy: `等待选择…（在弹出的访达窗口中操作，取消可返回）`,
        scanning: `正在读取目录…`,
        scanGenerating: `后台生成预览中 {{done}}/{{total}}，可先筛选已就绪的部分`,
        scanDone: `扫描完成（共 {{count}} 项）`,
        continueLast: `继续上次进度`,
        noRecent: `还没有扫描过的相册`,
        openAlbum: `打开`,
        openRecentFailed: `打开该目录失败`,
        reselect: `重新选择`,
        reselectHint: `返回欢迎页，重新选择照片目录进入筛选（当前进度已自动保存）`,
        total: `共`,
        keep: `留`,
        drop: `删`,
        todo: `未处理`,
        deleted: `已删`,
        filter: `筛选`,
        all: `全部`,
        groupBy: `分组：{{state}}`,
        groupCount: `分组：{{count}} 组`,
        on: `开`,
        off: `关`,
        autoNext: `标记后自动跳：{{state}}`,
        resetCache: `重置缓存`,
        pruneTitle: `核对清单：废纸篓已被清空的已删条目、文件丢失的条目，直接从列表移除`,
        pruneDone: `重置完成：移除 {{removed}} 个失效条目，保留 {{kept}} 个`,
        emptyDirs: `清理空文件夹`,
        emptyDirsLoading: `扫描中…`,
        emptyDirsNone: `没有找到空文件夹 🎉`,
        emptyDirsCount: `本次扫描到 {{count}} 个`,
        emptyDirsAll: `全选`,
        emptyDirsDelete: `删除选中的文件夹`,
        emptyDirsArm: `⚠ 再次点击确认删除 {{count}} 个文件夹`,
        emptyDirsDeleted: `已删除 {{count}} 个空文件夹`,
        album: `相册`,
        source: `相册：`,
        none: `—`,
        moveTo: `移动到：`,
        selectedCount: `已选 {{count}} 项`,
        selectAll: `全选`,
        unselectAll: `取消全选`,
        addFolder: `＋ 文件夹`,
        addFolderHint: `添加待选文件夹：在访达中选择磁盘上任意文件夹，或选位置新建`,
        addFolderHeader: `添加待选文件夹`,
        addFolderSub: `添加后会显示在详情图上方的待选栏。把左栏缩略图或大图拖到文件夹上，即可把该条目（图+视频成对）移入。可选磁盘上任意位置的文件夹。`,
        pickExisting: `选择已有文件夹（磁盘上任意位置）`,
        pickExistingBtn: `📂 在访达中选取…`,
        createNew: `或新建文件夹`,
        createNamePlaceholder: `文件夹名，例如：精选`,
        createBtn: `📁 选择位置并创建`,
        invalidName: `请输入合法的文件夹名（不含 /）`,
        alreadyInBar: `该文件夹已在待选栏`,
        addedFolder: `已添加待选文件夹 📁 {{path}}`,
        folderEmptyHint: `（点右侧 ＋ 添加任意文件夹为待选，把图片拖上去即可移动）`,
        moveInto: `移入 {{path}}`,
        movedItems: `已把 {{count}} 项移入 📁 {{path}}`,
        moveConfirmTitle: `确认移动`,
        moveConfirmDesc: `将 {{count}} 项移入 📁 {{path}}？`,
        revealInFinder: `在访达中显示`,
        removeFromBar: `从待选栏移除`,
        movedCount: `+{{count}}`,
        pickFirst: `先选中图片（⌘/Ctrl+点击缩略图），或先在左栏点选一张`,
        selectedAll: `已选中 {{count}} 项：点文件夹卡片、按数字键 1-9 或直接拖动即可批量移动`,
        noMoveItems: `没有可移动的条目`,
        alreadyTrashed: `已在废纸篓的条目不能移动`,
        moveFailed: `移动失败`,
        preview: `大图预览`,
        live: `实况`,
        livePair: `实况(图+视频)`,
        photo: `图片`,
        video: `视频`,
        viewMotion: `▶ 看动态 (L)`,
        viewStatic: `▣ 看静态 (L)`,
        noPreview: `无法生成预览（原文件可能损坏或格式未支持）`,
        prev: `← 上一张`,
        next: `下一张 →`,
        keepShortcut: `留 (K)`,
        dropShortcut: `删 (D)`,
        restore: `↩ 从废纸篓恢复 (R)`,
        markAllKeep: `全部标记留`,
        markAllDrop: `全部标记删`,
        markAllKeepConfirm: `将全部 {{count}} 项标记为「留」？已有标记会被覆盖。`,
        markAllDropConfirm: `将全部 {{count}} 项标记为「删」？已有标记会被覆盖。`,
        export: `导出 selection.json`,
        exportHint: `导出留/删标记（JSON），可用 export 命令复制原文件`,
        exported: `已导出：留 {{keeps}} 项 / 删 {{drops}} 项`,
        exportEmpty: `还没有任何标记（留/删均可导出）`,
        trash: `移入废纸篓…`,
        trashCount: `移入废纸篓 ({{count}} 项)`,
        trashEmpty: `还没有标记任何「删」的项（未处理的不会动）。用 D 键标记，或点「全部标记删」。`,
        trashConfirmTitle: `二次确认：移入废纸篓`,
        trashConfirmSub: `以下 {{count}} 项 / {{count2}} 个文件将被移入废纸篓（可在废纸篓恢复），原文件夹将不再包含它们。请仔细核对每个文件路径。`,
        trashConfirmOk: `确认移入废纸篓`,
        trashProcessing: `处理中…`,
        trashMoved: `已移入废纸篓 {{count}} 个文件，可在废纸篓恢复`,
        trashMovedWarn: `已移入废纸篓 {{count}} 个文件；{{count2}} 个出错（详见控制台）`,
        restored: `已从废纸篓恢复 {{count}} 个文件，并标记为「留」`,
        restoredWarn: `已恢复 {{count}} 个文件；{{count2}} 个出错（详见控制台）`,
        noUndo: `没有可撤销的操作`,
        helpShortcuts: `? 快捷键`,
        helpTitle: `快捷键`,
        helpOk: `知道了`,
        k1: `← / →`,
        k2: `K`,
        k3: `D`,
        k4: `U`,
        k5: `R`,
        k6: `0`,
        k7: `空格`,
        k8: `L`,
        k9: `F`,
        k10: `G`,
        k11: `Esc`,
        k12: `点击大图区`,
        k13: `多选 / 移动`,
        k14: `重置缓存`,
        k15: `清理空文件夹`,
        v1: `上一张 / 下一张（按当前列表顺序）`,
        v2: `标记「留」，自动跳到下一张未处理`,
        v3: `标记「删」，自动跳到下一张未处理`,
        v4: `撤销上一步标记`,
        v5: `把当前「已删」条目从废纸篓恢复到原位置（后悔药）`,
        v6: `跳到下一个未处理项`,
        v7: `播放 / 暂停视频`,
        v8: `实况照片：静态 ⇄ 动态切换`,
        v9: `循环切换筛选（全部/未处理/留/删/已删）`,
        v10: `按文件夹分组 开/关（开启后缩略图区最左缘出现分组索引条：点击刻度跳到对应分组，悬停变蓝并显示文件夹名，加载中的刻度还显示 已加载/总数；刻度按加载进度从两端向中心填充，橙色=加载中，填满变绿；当前所在分组的刻度常亮）`,
        v11: `关闭弹窗 / 大图`,
        v12: `放大查看（fit → 100% → 200%），方便判断清晰度`,
        v13: `⌘/Ctrl+点击缩略图可多选，Shift+点击从上次点击处范围多选，⌘/Ctrl+A 选中当前筛选下全部；拖到文件夹卡片或点卡片（或按数字键 1-9）即成对移动`,
        v14: `核对清单里每个条目：废纸篓已被清空的已删条目、原文件丢失的条目，直接从列表移除`,
        v15: `找出相册目录下完全为空的文件夹（有任何文件都不算空），勾选后二次确认删除`,
        ffmpegMissing: `未安装 ffmpeg，视频仅静态封面`,
        loading: `加载中…`,
        loadFailed: `加载相册失败`,
        errorEmptyFilter: `该筛选下没有条目`,
        cancelScan: `取消扫描`,
        scanCanceled: `扫描已取消`,
        root: `（根目录）`,
        sizeFormat: `{{size}} MB`,
        keyboard: `键盘操作`,
        thumbnails: `缩略图`,
        deleteFailed: `删除失败`,
        clearSelection: `清除多选`,
        markAs: `标记`,
        emptyDirsSelectFirst: `请先勾选要删除的文件夹`,
        splitterHint: `拖动调整缩略图栏宽度（双击恢复默认）`,
        exportFailed: `导出失败，请重试`,
        emptyDirsLoadFailed: `空文件夹列表加载失败，已保留上一次结果`,
        closeLightbox: `关闭大图预览`,
      },
      common: {
        yes: `有`,
        no: `无`,
        none: `无`,
        optional: `可选`,
        included: `附赠`,
        na: `—`,
        withParenthesis: `{{prefix}}（{{detail}}）`,
        desktopOnly: `此功能仅在 Bench 桌面版中可用。`,
        platformUnsupported: `此功能在 {{platform}} 上不可用。`,
        platformNames: { macos: `macOS`, windows: `Windows`, linux: `Linux` },
        appTitle: `Bench - DevTools`,
        close: `关闭`,
        cancel: `取消`,
        remove: `移除`,
        delete: `删除`,
        confirm: `确认`,
        save: `保存`,
        enable: `启用`,
        disable: `停用`,
        add: `添加`,
        edit: `编辑`,
        persistence: {
          recovered: `已保存的分类数据无法读取，系统已保留备份并恢复默认分类。`,
          newerSchema: `分类数据由更新版本的 Bench 创建。为防止覆盖，当前已禁用编辑。`,
          tooLarge: `分类数据超过安全上限。检查数据前，当前已禁用编辑。`,
        },
        search: `搜索`,
        loading: `加载中...`,
        filters: `筛选`,
        failedToLoad: `加载失败`,
        loadFailed: `加载失败`,
        featureLoadFailed: `{{feature}} 加载失败`,
        retry: `重试`,
        success: `成功`,
        error: `错误`,
        warning: `警告`,
        details: `详情`,
        unknown: `未知`,
        actions: { close: `关闭` },
        empty: { noData: `暂无数据`, selectItem: `请选择一个项目查看详情` },
        refresh: `刷新`,
        clear: `清除`,
      },
    },
  },
  Rt = typeof navigator < `u` && navigator.language.startsWith(`zh`) ? `zh` : `en`
lt.use(Ot).init({
  resources: { zh: { translation: Lt }, en: { translation: It } },
  lng: Rt,
  fallbackLng: `en`,
  interpolation: { escapeValue: !1 },
})
var zt = (...e) =>
    e
      .filter((e, t, n) => !!e && e.trim() !== `` && n.indexOf(e) === t)
      .join(` `)
      .trim(),
  Bt = (e) => e.replace(/([a-z0-9])([A-Z])/g, `$1-$2`).toLowerCase(),
  Vt = (e) =>
    e.replace(/^([A-Z])|[\s-_]+(\w)/g, (e, t, n) => (n ? n.toUpperCase() : t.toLowerCase())),
  Ht = (e) => {
    let t = Vt(e)
    return t.charAt(0).toUpperCase() + t.slice(1)
  },
  Ut = {
    xmlns: `http://www.w3.org/2000/svg`,
    width: 24,
    height: 24,
    viewBox: `0 0 24 24`,
    fill: `none`,
    stroke: `currentColor`,
    strokeWidth: 2,
    strokeLinecap: `round`,
    strokeLinejoin: `round`,
  },
  Wt = (e) => {
    for (let t in e) if (t.startsWith(`aria-`) || t === `role` || t === `title`) return !0
    return !1
  },
  Gt = (0, _.createContext)({}),
  Kt = () => (0, _.useContext)(Gt),
  qt = (0, _.forwardRef)(
    (
      {
        color: e,
        size: t,
        strokeWidth: n,
        absoluteStrokeWidth: r,
        className: i = ``,
        children: a,
        iconNode: o,
        ...s
      },
      c,
    ) => {
      let {
          size: l = 24,
          strokeWidth: u = 2,
          absoluteStrokeWidth: d = !1,
          color: f = `currentColor`,
          className: p = ``,
        } = Kt() ?? {},
        m = (r ?? d) ? (Number(n ?? u) * 24) / Number(t ?? l) : (n ?? u)
      return (0, _.createElement)(
        `svg`,
        {
          ref: c,
          ...Ut,
          width: t ?? l ?? Ut.width,
          height: t ?? l ?? Ut.height,
          stroke: e ?? f,
          strokeWidth: m,
          className: zt(`lucide`, p, i),
          ...(!a && !Wt(s) && { "aria-hidden": `true` }),
          ...s,
        },
        [...o.map(([e, t]) => (0, _.createElement)(e, t)), ...(Array.isArray(a) ? a : [a])],
      )
    },
  ),
  Jt = (e, t) => {
    let n = (0, _.forwardRef)(({ className: n, ...r }, i) =>
      (0, _.createElement)(qt, {
        ref: i,
        iconNode: t,
        className: zt(`lucide-${Bt(Ht(e))}`, `lucide-${e}`, n),
        ...r,
      }),
    )
    return ((n.displayName = Ht(e)), n)
  },
  Yt = Jt(`circle-question-mark`, [
    [`circle`, { cx: `12`, cy: `12`, r: `10`, key: `1mglay` }],
    [`path`, { d: `M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3`, key: `1u773s` }],
    [`path`, { d: `M12 17h.01`, key: `p32p05` }],
  ]),
  Xt = Jt(`download`, [
    [`path`, { d: `M12 15V3`, key: `m9g1x1` }],
    [`path`, { d: `M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4`, key: `ih7n3h` }],
    [`path`, { d: `m7 10 5 5 5-5`, key: `brsn70` }],
  ]),
  Zt = Jt(`folder-cog`, [
    [
      `path`,
      {
        d: `M10.3 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.98a2 2 0 0 1 1.69.9l.66 1.2A2 2 0 0 0 12 6h8a2 2 0 0 1 2 2v3.3`,
        key: `128dxu`,
      },
    ],
    [`path`, { d: `m14.305 19.53.923-.382`, key: `3m78fa` }],
    [`path`, { d: `m15.228 16.852-.923-.383`, key: `npixar` }],
    [`path`, { d: `m16.852 15.228-.383-.923`, key: `5xggr7` }],
    [`path`, { d: `m16.852 20.772-.383.924`, key: `dpfhf9` }],
    [`path`, { d: `m19.148 15.228.383-.923`, key: `1reyyz` }],
    [`path`, { d: `m19.53 21.696-.382-.924`, key: `1goivc` }],
    [`path`, { d: `m20.772 16.852.924-.383`, key: `htqkph` }],
    [`path`, { d: `m20.772 19.148.924.383`, key: `9w9pjp` }],
    [`circle`, { cx: `18`, cy: `18`, r: `3`, key: `1xkwt0` }],
  ]),
  Qt = Jt(`folder-open`, [
    [
      `path`,
      {
        d: `m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2`,
        key: `usdka0`,
      },
    ],
  ]),
  $t = Jt(`folder-plus`, [
    [`path`, { d: `M12 10v6`, key: `1bos4e` }],
    [`path`, { d: `M9 13h6`, key: `1uhe8q` }],
    [
      `path`,
      {
        d: `M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z`,
        key: `1kt360`,
      },
    ],
  ]),
  en = Jt(`image`, [
    [`rect`, { width: `18`, height: `18`, x: `3`, y: `3`, rx: `2`, ry: `2`, key: `1m3agn` }],
    [`circle`, { cx: `9`, cy: `9`, r: `2`, key: `af1f0g` }],
    [`path`, { d: `m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21`, key: `1xmnt7` }],
  ]),
  tn = Jt(`loader-circle`, [[`path`, { d: `M21 12a9 9 0 1 1-6.219-8.56`, key: `13zald` }]]),
  nn = Jt(`play`, [
    [
      `path`,
      {
        d: `M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z`,
        key: `10ikf1`,
      },
    ],
  ]),
  rn = Jt(`refresh-cw`, [
    [`path`, { d: `M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8`, key: `v9h5vc` }],
    [`path`, { d: `M21 3v5h-5`, key: `1q7to0` }],
    [`path`, { d: `M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16`, key: `3uifl3` }],
    [`path`, { d: `M8 16H3v5`, key: `1cv678` }],
  ]),
  an = Jt(`rotate-ccw-clock`, [
    [`path`, { d: `M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8`, key: `1357e3` }],
    [`path`, { d: `M3 3v5h5`, key: `1xhq8a` }],
    [`path`, { d: `M12 7v5l4 2`, key: `1fdv2h` }],
  ]),
  on = Jt(`square`, [
    [`rect`, { width: `18`, height: `18`, x: `3`, y: `3`, rx: `2`, key: `afitv7` }],
  ]),
  sn = Jt(`trash-2`, [
    [`path`, { d: `M10 11v6`, key: `nco0om` }],
    [`path`, { d: `M14 11v6`, key: `outv1u` }],
    [`path`, { d: `M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6`, key: `miytrc` }],
    [`path`, { d: `M3 6h18`, key: `d0wm0j` }],
    [`path`, { d: `M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2`, key: `e791ji` }],
  ]),
  cn = Jt(`x`, [
    [`path`, { d: `M18 6 6 18`, key: `1bl5f8` }],
    [`path`, { d: `m6 6 12 12`, key: `d8bk6v` }],
  ])
function ln(e) {
  var t,
    n,
    r = ``
  if (typeof e == `string` || typeof e == `number`) r += e
  else if (typeof e == `object`) {
    if (Array.isArray(e)) {
      var i = e.length
      for (t = 0; t < i; t++) e[t] && (n = ln(e[t])) && (r && (r += ` `), (r += n))
    } else for (n in e) e[n] && (r && (r += ` `), (r += n))
  }
  return r
}
function un() {
  for (var e, t, n = 0, r = ``, i = arguments.length; n < i; n++)
    (e = arguments[n]) && (t = ln(e)) && (r && (r += ` `), (r += t))
  return r
}
var dn = (e) => (typeof e == `boolean` ? `${e}` : e === 0 ? `0` : e),
  fn = un,
  pn = (e, t) => (n) => {
    if (t?.variants == null) return fn(e, n?.class, n?.className)
    let { variants: r, defaultVariants: i } = t,
      a = Object.keys(r).map((e) => {
        let t = n?.[e],
          a = i?.[e]
        if (t === null) return null
        let o = dn(t) || dn(a)
        return r[e][o]
      }),
      o =
        n &&
        Object.entries(n).reduce((e, t) => {
          let [n, r] = t
          return (r === void 0 || (e[n] = r), e)
        }, {})
    return fn(
      e,
      a,
      t?.compoundVariants?.reduce((e, t) => {
        let { class: n, className: r, ...a } = t
        return Object.entries(a).every((e) => {
          let [t, n] = e
          return Array.isArray(n) ? n.includes({ ...i, ...o }[t]) : { ...i, ...o }[t] === n
        })
          ? [...e, n, r]
          : e
      }, []),
      n?.class,
      n?.className,
    )
  },
  mn = Object.defineProperty,
  hn = (e, t) => mn(e, `name`, { value: t, configurable: !0 })
function gn(e, t) {
  if (typeof e == `function`) return e(t)
  e != null && (e.current = t)
}
hn(gn, `setRef`)
function _n(...e) {
  return (t) => {
    let n = !1,
      r = e.map((e) => {
        let r = gn(e, t)
        return (!n && typeof r == `function` && (n = !0), r)
      })
    if (n)
      return () => {
        for (let t = 0; t < r.length; t++) {
          let n = r[t]
          typeof n == `function` ? n() : gn(e[t], null)
        }
      }
  }
}
hn(_n, `composeRefs`)
function vn(...e) {
  return _.useCallback(_n(...e), e)
}
hn(vn, `useComposedRefs`)
var yn = Object.defineProperty,
  bn = (e, t) => yn(e, `name`, { value: t, configurable: !0 })
function xn(e) {
  let t = _.forwardRef((t, n) => {
    let { children: r, ...i } = t,
      a = null,
      o = !1,
      s = []
    ;(An(r) && typeof Pn == `function` && (r = Pn(r._payload)),
      _.Children.forEach(r, (e) => {
        if (On(e)) {
          o = !0
          let t = e,
            n = `child` in t.props ? t.props.child : t.props.children
          ;(An(n) && typeof Pn == `function` && (n = Pn(n._payload)),
            (a = Tn(t, n)),
            s.push(a?.props?.children))
        } else s.push(e)
      }),
      a
        ? (a = _.cloneElement(a, void 0, s))
        : !o && _.Children.count(r) === 1 && _.isValidElement(r) && (a = r))
    let c = a ? Dn(a) : void 0,
      l = vn(n, c)
    if (!a) {
      if (r || r === 0) throw Error(o ? Nn(e) : Mn(e))
      return r
    }
    let u = En(i, a.props ?? {})
    return (a.type !== _.Fragment && (u.ref = n ? l : c), _.cloneElement(a, u))
  })
  return ((t.displayName = `${e}.Slot`), t)
}
bn(xn, `createSlot`)
var Sn = xn(`Slot`),
  Cn = Symbol.for(`radix.slottable`)
function wn(e) {
  let t = bn((e) => (`child` in e ? e.children(e.child) : e.children), `Slottable`)
  return ((t.displayName = `${e}.Slottable`), (t.__radixId = Cn), t)
}
bn(wn, `createSlottable`)
var Tn = bn((e, t) => {
  if (`child` in e.props) {
    let t = e.props.child
    return _.isValidElement(t)
      ? _.cloneElement(t, void 0, e.props.children(t.props.children))
      : null
  }
  return _.isValidElement(t) ? t : null
}, `getSlottableElementFromSlottable`)
function En(e, t) {
  let n = { ...t }
  for (let r in t) {
    let i = e[r],
      a = t[r]
    ;/^on[A-Z]/.test(r)
      ? i && a
        ? (n[r] = (...e) => {
            let t = a(...e)
            return (i(...e), t)
          })
        : i && (n[r] = i)
      : r === `style`
        ? (n[r] = { ...i, ...a })
        : r === `className` && (n[r] = [i, a].filter(Boolean).join(` `))
  }
  return { ...e, ...n }
}
bn(En, `mergeProps`)
function Dn(e) {
  let t = Object.getOwnPropertyDescriptor(e.props, `ref`)?.get,
    n = t && `isReactWarning` in t && t.isReactWarning
  return n
    ? e.ref
    : ((t = Object.getOwnPropertyDescriptor(e, `ref`)?.get),
      (n = t && `isReactWarning` in t && t.isReactWarning),
      n ? e.props.ref : e.props.ref || e.ref)
}
bn(Dn, `getElementRef`)
function On(e) {
  return (
    _.isValidElement(e) &&
    typeof e.type == `function` &&
    `__radixId` in e.type &&
    e.type.__radixId === Cn
  )
}
bn(On, `isSlottable`)
var kn = Symbol.for(`react.lazy`)
function An(e) {
  return (
    typeof e == `object` &&
    !!e &&
    `$$typeof` in e &&
    e.$$typeof === kn &&
    `_payload` in e &&
    jn(e._payload)
  )
}
bn(An, `isLazyComponent`)
function jn(e) {
  return typeof e == `object` && !!e && `then` in e
}
bn(jn, `isPromiseLike`)
var Mn = bn(
    (e) =>
      `${e} failed to slot onto its children. Expected a single React element child or \`Slottable\`.`,
    `createSlotError`,
  ),
  Nn = bn(
    (e) =>
      `${e} failed to slot onto its \`Slottable\`. Expected \`Slottable\` to receive a single React element child.`,
    `createSlottableError`,
  ),
  Pn = _.use,
  Fn = o((e) => {
    var t = Symbol.for(`react.transitional.element`),
      n = Symbol.for(`react.fragment`)
    function r(e, n, r) {
      var i = null
      if ((r !== void 0 && (i = `` + r), n.key !== void 0 && (i = `` + n.key), `key` in n))
        for (var a in ((r = {}), n)) a !== `key` && (r[a] = n[a])
      else r = n
      return ((n = r.ref), { $$typeof: t, type: e, key: i, ref: n === void 0 ? null : n, props: r })
    }
    ;((e.Fragment = n), (e.jsx = r), (e.jsxs = r))
  }),
  L = o((e, t) => {
    t.exports = Fn()
  })(),
  In = Object.defineProperty,
  Ln = (e, t) => In(e, `name`, { value: t, configurable: !0 }),
  Rn = [
    `a`,
    `button`,
    `div`,
    `form`,
    `h2`,
    `h3`,
    `img`,
    `input`,
    `label`,
    `li`,
    `nav`,
    `ol`,
    `p`,
    `select`,
    `span`,
    `svg`,
    `ul`,
  ].reduce((e, t) => {
    let n = xn(`Primitive.${t}`),
      r = _.forwardRef((e, r) => {
        let { asChild: i, ...a } = e,
          o = i ? n : t
        return (
          typeof window < `u` && (window[Symbol.for(`radix-ui`)] = !0),
          (0, L.jsx)(o, { ...a, ref: r })
        )
      })
    return ((r.displayName = `Primitive.${t}`), { ...e, [t]: r })
  }, {})
function zn(e, t) {
  e && v.flushSync(() => e.dispatchEvent(t))
}
Ln(zn, `dispatchDiscreteCustomEvent`)
var Bn = Object.defineProperty,
  Vn = (e, t) => Bn(e, `name`, { value: t, configurable: !0 })
function Hn(e, t) {
  let n = _.createContext(t)
  n.displayName = e + `Context`
  let r = Vn((e) => {
    let { children: t, ...r } = e,
      i = _.useMemo(() => r, Object.values(r))
    return (0, L.jsx)(n.Provider, { value: i, children: t })
  }, `Provider`)
  r.displayName = e + `Provider`
  function i(r, i = {}) {
    let { optional: a = !1 } = i,
      o = _.useContext(n)
    if (o) return o
    if (t !== void 0) return t
    if (!a) throw Error(`\`${r}\` must be used within \`${e}\``)
  }
  return (Vn(i, `useContext`), [r, i])
}
Vn(Hn, `createContext`)
function Un(e, t = []) {
  let n = []
  function r(t, r) {
    let i = _.createContext(r)
    i.displayName = t + `Context`
    let a = n.length
    n = [...n, r]
    let o = Vn((t) => {
      let { scope: n, children: r, ...o } = t,
        s = n?.[e]?.[a] || i,
        c = _.useMemo(() => o, Object.values(o))
      return (0, L.jsx)(s.Provider, { value: c, children: r })
    }, `Provider`)
    o.displayName = t + `Provider`
    function s(n, o, s = {}) {
      let { optional: c = !1 } = s,
        l = o?.[e]?.[a] || i,
        u = _.useContext(l)
      if (u) return u
      if (r !== void 0) return r
      if (!c) throw Error(`\`${n}\` must be used within \`${t}\``)
    }
    return (Vn(s, `useContext`), [o, s])
  }
  Vn(r, `createContext`)
  let i = Vn(() => {
    let t = n.map((e) => _.createContext(e))
    return Vn(function (n) {
      let r = n?.[e] || t
      return _.useMemo(() => ({ [`__scope${e}`]: { ...n, [e]: r } }), [n, r])
    }, `useScope`)
  }, `createScope`)
  return ((i.scopeName = e), [r, Wn(i, ...t)])
}
Vn(Un, `createContextScope`)
function Wn(...e) {
  let t = e[0]
  if (e.length === 1) return t
  let n = Vn(() => {
    let n = e.map((e) => ({ useScope: e(), scopeName: e.scopeName }))
    return Vn(function (e) {
      let r = n.reduce((t, { useScope: n, scopeName: r }) => {
        let i = n(e)[`__scope${r}`]
        return { ...t, ...i }
      }, {})
      return _.useMemo(() => ({ [`__scope${t.scopeName}`]: r }), [r])
    }, `useComposedScopes`)
  }, `createScope`)
  return ((n.scopeName = t.scopeName), n)
}
Vn(Wn, `composeContextScopes`)
var Gn = Object.defineProperty,
  Kn = (e, t) => Gn(e, `name`, { value: t, configurable: !0 }),
  qn = !!(typeof window < `u` && window.document && window.document.createElement)
function Jn(e, t, { checkForDefaultPrevented: n = !0 } = {}) {
  return Kn(function (r) {
    if ((e?.(r), n === !1 || !r || !r.defaultPrevented)) return t?.(r)
  }, `handleEvent`)
}
Kn(Jn, `composeEventHandlers`)
function Yn(e) {
  if (!qn) throw Error(`Cannot access window outside of the DOM`)
  return e?.ownerDocument?.defaultView ?? window
}
Kn(Yn, `getOwnerWindow`)
function Xn(e) {
  if (!qn) throw Error(`Cannot access document outside of the DOM`)
  return e?.ownerDocument ?? document
}
Kn(Xn, `getOwnerDocument`)
function Zn(e, t = !1) {
  let { activeElement: n } = Xn(e)
  if (!n?.nodeName) return null
  if (Qn(n) && n.contentDocument) return Zn(n.contentDocument.body, t)
  if (t) {
    let e = n.getAttribute(`aria-activedescendant`)
    if (e) {
      let t = Xn(n).getElementById(e)
      if (t) return t
    }
  }
  return n
}
Kn(Zn, `getActiveElement`)
function Qn(e) {
  return e.tagName === `IFRAME`
}
Kn(Qn, `isFrame`)
var $n = globalThis?.document ? _.useLayoutEffect : () => {},
  er = Object.defineProperty,
  tr = (e, t) => er(e, `name`, { value: t, configurable: !0 }),
  nr = _.useEffectEvent,
  rr = _.useInsertionEffect
function ir(e) {
  if (typeof nr == `function`) return nr(e)
  let t = _.useRef(() => {
    throw Error(`Cannot call an event handler while rendering.`)
  })
  return (
    typeof rr == `function`
      ? rr(() => {
          t.current = e
        })
      : $n(() => {
          t.current = e
        }),
    _.useMemo(
      () =>
        (...e) =>
          t.current?.(...e),
      [],
    )
  )
}
tr(ir, `useEffectEvent`)
var ar = Object.defineProperty,
  or = (e, t) => ar(e, `name`, { value: t, configurable: !0 }),
  sr = _.useInsertionEffect || $n
function cr({ prop: e, defaultProp: t, onChange: n = or(() => {}, `onChange`), caller: r }) {
  let [i, a, o] = lr({ defaultProp: t, onChange: n }),
    s = e !== void 0
  return [
    s ? e : i,
    _.useCallback(
      (t) => {
        if (s) {
          let n = ur(t) ? t(e) : t
          n !== e && o.current?.(n)
        } else a(t)
      },
      [s, e, a, o],
    ),
  ]
}
or(cr, `useControllableState`)
function lr({ defaultProp: e, onChange: t }) {
  let [n, r] = _.useState(e),
    i = _.useRef(n),
    a = _.useRef(t)
  return (
    sr(() => {
      a.current = t
    }, [t]),
    _.useEffect(() => {
      i.current !== n && (a.current?.(n), (i.current = n))
    }, [n, i]),
    [n, r, a]
  )
}
or(lr, `useUncontrolledState`)
function ur(e) {
  return typeof e == `function`
}
or(ur, `isFunction`)
var dr = Symbol(`RADIX:SYNC_STATE`)
function fr(e, t, n, r) {
  let { prop: i, defaultProp: a, onChange: o, caller: s } = t,
    c = i !== void 0,
    l = ir(o),
    u = [{ ...n, state: a }]
  r && u.push(r)
  let [d, f] = _.useReducer(
      (t, n) => {
        if (n.type === dr) return { ...t, state: n.state }
        let r = e(t, n)
        return (c && !Object.is(r.state, t.state) && l(r.state), r)
      },
      ...u,
    ),
    p = d.state,
    m = _.useRef(p)
  _.useEffect(() => {
    m.current !== p && ((m.current = p), c || l(p))
  }, [p, m, c])
  let h = _.useMemo(() => (i === void 0 ? d : { ...d, state: i }), [d, i])
  return (
    _.useEffect(() => {
      c && !Object.is(i, d.state) && f({ type: dr, state: i })
    }, [i, d.state, c]),
    [h, f]
  )
}
or(fr, `useControllableStateReducer`)
var pr = Object.defineProperty,
  mr = (e, t) => pr(e, `name`, { value: t, configurable: !0 })
function hr(e, t) {
  return _.useReducer((e, n) => t[e][n] ?? e, e)
}
mr(hr, `useStateMachine`)
var gr = mr((e) => {
  let { present: t, children: n } = e,
    r = _r(t),
    i = typeof n == `function` ? n({ present: r.isPresent }) : _.Children.only(n),
    a = yr(r.ref, xr(i))
  return typeof n == `function` || r.isPresent ? _.cloneElement(i, { ref: a }) : null
}, `Presence`)
function _r(e) {
  let [t, n] = _.useState(),
    r = _.useRef(null),
    i = _.useRef(e),
    a = _.useRef(`none`),
    o = _.useRef(void 0),
    [s, c] = hr(e ? `mounted` : `unmounted`, {
      mounted: { UNMOUNT: `unmounted`, ANIMATION_OUT: `unmountSuspended` },
      unmountSuspended: { MOUNT: `mounted`, ANIMATION_END: `unmounted` },
      unmounted: { MOUNT: `mounted` },
    })
  return (
    _.useEffect(() => {
      s === `mounted`
        ? ((a.current = o.current ?? br(r.current)), (o.current = void 0))
        : (a.current = `none`)
    }, [s]),
    $n(() => {
      let t = r.current,
        n = i.current
      if (n !== e) {
        let r = a.current,
          s = br(t)
        ;(e
          ? ((o.current = s), c(`MOUNT`))
          : s === `none` || t?.display === `none`
            ? c(`UNMOUNT`)
            : c(n && r !== s ? `ANIMATION_OUT` : `UNMOUNT`),
          (i.current = e))
      }
    }, [e, c]),
    $n(() => {
      if (t) {
        let e,
          n = t.ownerDocument.defaultView ?? window,
          o = mr((a) => {
            let o = br(r.current).includes(CSS.escape(a.animationName))
            if (a.target === t && o && (c(`ANIMATION_END`), !i.current)) {
              let r = t.style.animationFillMode
              ;((t.style.animationFillMode = `forwards`),
                (e = n.setTimeout(() => {
                  t.style.animationFillMode === `forwards` && (t.style.animationFillMode = r)
                })))
            }
          }, `handleAnimationEnd`),
          s = mr((e) => {
            e.target === t && (a.current = br(r.current))
          }, `handleAnimationStart`)
        return (
          t.addEventListener(`animationstart`, s),
          t.addEventListener(`animationcancel`, o),
          t.addEventListener(`animationend`, o),
          () => {
            ;(n.clearTimeout(e),
              t.removeEventListener(`animationstart`, s),
              t.removeEventListener(`animationcancel`, o),
              t.removeEventListener(`animationend`, o))
          }
        )
      }
      c(`ANIMATION_END`)
    }, [t, c]),
    {
      isPresent: [`mounted`, `unmountSuspended`].includes(s),
      ref: _.useCallback((e) => {
        if (e) {
          let t = getComputedStyle(e)
          ;((r.current = t), (o.current = br(t)))
        } else r.current = null
        n(e)
      }, []),
    }
  )
}
mr(_r, `usePresence`)
function vr(e, t) {
  if (typeof e == `function`) return e(t)
  e != null && (e.current = t)
}
mr(vr, `setRef`)
function yr(...e) {
  let t = _.useRef(e)
  return (
    (t.current = e),
    _.useCallback((e) => {
      let n = t.current,
        r = !1,
        i = n.map((t) => {
          let n = vr(t, e)
          return (!r && typeof n == `function` && (r = !0), n)
        })
      if (r)
        return () => {
          for (let e = 0; e < i.length; e++) {
            let t = i[e]
            typeof t == `function` ? t() : vr(n[e], null)
          }
        }
    }, [])
  )
}
mr(yr, `useStableComposedRefs`)
function br(e) {
  return e?.animationName || `none`
}
mr(br, `getAnimationName`)
function xr(e) {
  let t = Object.getOwnPropertyDescriptor(e.props, `ref`)?.get,
    n = t && `isReactWarning` in t && t.isReactWarning
  return n
    ? e.ref
    : ((t = Object.getOwnPropertyDescriptor(e, `ref`)?.get),
      (n = t && `isReactWarning` in t && t.isReactWarning),
      n ? e.props.ref : e.props.ref || e.ref)
}
mr(xr, `getElementRef`)
var Sr = Object.defineProperty,
  Cr = (e, t) => Sr(e, `name`, { value: t, configurable: !0 }),
  wr = _.useId || (() => void 0),
  Tr = 0
function Er(e) {
  let [t, n] = _.useState(wr())
  return (
    $n(() => {
      e || n((e) => e ?? String(Tr++))
    }, [e]),
    e || (t ? `radix-${t}` : ``)
  )
}
Cr(Er, `useId`)
var Dr = Object.defineProperty,
  Or = (e, t) => Dr(e, `name`, { value: t, configurable: !0 })
function kr(e) {
  let t = _.useRef(e)
  return (
    _.useEffect(() => {
      t.current = e
    }),
    _.useMemo(
      () =>
        (...e) =>
          t.current?.(...e),
      [],
    )
  )
}
Or(kr, `useCallbackRef`)
var Ar = Object.defineProperty,
  jr = (e, t) => Ar(e, `name`, { value: t, configurable: !0 }),
  Mr = `dismissableLayer.update`,
  Nr = `dismissableLayer.pointerDownOutside`,
  Pr = `dismissableLayer.focusOutside`,
  Fr,
  Ir = _.createContext({
    layers: new Set(),
    layersWithOutsidePointerEventsDisabled: new Set(),
    branches: new Set(),
    dismissableSurfaces: new Set(),
  }),
  Lr = _.forwardRef(
    jr(function (e, t) {
      let {
          disableOutsidePointerEvents: n = !1,
          deferPointerDownOutside: r = !1,
          onEscapeKeyDown: i,
          onPointerDownOutside: a,
          onFocusOutside: o,
          onInteractOutside: s,
          onDismiss: c,
          ...l
        } = e,
        u = _.useContext(Ir),
        [d, f] = _.useState(null),
        p = d?.ownerDocument ?? globalThis?.document,
        [, m] = _.useState({}),
        h = vn(t, f),
        g = Array.from(u.layers),
        [v] = [...u.layersWithOutsidePointerEventsDisabled].slice(-1),
        y = v ? g.indexOf(v) : -1,
        b = d ? g.indexOf(d) : -1,
        x = u.layersWithOutsidePointerEventsDisabled.size > 0,
        S = b >= y,
        C = _.useRef(!1),
        w = Br(
          (e) => {
            ;(a?.(e), s?.(e), e.defaultPrevented || c?.())
          },
          {
            ownerDocument: p,
            deferPointerDownOutside: r,
            isDeferredPointerDownOutsideRef: C,
            dismissableSurfaces: u.dismissableSurfaces,
            shouldHandlePointerDownOutside: _.useCallback(
              (e) => {
                if (!(e instanceof Node)) return !1
                let t = [...u.branches].some((t) => t.contains(e))
                return S && !t
              },
              [u.branches, S],
            ),
          },
        ),
        T = Vr((e) => {
          if (r && C.current) return
          let t = e.target
          ;[...u.branches].some((e) => e.contains(t)) ||
            (o?.(e), s?.(e), e.defaultPrevented || c?.())
        }, p),
        E = d ? b === g.length - 1 : !1,
        ee = kr((e) => {
          e.key === `Escape` && (i?.(e), !e.defaultPrevented && c && (e.preventDefault(), c()))
        })
      return (
        _.useEffect(() => {
          if (E)
            return (
              p.addEventListener(`keydown`, ee, { capture: !0 }),
              () => p.removeEventListener(`keydown`, ee, { capture: !0 })
            )
        }, [p, E, ee]),
        _.useEffect(() => {
          if (d)
            return (
              n &&
                (u.layersWithOutsidePointerEventsDisabled.size === 0 &&
                  ((Fr = p.body.style.pointerEvents), (p.body.style.pointerEvents = `none`)),
                u.layersWithOutsidePointerEventsDisabled.add(d)),
              u.layers.add(d),
              Hr(),
              () => {
                n &&
                  (u.layersWithOutsidePointerEventsDisabled.delete(d),
                  u.layersWithOutsidePointerEventsDisabled.size === 0 &&
                    (p.body.style.pointerEvents = Fr))
              }
            )
        }, [d, p, n, u]),
        _.useEffect(
          () => () => {
            d && (u.layers.delete(d), u.layersWithOutsidePointerEventsDisabled.delete(d), Hr())
          },
          [d, u],
        ),
        _.useEffect(() => {
          let e = jr(() => m({}), `handleUpdate`)
          return (document.addEventListener(Mr, e), () => document.removeEventListener(Mr, e))
        }, []),
        (0, L.jsx)(Rn.div, {
          ...l,
          ref: h,
          style: { pointerEvents: x ? (S ? `auto` : `none`) : void 0, ...e.style },
          onFocusCapture: Jn(e.onFocusCapture, T.onFocusCapture),
          onBlurCapture: Jn(e.onBlurCapture, T.onBlurCapture),
          onPointerDownCapture: Jn(e.onPointerDownCapture, w.onPointerDownCapture),
        })
      )
    }, `DismissableLayer`),
  )
function Rr() {
  let e = _.useContext(Ir),
    [t, n] = _.useState(null)
  return (
    _.useEffect(() => {
      if (t)
        return (
          e.dismissableSurfaces.add(t),
          () => {
            e.dismissableSurfaces.delete(t)
          }
        )
    }, [t, e.dismissableSurfaces]),
    n
  )
}
jr(Rr, `useDismissableLayerSurface`)
var zr = jr(() => !0, `IS_TRUE`)
function Br(e, t) {
  let {
      ownerDocument: n = globalThis?.document,
      deferPointerDownOutside: r = !1,
      isDeferredPointerDownOutsideRef: i,
      dismissableSurfaces: a,
      shouldHandlePointerDownOutside: o = zr,
    } = t,
    s = kr(e),
    c = _.useRef(!1),
    l = _.useRef(!1),
    u = _.useRef(new Map()),
    d = _.useRef(() => {})
  return (
    _.useEffect(() => {
      function e() {
        ;((l.current = !1), (i.current = !1), u.current.clear())
      }
      jr(e, `resetOutsideInteraction`)
      function t() {
        return Array.from(u.current.values()).some(Boolean)
      }
      jr(t, `isOutsideInteractionIntercepted`)
      function f(e) {
        if (!l.current) return
        let t = e.target
        ;((t instanceof Node && [...a].some((e) => e.contains(t))) || u.current.set(e.type, !0),
          e.type === `click` &&
            window.setTimeout(() => {
              l.current && d.current()
            }, 0))
      }
      jr(f, `handleInteractionCapture`)
      function p(e) {
        l.current && u.current.set(e.type, !1)
      }
      jr(p, `handleInteractionBubble`)
      let m = jr((a) => {
          if (a.target && !c.current) {
            let f = function () {
              n.removeEventListener(`click`, d.current)
              let r = t()
              ;(e(), r || Ur(Nr, s, p, { discrete: !0 }))
            }
            if ((jr(f, `handleAndDispatchPointerDownOutsideEvent`), !o(a.target))) {
              ;(n.removeEventListener(`click`, d.current), e(), (c.current = !1))
              return
            }
            let p = { originalEvent: a }
            ;((l.current = !0),
              (i.current = r && a.button === 0),
              u.current.clear(),
              !r || a.button !== 0
                ? f()
                : (n.removeEventListener(`click`, d.current),
                  (d.current = f),
                  n.addEventListener(`click`, d.current, { once: !0 })))
          } else (n.removeEventListener(`click`, d.current), e())
          c.current = !1
        }, `handlePointerDown`),
        h = [`pointerup`, `mousedown`, `mouseup`, `touchstart`, `touchend`, `click`]
      for (let e of h) (n.addEventListener(e, f, !0), n.addEventListener(e, p))
      let g = window.setTimeout(() => {
        n.addEventListener(`pointerdown`, m)
      }, 0)
      return () => {
        ;(window.clearTimeout(g),
          n.removeEventListener(`pointerdown`, m),
          n.removeEventListener(`click`, d.current))
        for (let e of h) (n.removeEventListener(e, f, !0), n.removeEventListener(e, p))
      }
    }, [n, s, r, i, a, o]),
    { onPointerDownCapture: jr(() => (c.current = !0), `onPointerDownCapture`) }
  )
}
jr(Br, `usePointerDownOutside`)
function Vr(e, t = globalThis?.document) {
  let n = kr(e),
    r = _.useRef(!1)
  return (
    _.useEffect(() => {
      let e = jr((e) => {
        e.target && !r.current && Ur(Pr, n, { originalEvent: e }, { discrete: !1 })
      }, `handleFocus`)
      return (t.addEventListener(`focusin`, e), () => t.removeEventListener(`focusin`, e))
    }, [t, n]),
    {
      onFocusCapture: jr(() => (r.current = !0), `onFocusCapture`),
      onBlurCapture: jr(() => (r.current = !1), `onBlurCapture`),
    }
  )
}
jr(Vr, `useFocusOutside`)
function Hr() {
  let e = new CustomEvent(Mr)
  document.dispatchEvent(e)
}
jr(Hr, `dispatchUpdate`)
function Ur(e, t, n, { discrete: r }) {
  let i = n.originalEvent.target,
    a = new CustomEvent(e, { bubbles: !1, cancelable: !0, detail: n })
  ;(t && i.addEventListener(e, t, { once: !0 }), r ? zn(i, a) : i.dispatchEvent(a))
}
jr(Ur, `handleAndDispatchCustomEvent`)
var Wr = Object.defineProperty,
  Gr = (e, t) => Wr(e, `name`, { value: t, configurable: !0 }),
  Kr = `focusScope.autoFocusOnMount`,
  qr = `focusScope.autoFocusOnUnmount`,
  Jr = { bubbles: !1, cancelable: !0 },
  Yr = _.forwardRef(
    Gr(function (e, t) {
      let { loop: n = !1, trapped: r = !1, onMountAutoFocus: i, onUnmountAutoFocus: a, ...o } = e,
        [s, c] = _.useState(null),
        l = kr(i),
        u = kr(a),
        d = _.useRef(null),
        f = vn(t, c),
        p = _.useRef({
          paused: !1,
          pause() {
            this.paused = !0
          },
          resume() {
            this.paused = !1
          },
        }).current
      ;(_.useEffect(() => {
        if (r) {
          let e = function (e) {
              if (p.paused || !s) return
              let t = e.target
              s.contains(t) ? (d.current = t) : ni(d.current, { select: !0 })
            },
            t = function (e) {
              if (p.paused || !s) return
              let t = e.relatedTarget
              t !== null && (s.contains(t) || ni(d.current, { select: !0 }))
            },
            n = function (e) {
              if (document.activeElement === document.body)
                for (let t of e) t.removedNodes.length > 0 && ni(s)
            }
          ;(Gr(e, `handleFocusIn`),
            Gr(t, `handleFocusOut`),
            Gr(n, `handleMutations`),
            document.addEventListener(`focusin`, e),
            document.addEventListener(`focusout`, t))
          let r = new MutationObserver(n)
          return (
            s && r.observe(s, { childList: !0, subtree: !0 }),
            () => {
              ;(document.removeEventListener(`focusin`, e),
                document.removeEventListener(`focusout`, t),
                r.disconnect())
            }
          )
        }
      }, [r, s, p.paused]),
        _.useEffect(() => {
          if (s) {
            ri.add(p)
            let e = document.activeElement
            if (!s.contains(e)) {
              let t = new CustomEvent(Kr, Jr)
              ;(s.addEventListener(Kr, l),
                s.dispatchEvent(t),
                t.defaultPrevented ||
                  (Xr(oi(Qr(s)), { select: !0 }), document.activeElement === e && ni(s)))
            }
            return () => {
              ;(s.removeEventListener(Kr, l),
                setTimeout(() => {
                  let t = new CustomEvent(qr, Jr)
                  ;(s.addEventListener(qr, u),
                    s.dispatchEvent(t),
                    t.defaultPrevented || ni(e ?? document.body, { select: !0 }),
                    s.removeEventListener(qr, u),
                    ri.remove(p))
                }, 0))
            }
          }
        }, [s, l, u, p]))
      let m = _.useCallback(
        (e) => {
          if ((!n && !r) || p.paused) return
          let t = e.key === `Tab` && !e.altKey && !e.ctrlKey && !e.metaKey,
            i = document.activeElement
          if (t && i) {
            let t = e.currentTarget,
              [r, a] = Zr(t)
            r && a
              ? !e.shiftKey && i === a
                ? (e.preventDefault(), n && ni(r, { select: !0 }))
                : e.shiftKey && i === r && (e.preventDefault(), n && ni(a, { select: !0 }))
              : i === t && e.preventDefault()
          }
        },
        [n, r, p.paused],
      )
      return (0, L.jsx)(Rn.div, { tabIndex: -1, ...o, ref: f, onKeyDown: m })
    }, `FocusScope`),
  )
function Xr(e, { select: t = !1 } = {}) {
  let n = document.activeElement
  for (let r of e) if ((ni(r, { select: t }), document.activeElement !== n)) return
}
Gr(Xr, `focusFirst`)
function Zr(e) {
  let t = Qr(e)
  return [$r(t, e), $r(t.reverse(), e)]
}
Gr(Zr, `getTabbableEdges`)
function Qr(e) {
  let t = [],
    n = document.createTreeWalker(e, NodeFilter.SHOW_ELEMENT, {
      acceptNode: Gr((e) => {
        let t = e.tagName === `INPUT` && e.type === `hidden`
        return e.disabled || e.hidden || t
          ? NodeFilter.FILTER_SKIP
          : e.tabIndex >= 0
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP
      }, `acceptNode`),
    })
  for (; n.nextNode();) t.push(n.currentNode)
  return t
}
Gr(Qr, `getTabbableCandidates`)
function $r(e, t) {
  let n = typeof t.checkVisibility == `function` && t.checkVisibility({ checkVisibilityCSS: !0 })
  for (let r of e)
    if (!(n ? !r.checkVisibility({ checkVisibilityCSS: !0 }) : ei(r, { upTo: t }))) return r
}
Gr($r, `findVisible`)
function ei(e, { upTo: t }) {
  if (getComputedStyle(e).visibility === `hidden`) return !0
  for (; e;) {
    if (t !== void 0 && e === t) return !1
    if (getComputedStyle(e).display === `none`) return !0
    e = e.parentElement
  }
  return !1
}
Gr(ei, `isHidden`)
function ti(e) {
  return e instanceof HTMLInputElement && `select` in e
}
Gr(ti, `isSelectableInput`)
function ni(e, { select: t = !1 } = {}) {
  if (e && e.focus) {
    let n = document.activeElement
    ;(e.focus({ preventScroll: !0 }), e !== n && ti(e) && t && e.select())
  }
}
Gr(ni, `focus`)
var ri = ii()
function ii() {
  let e = []
  return {
    add(t) {
      let n = e[0]
      ;(t !== n && n?.pause(), (e = ai(e, t)), e.unshift(t))
    },
    remove(t) {
      ;((e = ai(e, t)), e[0]?.resume())
    },
  }
}
Gr(ii, `createFocusScopesStack`)
function ai(e, t) {
  let n = [...e],
    r = n.indexOf(t)
  return (r !== -1 && n.splice(r, 1), n)
}
Gr(ai, `arrayRemove`)
function oi(e) {
  return e.filter((e) => e.tagName !== `A`)
}
Gr(oi, `removeLinks`)
var si = Object.defineProperty,
  ci = _.forwardRef(
    ((e, t) => si(e, `name`, { value: t, configurable: !0 }))(function (e, t) {
      let { container: n, ...r } = e,
        [i, a] = _.useState(!1)
      $n(() => a(!0), [])
      let o = n || (i && globalThis?.document?.body)
      return o ? v.createPortal((0, L.jsx)(Rn.div, { ...r, ref: t }), o) : null
    }, `Portal`),
  ),
  li = Object.defineProperty,
  ui = (e, t) => li(e, `name`, { value: t, configurable: !0 }),
  di = 0,
  fi = null
function pi(e) {
  return (mi(), e.children)
}
ui(pi, `FocusGuards`)
function mi() {
  _.useEffect(() => {
    fi ||= { start: hi(), end: hi() }
    let { start: e, end: t } = fi
    return (
      document.body.firstElementChild !== e && document.body.insertAdjacentElement(`afterbegin`, e),
      document.body.lastElementChild !== t && document.body.insertAdjacentElement(`beforeend`, t),
      di++,
      () => {
        ;(di === 1 && (fi?.start.remove(), fi?.end.remove(), (fi = null)),
          (di = Math.max(0, di - 1)))
      }
    )
  }, [])
}
ui(mi, `useFocusGuards`)
function hi() {
  let e = document.createElement(`span`)
  return (
    e.setAttribute(`data-radix-focus-guard`, ``),
    (e.tabIndex = 0),
    (e.style.outline = `none`),
    (e.style.opacity = `0`),
    (e.style.position = `fixed`),
    (e.style.pointerEvents = `none`),
    e
  )
}
ui(hi, `createFocusGuard`)
var gi = function () {
  return (
    (gi =
      Object.assign ||
      function (e) {
        for (var t, n = 1, r = arguments.length; n < r; n++)
          for (var i in ((t = arguments[n]), t))
            Object.prototype.hasOwnProperty.call(t, i) && (e[i] = t[i])
        return e
      }),
    gi.apply(this, arguments)
  )
}
function _i(e, t) {
  var n = {}
  for (var r in e) Object.prototype.hasOwnProperty.call(e, r) && t.indexOf(r) < 0 && (n[r] = e[r])
  if (e != null && typeof Object.getOwnPropertySymbols == `function`)
    for (var i = 0, r = Object.getOwnPropertySymbols(e); i < r.length; i++)
      t.indexOf(r[i]) < 0 &&
        Object.prototype.propertyIsEnumerable.call(e, r[i]) &&
        (n[r[i]] = e[r[i]])
  return n
}
function vi(e, t, n) {
  if (n || arguments.length === 2)
    for (var r = 0, i = t.length, a; r < i; r++)
      (a || !(r in t)) && ((a ||= Array.prototype.slice.call(t, 0, r)), (a[r] = t[r]))
  return e.concat(a || Array.prototype.slice.call(t))
}
var yi = `right-scroll-bar-position`,
  bi = `width-before-scroll-bar`,
  xi = `with-scroll-bars-hidden`,
  Si = `--removed-body-scroll-bar-size`
function Ci(e, t) {
  return (typeof e == `function` ? e(t) : e && (e.current = t), e)
}
function wi(e, t) {
  var n = (0, _.useState)(function () {
    return {
      value: e,
      callback: t,
      facade: {
        get current() {
          return n.value
        },
        set current(e) {
          var t = n.value
          t !== e && ((n.value = e), n.callback(e, t))
        },
      },
    }
  })[0]
  return ((n.callback = t), n.facade)
}
var Ti = typeof window < `u` ? _.useLayoutEffect : _.useEffect,
  Ei = new WeakMap()
function Di(e, t) {
  var n = wi(t || null, function (t) {
    return e.forEach(function (e) {
      return Ci(e, t)
    })
  })
  return (
    Ti(
      function () {
        var t = Ei.get(n)
        if (t) {
          var r = new Set(t),
            i = new Set(e),
            a = n.current
          ;(r.forEach(function (e) {
            i.has(e) || Ci(e, null)
          }),
            i.forEach(function (e) {
              r.has(e) || Ci(e, a)
            }))
        }
        Ei.set(n, e)
      },
      [e],
    ),
    n
  )
}
function Oi(e) {
  return e
}
function ki(e, t) {
  t === void 0 && (t = Oi)
  var n = [],
    r = !1
  return {
    read: function () {
      if (r)
        throw Error(
          "Sidecar: could not `read` from an `assigned` medium. `read` could be used only with `useMedium`.",
        )
      return n.length ? n[n.length - 1] : e
    },
    useMedium: function (e) {
      var i = t(e, r)
      return (
        n.push(i),
        function () {
          n = n.filter(function (e) {
            return e !== i
          })
        }
      )
    },
    assignSyncMedium: function (e) {
      for (r = !0; n.length;) {
        var t = n
        ;((n = []), t.forEach(e))
      }
      n = {
        push: function (t) {
          return e(t)
        },
        filter: function () {
          return n
        },
      }
    },
    assignMedium: function (e) {
      r = !0
      var t = []
      if (n.length) {
        var i = n
        ;((n = []), i.forEach(e), (t = n))
      }
      var a = function () {
          var n = t
          ;((t = []), n.forEach(e))
        },
        o = function () {
          return Promise.resolve().then(a)
        }
      ;(o(),
        (n = {
          push: function (e) {
            ;(t.push(e), o())
          },
          filter: function (e) {
            return ((t = t.filter(e)), n)
          },
        }))
    },
  }
}
function Ai(e) {
  e === void 0 && (e = {})
  var t = ki(null)
  return ((t.options = gi({ async: !0, ssr: !1 }, e)), t)
}
var ji = function (e) {
  var t = e.sideCar,
    n = _i(e, [`sideCar`])
  if (!t) throw Error("Sidecar: please provide `sideCar` property to import the right car")
  var r = t.read()
  if (!r) throw Error(`Sidecar medium not found`)
  return _.createElement(r, gi({}, n))
}
ji.isSideCarExport = !0
function Mi(e, t) {
  return (e.useMedium(t), ji)
}
var Ni = Ai(),
  Pi = function () {},
  R = _.forwardRef(function (e, t) {
    var n = _.useRef(null),
      r = _.useState({ onScrollCapture: Pi, onWheelCapture: Pi, onTouchMoveCapture: Pi }),
      i = r[0],
      a = r[1],
      o = e.forwardProps,
      s = e.children,
      c = e.className,
      l = e.removeScrollBar,
      u = e.enabled,
      d = e.shards,
      f = e.sideCar,
      p = e.noRelative,
      m = e.noIsolation,
      h = e.inert,
      g = e.allowPinchZoom,
      v = e.as,
      y = v === void 0 ? `div` : v,
      b = e.gapMode,
      x = _i(e, [
        `forwardProps`,
        `children`,
        `className`,
        `removeScrollBar`,
        `enabled`,
        `shards`,
        `sideCar`,
        `noRelative`,
        `noIsolation`,
        `inert`,
        `allowPinchZoom`,
        `as`,
        `gapMode`,
      ]),
      S = f,
      C = Di([n, t]),
      w = gi(gi({}, x), i)
    return _.createElement(
      _.Fragment,
      null,
      u &&
        _.createElement(S, {
          sideCar: Ni,
          removeScrollBar: l,
          shards: d,
          noRelative: p,
          noIsolation: m,
          inert: h,
          setCallbacks: a,
          allowPinchZoom: !!g,
          lockRef: n,
          gapMode: b,
        }),
      o
        ? _.cloneElement(_.Children.only(s), gi(gi({}, w), { ref: C }))
        : _.createElement(y, gi({}, w, { className: c, ref: C }), s),
    )
  })
;((R.defaultProps = { enabled: !0, removeScrollBar: !0, inert: !1 }),
  (R.classNames = { fullWidth: bi, zeroRight: yi }))
var z = function () {
  if (typeof __webpack_nonce__ < `u`) return __webpack_nonce__
}
function Fi() {
  if (!document) return null
  var e = document.createElement(`style`)
  e.type = `text/css`
  var t = z()
  return (t && e.setAttribute(`nonce`, t), e)
}
function Ii(e, t) {
  e.styleSheet ? (e.styleSheet.cssText = t) : e.appendChild(document.createTextNode(t))
}
function Li(e) {
  ;(document.head || document.getElementsByTagName(`head`)[0]).appendChild(e)
}
var Ri = function () {
    var e = 0,
      t = null
    return {
      add: function (n) {
        ;(e == 0 && (t = Fi()) && (Ii(t, n), Li(t)), e++)
      },
      remove: function () {
        ;(e--, !e && t && (t.parentNode && t.parentNode.removeChild(t), (t = null)))
      },
    }
  },
  zi = function () {
    var e = Ri()
    return function (t, n) {
      _.useEffect(
        function () {
          return (
            e.add(t),
            function () {
              e.remove()
            }
          )
        },
        [t && n],
      )
    }
  },
  Bi = function () {
    var e = zi()
    return function (t) {
      var n = t.styles,
        r = t.dynamic
      return (e(n, r), null)
    }
  },
  Vi = { left: 0, top: 0, right: 0, gap: 0 },
  Hi = function (e) {
    return parseInt(e || ``, 10) || 0
  },
  Ui = function (e) {
    var t = window.getComputedStyle(document.body),
      n = t[e === `padding` ? `paddingLeft` : `marginLeft`],
      r = t[e === `padding` ? `paddingTop` : `marginTop`],
      i = t[e === `padding` ? `paddingRight` : `marginRight`]
    return [Hi(n), Hi(r), Hi(i)]
  },
  Wi = function (e) {
    if ((e === void 0 && (e = `margin`), typeof window > `u`)) return Vi
    var t = Ui(e),
      n = document.documentElement.clientWidth,
      r = window.innerWidth
    return { left: t[0], top: t[1], right: t[2], gap: Math.max(0, r - n + t[2] - t[0]) }
  },
  Gi = Bi(),
  Ki = `data-scroll-locked`,
  qi = function (e, t, n, r) {
    var i = e.left,
      a = e.top,
      o = e.right,
      s = e.gap
    return (
      n === void 0 && (n = `margin`),
      `
  .${xi} {
   overflow: hidden ${r};
   padding-right: ${s}px ${r};
  }
  body[${Ki}] {
    overflow: hidden ${r};
    overscroll-behavior: contain;
    ${[
      t && `position: relative ${r};`,
      n === `margin` &&
        `
    padding-left: ${i}px;
    padding-top: ${a}px;
    padding-right: ${o}px;
    margin-left:0;
    margin-top:0;
    margin-right: ${s}px ${r};
    `,
      n === `padding` && `padding-right: ${s}px ${r};`,
    ]
      .filter(Boolean)
      .join(``)}
  }

  .${yi} {
    right: ${s}px ${r};
  }

  .${bi} {
    margin-right: ${s}px ${r};
  }

  .${yi} .${yi} {
    right: 0 ${r};
  }

  .${bi} .${bi} {
    margin-right: 0 ${r};
  }

  body[${Ki}] {
    ${Si}: ${s}px;
  }
`
    )
  },
  Ji = function () {
    var e = parseInt(document.body.getAttribute(`data-scroll-locked`) || `0`, 10)
    return isFinite(e) ? e : 0
  },
  Yi = function () {
    _.useEffect(function () {
      return (
        document.body.setAttribute(Ki, (Ji() + 1).toString()),
        function () {
          var e = Ji() - 1
          e <= 0 ? document.body.removeAttribute(Ki) : document.body.setAttribute(Ki, e.toString())
        }
      )
    }, [])
  },
  Xi = function (e) {
    var t = e.noRelative,
      n = e.noImportant,
      r = e.gapMode,
      i = r === void 0 ? `margin` : r
    Yi()
    var a = _.useMemo(
      function () {
        return Wi(i)
      },
      [i],
    )
    return _.createElement(Gi, { styles: qi(a, !t, i, n ? `` : `!important`) })
  },
  Zi = !1
if (typeof window < `u`)
  try {
    var Qi = Object.defineProperty({}, "passive", {
      get: function () {
        return ((Zi = !0), !0)
      },
    })
    ;(window.addEventListener(`test`, Qi, Qi), window.removeEventListener(`test`, Qi, Qi))
  } catch {
    Zi = !1
  }
var $i = Zi ? { passive: !1 } : !1,
  ea = function (e) {
    return e.tagName === `TEXTAREA`
  },
  ta = function (e, t) {
    if (!(e instanceof Element)) return !1
    var n = window.getComputedStyle(e)
    return n[t] !== `hidden` && !(n.overflowY === n.overflowX && !ea(e) && n[t] === `visible`)
  },
  na = function (e) {
    return ta(e, `overflowY`)
  },
  ra = function (e) {
    return ta(e, `overflowX`)
  },
  ia = function (e, t) {
    var n = t.ownerDocument,
      r = t
    do {
      if ((typeof ShadowRoot < `u` && r instanceof ShadowRoot && (r = r.host), sa(e, r))) {
        var i = ca(e, r)
        if (i[1] > i[2]) return !0
      }
      r = r.parentNode
    } while (r && r !== n.body)
    return !1
  },
  aa = function (e) {
    return [e.scrollTop, e.scrollHeight, e.clientHeight]
  },
  oa = function (e) {
    return [e.scrollLeft, e.scrollWidth, e.clientWidth]
  },
  sa = function (e, t) {
    return e === `v` ? na(t) : ra(t)
  },
  ca = function (e, t) {
    return e === `v` ? aa(t) : oa(t)
  },
  la = function (e, t) {
    return e === `h` && t === `rtl` ? -1 : 1
  },
  ua = function (e, t, n, r, i) {
    var a = la(e, window.getComputedStyle(t).direction),
      o = a * r,
      s = n.target,
      c = t.contains(s),
      l = !1,
      u = o > 0,
      d = 0,
      f = 0
    do {
      if (!s) break
      var p = ca(e, s),
        m = p[0],
        h = p[1] - p[2] - a * m
      ;(m || h) && sa(e, s) && ((d += h), (f += m))
      var g = s.parentNode
      s = g && g.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? g.host : g
    } while ((!c && s !== document.body) || (c && (t.contains(s) || t === s)))
    return (
      ((u && ((i && Math.abs(d) < 1) || (!i && o > d))) ||
        (!u && ((i && Math.abs(f) < 1) || (!i && -o > f)))) &&
        (l = !0),
      l
    )
  },
  da = function (e) {
    return `changedTouches` in e
      ? [e.changedTouches[0].clientX, e.changedTouches[0].clientY]
      : [0, 0]
  },
  fa = function (e) {
    return [e.deltaX, e.deltaY]
  },
  pa = function (e) {
    return e && `current` in e ? e.current : e
  },
  ma = function (e, t) {
    return e[0] === t[0] && e[1] === t[1]
  },
  ha = function (e) {
    return `
  .block-interactivity-${e} {pointer-events: none;}
  .allow-interactivity-${e} {pointer-events: all;}
`
  },
  ga = 0,
  _a = []
function va(e) {
  var t = _.useRef([]),
    n = _.useRef([0, 0]),
    r = _.useRef(),
    i = _.useState(ga++)[0],
    a = _.useState(Bi)[0],
    o = _.useRef(e)
  ;(_.useEffect(
    function () {
      o.current = e
    },
    [e],
  ),
    _.useEffect(
      function () {
        if (e.inert) {
          document.body.classList.add(`block-interactivity-${i}`)
          var t = vi([e.lockRef.current], (e.shards || []).map(pa), !0).filter(Boolean)
          return (
            t.forEach(function (e) {
              return e.classList.add(`allow-interactivity-${i}`)
            }),
            function () {
              ;(document.body.classList.remove(`block-interactivity-${i}`),
                t.forEach(function (e) {
                  return e.classList.remove(`allow-interactivity-${i}`)
                }))
            }
          )
        }
      },
      [e.inert, e.lockRef.current, e.shards],
    ))
  var s = _.useCallback(function (e, t) {
      if ((`touches` in e && e.touches.length === 2) || (e.type === `wheel` && e.ctrlKey))
        return !o.current.allowPinchZoom
      var i = da(e),
        a = n.current,
        s = `deltaX` in e ? e.deltaX : a[0] - i[0],
        c = `deltaY` in e ? e.deltaY : a[1] - i[1],
        l,
        u = e.target,
        d = Math.abs(s) > Math.abs(c) ? `h` : `v`
      if (`touches` in e && d === `h` && u.type === `range`) return !1
      var f = window.getSelection(),
        p = f && f.anchorNode
      if (p && (p === u || p.contains(u))) return !1
      var m = ia(d, u)
      if (!m) return !0
      if ((m ? (l = d) : ((l = d === `v` ? `h` : `v`), (m = ia(d, u))), !m)) return !1
      if ((!r.current && `changedTouches` in e && (s || c) && (r.current = l), !l)) return !0
      var h = r.current || l
      return ua(h, t, e, h === `h` ? s : c, !0)
    }, []),
    c = _.useCallback(function (e) {
      var n = e
      if (_a.length && _a[_a.length - 1] === a) {
        var r = `deltaY` in n ? fa(n) : da(n),
          i = t.current.filter(function (e) {
            return (
              e.name === n.type &&
              (e.target === n.target || n.target === e.shadowParent) &&
              ma(e.delta, r)
            )
          })[0]
        if (i && i.should) {
          n.cancelable && n.preventDefault()
          return
        }
        if (!i) {
          var c = (o.current.shards || [])
            .map(pa)
            .filter(Boolean)
            .filter(function (e) {
              return e.contains(n.target)
            })
          ;(c.length > 0 ? s(n, c[0]) : !o.current.noIsolation) &&
            n.cancelable &&
            n.preventDefault()
        }
      }
    }, []),
    l = _.useCallback(function (e, n, r, i) {
      var a = { name: e, delta: n, target: r, should: i, shadowParent: ya(r) }
      ;(t.current.push(a),
        setTimeout(function () {
          t.current = t.current.filter(function (e) {
            return e !== a
          })
        }, 1))
    }, []),
    u = _.useCallback(function (e) {
      ;((n.current = da(e)), (r.current = void 0))
    }, []),
    d = _.useCallback(function (t) {
      l(t.type, fa(t), t.target, s(t, e.lockRef.current))
    }, []),
    f = _.useCallback(function (t) {
      l(t.type, da(t), t.target, s(t, e.lockRef.current))
    }, [])
  _.useEffect(function () {
    return (
      _a.push(a),
      e.setCallbacks({ onScrollCapture: d, onWheelCapture: d, onTouchMoveCapture: f }),
      document.addEventListener(`wheel`, c, $i),
      document.addEventListener(`touchmove`, c, $i),
      document.addEventListener(`touchstart`, u, $i),
      function () {
        ;((_a = _a.filter(function (e) {
          return e !== a
        })),
          document.removeEventListener(`wheel`, c, $i),
          document.removeEventListener(`touchmove`, c, $i),
          document.removeEventListener(`touchstart`, u, $i))
      }
    )
  }, [])
  var p = e.removeScrollBar,
    m = e.inert
  return _.createElement(
    _.Fragment,
    null,
    m ? _.createElement(a, { styles: ha(i) }) : null,
    p ? _.createElement(Xi, { noRelative: e.noRelative, gapMode: e.gapMode }) : null,
  )
}
function ya(e) {
  for (var t = null; e !== null;)
    (e instanceof ShadowRoot && ((t = e.host), (e = e.host)), (e = e.parentNode))
  return t
}
var ba = Mi(Ni, va),
  xa = _.forwardRef(function (e, t) {
    return _.createElement(R, gi({}, e, { ref: t, sideCar: ba }))
  })
xa.classNames = R.classNames
var Sa = function (e) {
    return typeof document > `u` ? null : (Array.isArray(e) ? e[0] : e).ownerDocument.body
  },
  Ca = new WeakMap(),
  wa = new WeakMap(),
  Ta = {},
  Ea = 0,
  Da = function (e) {
    return e && (e.host || Da(e.parentNode))
  },
  Oa = function (e, t) {
    return t
      .map(function (t) {
        if (e.contains(t)) return t
        var n = Da(t)
        return n && e.contains(n)
          ? n
          : (console.error(`aria-hidden`, t, `in not contained inside`, e, `. Doing nothing`), null)
      })
      .filter(function (e) {
        return !!e
      })
  },
  ka = function (e, t, n, r) {
    var i = Oa(t, Array.isArray(e) ? e : [e])
    Ta[n] || (Ta[n] = new WeakMap())
    var a = Ta[n],
      o = [],
      s = new Set(),
      c = new Set(i),
      l = function (e) {
        e && !s.has(e) && (s.add(e), l(e.parentNode))
      }
    i.forEach(l)
    var u = function (e) {
      e &&
        !c.has(e) &&
        Array.prototype.forEach.call(e.children, function (e) {
          if (s.has(e)) u(e)
          else
            try {
              var t = e.getAttribute(r),
                i = t !== null && t !== `false`,
                c = (Ca.get(e) || 0) + 1,
                l = (a.get(e) || 0) + 1
              ;(Ca.set(e, c),
                a.set(e, l),
                o.push(e),
                c === 1 && i && wa.set(e, !0),
                l === 1 && e.setAttribute(n, `true`),
                i || e.setAttribute(r, `true`))
            } catch (t) {
              console.error(`aria-hidden: cannot operate on `, e, t)
            }
        })
    }
    return (
      u(t),
      s.clear(),
      Ea++,
      function () {
        ;(o.forEach(function (e) {
          var t = Ca.get(e) - 1,
            i = a.get(e) - 1
          ;(Ca.set(e, t),
            a.set(e, i),
            t || (wa.has(e) || e.removeAttribute(r), wa.delete(e)),
            i || e.removeAttribute(n))
        }),
          Ea--,
          Ea || ((Ca = new WeakMap()), (Ca = new WeakMap()), (wa = new WeakMap()), (Ta = {})))
      }
    )
  },
  Aa = function (e, t, n) {
    n === void 0 && (n = `data-aria-hidden`)
    var r = Array.from(Array.isArray(e) ? e : [e]),
      i = t || Sa(e)
    return i
      ? (r.push.apply(r, Array.from(i.querySelectorAll(`[aria-live], script`))),
        ka(r, i, n, `aria-hidden`))
      : function () {
          return null
        }
  },
  ja = Object.defineProperty,
  Ma = (e, t) => ja(e, `name`, { value: t, configurable: !0 }),
  Na = `Dialog`,
  [Pa, Fa] = Un(Na),
  [Ia, La] = Pa(Na),
  Ra = Ma((e) => {
    let {
        __scopeDialog: t,
        children: n,
        open: r,
        defaultOpen: i,
        onOpenChange: a,
        modal: o = !0,
      } = e,
      s = _.useRef(null),
      c = _.useRef(null),
      [l, u] = cr({ prop: r, defaultProp: i ?? !1, onChange: a, caller: Na }),
      [d, f] = _.useState(0),
      [p, m] = _.useState(0)
    return (0, L.jsx)(Ia, {
      scope: t,
      triggerRef: s,
      contentRef: c,
      contentId: Er(),
      titleId: Er(),
      descriptionId: Er(),
      titlePresent: d > 0,
      descriptionPresent: p > 0,
      setTitleCount: f,
      setDescriptionCount: m,
      open: l,
      onOpenChange: u,
      onOpenToggle: _.useCallback(() => u((e) => !e), [u]),
      modal: o,
      children: n,
    })
  }, `Dialog`),
  za = `DialogPortal`,
  [Ba, Va] = Pa(za, { forceMount: void 0 }),
  Ha = Ma((e) => {
    let { __scopeDialog: t, forceMount: n, children: r, container: i } = e,
      a = La(za, t)
    return (0, L.jsx)(Ba, {
      scope: t,
      forceMount: n,
      children: _.Children.map(r, (e) =>
        (0, L.jsx)(gr, {
          present: n || a.open,
          children: (0, L.jsx)(ci, { asChild: !0, container: i, children: e }),
        }),
      ),
    })
  }, `DialogPortal`),
  Ua = `DialogOverlay`,
  Wa = _.forwardRef(
    Ma(function (e, t) {
      let n = Va(Ua, e.__scopeDialog),
        { forceMount: r = n.forceMount, ...i } = e,
        a = La(Ua, e.__scopeDialog)
      return a.modal
        ? (0, L.jsx)(gr, { present: r || a.open, children: (0, L.jsx)(Ka, { ...i, ref: t }) })
        : null
    }, `DialogOverlay`),
  ),
  Ga = xn(`DialogOverlay.RemoveScroll`),
  Ka = _.forwardRef(
    Ma(function (e, t) {
      let { __scopeDialog: n, ...r } = e,
        i = La(Ua, n),
        a = vn(t, Rr())
      return (0, L.jsx)(xa, {
        as: Ga,
        allowPinchZoom: !0,
        shards: [i.contentRef],
        children: (0, L.jsx)(Rn.div, {
          "data-state": io(i.open),
          ...r,
          ref: a,
          style: { pointerEvents: `auto`, ...r.style },
        }),
      })
    }, `DialogOverlayImpl`),
  ),
  qa = `DialogContent`,
  Ja = _.forwardRef(
    Ma(function (e, t) {
      let n = Va(qa, e.__scopeDialog),
        { forceMount: r = n.forceMount, ...i } = e,
        a = La(qa, e.__scopeDialog)
      return (0, L.jsx)(gr, {
        present: r || a.open,
        children: a.modal ? (0, L.jsx)(Ya, { ...i, ref: t }) : (0, L.jsx)(Xa, { ...i, ref: t }),
      })
    }, `DialogContent`),
  ),
  Ya = _.forwardRef(
    Ma(function (e, t) {
      let n = La(qa, e.__scopeDialog),
        r = _.useRef(null),
        i = vn(t, n.contentRef, r)
      return (
        _.useEffect(() => {
          let e = r.current
          if (e) return Aa(e)
        }, []),
        (0, L.jsx)(Za, {
          ...e,
          ref: i,
          trapFocus: n.open,
          disableOutsidePointerEvents: n.open,
          onCloseAutoFocus: Jn(e.onCloseAutoFocus, (e) => {
            ;(e.preventDefault(), n.triggerRef.current?.focus())
          }),
          onPointerDownOutside: Jn(e.onPointerDownOutside, (e) => {
            let t = e.detail.originalEvent,
              n = t.button === 0 && t.ctrlKey === !0
            ;(t.button === 2 || n) && e.preventDefault()
          }),
          onFocusOutside: Jn(e.onFocusOutside, (e) => e.preventDefault()),
        })
      )
    }, `DialogContentModal`),
  ),
  Xa = _.forwardRef(
    Ma(function (e, t) {
      let n = La(qa, e.__scopeDialog),
        r = _.useRef(!1),
        i = _.useRef(!1)
      return (0, L.jsx)(Za, {
        ...e,
        ref: t,
        trapFocus: !1,
        disableOutsidePointerEvents: !1,
        onCloseAutoFocus: (t) => {
          ;(e.onCloseAutoFocus?.(t),
            t.defaultPrevented || (r.current || n.triggerRef.current?.focus(), t.preventDefault()),
            (r.current = !1),
            (i.current = !1))
        },
        onInteractOutside: (t) => {
          ;(e.onInteractOutside?.(t),
            t.defaultPrevented ||
              ((r.current = !0), t.detail.originalEvent.type === `pointerdown` && (i.current = !0)))
          let a = t.target
          ;(n.triggerRef.current?.contains(a) && t.preventDefault(),
            t.detail.originalEvent.type === `focusin` && i.current && t.preventDefault())
        },
      })
    }, `DialogContentNonModal`),
  ),
  Za = _.forwardRef(
    Ma(function (e, t) {
      let { __scopeDialog: n, trapFocus: r, onOpenAutoFocus: i, onCloseAutoFocus: a, ...o } = e,
        s = La(qa, n)
      return (
        mi(),
        (0, L.jsx)(L.Fragment, {
          children: (0, L.jsx)(Yr, {
            asChild: !0,
            loop: !0,
            trapped: r,
            onMountAutoFocus: i,
            onUnmountAutoFocus: a,
            children: (0, L.jsx)(Lr, {
              role: `dialog`,
              id: s.contentId,
              "aria-describedby": s.descriptionPresent ? s.descriptionId : void 0,
              "aria-labelledby": s.titlePresent ? s.titleId : void 0,
              "data-state": io(s.open),
              ...o,
              ref: t,
              deferPointerDownOutside: !0,
              onDismiss: () => s.onOpenChange(!1),
            }),
          }),
        })
      )
    }, `DialogContentImpl`),
  ),
  Qa = `DialogTitle`,
  $a = _.forwardRef(
    Ma(function (e, t) {
      let { __scopeDialog: n, ...r } = e,
        i = La(Qa, n),
        { setTitleCount: a } = i
      return (
        $n(() => (a((e) => e + 1), () => a((e) => e - 1)), [a]),
        (0, L.jsx)(Rn.h2, { id: i.titleId, ...r, ref: t })
      )
    }, `DialogTitle`),
  ),
  eo = `DialogDescription`,
  to = _.forwardRef(
    Ma(function (e, t) {
      let { __scopeDialog: n, ...r } = e,
        i = La(eo, n),
        { setDescriptionCount: a } = i
      return (
        $n(() => (a((e) => e + 1), () => a((e) => e - 1)), [a]),
        (0, L.jsx)(Rn.p, { id: i.descriptionId, ...r, ref: t })
      )
    }, `DialogDescription`),
  ),
  no = `DialogClose`,
  ro = _.forwardRef(
    Ma(function (e, t) {
      let { __scopeDialog: n, ...r } = e,
        i = La(no, n)
      return (0, L.jsx)(Rn.button, {
        type: `button`,
        ...r,
        ref: t,
        onClick: Jn(e.onClick, () => i.onOpenChange(!1)),
      })
    }, `DialogClose`),
  )
function io(e) {
  return e ? `open` : `closed`
}
Ma(io, `getState`)
var ao = (e, t) => {
    let n = Array(e.length + t.length)
    for (let t = 0; t < e.length; t++) n[t] = e[t]
    for (let r = 0; r < t.length; r++) n[e.length + r] = t[r]
    return n
  },
  oo = (e, t) => ({ classGroupId: e, validator: t }),
  so = (e = new Map(), t = null, n) => ({ nextPart: e, validators: t, classGroupId: n }),
  co = `-`,
  lo = [],
  uo = `arbitrary..`,
  fo = (e) => {
    let t = V(e),
      { conflictingClassGroups: n, conflictingClassGroupModifiers: r } = e
    return {
      getClassGroupId: (e) => {
        if (e.startsWith(`[`) && e.endsWith(`]`)) return B(e)
        let n = e.split(co)
        return po(n, +(n[0] === `` && n.length > 1), t)
      },
      getConflictingClassGroupIds: (e, t) => {
        if (t) {
          let t = r[e],
            i = n[e]
          return t ? (i ? ao(i, t) : t) : i || lo
        }
        return n[e] || lo
      },
    }
  },
  po = (e, t, n) => {
    if (e.length - t === 0) return n.classGroupId
    let r = e[t],
      i = n.nextPart.get(r)
    if (i) {
      let n = po(e, t + 1, i)
      if (n) return n
    }
    let a = n.validators
    if (a === null) return
    let o = t === 0 ? e.join(co) : e.slice(t).join(co),
      s = a.length
    for (let e = 0; e < s; e++) {
      let t = a[e]
      if (t.validator(o)) return t.classGroupId
    }
  },
  B = (e) =>
    e.slice(1, -1).indexOf(`:`) === -1
      ? void 0
      : (() => {
          let t = e.slice(1, -1),
            n = t.indexOf(`:`),
            r = t.slice(0, n)
          return r ? uo + r : void 0
        })(),
  V = (e) => {
    let { theme: t, classGroups: n } = e
    return mo(n, t)
  },
  mo = (e, t) => {
    let n = so()
    for (let r in e) {
      let i = e[r]
      ho(i, n, r, t)
    }
    return n
  },
  ho = (e, t, n, r) => {
    let i = e.length
    for (let a = 0; a < i; a++) {
      let i = e[a]
      go(i, t, n, r)
    }
  },
  go = (e, t, n, r) => {
    if (typeof e == `string`) {
      _o(e, t, n)
      return
    }
    if (typeof e == `function`) {
      vo(e, t, n, r)
      return
    }
    yo(e, t, n, r)
  },
  _o = (e, t, n) => {
    let r = e === `` ? t : bo(t, e)
    r.classGroupId = n
  },
  vo = (e, t, n, r) => {
    if (xo(e)) {
      ho(e(r), t, n, r)
      return
    }
    ;(t.validators === null && (t.validators = []), t.validators.push(oo(n, e)))
  },
  yo = (e, t, n, r) => {
    let i = Object.entries(e),
      a = i.length
    for (let e = 0; e < a; e++) {
      let [a, o] = i[e]
      ho(o, bo(t, a), n, r)
    }
  },
  bo = (e, t) => {
    let n = e,
      r = t.split(co),
      i = r.length
    for (let e = 0; e < i; e++) {
      let t = r[e],
        i = n.nextPart.get(t)
      ;(i || ((i = so()), n.nextPart.set(t, i)), (n = i))
    }
    return n
  },
  xo = (e) => `isThemeGetter` in e && e.isThemeGetter === !0,
  So = (e) => {
    if (e < 1) return { get: () => void 0, set: () => {} }
    let t = 0,
      n = Object.create(null),
      r = Object.create(null),
      i = (i, a) => {
        ;((n[i] = a), t++, t > e && ((t = 0), (r = n), (n = Object.create(null))))
      }
    return {
      get(e) {
        let t = n[e]
        if (t !== void 0) return t
        if ((t = r[e]) !== void 0) return (i(e, t), t)
      },
      set(e, t) {
        e in n ? (n[e] = t) : i(e, t)
      },
    }
  },
  Co = `!`,
  wo = `:`,
  To = [],
  Eo = (e, t, n, r, i) => ({
    modifiers: e,
    hasImportantModifier: t,
    baseClassName: n,
    maybePostfixModifierPosition: r,
    isExternal: i,
  }),
  Do = (e) => {
    let { prefix: t, experimentalParseClassName: n } = e,
      r = (e) => {
        let t = [],
          n = 0,
          r = 0,
          i = 0,
          a,
          o = e.length
        for (let s = 0; s < o; s++) {
          let o = e[s]
          if (n === 0 && r === 0) {
            if (o === wo) {
              ;(t.push(e.slice(i, s)), (i = s + 1))
              continue
            }
            if (o === `/`) {
              a = s
              continue
            }
          }
          o === `[` ? n++ : o === `]` ? n-- : o === `(` ? r++ : o === `)` && r--
        }
        let s = t.length === 0 ? e : e.slice(i),
          c = s,
          l = !1
        s.endsWith(Co)
          ? ((c = s.slice(0, -1)), (l = !0))
          : s.startsWith(Co) && ((c = s.slice(1)), (l = !0))
        let u = a && a > i ? a - i : void 0
        return Eo(t, l, c, u)
      }
    if (t) {
      let e = t + wo,
        n = r
      r = (t) => (t.startsWith(e) ? n(t.slice(e.length)) : Eo(To, !1, t, void 0, !0))
    }
    if (n) {
      let e = r
      r = (t) => n({ className: t, parseClassName: e })
    }
    return r
  },
  Oo = (e) => {
    let t = new Map()
    return (
      e.orderSensitiveModifiers.forEach((e, n) => {
        t.set(e, 1e6 + n)
      }),
      (e) => {
        let n = [],
          r = []
        for (let i = 0; i < e.length; i++) {
          let a = e[i],
            o = a[0] === `[`,
            s = t.has(a)
          o || s ? (r.length > 0 && (r.sort(), n.push(...r), (r = [])), n.push(a)) : r.push(a)
        }
        return (r.length > 0 && (r.sort(), n.push(...r)), n)
      }
    )
  },
  ko = (e) => ({
    cache: So(e.cacheSize),
    parseClassName: Do(e),
    sortModifiers: Oo(e),
    postfixLookupClassGroupIds: Ao(e),
    ...fo(e),
  }),
  Ao = (e) => {
    let t = Object.create(null),
      n = e.postfixLookupClassGroups
    if (n) for (let e = 0; e < n.length; e++) t[n[e]] = !0
    return t
  },
  jo = /\s+/,
  Mo = (e, t) => {
    let {
        parseClassName: n,
        getClassGroupId: r,
        getConflictingClassGroupIds: i,
        sortModifiers: a,
        postfixLookupClassGroupIds: o,
      } = t,
      s = [],
      c = e.trim().split(jo),
      l = ``
    for (let e = c.length - 1; e >= 0; --e) {
      let t = c[e],
        {
          isExternal: u,
          modifiers: d,
          hasImportantModifier: f,
          baseClassName: p,
          maybePostfixModifierPosition: m,
        } = n(t)
      if (u) {
        l = t + (l.length > 0 ? ` ` + l : l)
        continue
      }
      let h = !!m,
        g
      if (h) {
        g = r(p.substring(0, m))
        let e = g && o[g] ? r(p) : void 0
        e && e !== g && ((g = e), (h = !1))
      } else g = r(p)
      if (!g) {
        if (!h) {
          l = t + (l.length > 0 ? ` ` + l : l)
          continue
        }
        if (((g = r(p)), !g)) {
          l = t + (l.length > 0 ? ` ` + l : l)
          continue
        }
        h = !1
      }
      let _ = d.length === 0 ? `` : d.length === 1 ? d[0] : a(d).join(`:`),
        v = f ? _ + Co : _,
        y = v + g
      if (s.indexOf(y) > -1) continue
      s.push(y)
      let b = i(g, h)
      for (let e = 0; e < b.length; ++e) {
        let t = b[e]
        s.push(v + t)
      }
      l = t + (l.length > 0 ? ` ` + l : l)
    }
    return l
  },
  No = (...e) => {
    let t = 0,
      n,
      r,
      i = ``
    for (; t < e.length;) (n = e[t++]) && (r = Po(n)) && (i && (i += ` `), (i += r))
    return i
  },
  Po = (e) => {
    if (typeof e == `string`) return e
    let t,
      n = ``
    for (let r = 0; r < e.length; r++) e[r] && (t = Po(e[r])) && (n && (n += ` `), (n += t))
    return n
  },
  Fo = (e, ...t) => {
    let n,
      r,
      i,
      a,
      o = (o) => (
        (n = ko(t.reduce((e, t) => t(e), e()))),
        (r = n.cache.get),
        (i = n.cache.set),
        (a = s),
        s(o)
      ),
      s = (e) => {
        let t = r(e)
        if (t) return t
        let a = Mo(e, n)
        return (i(e, a), a)
      }
    return ((a = o), (...e) => a(No(...e)))
  },
  Io = [],
  Lo = (e) => {
    let t = (t) => t[e] || Io
    return ((t.isThemeGetter = !0), t)
  },
  Ro = /^\[(?:(\w[\w-]*):)?(.+)\]$/i,
  zo = /^\((?:(\w[\w-]*):)?(.+)\)$/i,
  Bo = /^\d+(?:\.\d+)?\/\d+(?:\.\d+)?$/,
  Vo = /^(\d+(\.\d+)?)?(xs|sm|md|lg|xl)$/,
  Ho =
    /\d+(%|px|r?em|[sdl]?v([hwib]|min|max)|pt|pc|in|cm|mm|cap|ch|ex|r?lh|cq(w|h|i|b|min|max))|\b(calc|min|max|clamp)\(.+\)|^0$/,
  Uo = /^(rgba?|hsla?|hwb|(ok)?(lab|lch)|color-mix)\(.+\)$/,
  Wo = /^(inset_)?-?((\d+)?\.?(\d+)[a-z]+|0)_-?((\d+)?\.?(\d+)[a-z]+|0)/,
  Go =
    /^(url|image|image-set|cross-fade|element|(repeating-)?(linear|radial|conic)-gradient)\(.+\)$/,
  Ko = (e) => Bo.test(e),
  H = (e) => !!e && !Number.isNaN(Number(e)),
  qo = (e) => !!e && Number.isInteger(Number(e)),
  Jo = (e) => e.endsWith(`%`) && H(e.slice(0, -1)),
  Yo = (e) => Vo.test(e),
  Xo = () => !0,
  Zo = (e) => Ho.test(e) && !Uo.test(e),
  Qo = () => !1,
  $o = (e) => Wo.test(e),
  es = (e) => Go.test(e),
  ts = (e) => !U(e) && !W(e),
  ns = (e) =>
    e.startsWith(`@container`) &&
    ((e[10] === `/` && e[11] !== void 0) ||
      (e[11] === `s` && e[16] !== void 0 && e.startsWith(`-size/`, 10)) ||
      (e[11] === `n` && e[18] !== void 0 && e.startsWith(`-normal/`, 10))),
  rs = (e) => vs(e, Ss, Qo),
  U = (e) => Ro.test(e),
  is = (e) => vs(e, Cs, Zo),
  as = (e) => vs(e, ws, H),
  os = (e) => vs(e, Es, Xo),
  ss = (e) => vs(e, Ts, Qo),
  cs = (e) => vs(e, bs, Qo),
  ls = (e) => vs(e, xs, es),
  us = (e) => vs(e, Ds, $o),
  W = (e) => zo.test(e),
  ds = (e) => ys(e, Cs),
  fs = (e) => ys(e, Ts),
  ps = (e) => ys(e, bs),
  ms = (e) => ys(e, Ss),
  hs = (e) => ys(e, xs),
  gs = (e) => ys(e, Ds, !0),
  _s = (e) => ys(e, Es, !0),
  vs = (e, t, n) => {
    let r = Ro.exec(e)
    return r ? (r[1] ? t(r[1]) : n(r[2])) : !1
  },
  ys = (e, t, n = !1) => {
    let r = zo.exec(e)
    return r ? (r[1] ? t(r[1]) : n) : !1
  },
  bs = (e) => e === `position` || e === `percentage`,
  xs = (e) => e === `image` || e === `url`,
  Ss = (e) => e === `length` || e === `size` || e === `bg-size`,
  Cs = (e) => e === `length`,
  ws = (e) => e === `number`,
  Ts = (e) => e === `family-name`,
  Es = (e) => e === `number` || e === `weight`,
  Ds = (e) => e === `shadow`,
  Os = Fo(() => {
    let e = Lo(`color`),
      t = Lo(`font`),
      n = Lo(`text`),
      r = Lo(`font-weight`),
      i = Lo(`tracking`),
      a = Lo(`leading`),
      o = Lo(`breakpoint`),
      s = Lo(`container`),
      c = Lo(`spacing`),
      l = Lo(`radius`),
      u = Lo(`shadow`),
      d = Lo(`inset-shadow`),
      f = Lo(`text-shadow`),
      p = Lo(`drop-shadow`),
      m = Lo(`blur`),
      h = Lo(`perspective`),
      g = Lo(`aspect`),
      _ = Lo(`ease`),
      v = Lo(`animate`),
      y = () => [`auto`, `avoid`, `all`, `avoid-page`, `page`, `left`, `right`, `column`],
      b = () => [
        `center`,
        `top`,
        `bottom`,
        `left`,
        `right`,
        `top-left`,
        `left-top`,
        `top-right`,
        `right-top`,
        `bottom-right`,
        `right-bottom`,
        `bottom-left`,
        `left-bottom`,
      ],
      x = () => [...b(), W, U],
      S = () => [`auto`, `hidden`, `clip`, `visible`, `scroll`],
      C = () => [`auto`, `contain`, `none`],
      w = () => [W, U, c],
      T = () => [Ko, `full`, `auto`, ...w()],
      E = () => [qo, `none`, `subgrid`, W, U],
      ee = () => [`auto`, { span: [`full`, qo, W, U] }, qo, W, U],
      te = () => [qo, `auto`, W, U],
      ne = () => [`auto`, `min`, `max`, `fr`, W, U],
      re = () => [
        `start`,
        `end`,
        `center`,
        `between`,
        `around`,
        `evenly`,
        `stretch`,
        `baseline`,
        `center-safe`,
        `end-safe`,
      ],
      D = () => [`start`, `end`, `center`, `stretch`, `center-safe`, `end-safe`],
      O = () => [`auto`, ...w()],
      ie = () => [
        Ko,
        `auto`,
        `full`,
        `dvw`,
        `dvh`,
        `lvw`,
        `lvh`,
        `svw`,
        `svh`,
        `min`,
        `max`,
        `fit`,
        ...w(),
      ],
      ae = () => [Ko, `screen`, `full`, `dvw`, `lvw`, `svw`, `min`, `max`, `fit`, ...w()],
      k = () => [Ko, `screen`, `full`, `lh`, `dvh`, `lvh`, `svh`, `min`, `max`, `fit`, ...w()],
      A = () => [e, W, U],
      j = () => [...b(), ps, cs, { position: [W, U] }],
      oe = () => [`no-repeat`, { repeat: [``, `x`, `y`, `space`, `round`] }],
      se = () => [`auto`, `cover`, `contain`, ms, rs, { size: [W, U] }],
      ce = () => [Jo, ds, is],
      M = () => [``, `none`, `full`, l, W, U],
      N = () => [``, H, ds, is],
      P = () => [`solid`, `dashed`, `dotted`, `double`],
      le = () => [
        `normal`,
        `multiply`,
        `screen`,
        `overlay`,
        `darken`,
        `lighten`,
        `color-dodge`,
        `color-burn`,
        `hard-light`,
        `soft-light`,
        `difference`,
        `exclusion`,
        `hue`,
        `saturation`,
        `color`,
        `luminosity`,
      ],
      F = () => [H, Jo, ps, cs],
      ue = () => [``, `none`, m, W, U],
      de = () => [`none`, H, W, U],
      fe = () => [`none`, H, W, U],
      pe = () => [H, W, U],
      me = () => [Ko, `full`, ...w()]
    return {
      cacheSize: 500,
      theme: {
        animate: [`spin`, `ping`, `pulse`, `bounce`],
        aspect: [`video`],
        blur: [Yo],
        breakpoint: [Yo],
        color: [Xo],
        container: [Yo],
        "drop-shadow": [Yo],
        ease: [`in`, `out`, `in-out`],
        font: [ts],
        "font-weight": [
          `thin`,
          `extralight`,
          `light`,
          `normal`,
          `medium`,
          `semibold`,
          `bold`,
          `extrabold`,
          `black`,
        ],
        "inset-shadow": [Yo],
        leading: [`none`, `tight`, `snug`, `normal`, `relaxed`, `loose`],
        perspective: [`dramatic`, `near`, `normal`, `midrange`, `distant`, `none`],
        radius: [Yo],
        shadow: [Yo],
        spacing: [`px`, H],
        text: [Yo],
        "text-shadow": [Yo],
        tracking: [`tighter`, `tight`, `normal`, `wide`, `wider`, `widest`],
      },
      classGroups: {
        aspect: [{ aspect: [`auto`, `square`, Ko, U, W, g] }],
        container: [`container`],
        "container-type": [{ "@container": [``, `normal`, `size`, W, U] }],
        "container-named": [ns],
        columns: [{ columns: [H, U, W, s] }],
        "break-after": [{ "break-after": y() }],
        "break-before": [{ "break-before": y() }],
        "break-inside": [{ "break-inside": [`auto`, `avoid`, `avoid-page`, `avoid-column`] }],
        "box-decoration": [{ "box-decoration": [`slice`, `clone`] }],
        box: [{ box: [`border`, `content`] }],
        display: [
          `block`,
          `inline-block`,
          `inline`,
          `flex`,
          `inline-flex`,
          `table`,
          `inline-table`,
          `table-caption`,
          `table-cell`,
          `table-column`,
          `table-column-group`,
          `table-footer-group`,
          `table-header-group`,
          `table-row-group`,
          `table-row`,
          `flow-root`,
          `grid`,
          `inline-grid`,
          `contents`,
          `list-item`,
          `hidden`,
        ],
        sr: [`sr-only`, `not-sr-only`],
        float: [{ float: [`right`, `left`, `none`, `start`, `end`] }],
        clear: [{ clear: [`left`, `right`, `both`, `none`, `start`, `end`] }],
        isolation: [`isolate`, `isolation-auto`],
        "object-fit": [{ object: [`contain`, `cover`, `fill`, `none`, `scale-down`] }],
        "object-position": [{ object: x() }],
        overflow: [{ overflow: S() }],
        "overflow-x": [{ "overflow-x": S() }],
        "overflow-y": [{ "overflow-y": S() }],
        overscroll: [{ overscroll: C() }],
        "overscroll-x": [{ "overscroll-x": C() }],
        "overscroll-y": [{ "overscroll-y": C() }],
        position: [`static`, `fixed`, `absolute`, `relative`, `sticky`],
        inset: [{ inset: T() }],
        "inset-x": [{ "inset-x": T() }],
        "inset-y": [{ "inset-y": T() }],
        start: [{ "inset-s": T(), start: T() }],
        end: [{ "inset-e": T(), end: T() }],
        "inset-bs": [{ "inset-bs": T() }],
        "inset-be": [{ "inset-be": T() }],
        top: [{ top: T() }],
        right: [{ right: T() }],
        bottom: [{ bottom: T() }],
        left: [{ left: T() }],
        visibility: [`visible`, `invisible`, `collapse`],
        z: [{ z: [qo, `auto`, W, U] }],
        basis: [{ basis: [Ko, `full`, `auto`, s, ...w()] }],
        "flex-direction": [{ flex: [`row`, `row-reverse`, `col`, `col-reverse`] }],
        "flex-wrap": [{ flex: [`nowrap`, `wrap`, `wrap-reverse`] }],
        flex: [{ flex: [H, Ko, `auto`, `initial`, `none`, U] }],
        grow: [{ grow: [``, H, W, U] }],
        shrink: [{ shrink: [``, H, W, U] }],
        order: [{ order: [qo, `first`, `last`, `none`, W, U] }],
        "grid-cols": [{ "grid-cols": E() }],
        "col-start-end": [{ col: ee() }],
        "col-start": [{ "col-start": te() }],
        "col-end": [{ "col-end": te() }],
        "grid-rows": [{ "grid-rows": E() }],
        "row-start-end": [{ row: ee() }],
        "row-start": [{ "row-start": te() }],
        "row-end": [{ "row-end": te() }],
        "grid-flow": [{ "grid-flow": [`row`, `col`, `dense`, `row-dense`, `col-dense`] }],
        "auto-cols": [{ "auto-cols": ne() }],
        "auto-rows": [{ "auto-rows": ne() }],
        gap: [{ gap: w() }],
        "gap-x": [{ "gap-x": w() }],
        "gap-y": [{ "gap-y": w() }],
        "justify-content": [{ justify: [...re(), `normal`] }],
        "justify-items": [{ "justify-items": [...D(), `normal`] }],
        "justify-self": [{ "justify-self": [`auto`, ...D()] }],
        "align-content": [{ content: [`normal`, ...re()] }],
        "align-items": [{ items: [...D(), { baseline: [``, `last`] }] }],
        "align-self": [{ self: [`auto`, ...D(), { baseline: [``, `last`] }] }],
        "place-content": [{ "place-content": re() }],
        "place-items": [{ "place-items": [...D(), `baseline`] }],
        "place-self": [{ "place-self": [`auto`, ...D()] }],
        p: [{ p: w() }],
        px: [{ px: w() }],
        py: [{ py: w() }],
        ps: [{ ps: w() }],
        pe: [{ pe: w() }],
        pbs: [{ pbs: w() }],
        pbe: [{ pbe: w() }],
        pt: [{ pt: w() }],
        pr: [{ pr: w() }],
        pb: [{ pb: w() }],
        pl: [{ pl: w() }],
        m: [{ m: O() }],
        mx: [{ mx: O() }],
        my: [{ my: O() }],
        ms: [{ ms: O() }],
        me: [{ me: O() }],
        mbs: [{ mbs: O() }],
        mbe: [{ mbe: O() }],
        mt: [{ mt: O() }],
        mr: [{ mr: O() }],
        mb: [{ mb: O() }],
        ml: [{ ml: O() }],
        "space-x": [{ "space-x": w() }],
        "space-x-reverse": [`space-x-reverse`],
        "space-y": [{ "space-y": w() }],
        "space-y-reverse": [`space-y-reverse`],
        size: [{ size: ie() }],
        "inline-size": [{ inline: [`auto`, ...ae()] }],
        "min-inline-size": [{ "min-inline": [`auto`, ...ae()] }],
        "max-inline-size": [{ "max-inline": [`none`, ...ae()] }],
        "block-size": [{ block: [`auto`, ...k()] }],
        "min-block-size": [{ "min-block": [`auto`, ...k()] }],
        "max-block-size": [{ "max-block": [`none`, ...k()] }],
        w: [{ w: [s, `screen`, ...ie()] }],
        "min-w": [{ "min-w": [s, `screen`, `none`, ...ie()] }],
        "max-w": [{ "max-w": [s, `screen`, `none`, `prose`, { screen: [o] }, ...ie()] }],
        h: [{ h: [`screen`, `lh`, ...ie()] }],
        "min-h": [{ "min-h": [`screen`, `lh`, `none`, ...ie()] }],
        "max-h": [{ "max-h": [`screen`, `lh`, ...ie()] }],
        "font-size": [{ text: [`base`, n, ds, is] }],
        "font-smoothing": [`antialiased`, `subpixel-antialiased`],
        "font-style": [`italic`, `not-italic`],
        "font-weight": [{ font: [r, _s, os] }],
        "font-stretch": [
          {
            "font-stretch": [
              `ultra-condensed`,
              `extra-condensed`,
              `condensed`,
              `semi-condensed`,
              `normal`,
              `semi-expanded`,
              `expanded`,
              `extra-expanded`,
              `ultra-expanded`,
              Jo,
              U,
            ],
          },
        ],
        "font-family": [{ font: [fs, ss, t] }],
        "font-features": [{ "font-features": [U] }],
        "fvn-normal": [`normal-nums`],
        "fvn-ordinal": [`ordinal`],
        "fvn-slashed-zero": [`slashed-zero`],
        "fvn-figure": [`lining-nums`, `oldstyle-nums`],
        "fvn-spacing": [`proportional-nums`, `tabular-nums`],
        "fvn-fraction": [`diagonal-fractions`, `stacked-fractions`],
        tracking: [{ tracking: [i, W, U] }],
        "line-clamp": [{ "line-clamp": [H, `none`, W, as] }],
        leading: [{ leading: [a, ...w()] }],
        "list-image": [{ "list-image": [`none`, W, U] }],
        "list-style-position": [{ list: [`inside`, `outside`] }],
        "list-style-type": [{ list: [`disc`, `decimal`, `none`, W, U] }],
        "text-alignment": [{ text: [`left`, `center`, `right`, `justify`, `start`, `end`] }],
        "placeholder-color": [{ placeholder: A() }],
        "text-color": [{ text: A() }],
        "text-decoration": [`underline`, `overline`, `line-through`, `no-underline`],
        "text-decoration-style": [{ decoration: [...P(), `wavy`] }],
        "text-decoration-thickness": [{ decoration: [H, `from-font`, `auto`, W, is] }],
        "text-decoration-color": [{ decoration: A() }],
        "underline-offset": [{ "underline-offset": [H, `auto`, W, U] }],
        "text-transform": [`uppercase`, `lowercase`, `capitalize`, `normal-case`],
        "text-overflow": [`truncate`, `text-ellipsis`, `text-clip`],
        "text-wrap": [{ text: [`wrap`, `nowrap`, `balance`, `pretty`] }],
        indent: [{ indent: w() }],
        "tab-size": [{ tab: [qo, W, U] }],
        "vertical-align": [
          {
            align: [
              `baseline`,
              `top`,
              `middle`,
              `bottom`,
              `text-top`,
              `text-bottom`,
              `sub`,
              `super`,
              W,
              U,
            ],
          },
        ],
        whitespace: [
          { whitespace: [`normal`, `nowrap`, `pre`, `pre-line`, `pre-wrap`, `break-spaces`] },
        ],
        break: [{ break: [`normal`, `words`, `all`, `keep`] }],
        wrap: [{ wrap: [`break-word`, `anywhere`, `normal`] }],
        hyphens: [{ hyphens: [`none`, `manual`, `auto`] }],
        content: [{ content: [`none`, W, U] }],
        "bg-attachment": [{ bg: [`fixed`, `local`, `scroll`] }],
        "bg-clip": [{ "bg-clip": [`border`, `padding`, `content`, `text`] }],
        "bg-origin": [{ "bg-origin": [`border`, `padding`, `content`] }],
        "bg-position": [{ bg: j() }],
        "bg-repeat": [{ bg: oe() }],
        "bg-size": [{ bg: se() }],
        "bg-image": [
          {
            bg: [
              `none`,
              {
                linear: [{ to: [`t`, `tr`, `r`, `br`, `b`, `bl`, `l`, `tl`] }, qo, W, U],
                radial: [``, W, U],
                conic: [qo, W, U],
              },
              hs,
              ls,
            ],
          },
        ],
        "bg-color": [{ bg: A() }],
        "gradient-from-pos": [{ from: ce() }],
        "gradient-via-pos": [{ via: ce() }],
        "gradient-to-pos": [{ to: ce() }],
        "gradient-from": [{ from: A() }],
        "gradient-via": [{ via: A() }],
        "gradient-to": [{ to: A() }],
        rounded: [{ rounded: M() }],
        "rounded-s": [{ "rounded-s": M() }],
        "rounded-e": [{ "rounded-e": M() }],
        "rounded-t": [{ "rounded-t": M() }],
        "rounded-r": [{ "rounded-r": M() }],
        "rounded-b": [{ "rounded-b": M() }],
        "rounded-l": [{ "rounded-l": M() }],
        "rounded-ss": [{ "rounded-ss": M() }],
        "rounded-se": [{ "rounded-se": M() }],
        "rounded-ee": [{ "rounded-ee": M() }],
        "rounded-es": [{ "rounded-es": M() }],
        "rounded-tl": [{ "rounded-tl": M() }],
        "rounded-tr": [{ "rounded-tr": M() }],
        "rounded-br": [{ "rounded-br": M() }],
        "rounded-bl": [{ "rounded-bl": M() }],
        "border-w": [{ border: N() }],
        "border-w-x": [{ "border-x": N() }],
        "border-w-y": [{ "border-y": N() }],
        "border-w-s": [{ "border-s": N() }],
        "border-w-e": [{ "border-e": N() }],
        "border-w-bs": [{ "border-bs": N() }],
        "border-w-be": [{ "border-be": N() }],
        "border-w-t": [{ "border-t": N() }],
        "border-w-r": [{ "border-r": N() }],
        "border-w-b": [{ "border-b": N() }],
        "border-w-l": [{ "border-l": N() }],
        "divide-x": [{ "divide-x": N() }],
        "divide-x-reverse": [`divide-x-reverse`],
        "divide-y": [{ "divide-y": N() }],
        "divide-y-reverse": [`divide-y-reverse`],
        "border-style": [{ border: [...P(), `hidden`, `none`] }],
        "divide-style": [{ divide: [...P(), `hidden`, `none`] }],
        "border-color": [{ border: A() }],
        "border-color-x": [{ "border-x": A() }],
        "border-color-y": [{ "border-y": A() }],
        "border-color-s": [{ "border-s": A() }],
        "border-color-e": [{ "border-e": A() }],
        "border-color-bs": [{ "border-bs": A() }],
        "border-color-be": [{ "border-be": A() }],
        "border-color-t": [{ "border-t": A() }],
        "border-color-r": [{ "border-r": A() }],
        "border-color-b": [{ "border-b": A() }],
        "border-color-l": [{ "border-l": A() }],
        "divide-color": [{ divide: A() }],
        "outline-style": [{ outline: [...P(), `none`, `hidden`] }],
        "outline-offset": [{ "outline-offset": [H, W, U] }],
        "outline-w": [{ outline: [``, H, ds, is] }],
        "outline-color": [{ outline: A() }],
        shadow: [{ shadow: [``, `none`, u, gs, us] }],
        "shadow-color": [{ shadow: A() }],
        "inset-shadow": [{ "inset-shadow": [`none`, d, gs, us] }],
        "inset-shadow-color": [{ "inset-shadow": A() }],
        "ring-w": [{ ring: N() }],
        "ring-w-inset": [`ring-inset`],
        "ring-color": [{ ring: A() }],
        "ring-offset-w": [{ "ring-offset": [H, is] }],
        "ring-offset-color": [{ "ring-offset": A() }],
        "inset-ring-w": [{ "inset-ring": N() }],
        "inset-ring-color": [{ "inset-ring": A() }],
        "text-shadow": [{ "text-shadow": [`none`, f, gs, us] }],
        "text-shadow-color": [{ "text-shadow": A() }],
        opacity: [{ opacity: [H, W, U] }],
        "mix-blend": [{ "mix-blend": [...le(), `plus-darker`, `plus-lighter`] }],
        "bg-blend": [{ "bg-blend": le() }],
        "mask-clip": [
          { "mask-clip": [`border`, `padding`, `content`, `fill`, `stroke`, `view`] },
          `mask-no-clip`,
        ],
        "mask-composite": [{ mask: [`add`, `subtract`, `intersect`, `exclude`] }],
        "mask-image-linear-pos": [{ "mask-linear": [H] }],
        "mask-image-linear-from-pos": [{ "mask-linear-from": F() }],
        "mask-image-linear-to-pos": [{ "mask-linear-to": F() }],
        "mask-image-linear-from-color": [{ "mask-linear-from": A() }],
        "mask-image-linear-to-color": [{ "mask-linear-to": A() }],
        "mask-image-t-from-pos": [{ "mask-t-from": F() }],
        "mask-image-t-to-pos": [{ "mask-t-to": F() }],
        "mask-image-t-from-color": [{ "mask-t-from": A() }],
        "mask-image-t-to-color": [{ "mask-t-to": A() }],
        "mask-image-r-from-pos": [{ "mask-r-from": F() }],
        "mask-image-r-to-pos": [{ "mask-r-to": F() }],
        "mask-image-r-from-color": [{ "mask-r-from": A() }],
        "mask-image-r-to-color": [{ "mask-r-to": A() }],
        "mask-image-b-from-pos": [{ "mask-b-from": F() }],
        "mask-image-b-to-pos": [{ "mask-b-to": F() }],
        "mask-image-b-from-color": [{ "mask-b-from": A() }],
        "mask-image-b-to-color": [{ "mask-b-to": A() }],
        "mask-image-l-from-pos": [{ "mask-l-from": F() }],
        "mask-image-l-to-pos": [{ "mask-l-to": F() }],
        "mask-image-l-from-color": [{ "mask-l-from": A() }],
        "mask-image-l-to-color": [{ "mask-l-to": A() }],
        "mask-image-x-from-pos": [{ "mask-x-from": F() }],
        "mask-image-x-to-pos": [{ "mask-x-to": F() }],
        "mask-image-x-from-color": [{ "mask-x-from": A() }],
        "mask-image-x-to-color": [{ "mask-x-to": A() }],
        "mask-image-y-from-pos": [{ "mask-y-from": F() }],
        "mask-image-y-to-pos": [{ "mask-y-to": F() }],
        "mask-image-y-from-color": [{ "mask-y-from": A() }],
        "mask-image-y-to-color": [{ "mask-y-to": A() }],
        "mask-image-radial": [{ "mask-radial": [W, U] }],
        "mask-image-radial-from-pos": [{ "mask-radial-from": F() }],
        "mask-image-radial-to-pos": [{ "mask-radial-to": F() }],
        "mask-image-radial-from-color": [{ "mask-radial-from": A() }],
        "mask-image-radial-to-color": [{ "mask-radial-to": A() }],
        "mask-image-radial-shape": [{ "mask-radial": [`circle`, `ellipse`] }],
        "mask-image-radial-size": [
          { "mask-radial": [{ closest: [`side`, `corner`], farthest: [`side`, `corner`] }] },
        ],
        "mask-image-radial-pos": [{ "mask-radial-at": b() }],
        "mask-image-conic-pos": [{ "mask-conic": [H] }],
        "mask-image-conic-from-pos": [{ "mask-conic-from": F() }],
        "mask-image-conic-to-pos": [{ "mask-conic-to": F() }],
        "mask-image-conic-from-color": [{ "mask-conic-from": A() }],
        "mask-image-conic-to-color": [{ "mask-conic-to": A() }],
        "mask-mode": [{ mask: [`alpha`, `luminance`, `match`] }],
        "mask-origin": [
          { "mask-origin": [`border`, `padding`, `content`, `fill`, `stroke`, `view`] },
        ],
        "mask-position": [{ mask: j() }],
        "mask-repeat": [{ mask: oe() }],
        "mask-size": [{ mask: se() }],
        "mask-type": [{ "mask-type": [`alpha`, `luminance`] }],
        "mask-image": [{ mask: [`none`, W, U] }],
        filter: [{ filter: [``, `none`, W, U] }],
        blur: [{ blur: ue() }],
        brightness: [{ brightness: [H, W, U] }],
        contrast: [{ contrast: [H, W, U] }],
        "drop-shadow": [{ "drop-shadow": [``, `none`, p, gs, us] }],
        "drop-shadow-color": [{ "drop-shadow": A() }],
        grayscale: [{ grayscale: [``, H, W, U] }],
        "hue-rotate": [{ "hue-rotate": [H, W, U] }],
        invert: [{ invert: [``, H, W, U] }],
        saturate: [{ saturate: [H, W, U] }],
        sepia: [{ sepia: [``, H, W, U] }],
        "backdrop-filter": [{ "backdrop-filter": [``, `none`, W, U] }],
        "backdrop-blur": [{ "backdrop-blur": ue() }],
        "backdrop-brightness": [{ "backdrop-brightness": [H, W, U] }],
        "backdrop-contrast": [{ "backdrop-contrast": [H, W, U] }],
        "backdrop-grayscale": [{ "backdrop-grayscale": [``, H, W, U] }],
        "backdrop-hue-rotate": [{ "backdrop-hue-rotate": [H, W, U] }],
        "backdrop-invert": [{ "backdrop-invert": [``, H, W, U] }],
        "backdrop-opacity": [{ "backdrop-opacity": [H, W, U] }],
        "backdrop-saturate": [{ "backdrop-saturate": [H, W, U] }],
        "backdrop-sepia": [{ "backdrop-sepia": [``, H, W, U] }],
        "border-collapse": [{ border: [`collapse`, `separate`] }],
        "border-spacing": [{ "border-spacing": w() }],
        "border-spacing-x": [{ "border-spacing-x": w() }],
        "border-spacing-y": [{ "border-spacing-y": w() }],
        "table-layout": [{ table: [`auto`, `fixed`] }],
        caption: [{ caption: [`top`, `bottom`] }],
        transition: [
          { transition: [``, `all`, `colors`, `opacity`, `shadow`, `transform`, `none`, W, U] },
        ],
        "transition-behavior": [{ transition: [`normal`, `discrete`] }],
        duration: [{ duration: [H, `initial`, W, U] }],
        ease: [{ ease: [`linear`, `initial`, _, W, U] }],
        delay: [{ delay: [H, W, U] }],
        animate: [{ animate: [`none`, v, W, U] }],
        backface: [{ backface: [`hidden`, `visible`] }],
        perspective: [{ perspective: [h, W, U] }],
        "perspective-origin": [{ "perspective-origin": x() }],
        rotate: [{ rotate: de() }],
        "rotate-x": [{ "rotate-x": de() }],
        "rotate-y": [{ "rotate-y": de() }],
        "rotate-z": [{ "rotate-z": de() }],
        scale: [{ scale: fe() }],
        "scale-x": [{ "scale-x": fe() }],
        "scale-y": [{ "scale-y": fe() }],
        "scale-z": [{ "scale-z": fe() }],
        "scale-3d": [`scale-3d`],
        skew: [{ skew: pe() }],
        "skew-x": [{ "skew-x": pe() }],
        "skew-y": [{ "skew-y": pe() }],
        transform: [{ transform: [W, U, ``, `none`, `gpu`, `cpu`] }],
        "transform-origin": [{ origin: x() }],
        "transform-style": [{ transform: [`3d`, `flat`] }],
        translate: [{ translate: me() }],
        "translate-x": [{ "translate-x": me() }],
        "translate-y": [{ "translate-y": me() }],
        "translate-z": [{ "translate-z": me() }],
        "translate-none": [`translate-none`],
        zoom: [{ zoom: [qo, W, U] }],
        accent: [{ accent: A() }],
        appearance: [{ appearance: [`none`, `auto`] }],
        "caret-color": [{ caret: A() }],
        "color-scheme": [
          { scheme: [`normal`, `dark`, `light`, `light-dark`, `only-dark`, `only-light`] },
        ],
        cursor: [
          {
            cursor: [
              `auto`,
              `default`,
              `pointer`,
              `wait`,
              `text`,
              `move`,
              `help`,
              `not-allowed`,
              `none`,
              `context-menu`,
              `progress`,
              `cell`,
              `crosshair`,
              `vertical-text`,
              `alias`,
              `copy`,
              `no-drop`,
              `grab`,
              `grabbing`,
              `all-scroll`,
              `col-resize`,
              `row-resize`,
              `n-resize`,
              `e-resize`,
              `s-resize`,
              `w-resize`,
              `ne-resize`,
              `nw-resize`,
              `se-resize`,
              `sw-resize`,
              `ew-resize`,
              `ns-resize`,
              `nesw-resize`,
              `nwse-resize`,
              `zoom-in`,
              `zoom-out`,
              W,
              U,
            ],
          },
        ],
        "field-sizing": [{ "field-sizing": [`fixed`, `content`] }],
        "pointer-events": [{ "pointer-events": [`auto`, `none`] }],
        resize: [{ resize: [`none`, ``, `y`, `x`] }],
        "scroll-behavior": [{ scroll: [`auto`, `smooth`] }],
        "scrollbar-thumb-color": [{ "scrollbar-thumb": A() }],
        "scrollbar-track-color": [{ "scrollbar-track": A() }],
        "scrollbar-gutter": [{ "scrollbar-gutter": [`auto`, `stable`, `both`] }],
        "scrollbar-w": [{ scrollbar: [`auto`, `thin`, `none`] }],
        "scroll-m": [{ "scroll-m": w() }],
        "scroll-mx": [{ "scroll-mx": w() }],
        "scroll-my": [{ "scroll-my": w() }],
        "scroll-ms": [{ "scroll-ms": w() }],
        "scroll-me": [{ "scroll-me": w() }],
        "scroll-mbs": [{ "scroll-mbs": w() }],
        "scroll-mbe": [{ "scroll-mbe": w() }],
        "scroll-mt": [{ "scroll-mt": w() }],
        "scroll-mr": [{ "scroll-mr": w() }],
        "scroll-mb": [{ "scroll-mb": w() }],
        "scroll-ml": [{ "scroll-ml": w() }],
        "scroll-p": [{ "scroll-p": w() }],
        "scroll-px": [{ "scroll-px": w() }],
        "scroll-py": [{ "scroll-py": w() }],
        "scroll-ps": [{ "scroll-ps": w() }],
        "scroll-pe": [{ "scroll-pe": w() }],
        "scroll-pbs": [{ "scroll-pbs": w() }],
        "scroll-pbe": [{ "scroll-pbe": w() }],
        "scroll-pt": [{ "scroll-pt": w() }],
        "scroll-pr": [{ "scroll-pr": w() }],
        "scroll-pb": [{ "scroll-pb": w() }],
        "scroll-pl": [{ "scroll-pl": w() }],
        "snap-align": [{ snap: [`start`, `end`, `center`, `align-none`] }],
        "snap-stop": [{ snap: [`normal`, `always`] }],
        "snap-type": [{ snap: [`none`, `x`, `y`, `both`] }],
        "snap-strictness": [{ snap: [`mandatory`, `proximity`] }],
        touch: [{ touch: [`auto`, `none`, `manipulation`] }],
        "touch-x": [{ "touch-pan": [`x`, `left`, `right`] }],
        "touch-y": [{ "touch-pan": [`y`, `up`, `down`] }],
        "touch-pz": [`touch-pinch-zoom`],
        select: [{ select: [`none`, `text`, `all`, `auto`] }],
        "will-change": [{ "will-change": [`auto`, `scroll`, `contents`, `transform`, W, U] }],
        fill: [{ fill: [`none`, ...A()] }],
        "stroke-w": [{ stroke: [H, ds, is, as] }],
        stroke: [{ stroke: [`none`, ...A()] }],
        "forced-color-adjust": [{ "forced-color-adjust": [`auto`, `none`] }],
      },
      conflictingClassGroups: {
        "container-named": [`container-type`],
        overflow: [`overflow-x`, `overflow-y`],
        overscroll: [`overscroll-x`, `overscroll-y`],
        inset: [
          `inset-x`,
          `inset-y`,
          `inset-bs`,
          `inset-be`,
          `start`,
          `end`,
          `top`,
          `right`,
          `bottom`,
          `left`,
        ],
        "inset-x": [`right`, `left`],
        "inset-y": [`top`, `bottom`],
        flex: [`basis`, `grow`, `shrink`],
        gap: [`gap-x`, `gap-y`],
        p: [`px`, `py`, `ps`, `pe`, `pbs`, `pbe`, `pt`, `pr`, `pb`, `pl`],
        px: [`pr`, `pl`],
        py: [`pt`, `pb`],
        m: [`mx`, `my`, `ms`, `me`, `mbs`, `mbe`, `mt`, `mr`, `mb`, `ml`],
        mx: [`mr`, `ml`],
        my: [`mt`, `mb`],
        size: [`w`, `h`],
        "font-size": [`leading`],
        "fvn-normal": [
          `fvn-ordinal`,
          `fvn-slashed-zero`,
          `fvn-figure`,
          `fvn-spacing`,
          `fvn-fraction`,
        ],
        "fvn-ordinal": [`fvn-normal`],
        "fvn-slashed-zero": [`fvn-normal`],
        "fvn-figure": [`fvn-normal`],
        "fvn-spacing": [`fvn-normal`],
        "fvn-fraction": [`fvn-normal`],
        "line-clamp": [`display`, `overflow`],
        rounded: [
          `rounded-s`,
          `rounded-e`,
          `rounded-t`,
          `rounded-r`,
          `rounded-b`,
          `rounded-l`,
          `rounded-ss`,
          `rounded-se`,
          `rounded-ee`,
          `rounded-es`,
          `rounded-tl`,
          `rounded-tr`,
          `rounded-br`,
          `rounded-bl`,
        ],
        "rounded-s": [`rounded-ss`, `rounded-es`],
        "rounded-e": [`rounded-se`, `rounded-ee`],
        "rounded-t": [`rounded-tl`, `rounded-tr`],
        "rounded-r": [`rounded-tr`, `rounded-br`],
        "rounded-b": [`rounded-br`, `rounded-bl`],
        "rounded-l": [`rounded-tl`, `rounded-bl`],
        "border-spacing": [`border-spacing-x`, `border-spacing-y`],
        "border-w": [
          `border-w-x`,
          `border-w-y`,
          `border-w-s`,
          `border-w-e`,
          `border-w-bs`,
          `border-w-be`,
          `border-w-t`,
          `border-w-r`,
          `border-w-b`,
          `border-w-l`,
        ],
        "border-w-x": [`border-w-r`, `border-w-l`],
        "border-w-y": [`border-w-t`, `border-w-b`],
        "border-color": [
          `border-color-x`,
          `border-color-y`,
          `border-color-s`,
          `border-color-e`,
          `border-color-bs`,
          `border-color-be`,
          `border-color-t`,
          `border-color-r`,
          `border-color-b`,
          `border-color-l`,
        ],
        "border-color-x": [`border-color-r`, `border-color-l`],
        "border-color-y": [`border-color-t`, `border-color-b`],
        translate: [`translate-x`, `translate-y`, `translate-none`],
        "translate-none": [`translate`, `translate-x`, `translate-y`, `translate-z`],
        "scroll-m": [
          `scroll-mx`,
          `scroll-my`,
          `scroll-ms`,
          `scroll-me`,
          `scroll-mbs`,
          `scroll-mbe`,
          `scroll-mt`,
          `scroll-mr`,
          `scroll-mb`,
          `scroll-ml`,
        ],
        "scroll-mx": [`scroll-mr`, `scroll-ml`],
        "scroll-my": [`scroll-mt`, `scroll-mb`],
        "scroll-p": [
          `scroll-px`,
          `scroll-py`,
          `scroll-ps`,
          `scroll-pe`,
          `scroll-pbs`,
          `scroll-pbe`,
          `scroll-pt`,
          `scroll-pr`,
          `scroll-pb`,
          `scroll-pl`,
        ],
        "scroll-px": [`scroll-pr`, `scroll-pl`],
        "scroll-py": [`scroll-pt`, `scroll-pb`],
        touch: [`touch-x`, `touch-y`, `touch-pz`],
        "touch-x": [`touch`],
        "touch-y": [`touch`],
        "touch-pz": [`touch`],
      },
      conflictingClassGroupModifiers: { "font-size": [`leading`] },
      postfixLookupClassGroups: [`container-type`],
      orderSensitiveModifiers: [
        `*`,
        `**`,
        `after`,
        `backdrop`,
        `before`,
        `details-content`,
        `file`,
        `first-letter`,
        `first-line`,
        `marker`,
        `placeholder`,
        `selection`,
      ],
    }
  })
function ks(...e) {
  return Os(un(e))
}
var As = pn(
  `group/button inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
  {
    variants: {
      variant: {
        default: `bg-primary text-primary-foreground [a]:hover:bg-primary/80`,
        outline: `border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50`,
        secondary: `bg-secondary text-secondary-foreground hover:bg-secondary/80 aria-expanded:bg-secondary aria-expanded:text-secondary-foreground`,
        ghost: `hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50`,
        destructive: `bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40`,
        link: `text-primary underline-offset-4 hover:underline`,
      },
      size: {
        default: `h-8 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2`,
        xs: `h-6 gap-1 rounded-[min(var(--radius-md),10px)] px-2 text-xs in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3`,
        sm: `h-7 gap-1 rounded-[min(var(--radius-md),12px)] px-2.5 text-[0.8rem] in-data-[slot=button-group]:rounded-lg has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 [&_svg:not([class*='size-'])]:size-3.5`,
        lg: `h-9 gap-1.5 px-2.5 has-data-[icon=inline-end]:pr-2 has-data-[icon=inline-start]:pl-2`,
        icon: `size-8`,
        "icon-xs": `size-6 rounded-[min(var(--radius-md),10px)] in-data-[slot=button-group]:rounded-lg [&_svg:not([class*='size-'])]:size-3`,
        "icon-sm": `size-7 rounded-[min(var(--radius-md),12px)] in-data-[slot=button-group]:rounded-lg`,
        "icon-lg": `size-9`,
      },
    },
    defaultVariants: { variant: `default`, size: `default` },
  },
)
function G({ className: e, variant: t = `default`, size: n = `default`, asChild: r = !1, ...i }) {
  let a = r ? Sn : `button`
  return (0, L.jsx)(a, {
    "data-slot": `button`,
    "data-variant": t,
    "data-size": n,
    className: ks(As({ variant: t, size: n, className: e })),
    ...i,
  })
}
function js({ ...e }) {
  return (0, L.jsx)(Ra, { "data-slot": `dialog`, ...e })
}
function Ms({ ...e }) {
  return (0, L.jsx)(Ha, { "data-slot": `dialog-portal`, ...e })
}
function Ns({ className: e, ...t }) {
  return (0, L.jsx)(Wa, {
    "data-slot": `dialog-overlay`,
    className: ks(
      `data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/10 duration-100 supports-backdrop-filter:backdrop-blur-xs`,
      e,
    ),
    ...t,
  })
}
function Ps({ className: e, children: t, showCloseButton: n = !0, size: r = `sm`, ...i }) {
  let { t: a } = Ft()
  return (0, L.jsxs)(Ms, {
    children: [
      (0, L.jsx)(Ns, {}),
      (0, L.jsxs)(Ja, {
        "data-slot": `dialog-content`,
        className: ks(
          `bg-popover text-popover-foreground ring-foreground/10 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-xl p-4 text-sm ring-1 duration-100 outline-none`,
          { sm: `sm:max-w-sm`, md: `sm:max-w-md`, lg: `sm:max-w-lg`, xl: `sm:max-w-3xl` }[r],
          e,
        ),
        ...i,
        children: [
          t,
          n &&
            (0, L.jsx)(ro, {
              "data-slot": `dialog-close`,
              asChild: !0,
              children: (0, L.jsxs)(G, {
                variant: `ghost`,
                className: `absolute top-2 right-2`,
                size: `icon-sm`,
                children: [
                  (0, L.jsx)(cn, {}),
                  (0, L.jsx)(`span`, { className: `sr-only`, children: a(`common.actions.close`) }),
                ],
              }),
            }),
        ],
      }),
    ],
  })
}
function Fs({ className: e, ...t }) {
  return (0, L.jsx)(`div`, {
    "data-slot": `dialog-header`,
    className: ks(`flex flex-col gap-2`, e),
    ...t,
  })
}
function Is({ className: e, showCloseButton: t = !1, children: n, ...r }) {
  let { t: i } = Ft()
  return (0, L.jsxs)(`div`, {
    "data-slot": `dialog-footer`,
    className: ks(
      `bg-muted/50 -mx-4 -mb-4 flex flex-col-reverse gap-2 rounded-b-xl border-t p-4 sm:flex-row sm:justify-end`,
      e,
    ),
    ...r,
    children: [
      n,
      t &&
        (0, L.jsx)(ro, {
          asChild: !0,
          children: (0, L.jsx)(G, { variant: `outline`, children: i(`common.actions.close`) }),
        }),
    ],
  })
}
function Ls({ className: e, ...t }) {
  return (0, L.jsx)($a, {
    "data-slot": `dialog-title`,
    className: ks(`font-heading text-base leading-none font-medium`, e),
    ...t,
  })
}
function Rs({ className: e, ...t }) {
  return (0, L.jsx)(to, {
    "data-slot": `dialog-description`,
    className: ks(
      `text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3`,
      e,
    ),
    ...t,
  })
}
function zs(e, t = !1) {
  return window.__TAURI_INTERNALS__.transformCallback(e, t)
}
async function Bs(e, t = {}, n) {
  return window.__TAURI_INTERNALS__.invoke(e, t, n)
}
function Vs(e, t = `asset`) {
  return window.__TAURI_INTERNALS__.convertFileSrc(e, t)
}
function Hs() {
  return !!(globalThis || window).isTauri
}
var Us = (e) => {
    let t,
      n = new Set(),
      r = (e, r) => {
        let i = typeof e == `function` ? e(t) : e
        if (!Object.is(i, t)) {
          let e = t
          ;((t = (r ?? (typeof i != `object` || !i)) ? i : Object.assign({}, t, i)),
            n.forEach((n) => n(t, e)))
        }
      },
      i = () => t,
      a = {
        setState: r,
        getState: i,
        getInitialState: () => o,
        subscribe: (e) => (n.add(e), () => n.delete(e)),
      },
      o = (t = e(r, i, a))
    return a
  },
  Ws = (e) => (e ? Us(e) : Us),
  Gs = (e) => e
function Ks(e, t = Gs) {
  let n = _.useSyncExternalStore(
    e.subscribe,
    _.useCallback(() => t(e.getState()), [e, t]),
    _.useCallback(() => t(e.getInitialState()), [e, t]),
  )
  return (_.useDebugValue(n), n)
}
var qs = (e) => {
    let t = Ws(e),
      n = (e) => Ks(t, e)
    return (Object.assign(n, t), n)
  },
  K = ((e) => (e ? qs(e) : qs))((e, t) => ({
    view: `welcome`,
    source: ``,
    items: [],
    recent: [],
    capabilities: null,
    loaded: !1,
    loadError: null,
    sel: {},
    deletedIds: [],
    history: [],
    filter: `all`,
    groupBy: !1,
    autoNext: !0,
    liveView: `photo`,
    currentId: null,
    multiSel: [],
    lastPickId: null,
    folderCandidates: [],
    movedCounts: {},
    scanning: !1,
    scanStatus: null,
    proxy: {},
    loadedIds: [],
    stripWidth: 320,
    currentFolder: null,
    dragActive: !1,
    helpOpen: !1,
    emptyDirsOpen: !1,
    setHelpOpen: (t) => e({ helpOpen: t }),
    setEmptyDirsOpen: (t) => e({ emptyDirsOpen: t }),
    setView: (t) => e({ view: t }),
    openAlbum: (t, n) =>
      e({
        view: `triage`,
        source: t,
        items: n,
        currentId: null,
        multiSel: [],
        history: [],
        loaded: !0,
        loadError: null,
        loadedIds: [],
        proxy: {},
        currentFolder: null,
      }),
    setRecent: (t) => e({ recent: t }),
    setCapabilities: (t) => e({ capabilities: t }),
    setLoaded: (t) => e({ loaded: t }),
    setLoadError: (t) => e({ loadError: t }),
    setSel: (t, n) =>
      e((e) => {
        let r = e.sel[t],
          i = { ...e.sel }
        return (r === n ? delete i[t] : (i[t] = n), { sel: i })
      }),
    setSelAll: (t) => e({ sel: t }),
    pushHistory: (t) => e((e) => ({ history: [...e.history.slice(-299), t] })),
    resetHistory: () => e({ history: [] }),
    popHistory: () => {
      let { history: n } = t()
      if (n.length === 0) return
      let r = n[n.length - 1]
      return (e({ history: n.slice(0, -1) }), r)
    },
    setFilter: (t) => e({ filter: t }),
    setGroupBy: (t) => e({ groupBy: t }),
    setAutoNext: (t) => e({ autoNext: t }),
    setLiveView: (t) => e({ liveView: t }),
    setCurrent: (t) => e({ currentId: t }),
    toggleMulti: (t) =>
      e((e) => ({
        multiSel: e.multiSel.includes(t) ? e.multiSel.filter((e) => e !== t) : [...e.multiSel, t],
      })),
    setMulti: (t) => e({ multiSel: t }),
    clearMulti: () => e({ multiSel: [] }),
    setLastPick: (t) => e({ lastPickId: t }),
    setFolderCandidates: (t) => e({ folderCandidates: t }),
    addFolderCandidate: (t) =>
      e((e) =>
        e.folderCandidates.includes(t) ? {} : { folderCandidates: [...e.folderCandidates, t] },
      ),
    removeFolderCandidate: (t) =>
      e((e) => ({ folderCandidates: e.folderCandidates.filter((e) => e !== t) })),
    setMovedCounts: (t) => e({ movedCounts: t }),
    bumpMovedCount: (t, n) =>
      e((e) => ({ movedCounts: { ...e.movedCounts, [t]: (e.movedCounts[t] ?? 0) + n } })),
    setScanning: (t) => e({ scanning: t }),
    setScanStatus: (t) => e({ scanStatus: t }),
    setProxy: (t, n) => e((e) => ({ proxy: { ...e.proxy, [t]: n } })),
    setItemLoaded: (t) =>
      e((e) => (e.loadedIds.includes(t) ? {} : { loadedIds: [...e.loadedIds, t] })),
    resetLoaded: () => e({ loadedIds: [] }),
    setStripWidth: (t) => e({ stripWidth: t }),
    setCurrentFolder: (t) => e({ currentFolder: t }),
    setDragActive: (t) => e({ dragActive: t }),
    applyMoveUpdates: (n) => {
      let r = t(),
        i = new Map(r.items.map((e) => [e.id, e])),
        a = { ...r.sel },
        o = [...r.deletedIds],
        s = r.currentId,
        c = []
      for (let e of n) {
        let t = i.get(e.from)
        if (!t) continue
        i.delete(e.from)
        let n = { ...t, id: e.to, folder: e.folder, image: e.image ?? null, video: e.video ?? null }
        ;(i.set(e.to, n),
          a[e.from] !== void 0 && ((a[e.to] = a[e.from]), delete a[e.from]),
          o.includes(e.from) && o.push(e.to),
          s === e.from && (s = e.to),
          e.folder.startsWith(`/`) && c.push(e.to))
      }
      return (
        e({
          items: r.items.map((e) => (i.has(e.id) ? i.get(e.id) : e)).filter((e) => i.has(e.id)),
          sel: a,
          deletedIds: o,
          currentId: s,
          proxy: {},
        }),
        c
      )
    },
    removeItems: (n) => {
      let r = t(),
        i = new Set(n)
      e({
        items: r.items.filter((e) => !i.has(e.id)),
        currentId: i.has(r.currentId ?? ``) ? null : r.currentId,
        multiSel: r.multiSel.filter((e) => !i.has(e)),
        sel: Object.fromEntries(Object.entries(r.sel).filter(([e]) => !i.has(e))),
        deletedIds: r.deletedIds.filter((e) => !i.has(e)),
        proxy: Object.fromEntries(Object.entries(r.proxy).filter(([e]) => !i.has(e))),
      })
    },
    markDeleted: (t) =>
      e((e) => {
        let n = new Set(e.deletedIds)
        return (t.forEach((e) => n.add(e)), { deletedIds: [...n] })
      }),
    unmarkDeleted: (t) =>
      e((e) => {
        let n = new Set(t)
        return { deletedIds: e.deletedIds.filter((e) => !n.has(e)) }
      }),
  }))
function Js(e, t) {
  return t && e > 24
}
function Ys(e, t, n, r) {
  return e.filter((e) => {
    if (t === `all`) return !0
    if (t === `deleted`) return r.has(e.id)
    if (r.has(e.id)) return !1
    let i = n[e.id]
    return t === `todo` ? !i : t === `keep` ? i === `keep` : t !== `drop` || i === `drop`
  })
}
function Xs(e, t) {
  if (!t) return e
  let n = new Map()
  for (let t of e) {
    let e = t.folder || `.`,
      r = n.get(e)
    r ? r.push(t) : n.set(e, [t])
  }
  let r = []
  return (n.forEach((e) => r.push(...e)), r)
}
function Zs(e, t, n) {
  let r = 0,
    i = 0,
    a = 0
  for (let o of e) {
    if (n.has(o.id)) {
      a++
      continue
    }
    let e = t[o.id]
    e === `keep` ? r++ : e === `drop` && i++
  }
  return { total: e.length, keep: r, drop: i, deleted: a, todo: e.length - r - i - a }
}
function Qs(e, t) {
  let n = []
  if (!t) {
    for (let t = 0; t < e.length; t++) n.push({ kind: `item`, item: e[t], visibleIndex: t })
    return n
  }
  let r = null,
    i = 0
  for (let t = 0; t < e.length; t++) {
    let a = e[t].folder || `.`
    ;(r !== null && a !== r && (n.push({ kind: `header`, folder: r, start: i, end: t }), (i = t)),
      n.push({ kind: `item`, item: e[t], visibleIndex: t }),
      (r = a))
  }
  return (r !== null && n.push({ kind: `header`, folder: r, start: i, end: e.length }), n)
}
function $s(e, t) {
  let n = new Map(),
    r = new Map()
  for (let t of e) t.kind === `header` && (r.set(t.folder, t.end - t.start), n.set(t.folder, 0))
  for (let r of e) {
    if (r.kind !== `item`) continue
    let e = r.item.folder || `.`
    n.has(e) && t.has(r.item.id) && n.set(e, (n.get(e) ?? 0) + 1)
  }
  let i = new Map()
  for (let [e, t] of r) {
    let r = n.get(e) ?? 0
    i.set(e, { loaded: r, total: t, ratio: t > 0 ? r / t : 0 })
  }
  return i
}
function q() {
  return (e) => ({ name: e })
}
var ec = {
  check_for_app_update: q()(`check_for_app_update`),
  download_and_install_app_update: q()(`download_and_install_app_update`),
  cancel_app_update_download: q()(`cancel_app_update_download`),
  restart_after_update: q()(`restart_after_update`),
  get_current_app_version: q()(`get_current_app_version`),
  mark_main_ready: q()(`mark_main_ready`),
  is_main_ready: q()(`is_main_ready`),
  list_startup_issues: q()(`list_startup_issues`),
  was_launched_at_login: q()(`was_launched_at_login`),
  scan_installed_apps: q()(`scan_installed_apps`),
  cancel_app_inventory_scan: q()(`cancel_app_inventory_scan`),
  get_cached_app_inventory: q()(`get_cached_app_inventory`),
  get_app_icon_base64: q()(`get_app_icon_base64`),
  launch_app: q()(`launch_app`),
  reveal_app_in_finder: q()(`reveal_app_in_finder`),
  authorize_mac_app: q()(`authorize_mac_app`),
  check_managed_app_updates: q()(`check_managed_app_updates`),
  upgrade_app: q()(`upgrade_app`),
  uninstall_app: q()(`uninstall_app`),
  batch_upgrade_apps: q()(`batch_upgrade_apps`),
  batch_uninstall_apps: q()(`batch_uninstall_apps`),
  install_app: q()(`install_app`),
  cancel_batch_operation: q()(`cancel_batch_operation`),
  check_all_app_updates: q()(`check_all_app_updates`),
  open_in_mac_app_store: q()(`open_in_mac_app_store`),
  open_in_mac_app_store_updates: q()(`open_in_mac_app_store_updates`),
  install_app_update: q()(`install_app_update`),
  cancel_app_update: q()(`cancel_app_update`),
  scan_dev_projects: q()(`scan_dev_projects`),
  cleanup_projects: q()(`cleanup_projects`),
  stop_scan: q()(`stop_scan`),
  get_custom_cleanup_commands: q()(`get_custom_cleanup_commands`),
  execute_custom_cleanup: q()(`execute_custom_cleanup`),
  stop_custom_cleanup: q()(`stop_custom_cleanup`),
  detect_env_tools: q()(`detect_env_tools`),
  get_system_info: q()(`get_system_info`),
  query_port_processes: q()(`query_port_processes`),
  kill_processes: q()(`kill_processes`),
  list_command_cards: q()(`list_command_cards`),
  save_command_cards: q()(`save_command_cards`),
  upsert_command_card: q()(`upsert_command_card`),
  delete_command_card: q()(`delete_command_card`),
  run_command_card: q()(`run_command_card`),
  cancel_command_card: q()(`cancel_command_card`),
  export_command_cards: q()(`export_command_cards`),
  import_command_cards: q()(`import_command_cards`),
  set_window_theme: q()(`set_window_theme`),
  get_account_manager_capabilities: q()(`get_account_manager_capabilities`),
  list_stations: q()(`list_stations`),
  create_station: q()(`create_station`),
  update_station: q()(`update_station`),
  delete_station: q()(`delete_station`),
  list_all_accounts: q()(`list_all_accounts`),
  create_account: q()(`create_account`),
  update_account: q()(`update_account`),
  delete_account: q()(`delete_account`),
  reveal_password: q()(`reveal_password`),
  set_password: q()(`set_password`),
  copy_password_to_clipboard: q()(`copy_password_to_clipboard`),
  open_login_window: q()(`open_login_window`),
  refresh_account: q()(`refresh_account`),
  refresh_station: q()(`refresh_station`),
  refresh_all: q()(`refresh_all`),
  export_relay_data: q()(`export_relay_data`),
  import_relay_data: q()(`import_relay_data`),
  reorder_stations: q()(`reorder_stations`),
  reorder_accounts: q()(`reorder_accounts`),
  detect_station_auth_profile: q()(`detect_station_auth_profile`),
  set_probe_strategy: q()(`set_probe_strategy`),
  reset_probe_strategy: q()(`reset_probe_strategy`),
  create_ephemeral_account: q()(`create_ephemeral_account`),
  set_session_ttl: q()(`set_session_ttl`),
  set_station_network_proxy: q()(`set_station_network_proxy`),
  set_account_proxy_enabled: q()(`set_account_proxy_enabled`),
  proxy_login: q()(`proxy_login`),
  handle_browser_open: q()(`handle_browser_open`),
  get_auth_proxy_inbox_status: q()(`get_auth_proxy_inbox_status`),
  drain_auth_proxy_request: q()(`drain_auth_proxy_request`),
  proxy_login_new_account: q()(`proxy_login_new_account`),
  list_external_apps: q()(`list_external_apps`),
  remove_external_app: q()(`remove_external_app`),
  list_external_app_bindings: q()(`list_external_app_bindings`),
  list_pricing_standards: q()(`list_pricing_standards`),
  create_pricing_standard: q()(`create_pricing_standard`),
  update_pricing_standard: q()(`update_pricing_standard`),
  delete_pricing_standard: q()(`delete_pricing_standard`),
  list_terminology_data: q()(`list_terminology_data`),
  create_industry: q()(`create_industry`),
  update_industry: q()(`update_industry`),
  delete_industry: q()(`delete_industry`),
  create_category: q()(`create_category`),
  update_category: q()(`update_category`),
  delete_category: q()(`delete_category`),
  create_subcategory: q()(`create_subcategory`),
  update_subcategory: q()(`update_subcategory`),
  delete_subcategory: q()(`delete_subcategory`),
  create_term: q()(`create_term`),
  update_term: q()(`update_term`),
  delete_term: q()(`delete_term`),
  set_term_pinned: q()(`set_term_pinned`),
  toggle_sleep_inhibitor: q()(`toggle_sleep_inhibitor`),
  get_sleep_inhibitor_state: q()(`get_sleep_inhibitor_state`),
  set_finder_show_hidden_files: q()(`set_finder_show_hidden_files`),
  set_finder_show_pathbar: q()(`set_finder_show_pathbar`),
  set_finder_show_statusbar: q()(`set_finder_show_statusbar`),
  set_finder_show_library_dir: q()(`set_finder_show_library_dir`),
  set_finder_show_file_extensions: q()(`set_finder_show_file_extensions`),
  set_finder_no_ds_store: q()(`set_finder_no_ds_store`),
  get_dock_orientation: q()(`get_dock_orientation`),
  set_dock_orientation: q()(`set_dock_orientation`),
  get_minimize_scale_enabled: q()(`get_minimize_scale_enabled`),
  set_minimize_scale_enabled: q()(`set_minimize_scale_enabled`),
  get_keyboard_fn_key_state: q()(`get_keyboard_fn_key_state`),
  set_keyboard_fn_key_state: q()(`set_keyboard_fn_key_state`),
  get_auto_correct_state: q()(`get_auto_correct_state`),
  set_auto_correct_state: q()(`set_auto_correct_state`),
  get_smart_quotes_state: q()(`get_smart_quotes_state`),
  set_smart_quotes_state: q()(`set_smart_quotes_state`),
  get_smart_dashes_state: q()(`get_smart_dashes_state`),
  set_smart_dashes_state: q()(`set_smart_dashes_state`),
  get_auto_capitalize_state: q()(`get_auto_capitalize_state`),
  set_auto_capitalize_state: q()(`set_auto_capitalize_state`),
  get_display_battery_percent: q()(`get_display_battery_percent`),
  set_display_battery_percent: q()(`set_display_battery_percent`),
  set_network_firewall_state: q()(`set_network_firewall_state`),
  set_network_ssh_state: q()(`set_network_ssh_state`),
  set_network_screen_sharing_state: q()(`set_network_screen_sharing_state`),
  set_network_airdrop_disabled: q()(`set_network_airdrop_disabled`),
  set_screenshot_format: q()(`set_screenshot_format`),
  set_screenshot_disable_shadow: q()(`set_screenshot_disable_shadow`),
  set_screenshot_show_thumbnail: q()(`set_screenshot_show_thumbnail`),
  set_screenshot_save_location: q()(`set_screenshot_save_location`),
  get_system_settings_snapshot: q()(`get_system_settings_snapshot`),
  lock_screen: q()(`lock_screen`),
  empty_trash: q()(`empty_trash`),
  sleep_now: q()(`sleep_now`),
  reboot_now: q()(`reboot_now`),
  shutdown_now: q()(`shutdown_now`),
  get_lock_screen_password_enabled: q()(`get_lock_screen_password_enabled`),
  set_lock_screen_password_enabled: q()(`set_lock_screen_password_enabled`),
  get_lock_screen_password_delay: q()(`get_lock_screen_password_delay`),
  set_lock_screen_password_delay: q()(`set_lock_screen_password_delay`),
  get_default_browser: q()(`get_default_browser`),
  set_default_browser: q()(`set_default_browser`),
  open_battery_settings: q()(`open_battery_settings`),
  open_control_center_settings: q()(`open_control_center_settings`),
  open_desktop_settings: q()(`open_desktop_settings`),
  open_keyboard_settings: q()(`open_keyboard_settings`),
  open_localization_settings: q()(`open_localization_settings`),
  open_lock_screen_settings: q()(`open_lock_screen_settings`),
  open_login_items_settings: q()(`open_login_items_settings`),
  open_network_settings: q()(`open_network_settings`),
  open_privacy_security_settings: q()(`open_privacy_security_settings`),
  reset_tcc_permission: q()(`reset_tcc_permission`),
  get_login_items: q()(`get_login_items`),
  remove_login_item: q()(`remove_login_item`),
  get_launch_agents: q()(`get_launch_agents`),
  get_launch_daemons: q()(`get_launch_daemons`),
  get_autostart_status: q()(`get_autostart_status`),
  set_autostart: q()(`set_autostart`),
  json_format: q()(`json_format`),
  base64_encode: q()(`base64_encode`),
  base64_decode: q()(`base64_decode`),
  generate_uuid: q()(`generate_uuid`),
  calculate_hash: q()(`calculate_hash`),
  timestamp_convert: q()(`timestamp_convert`),
  ping_host: q()(`ping_host`),
  port_check: q()(`port_check`),
  get_local_ip: q()(`get_local_ip`),
  get_wifi_info: q()(`get_wifi_info`),
  set_autohide_dock_state: q()(`set_autohide_dock_state`),
  set_autohide_menu_bar_state: q()(`set_autohide_menu_bar_state`),
  set_dock_show_recents_state: q()(`set_dock_show_recents_state`),
  set_hide_desktop_icons_state: q()(`set_hide_desktop_icons_state`),
  set_low_power_mode_state: q()(`set_low_power_mode_state`),
  set_screen_saver_state: q()(`set_screen_saver_state`),
  write_text_file: q()(`write_text_file`),
  set_tray_labels: q()(`set_tray_labels`),
  get_close_behavior: q()(`get_close_behavior`),
  set_close_behavior: q()(`set_close_behavior`),
  quit_app: q()(`quit_app`),
  hide_main_window: q()(`hide_main_window`),
  scan_storage_overview: q()(`scan_storage_overview`),
  scan_storage_stream: q()(`scan_storage_stream`),
  get_category_items: q()(`get_category_items`),
  execute_category_cleanup: q()(`execute_category_cleanup`),
  scan_custom_folder: q()(`scan_custom_folder`),
  open_system_storage_settings: q()(`open_system_storage_settings`),
  get_cleanup_records: q()(`get_cleanup_records`),
  add_cleanup_record: q()(`add_cleanup_record`),
  photo_triage_scan: q()(`photo_triage_scan`),
  photo_triage_scan_status: q()(`photo_triage_scan_status`),
  photo_triage_list_recent: q()(`photo_triage_list_recent`),
  photo_triage_open: q()(`photo_triage_open`),
  photo_triage_capabilities: q()(`photo_triage_capabilities`),
  photo_triage_ensure_proxy: q()(`photo_triage_ensure_proxy`),
  photo_triage_original_path: q()(`photo_triage_original_path`),
  photo_triage_trash: q()(`photo_triage_trash`),
  photo_triage_restore: q()(`photo_triage_restore`),
  photo_triage_move: q()(`photo_triage_move`),
  photo_triage_reveal: q()(`photo_triage_reveal`),
  photo_triage_prune: q()(`photo_triage_prune`),
  photo_triage_empty_dirs: q()(`photo_triage_empty_dirs`),
  photo_triage_delete_empty_dirs: q()(`photo_triage_delete_empty_dirs`),
  photo_triage_export: q()(`photo_triage_export`),
  get_network_probe_capabilities: q()(`get_network_probe_capabilities`),
  list_probe_nodes: q()(`list_probe_nodes`),
  get_network_probe_defaults: q()(`get_network_probe_defaults`),
  network_probe_save_defaults_override: q()(`network_probe_save_defaults_override`),
  network_probe_reset_defaults: q()(`network_probe_reset_defaults`),
  network_probe_list_capability_packs: q()(`network_probe_list_capability_packs`),
  network_probe_install_capability_pack: q()(`network_probe_install_capability_pack`),
  network_probe_uninstall_capability_pack: q()(`network_probe_uninstall_capability_pack`),
  network_probe_list_speed_sources: q()(`network_probe_list_speed_sources`),
  network_probe_run_speed_test: q()(`network_probe_run_speed_test`),
  network_probe_run_pollution_check: q()(`network_probe_run_pollution_check`),
  network_probe_whois: q()(`network_probe_whois`),
  network_probe_check_dnssec: q()(`network_probe_check_dnssec`),
  network_probe_scan_ports: q()(`network_probe_scan_ports`),
  network_probe_probe_nat: q()(`network_probe_probe_nat`),
  network_probe_probe_ntp: q()(`network_probe_probe_ntp`),
  network_probe_discover_lan: q()(`network_probe_discover_lan`),
  network_probe_browse_lan_services: q()(`network_probe_browse_lan_services`),
  network_probe_run_pcap_diag: q()(`network_probe_run_pcap_diag`),
  network_probe_compare_dns_multi: q()(`network_probe_compare_dns_multi`),
  network_probe_add_agent: q()(`network_probe_add_agent`),
  network_probe_remove_agent: q()(`network_probe_remove_agent`),
  network_probe_reject_agent_action: q()(`network_probe_reject_agent_action`),
  network_probe_install_capability_pack_verify_fail: q()(
    `network_probe_install_capability_pack_verify_fail`,
  ),
  get_local_network_summary: q()(`get_local_network_summary`),
  get_default_route: q()(`get_default_route`),
  tcp_connect: q()(`tcp_connect`),
  network_probe_ping_host: q()(`network_probe_ping_host`),
  network_probe_dns_lookup: q()(`network_probe_dns_lookup`),
  network_probe_probe_target: q()(`network_probe_probe_target`),
  network_probe_sites_probe: q()(`network_probe_sites_probe`),
  network_probe_sites_probe_custom: q()(`network_probe_sites_probe_custom`),
  network_probe_run_health_scan: q()(`network_probe_run_health_scan`),
  network_probe_cancel_scan: q()(`network_probe_cancel_scan`),
  network_probe_list_network_services: q()(`network_probe_list_network_services`),
  network_probe_flush_dns: q()(`network_probe_flush_dns`),
  network_probe_switch_dns: q()(`network_probe_switch_dns`),
  network_probe_renew_dhcp: q()(`network_probe_renew_dhcp`),
  network_probe_reset_network_stack: q()(`network_probe_reset_network_stack`),
  network_probe_detect_captive_portal: q()(`network_probe_detect_captive_portal`),
  network_probe_get_public_ip_info: q()(`network_probe_get_public_ip_info`),
  network_probe_get_proxy_vpn_status: q()(`network_probe_get_proxy_vpn_status`),
  network_probe_run_traceroute: q()(`network_probe_run_traceroute`),
  network_probe_check_ipv6_stack: q()(`network_probe_check_ipv6_stack`),
  network_probe_probe_path_mtu: q()(`network_probe_probe_path_mtu`),
  check_hosts_overrides: q()(`check_hosts_overrides`),
  get_firewall_status: q()(`get_firewall_status`),
  open_system_network_settings: q()(`open_system_network_settings`),
  ext_poc_open: q()(`ext_poc_open`),
  ext_poc_report: q()(`ext_poc_report`),
  ext_list_installed: q()(`ext_list_installed`),
  ext_open: q()(`ext_open`),
  ext_set_enabled: q()(`ext_set_enabled`),
}
function J(e) {
  return ec[e].name
}
var tc = {
    updater: {
      checkForAppUpdate: J(`check_for_app_update`),
      downloadAndInstallAppUpdate: J(`download_and_install_app_update`),
      cancelAppUpdateDownload: J(`cancel_app_update_download`),
      restartAfterUpdate: J(`restart_after_update`),
      getCurrentAppVersion: J(`get_current_app_version`),
    },
    bootstrap: {
      markMainReady: J(`mark_main_ready`),
      isMainReady: J(`is_main_ready`),
      listStartupIssues: J(`list_startup_issues`),
      wasLaunchedAtLogin: J(`was_launched_at_login`),
    },
    appManager: {
      scanInstalledApps: J(`scan_installed_apps`),
      cancelAppInventoryScan: J(`cancel_app_inventory_scan`),
      getCachedAppInventory: J(`get_cached_app_inventory`),
      getAppIconBase64: J(`get_app_icon_base64`),
      launchApp: J(`launch_app`),
      revealAppInFinder: J(`reveal_app_in_finder`),
      authorizeMacApp: J(`authorize_mac_app`),
      checkManagedAppUpdates: J(`check_managed_app_updates`),
      upgradeApp: J(`upgrade_app`),
      uninstallApp: J(`uninstall_app`),
      batchUpgradeApps: J(`batch_upgrade_apps`),
      batchUninstallApps: J(`batch_uninstall_apps`),
      installApp: J(`install_app`),
      cancelBatchOperation: J(`cancel_batch_operation`),
      checkAllAppUpdates: J(`check_all_app_updates`),
      openInMacAppStore: J(`open_in_mac_app_store`),
      openMacAppStoreUpdates: J(`open_in_mac_app_store_updates`),
      installAppUpdate: J(`install_app_update`),
      cancelAppUpdate: J(`cancel_app_update`),
    },
    devCleaner: {
      scanDevProjects: J(`scan_dev_projects`),
      cleanupProjects: J(`cleanup_projects`),
      stopScan: J(`stop_scan`),
      getCustomCleanupCommands: J(`get_custom_cleanup_commands`),
      executeCustomCleanup: J(`execute_custom_cleanup`),
      stopCustomCleanup: J(`stop_custom_cleanup`),
    },
    envDetector: { detectEnvTools: J(`detect_env_tools`) },
    portManager: {
      getSystemInfo: J(`get_system_info`),
      queryPortProcesses: J(`query_port_processes`),
      killProcesses: J(`kill_processes`),
    },
    networkProbe: {
      getCapabilities: J(`get_network_probe_capabilities`),
      listProbeNodes: J(`list_probe_nodes`),
      getDefaults: J(`get_network_probe_defaults`),
      saveDefaultsOverride: J(`network_probe_save_defaults_override`),
      resetDefaults: J(`network_probe_reset_defaults`),
      listCapabilityPacks: J(`network_probe_list_capability_packs`),
      installCapabilityPack: J(`network_probe_install_capability_pack`),
      installCapabilityPackVerifyFail: J(`network_probe_install_capability_pack_verify_fail`),
      uninstallCapabilityPack: J(`network_probe_uninstall_capability_pack`),
      listSpeedSources: J(`network_probe_list_speed_sources`),
      runSpeedTest: J(`network_probe_run_speed_test`),
      runPollutionCheck: J(`network_probe_run_pollution_check`),
      whois: J(`network_probe_whois`),
      checkDnssec: J(`network_probe_check_dnssec`),
      scanPorts: J(`network_probe_scan_ports`),
      probeNat: J(`network_probe_probe_nat`),
      probeNtp: J(`network_probe_probe_ntp`),
      discoverLan: J(`network_probe_discover_lan`),
      browseLanServices: J(`network_probe_browse_lan_services`),
      runPcapDiag: J(`network_probe_run_pcap_diag`),
      compareDnsMulti: J(`network_probe_compare_dns_multi`),
      addAgent: J(`network_probe_add_agent`),
      removeAgent: J(`network_probe_remove_agent`),
      rejectAgentAction: J(`network_probe_reject_agent_action`),
      getLocalNetworkSummary: J(`get_local_network_summary`),
      getDefaultRoute: J(`get_default_route`),
      tcpConnect: J(`tcp_connect`),
      pingHost: J(`network_probe_ping_host`),
      dnsLookup: J(`network_probe_dns_lookup`),
      probeTarget: J(`network_probe_probe_target`),
      sitesProbe: J(`network_probe_sites_probe`),
      sitesProbeCustom: J(`network_probe_sites_probe_custom`),
      runHealthScan: J(`network_probe_run_health_scan`),
      cancelScan: J(`network_probe_cancel_scan`),
      listNetworkServices: J(`network_probe_list_network_services`),
      flushDns: J(`network_probe_flush_dns`),
      switchDns: J(`network_probe_switch_dns`),
      renewDhcp: J(`network_probe_renew_dhcp`),
      resetNetworkStack: J(`network_probe_reset_network_stack`),
      detectCaptivePortal: J(`network_probe_detect_captive_portal`),
      getPublicIpInfo: J(`network_probe_get_public_ip_info`),
      getProxyVpnStatus: J(`network_probe_get_proxy_vpn_status`),
      runTraceroute: J(`network_probe_run_traceroute`),
      checkIpv6Stack: J(`network_probe_check_ipv6_stack`),
      probePathMtu: J(`network_probe_probe_path_mtu`),
      checkHostsOverrides: J(`check_hosts_overrides`),
      getFirewallStatus: J(`get_firewall_status`),
      openSystemNetworkSettings: J(`open_system_network_settings`),
    },
    commandCenter: {
      listCommandCards: J(`list_command_cards`),
      saveCommandCards: J(`save_command_cards`),
      upsertCommandCard: J(`upsert_command_card`),
      deleteCommandCard: J(`delete_command_card`),
      runCommandCard: J(`run_command_card`),
      cancelCommandCard: J(`cancel_command_card`),
      exportCommandCards: J(`export_command_cards`),
      importCommandCards: J(`import_command_cards`),
    },
    windowTheme: { setWindowTheme: J(`set_window_theme`) },
    accountManager: {
      getCapabilities: J(`get_account_manager_capabilities`),
      listStations: J(`list_stations`),
      createStation: J(`create_station`),
      updateStation: J(`update_station`),
      deleteStation: J(`delete_station`),
      listAllAccounts: J(`list_all_accounts`),
      createAccount: J(`create_account`),
      updateAccount: J(`update_account`),
      deleteAccount: J(`delete_account`),
      revealPassword: J(`reveal_password`),
      setPassword: J(`set_password`),
      copyPasswordToClipboard: J(`copy_password_to_clipboard`),
      openLoginWindow: J(`open_login_window`),
      refreshAccount: J(`refresh_account`),
      refreshStation: J(`refresh_station`),
      refreshAll: J(`refresh_all`),
      exportRelayData: J(`export_relay_data`),
      importRelayData: J(`import_relay_data`),
      reorderStations: J(`reorder_stations`),
      reorderAccounts: J(`reorder_accounts`),
      detectStationAuthProfile: J(`detect_station_auth_profile`),
      setProbeStrategy: J(`set_probe_strategy`),
      resetProbeStrategy: J(`reset_probe_strategy`),
      createEphemeralAccount: J(`create_ephemeral_account`),
      setSessionTtl: J(`set_session_ttl`),
      setStationNetworkProxy: J(`set_station_network_proxy`),
      setAccountProxyEnabled: J(`set_account_proxy_enabled`),
      proxyLogin: J(`proxy_login`),
      handleBrowserOpen: J(`handle_browser_open`),
      getAuthProxyInboxStatus: J(`get_auth_proxy_inbox_status`),
      drainAuthProxyRequest: J(`drain_auth_proxy_request`),
      proxyLoginNewAccount: J(`proxy_login_new_account`),
      listExternalApps: J(`list_external_apps`),
      removeExternalApp: J(`remove_external_app`),
      listExternalAppBindings: J(`list_external_app_bindings`),
    },
    tokenCalculator: {
      listPricingStandards: J(`list_pricing_standards`),
      createPricingStandard: J(`create_pricing_standard`),
      updatePricingStandard: J(`update_pricing_standard`),
      deletePricingStandard: J(`delete_pricing_standard`),
    },
    terminology: {
      listTerminologyData: J(`list_terminology_data`),
      createIndustry: J(`create_industry`),
      updateIndustry: J(`update_industry`),
      deleteIndustry: J(`delete_industry`),
      createCategory: J(`create_category`),
      updateCategory: J(`update_category`),
      deleteCategory: J(`delete_category`),
      createSubcategory: J(`create_subcategory`),
      updateSubcategory: J(`update_subcategory`),
      deleteSubcategory: J(`delete_subcategory`),
      createTerm: J(`create_term`),
      updateTerm: J(`update_term`),
      deleteTerm: J(`delete_term`),
      setTermPinned: J(`set_term_pinned`),
    },
    systemSettings: {
      toggleSleepInhibitor: J(`toggle_sleep_inhibitor`),
      getSleepInhibitorState: J(`get_sleep_inhibitor_state`),
      setFinderShowHiddenFiles: J(`set_finder_show_hidden_files`),
      setFinderShowPathbar: J(`set_finder_show_pathbar`),
      setFinderShowStatusbar: J(`set_finder_show_statusbar`),
      setFinderShowLibraryDir: J(`set_finder_show_library_dir`),
      setFinderShowFileExtensions: J(`set_finder_show_file_extensions`),
      setFinderNoDsStore: J(`set_finder_no_ds_store`),
      getDockOrientation: J(`get_dock_orientation`),
      setDockOrientation: J(`set_dock_orientation`),
      getMinimizeScaleEnabled: J(`get_minimize_scale_enabled`),
      setMinimizeScaleEnabled: J(`set_minimize_scale_enabled`),
      getKeyboardFnKeyState: J(`get_keyboard_fn_key_state`),
      setKeyboardFnKeyState: J(`set_keyboard_fn_key_state`),
      getAutoCorrectState: J(`get_auto_correct_state`),
      setAutoCorrectState: J(`set_auto_correct_state`),
      getSmartQuotesState: J(`get_smart_quotes_state`),
      setSmartQuotesState: J(`set_smart_quotes_state`),
      getSmartDashesState: J(`get_smart_dashes_state`),
      setSmartDashesState: J(`set_smart_dashes_state`),
      getAutoCapitalizeState: J(`get_auto_capitalize_state`),
      setAutoCapitalizeState: J(`set_auto_capitalize_state`),
      getDisplayBatteryPercent: J(`get_display_battery_percent`),
      setDisplayBatteryPercent: J(`set_display_battery_percent`),
      setNetworkFirewallState: J(`set_network_firewall_state`),
      setNetworkSshState: J(`set_network_ssh_state`),
      setNetworkScreenSharingState: J(`set_network_screen_sharing_state`),
      setNetworkAirdropDisabled: J(`set_network_airdrop_disabled`),
      setScreenshotFormat: J(`set_screenshot_format`),
      setScreenshotDisableShadow: J(`set_screenshot_disable_shadow`),
      setScreenshotShowThumbnail: J(`set_screenshot_show_thumbnail`),
      setScreenshotSaveLocation: J(`set_screenshot_save_location`),
      getSystemSettingsSnapshot: J(`get_system_settings_snapshot`),
      lockScreen: J(`lock_screen`),
      emptyTrash: J(`empty_trash`),
      sleepNow: J(`sleep_now`),
      rebootNow: J(`reboot_now`),
      shutdownNow: J(`shutdown_now`),
      getLockScreenPasswordEnabled: J(`get_lock_screen_password_enabled`),
      setLockScreenPasswordEnabled: J(`set_lock_screen_password_enabled`),
      getLockScreenPasswordDelay: J(`get_lock_screen_password_delay`),
      setLockScreenPasswordDelay: J(`set_lock_screen_password_delay`),
      getDefaultBrowser: J(`get_default_browser`),
      setDefaultBrowser: J(`set_default_browser`),
      openBatterySettings: J(`open_battery_settings`),
      openControlCenterSettings: J(`open_control_center_settings`),
      openDesktopSettings: J(`open_desktop_settings`),
      openKeyboardSettings: J(`open_keyboard_settings`),
      openLocalizationSettings: J(`open_localization_settings`),
      openLockScreenSettings: J(`open_lock_screen_settings`),
      openLoginItemsSettings: J(`open_login_items_settings`),
      openNetworkSettings: J(`open_network_settings`),
      openPrivacySecuritySettings: J(`open_privacy_security_settings`),
      resetTccPermission: J(`reset_tcc_permission`),
      getLoginItems: J(`get_login_items`),
      removeLoginItem: J(`remove_login_item`),
      getLaunchAgents: J(`get_launch_agents`),
      getLaunchDaemons: J(`get_launch_daemons`),
      getAutostartStatus: J(`get_autostart_status`),
      setAutostart: J(`set_autostart`),
      jsonFormat: J(`json_format`),
      base64Encode: J(`base64_encode`),
      base64Decode: J(`base64_decode`),
      generateUuid: J(`generate_uuid`),
      calculateHash: J(`calculate_hash`),
      timestampConvert: J(`timestamp_convert`),
      pingHost: J(`ping_host`),
      portCheck: J(`port_check`),
      getLocalIp: J(`get_local_ip`),
      getWifiInfo: J(`get_wifi_info`),
      setAutohideDockState: J(`set_autohide_dock_state`),
      setAutohideMenuBarState: J(`set_autohide_menu_bar_state`),
      setDockShowRecentsState: J(`set_dock_show_recents_state`),
      setHideDesktopIconsState: J(`set_hide_desktop_icons_state`),
      setLowPowerModeState: J(`set_low_power_mode_state`),
      setScreenSaverState: J(`set_screen_saver_state`),
    },
    fileOps: { writeTextFile: J(`write_text_file`) },
    tray: { setTrayLabels: J(`set_tray_labels`) },
    appPreferences: {
      getCloseBehavior: J(`get_close_behavior`),
      setCloseBehavior: J(`set_close_behavior`),
      quitApp: J(`quit_app`),
      hideMainWindow: J(`hide_main_window`),
    },
    cleanSpace: {
      scanStorageOverview: J(`scan_storage_overview`),
      scanStorageStream: J(`scan_storage_stream`),
      getCategoryItems: J(`get_category_items`),
      executeCategoryCleanup: J(`execute_category_cleanup`),
      scanCustomFolder: J(`scan_custom_folder`),
      openSystemStorageSettings: J(`open_system_storage_settings`),
      getCleanupRecords: J(`get_cleanup_records`),
      addCleanupRecord: J(`add_cleanup_record`),
    },
    photoTriage: {
      scan: J(`photo_triage_scan`),
      scanStatus: J(`photo_triage_scan_status`),
      listRecent: J(`photo_triage_list_recent`),
      open: J(`photo_triage_open`),
      capabilities: J(`photo_triage_capabilities`),
      ensureProxy: J(`photo_triage_ensure_proxy`),
      originalPath: J(`photo_triage_original_path`),
      trash: J(`photo_triage_trash`),
      restore: J(`photo_triage_restore`),
      move: J(`photo_triage_move`),
      reveal: J(`photo_triage_reveal`),
      prune: J(`photo_triage_prune`),
      emptyDirs: J(`photo_triage_empty_dirs`),
      deleteEmptyDirs: J(`photo_triage_delete_empty_dirs`),
      export: J(`photo_triage_export`),
    },
    extensionHost: {
      openPoc: J(`ext_poc_open`),
      reportPoc: J(`ext_poc_report`),
      listInstalled: J(`ext_list_installed`),
      open: J(`ext_open`),
      setEnabled: J(`ext_set_enabled`),
    },
  },
  nc = {
    updater: { download: `app-updater-download` },
    envDetector: { scanDone: `env-scan-done` },
    menu: { event: `menu-event` },
    appUpdateInstall: {
      progress: `app-update-install:progress`,
      finished: `app-update-install:finished`,
    },
    customCleanup: { progress: `custom-cleanup:progress`, completed: `custom-cleanup:completed` },
    cleanSpace: {
      scanStart: `clean-space:scan-start`,
      scanCategory: `clean-space:scan-category`,
      scanComplete: `clean-space:scan-complete`,
    },
    photoTriage: { scanProgress: `photo-triage:scan-progress`, scanDone: `photo-triage:scan-done` },
    appPreferences: { showCloseBehaviorDialog: `show-close-behavior-dialog` },
    accountManager: { authProxyPending: `account-manager:auth-proxy-pending` },
    networkProbe: {
      healthItem: `network-probe:health-item`,
      tracerouteHop: `network-probe:traceroute-hop`,
      scanSession: `network-probe:scan-session`,
      siteSample: `network-probe:site-sample`,
      pingSample: `network-probe:ping-sample`,
      packProgress: `network-probe:pack-progress`,
      speedSample: `network-probe:speed-sample`,
      portSample: `network-probe:port-sample`,
    },
  }
function rc() {
  try {
    return Hs()
  } catch {
    return !1
  }
}
function ic() {
  let e = navigator.userAgent.toLowerCase()
  if (e.includes(`mac os`) || e.includes(`macintosh`)) return `macos`
  if (e.includes(`windows`) || e.includes(`win64`)) return `windows`
  if (e.includes(`linux`)) return `linux`
  let t = navigator.platform.toLowerCase()
  return t.includes(`mac`) ? `macos` : t.includes(`win`) ? `windows` : `linux`
}
var ac = {
    macos: {
      killCommand: `kill -9`,
      killHintTemplate: `kill -9 PID {{pid}}`,
      freePortCommandTemplate: `lsof -ti :{{port}} | xargs kill -9`,
      portsCommand: `lsof -i :{{port}}`,
    },
    linux: {
      killCommand: `kill -9`,
      killHintTemplate: `kill -9 PID {{pid}}`,
      freePortCommandTemplate: `lsof -ti :{{port}} | xargs kill -9`,
      portsCommand: `lsof -i :{{port}}`,
    },
    windows: {
      killCommand: `taskkill /F`,
      killHintTemplate: `taskkill /PID {{pid}} /F`,
      freePortCommandTemplate: `netstat -ano | findstr :{{port}} → taskkill /F`,
      portsCommand: `netstat -ano | findstr :{{port}}`,
    },
  },
  oc = {
    macos: {
      revealActionLabel: `appManager.actionRevealMacos`,
      fileManagerName: `Finder`,
      packageManagers: [`brew`],
      primaryPackageManager: `brew`,
    },
    linux: {
      revealActionLabel: `appManager.actionRevealLinux`,
      fileManagerName: `File Manager`,
      packageManagers: [`flatpak`, `snap`, `apt`],
      primaryPackageManager: null,
    },
    windows: {
      revealActionLabel: `appManager.actionRevealWindows`,
      fileManagerName: `Explorer`,
      packageManagers: [`winget`],
      primaryPackageManager: `winget`,
    },
  },
  sc = ic()
;(ac[sc], oc[sc])
function cc() {
  return rc() ? `desktop` : `browser`
}
function lc(e) {
  switch (e) {
    case `desktop-feature`:
    case `tauri-command`:
    case `tauri-dialog`:
    case `tauri-event`:
    case `tauri-shell`:
    case `tauri-window`:
      return cc() === `desktop`
  }
}
function uc() {
  return lc(`tauri-dialog`)
}
function dc() {
  return lc(`tauri-event`)
}
var fc = `modulepreload`,
  pc = function (e, t) {
    return new URL(e, t).href
  },
  mc = {},
  hc = function (e, t, n) {
    let r = Promise.resolve()
    if (t && t.length > 0) {
      let e = document.getElementsByTagName(`link`),
        i = document.querySelector(`meta[property=csp-nonce]`),
        a = i?.nonce || i?.getAttribute(`nonce`)
      function o(e) {
        return Promise.all(
          e.map((e) =>
            Promise.resolve(e).then(
              (e) => ({ status: `fulfilled`, value: e }),
              (e) => ({ status: `rejected`, reason: e }),
            ),
          ),
        )
      }
      function s(e) {
        return import.meta.resolve ? import.meta.resolve(e) : new URL(e, import.meta.url).href
      }
      r = o(
        t.map((t) => {
          if (((t = pc(t, n)), (t = s(t)), t in mc)) return
          mc[t] = !0
          let r = t.endsWith(`.css`)
          for (let n = e.length - 1; n >= 0; n--) {
            let i = e[n]
            if (i.href === t && (!r || i.rel === `stylesheet`)) return
          }
          let i = document.createElement(`link`)
          if (
            ((i.rel = r ? `stylesheet` : fc),
            r || (i.as = `script`),
            (i.crossOrigin = ``),
            (i.href = t),
            a && i.setAttribute(`nonce`, a),
            document.head.appendChild(i),
            r)
          )
            return new Promise((e, n) => {
              ;(i.addEventListener(`load`, e),
                i.addEventListener(`error`, () => n(Error(`Unable to preload CSS for ${t}`))))
            })
        }),
      )
    }
    function i(e) {
      let t = new Event(`vite:preloadError`, { cancelable: !0 })
      if (((t.payload = e), window.dispatchEvent(t), !t.defaultPrevented)) throw e
    }
    return r.then((t) => {
      for (let e of t || []) e.status === `rejected` && i(e.reason)
      return e().catch(i)
    })
  }
async function gc(e, t, n) {
  if (!dc()) return () => {}
  let { listen: r } = await hc(
    async () => {
      let { listen: e } = await import(`./event-BkKvlweQ.js`)
      return { listen: e }
    },
    [],
    import.meta.url,
  )
  return r(e, t, n)
}
var _c = `UNKNOWN`
function vc(e) {
  return (
    typeof e == `object` &&
    !!e &&
    `code` in e &&
    typeof e.code == `string` &&
    `message` in e &&
    typeof e.message == `string`
  )
}
function yc(e) {
  if (vc(e)) return { code: e.code, message: e.message }
  if (e instanceof Error) return { code: _c, message: e.message }
  if (typeof e == `string`) return { code: _c, message: e }
  if (typeof e == `object` && e && typeof e.message == `string`) {
    let t = e.code
    return { code: typeof t == `string` ? t : _c, message: e.message }
  }
  return { code: _c, message: String(e) }
}
function bc(e, t) {
  let n = yc(e).message
  return n && n.trim() ? n : (t ?? n)
}
function xc(e, ...t) {
  return Bs(e, t[0])
}
function Sc(e) {
  return xc(tc.photoTriage.scan, { src: e })
}
function Cc() {
  return xc(tc.photoTriage.listRecent)
}
function wc(e) {
  return xc(tc.photoTriage.open, { src: e })
}
function Tc() {
  return xc(tc.photoTriage.capabilities)
}
function Ec(e, t) {
  return xc(tc.photoTriage.ensureProxy, { id: e, kind: t })
}
function Dc(e) {
  return xc(tc.photoTriage.trash, { ids: e })
}
function Oc(e) {
  return xc(tc.photoTriage.restore, { ids: e })
}
function kc(e, t) {
  return xc(tc.photoTriage.move, { ids: e, target: t })
}
function Ac(e) {
  return xc(tc.photoTriage.reveal, { path: e })
}
function jc() {
  return xc(tc.photoTriage.prune)
}
function Mc() {
  return xc(tc.photoTriage.emptyDirs)
}
function Nc(e) {
  return xc(tc.photoTriage.deleteEmptyDirs, { paths: e })
}
function Pc(e) {
  return `photo-triage:state:${e || ``}`
}
function Fc(e) {
  return `photo-triage:folders:${e || ``}`
}
function Ic(e) {
  return `photo-triage:moved:${e || ``}`
}
function Lc() {
  let e = K.getState()
  if (e.source)
    try {
      localStorage.setItem(
        Pc(e.source),
        JSON.stringify({
          sel: e.sel,
          deletedIds: e.deletedIds,
          groupBy: e.groupBy,
          autoNext: e.autoNext,
          filter: e.filter,
          folderCandidates: e.folderCandidates,
          movedCounts: e.movedCounts,
        }),
      )
    } catch {}
}
function Rc() {
  let e = K.getState()
  if (e.source)
    try {
      ;(localStorage.setItem(Fc(e.source), JSON.stringify(e.folderCandidates)),
        localStorage.setItem(Ic(e.source), JSON.stringify(e.movedCounts)))
    } catch {}
}
function zc(e) {
  let t = K.getState(),
    n = new Set(e.map((e) => e.id)),
    r = (e) => e.filter((e) => n.has(e.id))
  try {
    let e = localStorage.getItem(Pc(t.source))
    if (e) {
      let i = JSON.parse(e)
      if (i.sel) {
        let e = Object.fromEntries(Object.entries(i.sel).filter(([e]) => n.has(e)))
        K.setState({ sel: e })
      }
      if (
        (Array.isArray(i.deletedIds) &&
          K.setState({ deletedIds: r(i.deletedIds.map((e) => ({ id: e }))).map((e) => e.id) }),
        typeof i.groupBy == `boolean` && K.setState({ groupBy: i.groupBy }),
        i.autoNext === !1 ? K.setState({ autoNext: !1 }) : K.setState({ autoNext: !0 }),
        typeof i.filter == `string` &&
          [`all`, `todo`, `keep`, `drop`, `deleted`].includes(i.filter) &&
          K.setState({ filter: i.filter }),
        Array.isArray(i.folderCandidates))
      ) {
        let e = i.folderCandidates
          .filter((e) => typeof e == `string` && e)
          .map((e) =>
            e.startsWith(`/`) || e.startsWith(`~`)
              ? e
              : (t.source.replace(/\/+$/, ``) || ``) + `/` + e,
          )
        K.setState({ folderCandidates: [...new Set(e)] })
      }
      i.movedCounts &&
        typeof i.movedCounts == `object` &&
        K.setState({ movedCounts: i.movedCounts })
    }
  } catch {}
}
var Bc = []
async function Vc() {
  try {
    let e = await Cc()
    K.getState().setRecent(e)
  } catch (e) {
    K.getState().setLoadError(bc(e))
  }
}
async function Hc() {
  try {
    let e = await Tc()
    K.getState().setCapabilities(e)
  } catch (e) {
    console.warn(`[photo-triage] loadCapabilities failed:`, bc(e))
  }
}
async function Uc() {
  let { openPlatformDialog: e } = await hc(
      async () => {
        let { openPlatformDialog: e } = await import(`./dialog-BqrUsF5g.js`)
        return { openPlatformDialog: e }
      },
      [],
      import.meta.url,
    ),
    t = await e({ directory: !0, multiple: !1 }),
    n = Array.isArray(t) ? (t[0] ?? null) : t
  return typeof n == `string` ? n : null
}
async function Wc(e) {
  let t = K.getState()
  if (t.scanning) return !1
  ;(t.setScanning(!0), t.setLoadError(null))
  for (let e of Bc) e()
  ;((Bc = []),
    (Bc = [
      await gc(nc.photoTriage.scanProgress, (e) => {
        K.getState().setScanStatus(e.payload)
      }),
      await gc(nc.photoTriage.scanDone, async (t) => {
        let n = t.payload,
          r = K.getState()
        ;(r.setScanStatus(n),
          r.setScanning(!1),
          n.error ? r.setLoadError(n.error) : await Kc(e, { fromScan: !0 }))
      }),
    ]))
  try {
    return (await Sc(e), !0)
  } catch (e) {
    ;(K.getState().setScanning(!1), K.getState().setLoadError(bc(e)))
    for (let e of Bc) e()
    return ((Bc = []), !1)
  }
}
function Gc() {
  ;(Lc(), K.setState({ view: `welcome`, loadError: null }))
}
async function Kc(e, t) {
  try {
    let t = await wc(e)
    return (K.getState().openAlbum(t.source || e, t.items), zc(t.items), Lc(), await Vc(), !0)
  } catch (e) {
    return (K.getState().setLoadError(bc(e)), t?.fromScan || K.getState().setView(`welcome`), !1)
  }
}
function qc(e, t) {
  let n = K.getState()
  if (!n.items.find((t) => t.id === e) || n.deletedIds.includes(e)) return
  let r = n.sel[e],
    i = r !== t
  if ((n.pushHistory({ id: e, prev: r }), n.setSel(e, t), Lc(), n.autoNext && i)) {
    let t = n.items.findIndex((t) => t.id === e),
      r = n.items.length ? (((t + 1) % n.items.length) + n.items.length) % n.items.length : -1
    r >= 0 && n.setCurrent(n.items[r].id)
  }
}
function Jc() {
  let e = K.getState(),
    t = e.popHistory()
  if (t) {
    if (t.prev === void 0) {
      let n = { ...e.sel }
      ;(delete n[t.id], K.setState({ sel: n }))
    } else K.setState({ sel: { ...e.sel, [t.id]: t.prev } })
    ;(Lc(), e.items.some((e) => e.id === t.id) && e.setCurrent(t.id))
  }
}
function Yc(e) {
  let t = K.getState()
  if (!t.items.length) return
  let n = {}
  ;(t.items.forEach((r) => {
    t.deletedIds.includes(r.id) || (n[r.id] = e)
  }),
    t.setSelAll(n),
    t.resetHistory(),
    Lc())
}
function Xc() {
  let e = K.getState(),
    t = new Set(e.deletedIds),
    n = e.items.filter((n) => e.sel[n.id] === `keep` && !t.has(n.id)).map((e) => e.id),
    r = e.items.filter((n) => e.sel[n.id] === `drop` && !t.has(n.id)).map((e) => e.id)
  if (!n.length && !r.length) return null
  try {
    let t = new Blob([JSON.stringify({ source: e.source, keeps: n, drops: r }, null, 2)], {
        type: `application/json`,
      }),
      i = document.createElement(`a`)
    ;((i.href = URL.createObjectURL(t)),
      (i.download = `selection.json`),
      i.click(),
      URL.revokeObjectURL(i.href))
  } catch (e) {
    throw (console.error(`[photo-triage] export selection.json failed:`, e), e)
  }
  return { keeps: n.length, drops: r.length }
}
async function Zc(e, t) {
  let n = K.getState(),
    r = `${e}:${t}`,
    i = n.proxy[r]
  if (i) return i
  try {
    let i = await Ec(e, t)
    return i.path ? (n.setProxy(r, i.path), i.path) : null
  } catch {
    return null
  }
}
var Qc = 8,
  $c = 0,
  el = []
function tl() {
  for (; $c < Qc && el.length;) {
    let e = el.shift()
    ;($c++,
      Ec(e.id, e.kind)
        .then((t) => {
          ;(t.path && K.getState().setProxy(`${e.id}:${e.kind}`, t.path), e.resolve(t.path ?? null))
        })
        .catch(() => e.resolve(null))
        .finally(() => {
          ;($c--, tl())
        }))
  }
}
function nl(e, t) {
  let n = K.getState(),
    r = `${e}:${t}`,
    i = n.proxy[r]
  return i
    ? Promise.resolve(i)
    : new Promise((n) => {
        ;(el.push({ id: e, kind: t, resolve: n }), tl())
      })
}
function rl() {
  let e = K.getState()
  return e.multiSel.length ? e.multiSel : e.currentId ? [e.currentId] : []
}
function il(e) {
  let t = K.getState(),
    n = e.filter((e) => !t.deletedIds.includes(e.id)).map((e) => e.id)
  t.setMulti(n)
}
async function al(e, t) {
  let n = K.getState(),
    r = e.filter((e) => n.items.some((t) => t.id === e) && !n.deletedIds.includes(e))
  if (!r.length) return !1
  try {
    let e = (await kc(r, t)).items ?? []
    if (!e.length) return !1
    let i = n.applyMoveUpdates(e)
    return (
      i.length && n.removeItems(i),
      n.clearMulti(),
      n.bumpMovedCount(t, e.length),
      Lc(),
      Rc(),
      !0
    )
  } catch {
    return !1
  }
}
async function ol(e) {
  try {
    return (await Ac(e), !0)
  } catch {
    return !1
  }
}
async function sl(e) {
  let t = K.getState()
  try {
    let n = await Dc(e),
      r = new Set((n.moved ?? []).map((e) => e.from)),
      i = new Map(t.items.map((e) => [e.id, e])),
      a = []
    for (let t of e) {
      let e = i.get(t)
      if (!e) continue
      let n = [e.image, e.video].filter((e) => !!e)
      n.length && n.every((e) => r.has(e)) && a.push(t)
    }
    return (
      a.length && (t.markDeleted(a), Lc()),
      { ok: !0, count: n.count ?? 0, errorCount: (n.errors ?? []).length }
    )
  } catch {
    return { ok: !1, count: 0, errorCount: 0 }
  }
}
async function cl(e) {
  let t = K.getState()
  try {
    let n = await Oc(e),
      r = new Set((n.restored ?? []).map((e) => e.to)),
      i = [],
      a = new Map(t.items.map((e) => [e.id, e]))
    for (let t of e) {
      let e = a.get(t)
      if (!e) continue
      let o = [e.image, e.video].filter((e) => !!e),
        s = (n.errors ?? []).some((e) => o.includes(e.path))
      o.length && o.every((e) => r.has(e)) && !s && i.push(t)
    }
    if (i.length) {
      t.unmarkDeleted(i)
      let e = { ...t.sel }
      ;(i.forEach((t) => {
        e[t] || (e[t] = `keep`)
      }),
        K.setState({ sel: e }),
        Lc())
    }
    return { ok: !0, count: n.count ?? 0, errorCount: (n.errors ?? []).length }
  } catch {
    return { ok: !1, count: 0, errorCount: 0 }
  }
}
async function ll() {
  try {
    let e = await jc()
    return { removed: e.removed ?? 0, kept: e.kept ?? 0 }
  } catch (e) {
    return (console.warn(`[photo-triage] prune failed:`, bc(e)), null)
  }
}
async function ul() {
  try {
    return (await Mc()).dirs ?? []
  } catch {
    return null
  }
}
async function dl(e) {
  try {
    let t = await Nc(e)
    return { count: t.count ?? 0, errorCount: (t.errors ?? []).length }
  } catch (t) {
    return (
      console.warn(`[photo-triage] deleteEmptyDirs failed:`, bc(t)),
      { count: 0, errorCount: e.length }
    )
  }
}
function fl(e) {
  if (!e) return null
  try {
    return Vs(e)
  } catch {
    return e
  }
}
function pl(e) {
  return e.replace(/^\/Users\/[^/]+/, `~`)
}
function ml() {
  let e = K((e) => e.view),
    t = K((e) => e.items),
    n = K((e) => e.source),
    r = K((e) => e.recent),
    i = K((e) => e.sel),
    a = K((e) => e.deletedIds),
    o = K((e) => e.filter),
    s = K((e) => e.groupBy),
    c = K((e) => e.autoNext),
    l = K((e) => e.liveView),
    u = K((e) => e.currentId),
    d = K((e) => e.multiSel),
    f = K((e) => e.lastPickId),
    p = K((e) => e.folderCandidates),
    m = K((e) => e.movedCounts),
    h = K((e) => e.scanning),
    g = K((e) => e.scanStatus),
    v = K((e) => e.capabilities),
    y = K((e) => e.loaded),
    b = K((e) => e.loadError),
    x = K((e) => e.proxy),
    S = K((e) => e.dragActive),
    C = (0, _.useMemo)(() => new Set(a), [a]),
    w = (0, _.useMemo)(() => Xs(Ys(t, o, i, C), s), [t, o, i, C, s]),
    T = (0, _.useMemo)(() => Qs(w, s), [w, s]),
    E = (0, _.useMemo)(() => T.filter((e) => e.kind === `header`).length, [T]),
    ee = (0, _.useMemo)(() => Zs(t, i, C), [t, i, C]),
    te = Js(w.length, s),
    ne = (0, _.useMemo)(() => t.find((e) => e.id === u) ?? null, [t, u]),
    re = (0, _.useMemo)(() => w.findIndex((e) => e.id === u), [w, u]),
    D = (0, _.useCallback)((e) => {
      ;(K.getState().setFilter(e), Lc())
    }, []),
    O = (0, _.useCallback)(() => {
      let e = [`all`, `todo`, `keep`, `drop`, `deleted`],
        t = e[(e.indexOf(o) + 1) % e.length]
      D(t)
    }, [o, D]),
    ie = (0, _.useCallback)(() => {
      let e = K.getState()
      ;(e.setGroupBy(!e.groupBy), Lc())
    }, []),
    ae = (0, _.useCallback)(() => {
      let e = K.getState()
      ;(e.setAutoNext(!e.autoNext), Lc())
    }, []),
    k = (0, _.useCallback)(
      (e) => {
        if (!w.length) return
        let t = w.findIndex((e) => e.id === u),
          n = ((t >= 0 ? t : 0) + e + w.length) % w.length
        K.getState().setCurrent(w[n].id)
      },
      [w, u],
    ),
    A = (0, _.useCallback)(() => {
      if (!w.length) return
      let e = K.getState(),
        t = w.findIndex((t) => t.id === e.currentId),
        n = t >= 0 ? t : -1
      for (let t = 1; t <= w.length; t++) {
        let r = w[(n + t + w.length) % w.length]
        if (!e.sel[r.id] && !e.deletedIds.includes(r.id)) {
          e.setCurrent(r.id)
          return
        }
      }
      k(1)
    }, [w, k]),
    j = (0, _.useCallback)(
      (e) => {
        let t = K.getState().currentId
        t && (qc(t, e), c && A())
      },
      [c, A],
    ),
    oe = (0, _.useCallback)(() => Jc(), []),
    se = (0, _.useCallback)((e) => {
      K.getState().setCurrent(e)
    }, []),
    ce = (0, _.useCallback)(() => {
      let e = K.getState()
      e.setLiveView(e.liveView === `motion` ? `photo` : `motion`)
    }, []),
    M = (0, _.useCallback)((e) => {
      let t = K.getState()
      ;(t.toggleMulti(e), t.setLastPick(e))
    }, []),
    N = (0, _.useCallback)(
      (e) => {
        let t = K.getState(),
          n = t.lastPickId,
          r = w.findIndex((e) => e.id === n),
          i = w.findIndex((t) => t.id === e)
        if (r < 0 || i < 0) return
        let a = w
          .slice(Math.min(r, i), Math.max(r, i) + 1)
          .filter((e) => !t.deletedIds.includes(e.id))
          .map((e) => e.id)
        ;(t.setMulti(a), t.setLastPick(e))
      },
      [w],
    )
  return {
    view: e,
    items: t,
    source: n,
    recent: r,
    sel: i,
    deletedIds: a,
    deletedSet: C,
    filter: o,
    groupBy: s,
    autoNext: c,
    liveView: l,
    currentId: u,
    multiSel: d,
    lastPickId: f,
    folderCandidates: p,
    movedCounts: m,
    scanning: h,
    scanStatus: g,
    capabilities: v,
    loaded: y,
    loadError: b,
    proxy: x,
    dragActive: S,
    visible: w,
    rows: T,
    groupCount: E,
    stats: ee,
    showGroupBar: te,
    current: ne,
    currentIndex: re,
    setFilter: D,
    cycleFilter: O,
    toggleGroup: ie,
    toggleAutoNext: ae,
    nav: k,
    gotoNextTodo: A,
    markCurrent: j,
    undo: oe,
    show: se,
    toggleLive: ce,
    selectCurrent: (0, _.useCallback)(
      (e, t) => {
        let n = K.getState()
        if (t?.toggle) {
          M(e)
          return
        }
        if (t?.range && n.lastPickId) {
          N(e)
          return
        }
        ;(n.multiSel.length && n.clearMulti(), n.setLastPick(e), se(e))
      },
      [M, N, se],
    ),
    selectAll: (0, _.useCallback)(() => {
      let e = K.getState(),
        t = w.filter((t) => !e.deletedIds.includes(t.id))
      t.length && (t.every((t) => e.multiSel.includes(t.id)) ? e.clearMulti() : il(w))
    }, [w]),
    allSelected: (0, _.useMemo)(() => {
      if (!w.length) return !1
      let e = w.filter((e) => !C.has(e.id))
      return e.length > 0 && e.every((e) => d.includes(e.id))
    }, [w, C, d]),
    moveToFolder: (0, _.useCallback)(async (e, t) => {
      let n = t?.length ? t : rl()
      return n.length
        ? (await al(n, e))
          ? { ok: !0, reason: `ok`, count: n.length }
          : { ok: !1, reason: `failed`, count: 0 }
        : { ok: !1, reason: `empty`, count: 0 }
    }, []),
  }
}
function hl(e) {
  let { t } = Ft(),
    {
      nav: n,
      markCurrent: r,
      undo: i,
      toggleLive: a,
      cycleFilter: o,
      toggleGroup: s,
      selectAll: c,
      moveToFolder: l,
      folderCandidates: u,
      deletedIds: d,
    } = e
  ;(0, _.useEffect)(() => {
    let f = (f) => {
      let p = f.target
      if (p && (p.tagName === `INPUT` || p.tagName === `TEXTAREA`)) return
      let m = K.getState()
      if ((f.metaKey || f.ctrlKey) && (f.key === `a` || f.key === `A`)) {
        ;(f.preventDefault(), c())
        let e = K.getState().multiSel.length
        e && k(t(`photoTriage.selectedAll`, { count: e }))
        return
      }
      if (!(f.metaKey || f.ctrlKey || f.altKey))
        switch (f.key) {
          case `ArrowLeft`:
            n(-1)
            break
          case `ArrowRight`:
            n(1)
            break
          case `k`:
          case `K`:
            r(`keep`)
            break
          case `d`:
          case `D`:
            r(`drop`)
            break
          case `u`:
          case `U`:
            i()
            break
          case `r`:
          case `R`: {
            let e = K.getState().currentId
            e &&
              d.includes(e) &&
              cl([e]).then((e) => {
                e.ok && k(t(`photoTriage.restored`, { count: e.count }))
              })
            break
          }
          case `0`:
            e.gotoNextTodo()
            break
          case `l`:
          case `L`:
            a()
            break
          case `g`:
          case `G`:
            s()
            break
          case `f`:
          case `F`:
            o()
            break
          case `Escape`:
            if ((m.helpOpen && m.setHelpOpen(!1), m.emptyDirsOpen)) {
              m.setEmptyDirsOpen(!1)
              break
            }
            m.multiSel.length && m.clearMulti()
            break
          case `?`:
          case `/`:
            m.setHelpOpen(!0)
            break
          case ` `:
            f.preventDefault()
            break
          case `1`:
          case `2`:
          case `3`:
          case `4`:
          case `5`:
          case `6`:
          case `7`:
          case `8`:
          case `9`: {
            let e = u[Number(f.key) - 1]
            e && l(e)
            break
          }
        }
    }
    return (window.addEventListener(`keydown`, f), () => window.removeEventListener(`keydown`, f))
  }, [n, r, i, a, o, s, c, l, u, d])
}
function gl() {
  let e = (0, _.useRef)(!1),
    [t, n] = (0, _.useState)(!1)
  return {
    pending: t,
    run: (0, _.useCallback)(async (t) => {
      if (!e.current) {
        ;((e.current = !0), n(!0))
        try {
          await t()
        } finally {
          ;((e.current = !1), n(!1))
        }
      }
    }, []),
  }
}
function _l({ controller: e }) {
  let { t } = Ft(),
    { recent: n, scanning: r, scanStatus: i, loadError: a, capabilities: o } = e,
    { pending: s, run: c } = gl(),
    l = (0, _.useRef)(!1)
  ;(0, _.useEffect)(() => {
    l.current || ((l.current = !0), Vc(), Hc())
  }, [])
  let u = () =>
      c(async () => {
        let e = await Uc()
        e && (await Wc(e))
      }),
    d = (e) =>
      c(async () => {
        await Kc(e)
      }),
    f = s || r
  return (0, L.jsxs)(`div`, {
    className: `flex h-full flex-col items-center justify-center gap-6 p-8`,
    children: [
      (0, L.jsxs)(`div`, {
        className: `flex flex-col items-center gap-3 text-center`,
        children: [
          (0, L.jsx)(`div`, {
            className: `bg-primary/10 flex size-14 items-center justify-center rounded-2xl`,
            children: (0, L.jsx)(en, { size: 28, className: `text-primary` }),
          }),
          (0, L.jsx)(`h1`, {
            className: `text-2xl font-semibold`,
            children: t(`photoTriage.title`),
          }),
          (0, L.jsx)(`p`, {
            className: `text-muted-foreground max-w-md text-sm`,
            children: t(`photoTriage.welcomeHint`),
          }),
        ],
      }),
      r || i?.running
        ? (0, L.jsxs)(`div`, {
            className: `flex flex-col items-center gap-3`,
            children: [
              (0, L.jsx)(tn, { size: 22, className: `text-primary animate-spin` }),
              (0, L.jsx)(`span`, {
                className: `text-muted-foreground text-sm`,
                children:
                  i?.phase === `list`
                    ? t(`photoTriage.scanning`)
                    : t(`photoTriage.scanGenerating`, {
                        done: i?.done ?? 0,
                        total: i?.total || `…`,
                      }),
              }),
            ],
          })
        : (0, L.jsxs)(G, {
            size: `lg`,
            onClick: u,
            disabled: f,
            children: [
              (0, L.jsx)(Qt, { size: 18, className: `mr-2` }),
              t(`photoTriage.pickFolder`),
            ],
          }),
      a
        ? (0, L.jsx)(`p`, {
            className: `border-destructive/40 bg-destructive/10 text-destructive max-w-md rounded-md border px-3 py-2 text-sm break-words`,
            children: a,
          })
        : null,
      !o?.has_ffmpeg && !r
        ? (0, L.jsx)(`p`, {
            className: `text-muted-foreground text-xs`,
            children: t(`photoTriage.ffmpegMissing`),
          })
        : null,
      n.length > 0
        ? (0, L.jsxs)(`div`, {
            className: `w-full max-w-lg`,
            children: [
              (0, L.jsxs)(`div`, {
                className: `text-muted-foreground mb-2 flex items-center gap-2 text-xs font-medium tracking-wide uppercase`,
                children: [(0, L.jsx)(an, { size: 13 }), t(`photoTriage.continueLast`)],
              }),
              (0, L.jsx)(`div`, {
                className: `space-y-1.5`,
                children: n.map((e) =>
                  (0, L.jsxs)(
                    `button`,
                    {
                      type: `button`,
                      onClick: () => d(e.src),
                      disabled: f,
                      className: `group bg-card hover:bg-accent/50 flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-50`,
                      title: t(`photoTriage.openAlbum`),
                      children: [
                        (0, L.jsx)(`span`, {
                          className: `bg-muted flex h-8 w-8 flex-none items-center justify-center rounded-md`,
                          children: (0, L.jsx)(nn, {
                            size: 13,
                            className: `text-muted-foreground`,
                          }),
                        }),
                        (0, L.jsxs)(`span`, {
                          className: `min-w-0 flex-1`,
                          children: [
                            (0, L.jsx)(`span`, {
                              className: `block truncate text-sm font-medium`,
                              children: pl(e.src),
                            }),
                            (0, L.jsx)(`span`, {
                              className: `text-muted-foreground block truncate text-xs`,
                              children: e.last,
                            }),
                          ],
                        }),
                        (0, L.jsx)(G, {
                          variant: `ghost`,
                          size: `sm`,
                          className: `opacity-0 transition-opacity group-hover:opacity-100`,
                          children: t(`photoTriage.openAlbum`),
                        }),
                      ],
                    },
                    e.src,
                  ),
                ),
              }),
            ],
          })
        : null,
    ],
  })
}
function vl({ controller: e, onConfirmTrash: t, onOpenHelp: n }) {
  let { t: r } = Ft(),
    { stats: i, deletedSet: a } = e,
    { run: o } = gl(),
    [s, c] = (0, _.useState)(null),
    l = (0, _.useMemo)(
      () => e.items.filter((t) => e.sel[t.id] === `drop` && !a.has(t.id)),
      [e.items, e.sel, a],
    ),
    u = (e) => {
      let t = i.total - i.deleted
      t <= 0 ||
        (Yc(e),
        k(r(e === `keep` ? `photoTriage.markAllKeep` : `photoTriage.markAllDrop`, { count: t })))
    }
  return (0, L.jsxs)(`div`, {
    className: `bg-background flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-xs`,
    children: [
      (0, L.jsx)(`h1`, { className: `text-sm font-semibold`, children: r(`photoTriage.title`) }),
      (0, L.jsxs)(`span`, {
        className: `text-muted-foreground`,
        children: [
          r(`photoTriage.total`),
          ` `,
          (0, L.jsx)(`b`, { className: `text-foreground`, children: i.total }),
        ],
      }),
      (0, L.jsxs)(`span`, {
        className: `text-muted-foreground`,
        children: [
          r(`photoTriage.keep`),
          ` `,
          (0, L.jsx)(`b`, { className: `text-emerald-500`, children: i.keep }),
        ],
      }),
      (0, L.jsxs)(`span`, {
        className: `text-muted-foreground`,
        children: [
          r(`photoTriage.drop`),
          ` `,
          (0, L.jsx)(`b`, { className: `text-red-500`, children: i.drop }),
        ],
      }),
      (0, L.jsxs)(`span`, {
        className: `text-muted-foreground`,
        children: [r(`photoTriage.todo`), ` `, (0, L.jsx)(`b`, { children: i.todo })],
      }),
      (0, L.jsxs)(`span`, {
        className: `text-muted-foreground`,
        children: [
          r(`photoTriage.deleted`),
          ` `,
          (0, L.jsx)(`b`, { className: `text-muted-foreground`, children: i.deleted }),
        ],
      }),
      (0, L.jsx)(`span`, { className: `flex-1` }),
      (0, L.jsxs)(G, {
        variant: `ghost`,
        size: `sm`,
        onClick: () => Gc(),
        title: r(`photoTriage.reselectHint`),
        children: [(0, L.jsx)(Qt, { size: 13, className: `mr-1` }), r(`photoTriage.reselect`)],
      }),
      (0, L.jsx)(G, {
        variant: `ghost`,
        size: `sm`,
        onClick: () => u(`keep`),
        children: r(`photoTriage.markAllKeep`),
      }),
      (0, L.jsx)(G, {
        variant: `ghost`,
        size: `sm`,
        onClick: () => u(`drop`),
        children: r(`photoTriage.markAllDrop`),
      }),
      (0, L.jsxs)(G, {
        variant: `ghost`,
        size: `sm`,
        onClick: () =>
          o(async () => {
            let e
            try {
              e = Xc()
            } catch {
              k(r(`photoTriage.exportFailed`))
              return
            }
            k(
              e
                ? r(`photoTriage.exported`, { keeps: e.keeps, drops: e.drops })
                : r(`photoTriage.exportEmpty`),
            )
          }),
        title: r(`photoTriage.exportHint`),
        children: [(0, L.jsx)(Xt, { size: 13, className: `mr-1` }), r(`photoTriage.export`)],
      }),
      (0, L.jsxs)(G, {
        variant: `ghost`,
        size: `sm`,
        onClick: n,
        children: [(0, L.jsx)(Yt, { size: 13, className: `mr-1` }), r(`photoTriage.helpShortcuts`)],
      }),
      (0, L.jsxs)(G, {
        variant: `destructive`,
        size: `sm`,
        disabled: l.length === 0,
        onClick: () => t(l),
        title: r(`photoTriage.trashEmpty`),
        children: [
          (0, L.jsx)(sn, { size: 13, className: `mr-1` }),
          l.length ? r(`photoTriage.trashCount`, { count: l.length }) : r(`photoTriage.trash`),
        ],
      }),
      (0, L.jsx)(js, {
        open: s !== null,
        onOpenChange: () => c(null),
        children: (0, L.jsxs)(Ps, {
          children: [
            (0, L.jsx)(Fs, {
              children: (0, L.jsx)(Ls, {
                children: r(
                  s === `keep`
                    ? `photoTriage.markAllKeepConfirm`
                    : `photoTriage.markAllDropConfirm`,
                  { count: i.total - i.deleted },
                ),
              }),
            }),
            (0, L.jsxs)(Is, {
              children: [
                (0, L.jsx)(G, {
                  variant: `outline`,
                  onClick: () => c(null),
                  children: r(`common.cancel`),
                }),
                (0, L.jsx)(G, {
                  variant: s === `keep` ? `outline` : `destructive`,
                  onClick: () => {
                    ;(s && u(s), c(null))
                  },
                  children: r(`common.confirm`),
                }),
              ],
            }),
          ],
        }),
      }),
    ],
  })
}
var yl = [`all`, `todo`, `keep`, `drop`, `deleted`]
function bl(e) {
  return `photoTriage.${e === `all` ? `all` : e}`
}
function xl({ controller: e }) {
  let { t } = Ft(),
    {
      filter: n,
      setFilter: r,
      groupBy: i,
      toggleGroup: a,
      groupCount: o,
      autoNext: s,
      toggleAutoNext: c,
      stats: l,
      source: u,
      scanning: d,
      scanStatus: f,
      current: p,
    } = e,
    [m, h] = (0, _.useState)(!1),
    g = (0, _.useMemo)(
      () => ({ all: l.total, todo: l.todo, keep: l.keep, drop: l.drop, deleted: l.deleted }),
      [l],
    )
  return (0, L.jsxs)(`div`, {
    className: `bg-background/95 flex flex-wrap items-center gap-2 border-b p-2`,
    children: [
      (0, L.jsx)(`span`, {
        className: `text-muted-foreground pl-1 text-xs`,
        children: t(`photoTriage.filter`),
      }),
      (0, L.jsx)(`div`, {
        className: `flex items-center gap-1`,
        children: yl.map((e) =>
          (0, L.jsxs)(
            `button`,
            {
              type: `button`,
              "aria-pressed": n === e,
              onClick: () => r(e),
              className: ks(
                `rounded-full px-3 py-1 text-xs transition-colors`,
                n === e
                  ? `bg-primary text-primary-foreground`
                  : `bg-muted text-muted-foreground hover:bg-accent`,
              ),
              children: [
                t(bl(e)),
                ` `,
                (0, L.jsx)(`span`, { className: `opacity-70`, children: g[e] }),
              ],
            },
            e,
          ),
        ),
      }),
      (0, L.jsx)(`div`, { className: `bg-border mx-1 h-5 w-px` }),
      (0, L.jsxs)(G, {
        variant: `outline`,
        size: `sm`,
        onClick: a,
        title: t(`photoTriage.v10`),
        "aria-pressed": i,
        children: [
          (0, L.jsx)(Zt, { size: 14, className: `mr-1` }),
          i
            ? t(`photoTriage.groupCount`, { count: o })
            : t(`photoTriage.groupBy`, { state: t(`photoTriage.off`) }),
        ],
      }),
      (0, L.jsx)(G, {
        variant: `outline`,
        size: `sm`,
        onClick: c,
        children: t(`photoTriage.autoNext`, { state: t(s ? `photoTriage.on` : `photoTriage.off`) }),
      }),
      (0, L.jsx)(`div`, { className: `bg-border mx-1 h-5 w-px` }),
      (0, L.jsxs)(G, {
        variant: `ghost`,
        size: `sm`,
        onClick: async () => {
          if (!m) {
            h(!0)
            try {
              let e = await ll()
              e &&
                (k(t(`photoTriage.pruneDone`, { removed: e.removed, kept: e.kept })),
                e.removed > 0 &&
                  p &&
                  Kc(u).then(() => {
                    let e = K.getState()
                    ;(e.currentId &&
                      !e.items.some((t) => t.id === e.currentId) &&
                      e.setCurrent(null),
                      Lc())
                  }))
            } finally {
              h(!1)
            }
          }
        },
        disabled: m,
        title: t(`photoTriage.pruneTitle`),
        children: [
          (0, L.jsx)(rn, { size: 14, className: ks(`mr-1`, m && `animate-spin`) }),
          t(`photoTriage.resetCache`),
        ],
      }),
      (0, L.jsxs)(G, {
        variant: `ghost`,
        size: `sm`,
        onClick: () => K.getState().setEmptyDirsOpen(!0),
        title: t(`photoTriage.emptyDirs`),
        children: [(0, L.jsx)(Qt, { size: 14, className: `mr-1` }), t(`photoTriage.emptyDirs`)],
      }),
      d || f?.running
        ? (0, L.jsxs)(`span`, {
            className: `text-muted-foreground ml-auto flex items-center gap-1 text-xs`,
            children: [
              (0, L.jsx)(rn, { size: 12, className: `animate-spin` }),
              f?.phase === `list`
                ? t(`photoTriage.scanning`)
                : t(`photoTriage.scanGenerating`, { done: f?.done ?? 0, total: f?.total || `…` }),
            ],
          })
        : f && !f.running && f.phase === `done`
          ? (0, L.jsxs)(G, {
              variant: `ghost`,
              size: `sm`,
              className: `ml-auto text-emerald-500`,
              onClick: () => void Kc(u),
              title: t(`photoTriage.scanDone`, { count: f.total }),
              children: [`✓ `, t(`photoTriage.scanDone`, { count: f.total })],
            })
          : null,
      u
        ? (0, L.jsxs)(`span`, {
            className: `text-muted-foreground ml-auto max-w-[40%] truncate text-xs`,
            title: u,
            children: [
              t(`photoTriage.source`),
              (0, L.jsx)(`b`, { className: `text-foreground`, children: pl(u) }),
            ],
          })
        : null,
    ],
  })
}
function Sl(e, t, n) {
  let r = Array(e)
  return new Proxy(r, {
    get(r, i, a) {
      if (typeof i == `string`) {
        let a = i.charCodeAt(0)
        if (a >= 48 && a <= 57) {
          let a = +i
          if (Number.isInteger(a) && a >= 0 && a < e) {
            let e = r[a]
            if (!e) {
              let i = t[a * 2]
              e = r[a] = {
                index: a,
                key: n(a),
                start: i,
                size: t[a * 2 + 1],
                end: i + t[a * 2 + 1],
                lane: 0,
              }
            }
            return e
          }
        }
        if (i === `length`) return e
      }
      return Reflect.get(r, i, a)
    },
  })
}
function Cl(e, t, n) {
  let r = n.initialDeps ?? [],
    i,
    a = !0
  function o() {
    let o = e()
    return o.length !== r.length || o.some((e, t) => r[t] !== e)
      ? ((r = o),
        (i = t(...o)),
        n?.onChange && !(a && n.skipInitialOnChange) && n.onChange(i),
        (a = !1),
        i)
      : i
  }
  return (
    (o.updateDeps = (e) => {
      r = e
    }),
    o
  )
}
function wl(e, t) {
  if (e === void 0) throw Error(`Unexpected undefined${t ? `: ${t}` : ``}`)
  return e
}
var Tl = (e, t) => Math.abs(e - t) < 1.01,
  El = (e, t, n) => {
    let r
    return Object.assign(
      function (...i) {
        ;(e.clearTimeout(r), (r = e.setTimeout(() => t.apply(this, i), n)))
      },
      {
        cancel: () => {
          e.clearTimeout(r)
        },
      },
    )
  },
  Dl,
  Ol = () => {
    if (Dl !== void 0) return Dl
    if (typeof navigator > `u`) return (Dl = !1)
    if (/iP(hone|od|ad)/.test(navigator.userAgent)) return (Dl = !0)
    let e = navigator.maxTouchPoints
    return (Dl = navigator.platform === `MacIntel` && e !== void 0 && e > 0)
  },
  kl = (e) => {
    let { offsetWidth: t, offsetHeight: n } = e
    return { width: t, height: n }
  },
  Al = (e) => e,
  jl = (e) => {
    let t = Math.max(e.startIndex - e.overscan, 0),
      n = Math.min(e.endIndex + e.overscan, e.count - 1) - t + 1,
      r = Array(n)
    for (let e = 0; e < n; e++) r[e] = t + e
    return r
  },
  Ml = (e, t) => {
    let n = e.scrollElement
    if (!n) return
    let r = e.targetWindow
    if (!r) return
    let i = (e) => {
      let { width: n, height: r } = e
      t({ width: Math.round(n), height: Math.round(r) })
    }
    if ((i(kl(n)), !r.ResizeObserver)) return () => {}
    let a = new r.ResizeObserver((t) => {
      let r = () => {
        let e = t[0]
        if (e?.borderBoxSize) {
          let t = e.borderBoxSize[0]
          if (t) {
            i({ width: t.inlineSize, height: t.blockSize })
            return
          }
        }
        i(kl(n))
      }
      e.options.useAnimationFrameWithResizeObserver ? requestAnimationFrame(r) : r()
    })
    return (
      a.observe(n, { box: `border-box` }),
      () => {
        a.unobserve(n)
      }
    )
  },
  Nl = { passive: !0 },
  Pl = typeof window > `u` || `onscrollend` in window,
  Fl = (e, t, n) => {
    let r = e.scrollElement
    if (!r) return
    let i = e.targetWindow
    if (!i) return
    let a = e.options.useScrollendEvent && Pl,
      o = 0,
      s = a ? null : El(i, () => t(o, !1), e.options.isScrollingResetDelay),
      c = (e) => () => {
        ;((o = n(r)), s?.(), t(o, e))
      },
      l = c(!0),
      u = c(!1)
    return (
      r.addEventListener(`scroll`, l, Nl),
      a && r.addEventListener(`scrollend`, u, Nl),
      () => {
        ;(r.removeEventListener(`scroll`, l),
          a && r.removeEventListener(`scrollend`, u),
          s?.cancel())
      }
    )
  },
  Y = (e, t) =>
    Fl(e, t, (t) => {
      let { horizontal: n, isRtl: r } = e.options
      return n ? t.scrollLeft * ((r && -1) || 1) : t.scrollTop
    }),
  Il = (e, t, n) => {
    if (n.options.useCachedMeasurements) {
      let t = n.indexFromElement(e),
        r = n.options.getItemKey(t)
      return n.itemSizeCache.get(r) ?? n.options.estimateSize(t)
    }
    if (t?.borderBoxSize) {
      let e = t.borderBoxSize[0]
      if (e) return Math.round(e[n.options.horizontal ? `inlineSize` : `blockSize`])
    }
    if (!t) {
      let t = n.indexFromElement(e),
        r = n.options.getItemKey(t),
        i = n.itemSizeCache.get(r)
      if (i !== void 0) return i
    }
    return e[n.options.horizontal ? `offsetWidth` : `offsetHeight`]
  },
  X = (e, { adjustments: t = 0, behavior: n }, r) => {
    var i, a
    ;(a = (i = r.scrollElement)?.scrollTo) == null ||
      a.call(i, { [r.options.horizontal ? `left` : `top`]: e + t, behavior: n })
  },
  Z = class {
    constructor(e) {
      ;((this.unsubs = []),
        (this.scrollElement = null),
        (this.targetWindow = null),
        (this.isScrolling = !1),
        (this.scrollState = null),
        (this.measurementsCache = []),
        (this._flatMeasurements = null),
        (this.itemSizeCache = new Map()),
        (this.itemSizeCacheVersion = 0),
        (this.laneAssignments = new Map()),
        (this.pendingMin = null),
        (this.prevLanes = void 0),
        (this.lanesChangedFlag = !1),
        (this.lanesSettling = !1),
        (this.pendingScrollAnchor = null),
        (this.scrollRect = null),
        (this.scrollOffset = null),
        (this.scrollDirection = null),
        (this.scrollAdjustments = 0),
        (this._iosDeferredAdjustment = 0),
        (this._iosTouching = !1),
        (this._iosJustTouchEnded = !1),
        (this._iosTouchEndTimerId = null),
        (this._intendedScrollOffset = null),
        (this.elementsCache = new Map()),
        (this.now = () => {
          var e
          return (e = this.targetWindow?.performance)?.now?.call(e) ?? Date.now()
        }),
        (this.observer = (() => {
          let e = null,
            t = () =>
              e ||
              (!this.targetWindow || !this.targetWindow.ResizeObserver
                ? null
                : (e = new this.targetWindow.ResizeObserver((e) => {
                    e.forEach((e) => {
                      let t = () => {
                        let t = e.target,
                          n = this.indexFromElement(t)
                        if (!t.isConnected) {
                          this.observer.unobserve(t)
                          for (let [e, n] of this.elementsCache)
                            if (n === t) {
                              this.elementsCache.delete(e)
                              break
                            }
                          return
                        }
                        this.isIndexInRange(n) &&
                          this.shouldMeasureDuringScroll(n) &&
                          this.resizeItem(n, this.options.measureElement(t, e, this))
                      }
                      this.options.useAnimationFrameWithResizeObserver
                        ? requestAnimationFrame(t)
                        : t()
                    })
                  })))
          return {
            disconnect: () => {
              var n
              ;((n = t()) == null || n.disconnect(), (e = null))
            },
            observe: (e) => t()?.observe(e, { box: `border-box` }),
            unobserve: (e) => t()?.unobserve(e),
          }
        })()),
        (this.range = null),
        (this.setOptions = (e) => {
          let t = {
            debug: !1,
            initialOffset: 0,
            overscan: 1,
            paddingStart: 0,
            paddingEnd: 0,
            scrollPaddingStart: 0,
            scrollPaddingEnd: 0,
            horizontal: !1,
            getItemKey: Al,
            rangeExtractor: jl,
            onChange: () => {},
            measureElement: Il,
            initialRect: { width: 0, height: 0 },
            scrollMargin: 0,
            gap: 0,
            indexAttribute: `data-index`,
            initialMeasurementsCache: [],
            lanes: 1,
            anchorTo: `start`,
            followOnAppend: !1,
            scrollEndThreshold: 1,
            isScrollingResetDelay: 150,
            enabled: !0,
            isRtl: !1,
            useScrollendEvent: !1,
            useAnimationFrameWithResizeObserver: !1,
            laneAssignmentMode: `estimate`,
            useCachedMeasurements: !1,
          }
          for (let n in e) {
            let r = e[n]
            r !== void 0 && (t[n] = r)
          }
          let n = this.options,
            r = null,
            i = null,
            a = !1
          if (
            n !== void 0 &&
            n.enabled &&
            t.enabled &&
            t.anchorTo === `end` &&
            this.scrollElement !== null
          ) {
            let e = n.count,
              o = t.count,
              s = this.getMeasurements(),
              c = e > 0 ? (s[0]?.key ?? n.getItemKey(0)) : null,
              l = e > 0 ? (s[e - 1]?.key ?? n.getItemKey(e - 1)) : null
            if (
              o !== e ||
              (e > 0 && o > 0 && (t.getItemKey(0) !== c || t.getItemKey(o - 1) !== l))
            ) {
              a = !0
              let c = e > 0 ? (this.getVirtualItemForOffset(this.getScrollOffset()) ?? s[0]) : null
              c && (r = [c.key, this.getScrollOffset() - c.start])
              let u = t.followOnAppend === !0 ? `auto` : t.followOnAppend || null
              u &&
                o > e &&
                this.isAtEnd(n.scrollEndThreshold) &&
                (e === 0 || t.getItemKey(o - 1) !== l) &&
                (i = u)
            }
          }
          ;((this.options = t), a && ((this.pendingMin = 0), this.itemSizeCacheVersion++))
          let o = !1,
            s = 0
          if (r && this.scrollOffset !== null) {
            let [e, t] = r,
              n = this.getMeasurements(),
              { count: i, getItemKey: a } = this.options,
              c = 0
            for (; c < i && a(c) !== e;) c++
            if (c < i) {
              let e = n[c]
              if (e) {
                let n = Math.max(0, e.start + t)
                n !== this.scrollOffset &&
                  ((s = n - this.scrollOffset), (this.scrollOffset = n), (o = !0))
              }
            }
          }
          ;(o || i) && (this.pendingScrollAnchor = [o ? r[0] : null, o ? r[1] : 0, i, s])
        }),
        (this.notify = (e) => {
          var t, n
          ;(n = (t = this.options).onChange) == null || n.call(t, this, e)
        }),
        (this.maybeNotify = Cl(
          () => (
            this.calculateRange(),
            [
              this.isScrolling,
              this.range ? this.range.startIndex : null,
              this.range ? this.range.endIndex : null,
            ]
          ),
          (e) => {
            this.notify(e)
          },
          {
            key: !1,
            debug: () => this.options.debug,
            initialDeps: [
              this.isScrolling,
              this.range ? this.range.startIndex : null,
              this.range ? this.range.endIndex : null,
            ],
          },
        )),
        (this.cleanup = () => {
          ;(this.unsubs.filter(Boolean).forEach((e) => e()),
            (this.unsubs = []),
            this.observer.disconnect(),
            this.rafId != null &&
              this.targetWindow &&
              (this.targetWindow.cancelAnimationFrame(this.rafId), (this.rafId = null)),
            (this.scrollState = null),
            (this.isScrolling = !1),
            (this.scrollDirection = null),
            (this._iosDeferredAdjustment = 0),
            (this._iosTouching = !1),
            (this._iosJustTouchEnded = !1),
            (this.scrollElement = null),
            (this.targetWindow = null))
        }),
        (this._didMount = () => () => {
          this.cleanup()
        }),
        (this._willUpdate = () => {
          let e = this.options.enabled ? this.options.getScrollElement() : null
          if (this.scrollElement !== e) {
            if ((this.cleanup(), !e)) {
              this.maybeNotify()
              return
            }
            if (
              ((this.scrollElement = e),
              (this.targetWindow =
                this.scrollElement && `ownerDocument` in this.scrollElement
                  ? this.scrollElement.ownerDocument.defaultView
                  : (this.scrollElement?.window ?? null)),
              this.elementsCache.forEach((e) => {
                this.observer.observe(e)
              }),
              this.unsubs.push(
                this.options.observeElementRect(this, (e) => {
                  ;((this.scrollRect = e), this.maybeNotify())
                }),
              ),
              this.unsubs.push(
                this.options.observeElementOffset(this, (e, t) => {
                  if (t && this._intendedScrollOffset === null && e === this.scrollOffset) return
                  ;(this._intendedScrollOffset !== null &&
                    Math.abs(e - this._intendedScrollOffset) < 1.5 &&
                    (e = this._intendedScrollOffset),
                    (this._intendedScrollOffset = null),
                    (this.scrollAdjustments = 0))
                  let n = this.getScrollOffset()
                  ;((this.scrollDirection = t
                    ? n === e
                      ? this.scrollDirection
                      : n < e
                        ? `forward`
                        : `backward`
                    : null),
                    (this.scrollOffset = e),
                    (this.isScrolling = t),
                    this._flushIosDeferredIfReady(),
                    this.scrollState && this.scheduleScrollReconcile(),
                    this.maybeNotify())
                }),
              ),
              `addEventListener` in this.scrollElement)
            ) {
              let e = this.scrollElement,
                t = () => {
                  ;((this._iosTouching = !0),
                    (this._iosJustTouchEnded = !1),
                    this._iosTouchEndTimerId !== null &&
                      this.targetWindow != null &&
                      (this.targetWindow.clearTimeout(this._iosTouchEndTimerId),
                      (this._iosTouchEndTimerId = null)))
                },
                n = () => {
                  ;((this._iosTouching = !1),
                    Ol() &&
                      this.targetWindow != null &&
                      ((this._iosJustTouchEnded = !0),
                      (this._iosTouchEndTimerId = this.targetWindow.setTimeout(() => {
                        ;((this._iosJustTouchEnded = !1),
                          (this._iosTouchEndTimerId = null),
                          this._flushIosDeferredIfReady())
                      }, 150))))
                }
              ;(e.addEventListener(`touchstart`, t, Nl),
                e.addEventListener(`touchend`, n, Nl),
                this.unsubs.push(() => {
                  ;(e.removeEventListener(`touchstart`, t),
                    e.removeEventListener(`touchend`, n),
                    this._iosTouchEndTimerId !== null &&
                      this.targetWindow != null &&
                      (this.targetWindow.clearTimeout(this._iosTouchEndTimerId),
                      (this._iosTouchEndTimerId = null)))
                }))
            }
            this._scrollToOffset(this.getScrollOffset(), { adjustments: void 0, behavior: void 0 })
          }
          let t = this.pendingScrollAnchor
          if (
            ((this.pendingScrollAnchor = null), t && this.scrollElement && this.options.enabled)
          ) {
            let [e, n, r, i] = t
            ;(e !== null &&
              !r &&
              (Ol() && (this.isScrolling || this._iosTouching || this._iosJustTouchEnded)
                ? i !== 0 && (this._iosDeferredAdjustment += i)
                : this._scrollToOffset(this.getScrollOffset(), {
                    adjustments: void 0,
                    behavior: void 0,
                  })),
              r && this.scrollToEnd({ behavior: r }))
          }
        }),
        (this._flushIosDeferredIfReady = () => {
          if (
            this._iosDeferredAdjustment === 0 ||
            this.isScrolling ||
            this._iosTouching ||
            this._iosJustTouchEnded
          )
            return
          let e = this.getScrollOffset(),
            t = this.getMaxScrollOffset()
          if (e < 0 || e > t) return
          if (this._iosDeferredAdjustment < 0 && e >= t - 1) {
            this._iosDeferredAdjustment = 0
            return
          }
          let n = this._iosDeferredAdjustment
          ;((this._iosDeferredAdjustment = 0),
            this._scrollToOffset(e, {
              adjustments: (this.scrollAdjustments += n),
              behavior: void 0,
            }))
        }),
        (this.rafId = null),
        (this.getSize = () =>
          this.options.enabled
            ? ((this.scrollRect = this.scrollRect ?? this.options.initialRect),
              this.scrollRect[this.options.horizontal ? `width` : `height`])
            : ((this.scrollRect = null), 0)),
        (this.getScrollOffset = () =>
          this.options.enabled
            ? ((this.scrollOffset =
                this.scrollOffset ??
                (typeof this.options.initialOffset == `function`
                  ? this.options.initialOffset()
                  : this.options.initialOffset)),
              this.scrollOffset)
            : ((this.scrollOffset = null), 0)),
        (this.getMeasurementOptions = Cl(
          () => [
            this.options.count,
            this.options.paddingStart,
            this.options.scrollMargin,
            this.options.getItemKey,
            this.options.enabled,
            this.options.lanes,
            this.options.laneAssignmentMode,
            this.options.gap,
          ],
          (e, t, n, r, i, a, o, s) => (
            this.prevLanes !== void 0 && this.prevLanes !== a && (this.lanesChangedFlag = !0),
            (this.prevLanes = a),
            (this.pendingMin = null),
            {
              count: e,
              paddingStart: t,
              scrollMargin: n,
              getItemKey: r,
              enabled: i,
              lanes: a,
              laneAssignmentMode: o,
              gap: s,
            }
          ),
          { key: !1 },
        )),
        (this.isIndexInRange = (e) => e >= 0 && e < this.options.count),
        (this.getMeasurements = Cl(
          () => [this.getMeasurementOptions(), this.itemSizeCacheVersion],
          (
            {
              count: e,
              paddingStart: t,
              scrollMargin: n,
              getItemKey: r,
              enabled: i,
              lanes: a,
              laneAssignmentMode: o,
              gap: s,
            },
            c,
          ) => {
            let l = this.itemSizeCache
            if (!i)
              return (
                (this.measurementsCache = []),
                this.itemSizeCache.clear(),
                this.laneAssignments.clear(),
                []
              )
            if (this.laneAssignments.size > e)
              for (let t of this.laneAssignments.keys()) t >= e && this.laneAssignments.delete(t)
            ;(this.lanesChangedFlag &&
              ((this.lanesChangedFlag = !1),
              (this.lanesSettling = !0),
              (this.measurementsCache = []),
              this.itemSizeCache.clear(),
              this.laneAssignments.clear(),
              (this.pendingMin = null)),
              this.measurementsCache.length === 0 &&
                !this.lanesSettling &&
                ((this.measurementsCache = this.options.initialMeasurementsCache),
                this.measurementsCache.forEach((e) => {
                  this.itemSizeCache.set(e.key, e.size)
                })))
            let u = this.lanesSettling ? 0 : (this.pendingMin ?? 0)
            if (
              ((this.pendingMin = null),
              this.lanesSettling &&
                this.measurementsCache.length === e &&
                (this.lanesSettling = !1),
              a === 1)
            ) {
              let i = e * 2,
                a = this._flatMeasurements
              if (!a || a.length < i) {
                let e = new Float64Array(i)
                ;(a && u > 0 && e.set(a.subarray(0, u * 2)), (a = e), (this._flatMeasurements = a))
              }
              let o
              if (u === 0) o = t + n
              else {
                let e = u - 1
                o = a[e * 2] + a[e * 2 + 1] + s
              }
              for (let t = u; t < e; t++) {
                let e = r(t),
                  n = l.get(e),
                  i = typeof n == `number` ? n : this.options.estimateSize(t)
                ;((a[t * 2] = o), (a[t * 2 + 1] = i), (o += i + s))
              }
              let c = Sl(e, a, r)
              return ((this.measurementsCache = c), c)
            }
            let d = this.measurementsCache.slice(0, u),
              f = Array(a).fill(void 0),
              p = new Float64Array(a),
              m = 0
            for (let e = 0; e < u; e++) {
              let t = d[e]
              t && (f[t.lane] === void 0 && m++, (f[t.lane] = e), (p[t.lane] = t.end))
            }
            for (let i = u; i < e; i++) {
              let e = r(i),
                c = this.laneAssignments.get(i),
                u,
                h,
                g = o === `estimate` || l.has(e)
              if (c !== void 0 && this.options.lanes > 1) {
                u = c
                let e = f[u],
                  r = e === void 0 ? void 0 : d[e]
                h = r ? r.end + s : t + n
              } else if (m === a) {
                let e = 0,
                  t = p[0],
                  n = f[0]
                for (let r = 1; r < a; r++) {
                  let i = p[r]
                  ;(i < t || (i === t && f[r] < n)) && ((e = r), (t = i), (n = f[r]))
                }
                ;((u = e), (h = t + s), g && this.laneAssignments.set(i, u))
              } else
                ((u = i % this.options.lanes), (h = t + n), g && this.laneAssignments.set(i, u))
              let _ = l.get(e),
                v = typeof _ == `number` ? _ : this.options.estimateSize(i),
                y = h + v
              ;((d[i] = { index: i, start: h, size: v, end: y, key: e, lane: u }),
                f[u] === void 0 && m++,
                (f[u] = i),
                (p[u] = y))
            }
            return ((this.measurementsCache = d), d)
          },
          { key: !1, debug: () => this.options.debug },
        )),
        (this.calculateRange = Cl(
          () => [
            this.getMeasurements(),
            this.getSize(),
            this.getScrollOffset(),
            this.options.lanes,
          ],
          (e, t, n, r) =>
            e.length === 0 || t === 0
              ? ((this.range = null), null)
              : ((this.range = Rl(
                  e,
                  t,
                  n,
                  r,
                  r === 1 && this._flatMeasurements != null ? this._flatMeasurements : null,
                )),
                this.range),
          { key: !1, debug: () => this.options.debug },
        )),
        (this.getVirtualIndexes = Cl(
          () => {
            let e = null,
              t = null,
              n = this.calculateRange()
            return (
              n && ((e = n.startIndex), (t = n.endIndex)),
              this.maybeNotify.updateDeps([this.isScrolling, e, t]),
              [this.options.rangeExtractor, this.options.overscan, this.options.count, e, t]
            )
          },
          (e, t, n, r, i) =>
            r === null || i === null
              ? []
              : e({ startIndex: r, endIndex: i, overscan: t, count: n }),
          { key: !1, debug: () => this.options.debug },
        )),
        (this.indexFromElement = (e) => {
          let t = this.options.indexAttribute,
            n = e.getAttribute(t)
          return n
            ? parseInt(n, 10)
            : (console.warn(`Missing attribute name '${t}={index}' on measured element.`), -1)
        }),
        (this.shouldMeasureDuringScroll = (e) => {
          if (!this.scrollState || this.scrollState.behavior !== `smooth`) return !0
          let t =
            this.scrollState.index ??
            this.getVirtualItemForOffset(this.scrollState.lastTargetOffset)?.index
          if (t !== void 0 && this.range) {
            let n = Math.max(
                this.options.overscan,
                Math.ceil((this.range.endIndex - this.range.startIndex) / 2),
              ),
              r = Math.max(0, t - n),
              i = Math.min(this.options.count - 1, t + n)
            return e >= r && e <= i
          }
          return !0
        }),
        (this.measureElement = (e) => {
          if (!e) {
            this.elementsCache.forEach((e, t) => {
              e.isConnected || (this.observer.unobserve(e), this.elementsCache.delete(t))
            })
            return
          }
          let t = this.indexFromElement(e)
          if (!this.isIndexInRange(t)) return
          let n = this.options.getItemKey(t),
            r = this.elementsCache.get(n)
          ;(r !== e &&
            (r && this.observer.unobserve(r),
            this.observer.observe(e),
            this.elementsCache.set(n, e)),
            (!this.isScrolling || this.scrollState) &&
              this.shouldMeasureDuringScroll(t) &&
              this.resizeItem(t, this.options.measureElement(e, void 0, this)))
        }),
        (this.resizeItem = (e, t) => {
          if (!this.isIndexInRange(e)) return
          let n,
            r,
            i,
            a = this._flatMeasurements
          if (this.options.lanes === 1 && a !== null)
            ((i = this.options.getItemKey(e)), (r = a[e * 2]), (n = a[e * 2 + 1]))
          else {
            let t = this.measurementsCache[e]
            if (!t) return
            ;((i = t.key), (r = t.start), (n = t.size))
          }
          let o = this.itemSizeCache.get(i) ?? n,
            s = t - o
          if (s !== 0) {
            let a =
                this.options.anchorTo === `end` &&
                this.scrollState?.behavior !== `smooth` &&
                this.getVirtualDistanceFromEnd() <= this.options.scrollEndThreshold,
              c = a ? this.getTotalSize() : 0,
              l = this.getScrollOffset() + this.scrollAdjustments,
              u = this.itemSizeCache.has(i)
                ? r + o <= l && this.scrollDirection !== `backward`
                : r < l,
              d =
                this.scrollState?.behavior !== `smooth` &&
                (this.shouldAdjustScrollPositionOnItemSizeChange === void 0
                  ? u
                  : this.shouldAdjustScrollPositionOnItemSizeChange(
                      this.measurementsCache[e] ?? {
                        index: e,
                        key: i,
                        start: r,
                        size: n,
                        end: r + n,
                        lane: 0,
                      },
                      s,
                      this,
                    ))
            ;((this.pendingMin === null || e < this.pendingMin) && (this.pendingMin = e),
              this.itemSizeCache.set(i, t),
              this.itemSizeCacheVersion++)
            let f = !1
            ;(a
              ? (f = this.applyScrollAdjustment(this.getTotalSize() - c))
              : d && (f = this.applyScrollAdjustment(s)),
              this.notify(f))
          }
        }),
        (this.getVirtualItems = Cl(
          () => [this.getVirtualIndexes(), this.getMeasurements()],
          (e, t) => {
            let n = []
            for (let r = 0, i = e.length; r < i; r++) {
              let i = t[e[r]]
              n.push(i)
            }
            return n
          },
          { key: !1, debug: () => this.options.debug },
        )),
        (this.getVirtualItemForOffset = (e) => {
          let t = this.getMeasurements()
          if (t.length === 0) return
          let n = this._flatMeasurements,
            r = this.options.lanes === 1 && n != null
          return wl(t[Q(0, t.length - 1, r ? (e) => n[e * 2] : (e) => wl(t[e]).start, e)])
        }),
        (this.getMaxScrollOffset = () => {
          if (!this.scrollElement) return 0
          if (`scrollHeight` in this.scrollElement)
            return this.options.horizontal
              ? this.scrollElement.scrollWidth - this.scrollElement.clientWidth
              : this.scrollElement.scrollHeight - this.scrollElement.clientHeight
          {
            let e = this.scrollElement.document.documentElement
            return this.options.horizontal
              ? e.scrollWidth - this.scrollElement.innerWidth
              : e.scrollHeight - this.scrollElement.innerHeight
          }
        }),
        (this.getVirtualDistanceFromEnd = () =>
          Math.max(this.getTotalSize() - this.getSize() - this.getScrollOffset(), 0)),
        (this.getDistanceFromEnd = () =>
          Math.max(this.getMaxScrollOffset() - this.getScrollOffset(), 0)),
        (this.isAtEnd = (e = this.options.scrollEndThreshold) => this.getDistanceFromEnd() <= e),
        (this.getOffsetForAlignment = (e, t, n = 0) => {
          if (!this.scrollElement) return 0
          let r = this.getSize(),
            i = this.getScrollOffset()
          ;(t === `auto` && (t = e >= i + r ? `end` : `start`),
            t === `center` ? (e += (n - r) / 2) : t === `end` && (e -= r))
          let a = this.getMaxScrollOffset()
          return Math.max(Math.min(a, e), 0)
        }),
        (this.getOffsetForIndex = (e, t = `auto`) => {
          e = Math.max(0, Math.min(e, this.options.count - 1))
          let n = this.getSize(),
            r = this.getScrollOffset(),
            i = this.measurementsCache[e]
          if (!i) return
          if (t === `auto`) {
            if (i.end >= r + n - this.options.scrollPaddingEnd) t = `end`
            else if (i.start <= r + this.options.scrollPaddingStart) t = `start`
            else return [r, t]
          }
          if (t === `end` && e === this.options.count - 1) return [this.getMaxScrollOffset(), t]
          let a =
            t === `end`
              ? i.end + this.options.scrollPaddingEnd
              : i.start - this.options.scrollPaddingStart
          return [this.getOffsetForAlignment(a, t, i.size), t]
        }),
        (this.scrollToOffset = (e, { align: t = `start`, behavior: n = `auto` } = {}) => {
          this._iosDeferredAdjustment = 0
          let r = this.getOffsetForAlignment(e, t),
            i = this.now()
          ;((this.scrollState = {
            index: null,
            align: t,
            behavior: n,
            startedAt: i,
            lastTargetOffset: r,
            stableFrames: 0,
          }),
            this._scrollToOffset(r, { adjustments: void 0, behavior: n }),
            this.scheduleScrollReconcile())
        }),
        (this.scrollToIndex = (e, { align: t = `auto`, behavior: n = `auto` } = {}) => {
          ;((this._iosDeferredAdjustment = 0),
            (e = Math.max(0, Math.min(e, this.options.count - 1))))
          let r = this.getOffsetForIndex(e, t)
          if (!r) return
          let [i, a] = r,
            o = this.now()
          ;((this.scrollState = {
            index: e,
            align: a,
            behavior: n,
            startedAt: o,
            lastTargetOffset: i,
            stableFrames: 0,
          }),
            this._scrollToOffset(i, { adjustments: void 0, behavior: n }),
            this.scheduleScrollReconcile())
        }),
        (this.scrollBy = (e, { behavior: t = `auto` } = {}) => {
          let n = this.getScrollOffset() + e,
            r = this.now()
          ;((this.scrollState = {
            index: null,
            align: `start`,
            behavior: t,
            startedAt: r,
            lastTargetOffset: n,
            stableFrames: 0,
          }),
            this._scrollToOffset(n, { adjustments: void 0, behavior: t }),
            this.scheduleScrollReconcile())
        }),
        (this.scrollToEnd = ({ behavior: e = `auto` } = {}) => {
          if (this.options.count > 0) {
            this.scrollToIndex(this.options.count - 1, { align: `end`, behavior: e })
            return
          }
          this.scrollToOffset(Math.max(this.getTotalSize() - this.getSize(), 0), { behavior: e })
        }),
        (this.getTotalSize = () => {
          let e = this.getMeasurements(),
            t
          if (e.length === 0) t = this.options.paddingStart
          else if (this.options.lanes === 1) {
            let n = e.length - 1,
              r = this._flatMeasurements
            t = r == null ? (e[n]?.end ?? 0) : r[n * 2] + r[n * 2 + 1]
          } else {
            let n = Array(this.options.lanes).fill(null),
              r = e.length - 1
            for (; r >= 0 && n.some((e) => e === null);) {
              let t = e[r]
              ;(n[t.lane] === null && (n[t.lane] = t.end), r--)
            }
            t = Math.max(...n.filter((e) => e !== null))
          }
          return Math.max(t - this.options.scrollMargin + this.options.paddingEnd, 0)
        }),
        (this.takeSnapshot = () => {
          let e = []
          if (this.itemSizeCache.size === 0) return e
          let t = this.getMeasurements()
          for (let n of t)
            n &&
              this.itemSizeCache.has(n.key) &&
              e.push({
                index: n.index,
                key: n.key,
                start: n.start,
                size: n.size,
                end: n.end,
                lane: n.lane,
              })
          return e
        }),
        (this._scrollToOffset = (e, { adjustments: t, behavior: n }) => {
          ;((this._intendedScrollOffset = e + (t ?? 0)),
            this.options.scrollToFn(e, { behavior: n, adjustments: t }, this))
        }),
        (this.measure = () => {
          ;((this.pendingMin = null),
            this.itemSizeCache.clear(),
            this.laneAssignments.clear(),
            this.itemSizeCacheVersion++,
            this.notify(!1))
        }),
        this.setOptions(e))
    }
    applyScrollAdjustment(e, t) {
      return e === 0
        ? !1
        : Ol() && (this.isScrolling || this._iosTouching || this._iosJustTouchEnded)
          ? ((this._iosDeferredAdjustment += e), !1)
          : (this._scrollToOffset(this.getScrollOffset(), {
              adjustments: (this.scrollAdjustments += e),
              behavior: t,
            }),
            this.scrollOffset !== null &&
              ((this.scrollOffset += this.scrollAdjustments),
              this.scrollOffset < 0 && (this.scrollOffset = 0),
              (this.scrollAdjustments = 0)),
            !0)
    }
    scheduleScrollReconcile() {
      if (!this.targetWindow) {
        this.scrollState = null
        return
      }
      this.rafId ??= this.targetWindow.requestAnimationFrame(() => {
        ;((this.rafId = null), this.reconcileScroll())
      })
    }
    reconcileScroll() {
      if (!this.scrollState || !this.scrollElement) return
      if (this.now() - this.scrollState.startedAt > 5e3) {
        this.scrollState = null
        return
      }
      let e =
          this.scrollState.index == null
            ? void 0
            : this.getOffsetForIndex(this.scrollState.index, this.scrollState.align),
        t = e ? e[0] : this.scrollState.lastTargetOffset,
        n = t !== this.scrollState.lastTargetOffset
      if (!n && Tl(t, this.getScrollOffset())) {
        if ((this.scrollState.stableFrames++, this.scrollState.stableFrames >= 1)) {
          ;(this.getScrollOffset() !== t &&
            this._scrollToOffset(t, { adjustments: void 0, behavior: `auto` }),
            (this.scrollState = null))
          return
        }
      } else if (((this.scrollState.stableFrames = 0), n)) {
        let e = this.getSize() || 600,
          n = Math.abs(t - this.getScrollOffset()),
          r = this.scrollState.behavior === `smooth` && n > e
        ;((this.scrollState.lastTargetOffset = t),
          r || (this.scrollState.behavior = `auto`),
          this._scrollToOffset(t, { adjustments: void 0, behavior: r ? `smooth` : `auto` }))
      }
      this.scheduleScrollReconcile()
    }
  },
  Q = (e, t, n, r) => {
    for (; e <= t;) {
      let i = ((e + t) / 2) | 0,
        a = n(i)
      if (a < r) e = i + 1
      else if (a > r) t = i - 1
      else return i
    }
    return e > 0 ? e - 1 : 0
  }
function Ll(e, t, n) {
  let r = 0
  for (; r <= t;) {
    let i = ((r + t) / 2) | 0,
      a = e[i * 2]
    if (a < n) r = i + 1
    else if (a > n) t = i - 1
    else return i
  }
  return r > 0 ? r - 1 : 0
}
function Rl(e, t, n, r, i) {
  let a = e.length - 1
  if (e.length <= r) return { startIndex: 0, endIndex: a }
  if (r === 1 && i !== null) {
    let e = Ll(i, a, n),
      r = e,
      o = n + t
    for (; r < a && i[r * 2] + i[r * 2 + 1] < o;) r++
    return { startIndex: e, endIndex: r }
  }
  let o = Q(0, a, (t) => e[t].start, n),
    s = o
  if (r === 1) for (; s < a && e[s].end < n + t;) s++
  else if (r > 1) {
    let i = Array(r).fill(0)
    for (; s < a && i.some((e) => e < n + t);) {
      let t = e[s]
      ;((i[t.lane] = t.end), s++)
    }
    let c = Array(r).fill(n + t)
    for (; o >= 0 && c.some((e) => e >= n);) {
      let t = e[o]
      ;((c[t.lane] = t.start), o--)
    }
    ;((o = Math.max(0, o - (o % r))), (s = Math.min(a, s + (r - 1 - (s % r)))))
  }
  return { startIndex: o, endIndex: s }
}
var zl = typeof document < `u` ? _.useLayoutEffect : _.useEffect
function Bl({
  useFlushSync: e = !0,
  directDomUpdates: t = !1,
  directDomUpdatesMode: n = `transform`,
  ...r
}) {
  let i = _.useReducer((e) => e + 1, 0)[1],
    a = _.useRef({
      enabled: t,
      mode: n,
      container: null,
      lastSize: null,
      lastPositions: new WeakMap(),
      prevRange: null,
    })
  ;((a.current.enabled = t), (a.current.mode = n))
  let o = (e) => {
      let t = a.current
      if (!t.enabled || !t.container) return
      let n = e.getTotalSize()
      if (n !== t.lastSize) {
        t.lastSize = n
        let r = e.options.horizontal ? `width` : `height`
        t.container.style[r] = `${n}px`
      }
    },
    s = (e) => {
      let t = a.current
      if (!t.enabled || !t.container) return
      o(e)
      let n = !!e.options.horizontal,
        r = t.mode === `transform`,
        i = n ? `left` : `top`,
        s = e.options.scrollMargin,
        c = e.getVirtualItems()
      for (let a of c) {
        let o = a.start - s,
          c = e.elementsCache.get(a.key)
        c &&
          t.lastPositions.get(c) !== o &&
          (t.lastPositions.set(c, o),
          r
            ? (c.style.transform = n ? `translate3d(${o}px, 0, 0)` : `translate3d(0, ${o}px, 0)`)
            : (c.style[i] = `${o}px`))
      }
    },
    c = {
      ...r,
      onChange: (t, n) => {
        var o
        let c = a.current,
          l = !0
        if (c.enabled) {
          s(t)
          let e = t.range,
            n = c.prevRange
          ;((l =
            !n ||
            n.isScrolling !== t.isScrolling ||
            n.startIndex !== e?.startIndex ||
            n.endIndex !== e?.endIndex),
            l &&
              (c.prevRange = e
                ? { startIndex: e.startIndex, endIndex: e.endIndex, isScrolling: t.isScrolling }
                : null))
        }
        ;(l && (e && n ? (0, v.flushSync)(i) : i()), (o = r.onChange) == null || o.call(r, t, n))
      },
    },
    [l] = _.useState(() => {
      let e = new Z(c)
      return Object.assign(e, {
        containerRef: (t) => {
          let n = a.current
          if (((n.container = t), (n.lastSize = null), t && n.enabled)) {
            let r = e.getTotalSize()
            n.lastSize = r
            let i = e.options.horizontal ? `width` : `height`
            t.style[i] = `${r}px`
          }
        },
      })
    })
  return (
    l.setOptions(c),
    zl(() => l._didMount(), []),
    zl(() => (o(l), l._willUpdate())),
    zl(() => {
      s(l)
    }),
    l
  )
}
function Vl(e) {
  return Bl({ observeElementRect: Ml, observeElementOffset: Y, scrollToFn: X, ...e })
}
function Hl(e, t, n = 160) {
  let r = t.getBoundingClientRect()
  if (!r.width || !r.height) return
  let i = Math.min(1, n / Math.max(r.width, r.height)),
    a = Math.max(48, Math.round(r.width * i)),
    o = Math.max(48, Math.round(r.height * i)),
    s = t.cloneNode(!0)
  ;((s.style.cssText = `position:fixed;left:-9999px;top:0;width:${a}px;height:${o}px;margin:0;pointer-events:none;z-index:9999;border-radius:8px;overflow:hidden;opacity:.85;`),
    document.body.appendChild(s),
    e.dataTransfer.setDragImage(s, a / 2, o / 2),
    window.setTimeout(() => s.remove(), 100))
}
var Ul = 96,
  Wl = 8,
  Gl = 28,
  Kl = (0, _.memo)(function ({ item: e, mark: t, active: n, deleted: r, picked: i, onSelect: a }) {
    let { t: o } = Ft(),
      [s, c] = (0, _.useState)(null),
      l = e.type === `video` ? `poster` : `image`,
      u = (0, _.useCallback)(() => {
        K.getState().setItemLoaded(e.id)
      }, [e.id])
    return (
      (0, _.useEffect)(() => {
        let t = !1
        if ((c(null), r)) {
          u()
          return
        }
        return (
          nl(e.id, l).then((e) => {
            ;(u(), !t && e && c(e))
          }),
          () => {
            t = !0
          }
        )
      }, [e.id, l, r, u]),
      (0, L.jsxs)(`div`, {
        "data-id": e.id,
        onClick: (t) => a(t, e.id),
        draggable: !0,
        onDragStart: (t) => {
          let n = K.getState(),
            r = n.multiSel.includes(e.id) ? n.multiSel : [e.id]
          ;(t.dataTransfer.setData(`text/plain`, r.join(`,`)),
            (t.dataTransfer.effectAllowed = `move`),
            n.setDragActive(!0),
            Hl(t, t.currentTarget))
        },
        onDragEnd: () => K.getState().setDragActive(!1),
        title: e.stem,
        className: ks(
          `group/cell relative aspect-square w-full cursor-pointer overflow-hidden rounded-lg border-2 bg-black transition-colors`,
          n && `border-primary`,
          !n && t === `keep` && `border-emerald-500`,
          !n && t === `drop` && `border-red-500`,
          i && `border-primary shadow-[0_0_0_2px_rgba(76,141,255,.55)]`,
          r && `opacity-35`,
        ),
        children: [
          s
            ? (0, L.jsx)(`img`, {
                src: fl(s) ?? void 0,
                alt: e.stem,
                onLoad: u,
                onError: u,
                className: `h-full w-full object-cover`,
                draggable: !1,
              })
            : (0, L.jsx)(`div`, {
                className: `text-muted-foreground flex h-full w-full items-center justify-center p-1 text-center text-[10px] leading-tight break-all`,
                children: e.stem,
              }),
          e.type === `live`
            ? (0, L.jsx)(`span`, {
                className: `absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white`,
                children: o(`photoTriage.live`),
              })
            : e.type === `video`
              ? (0, L.jsx)(`span`, {
                  className: `absolute top-1 left-1 rounded bg-black/60 px-1 text-[10px] text-white`,
                  children: `▶`,
                })
              : null,
          r
            ? (0, L.jsx)(`span`, {
                className: `absolute right-1 bottom-1 rounded bg-red-500 px-1 text-[10px] text-white`,
                children: o(`photoTriage.deleted`),
              })
            : t
              ? (0, L.jsx)(`span`, {
                  className: ks(
                    `absolute top-1 right-1 text-xs font-bold`,
                    t === `keep` ? `text-emerald-400` : `text-red-400`,
                  ),
                  children: o(t === `keep` ? `photoTriage.keep` : `photoTriage.drop`),
                })
              : null,
          i
            ? (0, L.jsx)(`span`, {
                className: `bg-primary absolute bottom-1 left-1 flex size-4 items-center justify-center rounded-full text-[10px] text-white`,
                children: `✓`,
              })
            : null,
        ],
      })
    )
  })
function ql({ controller: e, onRegisterJump: t }) {
  let { currentId: n, multiSel: r, selectCurrent: i, sel: a, deletedSet: o, rows: s } = e,
    { t: c } = Ft(),
    l = (0, _.useRef)(null),
    [u, d] = (0, _.useState)(0)
  ;(0, _.useEffect)(() => {
    let e = l.current
    if (!e) return
    let t = new ResizeObserver((e) => {
      let t = e[0]?.contentRect.width ?? 0
      d(t)
    })
    return (t.observe(e), () => t.disconnect())
  }, [])
  let f = u > 0 ? Math.max(1, Math.floor((u + Wl) / 104)) : 3,
    p = f > 0 ? (u - Wl * (f - 1)) / f : Ul,
    m = Math.max(p, 96),
    h = (0, _.useMemo)(() => {
      let e = [],
        t = [],
        n = () => {
          if (t.length) {
            for (let n = 0; n < t.length; n += f) {
              let r = t.slice(n, n + f)
              e.push({ key: `g:${e.length}`, kind: `grid`, items: r })
            }
            t = []
          }
        }
      for (let r of s)
        r.kind === `header`
          ? (n(), e.push({ key: `h:${r.folder}`, kind: `header`, folder: r.folder }))
          : t.push(r.item)
      return (n(), e)
    }, [s, f]),
    g = (0, _.useCallback)((e) => (h[e]?.kind === `header` ? Gl : m), [h, m]),
    v = Vl({
      count: h.length,
      getScrollElement: () => l.current,
      estimateSize: g,
      getItemKey: (e) => h[e]?.key ?? e,
      overscan: 4,
    })
  ;(0, _.useEffect)(() => {
    v.measure()
  }, [m, v])
  let y = v.getVirtualItems()
  ;(0, _.useEffect)(() => {
    t &&
      t((e) => {
        let t = h.findIndex((t) => t.kind === `header` && t.folder === e)
        t >= 0 && v.scrollToIndex(t, { align: `start` })
      })
  }, [h, v])
  let b = (0, _.useCallback)(
    (e) => {
      let t = e + 20,
        n = 0,
        r = -1
      for (let e = 0; e < h.length; e++) {
        let i = h[e].kind === `header` ? Gl : m
        if (n + i >= t) {
          r = e
          break
        }
        n += i
      }
      r === -1 && (r = h.length - 1)
      let i = null
      for (let e = r; e >= 0; e--)
        if (h[e].kind === `header`) {
          i = h[e].folder ?? null
          break
        }
      let a = K.getState()
      a.currentFolder !== i && a.setCurrentFolder(i)
    },
    [h, m],
  )
  return (
    (0, _.useEffect)(() => {
      let e = l.current
      if (!e) return
      let t = 0,
        n = () => {
          t ||= requestAnimationFrame(() => {
            ;((t = 0), b(e.scrollTop))
          })
        }
      return (
        e.addEventListener(`scroll`, n, { passive: !0 }),
        b(e.scrollTop),
        () => {
          ;(e.removeEventListener(`scroll`, n), t && cancelAnimationFrame(t))
        }
      )
    }, [b]),
    s.length
      ? (0, L.jsx)(`div`, {
          ref: l,
          className: `relative h-full overflow-auto`,
          children: (0, L.jsx)(`div`, {
            className: `relative w-full`,
            style: { height: v.getTotalSize() },
            children: y.map((e) => {
              let t = h[e.index]
              if (t.kind === `header`)
                return (0, L.jsxs)(
                  `div`,
                  {
                    className: `bg-background/95 text-primary sticky top-0 z-10 flex h-7 w-full items-center gap-1 border-b border-dashed px-2 text-xs font-semibold`,
                    style: { transform: `translateY(${e.start}px)` },
                    children: [`📁 `, t.folder === `.` ? c(`photoTriage.root`) : t.folder],
                  },
                  t.key,
                )
              let s = t.items ?? []
              return (0, L.jsx)(
                `div`,
                {
                  className: `absolute top-0 left-0 flex w-full px-1.5`,
                  style: { transform: `translateY(${e.start}px)`, height: m, gap: Wl },
                  children: s.map((e) => {
                    let t = !!e.deleted || o.has(e.id),
                      s = t ? null : (a[e.id] ?? null)
                    return (0, L.jsx)(
                      `div`,
                      {
                        className: `min-w-0 shrink-0`,
                        style: { width: p },
                        children: (0, L.jsx)(Kl, {
                          item: e,
                          mark: s,
                          active: e.id === n,
                          deleted: t,
                          picked: r.includes(e.id),
                          onSelect: (e, t) =>
                            i(t, { toggle: e.metaKey || e.ctrlKey, range: e.shiftKey }),
                        }),
                      },
                      e.id,
                    )
                  }),
                },
                t.key,
              )
            }),
          }),
        })
      : (0, L.jsx)(`div`, {
          className: `text-muted-foreground flex h-full items-center justify-center text-sm`,
          children: c(`photoTriage.errorEmptyFilter`),
        })
  )
}
var Jl = `#ffb454`,
  Yl = `#2ecc71`,
  Xl = `#4c8dff`,
  Zl = (0, _.memo)(function ({ controller: e, onJumpToFolder: t }) {
    let { t: n } = Ft(),
      { rows: r } = e,
      i = K((e) => e.loadedIds),
      a = K((e) => e.currentFolder),
      [o, s] = (0, _.useState)(null),
      [c, l] = (0, _.useState)(null),
      u = (0, _.useMemo)(() => r.filter((e) => e.kind === `header`), [r]),
      d = (0, _.useMemo)(() => new Set(i), [i]),
      f = (0, _.useMemo)(() => $s(r, d), [r, d])
    if (!u.length) return null
    let p = c ? f.get(c.folder) : void 0
    return (0, L.jsxs)(`div`, {
      className: `bg-background/90 flex w-[18px] flex-none flex-col border-r`,
      onMouseLeave: () => {
        ;(s(null), l(null))
      },
      children: [
        u.map((e) => {
          let r = f.get(e.folder),
            i = r?.total ?? 0,
            c = r?.loaded ?? 0,
            u = i > 0 ? Math.min(1, Math.max(0, c / i)) : 0,
            d = o === e.folder || a === e.folder,
            p = `${e.folder === `.` ? n(`photoTriage.root`) : e.folder}${c < i ? ` ${c}/${i}` : ``}`,
            m = d ? Xl : Jl
          return (0, L.jsxs)(
            `button`,
            {
              type: `button`,
              "aria-label": p,
              onClick: () => t(e.folder),
              onMouseEnter: (t) => {
                s(e.folder)
                let n = t.currentTarget.getBoundingClientRect()
                l({ x: n.right + 8, y: n.top + n.height / 2, folder: e.folder })
              },
              className: `relative flex min-h-[6px] w-full flex-1 cursor-pointer items-center justify-center`,
              children: [
                (0, L.jsx)(`span`, {
                  className: ks(
                    `rounded-full transition-all`,
                    d ? `h-[3px] w-[13px] bg-[#4c8dff]` : `bg-muted-foreground/45 h-[2px] w-[9px]`,
                  ),
                }),
                (0, L.jsx)(`span`, {
                  className: `pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-all`,
                  style: {
                    width: d ? 13 : 9,
                    height: d ? 3 : 2,
                    "--p": u.toFixed(4),
                    ...(u >= 1
                      ? { backgroundColor: d ? Xl : Yl }
                      : {
                          background: `linear-gradient(90deg, ${m} 0, ${m} calc(var(--p)*50% - 1px), transparent calc(var(--p)*50%), transparent calc(100% - var(--p)*50%), ${m} calc(100% - var(--p)*50% + 1px), ${m} 100%)`,
                        }),
                  },
                }),
                (0, L.jsx)(`span`, { className: `sr-only`, children: p }),
              ],
            },
            e.folder,
          )
        }),
        c
          ? (0, v.createPortal)(
              (0, L.jsxs)(`div`, {
                className: `bg-popover text-popover-foreground pointer-events-none fixed z-[99] max-w-[60vw] truncate rounded-md border px-2.5 py-1 text-xs shadow-md`,
                style: {
                  left: c.x,
                  top: Math.max(8, Math.min(c.y, window.innerHeight - 34)),
                  transform: `translateY(-50%)`,
                },
                children: [
                  c.folder === `.` ? n(`photoTriage.root`) : c.folder,
                  p && p.loaded < p.total ? ` ${p.loaded}/${p.total}` : ``,
                ],
              }),
              document.body,
            )
          : null,
      ],
    })
  }),
  Ql = (0, _.memo)(function ({ controller: e, onRestore: t }) {
    let { t: n } = Ft(),
      {
        current: r,
        currentIndex: i,
        visible: a,
        liveView: o,
        nav: s,
        markCurrent: c,
        dragActive: l,
      } = e,
      [u, d] = (0, _.useState)(null),
      [f, p] = (0, _.useState)(null),
      [m, h] = (0, _.useState)(!1),
      [g, v] = (0, _.useState)(!1),
      [y, b] = (0, _.useState)(0),
      x = (0, _.useRef)(null),
      S = r ? e.deletedSet.has(r.id) : !1,
      C = (0, _.useCallback)(
        async (e) => {
          if (e.type === `video`) {
            let t = await Zc(e.id, `video`)
            ;(h(!0), d(t))
            return
          }
          if (e.type === `live` && o === `motion`) {
            let t = await Zc(e.id, `video`)
            if (t) {
              ;(h(!0), d(t))
              return
            }
          }
          ;(h(!1), d(null))
          let t = await Zc(e.id, `image`)
          p(t)
        },
        [o],
      )
    ;((0, _.useEffect)(() => {
      ;(b(0), v(!1), p(null), d(null), h(!1), r && !S && C(r))
    }, [r?.id, C, S]),
      (0, _.useEffect)(() => {
        if (!m) return
        let e = (e) => {
          if (e.key === ` `) {
            e.preventDefault()
            let t = x.current
            if (!t) return
            t.paused ? t.play() : t.pause()
          }
        }
        return (
          window.addEventListener(`keydown`, e),
          () => window.removeEventListener(`keydown`, e)
        )
      }, [m]),
      (0, _.useEffect)(() => {
        if (!g) return
        let e = (e) => {
          e.key === `Escape` && v(!1)
        }
        return (
          window.addEventListener(`keydown`, e),
          () => window.removeEventListener(`keydown`, e)
        )
      }, [g]))
    let w = (0, _.useMemo)(
        () =>
          r
            ? r.type === `live`
              ? n(`photoTriage.livePair`)
              : r.type === `video`
                ? n(`photoTriage.video`)
                : n(`photoTriage.photo`)
            : null,
        [r, n],
      ),
      T = r?.size_bytes
        ? n(`photoTriage.sizeFormat`, { size: (r.size_bytes / 1024 / 1024).toFixed(1) })
        : ``,
      E = `${e.multiSel.length ? e.multiSel.join(`,`) : (r?.id ?? ``)}`,
      ee = y === 1 ? `w-full max-w-none` : y === 2 ? `w-[200%] max-w-none` : `max-h-full max-w-full`
    return (0, L.jsxs)(`div`, {
      className: `flex h-full min-w-0 flex-1 flex-col`,
      children: [
        (0, L.jsx)(`div`, {
          className: `flex min-h-0 flex-1 cursor-zoom-in items-center justify-center overflow-hidden bg-black p-3 select-none`,
          onClick: (e) => {
            e.target === e.currentTarget && !m && v(!0)
          },
          children:
            m && u
              ? (0, L.jsx)(
                  `video`,
                  {
                    ref: x,
                    src: fl(u) ?? void 0,
                    controls: !0,
                    className: `max-h-full max-w-full object-contain`,
                  },
                  u,
                )
              : f
                ? (0, L.jsx)(
                    `img`,
                    {
                      src: fl(f) ?? void 0,
                      alt: r?.stem,
                      draggable: !0,
                      onDragStart: (e) => {
                        E &&
                          (e.dataTransfer.setData(`text/plain`, E),
                          (e.dataTransfer.effectAllowed = `move`),
                          K.getState().setDragActive(!0),
                          Hl(e, e.currentTarget, 240))
                      },
                      onDragEnd: () => K.getState().setDragActive(!1),
                      onClick: () => v(!0),
                      className: `max-h-full max-w-full cursor-zoom-in object-contain`,
                    },
                    f,
                  )
                : (0, L.jsx)(`p`, {
                    className: `text-muted-foreground text-sm select-none`,
                    children: n(`photoTriage.loading`),
                  }),
        }),
        (0, L.jsxs)(`div`, {
          className: ks(
            `bg-background flex flex-wrap items-center gap-2 border-t px-3 py-2 transition-opacity`,
            l && `pointer-events-none opacity-35`,
          ),
          children: [
            (0, L.jsx)(`span`, {
              className: `text-muted-foreground max-w-[30%] min-w-0 truncate text-xs`,
              children: r ? pl(r.image || r.video || r.stem) : n(`photoTriage.none`),
            }),
            w
              ? (0, L.jsx)(`span`, {
                  className: ks(
                    `rounded px-1.5 py-0.5 text-[11px]`,
                    r?.type === `live`
                      ? `border border-amber-400 text-amber-400`
                      : `bg-muted text-muted-foreground`,
                  ),
                  children: w,
                })
              : null,
            T
              ? (0, L.jsx)(`span`, { className: `text-muted-foreground text-xs`, children: T })
              : null,
            (0, L.jsxs)(`span`, {
              className: `ml-auto flex items-center gap-1.5`,
              children: [
                r?.type === `live` && !S
                  ? (0, L.jsxs)(G, {
                      variant: `outline`,
                      size: `sm`,
                      onClick: e.toggleLive,
                      children: [
                        o === `motion`
                          ? (0, L.jsx)(on, { size: 13, className: `mr-1` })
                          : (0, L.jsx)(nn, { size: 13, className: `mr-1` }),
                        n(o === `motion` ? `photoTriage.viewStatic` : `photoTriage.viewMotion`),
                      ],
                    })
                  : null,
                (0, L.jsx)(G, {
                  variant: `outline`,
                  size: `sm`,
                  onClick: () => s(-1),
                  disabled: !a.length,
                  children: n(`photoTriage.prev`),
                }),
                S
                  ? (0, L.jsx)(G, {
                      variant: `outline`,
                      size: `sm`,
                      onClick: () => r && t([r.id]),
                      children: n(`photoTriage.restore`),
                    })
                  : (0, L.jsxs)(L.Fragment, {
                      children: [
                        (0, L.jsx)(G, {
                          variant: `outline`,
                          size: `sm`,
                          className: `border-emerald-500 text-emerald-500 hover:bg-emerald-500/10 hover:text-emerald-500`,
                          onClick: () => r && c(`keep`),
                          disabled: !r,
                          children: n(`photoTriage.keepShortcut`),
                        }),
                        (0, L.jsx)(G, {
                          variant: `outline`,
                          size: `sm`,
                          className: `border-red-500 text-red-500 hover:bg-red-500/10 hover:text-red-500`,
                          onClick: () => r && c(`drop`),
                          disabled: !r,
                          children: n(`photoTriage.dropShortcut`),
                        }),
                      ],
                    }),
                (0, L.jsx)(G, {
                  variant: `outline`,
                  size: `sm`,
                  onClick: () => s(1),
                  disabled: !a.length,
                  children: n(`photoTriage.next`),
                }),
                (0, L.jsxs)(`span`, {
                  className: `text-muted-foreground ml-1 hidden w-16 text-right text-[11px] sm:inline`,
                  children: [i >= 0 ? i + 1 : 0, `/`, a.length],
                }),
              ],
            }),
          ],
        }),
        g && f
          ? (0, L.jsxs)(`div`, {
              className: `fixed inset-0 z-[80] cursor-zoom-out overflow-auto bg-black/90`,
              onMouseDown: (e) => {
                e.target.tagName !== `IMG` && v(!1)
              },
              children: [
                (0, L.jsx)(`div`, {
                  className: `flex min-h-full items-center justify-center p-6`,
                  children: (0, L.jsx)(`img`, {
                    src: fl(f) ?? void 0,
                    alt: r?.stem,
                    onClick: (e) => {
                      ;(e.stopPropagation(), b((e) => (e + 1) % 3))
                    },
                    className: ks(`object-contain select-none`, ee),
                  }),
                }),
                (0, L.jsx)(`button`, {
                  type: `button`,
                  "aria-label": n(`photoTriage.closeLightbox`),
                  className: `fixed top-4 right-4 z-[81] rounded bg-black/50 px-3 py-1.5 text-white`,
                  onClick: () => v(!1),
                  children: `✕`,
                }),
              ],
            })
          : null,
      ],
    })
  })
function $l({ open: e, onOpenChange: t, items: n, onConfirm: r, busy: i }) {
  let { t: a } = Ft(),
    [o, s] = (0, _.useState)(!1),
    { itemCount: c, fileCount: l } = (0, _.useMemo)(() => {
      let e = 0
      for (let t of n) e += [t.image, t.video].filter(Boolean).length
      return { itemCount: n.length, fileCount: e }
    }, [n])
  return (0, L.jsx)(js, {
    open: e,
    onOpenChange: (e) => (i || o ? void 0 : t(e)),
    children: (0, L.jsxs)(Ps, {
      className: `max-w-2xl`,
      children: [
        (0, L.jsxs)(Fs, {
          children: [
            (0, L.jsx)(Ls, { children: a(`photoTriage.trashConfirmTitle`) }),
            (0, L.jsx)(Rs, { children: a(`photoTriage.trashConfirmSub`, { count: c, count2: l }) }),
          ],
        }),
        (0, L.jsx)(`div`, {
          className: `bg-muted/40 max-h-[48vh] space-y-2 overflow-auto rounded-md border p-3`,
          children: n.map((e) =>
            (0, L.jsxs)(
              `div`,
              {
                className: `text-sm`,
                children: [
                  (0, L.jsxs)(`b`, { children: [`[`, e.type, `]`] }),
                  ` `,
                  e.stem,
                  (0, L.jsx)(`ul`, {
                    className: `text-muted-foreground mt-1 list-disc space-y-0.5 pl-5`,
                    children: [e.image, e.video]
                      .filter(Boolean)
                      .map((e) => (0, L.jsx)(`li`, { className: `break-all`, children: pl(e) }, e)),
                  }),
                ],
              },
              e.id,
            ),
          ),
        }),
        (0, L.jsxs)(Is, {
          children: [
            (0, L.jsx)(G, {
              variant: `outline`,
              disabled: i || o,
              onClick: () => t(!1),
              children: a(`common.cancel`),
            }),
            (0, L.jsx)(G, {
              variant: `destructive`,
              disabled: i || o,
              onClick: async () => {
                if (!o) {
                  s(!0)
                  try {
                    await r()
                  } finally {
                    s(!1)
                  }
                }
              },
              children:
                i || o
                  ? (0, L.jsxs)(L.Fragment, {
                      children: [
                        (0, L.jsx)(tn, { size: 14, className: `mr-1 animate-spin` }),
                        a(`photoTriage.trashProcessing`),
                      ],
                    })
                  : a(`photoTriage.trashConfirmOk`),
            }),
          ],
        }),
      ],
    }),
  })
}
function eu({ open: e, onOpenChange: t }) {
  let { t: n } = Ft(),
    [r, i] = (0, _.useState)([]),
    [a, o] = (0, _.useState)(new Set()),
    [s, c] = (0, _.useState)(!1),
    [l, u] = (0, _.useState)(!1),
    [d, f] = (0, _.useState)(!1)
  ;((0, _.useEffect)(() => {
    e &&
      (c(!0),
      u(!1),
      ul().then((e) => {
        if (e === null) {
          ;(k(n(`photoTriage.emptyDirsLoadFailed`)), c(!1))
          return
        }
        ;(i(e), o(new Set(e)), c(!1))
      }))
  }, [e, n]),
    (0, _.useEffect)(() => {
      if (!l) return
      let e = window.setTimeout(() => u(!1), 8e3)
      return () => window.clearTimeout(e)
    }, [l]))
  let p = (e) => {
    ;(o(e ? new Set(r) : new Set()), u(!1))
  }
  return (0, L.jsx)(js, {
    open: e,
    onOpenChange: t,
    children: (0, L.jsxs)(Ps, {
      className: `max-w-lg`,
      children: [
        (0, L.jsxs)(Fs, {
          children: [
            (0, L.jsx)(Ls, { children: n(`photoTriage.emptyDirs`) }),
            (0, L.jsx)(Rs, {
              children: r.length
                ? n(`photoTriage.emptyDirsCount`, { count: r.length })
                : n(`photoTriage.emptyDirsNone`),
            }),
          ],
        }),
        (0, L.jsx)(`div`, {
          className: `max-h-[46vh] space-y-0.5 overflow-y-auto`,
          children: s
            ? (0, L.jsx)(`p`, {
                className: `text-muted-foreground py-6 text-center text-sm`,
                children: n(`photoTriage.emptyDirsLoading`),
              })
            : r.length === 0
              ? (0, L.jsx)(`p`, {
                  className: `text-muted-foreground py-6 text-center text-sm`,
                  children: n(`photoTriage.emptyDirsNone`),
                })
              : r.map((e) =>
                  (0, L.jsxs)(
                    `label`,
                    {
                      className: `hover:bg-accent flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm`,
                      children: [
                        (0, L.jsx)(`input`, {
                          type: `checkbox`,
                          checked: a.has(e),
                          onChange: (t) => {
                            let n = new Set(a)
                            ;(t.target.checked ? n.add(e) : n.delete(e), o(n), u(!1))
                          },
                          className: `accent-primary size-4`,
                        }),
                        (0, L.jsx)(`span`, {
                          className: `min-w-0 flex-1 truncate`,
                          title: e,
                          children: pl(e),
                        }),
                      ],
                    },
                    e,
                  ),
                ),
        }),
        (0, L.jsx)(Is, {
          children: (0, L.jsxs)(`div`, {
            className: `flex w-full items-center justify-between gap-2`,
            children: [
              (0, L.jsxs)(`label`, {
                className: `flex cursor-pointer items-center gap-1.5 text-sm`,
                children: [
                  (0, L.jsx)(`input`, {
                    type: `checkbox`,
                    checked: r.length > 0 && a.size === r.length,
                    disabled: r.length === 0,
                    onChange: (e) => p(e.target.checked),
                    className: `accent-primary size-4`,
                  }),
                  n(`photoTriage.emptyDirsAll`),
                ],
              }),
              (0, L.jsxs)(`div`, {
                className: `flex gap-2`,
                children: [
                  (0, L.jsx)(G, {
                    variant: `outline`,
                    onClick: () => t(!1),
                    disabled: d,
                    children: n(`common.close`),
                  }),
                  (0, L.jsx)(G, {
                    variant: l ? `destructive` : `default`,
                    disabled: d || a.size === 0,
                    onClick: async () => {
                      let e = [...a]
                      if (!d) {
                        if (!l) {
                          if (!e.length) {
                            k(n(`photoTriage.emptyDirsSelectFirst`))
                            return
                          }
                          u(!0)
                          return
                        }
                        f(!0)
                        try {
                          let t = await dl(e)
                          ;(k(n(`photoTriage.emptyDirsDeleted`, { count: t.count })),
                            t.errorCount > 0 &&
                              console.warn(
                                `[photo-triage] empty dirs delete failed:`,
                                t.errorCount,
                              ))
                          let r = await ul()
                          r !== null && (i(r), o(new Set(r)))
                        } finally {
                          ;(f(!1), u(!1))
                        }
                      }
                    },
                    children: l
                      ? n(`photoTriage.emptyDirsArm`, { count: a.size })
                      : n(`photoTriage.emptyDirsDelete`),
                  }),
                ],
              }),
            ],
          }),
        }),
      ],
    }),
  })
}
var tu = [
  [`k1`, `v1`],
  [`k2`, `v2`],
  [`k3`, `v3`],
  [`k4`, `v4`],
  [`k5`, `v5`],
  [`k6`, `v6`],
  [`k7`, `v7`],
  [`k8`, `v8`],
  [`k9`, `v9`],
  [`k10`, `v10`],
  [`k11`, `v11`],
  [`k12`, `v12`],
  [`k13`, `v13`],
  [`k14`, `v14`],
  [`k15`, `v15`],
]
function nu({ open: e, onOpenChange: t }) {
  let { t: n } = Ft()
  return (0, L.jsx)(js, {
    open: e,
    onOpenChange: t,
    children: (0, L.jsxs)(Ps, {
      className: `max-w-xl`,
      children: [
        (0, L.jsxs)(Fs, {
          children: [
            (0, L.jsx)(Ls, { children: n(`photoTriage.helpTitle`) }),
            (0, L.jsx)(Rs, { children: n(`photoTriage.keyboard`) }),
          ],
        }),
        (0, L.jsx)(`div`, {
          className: `max-h-[60vh] overflow-y-auto`,
          children: (0, L.jsx)(`table`, {
            className: `w-full text-sm`,
            children: (0, L.jsx)(`tbody`, {
              children: tu.map(([e, t], r) =>
                (0, L.jsxs)(
                  `tr`,
                  {
                    className: r % 2 ? `bg-muted/30` : void 0,
                    children: [
                      (0, L.jsx)(`td`, {
                        className: `text-muted-foreground w-40 px-2 py-1.5 align-top whitespace-nowrap`,
                        children: (0, L.jsx)(`kbd`, {
                          className: `bg-muted rounded border px-1.5 py-0.5 font-mono text-[11px]`,
                          children: n(`photoTriage.${e}`),
                        }),
                      }),
                      (0, L.jsx)(`td`, {
                        className: `px-2 py-1.5`,
                        children: n(`photoTriage.${t}`),
                      }),
                    ],
                  },
                  e,
                ),
              ),
            }),
          }),
        }),
        (0, L.jsx)(Is, {
          children: (0, L.jsx)(G, {
            variant: `outline`,
            onClick: () => t(!1),
            children: n(`photoTriage.helpOk`),
          }),
        }),
      ],
    }),
  })
}
var ru = `photo-triage:stripW`
function iu() {
  try {
    let e = parseInt(localStorage.getItem(ru) ?? ``, 10)
    return Number.isFinite(e) && e >= 220 ? e : 320
  } catch {
    return 320
  }
}
function au() {
  let { t: e } = Ft(),
    t = K((e) => e.setStripWidth),
    n = (0, _.useRef)(!1),
    r = (e) => {
      if (!n.current) return
      let r = Math.floor(window.innerWidth * 0.8),
        i = Math.max(220, Math.min(e.clientX ?? 0, r))
      t(i)
    },
    i = () => {
      ;((n.current = !1),
        document.body.classList.remove(`select-none`, `cursor-col-resize`),
        document.removeEventListener(`mousemove`, r),
        document.removeEventListener(`mouseup`, i))
      try {
        localStorage.setItem(ru, String(K.getState().stripWidth))
      } catch {}
    }
  return (
    (0, _.useEffect)(
      () => () => {
        ;(document.removeEventListener(`mousemove`, r), document.removeEventListener(`mouseup`, i))
      },
      [],
    ),
    (0, L.jsx)(`div`, {
      className: ks(
        `bg-muted/60 hover:bg-primary w-1.5 flex-none cursor-col-resize border-x transition-colors`,
      ),
      title: e(`photoTriage.splitterHint`),
      onMouseDown: (e) => {
        ;(e.preventDefault(),
          (n.current = !0),
          document.body.classList.add(`select-none`, `cursor-col-resize`),
          document.addEventListener(`mousemove`, r),
          document.addEventListener(`mouseup`, i))
      },
      onDoubleClick: () => {
        try {
          localStorage.removeItem(ru)
        } catch {}
        t(320)
      },
    })
  )
}
function ou({ controller: e, onAddFolder: t }) {
  let { t: n } = Ft(),
    {
      folderCandidates: r,
      movedCounts: i,
      multiSel: a,
      moveToFolder: o,
      selectAll: s,
      allSelected: c,
      dragActive: l,
    } = e,
    [u, d] = (0, _.useState)(null),
    [f, p] = (0, _.useState)(null),
    m = (0, _.useRef)(null),
    h = (0, _.useRef)(0),
    g = (0, _.useRef)(0),
    v = (0, _.useCallback)(() => {
      if (!h.current) {
        g.current = 0
        return
      }
      let e = m.current
      ;(e && (e.scrollTop += h.current * 7), (g.current = requestAnimationFrame(v)))
    }, []),
    y = (0, _.useCallback)(() => {
      ;((h.current = 0), (g.current &&= (cancelAnimationFrame(g.current), 0)))
    }, [])
  ;(0, _.useEffect)(() => y, [y])
  let b = (e) => {
      ;(e.preventDefault(), (e.dataTransfer.dropEffect = `move`))
      let t = m.current
      if (!t) return
      let n = t.getBoundingClientRect()
      ;((h.current = e.clientY < n.top + 26 ? -1 : +(e.clientY > n.bottom - 26)),
        h.current && !g.current && (g.current = requestAnimationFrame(v)))
    },
    x = (e) => {
      o(e).then((t) => {
        t.ok
          ? k(n(`photoTriage.movedItems`, { count: t.count, path: pl(e) }))
          : t.reason === `empty`
            ? k(n(`photoTriage.pickFirst`))
            : k(n(`photoTriage.moveFailed`))
      })
    },
    S = (e, t) => {
      ;(t.preventDefault(), d(null))
      let n = t.dataTransfer.getData(`text/plain`).split(`,`).filter(Boolean)
      n.length && p({ ids: n, folder: e })
    }
  return (0, L.jsxs)(`div`, {
    className: ks(
      `bg-background flex items-center gap-2 border-b px-3 py-2 transition-colors`,
      l && `bg-primary/5 ring-primary ring-2 ring-inset`,
    ),
    children: [
      (0, L.jsx)(`span`, {
        className: `text-muted-foreground text-xs`,
        children: n(`photoTriage.moveTo`),
      }),
      (0, L.jsx)(`span`, {
        className: `text-primary text-xs font-semibold`,
        children: a.length ? n(`photoTriage.selectedCount`, { count: a.length }) : ``,
      }),
      (0, L.jsx)(`div`, {
        ref: m,
        className: `flex max-h-[84px] min-h-0 flex-1 flex-wrap items-start gap-1.5 overflow-y-auto`,
        onDragOver: b,
        onDragLeave: y,
        onDrop: y,
        children:
          r.length === 0
            ? (0, L.jsx)(`span`, {
                className: `text-muted-foreground self-center text-xs`,
                children: n(`photoTriage.folderEmptyHint`),
              })
            : r.map((e, t) =>
                (0, L.jsxs)(
                  `div`,
                  {
                    className: ks(
                      `group bg-muted/50 flex max-w-[210px] cursor-pointer items-center gap-1.5 rounded-lg border px-2 py-1.5 transition-colors`,
                      l && `border-primary/50 [&>*]:pointer-events-none`,
                      u === e &&
                        `border-primary bg-primary/15 shadow-[0_0_0_2px_var(--color-primary),0_0_20px_rgba(76,141,255,.5)]`,
                    ),
                    title: `${n(`photoTriage.moveInto`, { path: pl(e) })}${t < 9 ? ` (${t + 1})` : ``}`,
                    onClick: () => x(e),
                    onContextMenu: (t) => {
                      ;(t.preventDefault(), ol(e))
                    },
                    onDragOver: (t) => {
                      ;(t.preventDefault(), (t.dataTransfer.dropEffect = `move`), d(e))
                    },
                    onDragLeave: (e) => {
                      e.currentTarget.contains(e.relatedTarget) || d(null)
                    },
                    onDrop: (t) => S(e, t),
                    children: [
                      (0, L.jsx)(`span`, { className: `text-sm`, children: `📁` }),
                      t < 9
                        ? (0, L.jsx)(`span`, {
                            className: `text-muted-foreground text-[10px]`,
                            children: t + 1,
                          })
                        : null,
                      (0, L.jsx)(`span`, {
                        className: `max-w-[110px] min-w-0 truncate text-xs`,
                        children: e.split(`/`).filter(Boolean).pop(),
                      }),
                      i[e]
                        ? (0, L.jsxs)(`span`, {
                            className: `bg-primary/15 text-primary rounded px-1 text-[10px]`,
                            children: [`+`, i[e]],
                          })
                        : null,
                      (0, L.jsx)(`button`, {
                        type: `button`,
                        "aria-label": n(`photoTriage.removeFromBar`),
                        className: `text-muted-foreground hover:text-destructive ml-auto flex-none opacity-0 transition-opacity group-hover:opacity-100`,
                        title: n(`photoTriage.removeFromBar`),
                        onClick: (t) => {
                          ;(t.stopPropagation(), K.getState().removeFolderCandidate(e), Rc())
                        },
                        children: (0, L.jsx)(cn, { size: 12 }),
                      }),
                    ],
                  },
                  e,
                ),
              ),
      }),
      (0, L.jsx)(G, {
        variant: `ghost`,
        size: `sm`,
        onClick: () => {
          s()
          let e = K.getState().multiSel.length
          e && k(n(`photoTriage.selectedAll`, { count: e }))
        },
        title: n(c ? `photoTriage.unselectAll` : `photoTriage.selectAll`),
        children: n(c ? `photoTriage.unselectAll` : `photoTriage.selectAll`),
      }),
      (0, L.jsxs)(G, {
        variant: `outline`,
        size: `sm`,
        onClick: t,
        title: n(`photoTriage.addFolderHint`),
        children: [(0, L.jsx)($t, { size: 14, className: `mr-1` }), n(`photoTriage.addFolder`)],
      }),
      (0, L.jsx)(js, {
        open: f !== null,
        onOpenChange: (e) => !e && p(null),
        children: (0, L.jsxs)(Ps, {
          className: `max-w-md`,
          children: [
            (0, L.jsx)(Fs, {
              children: (0, L.jsx)(Ls, { children: n(`photoTriage.moveConfirmTitle`) }),
            }),
            (0, L.jsx)(`p`, {
              className: `text-muted-foreground text-sm`,
              children: f
                ? n(`photoTriage.moveConfirmDesc`, { count: f.ids.length, path: pl(f.folder) })
                : ``,
            }),
            (0, L.jsxs)(Is, {
              children: [
                (0, L.jsx)(G, {
                  variant: `outline`,
                  onClick: () => p(null),
                  children: n(`common.cancel`),
                }),
                (0, L.jsx)(G, {
                  onClick: () => {
                    if (!f) return
                    let { ids: e, folder: t } = f
                    ;(p(null),
                      o(t, e).then((e) => {
                        e.ok
                          ? k(n(`photoTriage.movedItems`, { count: e.count, path: pl(t) }))
                          : k(n(`photoTriage.moveFailed`))
                      }))
                  },
                  children: n(`common.confirm`),
                }),
              ],
            }),
          ],
        }),
      }),
    ],
  })
}
function su() {
  let { t: e } = Ft(),
    t = ml()
  hl(t)
  let n = (0, _.useRef)(() => {}),
    [r, i] = (0, _.useState)(!1),
    [a, o] = (0, _.useState)(null),
    [s, c] = (0, _.useState)(!1)
  ;(0, _.useEffect)(() => {
    K.setState({ stripWidth: iu() })
  }, [])
  let l = K((e) => e.stripWidth),
    u = K((e) => e.helpOpen),
    d = K((e) => e.emptyDirsOpen),
    f = K((e) => e.dragActive),
    p = async () => {
      let t = await Uc()
      if (!t) return
      let n = K.getState()
      if (n.folderCandidates.includes(t)) {
        k(e(`photoTriage.alreadyInBar`))
        return
      }
      ;(n.addFolderCandidate(t), Rc(), i(!1), k(e(`photoTriage.addedFolder`, { path: pl(t) })))
    },
    m = (0, _.useCallback)(
      async (t) => {
        let n = await cl(t)
        n.ok &&
          k(
            n.errorCount > 0
              ? e(`photoTriage.restoredWarn`, { count: n.count, count2: n.errorCount })
              : e(`photoTriage.restored`, { count: n.count }),
          )
      },
      [e],
    ),
    h = (0, _.useCallback)(async () => {
      c(!0)
      try {
        let n = await sl(a?.map((e) => e.id) ?? [])
        if (n.ok) {
          k(
            n.errorCount > 0
              ? e(`photoTriage.trashMovedWarn`, { count: n.count, count2: n.errorCount })
              : e(`photoTriage.trashMoved`, { count: n.count }),
          )
          let r = K.getState()
          r.currentId && r.deletedIds.includes(r.currentId) && t.gotoNextTodo()
        } else k(e(`photoTriage.deleteFailed`))
      } finally {
        ;(c(!1), o(null))
      }
    }, [a, t, e])
  return t.view === `welcome`
    ? (0, L.jsx)(_l, { controller: t })
    : (0, L.jsxs)(`div`, {
        className: `flex h-full flex-col`,
        onDragOver: (e) => e.preventDefault(),
        onDrop: (e) => e.preventDefault(),
        children: [
          (0, L.jsx)(`div`, {
            className: ks(f && `pointer-events-none opacity-35`),
            children: (0, L.jsx)(vl, {
              controller: t,
              onConfirmTrash: o,
              onOpenHelp: () => K.getState().setHelpOpen(!0),
            }),
          }),
          (0, L.jsx)(`div`, {
            className: ks(f && `pointer-events-none opacity-35`),
            children: (0, L.jsx)(xl, { controller: t }),
          }),
          (0, L.jsx)(ou, { controller: t, onAddFolder: () => i(!0) }),
          (0, L.jsxs)(`div`, {
            className: `flex min-h-0 flex-1`,
            children: [
              t.showGroupBar
                ? (0, L.jsx)(Zl, { controller: t, onJumpToFolder: (e) => n.current(e) })
                : null,
              (0, L.jsx)(`div`, {
                className: `flex flex-none flex-col border-r`,
                style: { width: l },
                children: (0, L.jsx)(ql, {
                  controller: t,
                  onRegisterJump: (e) => {
                    n.current = e
                  },
                }),
              }),
              (0, L.jsx)(`div`, {
                className: ks(`flex flex-none`, f && `pointer-events-none opacity-35`),
                children: (0, L.jsx)(au, {}),
              }),
              (0, L.jsx)(`div`, {
                className: `flex min-w-0 flex-1`,
                children: (0, L.jsx)(Ql, { controller: t, onRestore: m }),
              }),
            ],
          }),
          (0, L.jsx)($l, {
            open: a !== null,
            onOpenChange: (e) => (e ? void 0 : o(null)),
            items: a ?? [],
            onConfirm: h,
            busy: s,
          }),
          (0, L.jsx)(eu, { open: d, onOpenChange: (e) => K.getState().setEmptyDirsOpen(e) }),
          (0, L.jsx)(nu, { open: u, onOpenChange: (e) => K.getState().setHelpOpen(e) }),
          (0, L.jsx)(js, {
            open: r,
            onOpenChange: i,
            children: (0, L.jsxs)(Ps, {
              className: `max-w-md`,
              children: [
                (0, L.jsx)(Fs, {
                  children: (0, L.jsx)(Ls, { children: e(`photoTriage.addFolderHeader`) }),
                }),
                (0, L.jsxs)(`div`, {
                  className: `space-y-3 py-2`,
                  children: [
                    (0, L.jsx)(`p`, {
                      className: `text-muted-foreground text-sm`,
                      children: e(`photoTriage.addFolderSub`),
                    }),
                    (0, L.jsxs)(G, {
                      variant: `outline`,
                      className: `w-full justify-start`,
                      onClick: p,
                      children: [`📂 `, e(`photoTriage.pickExistingBtn`)],
                    }),
                  ],
                }),
                (0, L.jsx)(Is, {
                  children: (0, L.jsx)(G, {
                    variant: `outline`,
                    onClick: () => i(!1),
                    children: e(`common.close`),
                  }),
                }),
              ],
            }),
          }),
        ],
      })
}
var cu = document.getElementById(`root`)
cu &&
  (0, g.createRoot)(cu).render(
    (0, L.jsxs)(_.StrictMode, {
      children: [(0, L.jsx)(su, {}), (0, L.jsx)(me, { position: `top-center` })],
    }),
  )
export { zs as i, uc as n, Bs as r, hc as t }
