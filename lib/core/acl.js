'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ACL = exports.ACL_RESUME_SEND = exports.ACL_RESUME_RECV = exports.ACL_PAUSE_SEND = exports.ACL_PAUSE_RECV = exports.ACL_CLOSE_CONNECTION = undefined;

var _slicedToArray = function () { function sliceIterator(arr, i) { var _arr = []; var _n = true; var _d = false; var _e = undefined; try { for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) { _arr.push(_s.value); if (i && _arr.length === i) break; } } catch (err) { _d = true; _e = err; } finally { try { if (!_n && _i["return"]) _i["return"](); } finally { if (_d) throw _e; } } return _arr; } return function (arr, i) { if (Array.isArray(arr)) { return arr; } else if (Symbol.iterator in Object(arr)) { return sliceIterator(arr, i); } else { throw new TypeError("Invalid attempt to destructure non-iterable instance"); } }; }();

var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _net = require('net');

var _net2 = _interopRequireDefault(_net);

var _events = require('events');

var _events2 = _interopRequireDefault(_events);

var _readline = require('readline');

var _readline2 = _interopRequireDefault(_readline);

var _ip = require('ip');

var _ip2 = _interopRequireDefault(_ip);

var _constants = require('../constants');

var _utils = require('../utils');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _asyncToGenerator(fn) { return function () { var gen = fn.apply(this, arguments); return new Promise(function (resolve, reject) { function step(key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { return Promise.resolve(value).then(function (value) { step("next", value); }, function (err) { step("throw", err); }); } } return step("next"); }); }; }

const ACL_CLOSE_CONNECTION = exports.ACL_CLOSE_CONNECTION = 'acl_close_connection';
const ACL_PAUSE_RECV = exports.ACL_PAUSE_RECV = 'acl_pause_recv';
const ACL_PAUSE_SEND = exports.ACL_PAUSE_SEND = 'acl_pause_send';
const ACL_RESUME_RECV = exports.ACL_RESUME_RECV = 'acl_resume_recv';
const ACL_RESUME_SEND = exports.ACL_RESUME_SEND = 'acl_resume_send';

function ruleIsMatch(host, port) {
  const rHost = this.host,
        rPort = this.port;

  const slashIndex = rHost.indexOf('/');

  let isHostMatch = false;
  if (slashIndex !== -1 && _net2.default.isIP(host)) {
    isHostMatch = _ip2.default.cidrSubnet(rHost).contains(host);
  } else {
    isHostMatch = rHost === host;
  }

  if (rHost === '*' || isHostMatch) {
    if (rPort === '*' || port === rPort) {
      return true;
    }
  }
  return false;
}

function ruleToString() {
  return `${this.host}:${this.port} ${this.isBan ? 1 : 0} ${this.upLimit} ${this.dlLimit}`;
}

function parseHost(host) {
  const slashIndex = host.indexOf('/');
  if (slashIndex < 0) {
    if (host !== '*' && !_net2.default.isIP(host) && !(0, _utils.isValidHostname)(host)) {
      return null;
    }
    return host;
  }
  if (slashIndex < 7) {
    return null;
  }
  const parts = host.split('/');
  const ip = parts[0];
  const mask = parts[parts.length - 1];
  if (!_net2.default.isIP(ip)) {
    return null;
  }
  if (mask === '' || !Number.isInteger(+mask) || +mask < 0 || +mask > 32) {
    return null;
  }
  return host;
}

function parseSpeed(speed) {
  const regex = /^(\d+)(b|k|kb|m|mb|g|gb)$/g;
  const results = regex.exec(speed.toLowerCase());
  if (results !== null) {
    var _results = _slicedToArray(results, 3);

    const num = _results[1],
          unit = _results[2];

    return +num * {
      'b': 1,
      'k': 1024,
      'kb': 1024,
      'm': 1048576,
      'mb': 1048576,
      'g': 1073741824,
      'gb': 1073741824
    }[unit];
  }
  return null;
}

