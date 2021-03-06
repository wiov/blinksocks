'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DNSCache = exports.DNS_DEFAULT_EXPIRE = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

let lookup = (() => {
  var _ref = _asyncToGenerator(function* (hostname) {
    return new Promise(function (resolve, reject) {
      _dns2.default.lookup(hostname, function (err, address) {
        if (err) {
          reject(err);
        } else {
          resolve(address);
        }
      });
    });
  });

  return function lookup(_x) {
    return _ref.apply(this, arguments);
  };
})();

var _dns = require('dns');

var _dns2 = _interopRequireDefault(_dns);

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _logger = require('./logger');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

function now() {
  return Date.now();
}

const DNS_DEFAULT_EXPIRE = exports.DNS_DEFAULT_EXPIRE = 3600000;

class DNSCache {

  static init(expire) {
    if (typeof expire === 'number' && expire >= 0) {
      DNSCache.expire = expire;
    }
    DNSCache.pool = {};
  }

  static get(hostname) {
    return _asyncToGenerator(function* () {
      if (_net2.default.isIP(hostname)) {
        return hostname;
      }
      let address = null;
      if (!DNSCache.pool[hostname]) {
        address = yield lookup(hostname);
        DNSCache._put(hostname, address);
      } else {
        var _DNSCache$pool$hostna = _slicedToArray(DNSCache.pool[hostname], 2);

        const addr = _DNSCache$pool$hostna[0],
              expire = _DNSCache$pool$hostna[1];

        const _now = now();
        if (_now >= expire) {
          delete DNSCache.pool[hostname];
        }
        _logger.logger.verbose(`[dns-cache] hit: hostname=${hostname} resolved=${addr} ttl=${expire - _now}ms`);
        address = addr;
      }
      return address;
    })();
  }

  static clear() {
    DNSCache.pool = {};
  }

  static _put(hostname, address) {
    if (DNSCache.expire > 0) {
      const expire = now() + DNSCache.expire;
      DNSCache.pool[hostname] = [address, expire];
    }
  }

}
exports.DNSCache = DNSCache;
DNSCache.pool = {};
DNSCache.expire = DNS_DEFAULT_EXPIRE;