function parseLine(line) {
  if (line.length > 300) {
    return null;
  }
  line = line.trim();
  if (line.length < 1) {
    return null;
  }
  if (line[0] === '#') {
    return null;
  }
  if (line.indexOf('#') > 0) {
    line = line.substr(0, line.indexOf('#'));
  }

  var _line$split$filter = line.split(' ').filter(p => p.length > 0),
      _line$split$filter2 = _slicedToArray(_line$split$filter, 4);

  const addr = _line$split$filter2[0],
        ban = _line$split$filter2[1],
        up = _line$split$filter2[2],
        dl = _line$split$filter2[3];


  let _host = null;
  let _port = null;
  let _isBan = false;
  let _upLimit = '-';
  let _dlLimit = '-';

  if (addr.indexOf(':') > 0) {
    const parts = addr.split(':');
    const host = parts[0];
    const port = parts[parts.length - 1];
    _host = parseHost(host);
    if (port !== '*') {
      if (!(0, _utils.isValidPort)(+port)) {
        return null;
      }
      _port = +port;
    } else {
      _port = port;
    }
  } else {
    _host = parseHost(addr);
    _port = '*';
  }

  if (_host === null) {
    return null;
  }

  if (ban !== undefined) {
    if (ban !== '0' && ban !== '1') {
      return null;
    }
    _isBan = ban !== '0';
  }

  if (up !== undefined && up !== '-') {
    _upLimit = parseSpeed(up);
    if (!_upLimit) {
      return null;
    }
  }

  if (dl !== undefined && dl !== '-') {
    _dlLimit = parseSpeed(dl);
    if (!_dlLimit) {
      return null;
    }
  }

  return {
    host: _host,
    port: _port,
    isBan: _isBan,
    upLimit: _upLimit,
    dlLimit: _dlLimit,
    isMatch: ruleIsMatch,
    toString: ruleToString
  };
}

const DEFAULT_MAX_TRIES = 2;

class ACL extends _events2.default {

  static loadRules(aclPath) {
    return _asyncToGenerator(function* () {
      return new Promise(function (resolve, reject) {
        _utils.logger.verbose('[acl] loading access control list');
        const rs = _fs2.default.createReadStream(aclPath, { encoding: 'utf-8' });
        rs.on('error', function (err) {
          _utils.logger.warn(`[acl] fail to reload access control list: ${err.message}`);
          reject(err);
        });
        const rl = _readline2.default.createInterface({ input: rs });
        const _rules = [];
        rl.on('line', function (line) {
          const rule = parseLine(line);
          if (rule !== null) {
            _rules.push(rule);
          }
        });
        rl.on('close', function () {
          const rules = _rules.reverse();
          _utils.logger.info(`[acl] ${rules.length} rules loaded`);
          resolve(rules);
        });
      });
    })();
  }

  constructor({ remoteInfo, rules, max_tries = DEFAULT_MAX_TRIES }) {
    super();
    this._rules = [];
    this._cachedRules = {};
    this._maxTries = 0;
    this._hrTimeBegin = process.hrtime();
    this._sourceHost = null;
    this._sourcePort = null;
    this._targetHost = null;
    this._targetPort = null;
    this._totalOut = 0;
    this._totalIn = 0;
    this._isDlPaused = false;
    this._isUpPaused = false;
    this._sourceHost = remoteInfo.host;
    this._sourcePort = remoteInfo.port;
    this._rules = rules;
    this._maxTries = max_tries;
  }

  findRule(host, port) {
    const cacheKey = `${host}:${port}`;
    const cacheRule = this._cachedRules[cacheKey];
    if (cacheRule !== undefined) {
      return cacheRule;
    } else {
      var _iteratorNormalCompletion = true;
      var _didIteratorError = false;
      var _iteratorError = undefined;

      try {
        for (var _iterator = this._rules[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
          const rule = _step.value;

          if (rule.isMatch(host, port)) {
            return this._cachedRules[cacheKey] = rule;
          }
        }
      } catch (err) {
        _didIteratorError = true;
        _iteratorError = err;
      } finally {
        try {
          if (!_iteratorNormalCompletion && _iterator.return) {
            _iterator.return();
          }
        } finally {
          if (_didIteratorError) {
            throw _iteratorError;
          }
        }
      }

      return this._cachedRules[cacheKey] = null;
    }
  }

  applyRule(rule) {
    const isBan = rule.isBan,
          upLimit = rule.upLimit,
          dlLimit = rule.dlLimit;

    _utils.logger.debug(`[acl] [${this._sourceHost}:${this._sourcePort}] apply rule: "${rule}"`);

    if (isBan) {
      _utils.logger.info(`[acl] baned by rule: "${rule}"`);
      this.emit('action', { type: ACL_CLOSE_CONNECTION });
      return true;
    }

    if (upLimit !== '-') {
      var _process$hrtime = process.hrtime(this._hrTimeBegin),
          _process$hrtime2 = _slicedToArray(_process$hrtime, 2);

      const sec = _process$hrtime2[0],
            nano = _process$hrtime2[1];

      const speed = Math.ceil(this._totalIn / (sec + nano / 1e9));

      _utils.logger.debug(`[acl] upload speed: ${speed}b/s`);

      if (speed > upLimit && !this._isUpPaused) {
        this._isUpPaused = true;

        const timeout = speed / upLimit * 1.1;
        const direction = `[${this._sourceHost}:${this._sourcePort}] -> [${this._targetHost}:${this._targetPort}]`;
        _utils.logger.info(`[acl] ${direction} upload speed exceed: ${speed}b/s > ${upLimit}b/s, pause for ${timeout}s...`);

        this.emit('action', { type: ACL_PAUSE_RECV });
        setTimeout(() => {
          this.emit('action', { type: ACL_RESUME_RECV });
          this._isUpPaused = false;
        }, timeout * 1e3);
        return true;
      }
    }

    if (dlLimit !== '-') {
      var _process$hrtime3 = process.hrtime(this._hrTimeBegin),
          _process$hrtime4 = _slicedToArray(_process$hrtime3, 2);

      const sec = _process$hrtime4[0],
            nano = _process$hrtime4[1];

      const speed = Math.ceil(this._totalOut / (sec + nano / 1e9));

      _utils.logger.debug(`[acl] download speed: ${speed}b/s`);

      if (speed > dlLimit && !this._isDlPaused) {
        this._isDlPaused = true;

        const timeout = speed / dlLimit * 1.1;
        const direction = `[${this._sourceHost}:${this._sourcePort}] <- [${this._targetHost}:${this._targetPort}]`;
        _utils.logger.info(`[acl] ${direction} download speed exceed: ${speed}b/s > ${dlLimit}b/s, pause for ${timeout}s...`);

        this.emit('action', { type: ACL_PAUSE_SEND });
        setTimeout(() => {
          this.emit('action', { type: ACL_RESUME_SEND });
          this._isDlPaused = false;
        }, timeout * 1e3);
        return true;
      }
    }

    return false;
  }

  checkRule(host, port) {
    const rule = this.findRule(host, port);
    if (rule !== null) {
      return this.applyRule(rule, host, port);
    }
    return false;
  }

  setTargetAddress(host, port) {
    this._targetHost = host;
    this._targetPort = port;
    return this.checkRule(host, port);
  }

  checkFailTimes(tries) {
    const host = this._sourceHost;
    const maxTries = this._maxTries;
    if (tries[host] === undefined) {
      tries[host] = 0;
    }
    if (++tries[host] >= maxTries) {
      _utils.logger.warn(`[acl] [${host}] max tries=${maxTries} exceed, ban it`);
      if (this.findRule(host, '*') === null) {
        this._rules.push(parseLine(`${host}:* 1`));
      }
      this.emit('action', { type: ACL_CLOSE_CONNECTION });
      return true;
    }
  }

  collect(type, size) {
    if (type === _constants.PIPE_ENCODE) {
      this._totalOut += size;
    } else {
      this._totalIn += size;
    }
    this.checkRule(this._sourceHost, this._sourcePort);
    this.checkRule(this._targetHost, this._targetPort);
  }

  destroy() {
    this._rules = null;
    this._cachedRules = null;
  }

}
exports.ACL = ACL;